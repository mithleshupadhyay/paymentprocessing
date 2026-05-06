import { Router } from "express";
import { settings } from "../core/config";

export function buildHealthRouter(): Router {
  const router = Router();

  router.get("/", (_request, response) => {
    response.json({
      status: "ok",
      service: settings.APP_NAME,
      version: settings.APP_VERSION,
      message: "Payment Processing API is running.",
      endpoints: {
        health: "/health",
        openapi: "/openapi.json",
        initiatePayment: "POST /v1/payments",
        getPayment: "GET /v1/payments/:paymentId",
        paymentEvents: "GET /v1/payments/:paymentId/events",
        processPayment: "POST /v1/payments/:paymentId/process",
        gatewayWebhook: "POST /v1/webhooks/gateway",
      },
    });
  });

  router.get("/favicon.ico", (_request, response) => {
    response.status(204).send();
  });

  router.get("/health", (_request, response) => {
    response.json({
      status: "ok",
      service: settings.APP_NAME,
      version: settings.APP_VERSION,
      env: settings.APP_ENV,
    });
  });

  return router;
}
