// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// Worker industrial de background para escoamento e processamento de telemetria Zabbix.
// Consome jobs da fila assíncrona de métricas e efetua escrita massiva (Bulk Insert)
// no TimescaleDB mitigando overhead de I/O e concorrência na API.
//
// RLS INTEGRATION: Cada lote de tenant executa obrigatoriamente dentro de runWithTenant()
// para garantir que a policy do zabbix_history_cache é respeitada e isolada de forma estrita.

import { runWithTenant } from "@repo/db";
import { withTenantDb, schema } from "@repo/db/drizzle";
import { logger } from "@repo/logger";
import { startWorker } from "./queue.js";

interface MetricsJobPayload {
  tenantId: string;
  payload: string; // JSON string contendo o array de métricas bruto enviado pelo conector
  timestamp: number;
}

interface ZabbixHistoryEntry {
  itemid: string;
  hostid?: string;
  clock: number;
  ns?: number;
  value: string;
  value_type?: number;
}

const QUEUE_NAME = "zabbix-metrics-queue";

/**
 * Inicializa o Worker assíncrono para processar o fluxo de telemetria em lote.
 */
export async function startZabbixMetricsWorker(): Promise<void> {
  startWorker(QUEUE_NAME, async (job) => {
    const { tenantId, payload } = job.data as MetricsJobPayload;

    if (!tenantId || !payload) {
      logger.error(
        "Job de telemetria corrompido ou sem dados de tenant identificados",
        { jobId: job.id },
      );
      return;
    }

    try {
      // Efetua o parsing do JSON em background fora do ciclo de vida das requisições HTTP da API
      const parsedBody = JSON.parse(payload);

      const entries: ZabbixHistoryEntry[] = Array.isArray(parsedBody)
        ? parsedBody
        : (parsedBody.data ?? []);

      if (entries.length === 0) {
        return;
      }

      // Propaga o tenant_id de forma explícita para o AsyncLocalStorage do background process
      await runWithTenant(tenantId, async () => {
        await withTenantDb(async (db) => {
          // Executa o Bulk Insert nativo e otimizado através do Drizzle ORM
          await db.insert(schema.zabbixHistoryCache).values(
            entries.map((e) => ({
              tenantId,
              itemid: e.itemid,
              hostid: e.hostid ?? "0",
              clock: e.clock,
              ns: e.ns ?? 0,
              value: e.value,
              valueType: e.value_type ?? 0,
            })),
          );
        });
      });

      logger.info(
        "Lote de telemetria descarregado com sucesso no TimescaleDB",
        {
          jobId: job.id,
          tenantId,
          metricsProcessed: entries.length,
        },
      );
    } catch (error) {
      logger.error(
        "Falha crítica ao processar lote de métricas em background",
        {
          jobId: job.id,
          tenantId,
          error: error instanceof Error ? error.message : String(error),
        },
      );
      // Lança o erro novamente para que o BullMQ aplique a estratégia de Retry/Backoff configurada na fila
      throw error;
    }
  });

  logger.info("Zabbix metrics background worker iniciado com sucesso", {
    queue: QUEUE_NAME,
  });
}
