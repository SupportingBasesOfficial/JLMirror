// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState, useEffect } from "react";

interface UserScopeData {
  scope: "global" | "tenant";
  isLoading: boolean;
}

// Hook que detecta se o usuário é JL staff (scope=global) ou cliente (scope=tenant)
// Busca do /api/v1/auth/me que retorna o scope do JWT
export function useUserScope(): UserScopeData {
  const [scope, setScope] = useState<"global" | "tenant">("tenant");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function fetchScope() {
      try {
        const res = await fetch("/api/v1/auth/me", {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          if (mounted) {
            setScope(data.scope ?? "tenant");
          }
        }
      } catch {
        // Em caso de erro, assume tenant (mais restritivo)
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    fetchScope();
    return () => { mounted = false; };
  }, []);

  return { scope, isLoading };
}
