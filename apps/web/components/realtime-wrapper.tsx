// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState, useEffect, type ReactNode } from "react";
import { RealtimeProvider } from "@/lib/realtime-provider";
import { RealtimeToasts } from "@/components/realtime-toasts";

export function RealtimeWrapper({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    // Busca o access_token via API pois o cookie é HttpOnly
    let cancelled = false;
    fetch("/api/ws-token", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.token) {
          setToken(data.token as string);
        }
      })
      .catch(() => {
        // Silencioso — WebSocket fica desconconectado
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <RealtimeProvider token={token}>
      {children}
      <RealtimeToasts />
    </RealtimeProvider>
  );
}
