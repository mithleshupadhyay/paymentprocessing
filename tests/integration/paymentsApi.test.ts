import request from "supertest";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GATEWAY_OUTCOME, PAYMENT_STATUS } from "../../src/paymentprocessing/domain/payments";
import { createApp, createTestRuntime } from "../../src/paymentprocessing/main";
import { DeterministicGateway } from "../helpers/deterministicGateway";

describe("Payments API", () => {
  it("registers health and OpenAPI endpoints", async () => {
    const app = createApp(createTestRuntime());

    const rootResponse = await request(app).get("/");
    const healthResponse = await request(app).get("/health");
    const openApiResponse = await request(app).get("/openapi.json");

    assert.equal(rootResponse.status, 200);
    assert.equal(rootResponse.body.status, "ok");
    assert.equal(rootResponse.body.endpoints.initiatePayment, "POST /v1/payments");
    assert.equal(healthResponse.status, 200);
    assert.equal(healthResponse.body.status, "ok");
    assert.equal(openApiResponse.status, 200);
    assert.ok(openApiResponse.body.paths["/v1/payments"]);
    assert.equal(openApiResponse.body.components.securitySchemes.BearerAuth.scheme, "bearer");
  });

  it("initiates, reuses, processes, and tracks a payment", async () => {
    const gateway = new DeterministicGateway([{ outcome: GATEWAY_OUTCOME.Success }]);
    const runtime = createTestRuntime({ gateway });
    const app = createApp(runtime);

    const createResponse = await request(app)
      .post("/v1/payments")
      .set("Idempotency-Key", "api_idem_123456")
      .send({
        amountMinor: 29900,
        currency: "INR",
        customerId: "cust_api_001",
        referenceId: "order_api_001",
      });

    assert.equal(createResponse.status, 201);
    assert.equal(createResponse.body.created, true);
    assert.equal(createResponse.body.payment.status, PAYMENT_STATUS.Pending);

    const duplicateResponse = await request(app)
      .post("/v1/payments")
      .set("Idempotency-Key", "api_idem_123456")
      .send({
        amountMinor: 29900,
        currency: "INR",
        customerId: "cust_api_001",
        referenceId: "order_api_001",
      });

    assert.equal(duplicateResponse.status, 200);
    assert.equal(duplicateResponse.body.idempotencyReused, true);
    assert.equal(duplicateResponse.body.payment.id, createResponse.body.payment.id);

    const processResponse = await request(app).post(
      `/v1/payments/${createResponse.body.payment.id}/process`,
    );
    const statusResponse = await request(app).get(`/v1/payments/${createResponse.body.payment.id}`);
    const eventsResponse = await request(app).get(`/v1/payments/${createResponse.body.payment.id}/events`);

    assert.equal(processResponse.status, 202);
    assert.equal(processResponse.body.payment.status, PAYMENT_STATUS.Success);
    assert.equal(statusResponse.body.status, PAYMENT_STATUS.Success);
    assert.equal(eventsResponse.body.attempts.length, 1);
  });

  it("rejects invalid payment input without leaking internals", async () => {
    const app = createApp(createTestRuntime());

    const response = await request(app)
      .post("/v1/payments")
      .set("Idempotency-Key", "api_invalid_123456")
      .send({
        amountMinor: 19.99,
        currency: "INR",
      });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "VALIDATION_ERROR");
    assert.equal(response.body.error.message, "Request validation failed.");
  });

  it("applies gateway webhooks through the API", async () => {
    const runtime = createTestRuntime();
    const app = createApp(runtime);

    const createResponse = await request(app)
      .post("/v1/payments")
      .set("Idempotency-Key", "api_webhook_123456")
      .send({
        amountMinor: 50000,
        currency: "USD",
      });

    const webhookResponse = await request(app).post("/v1/webhooks/gateway").send({
      providerEventId: "evt_api_success",
      paymentId: createResponse.body.payment.id,
      gatewayPaymentId: "gw_api_success",
      status: "success",
      rawPayload: {
        source: "integration_test",
      },
    });

    assert.equal(webhookResponse.status, 200);
    assert.equal(webhookResponse.body.accepted, true);
    assert.equal(webhookResponse.body.payment.status, PAYMENT_STATUS.Success);
  });
});
