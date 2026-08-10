// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// Endpoint /metrics no formato Prometheus para scrape
// Usa prom-client com metricas de processo (GC, CPU, memoria, event loop) automaticas

import { Hono } from "hono";
import { query } from "@repo/db";
import {
  registry,
  dbPoolSize,
  queueJobsActive,
  wsConnections,
  zabbixCircuitState,
} from "../lib/metrics.js";

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

export function recordRequest(
  method: string,
  status: number,
  durationMs: number,
): void {
  metrics.totalRequests++;
  metrics.totalDurationMs += durationMs;
  metrics.requestsByStatus.set(
    status,
    (metrics.requestsByStatus.get(status) ?? 0) + 1,
  );
  metrics.requestsByMethod.set(
    method,
    (metrics.requestsByMethod.get(method) ?? 0) + 1,
  );
}

export function incrementActiveConnections(): void {
  metrics.activeConnections++;
  wsConnections.set(metrics.activeConnections);
}

export function decrementActiveConnections(): void {
  metrics.activeConnections = Math.max(0, metrics.activeConnections - 1);
  wsConnections.set(metrics.activeConnections);
}

// Atualiza gauges de pool PG e filas antes de cada scrape
async function updateRuntimeGauges(): Promise<void> {
  try {
    const { pool } = await import("@repo/db");
    const p = pool();
    dbPoolSize.labels("total").set(p.totalCount);
    dbPoolSize.labels("idle").set(p.idleCount);
    dbPoolSize.labels("waiting").set(p.waitingCount);
  } catch {
    // Pool pode nao estar inicializado
  }

  try {
    const { createCacheClient } = await import("@repo/cache");
    const redis = createCacheClient();
    for (const queueName of [
      "task-scheduler",
      "alerting-engine",
      "device-sync",
      "partition-manager",
      "correlation-engine",
    ]) {
      const count = await redis.llen(`bull:${queueName}:active`);
      const num =
        typeof count === "number"
          ? count
          : Number.parseInt(String(count), 10) || 0;
      queueJobsActive.labels(queueName).set(num);
    }
  } catch {
    // Redis pode nao estar disponivel
  }

  // Estado do circuit breaker Zabbix
  try {
    const { circuitGetState } = await import("@repo/cache");
    const state = circuitGetState("zabbix:default");
    const stateValue = state === "closed" ? 0 : state === "half_open" ? 1 : 2;
    zabbixCircuitState.set(stateValue);
  } catch {
    // Silencioso
  }
}

metricsRoute.get("/", async (c) => {
  c.header("Content-Type", "text/plain; version=0.0.4; charset=utf-8");

  try {
    // Atualiza gauges runtime antes de coletar
    await updateRuntimeGauges();

    // Coleta metricas do prom-client (processo + customizadas)
    const promMetrics = await registry.metrics();

    // Adiciona metricas legacy que ainda nao estao no prom-client
    const lines: string[] = [];

    lines.push("# TYPE jlmirror_http_requests_by_status counter");
    for (const [status, count] of metrics.requestsByStatus) {
      lines.push(
        `jlmirror_http_requests_by_status{status="${status}"} ${count}`,
      );
    }

    lines.push("# TYPE jlmirror_http_requests_by_method counter");
    for (const [method, count] of metrics.requestsByMethod) {
      lines.push(
        `jlmirror_http_requests_by_method{method="${method}"} ${count}`,
      );
    }

    lines.push("# TYPE jlmirror_http_request_duration_ms gauge");
    const avgDuration =
      metrics.totalRequests > 0
        ? metrics.totalDurationMs / metrics.totalRequests
        : 0;
    lines.push(`jlmirror_http_request_duration_ms ${Math.round(avgDuration)}`);

    // Health do banco de dados
    const dbResult = await query("SELECT 1 as ok");
    lines.push("# TYPE jlmirror_db_healthy gauge");
    lines.push(`jlmirror_db_healthy ${dbResult.error ? 0 : 1}`);

    return c.body(promMetrics + "\n" + lines.join("\n") + "\n");
  } catch {
    // Endpoint de metricas nunca deve quebrar — retorna metricas minimas
    const errorLine = `# jlmirror_metrics_error 1\n`;
    return c.body(errorLine, 500);
  }
});
