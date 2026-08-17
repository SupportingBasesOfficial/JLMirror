// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// Metrics Collector — coleta metricas internas do JLMIRROR e escreve em system_metrics
// Usa TimescaleDB hypertable se disponivel, ou table normal como fallback
// Roda a cada 60s via BullMQ
//
// RLS INTEGRATION: system_metrics tem RLS com policy que permite tenant_id IS NULL
// (metricas globais do processo). Este worker coleta metricas do processo Node.js
// (nao atreladas a um tenant), entao executa SEM runWithTenant — o que significa
// que withTenantDb() nao injeta SET LOCAL app.current_tenant_id e a policy
// `tenant_id::text = current_setting(...) OR tenant_id IS NULL` permite o insert
// com tenant_id = NULL.

import { withTenantDb, schema } from "@repo/db/drizzle";
import { logger } from "@repo/logger";
import { registerRepeatableJob, startWorker } from "./queue.js";

const QUEUE_NAME = "task-scheduler";
const COLLECT_INTERVAL_MS = 60_000;

interface MetricRecord {
  metric_name: string;
  metric_value: number;
  labels: Record<string, string>;
}

export async function startMetricsCollector(): Promise<void> {
  await registerRepeatableJob(QUEUE_NAME, "collect-system-metrics", {
    every: COLLECT_INTERVAL_MS,
  });

  startWorker(QUEUE_NAME, async (job) => {
    if (job.name !== "collect-system-metrics") return;
    try {
      await collectAndStoreMetrics();
    } catch (err) {
      logger.error("Erro no metrics collector", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}

export function stopMetricsCollector(): void {
  logger.info("Metrics collector parado");
}

async function collectAndStoreMetrics(): Promise<void> {
  const metrics: MetricRecord[] = [];
  const now = Date.now();

  // Metricas de processo Node.js
  const memUsage = process.memoryUsage();
  metrics.push({
    metric_name: "process_rss_bytes",
    metric_value: memUsage.rss,
    labels: { source: "node" },
  });
  metrics.push({
    metric_name: "process_heap_used_bytes",
    metric_value: memUsage.heapUsed,
    labels: { source: "node" },
  });
  metrics.push({
    metric_name: "process_heap_total_bytes",
    metric_value: memUsage.heapTotal,
    labels: { source: "node" },
  });
  metrics.push({
    metric_name: "process_uptime_seconds",
    metric_value: process.uptime(),
    labels: { source: "node" },
  });

  // Metricas de pool PG
  try {
    const { pool } = await import("@repo/db");
    const p = pool();
    metrics.push({
      metric_name: "db_pool_total",
      metric_value: p.totalCount,
      labels: { source: "pg" },
    });
    metrics.push({
      metric_name: "db_pool_idle",
      metric_value: p.idleCount,
      labels: { source: "pg" },
    });
    metrics.push({
      metric_name: "db_pool_waiting",
      metric_value: p.waitingCount,
      labels: { source: "pg" },
    });
  } catch {
    // Pool pode nao estar inicializado
  }

  if (metrics.length === 0) return;

  // Insere em batch via Drizzle — system_metrics permite tenant_id = NULL
  // (RLS policy: tenant_id::text = current_setting(...) OR tenant_id IS NULL)
  // Nao usamos runWithTenant aqui porque sao metricas globais do processo.
  await withTenantDb(async (db) => {
    await db.insert(schema.systemMetrics).values(
      metrics.map((m) => ({
        metricName: m.metric_name,
        metricValue: m.metric_value,
        labels: m.labels,
        tenantId: null,
      })),
    );
  });

  logger.info("Metricas coletadas", {
    count: metrics.length,
    durationMs: Date.now() - now,
  });
}
