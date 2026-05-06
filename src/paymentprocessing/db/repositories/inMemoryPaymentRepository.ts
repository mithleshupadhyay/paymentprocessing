import { PAYMENT_STATUS } from "../../domain/payments";
import type { Payment, PaymentAttempt, PaymentDetails, WebhookEvent } from "../models/payments";
import type {
  CreatePaymentAttemptInput,
  CreatePaymentInput,
  CreatePaymentResult,
  CreateWebhookEventInput,
  CreateWebhookEventResult,
  PaymentRepository,
  UpdatePaymentAttemptInput,
  UpdatePaymentInput,
  UpdateWebhookEventInput,
} from "./paymentRepository";

class AsyncMutex {
  private current: Promise<void> = Promise.resolve();

  async runExclusive<T>(callback: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const previous = this.current;
    this.current = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;
    try {
      return await callback();
    } finally {
      release();
    }
  }
}

function clonePayment(payment: Payment): Payment {
  return {
    ...payment,
    metadata: { ...payment.metadata },
  };
}

function cloneAttempt(attempt: PaymentAttempt): PaymentAttempt {
  return { ...attempt };
}

function cloneWebhookEvent(event: WebhookEvent): WebhookEvent {
  return {
    ...event,
    rawPayload: { ...event.rawPayload },
  };
}

export class InMemoryPaymentRepository implements PaymentRepository {
  private readonly storeLock = new AsyncMutex();
  private readonly paymentLocks = new Map<string, AsyncMutex>();
  private readonly payments = new Map<string, Payment>();
  private readonly attempts = new Map<string, PaymentAttempt>();
  private readonly attemptIdsByPaymentId = new Map<string, string[]>();
  private readonly idempotencyKeys = new Map<string, string>();
  private readonly webhookEvents = new Map<string, WebhookEvent>();
  private readonly webhookEventIdsByPaymentId = new Map<string, string[]>();

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    return this.storeLock.runExclusive(async () => {
      const existingPaymentId = this.idempotencyKeys.get(input.idempotencyKey);
      if (existingPaymentId) {
        const existingPayment = this.payments.get(existingPaymentId);
        if (existingPayment) {
          return { payment: clonePayment(existingPayment), created: false };
        }
      }

      const now = new Date().toISOString();
      const payment: Payment = {
        id: input.id,
        idempotencyKey: input.idempotencyKey,
        amountMinor: input.amountMinor,
        currency: input.currency,
        customerId: input.customerId,
        referenceId: input.referenceId,
        description: input.description,
        status: PAYMENT_STATUS.Pending,
        attemptCount: 0,
        maxAttempts: input.maxAttempts,
        metadata: input.metadata ? { ...input.metadata } : {},
        createdAt: now,
        updatedAt: now,
        version: 1,
      };

      this.payments.set(payment.id, payment);
      this.idempotencyKeys.set(payment.idempotencyKey, payment.id);
      return { payment: clonePayment(payment), created: true };
    });
  }

  async getPaymentById(paymentId: string): Promise<Payment | null> {
    return this.storeLock.runExclusive(async () => {
      const payment = this.payments.get(paymentId);
      return payment ? clonePayment(payment) : null;
    });
  }

  async getPaymentByIdempotencyKey(idempotencyKey: string): Promise<Payment | null> {
    return this.storeLock.runExclusive(async () => {
      const paymentId = this.idempotencyKeys.get(idempotencyKey);
      if (!paymentId) {
        return null;
      }

      const payment = this.payments.get(paymentId);
      return payment ? clonePayment(payment) : null;
    });
  }

  async getPaymentDetails(paymentId: string): Promise<PaymentDetails | null> {
    return this.storeLock.runExclusive(async () => {
      const payment = this.payments.get(paymentId);
      if (!payment) {
        return null;
      }

      const attemptIds = this.attemptIdsByPaymentId.get(paymentId) || [];
      const webhookEventIds = this.webhookEventIdsByPaymentId.get(paymentId) || [];

      return {
        payment: clonePayment(payment),
        attempts: attemptIds
          .map((attemptId) => this.attempts.get(attemptId))
          .filter((attempt): attempt is PaymentAttempt => Boolean(attempt))
          .map(cloneAttempt),
        webhookEvents: webhookEventIds
          .map((eventId) => this.webhookEvents.get(eventId))
          .filter((event): event is WebhookEvent => Boolean(event))
          .map(cloneWebhookEvent),
      };
    });
  }

  async listPaymentAttempts(paymentId: string): Promise<PaymentAttempt[]> {
    return this.storeLock.runExclusive(async () => {
      const attemptIds = this.attemptIdsByPaymentId.get(paymentId) || [];
      return attemptIds
        .map((attemptId) => this.attempts.get(attemptId))
        .filter((attempt): attempt is PaymentAttempt => Boolean(attempt))
        .map(cloneAttempt);
    });
  }

  async updatePayment(paymentId: string, input: UpdatePaymentInput): Promise<Payment> {
    return this.storeLock.runExclusive(async () => {
      const payment = this.payments.get(paymentId);
      if (!payment) {
        throw new Error(`Payment ${paymentId} was not found.`);
      }

      const updatedPayment: Payment = {
        ...payment,
        ...input,
        updatedAt: new Date().toISOString(),
        version: payment.version + 1,
      };

      this.payments.set(paymentId, updatedPayment);
      return clonePayment(updatedPayment);
    });
  }

  async createPaymentAttempt(input: CreatePaymentAttemptInput): Promise<PaymentAttempt> {
    return this.storeLock.runExclusive(async () => {
      const payment = this.payments.get(input.paymentId);
      if (!payment) {
        throw new Error(`Payment ${input.paymentId} was not found.`);
      }

      const attempt: PaymentAttempt = {
        id: input.id,
        paymentId: input.paymentId,
        attemptNumber: input.attemptNumber,
        status: "Started",
        startedAt: input.startedAt,
      };

      this.attempts.set(attempt.id, attempt);
      const attemptIds = this.attemptIdsByPaymentId.get(input.paymentId) || [];
      attemptIds.push(attempt.id);
      this.attemptIdsByPaymentId.set(input.paymentId, attemptIds);

      const updatedPayment: Payment = {
        ...payment,
        attemptCount: input.attemptNumber,
        updatedAt: new Date().toISOString(),
        version: payment.version + 1,
      };
      this.payments.set(input.paymentId, updatedPayment);

      return cloneAttempt(attempt);
    });
  }

  async updatePaymentAttempt(attemptId: string, input: UpdatePaymentAttemptInput): Promise<PaymentAttempt> {
    return this.storeLock.runExclusive(async () => {
      const attempt = this.attempts.get(attemptId);
      if (!attempt) {
        throw new Error(`Payment attempt ${attemptId} was not found.`);
      }

      const updatedAttempt: PaymentAttempt = {
        ...attempt,
        ...input,
      };

      this.attempts.set(attemptId, updatedAttempt);
      return cloneAttempt(updatedAttempt);
    });
  }

  async createWebhookEvent(input: CreateWebhookEventInput): Promise<CreateWebhookEventResult> {
    return this.storeLock.runExclusive(async () => {
      const existingEvent = this.webhookEvents.get(input.providerEventId);
      if (existingEvent) {
        return { event: cloneWebhookEvent(existingEvent), created: false };
      }

      const event: WebhookEvent = {
        id: input.id,
        providerEventId: input.providerEventId,
        paymentId: input.paymentId,
        gatewayPaymentId: input.gatewayPaymentId,
        status: input.status,
        accepted: input.accepted,
        ignoredReason: input.ignoredReason,
        receivedAt: input.receivedAt,
        rawPayload: { ...input.rawPayload },
      };

      this.webhookEvents.set(event.providerEventId, event);
      const eventIds = this.webhookEventIdsByPaymentId.get(event.paymentId) || [];
      eventIds.push(event.providerEventId);
      this.webhookEventIdsByPaymentId.set(event.paymentId, eventIds);

      return { event: cloneWebhookEvent(event), created: true };
    });
  }

  async updateWebhookEvent(providerEventId: string, input: UpdateWebhookEventInput): Promise<WebhookEvent> {
    return this.storeLock.runExclusive(async () => {
      const event = this.webhookEvents.get(providerEventId);
      if (!event) {
        throw new Error(`Webhook event ${providerEventId} was not found.`);
      }

      const updatedEvent: WebhookEvent = {
        ...event,
        ...input,
      };

      this.webhookEvents.set(providerEventId, updatedEvent);
      return cloneWebhookEvent(updatedEvent);
    });
  }

  async withPaymentLock<T>(paymentId: string, callback: () => Promise<T>): Promise<T> {
    let lock = this.paymentLocks.get(paymentId);
    if (!lock) {
      lock = new AsyncMutex();
      this.paymentLocks.set(paymentId, lock);
    }

    return lock.runExclusive(callback);
  }
}
