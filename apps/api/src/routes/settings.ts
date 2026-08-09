// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { logger } from "@repo/logger";
import nodemailer from "nodemailer";
import {
  updateTenantSettingsSchema,
  testSmtpSchema,
  toggleModuleSchema,
  toggleModuleVisibilitySchema,
  type UpdateTenantSettingsInput,
  type TestSmtpInput,
} from "@repo/shared-validation";
import { requirePermission } from "../middleware/require-permission.js";
import { rateLimitWrite } from "../middleware/rate-limit.js";
import { httpCache } from "../middleware/http-cache.js";
import { safeJsonBody } from "../lib/safe-json.js";
import { clearModuleFlagCache } from "../middleware/require-module.js";
import { buildDynamicUpdate } from "../lib/dynamic-update.js";
import { writeAuditLog } from "../lib/audit.js";
import "../types.js";

export const settingsRoute = new Hono();

// ========== Get Settings ==========

settingsRoute.get(
  "/",
  requirePermission("settings:read"),
  httpCache(15),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      let result = await query(
        "SELECT * FROM public.tenant_settings WHERE tenant_id = $1",
        [tenantId],
      );

      if (!result.data?.rows[0]) {
        const createResult = await query<{ id: string }>(
          "INSERT INTO public.tenant_settings (tenant_id) VALUES ($1) RETURNING id",
          [tenantId],
        );
        result = await query(
          "SELECT * FROM public.tenant_settings WHERE id = $1",
          [createResult.data?.rows[0]?.id],
        );
      }

      const settings = result.data?.rows[0] ?? {};
      // Nao retorna a senha SMTP
      if (settings.smtp_password_encrypted !== undefined) {
        settings.smtp_password_encrypted = settings.smtp_password_encrypted
          ? "***"
          : null;
      }
      if (settings.telegram_bot_token !== undefined) {
        settings.telegram_bot_token = settings.telegram_bot_token
          ? "***"
          : null;
      }

      return c.json({ settings });
    } catch (error) {
      logger.error("Erro ao buscar settings", {
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

// ========== Update Settings ==========

settingsRoute.put(
  "/",
  requirePermission("settings:write"),
  rateLimitWrite,
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const userId = user?.sub ?? null;

    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = updateTenantSettingsSchema.safeParse(parsedBody.data);
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

    const data = parsed.data as UpdateTenantSettingsInput;

    try {
      // Garante que existe um registro
      const existing = await query(
        "SELECT id FROM public.tenant_settings WHERE tenant_id = $1",
        [tenantId],
      );
      if (!existing.data?.rows[0]) {
        await query(
          "INSERT INTO public.tenant_settings (tenant_id) VALUES ($1)",
          [tenantId],
        );
      }

      const fieldMap: Record<string, string> = {
        company_name: "company_name",
        logo_url: "logo_url",
        primary_color: "primary_color",
        secondary_color: "secondary_color",
        custom_css: "custom_css",
        login_message: "login_message",
        smtp_enabled: "smtp_enabled",
        smtp_host: "smtp_host",
        smtp_port: "smtp_port",
        smtp_username: "smtp_username",
        smtp_from_email: "smtp_from_email",
        smtp_from_name: "smtp_from_name",
        smtp_use_tls: "smtp_use_tls",
        smtp_use_ssl: "smtp_use_ssl",
        slack_webhook_url: "slack_webhook_url",
        slack_enabled: "slack_enabled",
        discord_webhook_url: "discord_webhook_url",
        discord_enabled: "discord_enabled",
        telegram_chat_id: "telegram_chat_id",
        telegram_enabled: "telegram_enabled",
        max_devices: "max_devices",
        max_users: "max_users",
        max_api_keys: "max_api_keys",
        max_webhooks: "max_webhooks",
        max_scheduled_tasks: "max_scheduled_tasks",
        max_storage_mb: "max_storage_mb",
        max_retention_days: "max_retention_days",
        enable_monitoring: "enable_monitoring",
        enable_alerts: "enable_alerts",
        enable_tickets: "enable_tickets",
        enable_kb: "enable_kb",
        enable_reports: "enable_reports",
        enable_api_access: "enable_api_access",
        password_min_length: "password_min_length",
        password_require_uppercase: "password_require_uppercase",
        password_require_lowercase: "password_require_lowercase",
        password_require_numbers: "password_require_numbers",
        password_require_symbols: "password_require_symbols",
        session_timeout_minutes: "session_timeout_minutes",
        max_login_attempts: "max_login_attempts",
        lockout_duration_minutes: "lockout_duration_minutes",
        require_mfa: "require_mfa",
      };

      const { setClause, params } = buildDynamicUpdate(
        data as Record<string, unknown>,
        fieldMap,
        { skipValues: ["***"] },
      );

      const updateFields = setClause ? [setClause] : [];
      let paramIdx = params.length + 1;

      // Campos sensíveis: só atualiza se não for "***"
      if (
        data.smtp_password_encrypted !== undefined &&
        data.smtp_password_encrypted !== "***"
      ) {
        updateFields.push(`smtp_password_encrypted = $${paramIdx++}`);
        params.push(data.smtp_password_encrypted);
      }

      if (
        data.telegram_bot_token !== undefined &&
        data.telegram_bot_token !== "***"
      ) {
        updateFields.push(`telegram_bot_token = $${paramIdx++}`);
        params.push(data.telegram_bot_token);
      }

      if (data.ip_whitelist !== undefined) {
        updateFields.push(`ip_whitelist = $${paramIdx++}`);
        params.push(JSON.stringify(data.ip_whitelist));
      }

      if (updateFields.length > 0) {
        params.push(tenantId);
        await query(
          `UPDATE public.tenant_settings SET ${updateFields.join(", ")} WHERE tenant_id = $${paramIdx++}`,
          params,
        );
      }

      if (userId) {
        try {
          await writeAuditLog({
            userId,
            tenantId,
            action: "settings.update",
            entityType: "tenant_settings",
            newData: { fields: Object.keys(data) },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Settings atualizado", { tenantId, userId });

      return c.json({ updated: true });
    } catch (error) {
      logger.error("Erro ao atualizar settings", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "UPDATE_ERROR", message: "Erro ao atualizar" } },
        500,
      );
    }
  },
);

// ========== Test SMTP ==========

settingsRoute.post(
  "/test-smtp",
  requirePermission("settings:write"),
  rateLimitWrite,
  async (c) => {
    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = testSmtpSchema.safeParse(parsedBody.data);
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

    const data = parsed.data as TestSmtpInput;

    // Teste SMTP real usando nodemailer
    const port = data.smtp_port;
    const useSsl = data.smtp_use_ssl;
    const useTls = data.smtp_use_tls;

    if (!data.smtp_host || port < 1 || port > 65535) {
      return c.json(
        {
          error: {
            code: "SMTP_CONFIG_ERROR",
            message: "Configuração SMTP inválida",
          },
        },
        400,
      );
    }

    const issues: string[] = [];
    if (useSsl && useTls) {
      issues.push("SSL e TLS são mutuamente exclusivos — use apenas um");
    }
    if (port === 465 && !useSsl) {
      issues.push("Porta 465 geralmente requer SSL");
    }
    if (port === 587 && !useTls) {
      issues.push("Porta 587 geralmente requer TLS");
    }

    try {
      const transporter = nodemailer.createTransport({
        host: data.smtp_host,
        port,
        secure: useSsl,
        requireTLS: useTls,
        auth: data.smtp_username
          ? {
              user: data.smtp_username,
              pass:
                data.smtp_password_encrypted &&
                data.smtp_password_encrypted !== "***"
                  ? data.smtp_password_encrypted
                  : undefined,
            }
          : undefined,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000,
      });

      await transporter.verify();

      await transporter.sendMail({
        from: data.smtp_from_email ?? data.smtp_username,
        to: data.test_email,
        subject: "JLMIRROR — Teste de SMTP",
        text: "Este é um email de teste do JLMIRROR. Se você recebeu esta mensagem, a configuração SMTP está funcionando corretamente.",
        html: "<p>Este é um email de teste do <strong>JLMIRROR</strong>.</p><p>Se você recebeu esta mensagem, a configuração SMTP está funcionando corretamente.</p>",
      });

      await transporter.close();

      logger.info("SMTP test enviado", {
        host: data.smtp_host,
        port,
        testEmail: data.test_email,
      });

      return c.json({
        status: "success",
        message: `Email de teste enviado com sucesso para ${data.test_email} via ${data.smtp_host}:${port}`,
        config: {
          host: data.smtp_host,
          port,
          from: data.smtp_from_email,
          tls: useTls,
          ssl: useSsl,
        },
        warnings: issues,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      logger.warn("SMTP test falhou", {
        host: data.smtp_host,
        port,
        error: message,
      });
      return c.json(
        {
          status: "failed",
          message: `Falha ao conectar/enviar via SMTP: ${message}`,
          config: {
            host: data.smtp_host,
            port,
            from: data.smtp_from_email,
            tls: useTls,
            ssl: useSsl,
          },
          warnings: issues,
        },
        502,
      );
    }
  },
);

// ========== Usage Stats ==========

settingsRoute.get(
  "/usage",
  requirePermission("settings:read"),
  httpCache(30),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const settingsResult = await query(
        "SELECT max_devices, max_users, max_api_keys, max_webhooks, max_scheduled_tasks, max_storage_mb, max_retention_days FROM public.tenant_settings WHERE tenant_id = $1",
        [tenantId],
      );

      const limits = settingsResult.data?.rows[0] ?? {};

      // Paraleliza 5 queries independentes
      const [deviceCount, userCount, apiKeyCount, webhookCount, taskCount] =
        await Promise.all([
          query(
            "SELECT COUNT(*) as count FROM public.devices WHERE tenant_id = $1",
            [tenantId],
          ),
          query(
            "SELECT COUNT(*) as count FROM public.tenant_users WHERE tenant_id = $1",
            [tenantId],
          ),
          query(
            "SELECT COUNT(*) as count FROM public.api_keys WHERE tenant_id = $1",
            [tenantId],
          ),
          query(
            "SELECT COUNT(*) as count FROM public.webhooks WHERE tenant_id = $1",
            [tenantId],
          ),
          query(
            "SELECT COUNT(*) as count FROM public.scheduled_tasks WHERE tenant_id = $1",
            [tenantId],
          ),
        ]);

      const getCount = (
        result: { data?: { rows?: Array<Record<string, unknown>> } | null },
        fallback = "0",
      ): number => {
        const row = result.data?.rows?.[0];
        const countVal = row ? (row.count as string) : fallback;
        return parseInt(countVal ?? fallback, 10);
      };

      return c.json({
        limits,
        usage: {
          devices: {
            current: getCount(deviceCount),
            max: limits.max_devices ?? 100,
          },
          users: {
            current: getCount(userCount),
            max: limits.max_users ?? 50,
          },
          api_keys: {
            current: getCount(apiKeyCount),
            max: limits.max_api_keys ?? 20,
          },
          webhooks: {
            current: getCount(webhookCount),
            max: limits.max_webhooks ?? 10,
          },
          scheduled_tasks: {
            current: getCount(taskCount),
            max: limits.max_scheduled_tasks ?? 25,
          },
        },
      });
    } catch (error) {
      logger.error("Erro ao buscar usage stats", {
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

// ========== Modules Management ==========

// GET /api/v1/settings/modules — lista todos os modulos com status ativo/inativo
settingsRoute.get(
  "/modules",
  requirePermission("settings:read"),
  httpCache(15),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const result = await query(
        `SELECT DISTINCT ON (key) key, name, description, default_value, is_active, client_visible, client_enabled
       FROM public.feature_flags
       WHERE key LIKE 'module_%' AND (tenant_id IS NULL OR tenant_id = $1)
       ORDER BY key, tenant_id NULLS LAST`,
        [tenantId],
      );

      const modules = (result.data?.rows ?? []).map((row) => ({
        key: row.key as string,
        name: row.name as string,
        description: row.description as string,
        enabled: row.default_value === true || row.default_value === "true",
        is_active: row.is_active as boolean,
        client_visible: row.client_visible as boolean,
        client_enabled: row.client_enabled as boolean,
      }));

      return c.json({ modules });
    } catch (error) {
      logger.error("Erro ao listar modules", {
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

// PUT /api/v1/settings/modules/:key — ativa ou desativa um modulo
settingsRoute.put(
  "/modules/:key",
  requirePermission("settings:write"),
  rateLimitWrite,
  async (c) => {
    const moduleKey = c.req.param("key");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const userId = user?.sub ?? null;

    if (!moduleKey.startsWith("module_")) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Chave de módulo inválida",
          },
        },
        400,
      );
    }

    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = toggleModuleSchema.safeParse(parsedBody.data);
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

    try {
      // Verifica se o template global da flag existe
      const templateResult = await query<{ id: string }>(
        `SELECT id FROM public.feature_flags WHERE key = $1 AND tenant_id IS NULL LIMIT 1`,
        [moduleKey],
      );

      if (!templateResult.data?.rows[0]) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Módulo não encontrado" } },
          404,
        );
      }

      if (tenantId) {
        await query(
          `INSERT INTO public.feature_flags (tenant_id, key, name, description, flag_type, is_active, default_value, rollout_percentage, variants, target_segments, excluded_tenant_ids, client_visible, client_enabled)
           SELECT $1, key, name, description, flag_type, is_active, default_value, rollout_percentage, variants, target_segments, excluded_tenant_ids, client_visible, client_enabled
           FROM public.feature_flags WHERE key = $2 AND tenant_id IS NULL
           ON CONFLICT (tenant_id, key) DO NOTHING`,
          [tenantId, moduleKey],
        );
        await query(
          `UPDATE public.feature_flags SET default_value = $1::jsonb, updated_at = NOW()
           WHERE key = $2 AND tenant_id = $3`,
          [JSON.stringify(parsed.data.enabled), moduleKey, tenantId],
        );
      } else {
        await query(
          `UPDATE public.feature_flags SET default_value = $1::jsonb, updated_at = NOW()
           WHERE key = $2 AND tenant_id IS NULL`,
          [JSON.stringify(parsed.data.enabled), moduleKey],
        );
      }

      clearModuleFlagCache();

      if (userId) {
        try {
          await writeAuditLog({
            userId,
            tenantId,
            action: "settings.module.toggle",
            entityType: "feature_flags",
            newData: { module: moduleKey, enabled: parsed.data.enabled },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Module toggled", {
        moduleKey,
        enabled: parsed.data.enabled,
        tenantId,
      });

      return c.json({ key: moduleKey, enabled: parsed.data.enabled });
    } catch (error) {
      logger.error("Erro ao toggle module", {
        moduleKey,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "UPDATE_ERROR", message: "Erro ao atualizar" } },
        500,
      );
    }
  },
);

// PUT /api/v1/settings/modules/:key/visibility — admin define se modulo é visível para o cliente
settingsRoute.put(
  "/modules/:key/visibility",
  requirePermission("settings:write"),
  rateLimitWrite,
  async (c) => {
    const moduleKey = c.req.param("key");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const userId = user?.sub ?? null;

    if (!moduleKey.startsWith("module_")) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Chave de módulo inválida",
          },
        },
        400,
      );
    }

    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = toggleModuleVisibilitySchema.safeParse(parsedBody.data);
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

    try {
      const templateResult = await query<{ id: string }>(
        `SELECT id FROM public.feature_flags WHERE key = $1 AND tenant_id IS NULL LIMIT 1`,
        [moduleKey],
      );

      if (!templateResult.data?.rows[0]) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Módulo não encontrado" } },
          404,
        );
      }

      if (tenantId) {
        await query(
          `INSERT INTO public.feature_flags (tenant_id, key, name, description, flag_type, is_active, default_value, rollout_percentage, variants, target_segments, excluded_tenant_ids, client_visible, client_enabled)
           SELECT $1, key, name, description, flag_type, is_active, default_value, rollout_percentage, variants, target_segments, excluded_tenant_ids, client_visible, client_enabled
           FROM public.feature_flags WHERE key = $2 AND tenant_id IS NULL
           ON CONFLICT (tenant_id, key) DO NOTHING`,
          [tenantId, moduleKey],
        );
        await query(
          `UPDATE public.feature_flags SET client_visible = $1, updated_at = NOW()
           WHERE key = $2 AND tenant_id = $3`,
          [parsed.data.client_visible, moduleKey, tenantId],
        );
      } else {
        await query(
          `UPDATE public.feature_flags SET client_visible = $1, updated_at = NOW()
           WHERE key = $2 AND tenant_id IS NULL`,
          [parsed.data.client_visible, moduleKey],
        );
      }

      clearModuleFlagCache();

      if (userId) {
        try {
          await writeAuditLog({
            userId,
            tenantId,
            action: "settings.module.visibility",
            entityType: "feature_flags",
            newData: {
              module: moduleKey,
              client_visible: parsed.data.client_visible,
            },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Module visibility toggled", {
        moduleKey,
        client_visible: parsed.data.client_visible,
        tenantId,
      });

      return c.json({
        key: moduleKey,
        client_visible: parsed.data.client_visible,
      });
    } catch (error) {
      logger.error("Erro ao toggle visibility", {
        moduleKey,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "UPDATE_ERROR", message: "Erro ao atualizar" } },
        500,
      );
    }
  },
);

// PUT /api/v1/settings/modules/:key/client — cliente ativa/desativa módulo liberado pelo admin
settingsRoute.put(
  "/modules/:key/client",
  requirePermission("settings:write"),
  rateLimitWrite,
  async (c) => {
    const moduleKey = c.req.param("key");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const userId = user?.sub ?? null;

    if (!moduleKey.startsWith("module_")) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Chave de módulo inválida",
          },
        },
        400,
      );
    }

    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = toggleModuleSchema.safeParse(parsedBody.data);
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

    try {
      // Verifica se a flag existe e se o admin liberou para o cliente
      const flagResult = await query<{ client_visible: boolean }>(
        `SELECT client_visible FROM public.feature_flags
         WHERE key = $1 AND (tenant_id IS NULL OR tenant_id = $2)
         ORDER BY tenant_id NULLS LAST LIMIT 1`,
        [moduleKey, tenantId],
      );

      if (!flagResult.data?.rows[0]) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Módulo não encontrado" } },
          404,
        );
      }

      if (!flagResult.data.rows[0].client_visible) {
        return c.json(
          {
            error: {
              code: "FORBIDDEN",
              message:
                "Este módulo não foi liberado para ativação pelo cliente",
            },
          },
          403,
        );
      }

      if (tenantId) {
        await query(
          `INSERT INTO public.feature_flags (tenant_id, key, name, description, flag_type, is_active, default_value, rollout_percentage, variants, target_segments, excluded_tenant_ids, client_visible, client_enabled)
           SELECT $1, key, name, description, flag_type, is_active, default_value, rollout_percentage, variants, target_segments, excluded_tenant_ids, client_visible, client_enabled
           FROM public.feature_flags WHERE key = $2 AND tenant_id IS NULL
           ON CONFLICT (tenant_id, key) DO NOTHING`,
          [tenantId, moduleKey],
        );
        await query(
          `UPDATE public.feature_flags SET client_enabled = $1, updated_at = NOW()
           WHERE key = $2 AND tenant_id = $3`,
          [parsed.data.enabled, moduleKey, tenantId],
        );
      } else {
        await query(
          `UPDATE public.feature_flags SET client_enabled = $1, updated_at = NOW()
           WHERE key = $2 AND tenant_id IS NULL`,
          [parsed.data.enabled, moduleKey],
        );
      }

      clearModuleFlagCache();

      if (userId) {
        try {
          await writeAuditLog({
            userId,
            tenantId,
            action: "settings.module.client_toggle",
            entityType: "feature_flags",
            newData: {
              module: moduleKey,
              client_enabled: parsed.data.enabled,
            },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Module client toggled", {
        moduleKey,
        client_enabled: parsed.data.enabled,
        tenantId,
      });

      return c.json({
        key: moduleKey,
        client_enabled: parsed.data.enabled,
      });
    } catch (error) {
      logger.error("Erro ao client toggle module", {
        moduleKey,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "UPDATE_ERROR", message: "Erro ao atualizar" } },
        500,
      );
    }
  },
);
