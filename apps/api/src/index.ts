import { Buffer } from "node:buffer";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { config as loadEnv } from "dotenv";
import * as Sentry from "@sentry/node";

import { healthRoute } from "./routes/health.js";
import { authRoute } from "./routes/auth.js";
import { mfaRoute } from "./routes/mfa.js";
import { auditRoute } from "./routes/audit.js";
import { rbacRoute } from "./routes/rbac.js";
import { logsRoute } from "./routes/logs.js";
import { tracesRoute } from "./routes/traces.js";
import { scriptsRoute } from "./routes/scripts.js";
import { executionsRoute } from "./routes/executions.js";
import { firewallRoute } from "./routes/firewall.js";
import { k8sRoute } from "./routes/k8s.js";
import { sslRoute } from "./routes/ssl.js";
import { backupRoute } from "./routes/backup.js";
import { notificationRoute } from "./routes/notifications.js";
import { assetRoute } from "./routes/assets.js";
import { capacityRoute } from "./routes/capacity.js";
import { complianceRoute } from "./routes/compliance.js";
import { ticketRoute } from "./routes/tickets.js";
import { kbRoute } from "./routes/kb.js";
import { systemHealthRoute } from "./routes/system-health.js";
import { apiKeyRoute } from "./routes/api-keys.js";
import { webhookRoute } from "./routes/webhooks.js";
import { taskRoute } from "./routes/tasks.js";
import { dataTransferRoute } from "./routes/data-transfer.js";
import { lgpdRoute } from "./routes/lgpd.js";
import { escalationRoute } from "./routes/escalation.js";
import { patchRoute } from "./routes/patches.js";
import { securityAuditRoute } from "./routes/security-audit.js";
import { correlationRoute } from "./routes/correlation.js";
import { workflowRoute } from "./routes/workflows.js";
import { pushRoute } from "./routes/push.js";
import { clientPortalRoute } from "./routes/client-portal.js";
import { chatopsRoute } from "./routes/chatops.js";
import { statusPageRoute } from "./routes/status-page.js";
import { driftRoute } from "./routes/drift.js";
import { itsmRoute } from "./routes/itsm.js";
import { discoveryRoute } from "./routes/discovery.js";
import { anomalyRoute } from "./routes/anomaly.js";
import { predictionRoute } from "./routes/predictions.js";
import { finopsRoute } from "./routes/finops.js";
import { marketplaceRoute } from "./routes/marketplace.js";
import { featureFlagRoute } from "./routes/feature-flags.js";
import { profileRoute } from "./routes/profile.js";
import { settingsRoute } from "./routes/settings.js";
import { executiveDashboardRoute } from "./routes/executive-dashboard.js";
import { reportsRoute } from "./routes/reports.js";
import { changesRoute } from "./routes/changes.js";
import { adminRoute } from "./routes/admin.js";
import { dashboardRoute } from "./routes/dashboard.js";
import { slaRoute } from "./routes/sla.js";
import { wsRoute, setupWebSocket } from "./routes/ws.js";
import type { Server } from "http";
import { devicesRoute } from "./routes/devices.js";
import { monitoringRoute } from "./routes/monitoring.js";
import { zabbixRoute } from "./routes/zabbix.js";
import { docsRoute } from "./routes/docs.js";
import { errorHandler } from "./middleware/error-handler.js";
import { requestLogger } from "./middleware/request-logger.js";
import { jwtAuth } from "./middleware/jwt-auth.js";
import { tenantContext } from "./middleware/tenant-context.js";
import { tracingMiddleware } from "./middleware/tracing.js";
import { corsMiddleware } from "./middleware/cors.js";
import { securityHeaders } from "./middleware/security-headers.js";
import { compressionMiddleware } from "./middleware/compression.js";
import { rateLimitApi, rateLimitAuth } from "./middleware/rate-limit.js";
import { bodySizeLimit, requestTimeout } from "./middleware/body-size-limit.js";
import { logIngestionMiddleware } from "./middleware/log-ingestion.js";
import { auditMiddleware } from "./middleware/audit.js";
import { metricsRoute, recordRequest } from "./routes/metrics.js";
import { apmRoute } from "./routes/apm.js";
import { startTaskScheduler } from "./lib/task-scheduler.js";
import { startAlertingEngine } from "./lib/alerting-engine.js";
import { startDeviceSync } from "./lib/device-sync.js";
import { startPartitionManager } from "./lib/partition-manager.js";
import { startCorrelationEngine } from "./lib/correlation-engine.js";
import { initializeSecrets } from "@repo/secrets";
import { validateEnv, waitForDatabase, setupGracefulShutdown } from "./lib/lifecycle.js";
import "./types.js";

loadEnv();

// Inicializa Sentry no backend — captura exceções não tratadas e erros 500
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: 0.1,
    profilesSampleRate: 0.1,
  });
  console.warn("[startup] Sentry inicializado no backend");
} else {
  console.warn("[startup] SENTRY_DSN não configurado — Sentry desativado");
}

// Inicializa registry de segredos com suporte a rotação dinâmica
initializeSecrets();

// Decodifica chaves JWT de base64 para PEM — necessário porque o .env não suporta multi-line.
function decodeBase64Key(encoded: string | undefined): string | undefined {
  if (!encoded) return undefined;
  if (encoded.includes("BEGIN ")) {
    return encoded;
  }
  return Buffer.from(encoded, "base64").toString("utf-8");
}

process.env.JWT_PRIVATE_KEY = decodeBase64Key(process.env.JWT_PRIVATE_KEY);
process.env.JWT_PUBLIC_KEY = decodeBase64Key(process.env.JWT_PUBLIC_KEY);

const app = new Hono();

// Captura exceções não tratadas e envia ao Sentry com contexto HTTP
app.onError((err, c) => {
  const correlationId = c.get("correlationId") as string | undefined;

  Sentry.captureException(err, {
    level: "error",
    contexts: {
      http: {
        method: c.req.method,
        url: c.req.url,
        path: c.req.path,
      },
      ...(correlationId ? { correlation: { id: correlationId } } : {}),
    },
  });

  const msg = err instanceof Error ? err.message : "Erro interno do servidor";
  return c.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: msg,
        ...(correlationId ? { correlation_id: correlationId } : {}),
      },
    },
    500,
  );
});

// Middlewares globais — ordem importa: security headers -> CORS -> compression -> logging -> error handler -> tracing -> body limits -> timeout
app.use("*", securityHeaders);
app.use("*", corsMiddleware);
app.use("*", compressionMiddleware);
app.use("*", requestLogger);
app.use("*", errorHandler);
app.use("*", tracingMiddleware());
app.use("*", logIngestionMiddleware);
app.use("*", bodySizeLimit());
app.use("*", requestTimeout(30_000));
app.use("*", rateLimitApi);

// Rotas públicas (sem autenticação)
app.route("/api/v1/health", healthRoute);
app.route("/api/v1/metrics", metricsRoute);
app.route("/api/v1/docs", docsRoute);
app.use("/api/v1/auth/*", rateLimitAuth);
app.route("/api/v1/auth", authRoute);

// Middlewares de autenticação e isolamento de tenant
// Padrão sem /* para garantir que o Hono matcheie tanto a rota raiz quanto sub-rotas
const protectedPaths = [
  "/api/v1/devices",
  "/api/v1/monitoring",
  "/api/v1/zabbix",
  "/api/v1/mfa",
  "/api/v1/audit",
  "/api/v1/rbac",
  "/api/v1/logs",
  "/api/v1/traces",
  "/api/v1/scripts",
  "/api/v1/executions",
  "/api/v1/firewall",
  "/api/v1/k8s",
  "/api/v1/ssl",
  "/api/v1/backups",
  "/api/v1/notifications",
  "/api/v1/assets",
  "/api/v1/capacity",
  "/api/v1/compliance",
  "/api/v1/tickets",
  "/api/v1/kb",
  "/api/v1/system-health",
  "/api/v1/api-keys",
  "/api/v1/webhooks",
  "/api/v1/tasks",
  "/api/v1/data-transfer",
  "/api/v1/feature-flags",
  "/api/v1/profile",
  "/api/v1/settings",
  "/api/v1/dashboard/executive",
  "/api/v1/reports",
  "/api/v1/changes",
  "/api/v1/admin",
  "/api/v1/dashboard",
  "/api/v1/dashboard/overview",
  "/api/v1/sla",
  "/api/v1/apm",
  "/api/v1/client-portal",
];

for (const p of protectedPaths) {
  app.use(p, jwtAuth);
  app.use(p, tenantContext);
  app.use(p, auditMiddleware);
  app.use(p + "/*", jwtAuth);
  app.use(p + "/*", tenantContext);
  app.use(p + "/*", auditMiddleware);
}

// Rotas protegidas
app.route("/api/v1/devices", devicesRoute);
app.route("/api/v1/monitoring", monitoringRoute);
app.route("/api/v1/zabbix", zabbixRoute);
app.route("/api/v1/mfa", mfaRoute);
app.route("/api/v1/audit", auditRoute);
app.route("/api/v1/rbac", rbacRoute);
app.route("/api/v1/logs", logsRoute);
app.route("/api/v1/traces", tracesRoute);
app.route("/api/v1/scripts", scriptsRoute);
app.route("/api/v1/executions", executionsRoute);
app.route("/api/v1/firewall", firewallRoute);
app.route("/api/v1/k8s", k8sRoute);
app.route("/api/v1/ssl", sslRoute);
app.route("/api/v1/backups", backupRoute);
app.route("/api/v1/notifications", notificationRoute);
app.route("/api/v1/assets", assetRoute);
app.route("/api/v1/capacity", capacityRoute);
app.route("/api/v1/compliance", complianceRoute);
app.route("/api/v1/tickets", ticketRoute);
app.route("/api/v1/kb", kbRoute);
app.route("/api/v1/system-health", systemHealthRoute);
app.route("/api/v1/api-keys", apiKeyRoute);
app.route("/api/v1/webhooks", webhookRoute);
app.route("/api/v1/tasks", taskRoute);
app.route("/api/v1/data-transfer", dataTransferRoute);
app.route("/api/v1/lgpd", lgpdRoute);
app.route("/api/v1/escalation", escalationRoute);
app.route("/api/v1/patches", patchRoute);
app.route("/api/v1/security-audit", securityAuditRoute);
app.route("/api/v1/correlation", correlationRoute);
app.route("/api/v1/workflows", workflowRoute);
app.route("/api/v1/push", pushRoute);
app.route("/api/v1/client-portal", clientPortalRoute);
app.route("/api/v1/chatops", chatopsRoute);
app.route("/api/v1/status-page", statusPageRoute);
app.route("/api/v1/drift", driftRoute);
app.route("/api/v1/itsm", itsmRoute);
app.route("/api/v1/discovery", discoveryRoute);
app.route("/api/v1/anomaly", anomalyRoute);
app.route("/api/v1/predictions", predictionRoute);
app.route("/api/v1/finops", finopsRoute);
app.route("/api/v1/marketplace", marketplaceRoute);
app.route("/api/v1/feature-flags", featureFlagRoute);
app.route("/api/v1/profile", profileRoute);
app.route("/api/v1/settings", settingsRoute);
app.route("/api/v1/dashboard/executive", executiveDashboardRoute);
app.route("/api/v1/reports", reportsRoute);
app.route("/api/v1/changes", changesRoute);
app.route("/api/v1/admin", adminRoute);
app.route("/api/v1/dashboard", dashboardRoute);
app.route("/api/v1/sla", slaRoute);
app.route("/api/v1/apm", apmRoute);
app.route("/api/v1/ws", wsRoute);

// Middleware de métricas Prometheus — registra todas as requests
app.use("*", async (c, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;
  recordRequest(c.req.method, c.res.status, duration);
});

const port = Number(process.env.API_PORT ?? 3001);

// Startup sequence: valida env -> espera DB -> inicia servidor -> workers -> graceful shutdown
async function bootstrap(): Promise<void> {
  validateEnv();
  await waitForDatabase();
  setupGracefulShutdown();

  const server = serve(
    {
      fetch: app.fetch,
      port,
    },
    (info) => {
      console.warn(`API JLMIRROR rodando em http://localhost:${info.port} (WebSocket em ws://localhost:${info.port}/ws)`);
    },
  );

  // Hook WebSocket no server HTTP retornado por serve()
  setupWebSocket(server as unknown as Server);

  // Inicia workers em background via BullMQ (filas duráveis Redis)
  await startTaskScheduler();
  await startAlertingEngine();
  await startDeviceSync();
  await startPartitionManager();
  await startCorrelationEngine();
}

void bootstrap();
