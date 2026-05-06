# Low-Level Design

## Payment States

Supported payment states:

- `Pending`
- `Processing`
- `Success`
- `Failed`

Allowed transitions:

```text
Pending -> Processing
Pending -> Success
Pending -> Failed
Processing -> Pending
Processing -> Success
Processing -> Failed
```

Terminal states:

```text
Success
Failed
```

Terminal states are not overwritten by later callbacks or gateway results.

```mermaid
stateDiagram-v2
    [*] --> Pending: payment initiated
    Pending --> Processing: processing starts
    Pending --> Success: early success webhook
    Pending --> Failed: early failed webhook
    Processing --> Success: gateway success
    Processing --> Failed: attempts exhausted or failed webhook
    Processing --> Pending: retry scheduled
    Success --> Success: duplicate/same terminal callback ignored
    Failed --> Failed: duplicate/same terminal callback ignored
```

## Idempotency

`POST /v1/payments` requires an `Idempotency-Key` header.

The repository keeps a unique idempotency-key index. If the same key is reused, the existing payment is returned with `idempotencyReused: true`.

```mermaid
sequenceDiagram
    participant Client
    participant API
    participant Service
    participant Repo

    Client->>API: POST /v1/payments + Idempotency-Key
    API->>Service: initiatePayment()
    Service->>Repo: createPayment(idempotencyKey)

    alt Key does not exist
        Repo-->>Service: create Pending payment
        Service-->>API: created=true
        API-->>Client: 201 Created
    else Key already exists
        Repo-->>Service: return existing payment
        Service-->>API: created=false
        API-->>Client: 200 OK, idempotencyReused=true
    end
```

In a SQL implementation, this maps to:

```sql
CREATE UNIQUE INDEX payments_idempotency_key_uq ON payments (idempotency_key);
```

## Concurrency Control

The service uses a per-payment async lock and the `Processing` state to prevent parallel processing of the same payment.

Processing flow:

1. Acquire payment lock.
2. Reject terminal payments.
3. Reject active `Processing` payments unless the processing window expired.
4. Move `Pending` to `Processing`.
5. Create a payment attempt.
6. Release lock while the gateway call runs.
7. Re-acquire lock and apply the result defensively.

In PostgreSQL, this maps to `SELECT ... FOR UPDATE` around the payment row.

```mermaid
sequenceDiagram
    participant WorkerA
    participant WorkerB
    participant Service
    participant Repo

    WorkerA->>Service: processPayment(paymentId)
    Service->>Repo: acquire payment lock
    Service->>Repo: Pending -> Processing
    WorkerB->>Service: processPayment(paymentId)
    Service->>Repo: lock waits, then reads Processing
    Repo-->>Service: active processing not expired
    Service-->>WorkerB: ignoredReason=payment_already_processing
    Service->>Repo: create one attempt only
    Service-->>WorkerA: processing continues
```

## Retry Logic

Retries use bounded exponential backoff:

```text
delay = min(base_delay_ms * 2^(attempt_number - 1), max_delay_ms)
```

When the gateway fails or times out:

- If attempts remain, the payment returns to `Pending` with `nextRetryAt`.
- If attempts are exhausted, the payment moves to `Failed`.

```mermaid
flowchart TD
    Start["Attempt starts"] --> Gateway["Call simulated gateway"]
    Gateway --> Success{"Gateway success?"}
    Success -- Yes --> MarkSuccess["Update attempt Success<br/>Payment -> Success"]
    Success -- No --> Attempts{"Attempts remaining?"}
    Attempts -- Yes --> Backoff["Calculate exponential backoff<br/>set nextRetryAt"]
    Backoff --> Pending["Payment -> Pending"]
    Pending --> Scheduler["TimerRetryScheduler schedules retry"]
    Scheduler --> Start
    Attempts -- No --> MarkFailed["Update attempt Failed/Timeout<br/>Payment -> Failed"]
```

## Gateway Simulation

`SimulatedPaymentGateway` introduces:

- random success
- random failure
- random latency
- timeout when latency exceeds configured request timeout
- random timeout outcome

No real payment provider is called.

## Webhook Handling

Webhook events are deduplicated by `providerEventId`.

Rules:

- Missing payment: record event and ignore.
- Duplicate callback: return the original event and ignore.
- Non-terminal payment: apply `success` or `failed`.
- Terminal payment with same status: ignore as already terminal.
- Terminal payment with different status: record conflict and ignore.

```mermaid
flowchart TD
    Webhook["Webhook received"] --> Dedupe{"providerEventId already seen?"}
    Dedupe -- Yes --> Duplicate["Return accepted=false<br/>duplicate_callback"]
    Dedupe -- No --> Exists{"Payment exists?"}
    Exists -- No --> Missing["Record ignored event<br/>payment_not_found"]
    Exists -- Yes --> Terminal{"Payment terminal?"}
    Terminal -- No --> Apply["Apply Success or Failed<br/>mark event accepted"]
    Terminal -- Yes --> Same{"Same terminal status?"}
    Same -- Yes --> SameIgnored["Record ignored event<br/>already_terminal_same_status"]
    Same -- No --> Conflict["Record ignored event<br/>terminal_state_conflict"]
```

## Data Consistency

The in-memory repository models the production invariants expected from a database:

- unique idempotency keys
- unique webhook provider event ids
- append-only attempt records
- append-only webhook event records
- payment-level lock around state changes
- version increments on payment updates

For a production version, this should be implemented with PostgreSQL transactions, row-level locks, unique constraints, and a durable worker queue.

```mermaid
erDiagram
    PAYMENT ||--o{ PAYMENT_ATTEMPT : has
    PAYMENT ||--o{ WEBHOOK_EVENT : receives

    PAYMENT {
        string id PK
        string idempotencyKey UK
        int amountMinor
        string currency
        string status
        int attemptCount
        int maxAttempts
        string gatewayPaymentId
        string nextRetryAt
        int version
    }

    PAYMENT_ATTEMPT {
        string id PK
        string paymentId FK
        int attemptNumber
        string status
        string gatewayPaymentId
        string providerEventId
        string errorCode
        int latencyMs
    }

    WEBHOOK_EVENT {
        string id PK
        string providerEventId UK
        string paymentId FK
        string gatewayPaymentId
        string status
        boolean accepted
        string ignoredReason
    }
```
