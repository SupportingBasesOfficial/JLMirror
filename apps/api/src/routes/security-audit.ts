// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { z } from "zod";
import { requirePermission } from "../middleware/require-permission.js";
import { httpCache } from "../middleware/http-cache.js";
import "../types.js";

export const securityAuditRoute = new Hono();

// GET /api/v1/security-audit — overview do modulo
securityAuditRoute.get("/", requirePermission("compliance:read"), async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;

  const rulesResult = await query(
    "SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active = true) as active FROM public.security_audit_rules WHERE tenant_id = $1",
    [tenantId],
  );
  const findingsResult = await query(
    "SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'open') as open FROM public.security_audit_findings WHERE tenant_id = $1",
    [tenantId],
  );

  return c.json({
    overview: {
      rules: rulesResult.data?.rows[0] ?? { total: "0", active: "0" },
      findings: findingsResult.data?.rows[0] ?? { total: "0", open: "0" },
    },
    endpoints: ["/rules", "/findings", "/scans", "/summary"],
  });
});

const categorySchema = z.enum([
  "access_control",
  "encryption",
  "compliance",
  "vulnerability",
  "configuration",
  "network",
  "data_protection",
]);
const severitySchema = z.enum(["info", "low", "medium", "high", "critical"]);
const checkTypeSchema = z.enum([
  "sql_query",
  "config_check",
  "ssl_check",
  "password_policy",
  "rls_check",
  "session_check",
  "custom",
]);

const createRuleSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  category: categorySchema,
  severity: severitySchema,
  check_type: checkTypeSchema,
  check_query: z.string().max(5000).optional(),
  check_config: z.record(z.string(), z.unknown()).optional(),
  expected_result: z.string().max(100).optional(),
  remediation: z.string().max(5000).optional(),
  is_active: z.boolean().default(true),
});

// GET /api/v1/security-audit/rules — lista regras de auditoria
securityAuditRoute.get(
  "/rules",
  requirePermission("compliance:read"),
  async (c) => {
    const user = c.get("user");
    const category = c.req.query("category");
    const activeOnly = c.req.query("active") === "true";

    const conditions: string[] = ["(tenant_id = $1 OR tenant_id IS NULL)"];
    const params: unknown[] = [user?.tenant_id ?? null];
    let paramIdx = 2;

    if (category) {
      conditions.push(`category = $${paramIdx++}`);
      params.push(category);
    }
    if (activeOnly) {
      conditions.push("is_active = true");
    }

    const result = await query(
      `SELECT * FROM public.security_audit_rules WHERE ${conditions.join(" AND ")} ORDER BY
       CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END,
       name ASC`,
      params,
    );

    return c.json({ rules: result.data?.rows ?? [] });
  },
);

// POST /api/v1/security-audit/rules — cria regra
securityAuditRoute.post(
  "/rules",
  requirePermission("compliance:write"),
  async (c) => {
    const user = c.get("user");
    const body = await c.req.json();
    const parsed = createRuleSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Dados inválidos",
          },
        },
        400,
      );
    }

    const data = parsed.data;
    const result = await query<{ id: string }>(
      `INSERT INTO public.security_audit_rules (tenant_id, name, description, category, severity, check_type, check_query, check_config, expected_result, remediation, is_active, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
      [
        user?.tenant_id ?? null,
        data.name,
        data.description ?? null,
        data.category,
        data.severity,
        data.check_type,
        data.check_query ?? null,
        JSON.stringify(data.check_config ?? {}),
        data.expected_result ?? null,
        data.remediation ?? null,
        data.is_active,
        user.sub,
      ],
    );

    if (result.error || !result.data?.rows[0]) {
      return c.json(
        { error: { code: "CREATE_ERROR", message: "Erro ao criar regra" } },
        500,
      );
    }

    await query(
      "SELECT public.write_audit_log($1, NULL, 'audit.rule.create', 'security_audit_rules', NULL, $2, NULL, NULL)",
      [
        user.sub,
        JSON.stringify({ id: result.data.rows[0].id, name: data.name }),
      ],
    );

    return c.json({ id: result.data.rows[0].id }, 201);
  },
);

// PUT /api/v1/security-audit/rules/:id — atualiza regra
securityAuditRoute.put(
  "/rules/:id",
  requirePermission("compliance:write"),
  async (c) => {
    const ruleId = c.req.param("id");
    const user = c.get("user");
    const body = await c.req.json();
    const parsed = createRuleSchema.partial().safeParse(body);
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
      category: "category",
      severity: "severity",
      check_type: "check_type",
      check_query: "check_query",
      expected_result: "expected_result",
      remediation: "remediation",
      is_active: "is_active",
    };

    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (data[key as keyof typeof data] !== undefined) {
        updateFields.push(`${dbField} = $${paramIdx++}`);
        params.push(data[key as keyof typeof data]);
      }
    }

    if (data.check_config !== undefined) {
      updateFields.push(`check_config = $${paramIdx++}`);
      params.push(JSON.stringify(data.check_config));
    }

    if (updateFields.length === 0) {
      return c.json({ id: ruleId });
    }

    params.push(ruleId, user?.tenant_id ?? null);
    await query(
      `UPDATE public.security_audit_rules SET ${updateFields.join(", ")} WHERE id = $${paramIdx++} AND (tenant_id = $${paramIdx++} OR tenant_id IS NULL)`,
      params,
    );

    return c.json({ id: ruleId, updated: true });
  },
);

// DELETE /api/v1/security-audit/rules/:id — remove regra
securityAuditRoute.delete(
  "/rules/:id",
  requirePermission("compliance:write"),
  async (c) => {
    const ruleId = c.req.param("id");
    const user = c.get("user");

    await query(
      "DELETE FROM public.security_audit_rules WHERE id = $1 AND tenant_id = $2",
      [ruleId, user?.tenant_id ?? null],
    );

    return c.json({ deleted: true });
  },
);

// POST /api/v1/security-audit/scan — executa scan de auditoria
securityAuditRoute.post(
  "/scan",
  requirePermission("compliance:write"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const startTime = Date.now();

    // Cria registro de scan
    const scanResult = await query<{ id: string }>(
      `INSERT INTO public.security_audit_scans (tenant_id, status, started_at, created_by)
     VALUES ($1, 'running', timezone('utc'::text, now()), $2) RETURNING id`,
      [tenantId, user.sub],
    );

    const scanId = scanResult.data?.rows[0]?.id;
    if (!scanId) {
      return c.json(
        { error: { code: "CREATE_ERROR", message: "Erro ao criar scan" } },
        500,
      );
    }

    try {
      // Busca regras ativas
      const rulesResult = await query<{
        id: string;
        check_type: string;
        check_query: string | null;
        expected_result: string | null;
        severity: string;
        rule_id: string;
        title: string;
        description: string | null;
      }>(
        "SELECT * FROM public.security_audit_rules WHERE (tenant_id = $1 OR tenant_id IS NULL) AND is_active = true",
        [tenantId],
      );

      const rules = rulesResult.data?.rows ?? [];
      let totalFindings = 0;
      let criticalFindings = 0;
      let highFindings = 0;
      let mediumFindings = 0;
      let lowFindings = 0;

      for (const rule of rules) {
        if (rule.check_type === "sql_query" && rule.check_query) {
          try {
            const checkResult = await query(rule.check_query, []);
            const rows = checkResult.data?.rows ?? [];
            const count =
              rows.length > 0
                ? parseInt((rows[0].count as string) ?? String(rows.length), 10)
                : 0;
            const expected = parseInt(rule.expected_result ?? "0", 10);

            if (count > expected) {
              // Finding detectado
              const findingResult = await query<{ id: string }>(
                `INSERT INTO public.security_audit_findings (tenant_id, rule_id, scan_id, status, severity, finding_data, affected_resource)
               VALUES ($1, $2, $3, 'open', $4, $5, $6) RETURNING id`,
                [
                  tenantId,
                  rule.id,
                  scanId,
                  rule.severity,
                  JSON.stringify({ count, expected, query: rule.check_query }),
                  `${count} recursos afetados`,
                ],
              );

              if (findingResult.data?.rows[0]) {
                totalFindings++;
                if (rule.severity === "critical") criticalFindings++;
                else if (rule.severity === "high") highFindings++;
                else if (rule.severity === "medium") mediumFindings++;
                else if (rule.severity === "low") lowFindings++;
              }
            }
          } catch {
            // Ignora erros de query individual
          }
        } else if (rule.check_type === "rls_check" && rule.check_query) {
          try {
            const rlsResult = await query(rule.check_query, []);
            const rlsRows = rlsResult.data?.rows ?? [];
            if (rlsRows.length > 0) {
              const findingResult = await query<{ id: string }>(
                `INSERT INTO public.security_audit_findings (tenant_id, rule_id, scan_id, status, severity, finding_data, affected_resource)
               VALUES ($1, $2, $3, 'open', $4, $5, $6) RETURNING id`,
                [
                  tenantId,
                  rule.id,
                  scanId,
                  rule.severity,
                  JSON.stringify({
                    tables_without_rls: rlsRows.map((r) => r.relname),
                  }),
                  `${rlsRows.length} tabelas sem RLS`,
                ],
              );

              if (findingResult.data?.rows[0]) {
                totalFindings++;
                if (rule.severity === "critical") criticalFindings++;
                else if (rule.severity === "high") highFindings++;
                else if (rule.severity === "medium") mediumFindings++;
                else if (rule.severity === "low") lowFindings++;
              }
            }
          } catch {
            // Ignora erros
          }
        }
      }

      const durationMs = Date.now() - startTime;

      await query(
        `UPDATE public.security_audit_scans SET
         status = 'completed', total_rules = $1, executed_rules = $2,
         total_findings = $3, critical_findings = $4, high_findings = $5,
         medium_findings = $6, low_findings = $7,
         completed_at = timezone('utc'::text, now()), duration_ms = $8
       WHERE id = $9`,
        [
          rules.length,
          rules.length,
          totalFindings,
          criticalFindings,
          highFindings,
          mediumFindings,
          lowFindings,
          durationMs,
          scanId,
        ],
      );

      await query(
        "SELECT public.write_audit_log($1, NULL, 'audit.scan', 'security_audit_scans', NULL, $2, NULL, NULL)",
        [
          user.sub,
          JSON.stringify({
            scan_id: scanId,
            findings: totalFindings,
            critical: criticalFindings,
          }),
        ],
      );

      return c.json({
        scan_id: scanId,
        status: "completed",
        total_rules: rules.length,
        total_findings: totalFindings,
        critical: criticalFindings,
        high: highFindings,
        medium: mediumFindings,
        low: lowFindings,
        duration_ms: durationMs,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Erro desconhecido";
      const durationMs = Date.now() - startTime;

      await query(
        "UPDATE public.security_audit_scans SET status = 'failed', error_message = $1, duration_ms = $2, completed_at = timezone('utc'::text, now()) WHERE id = $3",
        [errorMsg, durationMs, scanId],
      );

      return c.json({ error: { code: "SCAN_ERROR", message: errorMsg } }, 500);
    }
  },
);

// GET /api/v1/security-audit/findings — lista findings
securityAuditRoute.get(
  "/findings",
  requirePermission("compliance:read"),
  httpCache(30),
  async (c) => {
    const user = c.get("user");
    const status = c.req.query("status");
    const severity = c.req.query("severity");
    const limit = Math.min(parseInt(c.req.query("limit") ?? "100", 10), 500);

    const conditions: string[] = ["f.tenant_id = $1"];
    const params: unknown[] = [user?.tenant_id ?? null];
    let paramIdx = 2;

    if (status) {
      conditions.push(`f.status = $${paramIdx++}`);
      params.push(status);
    }
    if (severity) {
      conditions.push(`f.severity = $${paramIdx++}`);
      params.push(severity);
    }
    params.push(limit);

    const result = await query(
      `SELECT f.*, r.name as rule_name, r.category as rule_category, r.remediation as rule_remediation
     FROM public.security_audit_findings f
     JOIN public.security_audit_rules r ON f.rule_id = r.id
     WHERE ${conditions.join(" AND ")}
     ORDER BY
       CASE f.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END,
       f.detected_at DESC
     LIMIT $${paramIdx++}`,
      params,
    );

    return c.json({ findings: result.data?.rows ?? [] });
  },
);

// POST /api/v1/security-audit/findings/:id/remediate — marca finding como remediado
securityAuditRoute.post(
  "/findings/:id/remediate",
  requirePermission("compliance:write"),
  async (c) => {
    const findingId = c.req.param("id");
    const user = c.get("user");
    const body = await c.req
      .json<{ notes?: string }>()
      .catch(() => ({ notes: undefined }));

    await query(
      "UPDATE public.security_audit_findings SET status = 'remediated', resolved_at = timezone('utc'::text, now()), resolved_by = $1, remediation_notes = $2 WHERE id = $3 AND tenant_id = $4",
      [user.sub, body.notes ?? null, findingId, user?.tenant_id ?? null],
    );

    await query(
      "SELECT public.write_audit_log($1, NULL, 'audit.finding.remediate', 'security_audit_findings', $2, $3, NULL, NULL)",
      [user.sub, findingId, JSON.stringify({ notes: body.notes })],
    );

    return c.json({ remediated: true });
  },
);

// POST /api/v1/security-audit/findings/:id/false-positive — marca como falso positivo
securityAuditRoute.post(
  "/findings/:id/false-positive",
  requirePermission("compliance:write"),
  async (c) => {
    const findingId = c.req.param("id");
    const user = c.get("user");

    await query(
      "UPDATE public.security_audit_findings SET status = 'false_positive', resolved_at = timezone('utc'::text, now()), resolved_by = $1 WHERE id = $2 AND tenant_id = $3",
      [user.sub, findingId, user?.tenant_id ?? null],
    );

    return c.json({ updated: true });
  },
);

// GET /api/v1/security-audit/scans — histórico de scans
securityAuditRoute.get(
  "/scans",
  requirePermission("compliance:read"),
  async (c) => {
    const user = c.get("user");

    const result = await query(
      "SELECT * FROM public.security_audit_scans WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 20",
      [user?.tenant_id ?? null],
    );

    return c.json({ scans: result.data?.rows ?? [] });
  },
);

// GET /api/v1/security-audit/summary — resumo do dashboard
securityAuditRoute.get(
  "/summary",
  requirePermission("compliance:read"),
  httpCache(30),
  async (c) => {
    const user = c.get("user");

    const findingsResult = await query(
      `SELECT
       COUNT(*) FILTER (WHERE status = 'open') as open,
       COUNT(*) FILTER (WHERE status = 'open' AND severity = 'critical') as critical_open,
       COUNT(*) FILTER (WHERE status = 'open' AND severity = 'high') as high_open,
       COUNT(*) FILTER (WHERE status = 'open' AND severity = 'medium') as medium_open,
       COUNT(*) FILTER (WHERE status = 'open' AND severity = 'low') as low_open,
       COUNT(*) FILTER (WHERE status = 'remediated') as remediated,
       COUNT(*) FILTER (WHERE status = 'false_positive') as false_positive,
       COUNT(*) as total
     FROM public.security_audit_findings WHERE tenant_id = $1`,
      [user?.tenant_id ?? null],
    );

    const rulesResult = await query(
      "SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active = true) as active FROM public.security_audit_rules WHERE tenant_id = $1 OR tenant_id IS NULL",
      [user?.tenant_id ?? null],
    );

    const lastScan = await query(
      "SELECT * FROM public.security_audit_scans WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1",
      [user?.tenant_id ?? null],
    );

    return c.json({
      findings: findingsResult.data?.rows[0] ?? {
        open: "0",
        critical_open: "0",
        high_open: "0",
        medium_open: "0",
        low_open: "0",
        remediated: "0",
        false_positive: "0",
        total: "0",
      },
      rules: rulesResult.data?.rows[0] ?? { total: "0", active: "0" },
      last_scan: lastScan.data?.rows[0] ?? null,
    });
  },
);
