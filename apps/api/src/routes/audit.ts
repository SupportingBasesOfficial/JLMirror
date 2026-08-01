// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { jwtAuth } from "../middleware/jwt-auth.js";
import { tenantContext } from "../middleware/tenant-context.js";
import { requirePermission } from "../middleware/require-permission.js";
import "../types.js";

export const auditRoute = new Hono();

// GET /api/v1/audit/logs — lista logs de auditoria com filtros
auditRoute.get("/logs", jwtAuth, tenantContext, requirePermission("audit:read"), async (c) => {
  const userId = c.req.query("user_id");
  const tenantId = c.req.query("tenant_id");
  const action = c.req.query("action");
  const from = c.req.query("from");
  const to = c.req.query("to");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "100", 10), 500);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);

  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (userId) {
    conditions.push(`user_id = $${paramIdx++}`);
    params.push(userId);
  }
  if (tenantId) {
    conditions.push(`tenant_id = $${paramIdx++}`);
    params.push(tenantId);
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

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(limit, offset);

  const result = await query(
    `SELECT id, user_id, tenant_id, action, resource_type, resource_id, details, ip_address, user_agent, created_at
     FROM public.audit_log
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
    params,
  );

  if (result.error) {
    return c.json(
      { error: { code: "QUERY_ERROR", message: "Erro ao buscar logs de auditoria" } },
      500,
    );
  }

  // Busca total para paginação
  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM public.audit_log ${whereClause}`,
    params.slice(0, -2),
  );

  return c.json({
    logs: result.data?.rows ?? [],
    total: parseInt(countResult.data?.rows[0]?.count ?? "0", 10),
    limit,
    offset,
  });
});

// GET /api/v1/audit/stats — estatísticas resumidas de auditoria
auditRoute.get("/stats", jwtAuth, tenantContext, requirePermission("audit:read"), async (c) => {
  const result = await query<{
    action: string;
    count: string;
    last_occurrence: string;
  }>(
    `SELECT action, COUNT(*) as count, MAX(created_at) as last_occurrence
     FROM public.audit_log
     GROUP BY action
     ORDER BY count DESC
     LIMIT 20`,
  );

  if (result.error) {
    return c.json(
      { error: { code: "QUERY_ERROR", message: "Erro ao buscar estatísticas" } },
      500,
    );
  }

  return c.json({
    actions: result.data?.rows.map((r) => ({
      action: r.action,
      count: parseInt(r.count, 10),
      last_occurrence: r.last_occurrence,
    })) ?? [],
  });
});
