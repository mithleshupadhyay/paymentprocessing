import type { AttemptStatus, PaymentStatus } from "../../domain/payments";

export type MetadataValue = string | number | boolean | null;
export type Metadata = Record<string, MetadataValue>;

export interface Payment {
  id: string;
  idempotencyKey: string;
  amountMinor: number;
  currency: string;
  customerId?: string;
  referenceId?: string;
  description?: string;
  status: PaymentStatus;
  attemptCount: number;
  maxAttempts: number;
  gatewayPaymentId?: string;
  failureReason?: string;
  nextRetryAt?: string;
  processingStartedAt?: string;
  processingExpiresAt?: string;
  metadata: Metadata;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface PaymentAttempt {
  id: string;
  paymentId: string;
  attemptNumber: number;
  status: AttemptStatus;
  gatewayPaymentId?: string;
  providerEventId?: string;
  errorCode?: string;
  errorMessage?: string;
  startedAt: string;
  completedAt?: string;
  latencyMs?: number;
}

export interface WebhookEvent {
  id: string;
  providerEventId: string;
  paymentId: string;
  gatewayPaymentId?: string;
  status: "success" | "failed";
  accepted: boolean;
  ignoredReason?: string;
  receivedAt: string;
  processedAt?: string;
  rawPayload: Metadata;
}

export interface PaymentDetails {
  payment: Payment;
  attempts: PaymentAttempt[];
  webhookEvents: WebhookEvent[];
}
