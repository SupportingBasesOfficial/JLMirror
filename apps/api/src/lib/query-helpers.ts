// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// Helpers de query reutilizaveis — eliminam duplicacao de safeRows/safeCount

interface QueryResult {
  data?: { rows?: Array<Record<string, unknown>> } | null;
}

export function safeRows(result: QueryResult): Array<Record<string, unknown>> {
  return result.data?.rows ?? [];
}

export function safeCount(result: QueryResult): number {
  const row = result.data?.rows?.[0];
  return row ? parseInt((row.count as string) ?? "0", 10) : 0;
}

export function safeFirstRow<T = Record<string, unknown>>(
  result: QueryResult,
): T | null {
  return (result.data?.rows?.[0] as T) ?? null;
}
