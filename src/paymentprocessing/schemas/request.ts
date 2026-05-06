import { z } from "zod";

const metadataValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8, "Idempotency-Key must be at least 8 characters.")
  .max(128, "Idempotency-Key must be 128 characters or fewer.")
  .regex(/^[A-Za-z0-9._:-]+$/, "Idempotency-Key contains unsupported characters.");

export const initiatePaymentRequestSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  amountMinor: z
    .number({ invalid_type_error: "amountMinor must be a number." })
    .int("amountMinor must be an integer minor-unit amount.")
    .positive("amountMinor must be greater than zero.")
    .max(100_000_000, "amountMinor exceeds the assignment safety limit."),
  currency: z
    .string()
    .trim()
    .length(3, "currency must be a 3-letter ISO currency code.")
    .regex(/^[A-Za-z]{3}$/, "currency must contain only letters."),
  customerId: z.string().trim().min(1).max(80).optional(),
  referenceId: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().min(1).max(240).optional(),
  metadata: z.record(metadataValueSchema).optional(),
});

export const paymentIdParamsSchema = z.object({
  paymentId: z.string().trim().regex(/^pay_[a-f0-9]{24}$/, "Invalid payment id."),
});

export const gatewayWebhookRequestSchema = z.object({
  providerEventId: z.string().trim().min(6).max(120),
  paymentId: z.string().trim().regex(/^pay_[a-f0-9]{24}$/, "Invalid payment id."),
  gatewayPaymentId: z.string().trim().min(6).max(120).optional(),
  status: z.enum(["success", "failed"]),
  rawPayload: z.record(metadataValueSchema).optional(),
});

export type InitiatePaymentRequest = z.infer<typeof initiatePaymentRequestSchema>;
export type GatewayWebhookRequest = z.infer<typeof gatewayWebhookRequestSchema>;
