import { Router } from "express";
import { badRequest } from "../exceptions";
import {
  idempotencyKeySchema,
  initiatePaymentRequestSchema,
  paymentIdParamsSchema,
} from "../schemas/request";
import {
  toInitiatePaymentResponse,
  toPaymentDetailsResponse,
  toPaymentResponse,
  toProcessPaymentResponse,
} from "../schemas/response";
import type { PaymentService } from "../services/paymentService";
import { asyncHandler } from "./errors";

export function buildPaymentsRouter(paymentService: PaymentService): Router {
  const router = Router();

  router.post(
    "/payments",
    asyncHandler(async (request, response) => {
      const idempotencyHeader = request.header("Idempotency-Key");
      if (!idempotencyHeader) {
        throw badRequest("Idempotency-Key header is required.");
      }

      const idempotencyKey = idempotencyKeySchema.parse(idempotencyHeader);
      const payload = initiatePaymentRequestSchema.parse({
        ...request.body,
        idempotencyKey,
      });

      const result = await paymentService.initiatePayment(payload);
      response.status(result.created ? 201 : 200).json(toInitiatePaymentResponse(result));
    }),
  );

  router.get(
    "/payments/:paymentId",
    asyncHandler(async (request, response) => {
      const { paymentId } = paymentIdParamsSchema.parse(request.params);
      const payment = await paymentService.getPayment(paymentId);
      response.json(toPaymentResponse(payment));
    }),
  );

  router.get(
    "/payments/:paymentId/events",
    asyncHandler(async (request, response) => {
      const { paymentId } = paymentIdParamsSchema.parse(request.params);
      const details = await paymentService.getPaymentDetails(paymentId);
      response.json(toPaymentDetailsResponse(details));
    }),
  );

  router.post(
    "/payments/:paymentId/process",
    asyncHandler(async (request, response) => {
      const { paymentId } = paymentIdParamsSchema.parse(request.params);
      const result = await paymentService.processPayment(paymentId, "manual");
      response.status(202).json(toProcessPaymentResponse(result));
    }),
  );

  return router;
}
