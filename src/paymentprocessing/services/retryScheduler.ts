import { getLogger } from "../logging";

const logger = getLogger("paymentprocessing.services.retryScheduler");

export interface RetryScheduler {
  schedulePaymentProcessing(paymentId: string, delayMs: number, reason: string): void;
  stop?(): void;
}

export class NoopRetryScheduler implements RetryScheduler {
  schedulePaymentProcessing(): void {
    return;
  }
}

export class TimerRetryScheduler implements RetryScheduler {
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(private readonly processor: (paymentId: string, reason: string) => Promise<void>) {}

  schedulePaymentProcessing(paymentId: string, delayMs: number, reason: string): void {
    const existingTimer = this.timers.get(paymentId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.timers.delete(paymentId);
      this.processor(paymentId, reason).catch((error: unknown) => {
        logger.error("Scheduled payment processing failed", {
          paymentId,
          reason,
          error,
        });
      });
    }, Math.max(delayMs, 0));

    timer.unref();
    this.timers.set(paymentId, timer);
    logger.info("Payment processing scheduled", {
      paymentId,
      delayMs,
      reason,
    });
  }

  stop(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }
}
