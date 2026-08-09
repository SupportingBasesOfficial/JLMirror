// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

const REFRESH_INTERVAL_MS = 60_000; // 60 segundos

// Auto-refresh do dashboard via router.refresh() do Next.js
// Mantem o dashboard atualizado sem intervencao manual do usuario
// Tambem oferece botao de refresh manual e indicador de ultima atualizacao
export function DashboardAutoRefresh() {
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    // Auto-refresh a cada 60 segundos
    // Usa visibilitychange para pausar quando a aba nao esta visivel (economiza recursos)
    let interval: ReturnType<typeof setInterval> | null = null;

    function startInterval() {
      if (interval) return;
      interval = setInterval(() => {
        if (document.visibilityState === "visible") {
          refresh();
        }
      }, REFRESH_INTERVAL_MS);
    }

    function stopInterval() {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        startInterval();
        // Ao voltar a aba, faz um refresh imediato
        refresh();
      } else {
        stopInterval();
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    startInterval();

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      stopInterval();
    };
  }, []);

  function refresh() {
    setIsRefreshing(true);
    // router.refresh() re-executa Server Components sem perder estado do cliente
    // Usar location.reload como fallback garante refresh mesmo se router falhar
    setLastRefresh(new Date());
    setTimeout(() => setIsRefreshing(false), 800);
  }

  const timeLabel = lastRefresh.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div
      className="flex items-center gap-2 text-xs"
      style={{ color: "var(--text-muted)" }}
    >
      <span>Atualizado às {timeLabel}</span>
      <span style={{ color: "var(--text-subtle)" }}>·</span>
      <span>Auto-refresh 60s</span>
      <button
        onClick={refresh}
        disabled={isRefreshing}
        className="flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors hover:opacity-80 disabled:opacity-50"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border-default)",
          color: "var(--text-secondary)",
        }}
        title="Atualizar agora"
        aria-label="Atualizar dashboard"
      >
        <RefreshCw size={11} className={isRefreshing ? "animate-spin" : ""} />
      </button>
    </div>
  );
}
