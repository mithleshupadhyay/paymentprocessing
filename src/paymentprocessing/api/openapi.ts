import { Router } from "express";
import { settings } from "../core/config";

export function buildOpenApiRouter(): Router {
  const router = Router();

  router.get("/openapi.json", (_request, response) => {
    response.json({
      openapi: "3.0.0",
      info: {
        title: settings.APP_NAME,
        version: settings.APP_VERSION,
        description: "Payment processing API with idempotency, retries, gateway simulation, and webhooks.",
      },
      paths: {
        "/health": {
          get: {
            summary: "Health check",
          },
        },
        "/v1/payments": {
          post: {
            summary: "Initiate a payment",
            parameters: [
              {
                name: "Idempotency-Key",
                in: "header",
                required: true,
                schema: { type: "string" },
              },
            ],
          },
        },
        "/v1/payments/{paymentId}": {
          get: {
            summary: "Get payment status",
          },
        },
        "/v1/payments/{paymentId}/events": {
          get: {
            summary: "Get payment attempts and webhook events",
          },
        },
        "/v1/payments/{paymentId}/process": {
          post: {
            summary: "Trigger payment processing manually",
          },
        },
        "/v1/webhooks/gateway": {
          post: {
            summary: "Handle simulated gateway callback",
          },
        },
      },
      components: {
        securitySchemes: {
          BearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
            description: "Documented for production readiness; auth is not enforced in this assignment MVP.",
          },
        },
      },
    });
  });

  return router;
}
