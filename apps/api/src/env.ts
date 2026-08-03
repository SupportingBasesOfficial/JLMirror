// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_PRIVATE_KEY: z.string().min(1),
  JWT_PUBLIC_KEY: z.string().min(1),
  JWT_ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().positive().default(15),
  JWT_REFRESH_TOKEN_TTL_DAYS: z.coerce.number().positive().default(30),
  JWT_ISSUER: z.string().default("jl-informatica-portal"),
  JWT_AUDIENCE: z.string().default("jl-portal-api"),
  ZABBIX_ENCRYPTION_KEY_HEX: z.string().length(64),
  API_PORT: z.coerce.number().positive().default(3001),
  API_INTERNAL_URL: z.string().url().default("http://localhost:3001"),
  SENTRY_DSN: z.string().url().or(z.literal("")).optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error("Variáveis de ambiente inválidas:", parsed.error.flatten());
    throw new Error("Configuração de ambiente inválida");
  }

  return parsed.data;
}

let _env: Env | null = null;

// Lazy getter — so valida apos dotenv carregar .env
export function getEnv(): Env {
  if (!_env) {
    _env = loadEnv();
  }
  return _env;
}

// Mantem compatibilidade: env é acessado via getEnv() apos dotenv
export const env = new Proxy({} as Env, {
  get(_, prop) {
    return Reflect.get(getEnv(), prop);
  },
});
