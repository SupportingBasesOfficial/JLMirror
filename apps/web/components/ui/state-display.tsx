// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import type { ReactNode } from "react";
import { Info, AlertTriangle, CheckCircle2, XCircle, Inbox } from "lucide-react";

type StateVariant = "error" | "warning" | "info" | "ok" | "empty";

interface StateDisplayProps {
  variant: StateVariant;
  title: string;
  message?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

const stateConfig: Record<StateVariant, { color: string; bg: string; border: string; icon: ReactNode }> = {
  error: { color: "var(--status-error-text)", bg: "var(--status-error-bg)", border: "var(--status-error-border)", icon: <XCircle size={32} /> },
  warning: { color: "var(--status-warning-text)", bg: "var(--status-warning-bg)", border: "var(--status-warning-border)", icon: <AlertTriangle size={32} /> },
  info: { color: "var(--status-info-text)", bg: "var(--status-info-bg)", border: "var(--status-info-border)", icon: <Info size={32} /> },
  ok: { color: "var(--status-ok-text)", bg: "var(--status-ok-bg)", border: "var(--status-ok-border)", icon: <CheckCircle2 size={32} /> },
  empty: { color: "var(--text-muted)", bg: "transparent", border: "var(--border-default)", icon: <Inbox size={32} /> },
};

export function StateDisplay({ variant, title, message, icon, action }: StateDisplayProps) {
  const cfg = stateConfig[variant];
  const displayIcon = icon ?? cfg.icon;

  return (
    <div
      className="flex flex-col items-center justify-center text-center rounded-xl py-12 px-6"
      style={{
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
      }}
    >
      <div style={{ color: cfg.color, marginBottom: 12 }}>
        {displayIcon}
      </div>
      <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
        {title}
      </h3>
      {message && (
        <p className="text-sm max-w-md" style={{ color: "var(--text-secondary)" }}>
          {message}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function EmptyState({ title, message, action }: { title: string; message?: string; action?: ReactNode }) {
  return <StateDisplay variant="empty" title={title} message={message} action={action} />;
}

export function ErrorState({ title, message, action }: { title: string; message?: string; action?: ReactNode }) {
  return <StateDisplay variant="error" title={title} message={message} action={action} />;
}

export function LoadingState({ label = "Carregando...", progress }: { label?: string; progress?: number }) {
  const hasProgress = progress !== undefined && progress >= 0;
  const pct = hasProgress ? Math.min(100, Math.max(0, progress!)) : null;
  return (
    <div
      className="flex flex-col items-center justify-center gap-4 rounded-xl py-16"
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border-default)",
      }}
    >
      <svg width="40" height="40" viewBox="0 0 32 32" fill="none">
        <path
          d="M8 22V10M8 10L14 16M8 10L2 16"
          stroke="var(--brand-primary)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          transform="translate(4 0)"
          style={{ animation: "jlArrowUp 2s ease-in-out infinite" }}
        />
        <path
          d="M20 10V22M20 22L26 16M20 22L14 16"
          stroke="var(--brand-secondary)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          transform="translate(-2 0)"
          style={{ animation: "jlArrowDown 2s ease-in-out infinite 1s" }}
        />
        <circle cx="16" cy="16" r="1.5" fill="var(--brand-primary)" />
      </svg>
      <div
        className="relative h-[2px] w-32 overflow-hidden rounded-full"
        style={{ background: "var(--surface-3)" }}
      >
        {pct !== null ? (
          <div
            className="absolute top-0 h-full rounded-full transition-[width] duration-150 ease-out"
            style={{
              width: `${pct}%`,
              background: "var(--brand-primary)",
            }}
          />
        ) : (
          <div
            className="absolute top-0 h-full w-[30%] rounded-full"
            style={{
              background: "var(--brand-primary)",
              animation: "jlTravel 1.4s ease-in-out infinite",
            }}
          />
        )}
      </div>
      <span className="text-[11px] uppercase tracking-[0.2em]" style={{ color: "var(--text-muted)" }}>
        {pct !== null ? `${pct}% — ${label}` : label}
      </span>
    </div>
  );
}
