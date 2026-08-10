// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { logger } from "@repo/logger";
import {
  createPolicySchema,
  updatePolicySchema,
  createScanSchema,
  updateViolationSchema,
  type CreatePolicyInput,
  type UpdatePolicyInput,
} from "@repo/shared-validation";
import { requirePermission } from "../middleware/require-permission.js";
import { rateLimitWrite } from "../middleware/rate-limit.js";
import { httpCache } from "../middleware/http-cache.js";
import { safeJsonBody } from "../lib/safe-json.js";
import { writeAuditLog } from "../lib/audit.js";
import "../types.js";

export const complianceRoute = new Hono();

// Helper: converte string de COUNT(*) para number seguro
function safeCount(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "0", 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

// GET /api/v1/compliance — overview do modulo
complianceRoute.get(
  "/",
  requirePermission("compliance:read"),
  httpCache(30),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const policiesResult = await query(
        "SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active = true) as active FROM public.compliance_policies WHERE tenant_id = $1",
        [tenantId],
      );

      return c.json({
        overview: {
          policies: policiesResult.data?.rows[0] ?? { total: "0", active: "0" },
        },
        endpoints: [
          "/policies",
          "/policies/:id",
          "/scans",
          "/violations",
          "/stats",
        ],
      });
    } catch (error) {
      logger.error("Erro ao buscar compliance overview", {
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

// ========== Policies ==========

complianceRoute.get(
  "/policies",
  requirePermission("compliance:read"),
  httpCache(30),
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

    try {
      const result = await query(
        `SELECT * FROM public.compliance_policies WHERE ${conditions.join(" AND ")} ORDER BY name`,
        params,
      );

      if (result.error) {
        return c.json(
          {
            error: { code: "QUERY_ERROR", message: "Erro ao buscar políticas" },
          },
          500,
        );
      }

      return c.json({ policies: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro ao listar policies", {
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

complianceRoute.post(
  "/policies",
  requirePermission("compliance:write"),
  rateLimitWrite,
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const userId = user?.sub ?? null;

    try {
      const parsedBody = await safeJsonBody(c);
      if (!parsedBody.success) return parsedBody.response;
      const parsed = createPolicySchema.safeParse(parsedBody.data);
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

      const data = parsed.data as CreatePolicyInput;

      const result = await query<{ id: string }>(
        `INSERT INTO public.compliance_policies (tenant_id, name, description, framework, policy_category, severity, rule_type, rule_config, check_interval_hours, is_active, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id`,
        [
          tenantId,
          data.name,
          data.description ?? null,
          data.framework,
          data.policy_category ?? null,
          data.severity,
          data.rule_type,
          JSON.stringify(data.rule_config ?? {}),
          data.check_interval_hours,
          data.is_active,
          userId,
        ],
      );

      if (result.error || !result.data?.rows[0]) {
        return c.json(
          {
            error: { code: "CREATE_ERROR", message: "Erro ao criar política" },
          },
          500,
        );
      }

      const policyId = result.data.rows[0].id;

      if (userId) {
        try {
          await writeAuditLog({
            userId,
            tenantId,
            action: "compliance.policy.create",
            entityType: "compliance_policy",
            entityId: policyId,
            newData: { name: data.name, framework: data.framework },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Compliance policy criada", { policyId, tenantId });

      return c.json({ id: policyId }, 201);
    } catch (error) {
      logger.error("Erro ao criar policy", {
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "CREATE_ERROR", message: "Erro ao criar" } },
        500,
      );
    }
  },
);

complianceRoute.put(
  "/policies/:id",
  requirePermission("compliance:write"),
  rateLimitWrite,
  async (c) => {
    const policyId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const parsedBody = await safeJsonBody(c);
      if (!parsedBody.success) return parsedBody.response;
      const parsed = updatePolicySchema.safeParse(parsedBody.data);
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

      const data = parsed.data as UpdatePolicyInput;
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
        return c.json(
          {
            error: { code: "VALIDATION_ERROR", message: "Nada para atualizar" },
          },
          400,
        );
      }

      params.push(policyId, tenantId);

      const result = await query(
        `UPDATE public.compliance_policies SET ${updateFields.join(", ")} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx++}`,
        params,
      );

      if (result.data?.rowCount === 0) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Política não encontrada" } },
          404,
        );
      }

      logger.info("Compliance policy atualizada", { policyId, tenantId });

      return c.json({ id: policyId });
    } catch (error) {
      logger.error("Erro ao atualizar policy", {
        policyId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "UPDATE_ERROR", message: "Erro ao atualizar" } },
        500,
      );
    }
  },
);

complianceRoute.delete(
  "/policies/:id",
  requirePermission("compliance:write"),
  rateLimitWrite,
  async (c) => {
    const policyId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const userId = user?.sub ?? null;

    try {
      const result = await query(
        "DELETE FROM public.compliance_policies WHERE id = $1 AND tenant_id = $2",
        [policyId, tenantId],
      );

      if (result.data?.rowCount === 0) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Política não encontrada" } },
          404,
        );
      }

      if (userId) {
        try {
          await writeAuditLog({
            userId,
            tenantId,
            action: "compliance.policy.delete",
            entityType: "compliance_policy",
            entityId: policyId,
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Compliance policy removida", { policyId, tenantId });

      return c.json({ deleted: true });
    } catch (error) {
      logger.error("Erro ao remover policy", {
        policyId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "DELETE_ERROR", message: "Erro ao remover" } },
        500,
      );
    }
  },
);

// ========== Scans ==========

complianceRoute.get(
  "/scans",
  requirePermission("compliance:read"),
  httpCache(30),
  async (c) => {
    const user = c.get("user");
    const policyId = c.req.query("policy_id");
    const parsedLimit = Number.parseInt(c.req.query("limit") ?? "50", 10);
    const limit = Math.min(Number.isNaN(parsedLimit) ? 50 : parsedLimit, 200);

    const conditions: string[] = ["tenant_id = $1"];
    const params: unknown[] = [user?.tenant_id ?? null];
    let paramIdx = 2;

    if (policyId) {
      conditions.push(`policy_id = $${paramIdx++}`);
      params.push(policyId);
    }

    params.push(limit);

    try {
      const result = await query(
        `SELECT s.*, p.name as policy_name, p.framework
         FROM public.compliance_scans s
         JOIN public.compliance_policies p ON s.policy_id = p.id
         WHERE ${conditions.join(" AND ")}
         ORDER BY s.created_at DESC LIMIT $${paramIdx++}`,
        params,
      );

      return c.json({ scans: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro ao listar scans", {
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

complianceRoute.post(
  "/scans",
  requirePermission("compliance:write"),
  rateLimitWrite,
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const userId = user?.sub ?? null;

    try {
      const parsedBody = await safeJsonBody(c);
      if (!parsedBody.success) return parsedBody.response;
      const parsed = createScanSchema.safeParse(parsedBody.data);
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

      const policyResult = await query(
        "SELECT * FROM public.compliance_policies WHERE id = $1 AND tenant_id = $2 AND is_active = true",
        [parsed.data.policy_id, tenantId],
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
        [tenantId, parsed.data.policy_id, userId],
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

      // Paraleliza todos os checks condicionais
      const checkPromises: Promise<void>[] = [];

      if (ruleConfig.require_mfa === true) {
        checkPromises.push(
          (async () => {
            const mfaResult = await query<{ count: string }>(
              "SELECT COUNT(*) as count FROM public.users WHERE mfa_enabled = false AND tenant_id = $1",
              [tenantId],
            );
            const usersWithoutMfa = safeCount(
              mfaResult.data?.rows[0]?.count as string | undefined,
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
          })(),
        );
      }

      if (ruleConfig.require_ssl_valid === true) {
        checkPromises.push(
          (async () => {
            const sslResult = await query<{ count: string }>(
              "SELECT COUNT(*) as count FROM public.ssl_certificates_with_status WHERE tenant_id = $1 AND status IN ('expired', 'expiring_soon')",
              [tenantId],
            );
            const expiredSsl = safeCount(
              sslResult.data?.rows[0]?.count as string | undefined,
            );
            checks.push({
              name: "SSL certificates valid",
              description: `Encontrados ${expiredSsl} certificado(s) expirado(s) ou proximos da expiracao`,
              passed: expiredSsl === 0,
              remediation:
                expiredSsl > 0
                  ? "Renove os certificados SSL expirados ou proximos da expiracao"
                  : null,
            });
          })(),
        );
      }

      if (ruleConfig.require_firewall_active === true) {
        checkPromises.push(
          (async () => {
            const fwResult = await query<{ count: string }>(
              "SELECT COUNT(*) as count FROM public.firewall_rules WHERE tenant_id = $1 AND is_enabled = true",
              [tenantId],
            );
            const activeRules = safeCount(
              fwResult.data?.rows[0]?.count as string | undefined,
            );
            checks.push({
              name: "Firewall rules active",
              description: `${activeRules} regra(s) de firewall ativa(s)`,
              passed: activeRules > 0,
              remediation:
                activeRules === 0
                  ? "Configure pelo menos uma regra de firewall ativa"
                  : null,
            });
          })(),
        );
      }

      if (ruleConfig.require_recent_backup === true) {
        checkPromises.push(
          (async () => {
            const backupResult = await query<{ count: string }>(
              "SELECT COUNT(*) as count FROM public.backup_snapshots WHERE tenant_id = $1 AND status = 'completed' AND created_at > timezone('utc'::text, now()) - interval '7 days'",
              [tenantId],
            );
            const recentBackups = safeCount(
              backupResult.data?.rows[0]?.count as string | undefined,
            );
            checks.push({
              name: "Recent backup exists",
              description: `${recentBackups} backup(s) concluido(s) nos ultimos 7 dias`,
              passed: recentBackups > 0,
              remediation:
                recentBackups === 0
                  ? "Execute um backup completo do sistema"
                  : null,
            });
          })(),
        );
      }

      // Check 5: Audit logging (sempre avaliado)
      checkPromises.push(
        (async () => {
          const auditResult = await query<{ count: string }>(
            "SELECT COUNT(*) as count FROM public.audit_log WHERE tenant_id = $1 AND created_at > timezone('utc'::text, now()) - interval '24 hours'",
            [tenantId],
          );
          const recentAuditLogs = safeCount(
            auditResult.data?.rows[0]?.count as string | undefined,
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
        })(),
      );

      // Executa todos os checks em paralelo
      await Promise.all(checkPromises);

      const totalChecks = checks.length > 0 ? checks.length : 1;
      const passedChecks = checks.filter((ch) => ch.passed).length;
      const failedChecks = checks.filter((ch) => !ch.passed).length;
      const complianceScore =
        totalChecks > 0 ? (passedChecks / totalChecks) * 100 : 0;
      const durationMs = Date.now() - startTime;

      // Paraleliza: update scan + update policy last_scanned
      await Promise.all([
        query(
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
        ),
        query(
          "UPDATE public.compliance_policies SET last_scanned_at = timezone('utc'::text, now()) WHERE id = $1",
          [parsed.data.policy_id],
        ),
      ]);

      // Bulk INSERT das violacoes para checks falhados
      const failedCheckList = checks.filter((c) => !c.passed);
      if (failedCheckList.length > 0) {
        const vValues: string[] = [];
        const vParams: unknown[] = [];
        let vIdx = 1;
        for (const check of failedCheckList) {
          vValues.push(
            `($${vIdx},$${vIdx + 1},$${vIdx + 2},$${vIdx + 3},$${vIdx + 4},$${vIdx + 5},'open',$${vIdx + 6})`,
          );
          vParams.push(
            tenantId,
            scanId,
            parsed.data.policy_id,
            check.name,
            check.description,
            policy.severity,
            check.remediation ??
              "Revise a configuracao e aplique as correcoes necessarias.",
          );
          vIdx += 7;
        }
        await query(
          `INSERT INTO public.compliance_violations (tenant_id, scan_id, policy_id, check_name, check_description, severity, status, remediation_steps)
           VALUES ${vValues.join(",")}`,
          vParams,
        );
      }

      if (userId) {
        try {
          await writeAuditLog({
            userId,
            tenantId,
            action: "compliance.scan.run",
            entityType: "compliance_scan",
            entityId: scanId,
            newData: {
              policy: policy.name,
              framework: policy.framework,
              score: complianceScore,
            },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Compliance scan executado", {
        scanId,
        policyId: parsed.data.policy_id,
        score: complianceScore,
        tenantId,
      });

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
    } catch (error) {
      logger.error("Erro ao executar scan", {
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "SCAN_ERROR", message: "Erro ao executar scan" } },
        500,
      );
    }
  },
);

// ========== Violations ==========

complianceRoute.get(
  "/violations",
  requirePermission("compliance:read"),
  httpCache(30),
  async (c) => {
    const user = c.get("user");
    const status = c.req.query("status");
    const severity = c.req.query("severity");
    const policyId = c.req.query("policy_id");
    const parsedLimit = Number.parseInt(c.req.query("limit") ?? "100", 10);
    const limit = Math.min(Number.isNaN(parsedLimit) ? 100 : parsedLimit, 500);

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

    try {
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
    } catch (error) {
      logger.error("Erro ao listar violations", {
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

complianceRoute.put(
  "/violations/:id",
  requirePermission("compliance:write"),
  rateLimitWrite,
  async (c) => {
    const violationId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const userId = user?.sub ?? null;

    try {
      const parsedBody = await safeJsonBody(c);
      if (!parsedBody.success) return parsedBody.response;
      const parsed = updateViolationSchema.safeParse(parsedBody.data);
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

      const updateFields: string[] = ["status = $1"];
      const params: unknown[] = [parsed.data.status];
      let paramIdx = 2;

      if (parsed.data.status === "acknowledged") {
        updateFields.push(
          `acknowledged_by = $${paramIdx++}`,
          `acknowledged_at = timezone('utc'::text, now())`,
        );
        params.push(userId);
      } else if (parsed.data.status === "remediated") {
        updateFields.push(
          `remediated_by = $${paramIdx++}`,
          `remediated_at = timezone('utc'::text, now())`,
        );
        params.push(userId);
      }

      params.push(violationId, tenantId);

      const result = await query(
        `UPDATE public.compliance_violations SET ${updateFields.join(", ")} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx++}`,
        params,
      );

      if (result.data?.rowCount === 0) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Violação não encontrada" } },
          404,
        );
      }

      if (userId) {
        try {
          await writeAuditLog({
            userId,
            tenantId,
            action: "compliance.violation.update",
            entityType: "compliance_violation",
            entityId: violationId,
            newData: { status: parsed.data.status },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Compliance violation atualizada", {
        violationId,
        status: parsed.data.status,
        tenantId,
      });

      return c.json({ id: violationId, status: parsed.data.status });
    } catch (error) {
      logger.error("Erro ao atualizar violation", {
        violationId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "UPDATE_ERROR", message: "Erro ao atualizar" } },
        500,
      );
    }
  },
);

// ========== Stats ==========

complianceRoute.get(
  "/stats",
  requirePermission("compliance:read"),
  httpCache(60),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      // Paraleliza 4 queries independentes
      const [
        overviewResult,
        violationsResult,
        frameworkResult,
        recentScansResult,
      ] = await Promise.all([
        query(
          `SELECT
             COUNT(*) FILTER (WHERE is_active = true) as active_policies,
             COUNT(*) as total_policies,
             COUNT(DISTINCT framework) as frameworks_covered
             FROM public.compliance_policies WHERE tenant_id = $1`,
          [tenantId],
        ),
        query(
          `SELECT
             COUNT(*) FILTER (WHERE status = 'open') as open_violations,
             COUNT(*) FILTER (WHERE status = 'open' AND severity = 'critical') as critical_open,
             COUNT(*) FILTER (WHERE status = 'open' AND severity = 'high') as high_open,
             COUNT(*) FILTER (WHERE status = 'remediated') as remediated,
             COUNT(*) as total_violations
             FROM public.compliance_violations WHERE tenant_id = $1`,
          [tenantId],
        ),
        query(
          `SELECT p.framework,
             COUNT(DISTINCT p.id) as policy_count,
             COUNT(DISTINCT v.id) FILTER (WHERE v.status = 'open') as open_violations,
             COUNT(DISTINCT v.id) FILTER (WHERE v.status = 'remediated') as remediated
             FROM public.compliance_policies p
             LEFT JOIN public.compliance_violations v ON p.id = v.policy_id
             WHERE p.tenant_id = $1
             GROUP BY p.framework ORDER BY open_violations DESC`,
          [tenantId],
        ),
        query(
          `SELECT
             COUNT(*) as total_scans,
             AVG(compliance_score) FILTER (WHERE status = 'completed') as avg_score,
             MAX(compliance_score) FILTER (WHERE status = 'completed') as best_score,
             MIN(compliance_score) FILTER (WHERE status = 'completed') as worst_score
             FROM public.compliance_scans WHERE tenant_id = $1 AND created_at > timezone('utc'::text, now()) - INTERVAL '30 days'`,
          [tenantId],
        ),
      ]);

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
    } catch (error) {
      logger.error("Erro ao buscar compliance stats", {
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
