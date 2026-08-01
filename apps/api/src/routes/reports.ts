// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import {
  createReportTemplateSchema,
  createScheduledReportSchema,
  updateScheduledReportSchema,
  type CreateReportTemplateInput,
  type CreateScheduledReportInput,
  type UpdateScheduledReportInput,
} from "@repo/shared-validation";
import { jwtAuth } from "../middleware/jwt-auth.js";
import { tenantContext } from "../middleware/tenant-context.js";
import { requirePermission } from "../middleware/require-permission.js";
import { generateCSV, generatePDF, collectReportData } from "../lib/report-generator.js";
import "../types.js";

export const reportsRoute = new Hono();

reportsRoute.use("/*", jwtAuth);
reportsRoute.use("/*", tenantContext);

// ========== Templates ==========

reportsRoute.get("/templates", requirePermission("reports:read"), async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;

  const result = await query(
    `SELECT * FROM public.report_templates WHERE tenant_id IS NULL OR tenant_id = $1 ORDER BY created_at DESC`,
    [tenantId],
  );

  return c.json({ templates: result.data?.rows ?? [] });
});

reportsRoute.post("/templates", requirePermission("reports:write"), async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;
  const body = await c.req.json<CreateReportTemplateInput>();
  const parsed = createReportTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } }, 400);
  }

  const data = parsed.data;
  const result = await query(
    `INSERT INTO public.report_templates (tenant_id, name, description, report_type, data_sources, filters, columns, group_by, chart_type, format, is_active, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
    [tenantId, data.name, data.description ?? null, data.report_type,
     JSON.stringify(data.data_sources), JSON.stringify(data.filters),
     JSON.stringify(data.columns), data.group_by ?? null, data.chart_type ?? null,
     data.format, data.is_active, user.sub],
  );

  await query(
    "SELECT public.write_audit_log($1, NULL, 'report_template.create', 'report_templates', NULL, $2, NULL, NULL)",
    [user.sub, JSON.stringify({ id: result.data?.rows[0]?.id, name: data.name })],
  );

  return c.json({ id: result.data?.rows[0]?.id, created: true });
});

reportsRoute.delete("/templates/:templateId", requirePermission("reports:write"), async (c) => {
  const templateId = c.req.param("templateId");
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;

  await query(
    "DELETE FROM public.report_templates WHERE id = $1 AND tenant_id = $2",
    [templateId, tenantId],
  );

  await query(
    "SELECT public.write_audit_log($1, NULL, 'report_template.delete', 'report_templates', $2, NULL, NULL, NULL)",
    [user.sub, templateId],
  );

  return c.json({ deleted: true });
});

// ========== Scheduled Reports ==========

reportsRoute.get("/", requirePermission("reports:read"), async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;

  const result = await query(
    `SELECT sr.*, rt.name as template_name, rt.report_type, rt.chart_type
     FROM public.scheduled_reports sr
     LEFT JOIN public.report_templates rt ON sr.template_id = rt.id
     WHERE sr.tenant_id = $1 ORDER BY sr.created_at DESC`,
    [tenantId],
  );

  return c.json({ reports: result.data?.rows ?? [] });
});

reportsRoute.post("/", requirePermission("reports:write"), async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;
  const body = await c.req.json<CreateScheduledReportInput>();
  const parsed = createScheduledReportSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } }, 400);
  }

  const data = parsed.data;

  // Valida que o template existe
  const templateResult = await query(
    "SELECT id FROM public.report_templates WHERE id = $1 AND (tenant_id IS NULL OR tenant_id = $2)",
    [data.template_id, tenantId],
  );
  if (!templateResult.data?.rows[0]) {
    return c.json({ error: { code: "TEMPLATE_NOT_FOUND", message: "Template não encontrado" } }, 404);
  }

  // Calcula next_run_at (simulado: agora + 24h para daily, +7d para weekly)
  const nextRun = new Date();
  const cron = data.schedule_cron;
  if (cron.includes("* * *")) {
    nextRun.setHours(nextRun.getHours() + 24);
  } else {
    nextRun.setDate(nextRun.getDate() + 7);
  }

  const result = await query(
    `INSERT INTO public.scheduled_reports (tenant_id, template_id, name, description, schedule_cron, schedule_description, recipients, delivery_method, format, is_active, next_run_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
    [tenantId, data.template_id, data.name, data.description ?? null,
     data.schedule_cron, data.schedule_description ?? null,
     JSON.stringify(data.recipients), data.delivery_method, data.format,
     data.is_active, nextRun.toISOString(), user.sub],
  );

  await query(
    "SELECT public.write_audit_log($1, NULL, 'report.schedule', 'scheduled_reports', NULL, $2, NULL, NULL)",
    [user.sub, JSON.stringify({ id: result.data?.rows[0]?.id, name: data.name })],
  );

  return c.json({ id: result.data?.rows[0]?.id, created: true });
});

reportsRoute.put("/:reportId", requirePermission("reports:write"), async (c) => {
  const reportId = c.req.param("reportId");
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;
  const body = await c.req.json<UpdateScheduledReportInput>();
  const parsed = updateScheduledReportSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } }, 400);
  }

  const data = parsed.data;
  const updateFields: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  const fieldMap: Record<string, string> = {
    name: "name", description: "description", schedule_cron: "schedule_cron",
    schedule_description: "schedule_description", delivery_method: "delivery_method",
    format: "format", is_active: "is_active",
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

  if (updateFields.length > 0) {
    params.push(reportId, tenantId);
    await query(
      `UPDATE public.scheduled_reports SET ${updateFields.join(", ")} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx++}`,
      params,
    );
  }

  return c.json({ updated: true });
});

reportsRoute.delete("/:reportId", requirePermission("reports:write"), async (c) => {
  const reportId = c.req.param("reportId");
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;

  await query(
    "DELETE FROM public.scheduled_reports WHERE id = $1 AND tenant_id = $2",
    [reportId, tenantId],
  );

  await query(
    "SELECT public.write_audit_log($1, NULL, 'report.delete', 'scheduled_reports', $2, NULL, NULL, NULL)",
    [user.sub, reportId],
  );

  return c.json({ deleted: true });
});

// ========== Run Report (Manual) ==========

reportsRoute.post("/:reportId/run", requirePermission("reports:write"), async (c) => {
  const reportId = c.req.param("reportId");
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;

  // Busca o relatório
  const reportResult = await query(
    `SELECT sr.*, rt.name as template_name, rt.report_type, rt.data_sources, rt.columns, rt.chart_type
     FROM public.scheduled_reports sr
     LEFT JOIN public.report_templates rt ON sr.template_id = rt.id
     WHERE sr.id = $1 AND sr.tenant_id = $2`,
    [reportId, tenantId],
  );

  const report = reportResult.data?.rows[0] as Record<string, unknown> | undefined;
  if (!report) {
    return c.json({ error: { code: "REPORT_NOT_FOUND", message: "Relatório não encontrado" } }, 404);
  }

  // Cria registro de entrega
  const deliveryResult = await query<{ id: string }>(
    `INSERT INTO public.report_deliveries (tenant_id, report_id, status, delivery_method, started_at)
     VALUES ($1, $2, 'generating', $3, NOW()) RETURNING id`,
    [tenantId, reportId, (report.delivery_method as string) ?? "email"],
  );

  const deliveryId = deliveryResult.data?.rows[0]?.id;
  const startTime = Date.now();

  // Coleta dados reais das fontes
  const dataSources = (report.data_sources as string[]) ?? [];
  const templateColumns = (report.columns as string[]) ?? [];
  const reportTitle = (report.template_name as string) ?? "Relatório JLMIRROR";
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
    company_name: string; logo_url: string | null; logo_width: number;
    primary_color: string; secondary_color: string; accent_color: string;
    footer_text: string | null; footer_url: string | null;
    header_bg_color: string; header_text_color: string; font_family: string;
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
    [`/reports/${deliveryId}.${format}`, fileSize, format, rowCount, durationMs, JSON.stringify(recipients), deliveryId],
  );

  // Atualiza scheduled_report
  await query(
    "UPDATE public.scheduled_reports SET last_run_at = NOW(), total_runs = total_runs + 1, successful_runs = successful_runs + 1 WHERE id = $1",
    [reportId],
  );

  await query(
    "SELECT public.write_audit_log($1, NULL, 'report.run', 'scheduled_reports', $2, $3, NULL, NULL)",
    [user.sub, reportId, JSON.stringify({ delivery_id: deliveryId, rows: rowCount, format })],
  );

  // Retorna o arquivo binário diretamente
  return new Response(fileBuffer, {
    status: 200,
    headers: {
      "Content-Type": mimeType,
      "Content-Disposition": `attachment; filename="${reportTitle.replace(/[^a-zA-Z0-9]/g, "_")}.${format}"`,
      "X-Delivery-Id": deliveryId ?? "",
      "X-Row-Count": String(rowCount),
      "X-Duration-Ms": String(durationMs),
    },
  });
});

// ========== Deliveries ==========

reportsRoute.get("/:reportId/deliveries", requirePermission("reports:read"), async (c) => {
  const reportId = c.req.param("reportId");
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;
  const limit = Math.min(parseInt(c.req.query("limit") ?? "20", 10), 100);

  const result = await query(
    `SELECT * FROM public.report_deliveries WHERE report_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT $3`,
    [reportId, tenantId, limit],
  );

  return c.json({ deliveries: result.data?.rows ?? [] });
});

// ========== Stats ==========

reportsRoute.get("/stats/overview", requirePermission("reports:read"), async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;

  const totalReports = await query("SELECT COUNT(*) as count FROM public.scheduled_reports WHERE tenant_id = $1", [tenantId]);
  const activeReports = await query("SELECT COUNT(*) as count FROM public.scheduled_reports WHERE tenant_id = $1 AND is_active = true", [tenantId]);
  const totalTemplates = await query("SELECT COUNT(*) as count FROM public.report_templates WHERE tenant_id IS NULL OR tenant_id = $1", [tenantId]);
  const totalDeliveries = await query("SELECT COUNT(*) as count FROM public.report_deliveries WHERE tenant_id = $1", [tenantId]);
  const successfulDeliveries = await query("SELECT COUNT(*) as count FROM public.report_deliveries WHERE tenant_id = $1 AND status = 'completed'", [tenantId]);
  const failedDeliveries = await query("SELECT COUNT(*) as count FROM public.report_deliveries WHERE tenant_id = $1 AND status = 'failed'", [tenantId]);

  const getCount = (r: { data?: { rows?: Array<Record<string, unknown>> } | null }): number => {
    const row = r.data?.rows?.[0];
    return row ? parseInt((row.count as string) ?? "0", 10) : 0;
  };

  // Recent deliveries
  const recentDeliveries = await query(
    `SELECT rd.*, sr.name as report_name FROM public.report_deliveries rd
     LEFT JOIN public.scheduled_reports sr ON rd.report_id = sr.id
     WHERE rd.tenant_id = $1 ORDER BY rd.created_at DESC LIMIT 10`,
    [tenantId],
  );

  return c.json({
    total_reports: getCount(totalReports),
    active_reports: getCount(activeReports),
    total_templates: getCount(totalTemplates),
    total_deliveries: getCount(totalDeliveries),
    successful_deliveries: getCount(successfulDeliveries),
    failed_deliveries: getCount(failedDeliveries),
    success_rate: getCount(totalDeliveries) > 0 ? Math.round((getCount(successfulDeliveries) / getCount(totalDeliveries)) * 100) : 0,
    recent_deliveries: recentDeliveries.data?.rows ?? [],
  });
});

// ========== White-label Branding ==========

// GET /api/v1/reports/branding — busca branding do tenant
reportsRoute.get("/branding", requirePermission("reports:read"), async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;

  const result = await query(
    "SELECT * FROM public.report_branding WHERE tenant_id = $1 AND is_active = true LIMIT 1",
    [tenantId],
  );

  return c.json({ branding: result.data?.rows[0] ?? null });
});

// PUT /api/v1/reports/branding — cria ou atualiza branding (upsert)
reportsRoute.put("/branding", requirePermission("reports:write"), async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;
  const body = await c.req.json();

  const {
    company_name, logo_url, logo_width, primary_color, secondary_color, accent_color,
    footer_text, footer_url, header_bg_color, header_text_color, font_family, is_active,
  } = body;

  if (!company_name || typeof company_name !== "string") {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "company_name é obrigatório" } }, 400);
  }

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
      tenantId, company_name, logo_url ?? null, logo_width ?? 180,
      primary_color ?? "#0d9488", secondary_color ?? "#1f2937", accent_color ?? "#3b82f6",
      footer_text ?? null, footer_url ?? null,
      header_bg_color ?? "#ffffff", header_text_color ?? "#1f2937",
      font_family ?? "Helvetica", is_active ?? true, user.sub,
    ],
  );

  await query(
    "SELECT public.write_audit_log($1, NULL, 'report.branding.update', 'report_branding', NULL, $2, NULL, NULL)",
    [user.sub, JSON.stringify({ id: result.data?.rows[0]?.id, company_name })],
  );

  return c.json({ id: result.data?.rows[0]?.id, updated: true });
});

// ========== Admin Delivery Control ==========

// GET /api/v1/reports/delivery-config — busca config de entrega do tenant
reportsRoute.get("/delivery-config", requirePermission("reports:read"), async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;

  const result = await query(
    "SELECT * FROM public.report_delivery_config WHERE tenant_id = $1 LIMIT 1",
    [tenantId],
  );

  return c.json({ config: result.data?.rows[0] ?? null });
});

// PUT /api/v1/reports/delivery-config — admin configura entrega (upsert)
reportsRoute.put("/delivery-config", requirePermission("reports:write"), async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;
  const body = await c.req.json();

  const {
    auto_reports_enabled, allowed_delivery_methods, default_delivery_method,
    email_from, email_subject_prefix, slack_webhook_url, teams_webhook_url,
    webhook_url, webhook_headers, monthly_report_limit,
  } = body;

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
      tenantId, auto_reports_enabled ?? false,
      allowed_delivery_methods ?? ["email"],
      default_delivery_method ?? "email",
      email_from ?? null, email_subject_prefix ?? "[Relatório]",
      slack_webhook_url ?? null, teams_webhook_url ?? null,
      webhook_url ?? null, JSON.stringify(webhook_headers ?? {}),
      monthly_report_limit ?? 0, user.sub,
    ],
  );

  await query(
    "SELECT public.write_audit_log($1, NULL, 'report.delivery_config.update', 'report_delivery_config', NULL, $2, NULL, NULL)",
    [user.sub, JSON.stringify({ id: result.data?.rows[0]?.id, auto_reports_enabled, default_delivery_method })],
  );

  return c.json({ id: result.data?.rows[0]?.id, updated: true });
});
