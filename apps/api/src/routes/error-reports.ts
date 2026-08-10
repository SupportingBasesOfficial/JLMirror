// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { z } from "zod";
import { query } from "@repo/db";
import { logger } from "@repo/logger";
import { safeJsonBody } from "../lib/safe-json.js";
import { writeAuditLog } from "../lib/audit.js";
import { requirePermission } from "../middleware/require-permission.js";
import "../types.js";

export const errorReportRoute = new Hono();

// Schema do relatorio de erro
const errorReportSchema = z.object({
  error_message: z.string().min(1).max(2000),
  error_stack: z.string().max(10000).optional(),
  component_stack: z.string().max(10000).optional(),
  error_type: z.string().max(100).optional(),
  url: z.string().max(500).optional(),
  route: z.string().max(500).optional(),
  user_agent: z.string().max(500).optional(),
  browser_info: z.record(z.unknown()).optional(),
  last_action: z.record(z.unknown()).optional(),
  input_data: z.record(z.unknown()).optional(),
  severity: z.enum(["warning", "error", "fatal"]).default("error"),
  trace_id: z.string().max(100).optional(),
});

// POST /api/v1/errors/report — qualquer usuario autenticado pode reportar erros
errorReportRoute.post("/report", async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;
  const userId = user?.sub ?? null;

  try {
    const bodyResult = await safeJsonBody(c);
    if (!bodyResult.success) return bodyResult.response;

    const parsed = errorReportSchema.safeParse(bodyResult.data);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Dados do relatorio de erro invalidos",
            details: parsed.error.flatten(),
          },
        },
        400,
      );
    }

    const data = parsed.data;

    // Gera numero do ticket automaticamente
    let ticketNumber = `ERR-${Date.now()}`;
    try {
      const ticketNumResult = await query<{ generate_ticket_number: string }>(
        "SELECT public.generate_ticket_number($1)",
        [tenantId],
      );
      if (ticketNumResult.data?.rows[0]) {
        ticketNumber = ticketNumResult.data.rows[0].generate_ticket_number;
      }
    } catch {
      // Se falhar, usa o fallback acima
    }

    // Cria ticket com source='api' e priority baseada na severity
    const priorityMap: Record<string, string> = {
      warning: "low",
      error: "high",
      fatal: "urgent",
    };

    const ticketResult = await query<{ id: string }>(
      `INSERT INTO public.tickets
        (tenant_id, ticket_number, subject, description, status, priority, source,
         requester_name, requester_email, category_id, metadata, created_by)
       VALUES ($1, $2, $3, $4, 'open', $5, 'api', $6, $7, NULL, $8, $9)
       RETURNING id`,
      [
        tenantId,
        ticketNumber,
        `[Erro] ${data.error_type ?? "Erro"} em ${data.route ?? data.url ?? "frontend"}`,
        data.error_message,
        priorityMap[data.severity] ?? "medium",
        userId ?? "Sistema",
        "error-boundary@jlmirror.com",
        JSON.stringify({
          error_type: data.error_type,
          url: data.url,
          route: data.route,
          user_agent: data.user_agent,
          browser_info: data.browser_info,
          last_action: data.last_action,
          input_data: data.input_data,
          trace_id: data.trace_id,
          severity: data.severity,
        }),
        userId,
      ],
    );

    const ticketId = ticketResult.data?.rows[0]?.id ?? null;

    // Cria error_report vinculado ao ticket
    const reportResult = await query<{ id: string }>(
      `INSERT INTO public.error_reports
        (tenant_id, ticket_id, user_id, error_message, error_stack, component_stack,
         error_type, url, route, user_agent, browser_info, last_action, input_data,
         severity, trace_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'open')
       RETURNING id`,
      [
        tenantId,
        ticketId,
        userId,
        data.error_message,
        data.error_stack ?? null,
        data.component_stack ?? null,
        data.error_type ?? null,
        data.url ?? null,
        data.route ?? null,
        data.user_agent ?? null,
        JSON.stringify(data.browser_info ?? {}),
        JSON.stringify(data.last_action ?? {}),
        JSON.stringify(data.input_data ?? {}),
        data.severity,
        data.trace_id ?? null,
      ],
    );

    const reportId = reportResult.data?.rows[0]?.id ?? null;

    // Registra no system_log
    await query(
      `INSERT INTO public.system_logs (tenant_id, source, level, message, metadata, trace_id, service)
       VALUES ($1, 'frontend', $2, $3, $4, $5, 'error-boundary')`,
      [
        tenantId,
        data.severity === "warning" ? "warn" : "error",
        data.error_message,
        JSON.stringify({
          error_type: data.error_type,
          url: data.url,
          route: data.route,
          ticket_id: ticketId,
          report_id: reportId,
        }),
        data.trace_id ?? null,
      ],
    );

    // Audit log
    if (userId) {
      try {
        await writeAuditLog({
          userId,
          tenantId,
          action: "error.report",
          entityType: "error_report",
          entityId: reportId,
          newData: {
            ticket_number: ticketNumber,
            severity: data.severity,
            error_type: data.error_type,
          },
        });
      } catch {
        // Audit log falhou — nao bloqueia
      }
    }

    return c.json(
      {
        ticket_number: ticketNumber,
        ticket_id: ticketId,
        report_id: reportId,
        message: "Chamado criado automaticamente. Equipe JL notificada.",
      },
      201,
    );
  } catch (error) {
    logger.error("Erro ao processar relatorio de erro", {
      tenantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Erro ao processar relatorio",
        },
      },
      500,
    );
  }
});

// GET /api/v1/errors/reports — apenas admin
errorReportRoute.get(
  "/reports",
  requirePermission("admin:tenants:read"),
  async (c) => {
    const status = c.req.query("status");
    const severity = c.req.query("severity");
    const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
    const offset = Number(c.req.query("offset") ?? 0);

    try {
      let sql = `
        SELECT er.id, er.tenant_id, er.ticket_id, er.user_id,
               er.error_message, er.error_type, er.url, er.route,
               er.severity, er.status, er.root_cause, er.resolution,
               er.trace_id, er.created_at,
               t.ticket_number, t.subject as ticket_subject,
               u.email as user_email, u.full_name as user_name,
               tn.name as tenant_name
        FROM public.error_reports er
        LEFT JOIN public.tickets t ON er.ticket_id = t.id
        LEFT JOIN public.users u ON er.user_id = u.id
        LEFT JOIN public.tenants tn ON er.tenant_id = tn.id
        WHERE 1=1
      `;
      const params: unknown[] = [];
      let idx = 1;

      if (status) {
        sql += ` AND er.status = $${idx++}`;
        params.push(status);
      }
      if (severity) {
        sql += ` AND er.severity = $${idx++}`;
        params.push(severity);
      }

      sql += ` ORDER BY er.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
      params.push(limit, offset);

      const result = await query(sql, params);

      // Conta total para paginacao
      let countSql =
        "SELECT COUNT(*) as total FROM public.error_reports WHERE 1=1";
      const countParams: unknown[] = [];
      let countIdx = 1;
      if (status) {
        countSql += ` AND status = $${countIdx++}`;
        countParams.push(status);
      }
      if (severity) {
        countSql += ` AND severity = $${countIdx++}`;
        countParams.push(severity);
      }
      const countResult = await query<{ total: string }>(countSql, countParams);
      const total = Number(countResult.data?.rows[0]?.total ?? 0);

      return c.json({
        reports: result.data?.rows ?? [],
        total,
        limit,
        offset,
      });
    } catch (error) {
      logger.error("Erro ao listar error reports", {
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// GET /api/v1/errors/reports/:id — detalhe de um error report
errorReportRoute.get(
  "/reports/:id",
  requirePermission("admin:tenants:read"),
  async (c) => {
    const id = c.req.param("id");

    try {
      const result = await query(
        `SELECT er.*, t.ticket_number, t.subject as ticket_subject, t.status as ticket_status,
                u.email as user_email, u.full_name as user_name,
                tn.name as tenant_name
         FROM public.error_reports er
         LEFT JOIN public.tickets t ON er.ticket_id = t.id
         LEFT JOIN public.users u ON er.user_id = u.id
         LEFT JOIN public.tenants tn ON er.tenant_id = tn.id
         WHERE er.id = $1`,
        [id],
      );

      if (!result.data?.rows[0]) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Relatorio nao encontrado" } },
          404,
        );
      }

      return c.json({ report: result.data.rows[0] });
    } catch (error) {
      logger.error("Erro ao buscar error report", {
        reportId: id,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// PUT /api/v1/errors/reports/:id — atualizar root cause / resolution / status
const updateReportSchema = z.object({
  root_cause: z.string().max(5000).optional(),
  resolution: z.string().max(5000).optional(),
  status: z.enum(["open", "investigating", "resolved", "wontfix"]).optional(),
});

errorReportRoute.put(
  "/reports/:id",
  requirePermission("admin:tenants:write"),
  async (c) => {
    const id = c.req.param("id");
    const user = c.get("user");
    const userId = user?.sub ?? null;
    const tenantId = user?.tenant_id ?? null;

    try {
      const bodyResult = await safeJsonBody(c);
      if (!bodyResult.success) return bodyResult.response;

      const parsed = updateReportSchema.safeParse(bodyResult.data);
      if (!parsed.success) {
        return c.json(
          { error: { code: "VALIDATION_ERROR", message: "Dados invalidos" } },
          400,
        );
      }

      const data = parsed.data;
      const updates: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      if (data.root_cause !== undefined) {
        updates.push(`root_cause = $${idx++}`);
        params.push(data.root_cause);
      }
      if (data.resolution !== undefined) {
        updates.push(`resolution = $${idx++}`);
        params.push(data.resolution);
      }
      if (data.status !== undefined) {
        updates.push(`status = $${idx++}`);
        params.push(data.status);
      }

      if (updates.length === 0) {
        return c.json(
          {
            error: {
              code: "NO_FIELDS",
              message: "Nenhum campo para atualizar",
            },
          },
          400,
        );
      }

      params.push(id);
      const result = await query(
        `UPDATE public.error_reports SET ${updates.join(", ")} WHERE id = $${idx} RETURNING id`,
        params,
      );

      if (!result.data?.rows[0]) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Relatorio nao encontrado" } },
          404,
        );
      }

      if (userId) {
        try {
          await writeAuditLog({
            userId,
            tenantId,
            action: "error.report.update",
            entityType: "error_report",
            entityId: id,
            newData: data,
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      return c.json({ id: result.data.rows[0].id, updated: true });
    } catch (error) {
      logger.error("Erro ao atualizar error report", {
        reportId: id,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "UPDATE_ERROR", message: "Erro ao atualizar" } },
        500,
      );
    }
  },
);
