// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { createMiddleware } from "hono/factory";
import { randomUUID } from "node:crypto";
import { logger } from "@repo/logger";

function getCorrelationId(c: { req: { header: (name: string) => string | undefined }; get: (key: string) => unknown; set: (key: string, value: unknown) => void }): string {
  const incoming = c.req.header("x-request-id");
  if (incoming && incoming.length > 0) {
    c.set("correlationId", incoming);
    return incoming;
  }
  const generated = randomUUID();
  c.set("correlationId", generated);
  return generated;
}

export const requestLogger = createMiddleware(
  async (c, next) => {
    const correlationId = getCorrelationId(c);
    const start = Date.now();
    await next();
    const duration = Date.now() - start;

    c.header("X-Request-Id", correlationId);

    const logEntry = {
      timestamp: new Date().toISOString(),
      level: c.res.status >= 400 ? "error" : "info",
      correlationId,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: duration,
      userAgent: c.req.header("user-agent") ?? "-",
      ip: c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "-",
    };

    const logLine = JSON.stringify(logEntry);

    if (c.res.status >= 500) {
      logger.error("HTTP request", logEntry);
    } else {
      logger.info("HTTP request", logEntry);
    }
  },
);
