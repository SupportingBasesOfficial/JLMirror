// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { requirePermission } from "../middleware/require-permission.js";
import "../types.js";

export const tracesRoute = new Hono();

interface TraceSpanRow {
  id: string;
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  tenant_id: string | null;
  operation_name: string;
  service: string;
  kind: string;
  start_time: string;
  end_time: string;
  duration_ms: number;
  status: string;
  status_message: string | null;
  attributes: unknown;
  events: unknown;
  resource: unknown;
}

// GET /api/v1/traces/search — lista traces com filtros
tracesRoute.get("/search", requirePermission("logs:read"), async (c) => {
  const user = c.get("user");
  const service = c.req.query("service");
  const operation = c.req.query("operation");
  const status = c.req.query("status");
  const minDuration = c.req.query("min_duration_ms");
  const maxDuration = c.req.query("max_duration_ms");
  const from = c.req.query("from");
  const to = c.req.query("to");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 200);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);

  const result = await query(
    "SELECT * FROM public.search_traces($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
    [
      user?.tenant_id ?? null,
      service ?? null,
      operation ?? null,
      status ?? null,
      minDuration ? parseInt(minDuration, 10) : null,
      maxDuration ? parseInt(maxDuration, 10) : null,
      from ?? null,
      to ?? null,
      limit,
      offset,
    ],
  );

  if (result.error) {
    return c.json(
      { error: { code: "QUERY_ERROR", message: "Erro ao buscar traces" } },
      500,
    );
  }

  // Conta total
  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM public.search_traces($1, $2, $3, $4, $5, $6, $7, $8, 200, 0)`,
    [
      user?.tenant_id ?? null,
      service ?? null,
      operation ?? null,
      status ?? null,
      minDuration ? parseInt(minDuration, 10) : null,
      maxDuration ? parseInt(maxDuration, 10) : null,
      from ?? null,
      to ?? null,
    ],
  );

  return c.json({
    traces: result.data?.rows ?? [],
    total: parseInt(countResult.data?.rows[0]?.count ?? "0", 10),
    limit,
    offset,
  });
});

// GET /api/v1/traces/stats — estatísticas por serviço (deve vir antes de /:traceId)
tracesRoute.get("/stats", requirePermission("logs:read"), async (c) => {
  const user = c.get("user");
  const from = c.req.query("from");
  const to = c.req.query("to");

  const result = await query("SELECT * FROM public.traces_stats($1, $2, $3)", [
    user?.tenant_id ?? null,
    from ?? null,
    to ?? null,
  ]);

  if (result.error) {
    return c.json(
      {
        error: { code: "QUERY_ERROR", message: "Erro ao buscar estatísticas" },
      },
      500,
    );
  }

  return c.json({
    services: result.data?.rows ?? [],
  });
});

// GET /api/v1/traces/:traceId — detalhe de um trace com todos os spans
tracesRoute.get("/:traceId", requirePermission("logs:read"), async (c) => {
  const traceId = c.req.param("traceId");
  const user = c.get("user");

  const result = await query(
    `SELECT id, trace_id, span_id, parent_span_id, tenant_id, operation_name, service, kind,
            start_time, end_time, duration_ms, status, status_message, attributes, events, resource
     FROM public.trace_spans
     WHERE trace_id = $1 AND ($2::uuid IS NULL OR tenant_id = $2)
     ORDER BY start_time ASC`,
    [traceId, user?.tenant_id ?? null],
  );

  if (result.error) {
    return c.json(
      { error: { code: "QUERY_ERROR", message: "Erro ao buscar trace" } },
      500,
    );
  }

  if (!result.data?.rows.length) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Trace não encontrado" } },
      404,
    );
  }

  const spans = result.data.rows as unknown as TraceSpanRow[];

  // Calcula timeline relativa
  const earliestStart = new Date(spans[0].start_time).getTime();
  const latestEnd = Math.max(
    ...spans.map((s) => new Date(s.end_time).getTime()),
  );
  const totalDurationMs = latestEnd - earliestStart;

  // Constrói árvore de spans (parent -> children)
  const spanMap = new Map<string, TraceSpanRow[]>();
  for (const span of spans) {
    const parentId = span.parent_span_id ?? "root";
    if (!spanMap.has(parentId)) {
      spanMap.set(parentId, []);
    }
    spanMap.get(parentId)!.push(span);
  }

  return c.json({
    trace_id: traceId,
    total_duration_ms: totalDurationMs,
    span_count: spans.length,
    error_count: spans.filter((s) => s.status === "error").length,
    spans,
    span_tree: Array.from(spanMap.entries()).map(([parentId, children]) => ({
      parent_span_id: parentId === "root" ? null : parentId,
      children,
    })),
  });
});
