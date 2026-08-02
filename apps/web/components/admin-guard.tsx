// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { usePathname } from "next/navigation";
import { MegaLoader } from "@/components/mega-loader";
import { useUserScope } from "@/components/user-scope-provider";

interface AdminGuardProps {
  children: React.ReactNode;
}

// Rotas que exigem scope global (JL staff). Demais rotas sao compartilhadas.
const ADMIN_ONLY_PREFIXES = [
  "/admin",
  "/settings/modules",
  "/white-label",
  "/status-page-admin",
];

// Guard client-side que verifica se o usuário tem scope global (JL staff)
// apenas em rotas admin-specific. Usa UserScopeProvider (context) — sem fetch proprio.
export function AdminGuard({ children }: AdminGuardProps) {
  const pathname = usePathname();
  const { scope, isLoading } = useUserScope();

  const isAdminRoute = ADMIN_ONLY_PREFIXES.some((prefix) =>
    pathname?.startsWith(prefix),
  );

  // Se nao e rota admin-specific, renderiza sem validar
  if (!isAdminRoute) {
    return <>{children}</>;
  }

  // Aguarda o scope ser carregado pelo UserScopeProvider
  if (isLoading) {
    return <MegaLoader fullscreen label="Verificando acesso" />;
  }

  if (scope !== "global") {
    window.location.href = "/dashboard";
    return <MegaLoader fullscreen label="Redirecionando" />;
  }

  return <>{children}</>;
}
