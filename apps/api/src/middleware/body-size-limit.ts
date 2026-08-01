// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// Middleware de limite de tamanho de body para prevenir DoS
// Rejeita requests com Content-Length maior que o limite configurado

import { createMiddleware } from "hono/factory";

const DEFAULT_MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB

export function bodySizeLimit(maxSize: number = DEFAULT_MAX_BODY_SIZE) {
  return createMiddleware(async (c, next) => {
    const contentLength = c.req.header("content-length");
    if (contentLength) {
      const size = parseInt(contentLength, 10);
      if (size > maxSize) {
        return c.json(
          {
            error: {
              code: "PAYLOAD_TOO_LARGE",
              message: `Tamanho do corpo da requisição (${size} bytes) excede o limite de ${maxSize} bytes.`,
            },
          },
          413,
        );
      }
    }
    await next();
  });
}

// Middleware de timeout global para requests
export function requestTimeout(timeoutMs: number = 30_000) {
  return createMiddleware(async (c, next) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      await Promise.race([
        next(),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener("abort", () => {
            reject(new Error("Request timeout"));
          });
        }),
      ]);
    } catch (error) {
      if (error instanceof Error && error.message === "Request timeout") {
        return c.json(
          {
            error: {
              code: "REQUEST_TIMEOUT",
              message: "A requisição excedeu o tempo limite.",
            },
          },
          504,
        );
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  });
}
