# Requirement Mapping

## Job Description Alignment

| Requirement | Implementation |
| --- | --- |
| Node.js backend experience | TypeScript Node.js service with Express APIs |
| Fintech/payment exposure | Payment lifecycle, gateway simulation, idempotency, retries, webhooks |
| REST APIs | `/v1/payments`, `/v1/webhooks/gateway`, `/health`, `/openapi.json` |
| Secure coding/data handling | integer minor units, schema validation, redacted logging, no secrets committed |
| JWT/OAuth basics | OpenAPI documents BearerAuth as production consideration; auth is not enforced in MVP |
| Database working knowledge | repository layer models uniqueness, attempt records, webhook event records, locks, and versioning |
| Debugging/observability | structured lifecycle logs and event inspection endpoint |
| Git workflows | repo-safe scripts and no generated secrets |
| Scalability awareness | documented queue, worker, locks, circuit breaker, rate limiting, and cloud notes |

## Assignment Requirements

| Requirement | Implementation |
| --- | --- |
| Payment lifecycle | `Pending`, `Processing`, `Success`, `Failed` states |
| Payment initiation | `POST /v1/payments` |
| Processing | automatic scheduler in runtime and manual `/process` endpoint |
| Status tracking | `GET /v1/payments/:paymentId` |
| Failure handling | failed and timeout gateway results handled consistently |
| Retry logic | configurable max attempts and exponential backoff |
| Idempotency | required `Idempotency-Key` and unique repository index |
| Concurrency control | per-payment async lock and `Processing` guard |
| Gateway simulation | random success/failure/delay/timeout provider |
| Webhook handling | early, duplicate, missing, and conflicting callbacks handled |
| Data consistency | state transition guard, terminal conflict handling, attempt/event records |
| Error handling | validation errors, not found, conflict, and internal error middleware |
| Logging | lifecycle, retries, gateway results, webhooks, and failures |
| Testing | unit and integration tests for lifecycle, retries, idempotency, concurrency, and webhooks |
| API docs | `docs/API.md` and `/openapi.json` |

## Optional Bonus Coverage

| Bonus | Status |
| --- | --- |
| Queue-based retry handling | Simulated with timer scheduler; durable queue documented as production improvement |
| Circuit breaker | Documented as future production improvement |
| Rate limiting | Documented as future production improvement |
| API documentation | Implemented through docs and OpenAPI JSON endpoint |
