// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// Configuração de CORS por tenant
// Em produção, origens permitidas são lidas de variáveis de ambiente
// Formato: CORS_ALLOWED_ORIGINS=https://app1.jlmirror.com,https://app2.jlmirror.com

import { cors } from "hono/cors";

const DEFAULT_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3001",
];

function getAllowedOrigins(): string[] {
  const envOrigins = process.env.CORS_ALLOWED_ORIGINS;
  if (envOrigins) {
    return envOrigins.split(",").map((o) => o.trim()).filter(Boolean);
  }
  return DEFAULT_ORIGINS;
}

export const corsMiddleware = cors({
  origin: (origin) => {
    const allowed = getAllowedOrigins();
    if (!origin || allowed.includes(origin)) {
      return origin;
    }
    return null;
  },
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: [
    "Authorization",
    "Content-Type",
    "X-Request-Id",
    "X-Tenant-Id",
  ],
  exposeHeaders: [
    "X-Request-Id",
    "X-RateLimit-Limit",
    "X-RateLimit-Remaining",
    "X-RateLimit-Reset",
    "Retry-After",
  ],
  maxAge: 86400,
  credentials: true,
});
