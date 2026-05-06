import type { Payment, PaymentAttempt, PaymentDetails, WebhookEvent, Metadata } from "../models/payments";

export interface CreatePaymentInput {
  id: string;
  idempotencyKey: string;
  amountMinor: number;
  currency: string;
  customerId?: string;
  referenceId?: string;
  description?: string;
  maxAttempts: number;
  metadata?: Metadata;
}

export interface CreatePaymentResult {
  payment: Payment;
  created: boolean;
}

export interface CreatePaymentAttemptInput {
  id: string;
  paymentId: string;
  attemptNumber: number;
  startedAt: string;
}

export interface UpdatePaymentAttemptInput {
  status?: PaymentAttempt["status"];
  gatewayPaymentId?: string;
  providerEventId?: string;
  errorCode?: string;
  errorMessage?: string;
  completedAt?: string;
  latencyMs?: number;
}

export interface UpdatePaymentInput {
  status?: Payment["status"];
  gatewayPaymentId?: string;
  failureReason?: string;
  nextRetryAt?: string;
  processingStartedAt?: string;
  processingExpiresAt?: string;
}

export interface CreateWebhookEventInput {
  id: string;
  providerEventId: string;
  paymentId: string;
  gatewayPaymentId?: string;
  status: "success" | "failed";
  accepted: boolean;
  ignoredReason?: string;
  receivedAt: string;
  rawPayload: Metadata;
}

export interface CreateWebhookEventResult {
  event: WebhookEvent;
  created: boolean;
}

export interface UpdateWebhookEventInput {
  accepted?: boolean;
  ignoredReason?: string;
  processedAt?: string;
}

export interface PaymentRepository {
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  getPaymentById(paymentId: string): Promise<Payment | null>;
  getPaymentByIdempotencyKey(idempotencyKey: string): Promise<Payment | null>;
  getPaymentDetails(paymentId: string): Promise<PaymentDetails | null>;
  listPaymentAttempts(paymentId: string): Promise<PaymentAttempt[]>;
  updatePayment(paymentId: string, input: UpdatePaymentInput): Promise<Payment>;
  createPaymentAttempt(input: CreatePaymentAttemptInput): Promise<PaymentAttempt>;
  updatePaymentAttempt(attemptId: string, input: UpdatePaymentAttemptInput): Promise<PaymentAttempt>;
  createWebhookEvent(input: CreateWebhookEventInput): Promise<CreateWebhookEventResult>;
  updateWebhookEvent(providerEventId: string, input: UpdateWebhookEventInput): Promise<WebhookEvent>;
  withPaymentLock<T>(paymentId: string, callback: () => Promise<T>): Promise<T>;
}
