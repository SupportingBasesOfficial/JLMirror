// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useEffect, useState } from "react";
import type { SidebarRole } from "@/lib/sidebar-config";

interface AuthMeResponse {
  user: {
    id: string;
    email: string;
    full_name: string | null;
    is_active: boolean;
  };
  scope: "global" | "tenant";
  tenants: Array<{
    tenant_id: string;
    role: string;
    scope: string;
  }>;
}

// Mapeia scope + roles do /auth/me para os roles da sidebar
function mapToSidebarRoles(
  scope: "global" | "tenant",
  tenants: Array<{ role: string; scope: string }>,
): SidebarRole[] {
  const roles = new Set<SidebarRole>();

  if (scope === "global") {
    // JL staff — verifica roles granulares do tenant mapping
    const tenantRoles = tenants.map((t) => t.role.toLowerCase());
    const hasAdmin = tenantRoles.some(
      (r) => r.includes("admin") || r.includes("global"),
    );
    const hasDev = tenantRoles.some(
      (r) => r.includes("dev") || r.includes("developer"),
    );

    if (hasAdmin) roles.add("admin_global");
    if (hasDev) roles.add("dev");
    // JL staff sem role explicita — trata como operator
    if (roles.size === 0) roles.add("noc_operator");
    // Admin implicitamente tambem e operator
    if (hasAdmin) roles.add("noc_operator");
  } else {
    // Usuario de tenant — viewer por default
    const tenantRoles = tenants.map((t) => t.role.toLowerCase());
    const hasAdmin = tenantRoles.some((r) => r.includes("admin"));
    if (hasAdmin) {
      // Admin de tenant ve mais coisas que viewer comum
      roles.add("client_viewer");
    } else {
      roles.add("client_viewer");
    }
  }

  return Array.from(roles);
}

export function useUserRoles() {
  const [roles, setRoles] = useState<SidebarRole[]>(["client_viewer"]);
  const [isLoading, setIsLoading] = useState(true);
  const [userInfo, setUserInfo] = useState<{
    name: string;
    email: string;
    organization: string;
  } | null>(null);

  useEffect(() => {
    let mounted = true;

    async function fetchRoles() {
      try {
        const res = await fetch("/api/v1/auth/me", { credentials: "include" });
        if (!res.ok) {
          if (mounted) setIsLoading(false);
          return;
        }
        const data = (await res.json()) as AuthMeResponse;
        if (!mounted) return;

        const mapped = mapToSidebarRoles(data.scope, data.tenants ?? []);
        setRoles(mapped);
        setUserInfo({
          name: data.user.full_name ?? data.user.email,
          email: data.user.email,
          organization:
            data.scope === "global"
              ? "JL Informática"
              : (data.tenants[0]?.tenant_id ?? "Tenant"),
        });
      } catch {
        // Mantem default restritivo
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    fetchRoles();
    return () => {
      mounted = false;
    };
  }, []);

  return { roles, isLoading, userInfo };
}
