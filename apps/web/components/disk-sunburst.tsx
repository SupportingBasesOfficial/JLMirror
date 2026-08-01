// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import * as echarts from "echarts/core";
import { SunburstChart } from "echarts/charts";
import { TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([SunburstChart, TooltipComponent, CanvasRenderer]);

interface SunburstNode {
  name: string;
  value: number;
  children?: SunburstNode[];
}

interface DiskSunburstProps {
  data: SunburstNode[];
}

const COLORS_PALETTE = [
  "#1BA898",
  "#35D0C4",
  "#3AA0FF",
  "#8E7CFF",
  "#F5A623",
  "#E5484D",
  "#3DD68C",
];

function formatBytes(bytes: number): string {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + " GB";
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + " MB";
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + " KB";
  return bytes + " B";
}

function useMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

interface SelectedNode {
  name: string;
  value: number;
  path: string;
  percentOfTotal: number;
  percentOfParent: number;
  children: { name: string; value: number; percent: number }[];
}

function findNodeByPath(data: SunburstNode[], pathParts: string[]): { node: SunburstNode; parent: SunburstNode | null } | null {
  let currentLevel: SunburstNode[] = data;
  let parent: SunburstNode | null = null;
  let node: SunburstNode | null = null;

  for (const part of pathParts) {
    const found = currentLevel.find((n) => n.name === part);
    if (!found) return null;
    parent = node;
    node = found;
    currentLevel = found.children ?? [];
  }

  if (!node) return null;
  return { node, parent };
}

function getTotalValue(data: SunburstNode[]): number {
  return data.reduce((sum, n) => sum + n.value, 0);
}

export function DiskSunburst({ data }: DiskSunburstProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const [selected, setSelected] = useState<SelectedNode | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<string[]>([]);
  const mounted = useMounted();

  const totalSize = getTotalValue(data);

  useEffect(() => {
    if (!chartRef.current || !mounted) return;

    const chart = echarts.init(chartRef.current, undefined, { renderer: "canvas" });
    chartInstance.current = chart;

    const option: echarts.EChartsCoreOption = {
      backgroundColor: "transparent",
      tooltip: {
        backgroundColor: "#10171C",
        borderColor: "#1E2530",
        borderWidth: 1,
        textStyle: {
          color: "#C9D4DA",
          fontFamily: "'JetBrains Mono','Consolas',monospace",
          fontSize: 11,
        },
        formatter: (params: { name: string; value: number; treePathInfo: { name: string }[] }) => {
          const percent = ((params.value / totalSize) * 100).toFixed(1);
          return `<b>${params.name}</b><br/>${formatBytes(params.value)} · ${percent}% do total`;
        },
      },
      series: [
        {
          type: "sunburst",
          data: data,
          radius: ["15%", "95%"],
          center: ["50%", "52%"],
          sort: "desc",
          nodeClick: false,
          roam: false,
          emphasis: {
            focus: "ancestor",
            itemStyle: {
              shadowBlur: 12,
              shadowColor: "rgba(27, 168, 152, 0.4)",
            },
          },
          levels: [
            {},
            {
              r0: "15%",
              r: "40%",
              itemStyle: {
                borderWidth: 3,
                borderColor: "#0B1015",
                color: (params: { dataIndex: number }) => COLORS_PALETTE[params.dataIndex % COLORS_PALETTE.length],
              },
              label: {
                show: true,
                color: "#fff",
                fontFamily: "'JetBrains Mono','Consolas',monospace",
                fontSize: 11,
                fontWeight: "bold",
                rotate: 0,
              },
            },
            {
              r0: "40%",
              r: "70%",
              itemStyle: {
                borderWidth: 2,
                borderColor: "#0B1015",
                color: (params: { dataIndex: number }) => {
                  const adjusted = COLORS_PALETTE[params.dataIndex % COLORS_PALETTE.length];
                  return adjusted + "CC";
                },
              },
              label: {
                show: true,
                color: "#C9D4DA",
                fontFamily: "'JetBrains Mono','Consolas',monospace",
                fontSize: 10,
                rotate: "tangential",
              },
            },
            {
              r0: "70%",
              r: "95%",
              itemStyle: {
                borderWidth: 1,
                borderColor: "#0B1015",
                color: (params: { dataIndex: number }) => {
                  const adjusted = COLORS_PALETTE[params.dataIndex % COLORS_PALETTE.length];
                  return adjusted + "88";
                },
              },
              label: {
                show: false,
              },
            },
          ],
          animationDuration: 600,
          animationEasing: "cubicOut",
        },
      ],
    };

    chart.setOption(option);

    const handleClick = (params: unknown) => {
      const p = params as { name: string; value: number; treePathInfo?: { name: string }[] };
      if (!p.treePathInfo) return;
      const pathParts = p.treePathInfo.map((info) => info.name).filter((n) => n && n !== "root");
      if (pathParts.length === 0) return;

      const found = findNodeByPath(data, pathParts);
      if (!found) return;

      const { node, parent } = found;
      const parentValue = parent ? parent.value : totalSize;
      const percentOfTotal = (node.value / totalSize) * 100;
      const percentOfParent = (node.value / parentValue) * 100;

      const children = (node.children ?? [])
        .map((c) => ({
          name: c.name,
          value: c.value,
          percent: (c.value / node.value) * 100,
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8);

      setSelected({
        name: node.name,
        value: node.value,
        path: pathParts.join(" > "),
        percentOfTotal,
        percentOfParent,
        children,
      });
      setBreadcrumb(pathParts);
    };

    chart.on("click", handleClick as (params: unknown) => void);

    const handleResize = () => chart.resize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.dispose();
      chartInstance.current = null;
    };
  }, [data, mounted, totalSize]);

  const handleBreadcrumbClick = (index: number) => {
    if (index === -1) {
      setSelected(null);
      setBreadcrumb([]);
      return;
    }

    const pathParts = breadcrumb.slice(0, index + 1);
    const found = findNodeByPath(data, pathParts);
    if (!found) return;

    const { node, parent } = found;
    const parentValue = parent ? parent.value : totalSize;
    const children = (node.children ?? [])
      .map((c) => ({
        name: c.name,
        value: c.value,
        percent: (c.value / node.value) * 100,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    setSelected({
      name: node.name,
      value: node.value,
      path: pathParts.join(" > "),
      percentOfTotal: (node.value / totalSize) * 100,
      percentOfParent: (node.value / parentValue) * 100,
      children,
    });
    setBreadcrumb(pathParts);
  };

  if (!mounted) {
    return (
      <div style={{ height: 380, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "var(--text-muted)", fontSize: 11, fontFamily: "'JetBrains Mono','Consolas',monospace" }}>
          Carregando mapa de disco...
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
      {/* Sunburst chart */}
      <div style={{ flex: "1 1 380px", minWidth: 320 }}>
        {/* Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
          <button
            onClick={() => handleBreadcrumbClick(-1)}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--brand-primary)",
              cursor: "pointer",
              fontSize: 10,
              fontFamily: "'JetBrains Mono','Consolas',monospace",
              padding: "2px 6px",
              borderRadius: 4,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--brand-glow)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            Raiz
          </button>
          {breadcrumb.map((part, i) => (
            <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ color: "var(--text-muted)", fontSize: 10 }}>›</span>
              <button
                onClick={() => handleBreadcrumbClick(i)}
                style={{
                  background: i === breadcrumb.length - 1 ? "var(--brand-glow)" : "transparent",
                  border: "none",
                  color: i === breadcrumb.length - 1 ? "var(--text-primary)" : "var(--text-muted)",
                  cursor: "pointer",
                  fontSize: 10,
                  fontFamily: "'JetBrains Mono','Consolas',monospace",
                  padding: "2px 6px",
                  borderRadius: 4,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--brand-glow)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = i === breadcrumb.length - 1 ? "var(--brand-glow)" : "transparent"; }}
              >
                {part}
              </button>
            </span>
          ))}
        </div>
        <div ref={chartRef} style={{ width: "100%", height: 380 }} />
      </div>

      {/* Detail panel */}
      <div style={{ flex: "1 1 260px", minWidth: 240, maxWidth: 360 }}>
        {!selected ? (
          <div
            style={{
              background: "var(--surface-2)",
              borderRadius: 8,
              padding: 20,
              height: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              border: "1px solid var(--border-default)",
            }}
          >
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--brand-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            <div style={{ color: "var(--text-primary)", fontSize: 12, fontWeight: "bold", textAlign: "center" }}>
              Selecione um setor
            </div>
            <div style={{ color: "var(--text-muted)", fontSize: 10, textAlign: "center", lineHeight: 1.6 }}>
              Clique em qualquer arco do mapa para ver detalhes da pasta: tamanho, percentual do total, subdivisões e caminho completo.
            </div>
          </div>
        ) : (
          <div
            style={{
              background: "var(--surface-2)",
              borderRadius: 8,
              padding: 20,
              height: "100%",
              border: "1px solid var(--border-default)",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            {/* Nome e caminho */}
            <div>
              <div style={{ color: "var(--brand-primary)", fontSize: 14, fontWeight: "bold", marginBottom: 4 }}>
                {selected.name}
              </div>
              <div style={{ color: "var(--text-muted)", fontSize: 9, lineHeight: 1.5, wordBreak: "break-all" }}>
                {selected.path}
              </div>
            </div>

            {/* Metricas principais */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div style={{ background: "var(--surface-1)", borderRadius: 6, padding: 10 }}>
                <div style={{ color: "var(--text-muted)", fontSize: 8, fontWeight: "bold", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                  TAMANHO
                </div>
                <div style={{ color: "var(--text-primary)", fontSize: 16, fontWeight: "bold" }}>
                  {formatBytes(selected.value)}
                </div>
              </div>
              <div style={{ background: "var(--surface-1)", borderRadius: 6, padding: 10 }}>
                <div style={{ color: "var(--text-muted)", fontSize: 8, fontWeight: "bold", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                  % DO TOTAL
                </div>
                <div style={{ color: "var(--brand-primary)", fontSize: 16, fontWeight: "bold" }}>
                  {selected.percentOfTotal.toFixed(1)}%
                </div>
              </div>
            </div>

            {/* % do parent */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ color: "var(--text-muted)", fontSize: 9 }}>Do diretório pai</span>
                <span style={{ color: "var(--brand-secondary)", fontSize: 10, fontWeight: "bold" }}>
                  {selected.percentOfParent.toFixed(1)}%
                </span>
              </div>
              <div style={{ background: "var(--border-default)", height: 4, borderRadius: 2, overflow: "hidden" }}>
                <div
                  style={{
                    width: `${Math.min(selected.percentOfParent, 100)}%`,
                    height: 4,
                    background: "linear-gradient(90deg, var(--brand-primary), var(--brand-secondary))",
                    borderRadius: 2,
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
            </div>

            {/* Subdivisoes */}
            {selected.children.length > 0 && (
              <div>
                <div style={{ color: "var(--text-muted)", fontSize: 9, fontWeight: "bold", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                  SUBDIVISÕES ({selected.children.length})
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {selected.children.map((child, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 2,
                          background: COLORS_PALETTE[i % COLORS_PALETTE.length],
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ color: "var(--text-primary)", fontSize: 10, flex: 1, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                        {child.name}
                      </span>
                      <span style={{ color: "var(--text-muted)", fontSize: 10 }}>
                        {formatBytes(child.value)}
                      </span>
                      <span style={{ color: COLORS_PALETTE[i % COLORS_PALETTE.length], fontSize: 10, fontWeight: "bold", minWidth: 40, textAlign: "right" }}>
                        {child.percent.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selected.children.length === 0 && (
              <div style={{
                background: "var(--surface-1)",
                borderRadius: 6,
                padding: 12,
                textAlign: "center",
              }}>
                <span style={{ color: "var(--text-muted)", fontSize: 10 }}>
                  Diretório terminal — sem subdivisões
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
