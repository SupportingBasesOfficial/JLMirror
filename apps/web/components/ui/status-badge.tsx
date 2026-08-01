// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import type { ReactNode } from "react";

type StatusVariant = "ok" | "info" | "warning" | "error" | "critical" | "neutral";

interface StatusBadgeProps {
  variant: StatusVariant;
  children: ReactNode;
  size?: "sm" | "md";
  dot?: boolean;
  pulse?: boolean;
}

const variantConfig: Record<StatusVariant, { bg: string; text: string; border: string }> = {
  ok: { bg: "var(--status-ok-bg)", text: "var(--status-ok-text)", border: "var(--status-ok-border)" },
  info: { bg: "var(--status-info-bg)", text: "var(--status-info-text)", border: "var(--status-info-border)" },
  warning: { bg: "var(--status-warning-bg)", text: "var(--status-warning-text)", border: "var(--status-warning-border)" },
  error: { bg: "var(--status-error-bg)", text: "var(--status-error-text)", border: "var(--status-error-border)" },
  critical: { bg: "var(--status-critical-bg)", text: "var(--status-critical-text)", border: "var(--status-critical-border)" },
  neutral: { bg: "var(--status-neutral-bg)", text: "var(--status-neutral-text)", border: "var(--status-neutral-border)" },
};

export function StatusBadge({ variant, children, size = "sm", dot = false, pulse = false }: StatusBadgeProps) {
  const cfg = variantConfig[variant];
  const sizeClass = size === "sm" ? "text-xs px-2 py-0.5" : "text-sm px-2.5 py-1";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${sizeClass}`}
      style={{
        background: cfg.bg,
        color: cfg.text,
        border: `1px solid ${cfg.border}`,
      }}
    >
      {dot && (
        <span
          className="rounded-full shrink-0"
          style={{
            width: 6,
            height: 6,
            background: cfg.text,
            animation: pulse ? "pulse 2s infinite" : undefined,
          }}
        />
      )}
      {children}
    </span>
  );
}
