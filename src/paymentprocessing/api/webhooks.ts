import { Router } from "express";
import { gatewayWebhookRequestSchema } from "../schemas/request";
import { toGatewayWebhookResponse } from "../schemas/response";
import type { PaymentService } from "../services/paymentService";
import { asyncHandler } from "./errors";

export function buildWebhooksRouter(paymentService: PaymentService): Router {
  const router = Router();

  router.post(
    "/webhooks/gateway",
    asyncHandler(async (request, response) => {
      const payload = gatewayWebhookRequestSchema.parse(request.body);
      const result = await paymentService.handleGatewayWebhook(payload);
      response.status(result.accepted ? 200 : 202).json(toGatewayWebhookResponse(result));
    }),
  );

  return router;
}
