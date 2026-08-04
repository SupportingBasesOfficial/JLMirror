// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { WifiOff, RefreshCw } from "lucide-react";
import { useState, useEffect } from "react";

export default function OfflinePage() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{
        background: "var(--surface-0)",
        fontFamily: "'JetBrains Mono','Consolas',monospace",
      }}
    >
      <div className="text-center space-y-6 max-w-md">
        <div className="flex justify-center">
          <div
            className="flex items-center justify-center rounded-full"
            style={{
              width: 80,
              height: 80,
              background: "var(--status-error-bg)",
              border: "2px solid var(--status-error-border)",
            }}
          >
            <WifiOff size={36} style={{ color: "var(--status-error-text)" }} />
          </div>
        </div>

        <div className="space-y-2">
          <h1
            className="text-xl font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            Você está offline
          </h1>
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            {isOnline
              ? "Conexão restabelecida! Recarregando..."
              : "Verifique sua conexão com a internet e tente novamente."}
          </p>
        </div>

        {isOnline ? (
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-[13px] font-bold"
            style={{
              background: "var(--brand-primary)",
              color: "var(--surface-0)",
              cursor: "pointer",
            }}
          >
            <RefreshCw size={14} />
            Recarregar
          </button>
        ) : (
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-[13px] font-bold"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border-default)",
              color: "var(--text-muted)",
              cursor: "pointer",
            }}
          >
            <RefreshCw size={14} />
            Tentar novamente
          </button>
        )}
      </div>
    </div>
  );
}
