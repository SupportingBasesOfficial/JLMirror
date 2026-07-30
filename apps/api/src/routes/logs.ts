import { Hono } from "hono";
import { query } from "@repo/db";
import {
  logIngestSchema,
  logIngestBatchSchema,
  logSearchSchema,
  type LogIngestInput,
  type LogIngestBatchInput,
  type LogSearchInput,
} from "@repo/shared-validation";
import { jwtAuth } from "../middleware/jwt-auth.js";
import { tenantContext } from "../middleware/tenant-context.js";
import { requirePermission } from "../middleware/require-permission.js";
import "../types.js";

export const logsRoute = new Hono();

// POST /api/v1/logs/ingest — insere um log (requer auth)
logsRoute.post("/ingest", jwtAuth, tenantContext, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Autenticação necessária" } },
      401,
    );
  }

  const body = await c.req.json<LogIngestInput>();
  const parsed = logIngestSchema.safeParse(body);
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
});

// POST /api/v1/logs/ingest/batch — insere múltiplos logs
logsRoute.post("/ingest/batch", jwtAuth, tenantContext, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Autenticação necessária" } },
      401,
    );
  }

  const body = await c.req.json<LogIngestBatchInput>();
  const parsed = logIngestBatchSchema.safeParse(body);
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
});

// GET /api/v1/logs/search — busca logs com filtros avançados e regex
logsRoute.get("/search", jwtAuth, tenantContext, requirePermission("logs:read"), async (c) => {
  const user = c.get("user");
  const level = c.req.query("level");
  const source = c.req.query("source");
  const service = c.req.query("service");
  const messagePattern = c.req.query("message_pattern");
  const tags = c.req.query("tags");
  const traceId = c.req.query("trace_id");
  const from = c.req.query("from");
  const to = c.req.query("to");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "100", 10), 500);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);

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
      { error: { code: "VALIDATION_ERROR", message: "Parâmetros inválidos" } },
      400,
    );
  }

  const p = parsed.data;
  const result = await query(
    "SELECT * FROM public.search_system_logs($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
    [
      user?.tenant_id ?? null,
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
      user?.tenant_id ?? null,
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
    total: parseInt(countResult.data?.rows[0]?.count ?? "0", 10),
    limit: p.limit,
    offset: p.offset,
  });
});

// GET /api/v1/logs/stats — estatísticas de logs por nível
logsRoute.get("/stats", jwtAuth, tenantContext, requirePermission("logs:read"), async (c) => {
  const user = c.get("user");
  const from = c.req.query("from");
  const to = c.req.query("to");

  const statsResult = await query(
    "SELECT * FROM public.system_logs_stats($1, $2, $3)",
    [user?.tenant_id ?? null, from ?? null, to ?? null],
  );

  const sourcesResult = await query(
    "SELECT * FROM public.system_logs_top_sources($1, $2, $3, 10)",
    [user?.tenant_id ?? null, from ?? null, to ?? null],
  );

  return c.json({
    by_level: statsResult.data?.rows ?? [],
    top_sources: sourcesResult.data?.rows ?? [],
  });
});

// GET /api/v1/logs/levels — lista níveis disponíveis
logsRoute.get("/levels", jwtAuth, tenantContext, async (c) => {
  return c.json({
    levels: ["trace", "debug", "info", "warn", "error", "fatal"],
  });
});
