// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { closePool, query } from "@repo/db";
import { closeCache } from "@repo/cache";
import { stopTaskScheduler } from "./task-scheduler.js";
import { stopAlertingEngine } from "./alerting-engine.js";
import { stopDeviceSync } from "./device-sync.js";
import { stopPartitionManager } from "./partition-manager.js";
import { stopCorrelationEngine } from "./correlation-engine.js";
import { stopAllQueues } from "./queue.js";
import * as Sentry from "@sentry/node";

// Variáveis de ambiente obrigatórias em produção
const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "JWT_PRIVATE_KEY",
  "JWT_PUBLIC_KEY",
  "JWT_ISSUER",
  "JWT_AUDIENCE",
];

const REQUIRED_ENV_VARS_PRODUCTION = [
  "REDIS_URL",
  "CORS_ALLOWED_ORIGINS",
];

// Valida ambiente na inicialização — falha fast se variáveis críticas faltam
export function validateEnv(): void {
  const missing: string[] = [];

  for (const envVar of REQUIRED_ENV_VARS) {
     
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }

  if (process.env.NODE_ENV === "production") {
    for (const envVar of REQUIRED_ENV_VARS_PRODUCTION) {
       
      if (!process.env[envVar]) {
        missing.push(envVar);
      }
    }
  }

  if (missing.length > 0) {
    console.error("[startup] Variaveis de ambiente obrigatorias faltando:");
    missing.forEach(v => console.error(`  - ${v}`));
    process.exit(1);
  }

  console.warn("[startup] Validacao de env: OK");
}

// Retry de conexao com DB com backoff exponencial
export async function waitForDatabase(maxRetries: number = 5, baseDelayMs: number = 1000): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = await query("SELECT 1 as ok");
    if (!result.error) {
      console.warn(`[startup] Conexao com DB estabelecida (tentativa ${attempt}/${maxRetries})`);
      await runMigrations();
      return;
    }

    const delay = baseDelayMs * Math.pow(2, attempt - 1);
    console.warn(`[startup] DB indisponivel (tentativa ${attempt}/${maxRetries}), tentando novamente em ${delay}ms...`);

    if (attempt === maxRetries) {
      console.error(`[startup] Nao foi possivel conectar ao DB apos ${maxRetries} tentativas`);
      process.exit(1);
    }

    await new Promise(resolve => setTimeout(resolve, delay));
  }
}

// Executa migrations pendentes automaticamente no startup
async function runMigrations(): Promise<void> {
  try {
    const { runMigrations: migrate } = await import("@repo/db/migrate");
    await migrate();
    console.warn("[startup] Migrations aplicadas com sucesso");
  } catch (err) {
    console.error("[startup] Erro ao aplicar migrations:", err instanceof Error ? err.message : String(err));
    // Nao aborta — migrations podem ja estar aplicadas
  }
}

// Graceful shutdown — fecha conexoes e para workers limpinho
let isShuttingDown = false;

export function setupGracefulShutdown(): void {
  const shutdown = async (signal: string) => {
    if (isShuttingDown) {
      console.warn(`[shutdown] Ja em andamento (${signal} ignorado)`);
      return;
    }
    isShuttingDown = true;

    console.warn(`[shutdown] Sinal ${signal} recebido — iniciando graceful shutdown`);

    // 1. Para workers em background
    console.warn("[shutdown] Parando task scheduler...");
    stopTaskScheduler();

    console.warn("[shutdown] Parando alerting engine...");
    stopAlertingEngine();

    console.warn("[shutdown] Parando device sync...");
    stopDeviceSync();

    console.warn("[shutdown] Parando partition manager...");
    stopPartitionManager();

    console.warn("[shutdown] Parando correlation engine...");
    stopCorrelationEngine();

    // 2. Para filas BullMQ e workers
    console.warn("[shutdown] Parando filas BullMQ...");
    try {
      await stopAllQueues();
    } catch {
      // Silencioso
    }

    // 3. Fecha Redis
    console.warn("[shutdown] Fechando conexao Redis...");
    try {
      await closeCache();
    } catch {
      // Silencioso
    }

    // 4. Fecha pool do Postgres
    console.warn("[shutdown] Fechando pool do Postgres...");
    try {
      await closePool();
    } catch {
      // Silencioso
    }

    console.warn("[shutdown] Graceful shutdown concluido");

    // 5. Fecha Sentry
    await Sentry.close(2000).catch(() => {});

    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Previne crash em unhandled rejection — loga e continua
  process.on("unhandledRejection", (reason) => {
    console.error("[startup] Unhandled rejection:", reason instanceof Error ? reason.message : String(reason));
  });

  // Captura exceptions nao tratadas — loga mas nao crasha
  process.on("uncaughtException", (err) => {
    console.error("[startup] Uncaught exception:", err.message);
    if (process.env.NODE_ENV === "production") {
      // Em producao, inicia graceful shutdown
      shutdown("uncaughtException");
    }
  });

  console.warn("[startup] Graceful shutdown registrado (SIGTERM, SIGINT)");
}
