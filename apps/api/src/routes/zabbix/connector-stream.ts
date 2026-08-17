// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// Endpoint receptor assíncrono para Zabbix connector streaming.
// O Zabbix envia batches de history via HTTP POST para este endpoint.
// Os dados são enfileirados no Redis via BullMQ para processamento em background,
// evitando o bloqueio da Event Loop e exaustão de conexões no PostgreSQL.
//
// ERROR HANDLING MATRIX:
//   401 — Token nao fornecido / token invalido
//   400 — Payload vazio ou inválido
//   500 — Erro interno de enfileiramento

import { Hono } from "hono";
import { query } from "@repo/db";
import { createCacheClient } from "@repo/cache";
import { logger } from "@repo/logger";

export const connectorStreamRoute = new Hono();

// POST /api/v1/zabbix/connector/stream
// Recebe dados do Zabbix connector — autenticado via Bearer token.
connectorStreamRoute.post("/stream", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Token não fornecido" } },
      401,
    );
  }

  const connectorToken = authHeader.slice(7);

  // Busca tenant pelo connector token — query de infraestrutura otimizada.
  // Como chaves do cache usam resolveKey, buscamos o token usando uma query direta.
  const tenantResult = await query<{ tenant_id: string }>(
    `SELECT tenant_id FROM public.tenant_routes
     WHERE zabbix_connector_token = $1 AND status = 'active'`,
    [connectorToken],
  );

  if (tenantResult.error || !tenantResult.data?.rows[0]) {
    return c.json(
      { error: { code: "INVALID_TOKEN", message: "Token inválido" } },
      401,
    );
  }

  const tenantId = tenantResult.data.rows[0].tenant_id;

  try {
    // Captura o corpo bruto como texto para evitar travar o parsing de JSON na thread HTTP principal
    const rawBody = await c.req.text();
    if (
      !rawBody ||
      rawBody.trim() === "" ||
      rawBody === "[]" ||
      rawBody === "{}"
    ) {
      return c.json({ ok: true, received: 0, status: "ignored" });
    }

    // Instancia o cliente redis do package de cache comum para empurrar o job na fila do BullMQ
    const redis = createCacheClient();

    // Cria o contrato do Job para o BullMQ processar de forma assíncrona.
    // Usamos uma estrutura compacta e otimizada para o Redis.
    const jobData = JSON.stringify({
      tenantId,
      payload: rawBody,
      timestamp: Date.now(),
    });

    // Empurra diretamente para a lista do BullMQ nativo do JLMIRROR (bulletproof queue ingest)
    // Nome padrão da fila: zabbix-metrics-queue
    await redis.lpush("bullmq:zabbix-metrics-queue:jobs", jobData);

    // Retorna status 202 Accepted — O padrão enterprise para ingestão assíncrona de webhooks
    c.status(202);
    return c.json({
      ok: true,
      status: "enqueued",
      tenantId,
    });
  } catch (error) {
    logger.error("Erro fatal na ingestão assíncrona do conector stream", {
      tenantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Erro ao enfileirar dados para processamento",
        },
      },
      500,
    );
  }
});

// GET /api/v1/zabbix/connector/health — health check do connector
connectorStreamRoute.get("/health", (c) => {
  return c.json({ status: "ok", service: "zabbix-connector-stream-async" });
});
