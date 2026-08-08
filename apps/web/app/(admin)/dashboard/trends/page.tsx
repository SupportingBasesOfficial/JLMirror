// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState } from "react";
import { RefreshCw, TrendingUp } from "lucide-react";
import { useApi } from "@/lib/use-api";
import {
  ErrorState,
  EmptyState,
  LoadingState,
} from "@/components/ui/state-display";

interface TrendPoint {
  clock: number;
  value_min: string;
  value_avg: string;
  value_max: string;
  num: number;
}

interface TrendSeries {
  itemid: string;
  points: TrendPoint[];
}

interface TrendsResponse {
  data: TrendSeries[];
}

export default function TrendsPage() {
  const [itemId, setItemId] = useState("");
  const [fromHours, setFromHours] = useState(24);

  const from = Math.floor(Date.now() / 1000) - fromHours * 3600;
  const to = Math.floor(Date.now() / 1000);

  const url = itemId
    ? `/api/zabbix/trends?item_ids=${encodeURIComponent(itemId)}&from=${from}&to=${to}`
    : null;

  const { data, error, isLoading, progress, mutate } =
    useApi<TrendsResponse>(url);

  const series = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp size={20} style={{ color: "var(--brand-primary)" }} />
          <h1
            className="text-xl font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            Trends
          </h1>
        </div>
        <button
          onClick={() => mutate()}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors hover:opacity-80"
          style={{
            background: "var(--brand-glow)",
            border: "1px solid var(--brand-primary)",
            color: "var(--brand-primary)",
          }}
        >
          <RefreshCw size={14} />
          Atualizar
        </button>
      </div>

      <div
        className="flex items-center gap-3 rounded-lg p-3"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border-default)",
        }}
      >
        <input
          type="text"
          placeholder="Item ID..."
          value={itemId}
          onChange={(e) => setItemId(e.target.value)}
          className="flex-1 rounded-lg px-3 py-1.5 text-sm outline-none"
          style={{
            background: "var(--surface-0)",
            border: "1px solid var(--border-default)",
            color: "var(--text-primary)",
          }}
        />
        <select
          value={fromHours}
          onChange={(e) => setFromHours(Number(e.target.value))}
          className="rounded-lg px-3 py-1.5 text-sm outline-none"
          style={{
            background: "var(--surface-0)",
            border: "1px solid var(--border-default)",
            color: "var(--text-primary)",
          }}
        >
          <option value={1}>1 hora</option>
          <option value={6}>6 horas</option>
          <option value={12}>12 horas</option>
          <option value={24}>24 horas</option>
          <option value={168}>7 dias</option>
          <option value={720}>30 dias</option>
        </select>
      </div>

      {error && <ErrorState title="Erro" message={error} />}

      {!itemId ? (
        <EmptyState title="Digite um Item ID para visualizar trends" />
      ) : isLoading ? (
        <LoadingState label="Carregando trends..." progress={progress} />
      ) : series.length === 0 || series[0]?.points.length === 0 ? (
        <EmptyState title="Nenhum dado de trend encontrado" />
      ) : (
        <div className="space-y-3">
          {series.map((s) => (
            <div
              key={s.itemid}
              className="rounded-lg p-4"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border-default)",
              }}
            >
              <h3
                className="text-sm font-medium mb-3"
                style={{ color: "var(--text-primary)" }}
              >
                Item: {s.itemid} — {s.points.length} pontos
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr
                      style={{
                        borderBottom: "1px solid var(--border-default)",
                      }}
                    >
                      <th
                        className="text-left py-2 px-3"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Timestamp
                      </th>
                      <th
                        className="text-right py-2 px-3"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Min
                      </th>
                      <th
                        className="text-right py-2 px-3"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Avg
                      </th>
                      <th
                        className="text-right py-2 px-3"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Max
                      </th>
                      <th
                        className="text-right py-2 px-3"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Amostras
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.points
                      .slice(-50)
                      .reverse()
                      .map((p, i) => (
                        <tr
                          key={i}
                          style={{
                            borderBottom: "1px solid var(--border-subtle)",
                          }}
                        >
                          <td
                            className="py-1.5 px-3"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            {new Date(p.clock * 1000).toLocaleString("pt-BR")}
                          </td>
                          <td
                            className="text-right py-1.5 px-3"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            {p.value_min}
                          </td>
                          <td
                            className="text-right py-1.5 px-3 font-medium"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {p.value_avg}
                          </td>
                          <td
                            className="text-right py-1.5 px-3"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            {p.value_max}
                          </td>
                          <td
                            className="text-right py-1.5 px-3"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {p.num}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
