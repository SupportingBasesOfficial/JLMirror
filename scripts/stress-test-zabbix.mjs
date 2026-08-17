// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
/**
 * JLMIRROR Industrial Stress Test & Load Generator
 * Simula a concorrência massiva de múltiplos proxies Zabbix injetando telemetria em paralelo.
 * Valida a latência da rota assíncrona HTTP e a capacidade de retenção da fila BullMQ.
 */

import { fetch } from "undici";
import crypto from "node:crypto";

// Configurações do Cenário de Stress (Ajusta conforme a severidade pretendida)
const CONFIG = {
  targetUrl: process.env.API_TARGET_URL || "http://localhost:3001/api/v1/zabbix/connector/stream",
  mockToken: process.env.STRESS_CONNECTOR_TOKEN || "mock-zabbix-connector-token-secure-uuid",
  simulatedProxies: 15,     // Número de threads/proxies concorrentes em simultâneo
  batchesPerProxy: 100,     // Quantos pacotes HTTP cada proxy vai cuspir no loop
  metricsPerBatch: 250,     // Quantas métricas de CPU/RAM vão dentro de cada pacote JSON
};

// Métricas Globais de Desempenho
const stats = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  latencies: [],
  startTime: 0,
};

/**
 * Cria um payload sintético simulando o formato nativo do conector Zabbix 7.4
 */
function generateZabbixPayload(size) {
  const data = [];
  const now = Math.floor(Date.now() / 1000);

  for (let i = 0; i < size; i++) {
    data.push({
      itemid: String(100000 + Math.floor(Math.random() * 900000)),
      hostid: String(10000 + Math.floor(Math.random() * 90000)),
      clock: now - Math.floor(Math.random() * 60),
      ns: Math.floor(Math.random() * 999999999),
      value: String((Math.random() * 100).toFixed(4)),
      value_type: Math.random() > 0.5 ? 3 : 0, // Misto entre Float e Numeric
    });
  }
  return JSON.stringify({ data });
}
/**
 * Simula o ciclo de envio contínuo de um Proxy Zabbix isolado
 */
async function runProxySimulation(proxyId) {
  const payload = generateZabbixPayload(CONFIG.metricsPerBatch);
  
  for (let i = 0; i < CONFIG.batchesPerProxy; i++) {
    const requestStart = Date.now();
    stats.totalRequests++;

    try {
      const response = await fetch(CONFIG.targetUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${CONFIG.mockToken}`,
          "Content-Type": "application/json",
          "Connection": "keep-alive" // Reutilização de sockets de alta performance
        },
        body: payload,
      });

      const duration = Date.now() - requestStart;
      stats.latencies.push(duration);

      if (response.status === 202) {
        stats.successfulRequests++;
      } else {
        stats.failedRequests++;
      }
    } catch (err) {
      stats.failedRequests++;
    }
  }
}

/**
 * Orquestrador do Bootstrap de Carga Concorrente Distribuída
 */
async function startStressTest() {
  console.log("=============================================================");
  console.log("🚀 INICIANDO TESTE DE STRESS INDUSTRIAL — JLMIRROR PIPELINE");
  console.log("=============================================================");
  console.log(`🎯 URL Alvo: ${CONFIG.targetUrl}`);
  console.log(`🔥 Proxies Concorrentes: ${CONFIG.simulatedProxies}`);
  console.log(`📦 Pacotes por Proxy: ${CONFIG.batchesPerProxy}`);
  console.log(`📊 Métricas por Pacote: ${CONFIG.metricsPerBatch}`);
  console.log(`📈 Carga Total Planeada: ${CONFIG.simulatedProxies * CONFIG.batchesPerProxy} requisições`);
  console.log(`🧮 Volume de Telemetria: ${CONFIG.simulatedProxies * CONFIG.batchesPerProxy * CONFIG.metricsPerBatch} métricas`);
  console.log("-------------------------------------------------------------");

  stats.startTime = Date.now();

  // Execução em paralelo massivo via Barramento de Promises Controlado
  const proxyPromises = [];
  for (let i = 0; i < CONFIG.simulatedProxies; i++) {
    proxyPromises.push(runProxySimulation(i));
  }

  await Promise.all(proxyPromises);

  const totalTimeSec = (Date.now() - stats.startTime) / 1000;
  const avgLatency = stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length;
  const maxLatency = Math.max(...stats.latencies);
  const rps = (stats.totalRequests / totalTimeSec).toFixed(2);
  const totalMetrics = stats.successfulRequests * CONFIG.metricsPerBatch;

  console.log("\n=============================================================");
  console.log("📊 RELATÓRIO ANALÍTICO DE RESILIÊNCIA CORE");
  console.log("=============================================================");
  console.log(`⏱️  Tempo Total de Execução: ${totalTimeSec.toFixed(2)} segundos`);
  console.log(`✅ Requisições com Sucesso (202 Accepted): ${stats.successfulRequests}`);
  console.log(`❌ Requisições Falhadas/Timeout: ${stats.failedRequests}`);
  console.log(`⚡ Taxa de Transferência (RPS): ${rps} req/sec`);
  console.log(`📥 Métricas Injetadas na Fila Redis: ${totalMetrics.toLocaleString()} itens`);
  console.log(`🕒 Latência Média de Ingestão: ${avgLatency.toFixed(2)} ms`);
  console.log(`🎚️  Latência Máxima Registada: ${maxLatency} ms`);
  console.log("-------------------------------------------------------------");
  
  if (avgLatency <= 5 && stats.failedRequests === 0) {
    console.log("🏆 VEREDITO ARCHITECTURE BOARD: INDESTRUTÍVEL (PERFORMANCE ELITE) 🔥");
  } else if (stats.failedRequests > 0) {
    console.log("⚠️  VEREDITO ARCHITECTURE BOARD: FRÁGIL (SURAQUE DE CONEXÕES DETETADO)");
  } else {
    console.log("ℹ️  VEREDITO ARCHITECTURE BOARD: OPERACIONAL EM LIMITES NORMAIS");
  }
  console.log("=============================================================\n");
}

startStressTest();
