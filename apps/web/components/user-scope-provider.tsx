// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

type UserScope = "global" | "tenant";

interface UserScopeContextValue {
  scope: UserScope;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

const UserScopeContext = createContext<UserScopeContextValue>({
  scope: "tenant",
  isLoading: true,
  error: null,
  refresh: () => {},
});

export function UserScopeProvider({ children }: { children: ReactNode }) {
  const [scope, setScope] = useState<UserScope>("tenant");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    let mounted = true;

    async function fetchScope() {
      try {
        const res = await fetch("/api/v1/auth/me", { credentials: "include" });
        if (res.status === 401) {
          // Token ausente ou expirado — redireciona para login
          window.location.href = "/auth/login";
          return;
        }
        if (res.ok) {
          const data = await res.json();
          if (mounted) {
            setScope(data.scope ?? "tenant");
            setError(null);
          }
        } else {
          // Erro 5xx — mantem scope default "tenant" (mais restritivo)
          if (mounted) setError("Falha ao verificar permissões");
        }
      } catch {
        // Erro de rede — mantem scope default "tenant" (mais restritivo)
        if (mounted) setError("Erro de conexão");
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    fetchScope();
    return () => {
      mounted = false;
    };
  }, [refreshKey]);

  return (
    <UserScopeContext.Provider value={{ scope, isLoading, error, refresh }}>
      {children}
    </UserScopeContext.Provider>
  );
}

export function useUserScope(): UserScopeContextValue {
  return useContext(UserScopeContext);
}
