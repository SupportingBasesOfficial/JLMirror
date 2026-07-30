import crypto from "node:crypto";

// Contexto de trace distribuido
export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  sampled: boolean;
}

// Extrai contexto de trace dos headers W3C Trace Context
export function extractTraceContext(headers: Record<string, string | undefined>): TraceContext | null {
  const traceparent = headers["traceparent"];
  if (!traceparent) return null;

  const parts = traceparent.split("-");
  if (parts.length < 4) return null;

  const [, traceId, spanId, flags] = parts;
  if (!traceId || !spanId) return null;

  return {
    traceId,
    spanId,
    sampled: flags === "01",
  };
}

// Cria novo contexto de trace raiz
export function createRootTraceContext(): TraceContext {
  return {
    traceId: crypto.randomUUID().replace(/-/g, ""),
    spanId: crypto.randomUUID().replace(/-/g, "").slice(0, 16),
    sampled: true,
  };
}

// Registra inicio de span
export function recordSpanStart(name: string, parent?: TraceContext): { name: string; spanId: string; startTime: number; parent?: TraceContext } {
  return {
    name,
    spanId: crypto.randomUUID().replace(/-/g, "").slice(0, 16),
    startTime: Date.now(),
    parent,
  };
}

// Registra fim de span e retorna duracao
export function recordSpanEnd(span: { name: string; startTime: number }): number {
  return Date.now() - span.startTime;
}

// Formata traceparent header W3C
export function formatTraceParent(ctx: TraceContext): string {
  const flags = ctx.sampled ? "01" : "00";
  return `00-${ctx.traceId}-${ctx.spanId}-${flags}`;
}
