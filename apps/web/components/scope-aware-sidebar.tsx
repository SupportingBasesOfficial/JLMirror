"use client";

import { AdminSidebar } from "@/components/admin-sidebar";
import { ClientSidebar } from "@/components/client-sidebar";
import { useUserScope } from "@/lib/use-user-scope";

// Componente wrapper que renderiza AdminSidebar ou ClientSidebar
// baseado no scope do usuário (global = JL staff, tenant = cliente)
export function ScopeAwareSidebar() {
  const { scope, isLoading } = useUserScope();

  // Durante loading, renderiza AdminSidebar como fallback
  // para evitar flash de ClientSidebar para usuários JL
  if (isLoading) {
    return <AdminSidebar />;
  }

  if (scope === "global") {
    return <AdminSidebar />;
  }

  return <ClientSidebar />;
}
