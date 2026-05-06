import { settings } from "./config";

type LogLevel = "debug" | "info" | "warn" | "error";
type LogMeta = Record<string, unknown>;

const levelRank: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const sensitiveKeys = new Set([
  "authorization",
  "token",
  "secret",
  "password",
  "cardNumber",
  "cvv",
  "rawToken",
]);

let activeLogLevel: LogLevel = normalizeLogLevel(settings.LOG_LEVEL);

function normalizeLogLevel(level: string): LogLevel {
  if (level === "debug" || level === "info" || level === "warn" || level === "error") {
    return level;
  }
  return "info";
}

function shouldLog(level: LogLevel): boolean {
  return levelRank[level] >= levelRank[activeLogLevel];
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redact(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: settings.APP_ENV === "production" ? undefined : value.stack,
    };
  }

  const safeValue: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (sensitiveKeys.has(key) || sensitiveKeys.has(key.toLowerCase())) {
      safeValue[key] = "[REDACTED]";
      continue;
    }
    safeValue[key] = redact(item);
  }
  return safeValue;
}

function writeLog(level: LogLevel, loggerName: string, message: string, meta?: LogMeta): void {
  if (!shouldLog(level)) {
    return;
  }

  const payload = {
    timestamp: new Date().toISOString(),
    level,
    logger: loggerName,
    message,
    ...(meta ? { meta: redact(meta) } : {}),
  };

  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

export function configureLogging(level?: string): void {
  activeLogLevel = normalizeLogLevel(level || settings.LOG_LEVEL);
}

export function getLogger(name: string) {
  return {
    debug: (message: string, meta?: LogMeta) => writeLog("debug", name, message, meta),
    info: (message: string, meta?: LogMeta) => writeLog("info", name, message, meta),
    warn: (message: string, meta?: LogMeta) => writeLog("warn", name, message, meta),
    error: (message: string, meta?: LogMeta) => writeLog("error", name, message, meta),
  };
}
