// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { closePool, query } from "@repo/db";
import { closeCache } from "@repo/cache";
import { logger } from "@repo/logger";
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
    logger.error("Variaveis de ambiente obrigatorias faltando", { missing });
    process.exit(1);
  }

  logger.info("Validacao de env: OK");
}

// Retry de conexao com DB com backoff exponencial
export async function waitForDatabase(maxRetries: number = 5, baseDelayMs: number = 1000): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = await query("SELECT 1 as ok");
    if (!result.error) {
      logger.info("Conexao com DB estabelecida", { attempt, maxRetries });
      await runMigrations();
      return;
    }

    const delay = baseDelayMs * Math.pow(2, attempt - 1);
    logger.warn("DB indisponivel, tentando novamente", { attempt, maxRetries, delayMs: delay });

    if (attempt === maxRetries) {
      logger.error("Nao foi possivel conectar ao DB", { maxRetries });
      process.exit(1);
    }

    await new Promise(resolve => setTimeout(resolve, delay));
  }
}

// Executa migrations pendentes automaticamente no startup
// Usa pg_advisory_lock para evitar race condition em multi-replica
async function runMigrations(): Promise<void> {
  const { pool } = await import("@repo/db");
  let client;
  try {
    client = await pool().connect();
    // Tenta adquirir lock advisory — ID fixo e arbitrario para migrations
    const lockResult = await client.query("SELECT pg_try_advisory_lock($1) as acquired", [42_001]);
    if (!lockResult.rows[0]?.acquired) {
      logger.warn("Migrations: outra replica ja esta migrando, pulando");
      return;
    }
    logger.info("Lock de migrations adquirido");
    const { runMigrations: migrate } = await import("@repo/db/migrate");
    await migrate();
    logger.info("Migrations aplicadas com sucesso");
  } catch (err) {
    logger.error("Erro ao aplicar migrations", { error: err instanceof Error ? err.message : String(err) });
    // Nao aborta — migrations podem ja estar aplicadas
  } finally {
    if (client) {
      try { await client.query("SELECT pg_advisory_unlock($1)", [42_001]); } catch {}
      client.release();
    }
  }
}

// Graceful shutdown — fecha conexoes e para workers limpinho
let isShuttingDown = false;

export function setupGracefulShutdown(): void {
  const shutdown = async (signal: string) => {
    if (isShuttingDown) {
      logger.warn("Shutdown ja em andamento, sinal ignorado", { signal });
      return;
    }
    isShuttingDown = true;

    logger.info("Sinal recebido, iniciando graceful shutdown", { signal });

    // 1. Para workers em background
    logger.info("Parando task scheduler");
    stopTaskScheduler();

    logger.info("Parando alerting engine");
    stopAlertingEngine();

    logger.info("Parando device sync");
    stopDeviceSync();

    logger.info("Parando partition manager");
    stopPartitionManager();

    logger.info("Parando correlation engine");
    stopCorrelationEngine();

    // 2. Para filas BullMQ e workers
    logger.info("Parando filas BullMQ");
    try {
      await stopAllQueues();
    } catch {
      // Silencioso
    }

    // 3. Fecha Redis
    logger.info("Fechando conexao Redis");
    try {
      await closeCache();
    } catch {
      // Silencioso
    }

    // 4. Fecha pool do Postgres
    logger.info("Fechando pool do Postgres");
    try {
      await closePool();
    } catch {
      // Silencioso
    }

    logger.info("Graceful shutdown concluido");

    // 5. Fecha Sentry
    await Sentry.close(2000).catch(() => {});

    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Previne crash em unhandled rejection — loga e continua
  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled rejection", { reason: reason instanceof Error ? reason.message : String(reason) });
  });

  // Captura exceptions nao tratadas — loga mas nao crasha
  process.on("uncaughtException", (err) => {
    logger.error("Uncaught exception", { error: err.message });
    if (process.env.NODE_ENV === "production") {
      // Em producao, inicia graceful shutdown
      shutdown("uncaughtException");
    }
  });

  logger.info("Graceful shutdown registrado (SIGTERM, SIGINT)");
}
