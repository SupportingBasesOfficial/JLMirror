import type { ReactNode } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

type TrendDirection = "up" | "down" | "neutral";

interface KpiCardProps {
  label: string;
  value: string | number;
  unit?: string;
  icon?: ReactNode;
  trend?: { direction: TrendDirection; value: string };
  variant?: "default" | "ok" | "warning" | "error" | "info";
}

const variantConfig = {
  default: { color: "var(--text-primary)", iconColor: "var(--brand-primary)" },
  ok: { color: "var(--status-ok-text)", iconColor: "var(--status-ok-text)" },
  warning: { color: "var(--status-warning-text)", iconColor: "var(--status-warning-text)" },
  error: { color: "var(--status-error-text)", iconColor: "var(--status-error-text)" },
  info: { color: "var(--status-info-text)", iconColor: "var(--status-info-text)" },
};

const trendConfig: Record<TrendDirection, { icon: ReactNode; color: string }> = {
  up: { icon: <TrendingUp size={14} />, color: "var(--status-ok-text)" },
  down: { icon: <TrendingDown size={14} />, color: "var(--status-error-text)" },
  neutral: { icon: <Minus size={14} />, color: "var(--text-muted)" },
};

export function KpiCard({ label, value, unit, icon, trend, variant = "default" }: KpiCardProps) {
  const cfg = variantConfig[variant];

  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border-default)",
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
          {label}
        </span>
        {icon && (
          <div style={{ color: cfg.iconColor }}>
            {icon}
          </div>
        )}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold tabular-nums" style={{ color: cfg.color }}>
          {value}
        </span>
        {unit && (
          <span className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>
            {unit}
          </span>
        )}
      </div>
      {trend && (
        <div className="flex items-center gap-1 mt-2" style={{ color: trendConfig[trend.direction].color }}>
          {trendConfig[trend.direction].icon}
          <span className="text-xs font-semibold">{trend.value}</span>
        </div>
      )}
    </div>
  );
}
