// @ai-context: .zero-error/architecture-map.md#state-store
// @ai-restriction: .zero-error/code-standards.md#error-handling
/**
 * JLMIRROR Logic Core — Motor de Análise e Agregação de Telemetria Zabbix
 * Centraliza e encapsula todas as lógicas de negócio analíticas, cálculos de lote
 * e downsampling temporais independentemente do protocolo HTTP.
 */

import { withTenantDb, schema } from "@repo/db/drizzle";
import { eq, and, gte, lte, asc } from "drizzle-orm";
import { downsamplePoints } from "./downsample.js";

export interface TimePoint {
  clock: number;
  value: string;
}

/**
 * Recupera e trata o histórico bruto de telemetria diretamente do TimescaleDB (Hypertable)
 */
export async function getHistoryFromCache(
  itemId: string,
  from: number,
  to: number,
): Promise<TimePoint[] | null> {
  try {
    const rows = await withTenantDb(async (db) => {
      return db
        .select({
          clock: schema.zabbixHistoryCache.clock,
          value: schema.zabbixHistoryCache.value,
        })
        .from(schema.zabbixHistoryCache)
        .where(
          and(
            eq(schema.zabbixHistoryCache.itemid, itemId),
            gte(schema.zabbixHistoryCache.clock, from),
            lte(schema.zabbixHistoryCache.clock, to),
          ),
        )
        .orderBy(asc(schema.zabbixHistoryCache.clock))
        .limit(5000);
    });

    if (!rows.length) return null;

    return rows.map((r) => ({
      clock: Number(r.clock),
      value: r.value,
    }));
  } catch {
    return null;
  }
}

/**
 * Processa e executa a redução de resolução (downsampling) contínua de pontos para gráficos
 */
export function processTimeSeries(
  points: TimePoint[],
  targetLimit: number = 500,
) {
  const rawPoints = points.map((p) => ({ clock: p.clock, value: p.value }));
  return {
    points: downsamplePoints(rawPoints, targetLimit),
    downsampled: rawPoints.length > targetLimit,
  };
}

/**
 * Agrupa de forma matricial e analítica coleções em massa de dados de lote por itemid
 */
export function processBatchSeries(
  itemIds: string[],
  rawHistory: Array<{ itemid: string; clock: number; value: string }>,
  targetLimit: number = 500,
) {
  return itemIds.map((itemId) => {
    const matchedPoints = rawHistory
      .filter((h) => h.itemid === itemId)
      .map((h) => ({ clock: h.clock, value: h.value }));

    return {
      itemid: itemId,
      points: downsamplePoints(matchedPoints, targetLimit),
      downsampled: matchedPoints.length > targetLimit,
    };
  });
}
export interface ZabbixProblemRaw {
  eventid: string;
  severity: number; // Alterado para number para paridade total com o @repo/zabbix
  acknowledged: string;
  name: string;
}

export interface SeveritySummary {
  info: number;
  warning: number;
  average: number;
  high: number;
  disaster: number;
  total: number;
}

/**
 * Computa de forma linear e otimizada o sumário matricial de severidades do NOC.
 * Evita que o frontend processe milhares de arrays em runtime na thread visual.
 */
export function aggregateProblemSeverity(
  problems: ZabbixProblemRaw[],
): SeveritySummary {
  const summary: SeveritySummary = {
    info: 0,
    warning: 0,
    average: 0,
    high: 0,
    disaster: 0,
    total: 0,
  };

  if (!Array.isArray(problems)) return summary;

  for (let i = 0; i < problems.length; i++) {
    const p = problems[i];
    if (!p) continue;

    summary.total++;
    const sev = p.severity;

    // Comparações simplificadas e diretas por número nativo
    if (sev === 1) summary.info++;
    else if (sev === 2) summary.warning++;
    else if (sev === 3) summary.average++;
    else if (sev === 4) summary.high++;
    else if (sev === 5) summary.disaster++;
  }

  return summary;
}
import type { ZabbixItem } from "@repo/zabbix";

/**
 * Agrupa de forma linear e fortemente tipada uma coleção de itens Zabbix por Host ID.
 * Cria um índice em dicionário ideal para consumo ultra-rápido no frontend Web/Mobile.
 */
export function groupZabbixItemsByHost(
  items: ZabbixItem[],
): Record<string, ZabbixItem[]> {
  const itemsByHost: Record<string, ZabbixItem[]> = {};

  if (!Array.isArray(items)) return itemsByHost;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item || !item.hostid) continue;

    if (!itemsByHost[item.hostid]) {
      itemsByHost[item.hostid] = [];
    }

    // CORREÇÃO: Uso do operador ! para garantir conformidade estrita ao compilador
    itemsByHost[item.hostid]!.push(item);
  }

  return itemsByHost;
}
