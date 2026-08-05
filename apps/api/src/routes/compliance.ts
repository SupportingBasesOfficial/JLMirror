// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import {
  createPolicySchema,
  updatePolicySchema,
  type CreatePolicyInput,
  type UpdatePolicyInput,
} from "@repo/shared-validation";
import { requirePermission } from "../middleware/require-permission.js";
import "../types.js";

export const complianceRoute = new Hono();

// GET /api/v1/compliance — overview do modulo
complianceRoute.get("/", requirePermission("compliance:read"), async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;

  const policiesResult = await query(
    "SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active = true) as active FROM public.compliance_policies WHERE tenant_id = $1",
    [tenantId],
  );

  return c.json({
    overview: {
      policies: policiesResult.data?.rows[0] ?? { total: "0", active: "0" },
    },
    endpoints: ["/policies", "/policies/:id"],
  });
});

// ========== Policies ==========

complianceRoute.get(
  "/policies",
  requirePermission("compliance:read"),
  async (c) => {
    const user = c.get("user");
    const framework = c.req.query("framework");
    const category = c.req.query("category");
    const activeOnly = c.req.query("active") === "true";

    const conditions: string[] = ["tenant_id = $1"];
    const params: unknown[] = [user?.tenant_id ?? null];
    let paramIdx = 2;

    if (framework) {
      conditions.push(`framework = $${paramIdx++}`);
      params.push(framework);
    }
    if (category) {
      conditions.push(`policy_category = $${paramIdx++}`);
      params.push(category);
    }
    if (activeOnly) {
      conditions.push(`is_active = true`);
    }

    const result = await query(
      `SELECT * FROM public.compliance_policies WHERE ${conditions.join(" AND ")} ORDER BY name`,
      params,
    );

    if (result.error) {
      return c.json(
        { error: { code: "QUERY_ERROR", message: "Erro ao buscar políticas" } },
        500,
      );
    }

    return c.json({ policies: result.data?.rows ?? [] });
  },
);

complianceRoute.post(
  "/policies",
  requirePermission("compliance:write"),
  async (c) => {
    const user = c.get("user");
    const body = await c.req.json<CreatePolicyInput>();
    const parsed = createPolicySchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } },
        400,
      );
    }

    const data = parsed.data;
    const result = await query<{ id: string }>(
      `INSERT INTO public.compliance_policies (tenant_id, name, description, framework, policy_category, severity, rule_type, rule_config, check_interval_hours, is_active, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
      [
        user?.tenant_id ?? null,
        data.name,
        data.description ?? null,
        data.framework,
        data.policy_category,
        data.severity,
        data.rule_type,
        JSON.stringify(data.rule_config),
        data.check_interval_hours,
        data.is_active,
        user.sub,
      ],
    );

    if (result.error || !result.data?.rows[0]) {
      return c.json(
        { error: { code: "CREATE_ERROR", message: "Erro ao criar política" } },
        500,
      );
    }

    await query(
      "SELECT public.write_audit_log($1, NULL, 'compliance.policy.create', 'compliance_policy', $2, $3, NULL, NULL)",
      [
        user.sub,
        result.data.rows[0].id,
        JSON.stringify({ name: data.name, framework: data.framework }),
      ],
    );

    return c.json({ id: result.data.rows[0].id }, 201);
  },
);

complianceRoute.put(
  "/policies/:id",
  requirePermission("compliance:write"),
  async (c) => {
    const policyId = c.req.param("id");
    const user = c.get("user");
    const body = await c.req.json<UpdatePolicyInput>();
    const parsed = updatePolicySchema.safeParse(body);
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
      framework: "framework",
      policy_category: "policy_category",
      severity: "severity",
      rule_type: "rule_type",
      check_interval_hours: "check_interval_hours",
      is_active: "is_active",
    };

    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (data[key as keyof typeof data] !== undefined) {
        updateFields.push(`${dbField} = $${paramIdx++}`);
        params.push(data[key as keyof typeof data]);
      }
    }

    if (data.rule_config !== undefined) {
      updateFields.push(`rule_config = $${paramIdx++}`);
      params.push(JSON.stringify(data.rule_config));
    }

    if (updateFields.length === 0) {
      return c.json({ id: policyId });
    }

    params.push(policyId, user?.tenant_id ?? null);

    await query(
      `UPDATE public.compliance_policies SET ${updateFields.join(", ")} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx++}`,
      params,
    );

    return c.json({ id: policyId });
  },
);

complianceRoute.delete(
  "/policies/:id",
  requirePermission("compliance:write"),
  async (c) => {
    const policyId = c.req.param("id");
    const user = c.get("user");

    await query(
      "DELETE FROM public.compliance_policies WHERE id = $1 AND tenant_id = $2",
      [policyId, user?.tenant_id ?? null],
    );

    await query(
      "SELECT public.write_audit_log($1, NULL, 'compliance.policy.delete', 'compliance_policy', $2, NULL, NULL, NULL)",
      [user.sub, policyId],
    );

    return c.json({ deleted: true });
  },
);

// ========== Scans ==========

complianceRoute.get(
  "/scans",
  requirePermission("compliance:read"),
  async (c) => {
    const user = c.get("user");
    const policyId = c.req.query("policy_id");
    const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 200);

    const conditions: string[] = ["tenant_id = $1"];
    const params: unknown[] = [user?.tenant_id ?? null];
    let paramIdx = 2;

    if (policyId) {
      conditions.push(`policy_id = $${paramIdx++}`);
      params.push(policyId);
    }

    params.push(limit);

    const result = await query(
      `SELECT s.*, p.name as policy_name, p.framework
     FROM public.compliance_scans s
     JOIN public.compliance_policies p ON s.policy_id = p.id
     WHERE ${conditions.join(" AND ")}
     ORDER BY s.created_at DESC LIMIT $${paramIdx++}`,
      params,
    );

    return c.json({ scans: result.data?.rows ?? [] });
  },
);

complianceRoute.post(
  "/scans",
  requirePermission("compliance:write"),
  async (c) => {
    const user = c.get("user");
    const body = await c.req.json<{ policy_id: string }>();

    if (!body.policy_id) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "policy_id é obrigatório",
          },
        },
        400,
      );
    }

    const policyResult = await query(
      "SELECT * FROM public.compliance_policies WHERE id = $1 AND tenant_id = $2 AND is_active = true",
      [body.policy_id, user?.tenant_id ?? null],
    );

    if (policyResult.error || !policyResult.data?.rows[0]) {
      return c.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Política não encontrada ou inativa",
          },
        },
        404,
      );
    }

    const policy = policyResult.data.rows[0] as {
      id: string;
      name: string;
      framework: string;
      severity: string;
      rule_type: string;
      rule_config: Record<string, unknown>;
    };

    const startTime = Date.now();

    const scanResult = await query<{ id: string }>(
      `INSERT INTO public.compliance_scans (tenant_id, policy_id, status, started_at, triggered_by)
     VALUES ($1, $2, 'running', timezone('utc'::text, now()), $3)
     RETURNING id`,
      [user?.tenant_id ?? null, body.policy_id, user.sub],
    );

    if (scanResult.error || !scanResult.data?.rows[0]) {
      return c.json(
        { error: { code: "CREATE_ERROR", message: "Erro ao iniciar scan" } },
        500,
      );
    }

    const scanId = scanResult.data.rows[0].id;

    // Execucao real de checks baseada em rule_config da politica
    const ruleConfig = policy.rule_config ?? {};
    const checks: {
      name: string;
      description: string;
      passed: boolean;
      remediation: string | null;
    }[] = [];

    // Check 1: Verifica se existem usuarios sem MFA habilitado
    if (ruleConfig.require_mfa === true) {
      const mfaResult = await query<{ count: string }>(
        "SELECT COUNT(*) as count FROM public.users WHERE mfa_enabled = false AND tenant_id = $1",
        [user?.tenant_id ?? null],
      );
      const usersWithoutMfa = parseInt(
        mfaResult.data?.rows[0]?.count ?? "0",
        10,
      );
      checks.push({
        name: "MFA enabled for all users",
        description: `Encontrados ${usersWithoutMfa} usuario(s) sem MFA`,
        passed: usersWithoutMfa === 0,
        remediation:
          usersWithoutMfa > 0
            ? "Habilite MFA para todos os usuarios ativos"
            : null,
      });
    }

    // Check 2: Verifica se SSL certificados estao validos
    if (ruleConfig.require_ssl_valid === true) {
      const sslResult = await query<{ count: string }>(
        "SELECT COUNT(*) as count FROM public.ssl_certificates_with_status WHERE tenant_id = $1 AND status IN ('expired', 'expiring_soon')",
        [user?.tenant_id ?? null],
      );
      const expiredSsl = parseInt(sslResult.data?.rows[0]?.count ?? "0", 10);
      checks.push({
        name: "SSL certificates valid",
        description: `Encontrados ${expiredSsl} certificado(s) expirado(s) ou proximos da expiracao`,
        passed: expiredSsl === 0,
        remediation:
          expiredSsl > 0
            ? "Renove os certificados SSL expirados ou proximos da expiracao"
            : null,
      });
    }

    // Check 3: Verifica se firewall tem regras ativas
    if (ruleConfig.require_firewall_active === true) {
      const fwResult = await query<{ count: string }>(
        "SELECT COUNT(*) as count FROM public.firewall_rules WHERE tenant_id = $1 AND is_enabled = true",
        [user?.tenant_id ?? null],
      );
      const activeRules = parseInt(fwResult.data?.rows[0]?.count ?? "0", 10);
      checks.push({
        name: "Firewall rules active",
        description: `${activeRules} regra(s) de firewall ativa(s)`,
        passed: activeRules > 0,
        remediation:
          activeRules === 0
            ? "Configure pelo menos uma regra de firewall ativa"
            : null,
      });
    }

    // Check 4: Verifica se backups recentes existem
    if (ruleConfig.require_recent_backup === true) {
      const backupResult = await query<{ count: string }>(
        "SELECT COUNT(*) as count FROM public.backup_snapshots WHERE tenant_id = $1 AND status = 'completed' AND created_at > timezone('utc'::text, now()) - interval '7 days'",
        [user?.tenant_id ?? null],
      );
      const recentBackups = parseInt(
        backupResult.data?.rows[0]?.count ?? "0",
        10,
      );
      checks.push({
        name: "Recent backup exists",
        description: `${recentBackups} backup(s) concluido(s) nos ultimos 7 dias`,
        passed: recentBackups > 0,
        remediation:
          recentBackups === 0 ? "Execute um backup completo do sistema" : null,
      });
    }

    // Check 5: Verifica se audit logging esta ativo (sempre avaliado)
    const auditResult = await query<{ count: string }>(
      "SELECT COUNT(*) as count FROM public.audit_log WHERE tenant_id = $1 AND created_at > timezone('utc'::text, now()) - interval '24 hours'",
      [user?.tenant_id ?? null],
    );
    const recentAuditLogs = parseInt(
      auditResult.data?.rows[0]?.count ?? "0",
      10,
    );
    checks.push({
      name: "Audit logging active",
      description: `${recentAuditLogs} log(s) de auditoria nas ultimas 24h`,
      passed: recentAuditLogs > 0,
      remediation:
        recentAuditLogs === 0
          ? "Verifique se o sistema de auditoria esta funcionando"
          : null,
    });

    // Se nenhum check foi configurado, usa apenas o check de auditoria
    const totalChecks = checks.length > 0 ? checks.length : 1;
    const passedChecks = checks.filter((ch) => ch.passed).length;
    const failedChecks = checks.filter((ch) => !ch.passed).length;
    const complianceScore =
      totalChecks > 0 ? (passedChecks / totalChecks) * 100 : 0;
    const durationMs = Date.now() - startTime;

    await query(
      `UPDATE public.compliance_scans
     SET status = 'completed', total_checks = $1, passed_checks = $2, failed_checks = $3,
         warning_checks = 0, compliance_score = $4, completed_at = timezone('utc'::text, now()), duration_ms = $5
     WHERE id = $6`,
      [
        totalChecks,
        passedChecks,
        failedChecks,
        complianceScore,
        durationMs,
        scanId,
      ],
    );

    // Atualiza last_scanned_at da política
    await query(
      "UPDATE public.compliance_policies SET last_scanned_at = timezone('utc'::text, now()) WHERE id = $1",
      [body.policy_id],
    );

    // Cria violacoes reais para checks falhados
    for (const check of checks) {
      if (!check.passed) {
        await query(
          `INSERT INTO public.compliance_violations (tenant_id, scan_id, policy_id, check_name, check_description, severity, status, remediation_steps)
         VALUES ($1, $2, $3, $4, $5, $6, 'open', $7)`,
          [
            user?.tenant_id ?? null,
            scanId,
            body.policy_id,
            check.name,
            check.description,
            policy.severity,
            check.remediation ??
              "Revise a configuracao e aplique as correcoes necessarias.",
          ],
        );
      }
    }

    await query(
      "SELECT public.write_audit_log($1, NULL, 'compliance.scan.run', 'compliance_scan', $2, $3, NULL, NULL)",
      [
        user.sub,
        scanId,
        JSON.stringify({
          policy: policy.name,
          framework: policy.framework,
          score: complianceScore,
        }),
      ],
    );

    return c.json(
      {
        id: scanId,
        status: "completed",
        total_checks: totalChecks,
        passed_checks: passedChecks,
        failed_checks: failedChecks,
        compliance_score: complianceScore,
        duration_ms: durationMs,
      },
      201,
    );
  },
);

// ========== Violations ==========

complianceRoute.get(
  "/violations",
  requirePermission("compliance:read"),
  async (c) => {
    const user = c.get("user");
    const status = c.req.query("status");
    const severity = c.req.query("severity");
    const policyId = c.req.query("policy_id");
    const limit = Math.min(parseInt(c.req.query("limit") ?? "100", 10), 500);

    const conditions: string[] = ["v.tenant_id = $1"];
    const params: unknown[] = [user?.tenant_id ?? null];
    let paramIdx = 2;

    if (status) {
      conditions.push(`v.status = $${paramIdx++}`);
      params.push(status);
    }
    if (severity) {
      conditions.push(`v.severity = $${paramIdx++}`);
      params.push(severity);
    }
    if (policyId) {
      conditions.push(`v.policy_id = $${paramIdx++}`);
      params.push(policyId);
    }

    params.push(limit);

    const result = await query(
      `SELECT v.*, p.name as policy_name, p.framework
     FROM public.compliance_violations v
     JOIN public.compliance_policies p ON v.policy_id = p.id
     WHERE ${conditions.join(" AND ")}
     ORDER BY
       CASE v.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
       v.created_at DESC
     LIMIT $${paramIdx++}`,
      params,
    );

    return c.json({ violations: result.data?.rows ?? [] });
  },
);

complianceRoute.put(
  "/violations/:id",
  requirePermission("compliance:write"),
  async (c) => {
    const violationId = c.req.param("id");
    const user = c.get("user");
    const body = await c.req.json<{ status: string }>();

    const validStatuses = [
      "open",
      "acknowledged",
      "remediated",
      "false_positive",
      "wont_fix",
    ];
    if (!validStatuses.includes(body.status)) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "Status inválido" } },
        400,
      );
    }

    const updateFields: string[] = ["status = $1"];
    const params: unknown[] = [body.status];
    let paramIdx = 2;

    if (body.status === "acknowledged") {
      updateFields.push(
        `acknowledged_by = $${paramIdx++}`,
        `acknowledged_at = timezone('utc'::text, now())`,
      );
      params.push(user.sub);
    } else if (body.status === "remediated") {
      updateFields.push(
        `remediated_by = $${paramIdx++}`,
        `remediated_at = timezone('utc'::text, now())`,
      );
      params.push(user.sub);
    }

    params.push(violationId, user?.tenant_id ?? null);

    await query(
      `UPDATE public.compliance_violations SET ${updateFields.join(", ")} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx++}`,
      params,
    );

    await query(
      "SELECT public.write_audit_log($1, NULL, 'compliance.violation.update', 'compliance_violation', $2, $3, NULL, NULL)",
      [user.sub, violationId, JSON.stringify({ status: body.status })],
    );

    return c.json({ id: violationId, status: body.status });
  },
);

// ========== Stats ==========

complianceRoute.get(
  "/stats",
  requirePermission("compliance:read"),
  async (c) => {
    const user = c.get("user");

    const overviewResult = await query(
      `SELECT
       COUNT(*) FILTER (WHERE is_active = true) as active_policies,
       COUNT(*) as total_policies,
       COUNT(DISTINCT framework) as frameworks_covered
     FROM public.compliance_policies WHERE tenant_id = $1`,
      [user?.tenant_id ?? null],
    );

    const violationsResult = await query(
      `SELECT
       COUNT(*) FILTER (WHERE status = 'open') as open_violations,
       COUNT(*) FILTER (WHERE status = 'open' AND severity = 'critical') as critical_open,
       COUNT(*) FILTER (WHERE status = 'open' AND severity = 'high') as high_open,
       COUNT(*) FILTER (WHERE status = 'remediated') as remediated,
       COUNT(*) as total_violations
     FROM public.compliance_violations WHERE tenant_id = $1`,
      [user?.tenant_id ?? null],
    );

    const frameworkResult = await query(
      `SELECT p.framework,
       COUNT(DISTINCT p.id) as policy_count,
       COUNT(DISTINCT v.id) FILTER (WHERE v.status = 'open') as open_violations,
       COUNT(DISTINCT v.id) FILTER (WHERE v.status = 'remediated') as remediated
     FROM public.compliance_policies p
     LEFT JOIN public.compliance_violations v ON p.id = v.policy_id
     WHERE p.tenant_id = $1
     GROUP BY p.framework ORDER BY open_violations DESC`,
      [user?.tenant_id ?? null],
    );

    const recentScansResult = await query(
      `SELECT
       COUNT(*) as total_scans,
       AVG(compliance_score) FILTER (WHERE status = 'completed') as avg_score,
       MAX(compliance_score) FILTER (WHERE status = 'completed') as best_score,
       MIN(compliance_score) FILTER (WHERE status = 'completed') as worst_score
     FROM public.compliance_scans WHERE tenant_id = $1 AND created_at > timezone('utc'::text, now()) - INTERVAL '30 days'`,
      [user?.tenant_id ?? null],
    );

    return c.json({
      overview: overviewResult.data?.rows[0] ?? {
        active_policies: "0",
        total_policies: "0",
        frameworks_covered: "0",
      },
      violations: violationsResult.data?.rows[0] ?? {
        open_violations: "0",
        critical_open: "0",
        high_open: "0",
        remediated: "0",
        total_violations: "0",
      },
      by_framework: frameworkResult.data?.rows ?? [],
      scans: recentScansResult.data?.rows[0] ?? {
        total_scans: "0",
        avg_score: null,
        best_score: null,
        worst_score: null,
      },
    });
  },
);
