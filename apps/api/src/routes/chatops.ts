// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { logger } from "@repo/logger";
import { requirePermission } from "../middleware/require-permission.js";
import { validate } from "../middleware/validate.js";
import { rateLimitWrite, rateLimitApi } from "../middleware/rate-limit.js";
import { httpCache } from "../middleware/http-cache.js";
import { chatopsConfigSchema } from "@repo/shared-validation";
import { processChatOpsCommand } from "../lib/chatops-processor.js";
import { writeAuditLog } from "../lib/audit.js";
import "../types.js";

export const chatopsRoute = new Hono();

// GET /api/v1/chatops — overview do modulo
chatopsRoute.get(
  "/",
  requirePermission("chatops:read"),
  httpCache(60),
  async (c) => {
    return c.json({
      overview: "ChatOps — Integração com Slack/Teams",
      endpoints: [
        "/config",
        "/history",
        "/stats",
        "/webhook/slack",
        "/webhook/teams",
      ],
    });
  },
);

// ========== Webhook Receiver (Slack/Teams) ==========

// POST /api/v1/chatops/webhook/slack — recebe slash commands do Slack
chatopsRoute.post("/webhook/slack", rateLimitApi, async (c) => {
  const tenantIdHeader = c.req.header("x-tenant-id") ?? "";

  if (!tenantIdHeader) {
    return c.json(
      { text: "Tenant não identificado no header X-Tenant-Id" },
      400,
    );
  }

  try {
    const formData = await c.req.formData();
    const token = (formData.get("token") as string) ?? "";
    const command =
      (formData.get("command") as string)?.replace(/^\//, "") ?? "";
    const text = (formData.get("text") as string) ?? "";
    const userId = (formData.get("user_id") as string) ?? "";
    const userName = (formData.get("user_name") as string) ?? "";
    const channelId = (formData.get("channel_id") as string) ?? "";
    const channelName = (formData.get("channel_name") as string) ?? "";

    // Verifica configuracao do tenant
    const configResult = await query<{
      slack_verification_token: string;
      is_active: boolean;
    }>(
      "SELECT slack_verification_token, is_active FROM public.chatops_config WHERE tenant_id = $1 AND platform = 'slack' AND is_active = true LIMIT 1",
      [tenantIdHeader],
    );

    const config = configResult.data?.rows[0];
    if (!config) {
      return c.json({ text: "ChatOps não configurado para este tenant" }, 403);
    }

    if (
      config.slack_verification_token &&
      token !== config.slack_verification_token
    ) {
      return c.json({ text: "Token de verificação inválido" }, 401);
    }

    // Parse comando
    const args = text.trim().split(/\s+/).filter(Boolean);
    const startTime = Date.now();

    const result = await processChatOpsCommand(tenantIdHeader, {
      command,
      args,
      rawText: text,
    });

    const responseTime = Date.now() - startTime;

    // Registra no log
    try {
      await query(
        `INSERT INTO public.chatops_commands (tenant_id, source, chat_user_id, chat_user_name, chat_channel_id, chat_channel_name, command, arguments, response_text, status, error_message, response_time_ms)
         VALUES ($1, 'slack', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          tenantIdHeader,
          userId,
          userName,
          channelId,
          channelName,
          command,
          text,
          result.text,
          result.success ? "executed" : "failed",
          result.error ?? null,
          responseTime,
        ],
      );
    } catch {
      // Log falhou — nao bloqueia resposta
    }

    return c.json({ text: result.text, response_type: "ephemeral" });
  } catch (error) {
    logger.error("Erro no webhook Slack", {
      tenantId: tenantIdHeader,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json({ text: "Erro interno ao processar comando" }, 500);
  }
});

// POST /api/v1/chatops/webhook/teams — recebe commands do Teams
chatopsRoute.post("/webhook/teams", rateLimitApi, async (c) => {
  const tenantIdHeader = c.req.header("x-tenant-id") ?? "";
  const teamsToken = c.req.header("x-teams-token") ?? "";

  if (!tenantIdHeader) {
    return c.json({ text: "Tenant não identificado" }, 400);
  }

  try {
    // Verifica configuracao do tenant (inclui teams_app_password para validacao)
    const configResult = await query<{
      is_active: boolean;
      teams_app_password: string | null;
    }>(
      "SELECT is_active, teams_app_password FROM public.chatops_config WHERE tenant_id = $1 AND platform = 'teams' AND is_active = true LIMIT 1",
      [tenantIdHeader],
    );

    if (!configResult.data?.rows[0]) {
      return c.json({ text: "ChatOps não configurado para este tenant" }, 403);
    }

    // Verifica token do Teams se configurado
    const config = configResult.data.rows[0];
    if (config.teams_app_password && teamsToken !== config.teams_app_password) {
      return c.json({ text: "Token de verificação inválido" }, 401);
    }

    const body = await c.req.json();
    const commandText = (body.text ?? body.command ?? "").replace(/^\//, "");
    const args = commandText.trim().split(/\s+/).filter(Boolean);
    const command = args.shift() ?? "";

    const startTime = Date.now();
    const result = await processChatOpsCommand(tenantIdHeader, {
      command,
      args,
      rawText: commandText,
    });
    const responseTime = Date.now() - startTime;

    try {
      await query(
        `INSERT INTO public.chatops_commands (tenant_id, source, chat_user_id, chat_user_name, chat_channel_id, chat_channel_name, command, arguments, response_text, status, error_message, response_time_ms)
         VALUES ($1, 'teams', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          tenantIdHeader,
          body.from?.id ?? null,
          body.from?.name ?? null,
          body.conversation?.id ?? null,
          body.conversation?.name ?? null,
          command,
          commandText,
          result.text,
          result.success ? "executed" : "failed",
          result.error ?? null,
          responseTime,
        ],
      );
    } catch {
      // Log falhou — nao bloqueia resposta
    }

    return c.json({ type: "message", text: result.text });
  } catch (error) {
    logger.error("Erro no webhook Teams", {
      tenantId: tenantIdHeader,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json({ text: "Erro interno ao processar comando" }, 500);
  }
});

// ========== Config (Admin) ==========

// GET /api/v1/chatops/config — lista configs do tenant
chatopsRoute.get(
  "/config",
  requirePermission("chatops:manage"),
  httpCache(15),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const result = await query(
        "SELECT id, platform, slack_bot_token, enabled_commands, is_active, created_at, updated_at FROM public.chatops_config WHERE tenant_id = $1 ORDER BY created_at DESC",
        [tenantId],
      );

      // Mascara tokens sensíveis antes de retornar
      const configs = (result.data?.rows ?? []).map((row) => {
        if (row.slack_bot_token) {
          row.slack_bot_token = "***";
        }
        return row;
      });

      return c.json({ configs });
    } catch (error) {
      logger.error("Erro ao listar chatops config", {
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

// PUT /api/v1/chatops/config — cria ou atualiza config (upsert)
chatopsRoute.put(
  "/config",
  requirePermission("chatops:manage"),
  rateLimitWrite,
  validate({ schema: chatopsConfigSchema }),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const userId = user?.sub ?? null;
    const body = c.get("validatedData") as {
      platform: string;
      slack_verification_token?: string;
      slack_signing_secret?: string;
      slack_bot_token?: string;
      teams_app_id?: string;
      teams_app_password?: string;
      enabled_commands?: string[];
      is_active?: boolean;
    };

    const {
      platform,
      slack_verification_token,
      slack_signing_secret,
      slack_bot_token,
      teams_app_id,
      teams_app_password,
      enabled_commands,
      is_active,
    } = body;

    try {
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
          tenantId,
          platform,
          slack_verification_token ?? null,
          slack_signing_secret ?? null,
          slack_bot_token ?? null,
          teams_app_id ?? null,
          teams_app_password ?? null,
          enabled_commands ?? [
            "status",
            "ack",
            "resolve",
            "incidents",
            "services",
            "silence",
          ],
          is_active ?? true,
          userId,
        ],
      );

      const configId = result.data?.rows[0]?.id;

      if (userId) {
        try {
          await writeAuditLog({
            userId,
            tenantId,
            action: "chatops.config.update",
            entityType: "chatops_config",
            entityId: configId,
            newData: { id: configId, platform },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("ChatOps config atualizada", {
        configId,
        platform,
        tenantId,
      });

      return c.json({ id: configId, updated: true });
    } catch (error) {
      logger.error("Erro ao atualizar chatops config", {
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

// ========== Command History ==========

// GET /api/v1/chatops/history — historico de comandos
chatopsRoute.get(
  "/history",
  requirePermission("chatops:read"),
  httpCache(15),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
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

    try {
      const result = await query(sql, params);

      return c.json({ commands: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro ao listar chatops history", {
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

// GET /api/v1/chatops/stats — estatisticas
chatopsRoute.get(
  "/stats",
  requirePermission("chatops:read"),
  httpCache(30),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      // Paraleliza 5 queries independentes
      const [
        totalResult,
        successResult,
        failedResult,
        byCommandResult,
        bySourceResult,
      ] = await Promise.all([
        query(
          "SELECT COUNT(*) as count FROM public.chatops_commands WHERE tenant_id = $1",
          [tenantId],
        ),
        query(
          "SELECT COUNT(*) as count FROM public.chatops_commands WHERE tenant_id = $1 AND status = 'executed'",
          [tenantId],
        ),
        query(
          "SELECT COUNT(*) as count FROM public.chatops_commands WHERE tenant_id = $1 AND status = 'failed'",
          [tenantId],
        ),
        query(
          `SELECT command, COUNT(*) as count FROM public.chatops_commands WHERE tenant_id = $1 GROUP BY command ORDER BY count DESC LIMIT 10`,
          [tenantId],
        ),
        query(
          `SELECT source, COUNT(*) as count FROM public.chatops_commands WHERE tenant_id = $1 GROUP BY source`,
          [tenantId],
        ),
      ]);

      const getCount = (r: {
        data?: { rows?: Array<Record<string, unknown>> } | null;
      }): number => {
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
    } catch (error) {
      logger.error("Erro ao buscar chatops stats", {
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
