import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { settings } from "./config";
import { InMemoryPaymentRepository } from "./db/repositories/inMemoryPaymentRepository";
import { SimulatedPaymentGateway, type PaymentGateway } from "./gateway/simulator";
import { getLogger } from "./logging";
import { buildHealthRouter } from "./api/health";
import { buildOpenApiRouter } from "./api/openapi";
import { buildPaymentsRouter } from "./api/payments";
import { buildWebhooksRouter } from "./api/webhooks";
import { errorHandler } from "./api/errors";
import { PaymentService, type PaymentServiceOptions } from "./services/paymentService";
import { NoopRetryScheduler, TimerRetryScheduler, type RetryScheduler } from "./services/retryScheduler";

const logger = getLogger("paymentprocessing.main");

export interface PaymentRuntimeOptions {
  gateway?: PaymentGateway;
  retryScheduler?: RetryScheduler;
  serviceOptions?: Partial<PaymentServiceOptions>;
}

export interface PaymentRuntime {
  paymentService: PaymentService;
  retryScheduler: RetryScheduler;
}

export function createPaymentRuntime(options: PaymentRuntimeOptions = {}): PaymentRuntime {
  const repository = new InMemoryPaymentRepository();
  const gateway =
    options.gateway ||
    new SimulatedPaymentGateway({
      minDelayMs: settings.GATEWAY_MIN_DELAY_MS,
      maxDelayMs: settings.GATEWAY_MAX_DELAY_MS,
      requestTimeoutMs: settings.GATEWAY_REQUEST_TIMEOUT_MS,
      successRate: settings.GATEWAY_SUCCESS_RATE,
      failureRate: settings.GATEWAY_FAILURE_RATE,
      timeoutRate: settings.GATEWAY_TIMEOUT_RATE,
    });

  let paymentService: PaymentService;
  const retryScheduler =
    options.retryScheduler ||
    new TimerRetryScheduler(async (paymentId, reason) => {
      await paymentService.processPayment(paymentId, reason);
    });

  paymentService = new PaymentService(repository, gateway, retryScheduler, {
    maxRetryAttempts: settings.PAYMENT_MAX_RETRY_ATTEMPTS,
    retryBaseDelayMs: settings.PAYMENT_RETRY_BASE_DELAY_MS,
    retryMaxDelayMs: settings.PAYMENT_RETRY_MAX_DELAY_MS,
    processingTimeoutMs: settings.PAYMENT_PROCESSING_TIMEOUT_MS,
    autoProcessOnCreate: true,
    ...options.serviceOptions,
  });

  return {
    paymentService,
    retryScheduler,
  };
}

export function createApp(runtime: PaymentRuntime = createPaymentRuntime()): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.use((request: Request, response: Response, next: NextFunction) => {
    const startedAt = Date.now();
    response.on("finish", () => {
      logger.info("HTTP request completed", {
        method: request.method,
        path: request.path,
        statusCode: response.statusCode,
        durationMs: Date.now() - startedAt,
      });
    });
    next();
  });

  app.use(buildHealthRouter());
  app.use(buildOpenApiRouter());
  app.use("/v1", buildPaymentsRouter(runtime.paymentService));
  app.use("/v1", buildWebhooksRouter(runtime.paymentService));
  app.use((request: Request, response: Response) => {
    response.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: `Route ${request.method} ${request.originalUrl} was not found.`,
      },
    });
  });
  app.use(errorHandler);

  return app;
}

export function createTestRuntime(options: PaymentRuntimeOptions = {}): PaymentRuntime {
  return createPaymentRuntime({
    retryScheduler: options.retryScheduler || new NoopRetryScheduler(),
    serviceOptions: {
      autoProcessOnCreate: false,
      ...options.serviceOptions,
    },
    gateway: options.gateway,
  });
}
