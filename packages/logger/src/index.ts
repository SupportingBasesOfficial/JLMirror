// @ai-context: .zero-error/architecture-map.md#state-store
// @ai-restriction: .zero-error/code-standards.md#error-handling
// Logger leve com níveis estruturados — JSON em produção, colorido em dev
type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) ?? "info";

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[currentLevel];
}

function formatMessage(
  level: LogLevel,
  msg: string,
  meta?: Record<string, unknown>,
): string {
  const timestamp = new Date().toISOString();
  if (process.env.NODE_ENV === "production") {
    return JSON.stringify({ timestamp, level, message: msg, ...meta });
  }
  const colors: Record<LogLevel, string> = {
    debug: "\x1b[36m",
    info: "\x1b[32m",
    warn: "\x1b[33m",
    error: "\x1b[31m",
  };
  const reset = "\x1b[0m";
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
  return `${colors[level]}[${timestamp}] ${level.toUpperCase()}${reset} ${msg}${metaStr}`;
}

/* eslint-disable no-console */
export const logger = {
  debug(msg: string, meta?: Record<string, unknown>) {
    if (shouldLog("debug")) console.debug(formatMessage("debug", msg, meta));
  },
  info(msg: string, meta?: Record<string, unknown>) {
    if (shouldLog("info")) console.info(formatMessage("info", msg, meta));
  },
  warn(msg: string, meta?: Record<string, unknown>) {
    if (shouldLog("warn")) console.warn(formatMessage("warn", msg, meta));
  },
  error(msg: string, meta?: Record<string, unknown>) {
    if (shouldLog("error")) console.error(formatMessage("error", msg, meta));
  },
};
