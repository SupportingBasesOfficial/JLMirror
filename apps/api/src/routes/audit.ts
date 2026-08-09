// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { z } from "zod";
import { query } from "@repo/db";
import { logger } from "@repo/logger";
import { requirePermission } from "../middleware/require-permission.js";
import { httpCache } from "../middleware/http-cache.js";
import "../types.js";

export const auditRoute = new Hono();

// Schema de validação para query params de /logs
const auditLogsQuerySchema = z.object({
  user_id: z.string().uuid().optional(),
  tenant_id: z.string().uuid().optional(),
  action: z.string().max(100).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

// GET /api/v1/audit — overview do modulo
auditRoute.get("/", requirePermission("audit:read"), httpCache(60), (c) => {
  return c.json({
    overview: "Audit — Logs de auditoria do sistema",
    endpoints: ["/logs", "/stats"],
  });
});

// GET /api/v1/audit/logs — lista logs de auditoria com filtros
auditRoute.get(
  "/logs",
  requirePermission("audit:read"),
  httpCache(15),
  async (c) => {
    const user = c.get("user");

    // Parse e valida query params
    const parsed = auditLogsQuerySchema.safeParse({
      user_id: c.req.query("user_id"),
      tenant_id: c.req.query("tenant_id"),
      action: c.req.query("action"),
      from: c.req.query("from"),
      to: c.req.query("to"),
      limit: c.req.query("limit"),
      offset: c.req.query("offset"),
    });

    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Parâmetros inválidos",
            details: parsed.error.flatten(),
          },
        },
        400,
      );
    }

    const { user_id, tenant_id, action, from, to, limit, offset } = parsed.data;

    // Tenant isolation: usuarios non-global so podem ver logs do seu tenant
    const isGlobalScope = user?.scope === "global";
    const effectiveTenantId = isGlobalScope
      ? tenant_id
      : (user?.tenant_id ?? null);

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    // Sempre filtra por tenant para non-global
    if (!isGlobalScope || tenant_id) {
      conditions.push(`tenant_id = $${paramIdx++}`);
      params.push(effectiveTenantId);
    }
    if (user_id) {
      conditions.push(`user_id = $${paramIdx++}`);
      params.push(user_id);
    }
    if (action) {
      conditions.push(`action ILIKE $${paramIdx++}`);
      params.push(`%${action}%`);
    }
    if (from) {
      conditions.push(`created_at >= $${paramIdx++}`);
      params.push(from);
    }
    if (to) {
      conditions.push(`created_at <= $${paramIdx++}`);
      params.push(to);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    try {
      // Paraleliza data + count queries
      const [result, countResult] = await Promise.all([
        query(
          `SELECT id, user_id, tenant_id, action, resource_type, resource_id, details, ip_address, user_agent, created_at
           FROM public.audit_log
           ${whereClause}
           ORDER BY created_at DESC
           LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
          [...params, limit, offset],
        ),
        query<{ count: string }>(
          `SELECT COUNT(*) as count FROM public.audit_log ${whereClause}`,
          params,
        ),
      ]);

      if (result.error) {
        logger.error("Erro ao buscar logs de auditoria", {
          error: result.error.message,
        });
        return c.json(
          {
            error: {
              code: "QUERY_ERROR",
              message: "Erro ao buscar logs de auditoria",
            },
          },
          500,
        );
      }

      return c.json({
        logs: result.data?.rows ?? [],
        total: parseInt(countResult.data?.rows[0]?.count ?? "0", 10),
        limit,
        offset,
      });
    } catch (error) {
      logger.error("Erro interno ao listar audit logs", {
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// GET /api/v1/audit/stats — estatísticas resumidas de auditoria
auditRoute.get(
  "/stats",
  requirePermission("audit:read"),
  httpCache(30),
  async (c) => {
    const user = c.get("user");
    const isGlobalScope = user?.scope === "global";
    const tenantId = user?.tenant_id ?? null;

    try {
      // Non-global: filtra por tenant. Global: stats globais.
      const result = await query<{
        action: string;
        count: string;
        last_occurrence: string;
      }>(
        isGlobalScope
          ? `SELECT action, COUNT(*) as count, MAX(created_at) as last_occurrence
             FROM public.audit_log
             GROUP BY action
             ORDER BY count DESC
             LIMIT 20`
          : `SELECT action, COUNT(*) as count, MAX(created_at) as last_occurrence
             FROM public.audit_log
             WHERE tenant_id = $1
             GROUP BY action
             ORDER BY count DESC
             LIMIT 20`,
        isGlobalScope ? [] : [tenantId],
      );

      if (result.error) {
        logger.error("Erro ao buscar estatísticas de auditoria", {
          error: result.error.message,
        });
        return c.json(
          {
            error: {
              code: "QUERY_ERROR",
              message: "Erro ao buscar estatísticas",
            },
          },
          500,
        );
      }

      return c.json({
        actions:
          result.data?.rows.map((r) => ({
            action: r.action,
            count: parseInt(r.count, 10),
            last_occurrence: r.last_occurrence,
          })) ?? [],
      });
    } catch (error) {
      logger.error("Erro interno ao buscar audit stats", {
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);
