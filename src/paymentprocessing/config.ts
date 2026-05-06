import dotenv from "dotenv";

dotenv.config();

function numberFromEnv(name: string, defaultValue: number): number {
  const rawValue = process.env[name];
  if (!rawValue) {
    return defaultValue;
  }

  const parsedValue = Number(rawValue);
  return Number.isFinite(parsedValue) ? parsedValue : defaultValue;
}

function rateFromEnv(name: string, defaultValue: number): number {
  const value = numberFromEnv(name, defaultValue);
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

export const settings = Object.freeze({
  APP_NAME: process.env.APP_NAME || "Payment Processing System",
  APP_VERSION: process.env.APP_VERSION || "0.1.0",
  APP_ENV: process.env.APP_ENV || process.env.NODE_ENV || "development",
  PORT: numberFromEnv("PORT", 3000),
  LOG_LEVEL: process.env.LOG_LEVEL || "info",
  PAYMENT_MAX_RETRY_ATTEMPTS: numberFromEnv("PAYMENT_MAX_RETRY_ATTEMPTS", 3),
  PAYMENT_RETRY_BASE_DELAY_MS: numberFromEnv("PAYMENT_RETRY_BASE_DELAY_MS", 1000),
  PAYMENT_RETRY_MAX_DELAY_MS: numberFromEnv("PAYMENT_RETRY_MAX_DELAY_MS", 10000),
  PAYMENT_PROCESSING_TIMEOUT_MS: numberFromEnv("PAYMENT_PROCESSING_TIMEOUT_MS", 30000),
  GATEWAY_MIN_DELAY_MS: numberFromEnv("GATEWAY_MIN_DELAY_MS", 150),
  GATEWAY_MAX_DELAY_MS: numberFromEnv("GATEWAY_MAX_DELAY_MS", 1200),
  GATEWAY_REQUEST_TIMEOUT_MS: numberFromEnv("GATEWAY_REQUEST_TIMEOUT_MS", 900),
  GATEWAY_SUCCESS_RATE: rateFromEnv("GATEWAY_SUCCESS_RATE", 0.65),
  GATEWAY_FAILURE_RATE: rateFromEnv("GATEWAY_FAILURE_RATE", 0.2),
  GATEWAY_TIMEOUT_RATE: rateFromEnv("GATEWAY_TIMEOUT_RATE", 0.15),
});

export type Settings = typeof settings;
