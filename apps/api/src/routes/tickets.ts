// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import {
  createCategorySchema,
  updateCategorySchema,
  createTicketSchema,
  updateTicketSchema,
  createCommentSchema,
  type CreateCategoryInput,
  type UpdateCategoryInput,
  type CreateTicketInput,
  type UpdateTicketInput,
  type CreateCommentInput,
} from "@repo/shared-validation";
import { requirePermission } from "../middleware/require-permission.js";
import {
  parsePaginationParams,
  buildPaginatedResponse,
} from "../lib/pagination.js";
import "../types.js";

export const ticketRoute = new Hono();

// ========== Categories ==========

ticketRoute.get("/categories", requirePermission("tickets:read"), async (c) => {
  const user = c.get("user");
  const result = await query(
    "SELECT id, tenant_id, name, description, color, sla_response_hours, sla_resolution_hours, is_active, created_at, updated_at FROM public.ticket_categories WHERE tenant_id = $1 ORDER BY name",
    [user?.tenant_id ?? null],
  );

  return c.json({ categories: result.data?.rows ?? [] });
});

ticketRoute.post(
  "/categories",
  requirePermission("tickets:write"),
  async (c) => {
    const user = c.get("user");
    const body = await c.req.json<CreateCategoryInput>();
    const parsed = createCategorySchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } },
        400,
      );
    }

    const data = parsed.data;
    const result = await query<{ id: string }>(
      `INSERT INTO public.ticket_categories (tenant_id, name, description, color, sla_response_hours, sla_resolution_hours, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        user?.tenant_id ?? null,
        data.name,
        data.description ?? null,
        data.color,
        data.sla_response_hours,
        data.sla_resolution_hours,
        data.is_active,
      ],
    );

    if (result.error || !result.data?.rows[0]) {
      return c.json(
        { error: { code: "CREATE_ERROR", message: "Erro ao criar categoria" } },
        500,
      );
    }

    await query(
      "SELECT public.write_audit_log($1, NULL, 'ticket.category.create', 'ticket_category', $2, $3, NULL, NULL)",
      [user.sub, result.data.rows[0].id, JSON.stringify({ name: data.name })],
    );

    return c.json({ id: result.data.rows[0].id }, 201);
  },
);

ticketRoute.put(
  "/categories/:id",
  requirePermission("tickets:write"),
  async (c) => {
    const categoryId = c.req.param("id");
    const user = c.get("user");
    const body = await c.req.json<UpdateCategoryInput>();
    const parsed = updateCategorySchema.safeParse(body);
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
      name: "name",
      description: "description",
      color: "color",
      sla_response_hours: "sla_response_hours",
      sla_resolution_hours: "sla_resolution_hours",
      is_active: "is_active",
    };

    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (data[key as keyof typeof data] !== undefined) {
        updateFields.push(`${dbField} = $${paramIdx++}`);
        params.push(data[key as keyof typeof data]);
      }
    }

    if (updateFields.length === 0) {
      return c.json({ id: categoryId });
    }

    params.push(categoryId, user?.tenant_id ?? null);

    await query(
      `UPDATE public.ticket_categories SET ${updateFields.join(", ")} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx++}`,
      params,
    );

    return c.json({ id: categoryId });
  },
);

ticketRoute.delete(
  "/categories/:id",
  requirePermission("tickets:write"),
  async (c) => {
    const categoryId = c.req.param("id");
    const user = c.get("user");

    await query(
      "DELETE FROM public.ticket_categories WHERE id = $1 AND tenant_id = $2",
      [categoryId, user?.tenant_id ?? null],
    );

    return c.json({ deleted: true });
  },
);

// ========== Tickets ==========

ticketRoute.get("/", requirePermission("tickets:read"), async (c) => {
  const user = c.get("user");
  const status = c.req.query("status");
  const priority = c.req.query("priority");
  const categoryId = c.req.query("category_id");
  const assignedTo = c.req.query("assigned_to");
  const search = c.req.query("search");
  const overdueOnly = c.req.query("overdue") === "true";
  const pagination = parsePaginationParams({
    page: c.req.query("page"),
    limit: c.req.query("limit"),
    sort: c.req.query("sort"),
    order: c.req.query("order"),
  });

  const conditions: string[] = ["t.tenant_id = $1"];
  const params: unknown[] = [user?.tenant_id ?? null];
  let paramIdx = 2;

  if (status) {
    conditions.push(`t.status = $${paramIdx++}`);
    params.push(status);
  }
  if (priority) {
    conditions.push(`t.priority = $${paramIdx++}`);
    params.push(priority);
  }
  if (categoryId) {
    conditions.push(`t.category_id = $${paramIdx++}`);
    params.push(categoryId);
  }
  if (assignedTo) {
    conditions.push(`t.assigned_to = $${paramIdx++}`);
    params.push(assignedTo);
  }
  if (search) {
    conditions.push(
      `(t.subject ILIKE $${paramIdx} OR t.ticket_number ILIKE $${paramIdx} OR t.requester_name ILIKE $${paramIdx} OR t.requester_email ILIKE $${paramIdx})`,
    );
    params.push(`%${search}%`);
    paramIdx++;
  }
  if (overdueOnly) {
    conditions.push("t.is_overdue = true");
  }

  const whereClause = conditions.join(" AND ");

  const countResult = await query<{ total: number }>(
    `SELECT COUNT(*)::int as total FROM public.tickets t WHERE ${whereClause}`,
    params,
  );
  const total = countResult.data?.rows[0]?.total ?? 0;

  params.push(pagination.limit, pagination.offset);
  const result = await query(
    `SELECT t.*, tc.name as category_name, tc.color as category_color
     FROM public.tickets t
     LEFT JOIN public.ticket_categories tc ON t.category_id = tc.id
     WHERE ${whereClause}
     ORDER BY
       CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
       t.is_overdue DESC,
       t.created_at DESC
     LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
    params,
  );

  return c.json(
    buildPaginatedResponse(result.data?.rows ?? [], total, pagination),
  );
});

ticketRoute.get("/:id", requirePermission("tickets:read"), async (c) => {
  const ticketId = c.req.param("id");
  const user = c.get("user");

  const ticketResult = await query(
    `SELECT t.*, tc.name as category_name, tc.color as category_color
     FROM public.tickets t
     LEFT JOIN public.ticket_categories tc ON t.category_id = tc.id
     WHERE t.id = $1 AND t.tenant_id = $2`,
    [ticketId, user?.tenant_id ?? null],
  );

  if (ticketResult.error || !ticketResult.data?.rows[0]) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Ticket não encontrado" } },
      404,
    );
  }

  const commentsResult = await query(
    "SELECT id, tenant_id, ticket_id, author_id, author_name, author_type, body, is_internal, created_at FROM public.ticket_comments WHERE ticket_id = $1 ORDER BY created_at ASC",
    [ticketId],
  );

  return c.json({
    ticket: ticketResult.data.rows[0],
    comments: commentsResult.data?.rows ?? [],
  });
});

ticketRoute.post("/", requirePermission("tickets:write"), async (c) => {
  const user = c.get("user");
  const body = await c.req.json<CreateTicketInput>();
  const parsed = createTicketSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } },
      400,
    );
  }

  const data = parsed.data;

  // Gera número do ticket
  const numberResult = await query<{ generate_ticket_number: string }>(
    "SELECT public.generate_ticket_number($1) as generate_ticket_number",
    [user?.tenant_id ?? null],
  );

  if (numberResult.error || !numberResult.data?.rows[0]) {
    return c.json(
      {
        error: {
          code: "CREATE_ERROR",
          message: "Erro ao gerar número do ticket",
        },
      },
      500,
    );
  }

  const ticketNumber = numberResult.data.rows[0].generate_ticket_number;

  // Calcula SLA se categoria fornecida
  let slaResponseDue: string | null = null;
  let slaResolutionDue: string | null = null;

  if (data.category_id) {
    const slaResult = await query<{
      sla_response_due: string;
      sla_resolution_due: string;
    }>("SELECT * FROM public.calculate_ticket_sla($1, $2)", [
      data.category_id,
      data.priority,
    ]);
    if (slaResult.data?.rows[0]) {
      slaResponseDue = slaResult.data.rows[0].sla_response_due;
      slaResolutionDue = slaResult.data.rows[0].sla_resolution_due;
    }
  }

  const result = await query<{ id: string }>(
    `INSERT INTO public.tickets (tenant_id, ticket_number, category_id, subject, description, status, priority, source,
     requester_name, requester_email, requester_phone, assigned_to, tags, metadata, sla_response_due, sla_resolution_due, created_by)
     VALUES ($1, $2, $3, $4, $5, 'open', $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     RETURNING id`,
    [
      user?.tenant_id ?? null,
      ticketNumber,
      data.category_id ?? null,
      data.subject,
      data.description,
      data.priority,
      data.source,
      data.requester_name,
      data.requester_email,
      data.requester_phone ?? null,
      data.assigned_to ?? null,
      JSON.stringify(data.tags),
      JSON.stringify(data.metadata),
      slaResponseDue,
      slaResolutionDue,
      user.sub,
    ],
  );

  if (result.error || !result.data?.rows[0]) {
    return c.json(
      { error: { code: "CREATE_ERROR", message: "Erro ao criar ticket" } },
      500,
    );
  }

  const ticketId = result.data.rows[0].id;

  // Comentário automático do sistema
  await query(
    `INSERT INTO public.ticket_comments (tenant_id, ticket_id, author_name, author_type, body, is_internal)
     VALUES ($1, $2, 'Sistema', 'system', 'Ticket criado via $3', false)`,
    [user?.tenant_id ?? null, ticketId, data.source],
  );

  await query(
    "SELECT public.write_audit_log($1, NULL, 'ticket.create', 'ticket', $2, $3, NULL, NULL)",
    [
      user.sub,
      ticketId,
      JSON.stringify({
        ticket_number: ticketNumber,
        subject: data.subject,
        priority: data.priority,
      }),
    ],
  );

  return c.json({ id: ticketId, ticket_number: ticketNumber }, 201);
});

ticketRoute.put("/:id", requirePermission("tickets:write"), async (c) => {
  const ticketId = c.req.param("id");
  const user = c.get("user");
  const body = await c.req.json<UpdateTicketInput>();
  const parsed = updateTicketSchema.safeParse(body);
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
    category_id: "category_id",
    subject: "subject",
    description: "description",
    status: "status",
    priority: "priority",
    assigned_to: "assigned_to",
    assigned_name: "assigned_name",
    rating: "rating",
    rating_comment: "rating_comment",
  };

  for (const [key, dbField] of Object.entries(fieldMap)) {
    if (data[key as keyof typeof data] !== undefined) {
      updateFields.push(`${dbField} = $${paramIdx++}`);
      params.push(data[key as keyof typeof data]);
    }
  }

  if (data.tags !== undefined) {
    updateFields.push(`tags = $${paramIdx++}`);
    params.push(JSON.stringify(data.tags));
  }

  // Marca timestamps baseado em mudança de status
  if (data.status === "resolved") {
    updateFields.push(`resolved_at = timezone('utc'::text, now())`);
    // Calcula tempo de resolução
    updateFields.push(
      `resolution_time_mins = EXTRACT(EPOCH FROM (timezone('utc'::text, now()) - created_at)) / 60`,
    );
  } else if (data.status === "closed") {
    updateFields.push(`closed_at = timezone('utc'::text, now())`);
  }

  // Se mudou prioridade ou categoria, recalcula SLA
  if (data.priority || data.category_id) {
    const currentResult = await query<{
      priority: string;
      category_id: string | null;
    }>("SELECT priority, category_id FROM public.tickets WHERE id = $1", [
      ticketId,
    ]);
    if (currentResult.data?.rows[0]) {
      const current = currentResult.data.rows[0];
      const newPriority = data.priority ?? current.priority;
      const newCategoryId = data.category_id ?? current.category_id;
      if (newCategoryId) {
        const slaResult = await query<{
          sla_response_due: string;
          sla_resolution_due: string;
        }>("SELECT * FROM public.calculate_ticket_sla($1, $2)", [
          newCategoryId,
          newPriority,
        ]);
        if (slaResult.data?.rows[0]) {
          updateFields.push(
            `sla_response_due = $${paramIdx++}`,
            `sla_resolution_due = $${paramIdx++}`,
          );
          params.push(
            slaResult.data.rows[0].sla_response_due,
            slaResult.data.rows[0].sla_resolution_due,
          );
        }
      }
    }
  }

  if (updateFields.length === 0) {
    return c.json({ id: ticketId });
  }

  params.push(ticketId, user?.tenant_id ?? null);

  await query(
    `UPDATE public.tickets SET ${updateFields.join(", ")} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx++}`,
    params,
  );

  // Comentário do sistema para mudança de status
  if (data.status) {
    await query(
      `INSERT INTO public.ticket_comments (tenant_id, ticket_id, author_name, author_type, body, is_internal)
       VALUES ($1, $2, $3, 'system', 'Status alterado para: $4', false)`,
      [user?.tenant_id ?? null, ticketId, user.sub, data.status],
    );
  }

  return c.json({ id: ticketId });
});

ticketRoute.delete("/:id", requirePermission("tickets:write"), async (c) => {
  const ticketId = c.req.param("id");
  const user = c.get("user");

  await query("DELETE FROM public.tickets WHERE id = $1 AND tenant_id = $2", [
    ticketId,
    user?.tenant_id ?? null,
  ]);

  return c.json({ deleted: true });
});

// ========== Comments ==========

ticketRoute.get(
  "/:id/comments",
  requirePermission("tickets:read"),
  async (c) => {
    const ticketId = c.req.param("id");
    const result = await query(
      "SELECT id, tenant_id, ticket_id, author_id, author_name, author_type, body, is_internal, created_at FROM public.ticket_comments WHERE ticket_id = $1 ORDER BY created_at ASC",
      [ticketId],
    );

    return c.json({ comments: result.data?.rows ?? [] });
  },
);

ticketRoute.post(
  "/:id/comments",
  requirePermission("tickets:write"),
  async (c) => {
    const ticketId = c.req.param("id");
    const user = c.get("user");
    const body = await c.req.json<CreateCommentInput>();
    const parsed = createCommentSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } },
        400,
      );
    }

    const data = parsed.data;
    const result = await query<{ id: string }>(
      `INSERT INTO public.ticket_comments (tenant_id, ticket_id, author_id, author_name, author_type, body, is_internal)
     VALUES ($1, $2, $3, $4, 'agent', $5, $6) RETURNING id`,
      [
        user?.tenant_id ?? null,
        ticketId,
        user.sub,
        user.sub,
        data.body,
        data.is_internal,
      ],
    );

    if (result.error || !result.data?.rows[0]) {
      return c.json(
        {
          error: {
            code: "CREATE_ERROR",
            message: "Erro ao adicionar comentário",
          },
        },
        500,
      );
    }

    // Marca first_response_at se for o primeiro comentário de agente
    await query(
      `UPDATE public.tickets
     SET first_response_at = COALESCE(first_response_at, timezone('utc'::text, now())),
         response_time_mins = COALESCE(response_time_mins, EXTRACT(EPOCH FROM (timezone('utc'::text, now()) - created_at)) / 60),
         status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END
     WHERE id = $1`,
      [ticketId],
    );

    return c.json({ id: result.data.rows[0].id }, 201);
  },
);

ticketRoute.delete(
  "/:id/comments/:commentId",
  requirePermission("tickets:write"),
  async (c) => {
    const commentId = c.req.param("commentId");
    const user = c.get("user");

    await query(
      "DELETE FROM public.ticket_comments WHERE id = $1 AND tenant_id = $2",
      [commentId, user?.tenant_id ?? null],
    );

    return c.json({ deleted: true });
  },
);

// ========== Stats ==========

ticketRoute.get(
  "/stats/overview",
  requirePermission("tickets:read"),
  async (c) => {
    const user = c.get("user");

    const statusResult = await query(
      `SELECT status, COUNT(*) as count
     FROM public.tickets WHERE tenant_id = $1 GROUP BY status ORDER BY count DESC`,
      [user?.tenant_id ?? null],
    );

    const priorityResult = await query(
      `SELECT priority, COUNT(*) as count
     FROM public.tickets WHERE tenant_id = $1 AND status NOT IN ('resolved','closed','cancelled')
     GROUP BY priority ORDER BY
       CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END`,
      [user?.tenant_id ?? null],
    );

    const slaResult = await query(
      `SELECT
       COUNT(*) FILTER (WHERE is_overdue = true) as overdue,
       COUNT(*) FILTER (WHERE status NOT IN ('resolved','closed','cancelled')) as open_tickets,
       AVG(response_time_mins) FILTER (WHERE response_time_mins IS NOT NULL) as avg_response_mins,
       AVG(resolution_time_mins) FILTER (WHERE resolution_time_mins IS NOT NULL) as avg_resolution_mins,
       AVG(rating) FILTER (WHERE rating IS NOT NULL) as avg_rating
     FROM public.tickets WHERE tenant_id = $1`,
      [user?.tenant_id ?? null],
    );

    const categoryResult = await query(
      `SELECT tc.name, tc.color,
       COUNT(t.id) as ticket_count,
       COUNT(t.id) FILTER (WHERE t.status NOT IN ('resolved','closed','cancelled')) as open_count
     FROM public.ticket_categories tc
     LEFT JOIN public.tickets t ON tc.id = t.category_id AND t.tenant_id = $1
     WHERE tc.tenant_id = $1 AND tc.is_active = true
     GROUP BY tc.name, tc.color ORDER BY open_count DESC`,
      [user?.tenant_id ?? null],
    );

    const totalResult = await query(
      "SELECT COUNT(*) as total FROM public.tickets WHERE tenant_id = $1",
      [user?.tenant_id ?? null],
    );

    return c.json({
      total: totalResult.data?.rows[0]?.total ?? "0",
      by_status: statusResult.data?.rows ?? [],
      by_priority: priorityResult.data?.rows ?? [],
      sla: slaResult.data?.rows[0] ?? {
        overdue: "0",
        open_tickets: "0",
        avg_response_mins: null,
        avg_resolution_mins: null,
        avg_rating: null,
      },
      by_category: categoryResult.data?.rows ?? [],
    });
  },
);
