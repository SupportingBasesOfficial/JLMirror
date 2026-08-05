// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import {
  createChangeRequestSchema,
  updateChangeRequestSchema,
  createChangeTaskSchema,
  approveChangeSchema,
  type CreateChangeRequestInput,
  type UpdateChangeRequestInput,
  type CreateChangeTaskInput,
  type ApproveChangeInput,
} from "@repo/shared-validation";
import { requirePermission } from "../middleware/require-permission.js";
import { safeRows, safeCount } from "../lib/query-helpers.js";
import "../types.js";

export const changesRoute = new Hono();

// ========== List Changes ==========

changesRoute.get("/", requirePermission("changes:read"), async (c) => {
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

  const result = await query(sql, params);
  return c.json({ changes: result.data?.rows ?? [] });
});

// ========== Get Single Change ==========

changesRoute.get("/:changeId", requirePermission("changes:read"), async (c) => {
  const changeId = c.req.param("changeId");
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;

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

  if (!result.data?.rows[0]) {
    return c.json(
      {
        error: { code: "NOT_FOUND", message: "Change request não encontrado" },
      },
      404,
    );
  }

  // Busca approvals
  const approvals = await query(
    `SELECT ca.*, u.name as approver_name, u.email as approver_email
     FROM public.change_approvals ca
     LEFT JOIN public.users u ON ca.approver_id = u.id
     WHERE ca.change_id = $1 ORDER BY ca.created_at`,
    [changeId],
  );

  // Busca tasks
  const tasks = await query(
    `SELECT ct.*, u.name as assignee_name FROM public.change_tasks ct
     LEFT JOIN public.users u ON ct.assigned_to = u.id
     WHERE ct.change_id = $1 ORDER BY ct.task_order`,
    [changeId],
  );

  return c.json({
    change: result.data.rows[0],
    approvals: approvals.data?.rows ?? [],
    tasks: tasks.data?.rows ?? [],
  });
});

// ========== Create Change ==========

changesRoute.post("/", requirePermission("changes:write"), async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;
  const body = await c.req.json<CreateChangeRequestInput>();
  const parsed = createChangeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } },
      400,
    );
  }

  const data = parsed.data;

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
      user.sub,
      data.planned_start_at ?? null,
      data.planned_end_at ?? null,
      JSON.stringify(data.affected_systems),
      JSON.stringify(data.affected_services),
      data.impact_assessment ?? null,
      data.rollback_plan ?? null,
      data.approval_required,
      data.related_ticket_id ?? null,
    ],
  );

  const changeId = result.data?.rows[0]?.id as string;
  const createdRfc = result.data?.rows[0]?.rfc_number as string;

  await query(
    "SELECT public.write_audit_log($1, NULL, 'change.create', 'change_requests', NULL, $2, NULL, NULL)",
    [
      user.sub,
      JSON.stringify({ id: changeId, rfc: createdRfc, title: data.title }),
    ],
  );

  return c.json({ id: changeId, rfc_number: createdRfc, created: true });
});

// ========== Update Change ==========

changesRoute.put(
  "/:changeId",
  requirePermission("changes:write"),
  async (c) => {
    const changeId = c.req.param("changeId");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const body = await c.req.json<UpdateChangeRequestInput>();
    const parsed = updateChangeRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } },
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

    if (updateFields.length > 0) {
      params.push(changeId, tenantId);
      await query(
        `UPDATE public.change_requests SET ${updateFields.join(", ")} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx++}`,
        params,
      );
    }

    return c.json({ updated: true });
  },
);

// ========== Approve Change ==========

changesRoute.post(
  "/:changeId/approve",
  requirePermission("changes:approve"),
  async (c) => {
    const changeId = c.req.param("changeId");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const body = await c.req.json<ApproveChangeInput>();
    const parsed = approveChangeSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } },
        400,
      );
    }

    const data = parsed.data;

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
        user.sub,
        data.approver_role ?? null,
        data.comment ?? null,
      ],
    );

    // Atualiza change request
    await query(
      `UPDATE public.change_requests SET status = 'approved', approved_by = $1, approved_at = NOW(), approval_comment = $2 WHERE id = $3 AND tenant_id = $4`,
      [user.sub, data.comment ?? null, changeId, tenantId],
    );

    await query(
      "SELECT public.write_audit_log($1, NULL, 'change.approve', 'change_requests', $2, $3, NULL, NULL)",
      [user.sub, changeId, JSON.stringify({ comment: data.comment })],
    );

    return c.json({ approved: true });
  },
);

// ========== Reject Change ==========

changesRoute.post(
  "/:changeId/reject",
  requirePermission("changes:approve"),
  async (c) => {
    const changeId = c.req.param("changeId");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const body = await c.req.json<ApproveChangeInput>();
    const parsed = approveChangeSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } },
        400,
      );
    }

    const data = parsed.data;

    await query(
      `INSERT INTO public.change_approvals (tenant_id, change_id, approver_id, approver_role, status, comment, approved_at)
     VALUES ($1, $2, $3, $4, 'rejected', $5, NOW())`,
      [
        tenantId,
        changeId,
        user.sub,
        data.approver_role ?? null,
        data.comment ?? null,
      ],
    );

    await query(
      `UPDATE public.change_requests SET status = 'rejected', approved_by = $1, approved_at = NOW(), approval_comment = $2 WHERE id = $3 AND tenant_id = $4`,
      [user.sub, data.comment ?? null, changeId, tenantId],
    );

    await query(
      "SELECT public.write_audit_log($1, NULL, 'change.reject', 'change_requests', $2, $3, NULL, NULL)",
      [user.sub, changeId, JSON.stringify({ comment: data.comment })],
    );

    return c.json({ rejected: true });
  },
);

// ========== Start Implementation ==========

changesRoute.post(
  "/:changeId/implement",
  requirePermission("changes:write"),
  async (c) => {
    const changeId = c.req.param("changeId");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

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

    await query(
      "SELECT public.write_audit_log($1, NULL, 'change.implement_start', 'change_requests', $2, NULL, NULL, NULL)",
      [user.sub, changeId],
    );

    return c.json({ status: "in_progress" });
  },
);

// ========== Complete Implementation ==========

changesRoute.post(
  "/:changeId/complete",
  requirePermission("changes:write"),
  async (c) => {
    const changeId = c.req.param("changeId");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const body = await c.req.json<{ notes?: string; review?: string }>();

    await query(
      `UPDATE public.change_requests SET status = 'implemented', actual_end_at = NOW(),
      implementation_notes = $1, post_implementation_review = $2 WHERE id = $3 AND tenant_id = $4`,
      [body.notes ?? null, body.review ?? null, changeId, tenantId],
    );

    await query(
      "SELECT public.write_audit_log($1, NULL, 'change.implement_complete', 'change_requests', $2, NULL, NULL, NULL)",
      [user.sub, changeId],
    );

    return c.json({ status: "implemented" });
  },
);

// ========== Rollback ==========

changesRoute.post(
  "/:changeId/rollback",
  requirePermission("changes:write"),
  async (c) => {
    const changeId = c.req.param("changeId");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const body = await c.req.json<{ notes?: string }>();

    await query(
      `UPDATE public.change_requests SET status = 'rolled_back', rollback_status = 'executed',
      actual_end_at = NOW(), implementation_notes = $1 WHERE id = $2 AND tenant_id = $3`,
      [body.notes ?? "Rollback executado", changeId, tenantId],
    );

    await query(
      "SELECT public.write_audit_log($1, NULL, 'change.rollback', 'change_requests', $2, $3, NULL, NULL)",
      [user.sub, changeId, JSON.stringify({ notes: body.notes })],
    );

    return c.json({ status: "rolled_back" });
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

    const result = await query(
      `SELECT ct.*, u.name as assignee_name FROM public.change_tasks ct
     LEFT JOIN public.users u ON ct.assigned_to = u.id
     WHERE ct.change_id = $1 AND ct.tenant_id = $2 ORDER BY ct.task_order`,
      [changeId, tenantId],
    );

    return c.json({ tasks: result.data?.rows ?? [] });
  },
);

changesRoute.post(
  "/:changeId/tasks",
  requirePermission("changes:write"),
  async (c) => {
    const changeId = c.req.param("changeId");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const body = await c.req.json<CreateChangeTaskInput>();
    const parsed = createChangeTaskSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } },
        400,
      );
    }

    const data = parsed.data;
    const result = await query(
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

    return c.json({ id: result.data?.rows[0]?.id, created: true });
  },
);

changesRoute.put(
  "/:changeId/tasks/:taskId",
  requirePermission("changes:write"),
  async (c) => {
    const taskId = c.req.param("taskId");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const body = await c.req.json<{ status?: string; notes?: string }>();

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

    if (updateFields.length > 0) {
      params.push(taskId, tenantId);
      await query(
        `UPDATE public.change_tasks SET ${updateFields.join(", ")} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx++}`,
        params,
      );
    }

    return c.json({ updated: true });
  },
);

// ========== Calendar ==========

changesRoute.get(
  "/calendar/month",
  requirePermission("changes:read"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const month =
      c.req.query("month") ?? new Date().toISOString().substring(0, 7);

    const startDate = `${month}-01`;
    const endDate = `${month}-31`;

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

    return c.json({ events: result.data?.rows ?? [] });
  },
);

// ========== Stats ==========

changesRoute.get("/stats", requirePermission("changes:read"), async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;

  const totalChanges = safeCount(
    await query(
      "SELECT COUNT(*) as count FROM public.change_requests WHERE tenant_id = $1",
      [tenantId],
    ),
  );
  const pendingApproval = safeCount(
    await query(
      "SELECT COUNT(*) as count FROM public.change_requests WHERE tenant_id = $1 AND status IN ('submitted','under_review')",
      [tenantId],
    ),
  );
  const approved = safeCount(
    await query(
      "SELECT COUNT(*) as count FROM public.change_requests WHERE tenant_id = $1 AND status = 'approved'",
      [tenantId],
    ),
  );
  const inProgress = safeCount(
    await query(
      "SELECT COUNT(*) as count FROM public.change_requests WHERE tenant_id = $1 AND status = 'in_progress'",
      [tenantId],
    ),
  );
  const implemented = safeCount(
    await query(
      "SELECT COUNT(*) as count FROM public.change_requests WHERE tenant_id = $1 AND status = 'implemented'",
      [tenantId],
    ),
  );
  const failed = safeCount(
    await query(
      "SELECT COUNT(*) as count FROM public.change_requests WHERE tenant_id = $1 AND status IN ('failed','rolled_back')",
      [tenantId],
    ),
  );
  const emergency = safeCount(
    await query(
      "SELECT COUNT(*) as count FROM public.change_requests WHERE tenant_id = $1 AND change_type = 'emergency'",
      [tenantId],
    ),
  );

  // By type
  const byType = safeRows(
    await query(
      "SELECT change_type, COUNT(*) as count FROM public.change_requests WHERE tenant_id = $1 GROUP BY change_type",
      [tenantId],
    ),
  );

  // Recent changes
  const recent = safeRows(
    await query(
      `SELECT cr.id, cr.rfc_number, cr.title, cr.status, cr.priority, cr.change_type, cr.created_at,
       u.name as requester_name
     FROM public.change_requests cr
     LEFT JOIN public.users u ON cr.requested_by = u.id
     WHERE cr.tenant_id = $1 ORDER BY cr.created_at DESC LIMIT 10`,
      [tenantId],
    ),
  );

  // Upcoming scheduled
  const upcoming = safeRows(
    await query(
      `SELECT id, rfc_number, title, planned_start_at, planned_end_at, priority, risk_level
     FROM public.change_requests
     WHERE tenant_id = $1 AND status IN ('approved','scheduled')
       AND planned_start_at >= NOW()
     ORDER BY planned_start_at ASC LIMIT 5`,
      [tenantId],
    ),
  );

  return c.json({
    total: totalChanges,
    pending_approval: pendingApproval,
    approved,
    in_progress: inProgress,
    implemented,
    failed,
    emergency,
    success_rate:
      totalChanges > 0 ? Math.round((implemented / totalChanges) * 100) : 0,
    by_type: byType,
    recent,
    upcoming,
  });
});
