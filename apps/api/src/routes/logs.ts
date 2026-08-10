// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { logger } from "@repo/logger";
import {
  logIngestSchema,
  logIngestBatchSchema,
  logSearchSchema,
  type LogSearchInput,
} from "@repo/shared-validation";
import { requirePermission } from "../middleware/require-permission.js";
import { safeJsonBody } from "../lib/safe-json.js";
import "../types.js";

export const logsRoute = new Hono();

// GET /api/v1/logs — overview do modulo
logsRoute.get("/", requirePermission("logs:read"), async (c) => {
  return c.json({
    overview: "Logs — Ingestão e busca de logs de sistema",
    endpoints: ["/ingest", "/ingest/batch", "/search", "/stats", "/levels"],
  });
});

// POST /api/v1/logs/ingest — insere um log (requer auth)
logsRoute.post("/ingest", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Autenticação necessária" } },
      401,
    );
  }

  try {
    const bodyResult = await safeJsonBody(c);
    if (!bodyResult.success) return bodyResult.response;
    const parsed = logIngestSchema.safeParse(bodyResult.data);
    if (!parsed.success) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } },
        400,
      );
    }

    const data = parsed.data;
    const payload: Record<string, unknown> = { ...(data.metadata ?? {}) };
    if (data.tags?.length) payload.tags = data.tags;
    if (data.span_id) payload.span_id = data.span_id;
    if (data.host) payload.host = data.host;
    if (data.service) payload.service = data.service;
    const result = await query<{ id: string }>(
      `INSERT INTO public.system_logs (tenant_id, source, level, message, payload, correlation_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        user.tenant_id ?? null,
        data.source,
        data.level,
        data.message,
        JSON.stringify(payload),
        data.trace_id ?? null,
      ],
    );

    if (result.error) {
      return c.json(
        { error: { code: "INSERT_ERROR", message: "Erro ao inserir log" } },
        500,
      );
    }

    return c.json({ id: result.data?.rows[0]?.id }, 201);
  } catch (error) {
    logger.error("Erro ao inserir log", {
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
      500,
    );
  }
});

// POST /api/v1/logs/ingest/batch — insere múltiplos logs
logsRoute.post("/ingest/batch", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Autenticação necessária" } },
      401,
    );
  }

  try {
    const bodyResult = await safeJsonBody(c);
    if (!bodyResult.success) return bodyResult.response;
    const parsed = logIngestBatchSchema.safeParse(bodyResult.data);
    if (!parsed.success) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } },
        400,
      );
    }

    const logs = parsed.data.logs;
    const tenantId = user.tenant_id ?? null;

    // Constrói values multi-row
    const values: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    for (const log of logs) {
      const logPayload: Record<string, unknown> = { ...(log.metadata ?? {}) };
      if (log.tags?.length) logPayload.tags = log.tags;
      if (log.span_id) logPayload.span_id = log.span_id;
      if (log.host) logPayload.host = log.host;
      if (log.service) logPayload.service = log.service;
      values.push(
        `($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5})`,
      );
      params.push(
        tenantId,
        log.source,
        log.level,
        log.message,
        JSON.stringify(logPayload),
        log.trace_id ?? null,
      );
      paramIdx += 6;
    }

    const result = await query(
      `INSERT INTO public.system_logs (tenant_id, source, level, message, payload, correlation_id)
       VALUES ${values.join(", ")}
       RETURNING id`,
      params,
    );

    if (result.error) {
      return c.json(
        { error: { code: "INSERT_ERROR", message: "Erro ao inserir logs" } },
        500,
      );
    }

    return c.json({ inserted: result.data?.rows.length ?? 0 }, 201);
  } catch (error) {
    logger.error("Erro ao inserir logs em batch", {
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
      500,
    );
  }
});

// GET /api/v1/logs/search — busca logs com filtros avançados e regex
logsRoute.get("/search", requirePermission("logs:read"), async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;

  try {
    const level = c.req.query("level");
    const source = c.req.query("source");
    const service = c.req.query("service");
    const messagePattern = c.req.query("message_pattern");
    const tags = c.req.query("tags");
    const traceId = c.req.query("trace_id");
    const from = c.req.query("from");
    const to = c.req.query("to");
    const limit = Math.min(
      Number.parseInt(c.req.query("limit") ?? "100", 10) || 100,
      500,
    );
    const offset = Number.parseInt(c.req.query("offset") ?? "0", 10) || 0;

    const searchInput: LogSearchInput = {
      level: level as LogSearchInput["level"],
      source: source || undefined,
      service: service || undefined,
      message_pattern: messagePattern || undefined,
      tags: tags ? tags.split(",") : undefined,
      trace_id: traceId || undefined,
      from: from || undefined,
      to: to || undefined,
      limit,
      offset,
    };

    const parsed = logSearchSchema.safeParse(searchInput);
    if (!parsed.success) {
      return c.json(
        {
          error: { code: "VALIDATION_ERROR", message: "Parâmetros inválidos" },
        },
        400,
      );
    }

    const p = parsed.data;
    const result = await query(
      "SELECT * FROM public.search_system_logs($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
      [
        tenantId,
        p.level ?? null,
        p.source ?? null,
        p.service ?? null,
        p.message_pattern ?? null,
        p.tags ?? null,
        p.trace_id ?? null,
        p.from ?? null,
        p.to ?? null,
        p.limit,
        p.offset,
      ],
    );

    if (result.error) {
      return c.json(
        { error: { code: "QUERY_ERROR", message: "Erro ao buscar logs" } },
        500,
      );
    }

    // Conta total para paginação (mesma query sem limit/offset)
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM public.search_system_logs($1, $2, $3, $4, $5, $6, $7, $8, $9, 500, 0)`,
      [
        tenantId,
        p.level ?? null,
        p.source ?? null,
        p.service ?? null,
        p.message_pattern ?? null,
        p.tags ?? null,
        p.trace_id ?? null,
        p.from ?? null,
        p.to ?? null,
      ],
    );

    return c.json({
      logs: result.data?.rows ?? [],
      total: Number.parseInt(countResult.data?.rows[0]?.count ?? "0", 10) || 0,
      limit: p.limit,
      offset: p.offset,
    });
  } catch (error) {
    logger.error("Erro ao buscar logs", {
      tenantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
      500,
    );
  }
});

// GET /api/v1/logs/stats — estatísticas de logs por nível
logsRoute.get("/stats", requirePermission("logs:read"), async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;

  try {
    const from = c.req.query("from");
    const to = c.req.query("to");

    const statsResult = await query(
      "SELECT * FROM public.system_logs_stats($1, $2, $3)",
      [tenantId, from ?? null, to ?? null],
    );

    const sourcesResult = await query(
      "SELECT * FROM public.system_logs_top_sources($1, $2, $3, 10)",
      [tenantId, from ?? null, to ?? null],
    );

    return c.json({
      by_level: statsResult.data?.rows ?? [],
      top_sources: sourcesResult.data?.rows ?? [],
    });
  } catch (error) {
    logger.error("Erro ao buscar stats de logs", {
      tenantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
      500,
    );
  }
});

// GET /api/v1/logs/levels — lista níveis disponíveis
logsRoute.get("/levels", async (c) => {
  return c.json({
    levels: ["trace", "debug", "info", "warn", "error", "fatal"],
  });
});
