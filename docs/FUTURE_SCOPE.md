# Future Scope

Production improvements that are intentionally not overbuilt into this assignment:

- PostgreSQL persistence with migrations and real `payments`, `payment_attempts`, and `webhook_events` tables.
- SQL transactions, `SELECT ... FOR UPDATE`, or optimistic version checks for multi-worker concurrency.
- Redis for distributed locks, idempotency cache acceleration, and rate-limit counters.
- Kafka, RabbitMQ, SQS, or BullMQ for durable asynchronous payment processing.
- Dead-letter queue for exhausted, malformed, or repeatedly failing jobs.
- Circuit breaker and retry budget around real gateway providers.
- Rate limiting on payment initiation and webhooks, backed by Redis or an API gateway.
- JWT/OAuth authentication and role-based authorization.
- Gateway signature verification for webhook authenticity.
- Production metrics, traces, dashboards, and alerting.
- Cloud deployment with health checks, horizontal workers, autoscaling, and managed secrets.
- Provider adapters for Stripe, Razorpay, Cashfree, or other payment gateways.
