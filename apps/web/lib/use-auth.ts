// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// Type-safe authentication hooks — consume centralized apiRoutes and
// @repo/shared-validation types for compile-time payload safety.
//
// These hooks wrap the raw fetch calls in use-user-scope.ts and use-user-roles.ts
// with typed responses from lib/api-routes.ts, ensuring the frontend never
// expects a field that doesn't exist in the backend response (e.g. the
// historical `u.name` vs `u.full_name` bug).
"use client";

import { useEffect, useState, useCallback } from "react";
import { apiRoutes, type AuthMeResponse } from "@/lib/api-routes";
import type { SidebarRole } from "@/lib/sidebar-config";

// Mapeia scope + roles do /auth/me para os roles da sidebar.
// Mantido aqui (movido de use-user-roles.ts) para centralizar logica de RBAC
// do frontend junto com os tipos type-safe.
function mapToSidebarRoles(
  scope: "global" | "tenant",
  tenants: Array<{ role: string; scope: string }>,
): SidebarRole[] {
  const roles = new Set<SidebarRole>();

  if (scope === "global") {
    const tenantRoles = tenants.map((t) => t.role.toLowerCase());
    const hasAdmin = tenantRoles.some(
      (r) => r.includes("admin") || r.includes("global"),
    );
    const hasDev = tenantRoles.some(
      (r) => r.includes("dev") || r.includes("developer"),
    );

    if (hasAdmin) roles.add("admin_global");
    if (hasDev) roles.add("dev");
    if (roles.size === 0) roles.add("noc_operator");
    if (hasAdmin) roles.add("noc_operator");
  } else {
    roles.add("client_viewer");
  }

  return Array.from(roles);
}

export interface UseAuthResult {
  /** Usuario autenticado (null se nao autenticado). */
  user: AuthMeResponse["user"] | null;
  /** Scope: global (JL staff) ou tenant (cliente). */
  scope: "global" | "tenant";
  /** Roles mapeados para a sidebar. */
  roles: SidebarRole[];
  /** Permissions strings padronizadas (ex: "zabbix:read", "users:write"). */
  permissions: string[];
  /** Tenant ID atual (null se scope=global sem tenant ativo). */
  tenantId: string | null;
  /** Info resumida para exibicao na sidebar. */
  userInfo: {
    name: string;
    email: string;
    organization: string;
  } | null;
  isLoading: boolean;
  error: string | null;
  /** Forca re-fetch do /auth/me (apos login, troca de tenant, etc). */
  refresh: () => void;
}

// Hook unificado de autenticacao — substitui useUserScope + useUserRoles
// com tipos type-safe baseados em @repo/shared-validation / @repo/db/types.
// Mantem compatibilidade: useUserScope e useUserRoles re-exportam de use-auth.
export function useAuth(): UseAuthResult {
  const [user, setUser] = useState<UseAuthResult["user"]>(null);
  const [scope, setScope] = useState<"global" | "tenant">("tenant");
  const [roles, setRoles] = useState<SidebarRole[]>(["client_viewer"]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<UseAuthResult["userInfo"]>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    let mounted = true;

    async function fetchAuthMe() {
      try {
        const res = await fetch(apiRoutes.auth.me, {
          credentials: "include",
        });
        if (res.status === 401) {
          // Token ausente ou expirado — redireciona para login
          if (
            typeof window !== "undefined" &&
            !window.location.pathname.startsWith("/auth/")
          ) {
            window.location.href = "/auth/login";
          }
          return;
        }
        if (!res.ok) {
          if (mounted) setError("Falha ao verificar permissões");
          return;
        }

        const data = (await res.json()) as AuthMeResponse;
        if (!mounted) return;

        setUser(data.user);
        setScope(data.scope);
        setPermissions(data.permissions ?? []);
        setTenantId(data.tenant_id ?? null);

        // Mapeia tenants para roles da sidebar
        const tenants =
          (
            data as AuthMeResponse & {
              tenants?: Array<{
                tenant_id: string;
                role: string;
                scope: string;
              }>;
            }
          ).tenants ?? [];
        const mapped = mapToSidebarRoles(data.scope, tenants);
        setRoles(mapped);

        setUserInfo({
          // USA full_name (campo correto do DB via Drizzle), nao `name`
          name: data.user.full_name ?? data.user.email,
          email: data.user.email,
          organization:
            data.scope === "global"
              ? "JL Informática"
              : (tenants[0]?.tenant_id ?? "Tenant"),
        });
        setError(null);
      } catch {
        if (mounted) setError("Erro de conexão");
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    fetchAuthMe();
    return () => {
      mounted = false;
    };
  }, [refreshKey]);

  return {
    user,
    scope,
    roles,
    permissions,
    tenantId,
    userInfo,
    isLoading,
    error,
    refresh,
  };
}
