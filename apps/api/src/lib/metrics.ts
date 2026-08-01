// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from "prom-client";

// Registry customizado — nao usa o global para evitar conflitos
export const registry = new Registry();
collectDefaultMetrics({ register: registry });

// Metricas customizadas do JLMIRROR
export const httpRequestDuration = new Histogram({
  name: "jlmirror_http_request_duration_seconds",
  help: "Duracao das requisicoes HTTP em segundos",
  labelNames: ["method", "route", "status"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

export const httpRequestTotal = new Counter({
  name: "jlmirror_http_requests_total",
  help: "Total de requisicoes HTTP",
  labelNames: ["method", "route", "status"],
  registers: [registry],
});

export const zabbixApiDuration = new Histogram({
  name: "jlmirror_zabbix_api_duration_seconds",
  help: "Duracao das chamadas para a API Zabbix",
  labelNames: ["method", "tenant_id"],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
  registers: [registry],
});

export const zabbixApiErrors = new Counter({
  name: "jlmirror_zabbix_api_errors_total",
  help: "Total de erros na API Zabbix",
  labelNames: ["method", "tenant_id", "error_code"],
  registers: [registry],
});

export const dbPoolSize = new Gauge({
  name: "jlmirror_db_pool_size",
  help: "Tamanho atual do pool de conexoes PG",
  labelNames: ["state"],
  registers: [registry],
});

export const wsConnections = new Gauge({
  name: "jlmirror_ws_connections",
  help: "Numero de conexoes WebSocket ativas",
  registers: [registry],
});

export const queueJobsActive = new Gauge({
  name: "jlmirror_queue_jobs_active",
  help: "Numero de jobs ativos nas filas BullMQ",
  labelNames: ["queue"],
  registers: [registry],
});

// Middleware Hono para coletar metricas HTTP
export function metricsMiddleware(c: any, next: any) {
  const start = Date.now();
  return next().then(() => {
    const duration = (Date.now() - start) / 1000;
    const route = c.req.routePath ?? c.req.path ?? "unknown";
    const method = c.req.method;
    const status = c.res.status;
    httpRequestDuration.labels(method, route, String(status)).observe(duration);
    httpRequestTotal.labels(method, route, String(status)).inc();
  });
}
