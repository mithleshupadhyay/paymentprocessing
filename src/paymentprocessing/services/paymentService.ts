import type { Payment, PaymentAttempt, PaymentDetails, WebhookEvent, Metadata } from "../db/models/payments";
import type { PaymentRepository } from "../db/repositories/paymentRepository";
import {
  ATTEMPT_STATUS,
  GATEWAY_OUTCOME,
  PAYMENT_STATUS,
  canMovePaymentStatus,
  getBackoffDelayMs,
  isTerminalPaymentStatus,
  normalizeCurrency,
  type PaymentStatus,
} from "../domain/payments";
import { conflict, notFound } from "../exceptions";
import type { GatewayChargeResult, PaymentGateway } from "../gateway/simulator";
import { getLogger } from "../logging";
import { createAttemptId, createPaymentId, createProviderEventId, hashForLog } from "../utils/ids";
import type { RetryScheduler } from "./retryScheduler";

const logger = getLogger("paymentprocessing.services.paymentService");

export interface PaymentServiceOptions {
  maxRetryAttempts: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
  processingTimeoutMs: number;
  autoProcessOnCreate: boolean;
}

export interface InitiatePaymentInput {
  idempotencyKey: string;
  amountMinor: number;
  currency: string;
  customerId?: string;
  referenceId?: string;
  description?: string;
  metadata?: Metadata;
}

export interface InitiatePaymentResult {
  payment: Payment;
  created: boolean;
}

export interface ProcessPaymentResult {
  payment: Payment;
  attempt?: PaymentAttempt;
  scheduledRetry: boolean;
  ignoredReason?: string;
}

export interface GatewayWebhookInput {
  providerEventId: string;
  paymentId: string;
  gatewayPaymentId?: string;
  status: "success" | "failed";
  rawPayload?: Metadata;
}

export interface GatewayWebhookResult {
  payment?: Payment;
  event: WebhookEvent;
  accepted: boolean;
  ignoredReason?: string;
}

interface StartedAttempt {
  payment: Payment;
  attempt: PaymentAttempt;
}

export class PaymentService {
  constructor(
    private readonly repository: PaymentRepository,
    private readonly gateway: PaymentGateway,
    private readonly retryScheduler: RetryScheduler,
    private readonly options: PaymentServiceOptions,
  ) {}

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    const result = await this.repository.createPayment({
      id: createPaymentId(),
      idempotencyKey: input.idempotencyKey,
      amountMinor: input.amountMinor,
      currency: normalizeCurrency(input.currency),
      customerId: input.customerId,
      referenceId: input.referenceId,
      description: input.description,
      maxAttempts: this.options.maxRetryAttempts,
      metadata: input.metadata,
    });

    if (result.created) {
      logger.info("Payment initiated", {
        paymentId: result.payment.id,
        amountMinor: result.payment.amountMinor,
        currency: result.payment.currency,
        idempotencyKeyHash: hashForLog(result.payment.idempotencyKey),
      });

      if (this.options.autoProcessOnCreate) {
        this.retryScheduler.schedulePaymentProcessing(result.payment.id, 0, "initial_payment");
      }
    } else {
      logger.info("Idempotent payment initiation reused existing payment", {
        paymentId: result.payment.id,
        idempotencyKeyHash: hashForLog(input.idempotencyKey),
      });
    }

    return result;
  }

  async getPayment(paymentId: string): Promise<Payment> {
    const payment = await this.repository.getPaymentById(paymentId);
    if (!payment) {
      throw notFound("Payment not found.");
    }
    return payment;
  }

  async getPaymentDetails(paymentId: string): Promise<PaymentDetails> {
    const details = await this.repository.getPaymentDetails(paymentId);
    if (!details) {
      throw notFound("Payment not found.");
    }
    return details;
  }

  async processPayment(paymentId: string, reason = "manual"): Promise<ProcessPaymentResult> {
    const startedAttempt = await this.startAttempt(paymentId, reason);
    if (!startedAttempt.attempt) {
      return {
        payment: startedAttempt.payment,
        scheduledRetry: false,
        ignoredReason: startedAttempt.ignoredReason,
      };
    }

    let gatewayResult: GatewayChargeResult;
    try {
      gatewayResult = await this.gateway.charge({
        payment: startedAttempt.payment,
        attempt: startedAttempt.attempt,
      });
    } catch (error) {
      gatewayResult = {
        outcome: GATEWAY_OUTCOME.Failed,
        gatewayPaymentId: startedAttempt.payment.gatewayPaymentId || "",
        providerEventId: createProviderEventId(),
        latencyMs: 0,
        errorCode: "GATEWAY_EXCEPTION",
        errorMessage: error instanceof Error ? error.message : "Gateway execution failed.",
      };
    }

    return this.completeAttempt(paymentId, startedAttempt.attempt, gatewayResult);
  }

  async handleGatewayWebhook(input: GatewayWebhookInput): Promise<GatewayWebhookResult> {
    return this.repository.withPaymentLock(input.paymentId, async () => {
      const payment = await this.repository.getPaymentById(input.paymentId);
      const createEventResult = await this.repository.createWebhookEvent({
        id: createProviderEventId(),
        providerEventId: input.providerEventId,
        paymentId: input.paymentId,
        gatewayPaymentId: input.gatewayPaymentId,
        status: input.status,
        accepted: false,
        receivedAt: new Date().toISOString(),
        rawPayload: input.rawPayload || {},
      });

      if (!createEventResult.created) {
        logger.info("Duplicate gateway webhook ignored", {
          paymentId: input.paymentId,
          providerEventId: input.providerEventId,
        });
        return {
          payment: payment || undefined,
          event: createEventResult.event,
          accepted: false,
          ignoredReason: "duplicate_callback",
        };
      }

      if (!payment) {
        const event = await this.repository.updateWebhookEvent(input.providerEventId, {
          ignoredReason: "payment_not_found",
          processedAt: new Date().toISOString(),
        });
        logger.warn("Gateway webhook ignored because payment was missing", {
          paymentId: input.paymentId,
          providerEventId: input.providerEventId,
        });
        return {
          event,
          accepted: false,
          ignoredReason: "payment_not_found",
        };
      }

      const targetStatus = input.status === "success" ? PAYMENT_STATUS.Success : PAYMENT_STATUS.Failed;
      if (isTerminalPaymentStatus(payment.status)) {
        const ignoredReason =
          payment.status === targetStatus ? "already_terminal_same_status" : "terminal_state_conflict";
        const event = await this.repository.updateWebhookEvent(input.providerEventId, {
          ignoredReason,
          processedAt: new Date().toISOString(),
        });
        logger.warn("Gateway webhook ignored for terminal payment", {
          paymentId: payment.id,
          providerEventId: input.providerEventId,
          currentStatus: payment.status,
          requestedStatus: targetStatus,
          ignoredReason,
        });
        return {
          payment,
          event,
          accepted: false,
          ignoredReason,
        };
      }

      const updatedPayment = await this.movePaymentStatus(payment.id, payment.status, targetStatus, {
        gatewayPaymentId: input.gatewayPaymentId || payment.gatewayPaymentId,
        failureReason: targetStatus === PAYMENT_STATUS.Failed ? "Gateway webhook marked payment failed." : undefined,
        nextRetryAt: undefined,
        processingStartedAt: undefined,
        processingExpiresAt: undefined,
      });

      const event = await this.repository.updateWebhookEvent(input.providerEventId, {
        accepted: true,
        processedAt: new Date().toISOString(),
      });

      logger.info("Gateway webhook applied", {
        paymentId: updatedPayment.id,
        providerEventId: input.providerEventId,
        status: updatedPayment.status,
      });

      return {
        payment: updatedPayment,
        event,
        accepted: true,
      };
    });
  }

  private async startAttempt(
    paymentId: string,
    reason: string,
  ): Promise<{ payment: Payment; attempt?: PaymentAttempt; ignoredReason?: string }> {
    return this.repository.withPaymentLock(paymentId, async () => {
      const payment = await this.getPayment(paymentId);

      if (isTerminalPaymentStatus(payment.status)) {
        return { payment, ignoredReason: "payment_already_terminal" };
      }

      if (payment.status === PAYMENT_STATUS.Processing && !this.isProcessingExpired(payment)) {
        return { payment, ignoredReason: "payment_already_processing" };
      }

      if (payment.nextRetryAt && Date.parse(payment.nextRetryAt) > Date.now() && reason !== "manual") {
        return { payment, ignoredReason: "retry_not_due" };
      }

      if (payment.attemptCount >= payment.maxAttempts) {
        const failedPayment = await this.movePaymentStatus(payment.id, payment.status, PAYMENT_STATUS.Failed, {
          failureReason: "Maximum retry attempts reached before processing could start.",
          processingStartedAt: undefined,
          processingExpiresAt: undefined,
        });
        return { payment: failedPayment, ignoredReason: "max_attempts_reached" };
      }

      const now = new Date();
      const processingStartedAt = now.toISOString();
      const processingExpiresAt = new Date(now.getTime() + this.options.processingTimeoutMs).toISOString();

      const processingPayment = await this.movePaymentStatus(payment.id, payment.status, PAYMENT_STATUS.Processing, {
        nextRetryAt: undefined,
        processingStartedAt,
        processingExpiresAt,
      });

      const attempt = await this.repository.createPaymentAttempt({
        id: createAttemptId(),
        paymentId: payment.id,
        attemptNumber: payment.attemptCount + 1,
        startedAt: processingStartedAt,
      });

      logger.info("Payment processing attempt started", {
        paymentId,
        attemptId: attempt.id,
        attemptNumber: attempt.attemptNumber,
        reason,
      });

      return {
        payment: {
          ...processingPayment,
          attemptCount: attempt.attemptNumber,
        },
        attempt,
      };
    });
  }

  private async completeAttempt(
    paymentId: string,
    attempt: PaymentAttempt,
    gatewayResult: GatewayChargeResult,
  ): Promise<ProcessPaymentResult> {
    return this.repository.withPaymentLock(paymentId, async () => {
      const payment = await this.getPayment(paymentId);
      const attemptStatus =
        gatewayResult.outcome === GATEWAY_OUTCOME.Success
          ? ATTEMPT_STATUS.Success
          : gatewayResult.outcome === GATEWAY_OUTCOME.Timeout
            ? ATTEMPT_STATUS.Timeout
            : ATTEMPT_STATUS.Failed;

      const completedAttempt = await this.repository.updatePaymentAttempt(attempt.id, {
        status: attemptStatus,
        gatewayPaymentId: gatewayResult.gatewayPaymentId || undefined,
        providerEventId: gatewayResult.providerEventId,
        errorCode: gatewayResult.errorCode,
        errorMessage: gatewayResult.errorMessage,
        completedAt: new Date().toISOString(),
        latencyMs: gatewayResult.latencyMs,
      });

      if (isTerminalPaymentStatus(payment.status)) {
        logger.warn("Gateway result ignored because payment was already terminal", {
          paymentId,
          attemptId: attempt.id,
          currentStatus: payment.status,
          gatewayOutcome: gatewayResult.outcome,
        });
        return {
          payment,
          attempt: completedAttempt,
          scheduledRetry: false,
          ignoredReason: "payment_already_terminal",
        };
      }

      if (gatewayResult.outcome === GATEWAY_OUTCOME.Success) {
        const updatedPayment = await this.movePaymentStatus(payment.id, payment.status, PAYMENT_STATUS.Success, {
          gatewayPaymentId: gatewayResult.gatewayPaymentId,
          failureReason: undefined,
          nextRetryAt: undefined,
          processingStartedAt: undefined,
          processingExpiresAt: undefined,
        });

        logger.info("Payment succeeded", {
          paymentId,
          attemptId: attempt.id,
          attemptNumber: attempt.attemptNumber,
          providerEventId: gatewayResult.providerEventId,
        });

        return {
          payment: updatedPayment,
          attempt: completedAttempt,
          scheduledRetry: false,
        };
      }

      const hasAttemptsRemaining = attempt.attemptNumber < payment.maxAttempts;
      if (hasAttemptsRemaining) {
        const retryDelayMs = getBackoffDelayMs(
          attempt.attemptNumber,
          this.options.retryBaseDelayMs,
          this.options.retryMaxDelayMs,
        );
        const nextRetryAt = new Date(Date.now() + retryDelayMs).toISOString();
        const updatedPayment = await this.movePaymentStatus(payment.id, payment.status, PAYMENT_STATUS.Pending, {
          gatewayPaymentId: gatewayResult.gatewayPaymentId || payment.gatewayPaymentId,
          failureReason: gatewayResult.errorMessage || "Gateway attempt failed.",
          nextRetryAt,
          processingStartedAt: undefined,
          processingExpiresAt: undefined,
        });

        this.retryScheduler.schedulePaymentProcessing(paymentId, retryDelayMs, "gateway_retry");
        logger.warn("Payment attempt failed; retry scheduled", {
          paymentId,
          attemptId: attempt.id,
          attemptNumber: attempt.attemptNumber,
          retryDelayMs,
          nextRetryAt,
          errorCode: gatewayResult.errorCode,
        });

        return {
          payment: updatedPayment,
          attempt: completedAttempt,
          scheduledRetry: true,
        };
      }

      const updatedPayment = await this.movePaymentStatus(payment.id, payment.status, PAYMENT_STATUS.Failed, {
        gatewayPaymentId: gatewayResult.gatewayPaymentId || payment.gatewayPaymentId,
        failureReason: gatewayResult.errorMessage || "Gateway attempts exhausted.",
        nextRetryAt: undefined,
        processingStartedAt: undefined,
        processingExpiresAt: undefined,
      });

      logger.error("Payment failed after retry attempts were exhausted", {
        paymentId,
        attemptId: attempt.id,
        attemptNumber: attempt.attemptNumber,
        errorCode: gatewayResult.errorCode,
      });

      return {
        payment: updatedPayment,
        attempt: completedAttempt,
        scheduledRetry: false,
      };
    });
  }

  private async movePaymentStatus(
    paymentId: string,
    fromStatus: PaymentStatus,
    toStatus: PaymentStatus,
    patch: Omit<Parameters<PaymentRepository["updatePayment"]>[1], "status">,
  ): Promise<Payment> {
    if (!canMovePaymentStatus(fromStatus, toStatus)) {
      throw conflict("Invalid payment state transition.", {
        paymentId,
        fromStatus,
        toStatus,
      });
    }

    return this.repository.updatePayment(paymentId, {
      status: toStatus,
      ...patch,
    });
  }

  private isProcessingExpired(payment: Payment): boolean {
    if (!payment.processingExpiresAt) {
      return false;
    }

    return Date.parse(payment.processingExpiresAt) <= Date.now();
  }
}
