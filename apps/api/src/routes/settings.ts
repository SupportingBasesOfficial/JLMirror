// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import nodemailer from "nodemailer";
import {
  updateTenantSettingsSchema,
  testSmtpSchema,
  type UpdateTenantSettingsInput,
  type TestSmtpInput,
} from "@repo/shared-validation";
import { requirePermission } from "../middleware/require-permission.js";
import { clearModuleFlagCache } from "../middleware/require-module.js";
import { buildDynamicUpdate } from "../lib/dynamic-update.js";
import { writeAuditLog } from "../lib/audit.js";
import "../types.js";

export const settingsRoute = new Hono();

// ========== Get Settings ==========

settingsRoute.get("/", requirePermission("settings:read"), async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;

  let result = await query(
    "SELECT * FROM public.tenant_settings WHERE tenant_id = $1",
    [tenantId],
  );

  if (!result.data?.rows[0]) {
    const createResult = await query<{ id: string }>(
      "INSERT INTO public.tenant_settings (tenant_id) VALUES ($1) RETURNING id",
      [tenantId],
    );
    result = await query("SELECT * FROM public.tenant_settings WHERE id = $1", [
      createResult.data?.rows[0]?.id,
    ]);
  }

  const settings = result.data?.rows[0] ?? {};
  // Nao retorna a senha SMTP
  if (settings.smtp_password_encrypted !== undefined) {
    settings.smtp_password_encrypted = settings.smtp_password_encrypted
      ? "***"
      : null;
  }
  if (settings.telegram_bot_token !== undefined) {
    settings.telegram_bot_token = settings.telegram_bot_token ? "***" : null;
  }

  return c.json({ settings });
});

// ========== Update Settings ==========

settingsRoute.put("/", requirePermission("settings:write"), async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;
  const body = await c.req.json<UpdateTenantSettingsInput>();
  const parsed = updateTenantSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } },
      400,
    );
  }

  const data = parsed.data;

  // Garante que existe um registro
  const existing = await query(
    "SELECT id FROM public.tenant_settings WHERE tenant_id = $1",
    [tenantId],
  );
  if (!existing.data?.rows[0]) {
    await query("INSERT INTO public.tenant_settings (tenant_id) VALUES ($1)", [
      tenantId,
    ]);
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

  await writeAuditLog({
    userId: user.sub,
    action: "settings.update",
    entityType: "tenant_settings",
    newData: { fields: Object.keys(data) },
  });

  return c.json({ updated: true });
});

// ========== Test SMTP ==========

settingsRoute.post(
  "/test-smtp",
  requirePermission("settings:write"),
  async (c) => {
    const body = await c.req.json<TestSmtpInput>();
    const parsed = testSmtpSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } },
        400,
      );
    }

    const data = parsed.data;

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

settingsRoute.get("/usage", requirePermission("settings:read"), async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;

  const settingsResult = await query(
    "SELECT max_devices, max_users, max_api_keys, max_webhooks, max_scheduled_tasks, max_storage_mb, max_retention_days FROM public.tenant_settings WHERE tenant_id = $1",
    [tenantId],
  );

  const limits = settingsResult.data?.rows[0] ?? {};

  const deviceCount = await query(
    "SELECT COUNT(*) as count FROM public.devices WHERE tenant_id = $1",
    [tenantId],
  );
  const userCount = await query(
    "SELECT COUNT(*) as count FROM public.tenant_users WHERE tenant_id = $1",
    [tenantId],
  );
  const apiKeyCount = await query(
    "SELECT COUNT(*) as count FROM public.api_keys WHERE tenant_id = $1",
    [tenantId],
  );
  const webhookCount = await query(
    "SELECT COUNT(*) as count FROM public.webhooks WHERE tenant_id = $1",
    [tenantId],
  );
  const taskCount = await query(
    "SELECT COUNT(*) as count FROM public.scheduled_tasks WHERE tenant_id = $1",
    [tenantId],
  );

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
      users: { current: getCount(userCount), max: limits.max_users ?? 50 },
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
});

// ========== Modules Management ==========

// GET /api/v1/settings/modules — lista todos os modulos com status ativo/inativo
settingsRoute.get("/modules", requirePermission("settings:read"), async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;

  const result = await query(
    `SELECT key, name, description, default_value, is_active
     FROM public.feature_flags
     WHERE key LIKE 'module_%' AND (tenant_id IS NULL OR tenant_id = $1)
     ORDER BY key`,
    [tenantId],
  );

  const modules = (result.data?.rows ?? []).map((row) => ({
    key: row.key as string,
    name: row.name as string,
    description: row.description as string,
    enabled: row.default_value === true || row.default_value === "true",
    is_active: row.is_active as boolean,
  }));

  return c.json({ modules });
});

// PUT /api/v1/settings/modules/:key — ativa ou desativa um modulo
settingsRoute.put(
  "/modules/:key",
  requirePermission("settings:write"),
  async (c) => {
    const moduleKey = c.req.param("key");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    // Valida que a key comeca com module_
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

    const body = await c.req.json<{ enabled: boolean }>();
    if (typeof body.enabled !== "boolean") {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Campo 'enabled' deve ser boolean",
          },
        },
        400,
      );
    }

    // Verifica se a flag existe (global ou do tenant)
    const flagResult = await query<{ id: string }>(
      `SELECT id FROM public.feature_flags
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

    // Atualiza o default_value da flag
    await query(
      `UPDATE public.feature_flags SET default_value = $1::jsonb, updated_at = NOW()
     WHERE key = $2 AND (tenant_id IS NULL OR tenant_id = $3)`,
      [JSON.stringify(body.enabled), moduleKey, tenantId],
    );

    // Limpa o cache do middleware require-module para que a mudanca tenha efeito imediato
    clearModuleFlagCache();

    // Registra no audit log
    await query(
      "SELECT public.write_audit_log($1, NULL, 'settings.module.toggle', 'feature_flags', NULL, $2, NULL, NULL)",
      [user.sub, JSON.stringify({ module: moduleKey, enabled: body.enabled })],
    );

    return c.json({ key: moduleKey, enabled: body.enabled });
  },
);
