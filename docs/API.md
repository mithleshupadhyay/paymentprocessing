# API

Base URL:

```text
http://localhost:3000
```

## Health

```http
GET /health
```

Response:

```json
{
  "status": "ok",
  "service": "Payment Processing System",
  "version": "0.1.0",
  "env": "development"
}
```

## Initiate Payment

```http
POST /v1/payments
Idempotency-Key: order_1001_attempt_1
Content-Type: application/json
```

Request:

```json
{
  "amountMinor": 125000,
  "currency": "INR",
  "customerId": "cust_001",
  "referenceId": "order_1001",
  "description": "Checkout payment"
}
```

Notes:

- `amountMinor` is an integer minor-unit amount such as paise/cents.
- Reusing the same `Idempotency-Key` returns the same payment instead of creating a duplicate.
- The default runtime schedules processing automatically after creation.

## Get Payment Status

```http
GET /v1/payments/pay_abc123...
```

Returns the current state: `Pending`, `Processing`, `Success`, or `Failed`.

## Get Payment Events

```http
GET /v1/payments/pay_abc123.../events
```

Returns the payment, gateway attempts, and webhook events for traceability.

## Process Payment Manually

```http
POST /v1/payments/pay_abc123.../process
```

This endpoint is useful for testing and demo flows. In production this would usually be handled by a worker.

## Gateway Webhook

```http
POST /v1/webhooks/gateway
Content-Type: application/json
```

Request:

```json
{
  "providerEventId": "evt_gateway_1001",
  "paymentId": "pay_abc123...",
  "gatewayPaymentId": "gw_pay_1001",
  "status": "success",
  "rawPayload": {
    "source": "simulator"
  }
}
```

Webhook behavior:

- Duplicate `providerEventId` values are ignored.
- Early callbacks can move a non-terminal payment to `Success` or `Failed`.
- Conflicting callbacks after a terminal state are recorded and ignored.

## OpenAPI

```http
GET /openapi.json
```

The OpenAPI output documents the assignment endpoints and includes a JWT bearer scheme for production-readiness discussion. Authentication is not enforced in this MVP.
