import type { Payment, PaymentAttempt, PaymentDetails, WebhookEvent } from "../db/models/payments";
import type { GatewayWebhookResult, InitiatePaymentResult, ProcessPaymentResult } from "../services/paymentService";

export interface PaymentResponse {
  id: string;
  amountMinor: number;
  currency: string;
  customerId?: string;
  referenceId?: string;
  description?: string;
  status: Payment["status"];
  attemptCount: number;
  maxAttempts: number;
  gatewayPaymentId?: string;
  failureReason?: string;
  nextRetryAt?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  metadata: Payment["metadata"];
}

export interface PaymentAttemptResponse {
  id: string;
  paymentId: string;
  attemptNumber: number;
  status: PaymentAttempt["status"];
  gatewayPaymentId?: string;
  providerEventId?: string;
  errorCode?: string;
  errorMessage?: string;
  startedAt: string;
  completedAt?: string;
  latencyMs?: number;
}

export interface WebhookEventResponse {
  id: string;
  providerEventId: string;
  paymentId: string;
  gatewayPaymentId?: string;
  status: WebhookEvent["status"];
  accepted: boolean;
  ignoredReason?: string;
  receivedAt: string;
  processedAt?: string;
}

export function toPaymentResponse(payment: Payment): PaymentResponse {
  return {
    id: payment.id,
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    customerId: payment.customerId,
    referenceId: payment.referenceId,
    description: payment.description,
    status: payment.status,
    attemptCount: payment.attemptCount,
    maxAttempts: payment.maxAttempts,
    gatewayPaymentId: payment.gatewayPaymentId,
    failureReason: payment.failureReason,
    nextRetryAt: payment.nextRetryAt,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
    version: payment.version,
    metadata: payment.metadata,
  };
}

export function toPaymentAttemptResponse(attempt: PaymentAttempt): PaymentAttemptResponse {
  return {
    id: attempt.id,
    paymentId: attempt.paymentId,
    attemptNumber: attempt.attemptNumber,
    status: attempt.status,
    gatewayPaymentId: attempt.gatewayPaymentId,
    providerEventId: attempt.providerEventId,
    errorCode: attempt.errorCode,
    errorMessage: attempt.errorMessage,
    startedAt: attempt.startedAt,
    completedAt: attempt.completedAt,
    latencyMs: attempt.latencyMs,
  };
}

export function toWebhookEventResponse(event: WebhookEvent): WebhookEventResponse {
  return {
    id: event.id,
    providerEventId: event.providerEventId,
    paymentId: event.paymentId,
    gatewayPaymentId: event.gatewayPaymentId,
    status: event.status,
    accepted: event.accepted,
    ignoredReason: event.ignoredReason,
    receivedAt: event.receivedAt,
    processedAt: event.processedAt,
  };
}

export function toInitiatePaymentResponse(result: InitiatePaymentResult) {
  return {
    created: result.created,
    idempotencyReused: !result.created,
    payment: toPaymentResponse(result.payment),
  };
}

export function toProcessPaymentResponse(result: ProcessPaymentResult) {
  return {
    payment: toPaymentResponse(result.payment),
    attempt: result.attempt ? toPaymentAttemptResponse(result.attempt) : undefined,
    scheduledRetry: result.scheduledRetry,
    ignoredReason: result.ignoredReason,
  };
}

export function toPaymentDetailsResponse(details: PaymentDetails) {
  return {
    payment: toPaymentResponse(details.payment),
    attempts: details.attempts.map(toPaymentAttemptResponse),
    webhookEvents: details.webhookEvents.map(toWebhookEventResponse),
  };
}

export function toGatewayWebhookResponse(result: GatewayWebhookResult) {
  return {
    accepted: result.accepted,
    ignoredReason: result.ignoredReason,
    payment: result.payment ? toPaymentResponse(result.payment) : undefined,
    event: toWebhookEventResponse(result.event),
  };
}
