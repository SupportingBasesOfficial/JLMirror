// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// Worker para processar operacoes de escrita no Zabbix de forma serializada
// Evita deadlocks no banco do Zabbix quando multiplos usuarios fazem writes simultaneos
// Notifica o usuario via WebSocket quando o job completa ou falha

import { query } from "@repo/db";
import { logger } from "@repo/logger";
import { BlindedZabbixClient, decryptTokenParts } from "@repo/zabbix";
import { startWorker } from "./queue.js";
import { pushNotificationToUser } from "../routes/ws.js";

// Interface do job de escrita Zabbix
interface ZabbixWriteJobData {
  tenantId: string;
  userId: string;
  operation: string;
  method: string;
  params: Record<string, unknown>;
}

const QUEUE_NAME = "zabbix-write";

// Inicia o worker que processa writes no Zabbix
export async function startZabbixWriteWorker(): Promise<void> {
  // Nao e repeatable — apenas worker para jobs ad-hoc
  startWorker(QUEUE_NAME, async (job) => {
    const data = job.data as ZabbixWriteJobData;
    const { tenantId, userId, operation, method, params } = data;

    logger.info("Processando write Zabbix", {
      jobId: job.id,
      tenantId,
      operation,
      method,
    });

    try {
      // Busca config do tenant para criar client
      const configResult = await query<{
        zabbix_api_url: string;
        zabbix_encrypted_token: string;
        zabbix_token_iv: string;
        zabbix_token_tag: string;
      }>(
        `SELECT zabbix_api_url, zabbix_encrypted_token, zabbix_token_iv, zabbix_token_tag
         FROM public.tenant_routes
         WHERE tenant_id = $1 AND status = 'active'`,
        [tenantId],
      );

      if (configResult.error || !configResult.data?.rows[0]) {
        throw new Error("Config Zabbix nao encontrada para o tenant");
      }

      const config = configResult.data.rows[0];
      const apiToken = decryptTokenParts(
        config.zabbix_encrypted_token,
        config.zabbix_token_iv,
        config.zabbix_token_tag,
      );

      if (!apiToken) {
        throw new Error("Falha ao descriptografar token Zabbix");
      }

      const client = new BlindedZabbixClient({
        apiUrl: config.zabbix_api_url,
        apiToken,
      });

      // Executa a operacao no Zabbix
      const result = await client.rpc<unknown>(method, params);

      logger.info("Write Zabbix concluido", {
        jobId: job.id,
        tenantId,
        operation,
      });

      // Notifica o usuario via WebSocket
      await pushNotificationToUser(tenantId, userId, {
        type: "zabbix_write_complete",
        jobId: job.id,
        operation,
        status: "success",
        result,
      });

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Erro desconhecido";

      logger.error("Write Zabbix falhou", {
        jobId: job.id,
        tenantId,
        operation,
        error: errorMessage,
      });

      // Notifica o usuario via WebSocket sobre a falha
      await pushNotificationToUser(tenantId, userId, {
        type: "zabbix_write_complete",
        jobId: job.id,
        operation,
        status: "error",
        error: errorMessage,
      });

      throw error;
    }
  });

  logger.info("Zabbix write worker iniciado", { queue: QUEUE_NAME });
}

// Enfileira um job de escrita no Zabbix
export async function enqueueZabbixWrite(
  data: ZabbixWriteJobData,
): Promise<string | undefined> {
  const { getQueue } = await import("./queue.js");
  const queue = getQueue(QUEUE_NAME);
  const job = await queue.add(data.operation, data, {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
  });
  return job.id;
}
