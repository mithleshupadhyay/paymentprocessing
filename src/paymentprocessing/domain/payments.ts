export const PAYMENT_STATUS = {
  Pending: "Pending",
  Processing: "Processing",
  Success: "Success",
  Failed: "Failed",
} as const;

export type PaymentStatus = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];

export const GATEWAY_OUTCOME = {
  Success: "Success",
  Failed: "Failed",
  Timeout: "Timeout",
} as const;

export type GatewayOutcome = (typeof GATEWAY_OUTCOME)[keyof typeof GATEWAY_OUTCOME];

export const ATTEMPT_STATUS = {
  Started: "Started",
  Success: "Success",
  Failed: "Failed",
  Timeout: "Timeout",
  Ignored: "Ignored",
} as const;

export type AttemptStatus = (typeof ATTEMPT_STATUS)[keyof typeof ATTEMPT_STATUS];

export function isTerminalPaymentStatus(status: PaymentStatus): boolean {
  return status === PAYMENT_STATUS.Success || status === PAYMENT_STATUS.Failed;
}

export function canMovePaymentStatus(fromStatus: PaymentStatus, toStatus: PaymentStatus): boolean {
  if (fromStatus === toStatus) {
    return true;
  }

  if (isTerminalPaymentStatus(fromStatus)) {
    return false;
  }

  if (fromStatus === PAYMENT_STATUS.Pending) {
    return toStatus === PAYMENT_STATUS.Processing || isTerminalPaymentStatus(toStatus);
  }

  if (fromStatus === PAYMENT_STATUS.Processing) {
    return (
      toStatus === PAYMENT_STATUS.Pending ||
      toStatus === PAYMENT_STATUS.Success ||
      toStatus === PAYMENT_STATUS.Failed
    );
  }

  return false;
}

export function getBackoffDelayMs(
  completedAttemptNumber: number,
  baseDelayMs: number,
  maxDelayMs: number,
): number {
  const attemptIndex = Math.max(completedAttemptNumber - 1, 0);
  const delay = baseDelayMs * 2 ** attemptIndex;
  return Math.min(delay, maxDelayMs);
}

export function normalizeCurrency(currency: string): string {
  return currency.trim().toUpperCase();
}
