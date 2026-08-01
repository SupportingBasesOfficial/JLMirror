// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// Endpoint /metrics no formato Prometheus para scrape
// Expõe contadores de requests, latência e status de conexões

import { Hono } from "hono";
import { query } from "@repo/db";

export const metricsRoute = new Hono();

interface RequestMetrics {
  totalRequests: number;
  requestsByStatus: Map<number, number>;
  requestsByMethod: Map<string, number>;
  totalDurationMs: number;
  activeConnections: number;
}

const metrics: RequestMetrics = {
  totalRequests: 0,
  requestsByStatus: new Map(),
  requestsByMethod: new Map(),
  totalDurationMs: 0,
  activeConnections: 0,
};

export function recordRequest(method: string, status: number, durationMs: number): void {
  metrics.totalRequests++;
  metrics.totalDurationMs += durationMs;
  metrics.requestsByStatus.set(status, (metrics.requestsByStatus.get(status) ?? 0) + 1);
  metrics.requestsByMethod.set(method, (metrics.requestsByMethod.get(method) ?? 0) + 1);
}

export function incrementActiveConnections(): void {
  metrics.activeConnections++;
}

export function decrementActiveConnections(): void {
  metrics.activeConnections = Math.max(0, metrics.activeConnections - 1);
}

function formatPrometheusMetric(name: string, value: number, labels?: Record<string, string>): string {
  const labelStr = labels ? `{${Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(",")}}` : "";
  return `${name}${labelStr} ${value}`;
}

metricsRoute.get("/", async (c) => {
  c.header("Content-Type", "text/plain; version=0.0.4; charset=utf-8");

  const lines: string[] = [];

  // Contadores de requests
  lines.push("# TYPE jlmirror_http_requests_total counter");
  lines.push(formatPrometheusMetric("jlmirror_http_requests_total", metrics.totalRequests));

  // Requests por status
  lines.push("# TYPE jlmirror_http_requests_by_status counter");
  for (const [status, count] of metrics.requestsByStatus) {
    lines.push(formatPrometheusMetric("jlmirror_http_requests_by_status", count, { status: String(status) }));
  }

  // Requests por método
  lines.push("# TYPE jlmirror_http_requests_by_method counter");
  for (const [method, count] of metrics.requestsByMethod) {
    lines.push(formatPrometheusMetric("jlmirror_http_requests_by_method", count, { method }));
  }

  // Latência média
  lines.push("# TYPE jlmirror_http_request_duration_ms gauge");
  const avgDuration = metrics.totalRequests > 0 ? metrics.totalDurationMs / metrics.totalRequests : 0;
  lines.push(formatPrometheusMetric("jlmirror_http_request_duration_ms", Math.round(avgDuration)));

  // Conexões ativas
  lines.push("# TYPE jlmirror_active_connections gauge");
  lines.push(formatPrometheusMetric("jlmirror_active_connections", metrics.activeConnections));

  // Health do banco de dados
  const dbResult = await query("SELECT 1 as ok");
  lines.push("# TYPE jlmirror_db_healthy gauge");
  lines.push(formatPrometheusMetric("jlmirror_db_healthy", dbResult.error ? 0 : 1));

  // Uptime
  lines.push("# TYPE jlmirror_process_uptime_seconds gauge");
  lines.push(formatPrometheusMetric("jlmirror_process_uptime_seconds", Math.round(process.uptime())));

  // Memória do processo
  const memUsage = process.memoryUsage();
  lines.push("# TYPE jlmirror_process_resident_memory_bytes gauge");
  lines.push(formatPrometheusMetric("jlmirror_process_resident_memory_bytes", memUsage.rss));
  lines.push("# TYPE jlmirror_process_heap_used_bytes gauge");
  lines.push(formatPrometheusMetric("jlmirror_process_heap_used_bytes", memUsage.heapUsed));

  return c.body(lines.join("\n") + "\n");
});
