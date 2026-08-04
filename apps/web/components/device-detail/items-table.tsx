// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// Tabela de todas as métricas — categorizada, colapsável, com busca

"use client";

import {
  COLORS,
  formatMetricValue,
  type MetricCategory,
  type ZabbixItem,
} from "./types";

interface ItemsTableProps {
  items: ZabbixItem[];
  metricCategories: MetricCategory[];
  metricSearch: string;
  onSearchChange: (value: string) => void;
  collapsedCategories: string[];
  onToggleCollapse: (key: string) => void;
  hiddenMetrics: string[];
  onToggleMetricVisibility: (itemId: string) => void;
  onItemSelect: (itemId: string) => void;
  prefsLoaded: boolean;
}

export function ItemsTable(props: ItemsTableProps) {
  const {
    items,
    metricCategories,
    metricSearch,
    onSearchChange,
    collapsedCategories,
    onToggleCollapse,
    hiddenMetrics,
    onToggleMetricVisibility,
    onItemSelect,
    prefsLoaded,
  } = props;

  return (
    <>
      <div
        className="text-[13px] font-bold tracking-wide"
        style={{ color: COLORS.muted }}
      >
        TODAS AS MÉTRICAS ({items.length}) — {metricCategories.length}{" "}
        CATEGORIAS
      </div>
      <div className="mb-2">
        <input
          type="text"
          value={metricSearch}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar por nome ou key..."
          className="w-full rounded-md px-3 py-2 text-sm focus:outline-none"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            color: COLORS.text,
          }}
        />
      </div>

      {metricSearch.trim() ? (
        <div
          className="overflow-hidden rounded-md mb-4"
          style={{ border: `1px solid ${COLORS.border}` }}
        >
          <table
            className="w-full text-sm"
            style={{ fontFamily: "'JetBrains Mono','Consolas',monospace" }}
          >
            <thead style={{ background: "var(--surface-3)" }}>
              <tr>
                <th
                  className="px-4 py-3 text-left font-medium text-[12px]"
                  style={{ color: COLORS.muted }}
                >
                  MÉTRICA
                </th>
                <th
                  className="px-4 py-3 text-left font-medium text-[12px]"
                  style={{ color: COLORS.muted }}
                >
                  KEY
                </th>
                <th
                  className="px-4 py-3 text-left font-medium text-[12px]"
                  style={{ color: COLORS.muted }}
                >
                  ÚLTIMO VALOR
                </th>
              </tr>
            </thead>
            <tbody>
              {items
                .filter((item) => {
                  const q = metricSearch.toLowerCase();
                  return (
                    item.name.toLowerCase().includes(q) ||
                    item.key_.toLowerCase().includes(q)
                  );
                })
                .map((item) => (
                  <tr
                    key={item.itemid}
                    className="cursor-pointer transition-colors"
                    style={{ borderTop: `1px solid ${COLORS.border}` }}
                    onClick={() => onItemSelect(item.itemid)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--surface-3)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <td className="px-4 py-3" style={{ color: COLORS.text }}>
                      {item.name}
                    </td>
                    <td
                      className="px-4 py-3 text-xs font-mono"
                      style={{ color: COLORS.muted }}
                    >
                      {item.key_}
                    </td>
                    <td className="px-4 py-3" style={{ color: COLORS.muted }}>
                      {formatMetricValue(item.lastvalue, item.units)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-col gap-2 mb-4">
          {metricCategories.map((cat) => {
            const isCollapsed = collapsedCategories.includes(cat.key);
            const visibleItems = cat.items.filter(
              (i) => !hiddenMetrics.includes(i.itemid),
            );
            return (
              <div
                key={cat.key}
                className="rounded-md overflow-hidden"
                style={{ border: `1px solid ${COLORS.border}` }}
              >
                <button
                  onClick={() => onToggleCollapse(cat.key)}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 transition-colors"
                  style={{ background: COLORS.card }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = `${COLORS.card}cc`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = COLORS.card;
                  }}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="text-[12px] transition-transform"
                      style={{
                        color: COLORS.muted,
                        transform: isCollapsed
                          ? "rotate(-90deg)"
                          : "rotate(0deg)",
                        display: "inline-block",
                      }}
                    >
                      ▼
                    </span>
                    <span
                      className="text-[13px] font-bold"
                      style={{ color: COLORS.text }}
                    >
                      {cat.label}
                    </span>
                    <span
                      className="text-[11px] px-1.5 py-0.5 rounded"
                      style={{
                        background: "var(--brand-glow)",
                        color: COLORS.teal,
                      }}
                    >
                      {cat.items.length}
                    </span>
                    {hiddenMetrics.length > 0 &&
                      cat.items.some((i) =>
                        hiddenMetrics.includes(i.itemid),
                      ) && (
                        <span
                          className="text-[11px]"
                          style={{ color: COLORS.muted }}
                        >
                          ({cat.items.length - visibleItems.length} oculta(s))
                        </span>
                      )}
                  </span>
                  <span className="text-[11px]" style={{ color: COLORS.muted }}>
                    {isCollapsed ? "Expandir" : "Recolher"}
                  </span>
                </button>
                {!isCollapsed && (
                  <table
                    className="w-full text-sm"
                    style={{
                      fontFamily: "'JetBrains Mono','Consolas',monospace",
                    }}
                  >
                    <tbody>
                      {cat.items.map((item) => {
                        const isHidden = hiddenMetrics.includes(item.itemid);
                        return (
                          <tr
                            key={item.itemid}
                            className="cursor-pointer transition-colors group"
                            style={{
                              borderTop: `1px solid ${COLORS.border}`,
                              opacity: isHidden ? 0.4 : 1,
                            }}
                            onClick={() => onItemSelect(item.itemid)}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background =
                                "var(--surface-3)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "transparent";
                            }}
                          >
                            <td
                              className="px-4 py-2.5"
                              style={{
                                color: isHidden ? COLORS.muted : COLORS.text,
                                width: "40%",
                              }}
                            >
                              {item.name}
                            </td>
                            <td
                              className="px-4 py-2.5 text-xs font-mono"
                              style={{ color: COLORS.muted, width: "35%" }}
                            >
                              {item.key_}
                            </td>
                            <td
                              className="px-4 py-2.5"
                              style={{
                                color: isHidden ? COLORS.muted : COLORS.text,
                                width: "15%",
                              }}
                            >
                              {formatMetricValue(item.lastvalue, item.units)}
                            </td>
                            <td
                              className="px-2 py-2.5 text-right"
                              style={{ width: "10%" }}
                            >
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onToggleMetricVisibility(item.itemid);
                                }}
                                className="text-[11px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                style={{
                                  background: isHidden
                                    ? "var(--status-ok-bg)"
                                    : "rgba(110, 127, 136, 0.2)",
                                  color: isHidden ? COLORS.green : COLORS.muted,
                                }}
                              >
                                {isHidden ? "Mostrar" : "Ocultar"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      )}
      {!metricSearch.trim() && prefsLoaded && (
        <p className="text-xs mb-4" style={{ color: COLORS.muted }}>
          {items.length} métricas em {metricCategories.length} categorias.
          Clique em uma para ver o gráfico. Oculte métricas com o botão
          &ldquo;Ocultar&rdquo; — sua preferência é salva automaticamente.
        </p>
      )}
    </>
  );
}
