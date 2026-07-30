import type { Context, Next } from "hono";
import { query } from "@repo/db";

// Middleware que loga requests HTTP no system_logs
// Amostragem: 1 em cada N requests para nao sobrecarregar o DB
const SAMPLE_RATE = parseInt(process.env.LOG_SAMPLE_RATE ?? "10", 10);
let requestCounter = 0;

export async function logIngestionMiddleware(c: Context, next: Next): Promise<void> {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;

  // Amostragem — so loga 1 a cada SAMPLE_RATE requests
  requestCounter++;
  if (requestCounter % SAMPLE_RATE !== 0) return;

  const method = c.req.method;
  const path = c.req.path;
  const status = c.res.status;
  const userAgent = c.req.header("user-agent") ?? "unknown";
  const tenantId = c.get("user")?.tenant_id ?? null;

  // So loga requests da API (nao assets, health, etc)
  if (!path.startsWith("/api/v1/") || path.startsWith("/api/v1/health") || path.startsWith("/api/v1/metrics")) {
    return;
  }

  const level = status >= 500 ? "error" : status >= 400 ? "warn" : "info";

  try {
    const logPayload = JSON.stringify({
      method,
      path,
      status,
      duration_ms: duration,
      user_agent: userAgent.substring(0, 200),
      tags: ["http", "request", method.toLowerCase()],
      host: "api-server",
      service: "api",
    });
    await query(
      `INSERT INTO public.system_logs (tenant_id, source, level, message, payload, correlation_id)
       VALUES ($1, $2, $3, $4, $5, NULL)`,
      [
        tenantId,
        "api",
        level,
        `${method} ${path} ${status} ${duration}ms`,
        logPayload,
      ],
    );
  } catch {
    // Silencioso — nao podemos quebrar a request por erro de log
  }
}
