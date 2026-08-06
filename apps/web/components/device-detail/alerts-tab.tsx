// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// Alertas ativos — agrupados por severidade, colapsáveis

"use client";

import {
  COLORS,
  TRIGGER_PRIORITY_COLORS,
  TRIGGER_PRIORITY_LABELS,
  triggerTimeAgo,
  type ZabbixTrigger,
} from "./types";

interface AlertsTabProps {
  triggers: ZabbixTrigger[];
  collapsedCategories: string[];
  onToggleCollapse: (key: string) => void;
}

export function AlertsTab({
  triggers,
  collapsedCategories,
  onToggleCollapse,
}: AlertsTabProps) {
  if (triggers.length === 0) return null;

  const criticalTriggers = triggers.filter(
    (t) => t.priority === "4" || t.priority === "5",
  );
  const warningTriggers = triggers.filter(
    (t) => t.priority === "2" || t.priority === "3",
  );
  const infoTriggers = triggers.filter(
    (t) => t.priority === "0" || t.priority === "1",
  );

  const groups: {
    key: string;
    label: string;
    color: string;
    items: ZabbixTrigger[];
  }[] = [
    {
      key: "alert_critical",
      label: "Críticos",
      color: "var(--status-error-text)",
      items: criticalTriggers,
    },
    {
      key: "alert_warning",
      label: "Avisos",
      color: "var(--status-warning-text)",
      items: warningTriggers,
    },
    {
      key: "alert_info",
      label: "Informações",
      color: "var(--text-muted)",
      items: infoTriggers,
    },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="space-y-2">
      <div
        className="text-[13px] font-bold tracking-wide"
        style={{ color: COLORS.muted }}
      >
        ALERTAS ATIVOS ({triggers.length})
      </div>
      {groups.map((g) => {
        const isCollapsed = collapsedCategories.includes(g.key);
        return (
          <div
            key={g.key}
            className="rounded-md overflow-hidden"
            style={{
              border: `1px solid color-mix(in srgb, ${g.color} 20%, transparent)`,
            }}
          >
            <button
              onClick={() => onToggleCollapse(g.key)}
              className="w-full flex items-center justify-between px-3.5 py-2.5 transition-colors"
              style={{ background: COLORS.card }}
            >
              <span className="flex items-center gap-2">
                <span
                  className="text-[12px] transition-transform inline-block"
                  style={{
                    color: COLORS.muted,
                    transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                  }}
                >
                  ▼
                </span>
                <span
                  className="rounded-full"
                  style={{
                    width: 8,
                    height: 8,
                    background: g.color,
                    boxShadow: `0 0 6px color-mix(in srgb, ${g.color} 33%, transparent)`,
                  }}
                />
                <span
                  className="text-sm font-bold uppercase tracking-wider"
                  style={{ color: g.color }}
                >
                  {g.label}
                </span>
                <span className="text-[10px]" style={{ color: COLORS.muted }}>
                  ({g.items.length})
                </span>
              </span>
            </button>
            {!isCollapsed && (
              <div className="space-y-1.5 p-2">
                {g.items.map((t) => {
                  const color =
                    TRIGGER_PRIORITY_COLORS[t.priority] ?? COLORS.green;
                  const label = TRIGGER_PRIORITY_LABELS[t.priority] ?? "Info";
                  const ago = triggerTimeAgo(t.lastchange, t.lastEvent?.clock);
                  return (
                    <div
                      key={t.triggerid}
                      className="rounded-md p-3 flex items-center gap-3"
                      style={{
                        background: COLORS.card,
                        border: `1px solid color-mix(in srgb, ${color} 20%, transparent)`,
                      }}
                    >
                      <span
                        className="rounded-full shrink-0"
                        style={{
                          width: 8,
                          height: 8,
                          background: color,
                          boxShadow: `0 0 6px color-mix(in srgb, ${color} 33%, transparent)`,
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <div
                          className="text-sm font-medium truncate"
                          style={{ color: COLORS.text }}
                        >
                          {t.description}
                        </div>
                        <div
                          className="text-[12px] mt-0.5"
                          style={{ color: COLORS.muted }}
                        >
                          há {ago}
                        </div>
                      </div>
                      <span
                        className="text-[12px] font-bold uppercase px-2 py-0.5 rounded shrink-0"
                        style={{
                          color,
                          background: `color-mix(in srgb, ${color} 15%, transparent)`,
                        }}
                      >
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
