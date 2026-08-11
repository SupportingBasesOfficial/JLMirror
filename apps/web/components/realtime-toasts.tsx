// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useRealtime } from "@/lib/realtime-provider";

const SEVERITY_COLORS: Record<
  string,
  { bg: string; border: string; text: string }
> = {
  info: { bg: "#3E8BF010", border: "#3E8BF044", text: "#3E8BF0" },
  warning: { bg: "#F5A62310", border: "#F5A62344", text: "#F5A623" },
  critical: { bg: "#E5484D10", border: "#E5484D44", text: "#E5484D" },
};

export function RealtimeToasts() {
  const { notifications, dismissNotification, isConnected } = useRealtime();

  if (notifications.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[100] space-y-2 max-w-sm"
      style={{ fontFamily: "'JetBrains Mono','Consolas',monospace" }}
    >
      {!isConnected && (
        <div
          className="rounded-md px-3 py-2 text-[11px]"
          style={{
            background: "#6E7F8810",
            border: "1px solid #6E7F8830",
            color: "#6E7F88",
          }}
        >
          WebSocket desconectado — tentando reconectar...
        </div>
      )}
      {notifications.slice(0, 5).map((n) => {
        const colors =
          SEVERITY_COLORS[n.severity ?? "info"] ?? SEVERITY_COLORS.info!;
        return (
          <div
            key={n.id}
            className="rounded-md p-3 flex items-start gap-3 animate-in fade-in slide-in-from-right-5"
            style={{
              background: "#10171C",
              border: `1px solid ${colors.border}`,
            }}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded"
                  style={{ background: colors.bg, color: colors.text }}
                >
                  {n.severity ?? "info"}
                </span>
                <span
                  className="text-[12px] font-bold"
                  style={{ color: "#C9D4DA" }}
                >
                  {n.title}
                </span>
              </div>
              <p className="text-[11px]" style={{ color: "#6E7F88" }}>
                {n.message}
              </p>
              <p className="text-[10px] mt-1" style={{ color: "#6E7F88" }}>
                {new Date(n.timestamp).toLocaleTimeString("pt-BR")}
              </p>
            </div>
            <button
              onClick={() => dismissNotification(n.id)}
              className="text-[14px] flex-shrink-0"
              style={{ color: "#6E7F88", cursor: "pointer" }}
            >
              x
            </button>
          </div>
        );
      })}
    </div>
  );
}
