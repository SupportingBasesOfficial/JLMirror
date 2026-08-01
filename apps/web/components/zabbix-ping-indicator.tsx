// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useEffect, useRef, useState } from "react";

type ConnStatus = "checking" | "online" | "offline";

const MAX_CONSECUTIVE_FAILURES = 3;
const POLL_INTERVAL_MS = 15000;

export function ZabbixPingIndicator({ collapsed }: { collapsed: boolean }) {
  const [status, setStatus] = useState<ConnStatus>("checking");
  const failuresRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch("/api/zabbix/ping", { credentials: "include" });
        // 404 = rota ainda compilando no dev — retry rapido em 2s
        if (res.status === 404) {
          if (!cancelled) {
            setTimeout(check, 2000);
          }
          return;
        }
        if (!res.ok) {
          if (!cancelled) {
            failuresRef.current += 1;
            if (failuresRef.current >= MAX_CONSECUTIVE_FAILURES) {
              setStatus("offline");
              // Nao para o polling — continua verificando para recuperar automaticamente
            }
          }
          return;
        }
        const json = await res.json();
        if (!cancelled) {
          if (json.connected === true) {
            failuresRef.current = 0;
            setStatus("online");
          } else {
            failuresRef.current += 1;
            if (failuresRef.current >= MAX_CONSECUTIVE_FAILURES) {
              setStatus("offline");
            }
          }
        }
      } catch {
        if (!cancelled) {
          failuresRef.current += 1;
          if (failuresRef.current >= MAX_CONSECUTIVE_FAILURES) {
            setStatus("offline");
            // Nao para o polling — continua verificando para recuperar automaticamente
          }
        }
      }
    }

    check();
    intervalRef.current = setInterval(check, POLL_INTERVAL_MS);

    function handleVisibility() {
      if (document.visibilityState === "visible") {
        failuresRef.current = 0;
        check();
        if (!intervalRef.current) {
          intervalRef.current = setInterval(check, POLL_INTERVAL_MS);
        }
      }
    }

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  const statusConfig: Record<ConnStatus, { color: string; bg: string; border: string; label: string }> = {
    checking: { color: "var(--status-warning-text)", bg: "var(--status-warning-bg)", border: "var(--status-warning-border)", label: "Verificando..." },
    online: { color: "var(--status-ok-text)", bg: "var(--status-ok-bg)", border: "var(--status-ok-border)", label: "Zabbix Online" },
    offline: { color: "var(--status-error-text)", bg: "var(--status-error-bg)", border: "var(--status-error-border)", label: "Zabbix Offline" },
  };

  const cfg = statusConfig[status];

  return (
    <div
      className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium"
      style={{
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        color: cfg.color,
        justifyContent: collapsed ? "center" : "flex-start",
      }}
      title={collapsed ? cfg.label : undefined}
    >
      <span
        className="inline-block w-2 h-2 rounded-full shrink-0"
        style={{
          background: cfg.color,
          animation: status === "checking" ? "pulse 1.5s ease-in-out infinite" : "none",
        }}
      />
      {!collapsed && <span>{cfg.label}</span>}
    </div>
  );
}
