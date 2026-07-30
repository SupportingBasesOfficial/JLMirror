import { Hono } from "hono";
import { query } from "@repo/db";
import { jwtAuth } from "../middleware/jwt-auth.js";
import { tenantContext } from "../middleware/tenant-context.js";
import { requirePermission } from "../middleware/require-permission.js";
import { processChatOpsCommand } from "../lib/chatops-processor.js";
import "../types.js";

export const chatopsRoute = new Hono();

// ========== Webhook Receiver (Slack/Teams) ==========

// POST /api/v1/chatops/webhook/slack — recebe slash commands do Slack
chatopsRoute.post("/webhook/slack", async (c) => {
  const formData = await c.req.formData();
  const token = formData.get("token") as string;
  const command = (formData.get("command") as string)?.replace(/^\//, "") ?? "";
  const text = (formData.get("text") as string) ?? "";
  const userId = (formData.get("user_id") as string) ?? "";
  const userName = (formData.get("user_name") as string) ?? "";
  const channelId = (formData.get("channel_id") as string) ?? "";
  const channelName = (formData.get("channel_name") as string) ?? "";
  const tenantIdHeader = c.req.header("x-tenant-id") ?? "";

  if (!tenantIdHeader) {
    return c.json({ text: "Tenant não identificado no header X-Tenant-Id" }, 400);
  }

  // Verifica configuracao do tenant
  const configResult = await query<{ slack_verification_token: string; is_active: boolean }>(
    "SELECT slack_verification_token, is_active FROM public.chatops_config WHERE tenant_id = $1 AND platform = 'slack' AND is_active = true LIMIT 1",
    [tenantIdHeader],
  );

  const config = configResult.data?.rows[0];
  if (!config) {
    return c.json({ text: "ChatOps não configurado para este tenant" }, 403);
  }

  if (config.slack_verification_token && token !== config.slack_verification_token) {
    return c.json({ text: "Token de verificação inválido" }, 401);
  }

  // Parse comando
  const args = text.trim().split(/\s+/).filter(Boolean);
  const startTime = Date.now();

  const result = await processChatOpsCommand(tenantIdHeader, { command, args, rawText: text });

  const responseTime = Date.now() - startTime;

  // Registra no log
  await query(
    `INSERT INTO public.chatops_commands (tenant_id, source, chat_user_id, chat_user_name, chat_channel_id, chat_channel_name, command, arguments, response_text, status, error_message, response_time_ms)
     VALUES ($1, 'slack', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      tenantIdHeader, userId, userName, channelId, channelName,
      command, text, result.text,
      result.success ? "executed" : "failed",
      result.error ?? null, responseTime,
    ],
  );

  return c.json({ text: result.text, response_type: "ephemeral" });
});

// POST /api/v1/chatops/webhook/teams — recebe commands do Teams
chatopsRoute.post("/webhook/teams", async (c) => {
  const body = await c.req.json();
  const tenantIdHeader = c.req.header("x-tenant-id") ?? "";

  if (!tenantIdHeader) {
    return c.json({ text: "Tenant não identificado" }, 400);
  }

  const configResult = await query<{ is_active: boolean }>(
    "SELECT is_active FROM public.chatops_config WHERE tenant_id = $1 AND platform = 'teams' AND is_active = true LIMIT 1",
    [tenantIdHeader],
  );

  if (!configResult.data?.rows[0]) {
    return c.json({ text: "ChatOps não configurado para este tenant" }, 403);
  }

  const commandText = (body.text ?? body.command ?? "").replace(/^\//, "");
  const args = commandText.trim().split(/\s+/).filter(Boolean);
  const command = args.shift() ?? "";

  const startTime = Date.now();
  const result = await processChatOpsCommand(tenantIdHeader, { command, args, rawText: commandText });
  const responseTime = Date.now() - startTime;

  await query(
    `INSERT INTO public.chatops_commands (tenant_id, source, chat_user_id, chat_user_name, chat_channel_id, chat_channel_name, command, arguments, response_text, status, error_message, response_time_ms)
     VALUES ($1, 'teams', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      tenantIdHeader,
      body.from?.id ?? null, body.from?.name ?? null,
      body.conversation?.id ?? null, body.conversation?.name ?? null,
      command, commandText, result.text,
      result.success ? "executed" : "failed",
      result.error ?? null, responseTime,
    ],
  );

  return c.json({ type: "message", text: result.text });
});

// ========== Config (Admin) ==========

// GET /api/v1/chatops/config — lista configs do tenant
chatopsRoute.get("/config", jwtAuth, tenantContext, requirePermission("chatops:manage"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;

  const result = await query(
    "SELECT id, platform, slack_bot_token, enabled_commands, is_active, created_at, updated_at FROM public.chatops_config WHERE tenant_id = $1 ORDER BY created_at DESC",
    [tenantId],
  );

  return c.json({ configs: result.data?.rows ?? [] });
});

// PUT /api/v1/chatops/config — cria ou atualiza config (upsert)
chatopsRoute.put("/config", jwtAuth, tenantContext, requirePermission("chatops:manage"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const body = await c.req.json();

  const {
    platform, slack_verification_token, slack_signing_secret, slack_bot_token,
    teams_app_id, teams_app_password, enabled_commands, is_active,
  } = body;

  if (!platform || !["slack", "teams"].includes(platform)) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "platform deve ser 'slack' ou 'teams'" } }, 400);
  }

  const result = await query<{ id: string }>(
    `INSERT INTO public.chatops_config
       (tenant_id, platform, slack_verification_token, slack_signing_secret, slack_bot_token,
        teams_app_id, teams_app_password, enabled_commands, is_active, configured_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (tenant_id, platform) DO UPDATE SET
       slack_verification_token = EXCLUDED.slack_verification_token,
       slack_signing_secret = EXCLUDED.slack_signing_secret,
       slack_bot_token = EXCLUDED.slack_bot_token,
       teams_app_id = EXCLUDED.teams_app_id,
       teams_app_password = EXCLUDED.teams_app_password,
       enabled_commands = EXCLUDED.enabled_commands,
       is_active = EXCLUDED.is_active
     RETURNING id`,
    [
      tenantId, platform,
      slack_verification_token ?? null, slack_signing_secret ?? null, slack_bot_token ?? null,
      teams_app_id ?? null, teams_app_password ?? null,
      enabled_commands ?? ["status", "ack", "resolve", "incidents", "services", "silence"],
      is_active ?? true, user.sub,
    ],
  );

  await query(
    "SELECT public.write_audit_log($1, NULL, 'chatops.config.update', 'chatops_config', NULL, $2, NULL, NULL)",
    [user.sub, JSON.stringify({ id: result.data?.rows[0]?.id, platform })],
  );

  return c.json({ id: result.data?.rows[0]?.id, updated: true });
});

// ========== Command History ==========

// GET /api/v1/chatops/history — historico de comandos
chatopsRoute.get("/history", jwtAuth, tenantContext, requirePermission("chatops:read"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 100);
  const source = c.req.query("source");

  let sql = `SELECT id, source, chat_user_name, chat_channel_name, command, arguments, response_text, status, error_message, response_time_ms, created_at
     FROM public.chatops_commands WHERE tenant_id = $1`;
  const params: unknown[] = [tenantId];

  if (source) {
    sql += ` AND source = $2`;
    params.push(source);
  }

  sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
  params.push(limit);

  const result = await query(sql, params);

  return c.json({ commands: result.data?.rows ?? [] });
});

// GET /api/v1/chatops/stats — estatisticas
chatopsRoute.get("/stats", jwtAuth, tenantContext, requirePermission("chatops:read"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;

  const totalResult = await query("SELECT COUNT(*) as count FROM public.chatops_commands WHERE tenant_id = $1", [tenantId]);
  const successResult = await query("SELECT COUNT(*) as count FROM public.chatops_commands WHERE tenant_id = $1 AND status = 'executed'", [tenantId]);
  const failedResult = await query("SELECT COUNT(*) as count FROM public.chatops_commands WHERE tenant_id = $1 AND status = 'failed'", [tenantId]);
  const byCommandResult = await query(
    `SELECT command, COUNT(*) as count FROM public.chatops_commands WHERE tenant_id = $1 GROUP BY command ORDER BY count DESC LIMIT 10`,
    [tenantId],
  );
  const bySourceResult = await query(
    `SELECT source, COUNT(*) as count FROM public.chatops_commands WHERE tenant_id = $1 GROUP BY source`,
    [tenantId],
  );

  const getCount = (r: { data?: { rows?: Array<Record<string, unknown>> } | null }): number => {
    const row = r.data?.rows?.[0];
    return row ? parseInt((row.count as string) ?? "0", 10) : 0;
  };

  return c.json({
    total: getCount(totalResult),
    executed: getCount(successResult),
    failed: getCount(failedResult),
    by_command: byCommandResult.data?.rows ?? [],
    by_source: bySourceResult.data?.rows ?? [],
  });
});
