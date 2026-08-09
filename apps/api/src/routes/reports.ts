// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { logger } from "@repo/logger";
import {
  createReportTemplateSchema,
  createScheduledReportSchema,
  updateScheduledReportSchema,
  reportBrandingSchema,
  reportDeliveryConfigSchema,
  type CreateReportTemplateInput,
  type CreateScheduledReportInput,
  type UpdateScheduledReportInput,
  type ReportBrandingInput,
  type ReportDeliveryConfigInput,
} from "@repo/shared-validation";
import { requirePermission } from "../middleware/require-permission.js";
import { rateLimitWrite } from "../middleware/rate-limit.js";
import { httpCache } from "../middleware/http-cache.js";
import { safeJsonBody } from "../lib/safe-json.js";
import { writeAuditLog } from "../lib/audit.js";
import {
  generateCSV,
  generatePDF,
  collectReportData,
} from "../lib/report-generator.js";
import "../types.js";

export const reportsRoute = new Hono();

// ========== Templates ==========

reportsRoute.get(
  "/templates",
  requirePermission("reports:read"),
  httpCache(30),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const result = await query(
        `SELECT * FROM public.report_templates WHERE tenant_id IS NULL OR tenant_id = $1 ORDER BY created_at DESC`,
        [tenantId],
      );

      return c.json({ templates: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro ao listar templates", {
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

reportsRoute.post(
  "/templates",
  rateLimitWrite,
  requirePermission("reports:write"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = createReportTemplateSchema.safeParse(parsedBody.data);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Dados inválidos",
            details: parsed.error.flatten(),
          },
        },
        400,
      );
    }

    const data = parsed.data as CreateReportTemplateInput;

    try {
      const result = await query<{ id: string }>(
        `INSERT INTO public.report_templates (tenant_id, name, description, report_type, data_sources, filters, columns, group_by, chart_type, format, is_active, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
        [
          tenantId,
          data.name,
          data.description ?? null,
          data.report_type ?? data.type,
          JSON.stringify(data.data_sources ?? []),
          JSON.stringify(data.filters ?? {}),
          JSON.stringify(data.columns ?? []),
          data.group_by ?? null,
          data.chart_type ?? null,
          data.format,
          data.is_active,
          user?.sub ?? null,
        ],
      );

      if (result.error || !result.data?.rows[0]) {
        return c.json(
          {
            error: { code: "CREATE_ERROR", message: "Erro ao criar template" },
          },
          500,
        );
      }

      const templateId = result.data.rows[0].id;

      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId,
            action: "report_template.create",
            entityType: "report_templates",
            entityId: templateId,
            newData: { name: data.name },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Template criado", { templateId, tenantId });

      return c.json({ id: templateId, created: true }, 201);
    } catch (error) {
      logger.error("Erro ao criar template", {
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "CREATE_ERROR", message: "Erro ao criar template" } },
        500,
      );
    }
  },
);

reportsRoute.delete(
  "/templates/:templateId",
  rateLimitWrite,
  requirePermission("reports:write"),
  async (c) => {
    const templateId = c.req.param("templateId");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const result = await query(
        "DELETE FROM public.report_templates WHERE id = $1 AND tenant_id = $2",
        [templateId, tenantId],
      );

      if (result.data?.rowCount === 0) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Template não encontrado" } },
          404,
        );
      }

      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId,
            action: "report_template.delete",
            entityType: "report_templates",
            entityId: templateId,
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Template removido", { templateId, tenantId });

      return c.json({ deleted: true });
    } catch (error) {
      logger.error("Erro ao remover template", {
        templateId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: { code: "DELETE_ERROR", message: "Erro ao remover template" },
        },
        500,
      );
    }
  },
);

// ========== Scheduled Reports ==========

reportsRoute.get(
  "/",
  requirePermission("reports:read"),
  httpCache(15),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const result = await query(
        `SELECT sr.*, rt.name as template_name, rt.report_type, rt.chart_type
         FROM public.scheduled_reports sr
         LEFT JOIN public.report_templates rt ON sr.template_id = rt.id
         WHERE sr.tenant_id = $1 ORDER BY sr.created_at DESC`,
        [tenantId],
      );

      return c.json({ reports: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro ao listar relatorios", {
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

reportsRoute.post(
  "/",
  rateLimitWrite,
  requirePermission("reports:write"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = createScheduledReportSchema.safeParse(parsedBody.data);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Dados inválidos",
            details: parsed.error.flatten(),
          },
        },
        400,
      );
    }

    const data = parsed.data as CreateScheduledReportInput;

    try {
      // Valida que o template existe
      const templateResult = await query(
        "SELECT id FROM public.report_templates WHERE id = $1 AND (tenant_id IS NULL OR tenant_id = $2)",
        [data.template_id, tenantId],
      );
      if (!templateResult.data?.rows[0]) {
        return c.json(
          {
            error: {
              code: "TEMPLATE_NOT_FOUND",
              message: "Template não encontrado",
            },
          },
          404,
        );
      }

      // Calcula next_run_at (simulado: agora + 24h para daily, +7d para weekly)
      const nextRun = new Date();
      const cron = data.schedule_cron ?? data.cron;
      if (cron && cron.includes("* * *")) {
        nextRun.setHours(nextRun.getHours() + 24);
      } else {
        nextRun.setDate(nextRun.getDate() + 7);
      }

      const result = await query<{ id: string }>(
        `INSERT INTO public.scheduled_reports (tenant_id, template_id, name, description, schedule_cron, schedule_description, recipients, delivery_method, format, is_active, next_run_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
        [
          tenantId,
          data.template_id,
          data.name ?? null,
          data.description ?? null,
          data.schedule_cron ?? data.cron,
          data.schedule_description ?? null,
          JSON.stringify(data.recipients),
          data.delivery_method,
          data.format,
          data.is_active,
          nextRun.toISOString(),
          user?.sub ?? null,
        ],
      );

      if (result.error || !result.data?.rows[0]) {
        return c.json(
          {
            error: {
              code: "CREATE_ERROR",
              message: "Erro ao agendar relatório",
            },
          },
          500,
        );
      }

      const reportId = result.data.rows[0].id;

      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId,
            action: "report.schedule",
            entityType: "scheduled_reports",
            entityId: reportId,
            newData: { name: data.name },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Relatório agendado", { reportId, tenantId });

      return c.json({ id: reportId, created: true }, 201);
    } catch (error) {
      logger.error("Erro ao agendar relatorio", {
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: { code: "CREATE_ERROR", message: "Erro ao agendar relatório" },
        },
        500,
      );
    }
  },
);

reportsRoute.put(
  "/:reportId",
  rateLimitWrite,
  requirePermission("reports:write"),
  async (c) => {
    const reportId = c.req.param("reportId");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = updateScheduledReportSchema.safeParse(parsedBody.data);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Dados inválidos",
            details: parsed.error.flatten(),
          },
        },
        400,
      );
    }

    const data = parsed.data as UpdateScheduledReportInput;
    const updateFields: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    const fieldMap: Record<string, string> = {
      name: "name",
      description: "description",
      cron: "schedule_cron",
      schedule_cron: "schedule_cron",
      schedule_description: "schedule_description",
      delivery_method: "delivery_method",
      format: "format",
      is_active: "is_active",
    };

    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (data[key as keyof typeof data] !== undefined) {
        updateFields.push(`${dbField} = $${paramIdx++}`);
        params.push(data[key as keyof typeof data]);
      }
    }

    if (data.recipients !== undefined) {
      updateFields.push(`recipients = $${paramIdx++}`);
      params.push(JSON.stringify(data.recipients));
    }

    if (updateFields.length === 0) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "Nada para atualizar" } },
        400,
      );
    }

    try {
      params.push(reportId, tenantId);
      const result = await query(
        `UPDATE public.scheduled_reports SET ${updateFields.join(", ")} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx++}`,
        params,
      );

      if (result.data?.rowCount === 0) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Relatório não encontrado" } },
          404,
        );
      }

      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId,
            action: "report.update",
            entityType: "scheduled_reports",
            entityId: reportId,
            newData: data,
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Relatório atualizado", { reportId, tenantId });

      return c.json({ updated: true });
    } catch (error) {
      logger.error("Erro ao atualizar relatorio", {
        reportId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: {
            code: "UPDATE_ERROR",
            message: "Erro ao atualizar relatório",
          },
        },
        500,
      );
    }
  },
);

reportsRoute.delete(
  "/:reportId",
  rateLimitWrite,
  requirePermission("reports:write"),
  async (c) => {
    const reportId = c.req.param("reportId");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const result = await query(
        "DELETE FROM public.scheduled_reports WHERE id = $1 AND tenant_id = $2",
        [reportId, tenantId],
      );

      if (result.data?.rowCount === 0) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Relatório não encontrado" } },
          404,
        );
      }

      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId,
            action: "report.delete",
            entityType: "scheduled_reports",
            entityId: reportId,
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Relatório removido", { reportId, tenantId });

      return c.json({ deleted: true });
    } catch (error) {
      logger.error("Erro ao remover relatorio", {
        reportId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: { code: "DELETE_ERROR", message: "Erro ao remover relatório" },
        },
        500,
      );
    }
  },
);

// ========== Run Report (Manual) ==========

reportsRoute.post(
  "/:reportId/run",
  rateLimitWrite,
  requirePermission("reports:write"),
  async (c) => {
    const reportId = c.req.param("reportId");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      // Busca o relatório
      const reportResult = await query(
        `SELECT sr.*, rt.name as template_name, rt.report_type, rt.data_sources, rt.columns, rt.chart_type
         FROM public.scheduled_reports sr
         LEFT JOIN public.report_templates rt ON sr.template_id = rt.id
         WHERE sr.id = $1 AND sr.tenant_id = $2`,
        [reportId, tenantId],
      );

      const report = reportResult.data?.rows[0] as
        Record<string, unknown> | undefined;
      if (!report) {
        return c.json(
          {
            error: {
              code: "REPORT_NOT_FOUND",
              message: "Relatório não encontrado",
            },
          },
          404,
        );
      }

      // Cria registro de entrega
      const deliveryResult = await query<{ id: string }>(
        `INSERT INTO public.report_deliveries (tenant_id, report_id, status, delivery_method, started_at)
         VALUES ($1, $2, 'generating', $3, NOW()) RETURNING id`,
        [tenantId, reportId, (report.delivery_method as string) ?? "email"],
      );

      const deliveryId = deliveryResult.data?.rows[0]?.id;
      if (!deliveryId) {
        return c.json(
          { error: { code: "CREATE_ERROR", message: "Erro ao criar entrega" } },
          500,
        );
      }
      const startTime = Date.now();

      // Coleta dados reais das fontes
      const dataSources = (report.data_sources as string[]) ?? [];
      const templateColumns = (report.columns as string[]) ?? [];
      const reportTitle =
        (report.template_name as string) ?? "Relatório JLMIRROR";
      const format = (report.format as string) ?? "pdf";

      const reportData = await collectReportData(
        tenantId as string,
        dataSources,
        templateColumns,
        reportTitle,
        query,
      );

      // Busca branding do tenant para white-label
      const brandingResult = await query<{
        company_name: string;
        logo_url: string | null;
        logo_width: number;
        primary_color: string;
        secondary_color: string;
        accent_color: string;
        footer_text: string | null;
        footer_url: string | null;
        header_bg_color: string;
        header_text_color: string;
        font_family: string;
      }>(
        "SELECT company_name, logo_url, logo_width, primary_color, secondary_color, accent_color, footer_text, footer_url, header_bg_color, header_text_color, font_family FROM public.report_branding WHERE tenant_id = $1 AND is_active = true LIMIT 1",
        [tenantId],
      );

      if (brandingResult.data?.rows[0]) {
        reportData.branding = brandingResult.data.rows[0];
      }

      const rowCount = reportData.rows.length;

      // Gera o arquivo real
      let fileBuffer: Buffer;
      let mimeType: string;

      if (format === "csv") {
        fileBuffer = Buffer.from(generateCSV(reportData), "utf-8");
        mimeType = "text/csv";
      } else {
        fileBuffer = await generatePDF(reportData);
        mimeType = "application/pdf";
      }

      const durationMs = Date.now() - startTime;
      const fileSize = fileBuffer.length;
      const recipients = (report.recipients as string[]) ?? [];

      // Marca como completed
      await query(
        `UPDATE public.report_deliveries SET status = 'completed', file_path = $1, file_size_bytes = $2, file_format = $3, row_count = $4, duration_ms = $5, recipients_sent = $6, completed_at = NOW() WHERE id = $7`,
        [
          `/reports/${deliveryId}.${format}`,
          fileSize,
          format,
          rowCount,
          durationMs,
          JSON.stringify(recipients),
          deliveryId,
        ],
      );

      // Atualiza scheduled_report
      await query(
        "UPDATE public.scheduled_reports SET last_run_at = NOW(), total_runs = total_runs + 1, successful_runs = successful_runs + 1 WHERE id = $1",
        [reportId],
      );

      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId,
            action: "report.run",
            entityType: "scheduled_reports",
            entityId: reportId,
            newData: { delivery_id: deliveryId, rows: rowCount, format },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Relatório executado", {
        reportId,
        deliveryId,
        rowCount,
        durationMs,
      });

      // Retorna o arquivo binário diretamente
      return new Response(fileBuffer, {
        status: 200,
        headers: {
          "Content-Type": mimeType,
          "Content-Disposition": `attachment; filename="${reportTitle.replace(/[^a-zA-Z0-9]/g, "_")}.${format}"`,
          "X-Delivery-Id": deliveryId,
          "X-Row-Count": String(rowCount),
          "X-Duration-Ms": String(durationMs),
        },
      });
    } catch (error) {
      logger.error("Erro ao executar relatorio", {
        reportId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "RUN_ERROR", message: "Erro ao gerar relatório" } },
        500,
      );
    }
  },
);

// ========== Deliveries ==========

reportsRoute.get(
  "/:reportId/deliveries",
  requirePermission("reports:read"),
  httpCache(15),
  async (c) => {
    const reportId = c.req.param("reportId");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const limit = Math.min(parseInt(c.req.query("limit") ?? "20", 10), 100);

    try {
      const result = await query(
        `SELECT * FROM public.report_deliveries WHERE report_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT $3`,
        [reportId, tenantId, limit],
      );

      return c.json({ deliveries: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro ao listar entregas", {
        reportId,
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

reportsRoute.get(
  "/stats",
  requirePermission("reports:read"),
  httpCache(30),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      // Paraleliza 7 queries (antes seriais)
      const [
        totalReports,
        activeReports,
        totalTemplates,
        totalDeliveries,
        successfulDeliveries,
        failedDeliveries,
        recentDeliveries,
      ] = await Promise.all([
        query<{ count: string }>(
          "SELECT COUNT(*) as count FROM public.scheduled_reports WHERE tenant_id = $1",
          [tenantId],
        ),
        query<{ count: string }>(
          "SELECT COUNT(*) as count FROM public.scheduled_reports WHERE tenant_id = $1 AND is_active = true",
          [tenantId],
        ),
        query<{ count: string }>(
          "SELECT COUNT(*) as count FROM public.report_templates WHERE tenant_id IS NULL OR tenant_id = $1",
          [tenantId],
        ),
        query<{ count: string }>(
          "SELECT COUNT(*) as count FROM public.report_deliveries WHERE tenant_id = $1",
          [tenantId],
        ),
        query<{ count: string }>(
          "SELECT COUNT(*) as count FROM public.report_deliveries WHERE tenant_id = $1 AND status = 'completed'",
          [tenantId],
        ),
        query<{ count: string }>(
          "SELECT COUNT(*) as count FROM public.report_deliveries WHERE tenant_id = $1 AND status = 'failed'",
          [tenantId],
        ),
        query(
          `SELECT rd.*, sr.name as report_name FROM public.report_deliveries rd
           LEFT JOIN public.scheduled_reports sr ON rd.report_id = sr.id
           WHERE rd.tenant_id = $1 ORDER BY rd.created_at DESC LIMIT 10`,
          [tenantId],
        ),
      ]);

      const getCount = (r: {
        data?: { rows?: Array<{ count: string }> } | null;
      }): number => {
        const row = r.data?.rows?.[0];
        return row ? parseInt(row.count ?? "0", 10) : 0;
      };

      const total = getCount(totalDeliveries);
      const successful = getCount(successfulDeliveries);

      return c.json({
        total_reports: getCount(totalReports),
        active_reports: getCount(activeReports),
        total_templates: getCount(totalTemplates),
        total_deliveries: total,
        successful_deliveries: successful,
        failed_deliveries: getCount(failedDeliveries),
        success_rate: total > 0 ? Math.round((successful / total) * 100) : 0,
        recent_deliveries: recentDeliveries.data?.rows ?? [],
      });
    } catch (error) {
      logger.error("Erro ao buscar stats de relatorios", {
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

// ========== White-label Branding ==========

reportsRoute.get(
  "/branding",
  requirePermission("reports:read"),
  httpCache(60),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const result = await query(
        "SELECT * FROM public.report_branding WHERE tenant_id = $1 AND is_active = true LIMIT 1",
        [tenantId],
      );

      return c.json({ branding: result.data?.rows[0] ?? null });
    } catch (error) {
      logger.error("Erro ao buscar branding", {
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

reportsRoute.put(
  "/branding",
  rateLimitWrite,
  requirePermission("reports:write"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = reportBrandingSchema.safeParse(parsedBody.data);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Dados inválidos",
            details: parsed.error.flatten(),
          },
        },
        400,
      );
    }

    const data = parsed.data as ReportBrandingInput;

    try {
      const result = await query<{ id: string }>(
        `INSERT INTO public.report_branding
           (tenant_id, company_name, logo_url, logo_width, primary_color, secondary_color,
            accent_color, footer_text, footer_url, header_bg_color, header_text_color,
            font_family, is_active, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         ON CONFLICT (tenant_id) DO UPDATE SET
           company_name = EXCLUDED.company_name,
           logo_url = EXCLUDED.logo_url,
           logo_width = EXCLUDED.logo_width,
           primary_color = EXCLUDED.primary_color,
           secondary_color = EXCLUDED.secondary_color,
           accent_color = EXCLUDED.accent_color,
           footer_text = EXCLUDED.footer_text,
           footer_url = EXCLUDED.footer_url,
           header_bg_color = EXCLUDED.header_bg_color,
           header_text_color = EXCLUDED.header_text_color,
           font_family = EXCLUDED.font_family,
           is_active = EXCLUDED.is_active
         RETURNING id`,
        [
          tenantId,
          data.company_name,
          data.logo_url ?? null,
          data.logo_width ?? 180,
          data.primary_color ?? "#0d9488",
          data.secondary_color ?? "#1f2937",
          data.accent_color ?? "#3b82f6",
          data.footer_text ?? null,
          data.footer_url ?? null,
          data.header_bg_color ?? "#ffffff",
          data.header_text_color ?? "#1f2937",
          data.font_family ?? "Helvetica",
          data.is_active ?? true,
          user?.sub ?? null,
        ],
      );

      if (result.error || !result.data?.rows[0]) {
        return c.json(
          {
            error: { code: "UPDATE_ERROR", message: "Erro ao salvar branding" },
          },
          500,
        );
      }

      const brandingId = result.data.rows[0].id;

      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId,
            action: "report.branding.update",
            entityType: "report_branding",
            entityId: brandingId,
            newData: { company_name: data.company_name },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Branding atualizado", { brandingId, tenantId });

      return c.json({ id: brandingId, updated: true });
    } catch (error) {
      logger.error("Erro ao salvar branding", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "UPDATE_ERROR", message: "Erro ao salvar branding" } },
        500,
      );
    }
  },
);

// ========== Admin Delivery Control ==========

reportsRoute.get(
  "/delivery-config",
  requirePermission("reports:read"),
  httpCache(60),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const result = await query(
        "SELECT * FROM public.report_delivery_config WHERE tenant_id = $1 LIMIT 1",
        [tenantId],
      );

      return c.json({ config: result.data?.rows[0] ?? null });
    } catch (error) {
      logger.error("Erro ao buscar delivery config", {
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

reportsRoute.put(
  "/delivery-config",
  rateLimitWrite,
  requirePermission("reports:write"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = reportDeliveryConfigSchema.safeParse(parsedBody.data);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Dados inválidos",
            details: parsed.error.flatten(),
          },
        },
        400,
      );
    }

    const data = parsed.data as ReportDeliveryConfigInput;

    try {
      const result = await query<{ id: string }>(
        `INSERT INTO public.report_delivery_config
         (tenant_id, auto_reports_enabled, allowed_delivery_methods, default_delivery_method,
          email_from, email_subject_prefix, slack_webhook_url, teams_webhook_url,
          webhook_url, webhook_headers, monthly_report_limit, configured_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (tenant_id) DO UPDATE SET
           auto_reports_enabled = EXCLUDED.auto_reports_enabled,
           allowed_delivery_methods = EXCLUDED.allowed_delivery_methods,
           default_delivery_method = EXCLUDED.default_delivery_method,
           email_from = EXCLUDED.email_from,
           email_subject_prefix = EXCLUDED.email_subject_prefix,
           slack_webhook_url = EXCLUDED.slack_webhook_url,
           teams_webhook_url = EXCLUDED.teams_webhook_url,
           webhook_url = EXCLUDED.webhook_url,
           webhook_headers = EXCLUDED.webhook_headers,
           monthly_report_limit = EXCLUDED.monthly_report_limit
         RETURNING id`,
        [
          tenantId,
          data.auto_reports_enabled ?? false,
          data.allowed_delivery_methods ?? ["email"],
          data.default_delivery_method ?? "email",
          data.email_from ?? null,
          data.email_subject_prefix ?? "[Relatório]",
          data.slack_webhook_url ?? null,
          data.teams_webhook_url ?? null,
          data.webhook_url ?? null,
          JSON.stringify(data.webhook_headers ?? {}),
          data.monthly_report_limit ?? 0,
          user?.sub ?? null,
        ],
      );

      if (result.error || !result.data?.rows[0]) {
        return c.json(
          { error: { code: "UPDATE_ERROR", message: "Erro ao salvar config" } },
          500,
        );
      }

      const configId = result.data.rows[0].id;

      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId,
            action: "report.delivery_config.update",
            entityType: "report_delivery_config",
            entityId: configId,
            newData: {
              auto_reports_enabled: data.auto_reports_enabled,
              default_delivery_method: data.default_delivery_method,
            },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Delivery config atualizado", { configId, tenantId });

      return c.json({ id: configId, updated: true });
    } catch (error) {
      logger.error("Erro ao salvar delivery config", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "UPDATE_ERROR", message: "Erro ao salvar config" } },
        500,
      );
    }
  },
);
