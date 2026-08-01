// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { createMiddleware } from "hono/factory";
import { randomUUID } from "node:crypto";
import { query } from "@repo/db";
import { logger } from "@repo/logger";
import { cacheGet, cacheSet } from "@repo/cache";

// Middleware de auditoria — registra mutações (POST/PUT/DELETE/PATCH) em system_logs
// com hash chaining encadeado para garantir integridade e detectar tampering

const AUDIT_CACHE_KEY = "audit:last_hash";
const AUDIT_CACHE_TTL_SECONDS = 300;

interface AuditContext {
  user?: { sub: string; tenant_id: string; roles: string[] };
}

function getClientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

// Busca o último hash da cadeia — usa cache Redis com fallback a query no DB
async function getLastHash(): Promise<string> {
  const cached = await cacheGet(AUDIT_CACHE_KEY);
  if (cached) return cached;

  const result = await query<{ payload: Record<string, unknown> }>(
    `SELECT payload FROM public.system_logs
     WHERE source = 'audit' AND payload ? 'hash'
     ORDER BY created_at DESC LIMIT 1`,
  );

  const lastHash = result.data?.rows[0]?.payload?.hash as string | undefined;
  return lastHash ?? "GENESIS";
}

// Gera hash SHA-256 encadeado: hash(prev_hash + timestamp + user_id + action + resource + ip)
async function generateAuditHash(
  prevHash: string,
  timestamp: string,
  userId: string,
  action: string,
  resource: string,
  ip: string,
): Promise<string> {
  const { createHash } = await import("node:crypto");
  const data = `${prevHash}|${timestamp}|${userId}|${action}|${resource}|${ip}`;
  return createHash("sha256").update(data).digest("hex");
}

export const auditMiddleware = createMiddleware(async (c, next) => {
  await next();

  // Registra apenas mutações bem-sucedidas (2xx)
  const mutationMethods = ["POST", "PUT", "DELETE", "PATCH"];
  if (!mutationMethods.includes(c.req.method)) return;
  if (c.res.status < 200 || c.res.status >= 300) return;

  // Extrai contexto do usuário setado pelo jwt-auth middleware
  const user = c.get("user") as AuditContext["user"];
  if (!user) return;

  const timestamp = new Date().toISOString();
  const ip = getClientIp(c);
  const action = c.req.method;
  const resource = c.req.path;
  const correlationId = (c.get("correlationId") as string) ?? randomUUID();

  try {
    const prevHash = await getLastHash();
    const hash = await generateAuditHash(prevHash, timestamp, user.sub, action, resource, ip);

    const auditPayload = {
      hash,
      prev_hash: prevHash,
      user_id: user.sub,
      user_roles: user.roles,
      tenant_id: user.tenant_id,
      action,
      resource,
      method: c.req.method,
      status: c.res.status,
      ip,
      correlation_id: correlationId,
      timestamp,
    };

    // Insere no system_logs com source = 'audit'
    await query(
      `INSERT INTO public.system_logs (tenant_id, source, level, message, payload, correlation_id)
       VALUES ($1, 'audit', 'info', $2, $3, $4)`,
      [
        user.tenant_id,
        `${action} ${resource}`,
        JSON.stringify(auditPayload),
        correlationId,
      ],
    );

    // Atualiza cache com o novo hash
    await cacheSet(AUDIT_CACHE_KEY, hash, AUDIT_CACHE_TTL_SECONDS);
  } catch (err) {
    // Auditoria não deve bloquear a resposta — loga erro e continua
    logger.error("Falha ao registrar auditoria", { error: err instanceof Error ? err.message : String(err) });
  }
});
