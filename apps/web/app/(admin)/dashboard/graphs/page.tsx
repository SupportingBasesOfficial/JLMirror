// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  RefreshCw,
  X,
  ChevronRight,
  BarChart3,
  Server,
  Clock,
} from "lucide-react";
import { useApi } from "@/lib/use-api";
import {
  ErrorState,
  EmptyState,
  LoadingState,
} from "@/components/ui/state-display";
import type { ZabbixGraph } from "@repo/zabbix";
import * as echarts from "echarts";

type GraphSeries = {
  itemid: string;
  name: string;
  key: string;
  units: string;
  color: string;
  drawtype: number;
  points: { clock: number; value: string }[];
};

type GraphDataResponse = {
  data: { graph: ZabbixGraph; series: GraphSeries[] };
};

const TIME_RANGES = [
  { label: "1h", seconds: 3600 },
  { label: "3h", seconds: 10800 },
  { label: "6h", seconds: 21600 },
  { label: "12h", seconds: 43200 },
  { label: "24h", seconds: 86400 },
];

const GRAPH_TYPE_LABELS: Record<number, string> = {
  0: "Linha",
  1: "Linha Preenchida",
  2: "Pizza",
  3: "Pizza Explodida",
  4: "Barras",
};

function GraphChart({
  series,
  graphtype,
}: {
  series: GraphSeries[];
  graphtype?: number;
}) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;
    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
    }

    const isPie = graphtype === 2 || graphtype === 3;
    const isBar = graphtype === 4;

    if (isPie) {
      const lastValues = series.map((s) => ({
        name: s.name,
        value: parseFloat(s.points[s.points.length - 1]?.value ?? "0"),
        itemStyle: { color: s.color },
      }));
      chartInstance.current.setOption(
        {
          tooltip: { trigger: "item" },
          series: [{ type: "pie", radius: "60%", data: lastValues }],
        },
        true,
      );
    } else if (isBar) {
      const categories =
        series[0]?.points.map((p) =>
          new Date(p.clock * 1000).toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        ) ?? [];
      const barSeries = series.map((s) => ({
        name: s.name,
        type: "bar" as const,
        data: s.points.map((p) => parseFloat(p.value)),
        itemStyle: { color: s.color },
      }));
      chartInstance.current.setOption(
        {
          tooltip: { trigger: "axis" },
          legend: { textStyle: { color: "#999", fontSize: 11 }, top: 0 },
          xAxis: {
            type: "category",
            data: categories,
            axisLabel: { color: "#666", fontSize: 10 },
          },
          yAxis: { type: "value", axisLabel: { color: "#666", fontSize: 10 } },
          series: barSeries,
          grid: {
            top: 30,
            bottom: 10,
            left: 50,
            right: 10,
            containLabel: true,
          },
        },
        true,
      );
    } else {
      const lineSeries = series.map((s) => ({
        name: s.name,
        type: "line" as const,
        showSymbol: false,
        smooth: true,
        data: s.points.map((p) => [p.clock * 1000, parseFloat(p.value)]),
        lineStyle: { color: s.color, width: s.drawtype === 2 ? 3 : 1.5 },
        itemStyle: { color: s.color },
        areaStyle:
          s.drawtype === 1 ? { color: s.color, opacity: 0.15 } : undefined,
      }));
      chartInstance.current.setOption(
        {
          tooltip: {
            trigger: "axis",
            formatter: (params: unknown) => {
              const arr = params as Array<{
                axisValue: string;
                seriesName: string;
                value: [number, number];
              }>;
              if (!arr.length) return "";
              const time = new Date(arr[0]!.value[0]).toLocaleString("pt-BR");
              let html = `<div style="font-size:11px">${time}`;
              for (const p of arr) {
                html += `<br/><span style="color:${p.seriesName ? "" : ""}">${p.seriesName}: ${p.value[1]}</span>`;
              }
              html += "</div>";
              return html;
            },
          },
          legend: {
            textStyle: { color: "#999", fontSize: 11 },
            top: 0,
            type: "scroll",
          },
          xAxis: { type: "time", axisLabel: { color: "#666", fontSize: 10 } },
          yAxis: {
            type: "value",
            axisLabel: { color: "#666", fontSize: 10 },
            scale: true,
          },
          series: lineSeries,
          grid: {
            top: 30,
            bottom: 10,
            left: 50,
            right: 10,
            containLabel: true,
          },
        },
        true,
      );
    }

    const handleResize = () => chartInstance.current?.resize();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [series, graphtype]);

  useEffect(() => {
    return () => {
      chartInstance.current?.dispose();
      chartInstance.current = null;
    };
  }, []);

  return <div ref={chartRef} style={{ width: "100%", height: "320px" }} />;
}

function GraphDetailModal({
  graph,
  onClose,
}: {
  graph: ZabbixGraph;
  onClose: () => void;
}) {
  const [timeRange, setTimeRange] = useState(3600);
  const now = Math.floor(Date.now() / 1000);
  const { data, error, isLoading } = useApi<GraphDataResponse>(
    `/api/v1/zabbix/graphs/${graph.graphid}/data?from=${now - timeRange}&to=${now}`,
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        className="rounded-xl w-full max-w-4xl max-h-[90vh] overflow-auto"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-default)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between p-4 border-b"
          style={{ borderColor: "var(--border-default)" }}
        >
          <div>
            <h2
              className="text-lg font-bold"
              style={{ color: "var(--text-primary)" }}
            >
              {graph.name}
            </h2>
            <div
              className="flex items-center gap-3 mt-1 text-[12px]"
              style={{ color: "var(--text-muted)" }}
            >
              {graph.hosts && graph.hosts.length > 0 && (
                <span className="flex items-center gap-1">
                  <Server size={12} />
                  {graph.hosts.map((h) => h.name).join(", ")}
                </span>
              )}
              <span className="flex items-center gap-1">
                <BarChart3 size={12} />
                {GRAPH_TYPE_LABELS[graph.graphtype ?? 0] ?? "Linha"}
              </span>
              <span>
                {graph.width}x{graph.height}px
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 transition-colors hover:opacity-80"
            style={{
              background: "var(--surface-2)",
              color: "var(--text-muted)",
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div
          className="flex items-center gap-1 p-3 border-b"
          style={{ borderColor: "var(--border-default)" }}
        >
          {TIME_RANGES.map((tr) => (
            <button
              key={tr.label}
              onClick={() => setTimeRange(tr.seconds)}
              className="px-2.5 py-1 rounded text-[12px] font-medium transition-colors"
              style={
                timeRange === tr.seconds
                  ? {
                      background: "var(--brand-primary)",
                      color: "var(--surface-0)",
                    }
                  : {
                      background: "var(--surface-2)",
                      color: "var(--text-muted)",
                    }
              }
            >
              {tr.label}
            </button>
          ))}
        </div>

        <div className="p-4">
          {error && (
            <ErrorState title="Erro ao carregar dados" message={error} />
          )}
          {isLoading && <LoadingState label="Buscando dados de history..." />}
          {data?.data && (
            <>
              {data.data.series.length === 0 ||
              data.data.series.every((s) => s.points.length === 0) ? (
                <EmptyState title="Sem dados no periodo selecionado" />
              ) : (
                <GraphChart
                  series={data.data.series}
                  graphtype={graph.graphtype}
                />
              )}
              <div className="mt-4 space-y-1.5">
                <h3
                  className="text-[13px] font-bold"
                  style={{ color: "var(--text-primary)" }}
                >
                  Items neste grafo
                </h3>
                {data.data.series.map((s) => (
                  <div
                    key={s.itemid}
                    className="flex items-center gap-2 text-[12px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <span
                      className="w-3 h-3 rounded"
                      style={{ background: s.color }}
                    />
                    <span style={{ color: "var(--text-primary)" }}>
                      {s.name}
                    </span>
                    {s.units && (
                      <span style={{ color: "var(--text-muted)" }}>
                        ({s.units})
                      </span>
                    )}
                    <span
                      className="ml-auto"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {s.points.length} pontos
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function GraphsPage() {
  const [hostId, setHostId] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [selectedGraph, setSelectedGraph] = useState<ZabbixGraph | null>(null);
  const params = new URLSearchParams();
  if (hostId) params.set("host_id", hostId);
  const { data, error, isLoading, progress, mutate } = useApi<{
    data: ZabbixGraph[];
  }>(`/api/v1/zabbix/graphs?${params.toString()}`);
  const graphs = data?.data ?? [];

  const filteredGraphs = search
    ? graphs.filter((g) => g.name.toLowerCase().includes(search.toLowerCase()))
    : graphs;

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") setSelectedGraph(null);
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-xl font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            Gráficos Zabbix
          </h1>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Grafos customizados do Zabbix com dados em tempo real
          </p>
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

      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Buscar por nome do grafo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded-lg px-3 py-1.5 text-sm outline-none"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border-default)",
            color: "var(--text-primary)",
          }}
        />
        <input
          type="text"
          placeholder="Host ID..."
          value={hostId}
          onChange={(e) => setHostId(e.target.value)}
          className="w-32 rounded-lg px-3 py-1.5 text-sm outline-none"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border-default)",
            color: "var(--text-primary)",
          }}
        />
      </div>

      {error && <ErrorState title="Erro" message={error} />}

      {isLoading ? (
        <LoadingState label="Carregando grafos..." progress={progress} />
      ) : filteredGraphs.length === 0 ? (
        <EmptyState
          title={
            search
              ? "Nenhum grafo encontrado para a busca"
              : "Nenhum grafo configurado no Zabbix"
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredGraphs.map((g, idx) => (
            <button
              key={g.graphid ?? `graph-${idx}`}
              onClick={() => setSelectedGraph(g)}
              className="text-left rounded-lg p-4 transition-all hover:scale-[1.02] cursor-pointer"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border-default)",
              }}
            >
              <div className="flex items-start justify-between mb-2">
                <h3
                  className="text-sm font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  {g.name}
                </h3>
                <ChevronRight
                  size={16}
                  style={{ color: "var(--text-muted)" }}
                />
              </div>
              <div
                className="flex items-center gap-3 text-[11px] mb-2"
                style={{ color: "var(--text-muted)" }}
              >
                <span className="flex items-center gap-1">
                  <BarChart3 size={11} />
                  {GRAPH_TYPE_LABELS[g.graphtype ?? 0] ?? "Linha"}
                </span>
                {g.hosts && g.hosts.length > 0 && (
                  <span className="flex items-center gap-1">
                    <Server size={11} />
                    {g.hosts[0]!.name}
                    {g.hosts.length > 1 ? ` +${g.hosts.length - 1}` : ""}
                  </span>
                )}
              </div>
              {g.gitems && g.gitems.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {g.gitems.slice(0, 5).map((gi, giIdx) => (
                    <span
                      key={gi.gitemid ?? `gitem-${giIdx}`}
                      className="text-[10px] px-1.5 py-0.5 rounded"
                      style={{
                        background: `color-mix(in srgb, ${gi.color} 20%, transparent)`,
                        color: gi.color,
                      }}
                    >
                      {gi.itemid}
                    </span>
                  ))}
                  {g.gitems.length > 5 && (
                    <span
                      className="text-[10px] px-1.5 py-0.5"
                      style={{ color: "var(--text-muted)" }}
                    >
                      +{g.gitems.length - 5} items
                    </span>
                  )}
                </div>
              )}
              <div
                className="flex items-center gap-1 mt-3 text-[10px]"
                style={{ color: "var(--text-muted)" }}
              >
                <Clock size={10} />
                Clique para visualizar dados
              </div>
            </button>
          ))}
        </div>
      )}

      {selectedGraph && (
        <GraphDetailModal
          graph={selectedGraph}
          onClose={() => setSelectedGraph(null)}
        />
      )}
    </div>
  );
}
