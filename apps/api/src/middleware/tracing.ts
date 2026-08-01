// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { createMiddleware } from "hono/factory";
import {
  extractTraceContext,
  createRootTraceContext,
  recordSpanStart,
  recordSpanEnd,
  formatTraceParent,
  type TraceContext,
} from "@repo/telemetry";
import "../types.js";

// Estende o ContextVariableMap para incluir trace context
declare module "../types.js" {
  interface ContextVariableMap {
    trace: TraceContext;
  }
}

const SERVICE_NAME = process.env.SERVICE_NAME ?? "jlmirror-api";

// Middleware que injeta trace context em toda requisição HTTP
// e registra span server automaticamente
export function tracingMiddleware() {
  return createMiddleware(async (c, next) => {
    // Extrai trace context de headers W3C ou cria novo
    const headers: Record<string, string | undefined> = {};
    c.req.raw.headers.forEach((value, key) => {
       
      headers[key] = value;
    });

    const incomingCtx = extractTraceContext(headers);
    const ctx = incomingCtx ?? createRootTraceContext();

    c.set("trace", ctx);

    // Propaga traceparent na resposta
    c.header("traceparent", formatTraceParent(ctx));

    // Inicia span server
    const span = recordSpanStart(
      ctx,
      `${c.req.method} ${c.req.path}`,
      SERVICE_NAME,
      {
        kind: "server",
        attributes: {
          "http.method": c.req.method,
          "http.path": c.req.path,
          "http.url": c.req.url,
          "http.user_agent": headers["user-agent"],
        },
        resource: {
          "service.name": SERVICE_NAME,
          "service.version": process.env.npm_package_version ?? "0.1.0",
        },
      },
    );

    const startTime = Date.now();

    try {
      await next();
    } catch (err) {
      recordSpanEnd(span, "error", err instanceof Error ? err.message : "Unhandled error", [
        {
          name: "exception",
          timestamp: new Date().toISOString(),
          attributes: {
            "exception.type": err instanceof Error ? err.constructor.name : "Unknown",
            "exception.message": err instanceof Error ? err.message : String(err),
          },
        },
      ]);
      throw err;
    }

    const durationMs = Date.now() - startTime;
    const status = c.res.status >= 400 ? "error" : "ok";

    recordSpanEnd(
      span,
      status,
      status === "error" ? `HTTP ${c.res.status}` : null,
      [
        {
          name: "http.response",
          timestamp: new Date().toISOString(),
          attributes: {
            "http.status_code": c.res.status,
            "http.duration_ms": durationMs,
          },
        },
      ],
    );
  });
}
