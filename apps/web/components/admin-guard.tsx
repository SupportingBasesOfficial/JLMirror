// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState, useEffect } from "react";
import { MegaLoader } from "@/components/mega-loader";

interface AdminGuardProps {
  children: React.ReactNode;
}

// Guard client-side que verifica se o usuário tem scope global (JL staff)
// antes de renderizar qualquer página sob /(admin)
export function AdminGuard({ children }: AdminGuardProps) {
  const [status, setStatus] = useState<
    "loading" | "authorized" | "unauthorized"
  >("loading");

  useEffect(() => {
    let mounted = true;

    async function checkScope() {
      try {
        const res = await fetch("/api/v1/auth/me", { credentials: "include" });
        if (!res.ok) {
          if (mounted) setStatus("unauthorized");
          return;
        }
        const data = await res.json();
        if (mounted) {
          if (data.scope === "global") {
            setStatus("authorized");
          } else {
            setStatus("unauthorized");
          }
        }
      } catch {
        if (mounted) setStatus("unauthorized");
      }
    }

    checkScope();
    return () => {
      mounted = false;
    };
  }, []);

  if (status === "loading") {
    return <MegaLoader fullscreen label="Verificando acesso" />;
  }

  if (status === "unauthorized") {
    window.location.href = "/dashboard";
    return <MegaLoader fullscreen label="Redirecionando" />;
  }

  return <>{children}</>;
}
