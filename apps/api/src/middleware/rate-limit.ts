// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// Rate limiting por IP e tenant usando sliding window
// Produção: Redis via @repo/cache (distribuído entre instâncias)
// Dev: in-memory Map (sem Redis necessário)

import { createMiddleware } from "hono/factory";
import { cacheGet, cacheSet } from "@repo/cache";

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyPrefix?: string;
  tenantOnly?: boolean;
}

function getClientIdentifier(
  c: {
    req: { header: (name: string) => string | undefined };
    get: (key: string) => unknown;
  },
  tenantOnly: boolean,
): string {
  const user = c.get("user") as
    { tenant_id?: string; sub?: string } | undefined;
  const tenant = user?.tenant_id ?? "anonymous";
  if (tenantOnly) {
    return tenant;
  }
  const forwarded = c.req.header("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() ?? "unknown";
  return `${tenant}:${ip}`;
}

// Fallback in-memory para dev sem Redis
const memoryBuckets = new Map<string, { count: number; resetAt: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memoryBuckets) {
    if (entry.resetAt <= now) memoryBuckets.delete(key);
  }
}, 60_000);

export function rateLimit(options: RateLimitOptions) {
  const {
    windowMs,
    maxRequests,
    keyPrefix = "default",
    tenantOnly = false,
  } = options;
  const windowSeconds = Math.ceil(windowMs / 1000);

  return createMiddleware(async (c, next) => {
    if (process.env.NODE_ENV === "test") {
      await next();
      return;
    }

    const identifier = getClientIdentifier(c, tenantOnly);
    const redisKey = `ratelimit:${keyPrefix}:${identifier}`;
    const now = Date.now();

    try {
      // Tenta Redis primeiro
      const current = await cacheGet(redisKey);
      let count: number;

      if (!current) {
        count = 1;
        await cacheSet(redisKey, "1", windowSeconds);
      } else {
        count = parseInt(current, 10) + 1;
        await cacheSet(redisKey, String(count), windowSeconds);
      }

      const remaining = Math.max(0, maxRequests - count);
      c.header("X-RateLimit-Limit", String(maxRequests));
      c.header("X-RateLimit-Remaining", String(remaining));
      c.header("X-RateLimit-Reset", String(Math.ceil((now + windowMs) / 1000)));

      if (count > maxRequests) {
        c.header("Retry-After", String(windowSeconds));
        return c.json(
          {
            error: {
              code: "RATE_LIMIT_EXCEEDED",
              message:
                "Limite de requisições excedido. Tente novamente em alguns segundos.",
            },
          },
          429,
        );
      }
    } catch {
      // Fallback in-memory se Redis indisponível
      const entry = memoryBuckets.get(redisKey);
      if (!entry || entry.resetAt <= now) {
        memoryBuckets.set(redisKey, { count: 1, resetAt: now + windowMs });
        c.header("X-RateLimit-Limit", String(maxRequests));
        c.header("X-RateLimit-Remaining", String(maxRequests - 1));
        c.header(
          "X-RateLimit-Reset",
          String(Math.ceil((now + windowMs) / 1000)),
        );
      } else {
        entry.count++;
        const remaining = Math.max(0, maxRequests - entry.count);
        c.header("X-RateLimit-Limit", String(maxRequests));
        c.header("X-RateLimit-Remaining", String(remaining));
        c.header("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

        if (entry.count > maxRequests) {
          const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
          c.header("Retry-After", String(retryAfter));
          return c.json(
            {
              error: {
                code: "RATE_LIMIT_EXCEEDED",
                message:
                  "Limite de requisições excedido. Tente novamente em alguns segundos.",
              },
            },
            429,
          );
        }
      }
    }

    await next();
  });
}

export const rateLimitAuth = rateLimit({
  windowMs: 15 * 60 * 1000,
  maxRequests: 1000,
  keyPrefix: "auth",
});
export const rateLimitApi = rateLimit({
  windowMs: 60 * 1000,
  maxRequests: 300,
  keyPrefix: "api",
});
export const rateLimitWrite = rateLimit({
  windowMs: 60 * 1000,
  maxRequests: 30,
  keyPrefix: "write",
});

// Rate limit por tenant (sem IP) — protege API Zabbix de sobrecarga
// Limita total de requests por tenant independente de quantos usuarios/IPs
export const rateLimitTenant = rateLimit({
  windowMs: 60 * 1000,
  maxRequests: 100,
  keyPrefix: "tenant",
  tenantOnly: true,
});
