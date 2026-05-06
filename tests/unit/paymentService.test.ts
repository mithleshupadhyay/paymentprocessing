import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GATEWAY_OUTCOME, PAYMENT_STATUS } from "../../src/paymentprocessing/domain/payments";
import { createTestRuntime } from "../../src/paymentprocessing/main";
import { DeterministicGateway } from "../helpers/deterministicGateway";

function validPaymentInput(idempotencyKey = "idem_test_123456") {
  return {
    idempotencyKey,
    amountMinor: 125000,
    currency: "inr",
    customerId: "cust_001",
    referenceId: "order_001",
    description: "Test order payment",
    metadata: {
      channel: "api",
    },
  };
}

describe("PaymentService", () => {
  it("runs the core payment lifecycle to Success", async () => {
    const gateway = new DeterministicGateway([{ outcome: GATEWAY_OUTCOME.Success }]);
    const runtime = createTestRuntime({ gateway });

    const initiated = await runtime.paymentService.initiatePayment(validPaymentInput());
    const processed = await runtime.paymentService.processPayment(initiated.payment.id);

    assert.equal(initiated.created, true);
    assert.equal(processed.payment.status, PAYMENT_STATUS.Success);
    assert.equal(processed.payment.currency, "INR");
    assert.equal(processed.attempt?.attemptNumber, 1);
    assert.equal(gateway.calls.length, 1);
  });

  it("reuses the existing payment for repeated idempotency keys", async () => {
    const gateway = new DeterministicGateway([{ outcome: GATEWAY_OUTCOME.Success }]);
    const runtime = createTestRuntime({ gateway });

    const first = await runtime.paymentService.initiatePayment(validPaymentInput("idem_same_key"));
    const second = await runtime.paymentService.initiatePayment(validPaymentInput("idem_same_key"));

    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(second.payment.id, first.payment.id);
    assert.equal(gateway.calls.length, 0);
  });

  it("schedules retry with exponential backoff after a gateway failure", async () => {
    const gateway = new DeterministicGateway([
      {
        outcome: GATEWAY_OUTCOME.Failed,
        errorCode: "GATEWAY_DECLINED",
        errorMessage: "Declined",
      },
      { outcome: GATEWAY_OUTCOME.Success },
    ]);
    const runtime = createTestRuntime({
      gateway,
      serviceOptions: {
        retryBaseDelayMs: 500,
        retryMaxDelayMs: 5000,
      },
    });

    const initiated = await runtime.paymentService.initiatePayment(validPaymentInput("idem_retry_key"));
    const firstAttempt = await runtime.paymentService.processPayment(initiated.payment.id);
    const secondAttempt = await runtime.paymentService.processPayment(initiated.payment.id);

    assert.equal(firstAttempt.payment.status, PAYMENT_STATUS.Pending);
    assert.equal(firstAttempt.scheduledRetry, true);
    assert.ok(firstAttempt.payment.nextRetryAt);
    assert.equal(secondAttempt.payment.status, PAYMENT_STATUS.Success);
    assert.equal(secondAttempt.attempt?.attemptNumber, 2);
    assert.equal(gateway.calls.length, 2);
  });

  it("marks payment Failed when retry attempts are exhausted", async () => {
    const gateway = new DeterministicGateway([
      {
        outcome: GATEWAY_OUTCOME.Failed,
        errorCode: "GATEWAY_DECLINED",
        errorMessage: "Declined",
      },
      {
        outcome: GATEWAY_OUTCOME.Timeout,
        errorCode: "GATEWAY_TIMEOUT",
        errorMessage: "Timed out",
      },
    ]);
    const runtime = createTestRuntime({
      gateway,
      serviceOptions: {
        maxRetryAttempts: 2,
      },
    });

    const initiated = await runtime.paymentService.initiatePayment(validPaymentInput("idem_exhaust_key"));
    await runtime.paymentService.processPayment(initiated.payment.id);
    const secondAttempt = await runtime.paymentService.processPayment(initiated.payment.id);

    assert.equal(secondAttempt.payment.status, PAYMENT_STATUS.Failed);
    assert.equal(secondAttempt.payment.failureReason, "Timed out");
    assert.equal(gateway.calls.length, 2);
  });

  it("prevents parallel processing of the same payment", async () => {
    const gateway = new DeterministicGateway([{ outcome: GATEWAY_OUTCOME.Success }], 50);
    const runtime = createTestRuntime({ gateway });
    const initiated = await runtime.paymentService.initiatePayment(validPaymentInput("idem_concurrent_key"));

    const [firstResult, secondResult] = await Promise.all([
      runtime.paymentService.processPayment(initiated.payment.id),
      runtime.paymentService.processPayment(initiated.payment.id),
    ]);
    const details = await runtime.paymentService.getPaymentDetails(initiated.payment.id);

    assert.equal(gateway.calls.length, 1);
    assert.equal(details.attempts.length, 1);
    assert.ok([firstResult.payment.status, secondResult.payment.status].includes(PAYMENT_STATUS.Success));
    assert.ok([firstResult.ignoredReason, secondResult.ignoredReason].includes("payment_already_processing"));
  });

  it("handles early, duplicate, and conflicting gateway callbacks", async () => {
    const gateway = new DeterministicGateway([{ outcome: GATEWAY_OUTCOME.Success }]);
    const runtime = createTestRuntime({ gateway });
    const initiated = await runtime.paymentService.initiatePayment(validPaymentInput("idem_webhook_key"));

    const earlyWebhook = await runtime.paymentService.handleGatewayWebhook({
      providerEventId: "evt_early_success",
      paymentId: initiated.payment.id,
      gatewayPaymentId: "gw_early_success",
      status: "success",
      rawPayload: {
        source: "simulator",
      },
    });
    const duplicateWebhook = await runtime.paymentService.handleGatewayWebhook({
      providerEventId: "evt_early_success",
      paymentId: initiated.payment.id,
      gatewayPaymentId: "gw_early_success",
      status: "success",
    });
    const conflictWebhook = await runtime.paymentService.handleGatewayWebhook({
      providerEventId: "evt_conflicting_failed",
      paymentId: initiated.payment.id,
      gatewayPaymentId: "gw_early_success",
      status: "failed",
    });
    const processResult = await runtime.paymentService.processPayment(initiated.payment.id);
    const details = await runtime.paymentService.getPaymentDetails(initiated.payment.id);

    assert.equal(earlyWebhook.accepted, true);
    assert.equal(earlyWebhook.payment?.status, PAYMENT_STATUS.Success);
    assert.equal(duplicateWebhook.accepted, false);
    assert.equal(duplicateWebhook.ignoredReason, "duplicate_callback");
    assert.equal(conflictWebhook.accepted, false);
    assert.equal(conflictWebhook.ignoredReason, "terminal_state_conflict");
    assert.equal(processResult.ignoredReason, "payment_already_terminal");
    assert.equal(details.attempts.length, 0);
    assert.equal(details.webhookEvents.length, 2);
    assert.equal(gateway.calls.length, 0);
  });
});
