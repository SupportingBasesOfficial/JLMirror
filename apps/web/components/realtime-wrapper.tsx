// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState, useEffect, type ReactNode } from "react";
import { RealtimeProvider } from "@/lib/realtime-provider";
import { RealtimeToasts } from "@/components/realtime-toasts";

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function RealtimeWrapper({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    // Extrai o access_token do cookie para passar ao WebSocket
    const t = getCookie("access_token");
    setToken(t);
  }, []);

  return (
    <RealtimeProvider token={token}>
      {children}
      <RealtimeToasts />
    </RealtimeProvider>
  );
}
