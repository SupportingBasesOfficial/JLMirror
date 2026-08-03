// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import crypto from "node:crypto";

// Contexto de trace distribuido
export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  sampled: boolean;
}

// Extrai contexto de trace dos headers W3C Trace Context
export function extractTraceContext(
  headers: Record<string, string | undefined>,
): TraceContext | null {
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
export function recordSpanStart(
  nameOrCtx: string | TraceContext,
  parentOrName?: TraceContext | string,
  _serviceName?: string,
  _options?: Record<string, unknown>,
): { name: string; spanId: string; startTime: number; parent?: TraceContext } {
  const name =
    typeof nameOrCtx === "string"
      ? nameOrCtx
      : typeof parentOrName === "string"
        ? parentOrName
        : "span";
  const parent = typeof parentOrName === "object" ? parentOrName : undefined;
  return {
    name,
    spanId: crypto.randomUUID().replace(/-/g, "").slice(0, 16),
    startTime: Date.now(),
    parent,
  };
}

// Registra fim de span e retorna duracao
export function recordSpanEnd(
  span: { name: string; startTime: number },
  _status?: string,
  _message?: string | null,
  _events?: unknown[],
): number {
  return Date.now() - span.startTime;
}

// Formata traceparent header W3C
export function formatTraceParent(ctx: TraceContext): string {
  const flags = ctx.sampled ? "01" : "00";
  return `00-${ctx.traceId}-${ctx.spanId}-${flags}`;
}
