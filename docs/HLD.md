# High-Level Design

## Goal

Build a Node.js payment processing backend that behaves like a small payment gateway integration layer. It demonstrates payment lifecycle management, retry handling, idempotency, concurrency control, gateway failure handling, and webhook consistency.

## Components

- API layer: Express REST endpoints under `/v1`.
- Service layer: `PaymentService` owns lifecycle orchestration and state transitions.
- Repository layer: `InMemoryPaymentRepository` models database-style persistence, unique idempotency keys, attempt records, webhook records, and per-payment locks.
- Gateway layer: `SimulatedPaymentGateway` returns random success, failure, delay, or timeout outcomes.
- Retry scheduler: `TimerRetryScheduler` schedules retry processing with exponential backoff.
- Logging: structured JSON logs for lifecycle events, attempts, retries, webhooks, and errors.

## Component Diagram

```mermaid
flowchart TB
    subgraph ClientSide["Client Side"]
        Client["curl / Postman / API consumer"]
    end

    subgraph ApiLayer["API Layer"]
        Root["GET /"]
        Health["GET /health"]
        Payments["/v1/payments routes"]
        Webhooks["/v1/webhooks/gateway"]
        OpenApi["GET /openapi.json"]
        Errors["Error middleware"]
    end

    subgraph DomainLayer["Service and Domain Layer"]
        Service["PaymentService"]
        Rules["Payment state rules<br/>Pending, Processing, Success, Failed"]
        Scheduler["TimerRetryScheduler"]
        Gateway["SimulatedPaymentGateway"]
    end

    subgraph PersistenceLayer["Persistence Boundary"]
        Repo["InMemoryPaymentRepository"]
        Locks["Per-payment async locks"]
        Idempotency["Idempotency key index"]
        Attempts["Payment attempts"]
        Events["Webhook events"]
    end

    Client --> Root
    Client --> Health
    Client --> Payments
    Client --> Webhooks
    Client --> OpenApi
    Payments --> Service
    Webhooks --> Service
    Errors --> Client
    Service --> Rules
    Service --> Repo
    Service --> Scheduler
    Scheduler --> Service
    Service --> Gateway
    Repo --> Locks
    Repo --> Idempotency
    Repo --> Attempts
    Repo --> Events
```

## Runtime Flow

1. Client initiates a payment with an `Idempotency-Key`.
2. Repository creates a `Pending` payment or returns the existing payment for the key.
3. Runtime schedules payment processing.
4. Service moves the payment to `Processing`, creates an attempt, and calls the simulated gateway.
5. Gateway returns success, failure, or timeout.
6. Service moves the payment to `Success`, schedules retry by returning to `Pending`, or marks it `Failed`.
7. Webhooks can asynchronously update non-terminal payments and are deduplicated by provider event id.

## Runtime Sequence

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant API as Express API
    participant Service as PaymentService
    participant Repo as Repository
    participant Scheduler as RetryScheduler
    participant Gateway as SimulatedGateway

    Client->>API: POST /v1/payments
    API->>Service: initiatePayment(input)
    Service->>Repo: createPayment(idempotencyKey)

    alt New idempotency key
        Repo-->>Service: created Pending payment
        Service->>Scheduler: schedulePaymentProcessing(paymentId, 0)
        Service-->>API: created=true
        API-->>Client: 201 Created
    else Reused idempotency key
        Repo-->>Service: existing payment
        Service-->>API: created=false
        API-->>Client: 200 OK
    end

    Scheduler->>Service: processPayment(paymentId)
    Service->>Repo: acquire payment lock
    Service->>Repo: Pending -> Processing and create attempt
    Service->>Gateway: charge(payment, attempt)
    Gateway-->>Service: success / failed / timeout
    Service->>Repo: acquire payment lock again
    Service->>Repo: update attempt result

    alt Success
        Service->>Repo: Processing -> Success
    else Failed or timeout with attempts remaining
        Service->>Repo: Processing -> Pending, set nextRetryAt
        Service->>Scheduler: schedule retry with exponential backoff
    else Failed or timeout with attempts exhausted
        Service->>Repo: Processing -> Failed
    end
```

## Webhook Sequence

```mermaid
sequenceDiagram
    autonumber
    participant Gateway as Gateway Callback
    participant API as Express API
    participant Service as PaymentService
    participant Repo as Repository

    Gateway->>API: POST /v1/webhooks/gateway
    API->>Service: handleGatewayWebhook(payload)
    Service->>Repo: acquire payment lock
    Service->>Repo: create webhook event by providerEventId

    alt Duplicate providerEventId
        Repo-->>Service: existing event
        Service-->>API: accepted=false duplicate_callback
    else Payment missing
        Service->>Repo: record ignored event
        Service-->>API: accepted=false payment_not_found
    else Payment already terminal
        Service->>Repo: record same-status or conflict reason
        Service-->>API: accepted=false
    else Payment not terminal
        Service->>Repo: Pending/Processing -> Success or Failed
        Service->>Repo: mark webhook accepted
        Service-->>API: accepted=true
    end
```

## Production Notes

The assignment keeps one process and one repo. In production, the same boundaries map cleanly to PostgreSQL tables, row-level locking, background workers, a durable queue, rate limiting, circuit breakers, and cloud deployment.
