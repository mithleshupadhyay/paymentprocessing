import crypto from "node:crypto";

function createPrefixedId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
}

export function createPaymentId(): string {
  return createPrefixedId("pay");
}

export function createAttemptId(): string {
  return createPrefixedId("att");
}

export function createGatewayPaymentId(): string {
  return createPrefixedId("gwpay");
}

export function createProviderEventId(): string {
  return createPrefixedId("gwevt");
}

export function hashForLog(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 12);
}
