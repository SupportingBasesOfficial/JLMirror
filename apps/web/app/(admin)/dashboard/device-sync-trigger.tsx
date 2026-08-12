// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw, CheckCircle, AlertCircle } from "lucide-react";
import { apiRoutes } from "@/lib/api-routes";

// Dispara sync de devices do Zabbix sob demanda ao montar
// Usado no dashboard para sincronizar imediatamente sem esperar o intervalo de 5 min
// Agora com feedback visual: spinner durante sync, check verde no sucesso, alerta vermelho no erro
type SyncStatus = "idle" | "syncing" | "success" | "error";

export function DeviceSyncTrigger() {
  const hasSynced = useRef(false);
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);

  // Auto-dismiss do feedback apos 4 segundos
  useEffect(() => {
    if (status === "success" || status === "error") {
      const timer = setTimeout(() => setStatus("idle"), 4000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  // Sync automatico na primeira carga do dashboard
  useEffect(() => {
    if (hasSynced.current) return;
    hasSynced.current = true;

    triggerSync();
  }, []);

  async function triggerSync() {
    setStatus("syncing");
    try {
      const res = await fetch(apiRoutes.dashboard.syncDevices, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const msg = body?.error?.message ?? `Erro ${res.status}`;
        throw new Error(msg);
      }
      setStatus("success");
      setLastSyncAt(new Date());
    } catch (err) {
      setStatus("error");
      // Erro logado mas nao quebra o dashboard — sync em background continua a cada 5 min
      console.warn(
        "Sync de devices falhou:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  // Nao renderiza nada se idle e nunca sincronizou — mantem comportamento original
  if (status === "idle" && !lastSyncAt) return null;

  const label =
    status === "syncing"
      ? "Sincronizando devices..."
      : status === "success"
        ? "Devices sincronizados"
        : status === "error"
          ? "Falha na sincronização"
          : lastSyncAt
            ? `Último sync: ${lastSyncAt.toLocaleTimeString("pt-BR")}`
            : "";

  const color =
    status === "syncing"
      ? "var(--brand-primary)"
      : status === "success"
        ? "var(--status-success-text)"
        : status === "error"
          ? "var(--status-error-text)"
          : "var(--text-muted)";

  const bg =
    status === "syncing"
      ? "var(--brand-glow)"
      : status === "success"
        ? "var(--status-success-bg)"
        : status === "error"
          ? "var(--status-error-bg)"
          : "var(--surface-2)";

  const border =
    status === "syncing"
      ? "var(--brand-primary)"
      : status === "success"
        ? "var(--status-success-border)"
        : status === "error"
          ? "var(--status-error-border)"
          : "var(--border-default)";

  const Icon =
    status === "syncing"
      ? RefreshCw
      : status === "success"
        ? CheckCircle
        : status === "error"
          ? AlertCircle
          : RefreshCw;

  return (
    <div
      className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition-all"
      style={{ background: bg, border: `1px solid ${border}`, color }}
      role="status"
      aria-live="polite"
    >
      <Icon
        size={12}
        className={status === "syncing" ? "animate-spin" : ""}
        style={{ color }}
      />
      <span>{label}</span>
      {status === "error" && (
        <button
          onClick={triggerSync}
          className="ml-1 underline hover:opacity-80"
          style={{ color }}
        >
          Tentar novamente
        </button>
      )}
    </div>
  );
}
