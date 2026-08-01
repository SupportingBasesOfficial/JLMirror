// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { query } from "@repo/db";
import { registerRepeatableJob, startWorker } from "./queue.js";

// Metrics Collector — coleta metricas internas do JLMIRROR e escreve em system_metrics
// Usa TimescaleDB hypertable se disponivel, ou table normal como fallback
// Roda a cada 60s via BullMQ

const QUEUE_NAME = "task-scheduler";
const COLLECT_INTERVAL_MS = 60_000;

interface MetricRecord {
  metric_name: string;
  metric_value: number;
  labels: Record<string, string>;
}

export async function startMetricsCollector(): Promise<void> {
  await registerRepeatableJob(
    QUEUE_NAME,
    "collect-system-metrics",
    { every: COLLECT_INTERVAL_MS },
  );

  startWorker(QUEUE_NAME, async (job) => {
    if (job.name !== "collect-system-metrics") return;
    try {
      await collectAndStoreMetrics();
    } catch (err) {
      console.error("[metrics-collector] Erro:", err instanceof Error ? err.message : String(err));
    }
  });
}

export function stopMetricsCollector(): void {
  console.warn("[metrics-collector] Parado");
}

async function collectAndStoreMetrics(): Promise<void> {
  const metrics: MetricRecord[] = [];
  const now = Date.now();

  // Metricas de processo Node.js
  const memUsage = process.memoryUsage();
  metrics.push({ metric_name: "process_rss_bytes", metric_value: memUsage.rss, labels: { source: "node" } });
  metrics.push({ metric_name: "process_heap_used_bytes", metric_value: memUsage.heapUsed, labels: { source: "node" } });
  metrics.push({ metric_name: "process_heap_total_bytes", metric_value: memUsage.heapTotal, labels: { source: "node" } });
  metrics.push({ metric_name: "process_uptime_seconds", metric_value: process.uptime(), labels: { source: "node" } });

  // Metricas de pool PG
  try {
    const { pool } = await import("@repo/db");
    const p = pool();
    metrics.push({ metric_name: "db_pool_total", metric_value: p.totalCount, labels: { source: "pg" } });
    metrics.push({ metric_name: "db_pool_idle", metric_value: p.idleCount, labels: { source: "pg" } });
    metrics.push({ metric_name: "db_pool_waiting", metric_value: p.waitingCount, labels: { source: "pg" } });
  } catch {
    // Pool pode nao estar inicializado
  }

  // Insere em batch
  if (metrics.length === 0) return;

  const names = metrics.map((m) => m.metric_name);
  const values = metrics.map((m) => m.metric_value);
  const labels = metrics.map((m) => JSON.stringify(m.labels));

  await query(
    `INSERT INTO public.system_metrics (metric_name, metric_value, labels)
     SELECT name, value, label::jsonb
     FROM UNNEST($1::text[], $2::float8[], $3::text[]) AS t(name, value, label)`,
    [names, values, labels],
  );

  console.warn(`[metrics-collector] ${metrics.length} metricas coletadas em ${Date.now() - now}ms`);
}
