import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../exceptions";
import { getLogger } from "../logging";

const logger = getLogger("paymentprocessing.api.errors");

export function asyncHandler(handler: RequestHandler): RequestHandler {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

export const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
  if (error instanceof ZodError) {
    response.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed.",
        details: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
    });
    return;
  }

  if (error instanceof AppError) {
    response.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    });
    return;
  }

  logger.error("Unhandled API error", {
    method: request.method,
    path: request.path,
    error,
  });

  response.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "Unexpected server error.",
    },
  });
};
