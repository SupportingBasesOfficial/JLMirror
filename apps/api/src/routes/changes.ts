// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { logger } from "@repo/logger";
import {
  createChangeRequestSchema,
  updateChangeRequestSchema,
  createChangeTaskSchema,
  approveChangeSchema,
} from "@repo/shared-validation";
import { requirePermission } from "../middleware/require-permission.js";
import { rateLimitWrite } from "../middleware/rate-limit.js";
import { httpCache } from "../middleware/http-cache.js";
import { safeJsonBody } from "../lib/safe-json.js";
import { safeRows, safeCount } from "../lib/query-helpers.js";
import "../types.js";

export const changesRoute = new Hono();

// Helper: valida formato month (YYYY-MM) para evitar SQL injection
function isValidMonthFormat(month: string): boolean {
  return /^\d{4}-\d{2}$/.test(month);
}

// ========== List Changes ==========

changesRoute.get(
  "/",
  httpCache(30),
  requirePermission("changes:read"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const status = c.req.query("status");
    const changeType = c.req.query("type");
    const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 200);

    let sql = `SELECT cr.*, u.name as requester_name, u.email as requester_email,
       a.name as assignee_name
     FROM public.change_requests cr
     LEFT JOIN public.users u ON cr.requested_by = u.id
     LEFT JOIN public.users a ON cr.assigned_to = a.id
     WHERE cr.tenant_id = $1`;
    const params: unknown[] = [tenantId];
    let paramIdx = 2;

    if (status) {
      sql += ` AND cr.status = $${paramIdx++}`;
      params.push(status);
    }
    if (changeType) {
      sql += ` AND cr.change_type = $${paramIdx++}`;
      params.push(changeType);
    }
    sql += ` ORDER BY cr.created_at DESC LIMIT $${paramIdx++}`;
    params.push(limit);

    try {
      const result = await query(sql, params);

      if (result.error) {
        logger.error("Erro ao listar change requests", {
          tenantId,
          error: result.error.message,
        });
        return c.json(
          { error: { code: "QUERY_ERROR", message: "Erro ao buscar changes" } },
          500,
        );
      }

      return c.json({ changes: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro inesperado ao listar changes", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// ========== Stats ==========

changesRoute.get(
  "/stats",
  requirePermission("changes:read"),
  httpCache(30),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      // Paraleliza todas as queries de stats (antes 9 seriais)
      const [
        totalResult,
        pendingResult,
        approvedResult,
        inProgressResult,
        implementedResult,
        failedResult,
        emergencyResult,
        byTypeResult,
        recentResult,
        upcomingResult,
      ] = await Promise.all([
        query(
          "SELECT COUNT(*) as count FROM public.change_requests WHERE tenant_id = $1",
          [tenantId],
        ),
        query(
          "SELECT COUNT(*) as count FROM public.change_requests WHERE tenant_id = $1 AND status IN ('submitted','under_review')",
          [tenantId],
        ),
        query(
          "SELECT COUNT(*) as count FROM public.change_requests WHERE tenant_id = $1 AND status = 'approved'",
          [tenantId],
        ),
        query(
          "SELECT COUNT(*) as count FROM public.change_requests WHERE tenant_id = $1 AND status = 'in_progress'",
          [tenantId],
        ),
        query(
          "SELECT COUNT(*) as count FROM public.change_requests WHERE tenant_id = $1 AND status = 'implemented'",
          [tenantId],
        ),
        query(
          "SELECT COUNT(*) as count FROM public.change_requests WHERE tenant_id = $1 AND status IN ('failed','rolled_back')",
          [tenantId],
        ),
        query(
          "SELECT COUNT(*) as count FROM public.change_requests WHERE tenant_id = $1 AND change_type = 'emergency'",
          [tenantId],
        ),
        query(
          "SELECT change_type, COUNT(*) as count FROM public.change_requests WHERE tenant_id = $1 GROUP BY change_type",
          [tenantId],
        ),
        query(
          `SELECT cr.id, cr.rfc_number, cr.title, cr.status, cr.priority, cr.change_type, cr.created_at,
           u.name as requester_name
         FROM public.change_requests cr
         LEFT JOIN public.users u ON cr.requested_by = u.id
         WHERE cr.tenant_id = $1 ORDER BY cr.created_at DESC LIMIT 10`,
          [tenantId],
        ),
        query(
          `SELECT id, rfc_number, title, planned_start_at, planned_end_at, priority, risk_level
         FROM public.change_requests
         WHERE tenant_id = $1 AND status IN ('approved','scheduled')
           AND planned_start_at >= NOW()
         ORDER BY planned_start_at ASC LIMIT 5`,
          [tenantId],
        ),
      ]);

      const totalChanges = safeCount(totalResult);
      const implemented = safeCount(implementedResult);

      return c.json({
        total: totalChanges,
        pending_approval: safeCount(pendingResult),
        approved: safeCount(approvedResult),
        in_progress: safeCount(inProgressResult),
        implemented,
        failed: safeCount(failedResult),
        emergency: safeCount(emergencyResult),
        success_rate:
          totalChanges > 0 ? Math.round((implemented / totalChanges) * 100) : 0,
        by_type: safeRows(byTypeResult),
        recent: safeRows(recentResult),
        upcoming: safeRows(upcomingResult),
      });
    } catch (error) {
      logger.error("Erro inesperado no stats changes", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro ao buscar stats" } },
        500,
      );
    }
  },
);

// ========== Get Single Change ==========

changesRoute.get("/:changeId", requirePermission("changes:read"), async (c) => {
  const changeId = c.req.param("changeId");
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;

  try {
    const result = await query(
      `SELECT cr.*, u.name as requester_name, u.email as requester_email,
         a.name as assignee_name, ap.name as approver_name
         FROM public.change_requests cr
         LEFT JOIN public.users u ON cr.requested_by = u.id
         LEFT JOIN public.users a ON cr.assigned_to = a.id
         LEFT JOIN public.users ap ON cr.approved_by = ap.id
         WHERE cr.id = $1 AND cr.tenant_id = $2`,
      [changeId, tenantId],
    );

    if (result.error || !result.data?.rows[0]) {
      return c.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Change request não encontrado",
          },
        },
        404,
      );
    }

    // Paraleliza 2 queries de detalhe
    const [approvals, tasks] = await Promise.all([
      query(
        `SELECT ca.*, u.name as approver_name, u.email as approver_email
           FROM public.change_approvals ca
           LEFT JOIN public.users u ON ca.approver_id = u.id
           WHERE ca.change_id = $1 ORDER BY ca.created_at`,
        [changeId],
      ),
      query(
        `SELECT ct.*, u.name as assignee_name FROM public.change_tasks ct
           LEFT JOIN public.users u ON ct.assigned_to = u.id
           WHERE ct.change_id = $1 ORDER BY ct.task_order`,
        [changeId],
      ),
    ]);

    return c.json({
      change: result.data.rows[0],
      approvals: approvals.data?.rows ?? [],
      tasks: tasks.data?.rows ?? [],
    });
  } catch (error) {
    logger.error("Erro ao buscar detalhe do change", {
      changeId,
      tenantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao carregar change" } },
      500,
    );
  }
});

// ========== Create Change ==========

changesRoute.post(
  "/",
  rateLimitWrite,
  requirePermission("changes:write"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const bodyResult = await safeJsonBody(c);
    if (!bodyResult.success) return bodyResult.response;

    const parsed = createChangeRequestSchema.safeParse(bodyResult.data);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Dados inválidos",
            details: parsed.error.flatten(),
          },
        },
        400,
      );
    }

    const data = parsed.data;

    try {
      // Gera RFC number
      const seqResult = await query(
        "SELECT nextval('public.change_rfc_seq') as val",
      );
      const seqVal = safeCount({
        data: { rows: [{ count: String(seqResult.data?.rows[0]?.val ?? 1) }] },
      });
      const rfcNumber = `RFC-${new Date().getFullYear()}-${String(seqVal).padStart(5, "0")}`;

      const result = await query(
        `INSERT INTO public.change_requests
         (tenant_id, rfc_number, title, description, change_type, priority, risk_level, status,
          requested_by, planned_start_at, planned_end_at, affected_systems, affected_services,
          impact_assessment, rollback_plan, rollback_status, approval_required, related_ticket_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'submitted',
          $8, $9, $10, $11, $12, $13, $14,
          CASE WHEN $15 = true THEN 'planned' ELSE 'not_needed' END, $15, $16)
         RETURNING id, rfc_number`,
        [
          tenantId,
          rfcNumber,
          data.title,
          data.description ?? null,
          data.change_type,
          data.priority,
          data.risk_level,
          user?.sub ?? null,
          data.planned_start_at ?? null,
          data.planned_end_at ?? null,
          JSON.stringify(data.affected_systems ?? []),
          JSON.stringify(data.affected_services ?? []),
          data.impact_assessment ?? null,
          data.rollback_plan ?? null,
          data.approval_required,
          data.related_ticket_id ?? null,
        ],
      );

      if (result.error || !result.data?.rows[0]) {
        logger.error("Erro ao criar change request", {
          tenantId,
          error: result.error?.message,
        });
        return c.json(
          { error: { code: "CREATE_ERROR", message: "Erro ao criar change" } },
          500,
        );
      }

      const changeId = result.data.rows[0].id as string;
      const createdRfc = result.data.rows[0].rfc_number as string;

      if (user?.sub) {
        await query(
          "SELECT public.write_audit_log($1, NULL, 'change.create', 'change_requests', NULL, $2, NULL, NULL)",
          [
            user.sub,
            JSON.stringify({
              id: changeId,
              rfc: createdRfc,
              title: data.title,
            }),
          ],
        );
      }

      logger.info("Change request criado", {
        changeId,
        rfcNumber: createdRfc,
        tenantId,
        changeType: data.change_type,
      });

      return c.json({ id: changeId, rfc_number: createdRfc, created: true });
    } catch (error) {
      logger.error("Erro inesperado ao criar change", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "CREATE_ERROR", message: "Erro ao criar change" } },
        500,
      );
    }
  },
);

// ========== Update Change ==========

changesRoute.put(
  "/:changeId",
  rateLimitWrite,
  requirePermission("changes:write"),
  async (c) => {
    const changeId = c.req.param("changeId");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const bodyResult = await safeJsonBody(c);
    if (!bodyResult.success) return bodyResult.response;

    const parsed = updateChangeRequestSchema.safeParse(bodyResult.data);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Dados inválidos",
            details: parsed.error.flatten(),
          },
        },
        400,
      );
    }

    const data = parsed.data;
    const updateFields: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    const fieldMap: Record<string, string> = {
      title: "title",
      description: "description",
      change_type: "change_type",
      priority: "priority",
      risk_level: "risk_level",
      status: "status",
      assigned_to: "assigned_to",
      planned_start_at: "planned_start_at",
      planned_end_at: "planned_end_at",
      impact_assessment: "impact_assessment",
      rollback_plan: "rollback_plan",
      rollback_status: "rollback_status",
      implementation_notes: "implementation_notes",
      post_implementation_review: "post_implementation_review",
    };

    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (data[key as keyof typeof data] !== undefined) {
        updateFields.push(`${dbField} = $${paramIdx++}`);
        params.push(data[key as keyof typeof data]);
      }
    }

    if (data.affected_systems !== undefined) {
      updateFields.push(`affected_systems = $${paramIdx++}`);
      params.push(JSON.stringify(data.affected_systems));
    }
    if (data.affected_services !== undefined) {
      updateFields.push(`affected_services = $${paramIdx++}`);
      params.push(JSON.stringify(data.affected_services));
    }

    if (updateFields.length === 0) {
      return c.json({ updated: true });
    }

    params.push(changeId, tenantId);

    try {
      const result = await query(
        `UPDATE public.change_requests SET ${updateFields.join(", ")} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx++} RETURNING id`,
        params,
      );

      if (result.error || !result.data?.rows[0]) {
        return c.json(
          {
            error: {
              code: "NOT_FOUND",
              message: "Change request não encontrado",
            },
          },
          404,
        );
      }

      return c.json({ updated: true });
    } catch (error) {
      logger.error("Erro ao atualizar change", {
        changeId,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: { code: "UPDATE_ERROR", message: "Erro ao atualizar change" },
        },
        500,
      );
    }
  },
);

// ========== Approve Change ==========

changesRoute.post(
  "/:changeId/approve",
  rateLimitWrite,
  requirePermission("changes:approve"),
  async (c) => {
    const changeId = c.req.param("changeId");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const bodyResult = await safeJsonBody(c);
    if (!bodyResult.success) return bodyResult.response;

    const parsed = approveChangeSchema.safeParse(bodyResult.data);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Dados inválidos",
            details: parsed.error.flatten(),
          },
        },
        400,
      );
    }

    const data = parsed.data;

    try {
      // Verifica status atual
      const currentResult = await query(
        "SELECT status, approval_required FROM public.change_requests WHERE id = $1 AND tenant_id = $2",
        [changeId, tenantId],
      );
      const current = currentResult.data?.rows[0] as
        Record<string, unknown> | undefined;
      if (!current) {
        return c.json(
          {
            error: {
              code: "NOT_FOUND",
              message: "Change request não encontrado",
            },
          },
          404,
        );
      }
      if (current.status !== "submitted" && current.status !== "under_review") {
        return c.json(
          {
            error: {
              code: "INVALID_STATUS",
              message: "Change não está aguardando aprovação",
            },
          },
          400,
        );
      }

      // Cria approval record
      await query(
        `INSERT INTO public.change_approvals (tenant_id, change_id, approver_id, approver_role, status, comment, approved_at)
       VALUES ($1, $2, $3, $4, 'approved', $5, NOW())`,
        [
          tenantId,
          changeId,
          user?.sub ?? null,
          data.approver_role ?? null,
          data.comment ?? null,
        ],
      );

      // Atualiza change request
      await query(
        `UPDATE public.change_requests SET status = 'approved', approved_by = $1, approved_at = NOW(), approval_comment = $2 WHERE id = $3 AND tenant_id = $4`,
        [user?.sub ?? null, data.comment ?? null, changeId, tenantId],
      );

      if (user?.sub) {
        await query(
          "SELECT public.write_audit_log($1, NULL, 'change.approve', 'change_requests', $2, $3, NULL, NULL)",
          [user.sub, changeId, JSON.stringify({ comment: data.comment })],
        );
      }

      logger.info("Change aprovado", { changeId, tenantId });

      return c.json({ approved: true });
    } catch (error) {
      logger.error("Erro ao aprovar change", {
        changeId,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "APPROVE_ERROR", message: "Erro ao aprovar change" } },
        500,
      );
    }
  },
);

// ========== Reject Change ==========

changesRoute.post(
  "/:changeId/reject",
  rateLimitWrite,
  requirePermission("changes:approve"),
  async (c) => {
    const changeId = c.req.param("changeId");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const bodyResult = await safeJsonBody(c);
    if (!bodyResult.success) return bodyResult.response;

    const parsed = approveChangeSchema.safeParse(bodyResult.data);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Dados inválidos",
            details: parsed.error.flatten(),
          },
        },
        400,
      );
    }

    const data = parsed.data;

    try {
      // Verifica existencia
      const currentResult = await query(
        "SELECT id FROM public.change_requests WHERE id = $1 AND tenant_id = $2",
        [changeId, tenantId],
      );
      if (!currentResult.data?.rows[0]) {
        return c.json(
          {
            error: {
              code: "NOT_FOUND",
              message: "Change request não encontrado",
            },
          },
          404,
        );
      }

      await query(
        `INSERT INTO public.change_approvals (tenant_id, change_id, approver_id, approver_role, status, comment, approved_at)
       VALUES ($1, $2, $3, $4, 'rejected', $5, NOW())`,
        [
          tenantId,
          changeId,
          user?.sub ?? null,
          data.approver_role ?? null,
          data.comment ?? null,
        ],
      );

      await query(
        `UPDATE public.change_requests SET status = 'rejected', approved_by = $1, approved_at = NOW(), approval_comment = $2 WHERE id = $3 AND tenant_id = $4`,
        [user?.sub ?? null, data.comment ?? null, changeId, tenantId],
      );

      if (user?.sub) {
        await query(
          "SELECT public.write_audit_log($1, NULL, 'change.reject', 'change_requests', $2, $3, NULL, NULL)",
          [user.sub, changeId, JSON.stringify({ comment: data.comment })],
        );
      }

      logger.info("Change rejeitado", { changeId, tenantId });

      return c.json({ rejected: true });
    } catch (error) {
      logger.error("Erro ao rejeitar change", {
        changeId,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "REJECT_ERROR", message: "Erro ao rejeitar change" } },
        500,
      );
    }
  },
);

// ========== Start Implementation ==========

changesRoute.post(
  "/:changeId/implement",
  rateLimitWrite,
  requirePermission("changes:write"),
  async (c) => {
    const changeId = c.req.param("changeId");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const currentResult = await query(
        "SELECT status FROM public.change_requests WHERE id = $1 AND tenant_id = $2",
        [changeId, tenantId],
      );
      const current = currentResult.data?.rows[0] as
        Record<string, unknown> | undefined;
      if (!current) {
        return c.json(
          {
            error: {
              code: "NOT_FOUND",
              message: "Change request não encontrado",
            },
          },
          404,
        );
      }
      if (current.status !== "approved" && current.status !== "scheduled") {
        return c.json(
          {
            error: {
              code: "INVALID_STATUS",
              message: "Change deve estar aprovada ou agendada",
            },
          },
          400,
        );
      }

      await query(
        `UPDATE public.change_requests SET status = 'in_progress', actual_start_at = NOW() WHERE id = $1 AND tenant_id = $2`,
        [changeId, tenantId],
      );

      if (user?.sub) {
        await query(
          "SELECT public.write_audit_log($1, NULL, 'change.implement_start', 'change_requests', $2, NULL, NULL, NULL)",
          [user.sub, changeId],
        );
      }

      logger.info("Implementação iniciada", { changeId, tenantId });

      return c.json({ status: "in_progress" });
    } catch (error) {
      logger.error("Erro ao iniciar implementação", {
        changeId,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: {
            code: "IMPLEMENT_ERROR",
            message: "Erro ao iniciar implementação",
          },
        },
        500,
      );
    }
  },
);

// ========== Complete Implementation ==========

changesRoute.post(
  "/:changeId/complete",
  rateLimitWrite,
  requirePermission("changes:write"),
  async (c) => {
    const changeId = c.req.param("changeId");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const bodyResult = await safeJsonBody(c);
    if (!bodyResult.success) return bodyResult.response;

    const body = bodyResult.data as { notes?: string; review?: string };

    try {
      const result = await query(
        `UPDATE public.change_requests SET status = 'implemented', actual_end_at = NOW(),
        implementation_notes = $1, post_implementation_review = $2 WHERE id = $3 AND tenant_id = $4 RETURNING id`,
        [body.notes ?? null, body.review ?? null, changeId, tenantId],
      );

      if (result.error || !result.data?.rows[0]) {
        return c.json(
          {
            error: {
              code: "NOT_FOUND",
              message: "Change request não encontrado",
            },
          },
          404,
        );
      }

      if (user?.sub) {
        await query(
          "SELECT public.write_audit_log($1, NULL, 'change.implement_complete', 'change_requests', $2, NULL, NULL, NULL)",
          [user.sub, changeId],
        );
      }

      logger.info("Implementação concluída", { changeId, tenantId });

      return c.json({ status: "implemented" });
    } catch (error) {
      logger.error("Erro ao concluir implementação", {
        changeId,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: {
            code: "COMPLETE_ERROR",
            message: "Erro ao concluir implementação",
          },
        },
        500,
      );
    }
  },
);

// ========== Rollback ==========

changesRoute.post(
  "/:changeId/rollback",
  rateLimitWrite,
  requirePermission("changes:write"),
  async (c) => {
    const changeId = c.req.param("changeId");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const bodyResult = await safeJsonBody(c);
    if (!bodyResult.success) return bodyResult.response;

    const body = bodyResult.data as { notes?: string };

    try {
      const result = await query(
        `UPDATE public.change_requests SET status = 'rolled_back', rollback_status = 'executed',
        actual_end_at = NOW(), implementation_notes = $1 WHERE id = $2 AND tenant_id = $3 RETURNING id`,
        [body.notes ?? "Rollback executado", changeId, tenantId],
      );

      if (result.error || !result.data?.rows[0]) {
        return c.json(
          {
            error: {
              code: "NOT_FOUND",
              message: "Change request não encontrado",
            },
          },
          404,
        );
      }

      if (user?.sub) {
        await query(
          "SELECT public.write_audit_log($1, NULL, 'change.rollback', 'change_requests', $2, $3, NULL, NULL)",
          [user.sub, changeId, JSON.stringify({ notes: body.notes })],
        );
      }

      logger.info("Rollback executado", { changeId, tenantId });

      return c.json({ status: "rolled_back" });
    } catch (error) {
      logger.error("Erro ao executar rollback", {
        changeId,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: {
            code: "ROLLBACK_ERROR",
            message: "Erro ao executar rollback",
          },
        },
        500,
      );
    }
  },
);

// ========== Change Tasks ==========

changesRoute.get(
  "/:changeId/tasks",
  requirePermission("changes:read"),
  async (c) => {
    const changeId = c.req.param("changeId");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const result = await query(
        `SELECT ct.*, u.name as assignee_name FROM public.change_tasks ct
       LEFT JOIN public.users u ON ct.assigned_to = u.id
       WHERE ct.change_id = $1 AND ct.tenant_id = $2 ORDER BY ct.task_order`,
        [changeId, tenantId],
      );

      if (result.error) {
        logger.error("Erro ao listar change tasks", {
          changeId,
          tenantId,
          error: result.error.message,
        });
        return c.json(
          { error: { code: "QUERY_ERROR", message: "Erro ao buscar tasks" } },
          500,
        );
      }

      return c.json({ tasks: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro inesperado ao listar tasks", {
        changeId,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

changesRoute.post(
  "/:changeId/tasks",
  rateLimitWrite,
  requirePermission("changes:write"),
  async (c) => {
    const changeId = c.req.param("changeId");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const bodyResult = await safeJsonBody(c);
    if (!bodyResult.success) return bodyResult.response;

    const parsed = createChangeTaskSchema.safeParse(bodyResult.data);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Dados inválidos",
            details: parsed.error.flatten(),
          },
        },
        400,
      );
    }

    const data = parsed.data;

    try {
      // Verifica se o change request existe
      const changeResult = await query(
        "SELECT id FROM public.change_requests WHERE id = $1 AND tenant_id = $2",
        [changeId, tenantId],
      );
      if (!changeResult.data?.rows[0]) {
        return c.json(
          {
            error: {
              code: "NOT_FOUND",
              message: "Change request não encontrado",
            },
          },
          404,
        );
      }

      const result = await query<{ id: string }>(
        `INSERT INTO public.change_tasks (tenant_id, change_id, title, description, task_order, task_type, assigned_to)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [
          tenantId,
          changeId,
          data.title,
          data.description ?? null,
          data.task_order,
          data.task_type,
          data.assigned_to ?? null,
        ],
      );

      if (result.error || !result.data?.rows[0]) {
        return c.json(
          { error: { code: "CREATE_ERROR", message: "Erro ao criar task" } },
          500,
        );
      }

      return c.json({ id: result.data.rows[0].id, created: true });
    } catch (error) {
      logger.error("Erro ao criar change task", {
        changeId,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "CREATE_ERROR", message: "Erro ao criar task" } },
        500,
      );
    }
  },
);

changesRoute.put(
  "/:changeId/tasks/:taskId",
  rateLimitWrite,
  requirePermission("changes:write"),
  async (c) => {
    const taskId = c.req.param("taskId");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const bodyResult = await safeJsonBody(c);
    if (!bodyResult.success) return bodyResult.response;

    const body = bodyResult.data as { status?: string; notes?: string };

    const updateFields: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (body.status) {
      updateFields.push(`status = $${paramIdx++}`);
      params.push(body.status);
      if (body.status === "in_progress") {
        updateFields.push(`started_at = COALESCE(started_at, NOW())`);
      }
      if (
        body.status === "completed" ||
        body.status === "skipped" ||
        body.status === "failed"
      ) {
        updateFields.push(`completed_at = NOW()`);
      }
    }
    if (body.notes !== undefined) {
      updateFields.push(`notes = $${paramIdx++}`);
      params.push(body.notes);
    }

    if (updateFields.length === 0) {
      return c.json({ updated: true });
    }

    params.push(taskId, tenantId);

    try {
      const result = await query(
        `UPDATE public.change_tasks SET ${updateFields.join(", ")} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx++} RETURNING id`,
        params,
      );

      if (result.error || !result.data?.rows[0]) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Task não encontrada" } },
          404,
        );
      }

      return c.json({ updated: true });
    } catch (error) {
      logger.error("Erro ao atualizar task", {
        taskId,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "UPDATE_ERROR", message: "Erro ao atualizar task" } },
        500,
      );
    }
  },
);

// ========== Calendar ==========

changesRoute.get(
  "/calendar/month",
  requirePermission("changes:read"),
  httpCache(60),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const month =
      c.req.query("month") ?? new Date().toISOString().substring(0, 7);

    // Validacao de seguranca: bloqueia SQL injection via month param
    if (!isValidMonthFormat(month)) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Formato de mês inválido (use YYYY-MM)",
          },
        },
        400,
      );
    }

    const startDate = `${month}-01`;
    const endDate = `${month}-31`;

    try {
      const result = await query(
        `SELECT id, rfc_number, title, change_type, priority, risk_level, status,
         planned_start_at, planned_end_at, actual_start_at, actual_end_at
       FROM public.change_requests
       WHERE tenant_id = $1
         AND planned_start_at IS NOT NULL
         AND planned_start_at >= $2
         AND planned_start_at <= $3
       ORDER BY planned_start_at`,
        [tenantId, startDate, endDate],
      );

      if (result.error) {
        logger.error("Erro ao buscar calendar", {
          tenantId,
          error: result.error.message,
        });
        return c.json(
          {
            error: { code: "QUERY_ERROR", message: "Erro ao buscar calendar" },
          },
          500,
        );
      }

      return c.json({ events: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro inesperado no calendar", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);
