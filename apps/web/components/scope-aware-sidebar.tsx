// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { UnifiedSidebar } from "@/components/unified-sidebar";
import { useUserScope } from "@/components/user-scope-provider";

// Componente wrapper que renderiza a UnifiedSidebar
// A unified sidebar filtra modulos/categorias/itens por RBAC (roles)
// internamente — nao precisa mais de switch admin vs client
export function ScopeAwareSidebar() {
  const { isLoading } = useUserScope();

  // Durante loading, renderiza um skeleton neutro para evitar flash
  if (isLoading) {
    return <SidebarSkeleton />;
  }

  return <UnifiedSidebar />;
}

// Skeleton com largura e estrutura neutras, sem nenhum item de menu
function SidebarSkeleton() {
  return (
    <aside
      className="hidden md:flex flex-col shrink-0 w-64 h-screen"
      style={{
        borderRight: "1px solid var(--border-subtle)",
        background: "var(--surface-1)",
      }}
      aria-hidden="true"
    >
      <div className="px-4 pt-5 pb-3">
        <div className="flex items-center gap-2.5">
          <div
            className="rounded-lg shrink-0"
            style={{ width: 26, height: 26, background: "var(--surface-2)" }}
          />
          <div className="space-y-1.5">
            <div
              className="rounded"
              style={{ width: 80, height: 12, background: "var(--surface-2)" }}
            />
            <div
              className="rounded"
              style={{ width: 60, height: 8, background: "var(--surface-2)" }}
            />
          </div>
        </div>
      </div>
      <div className="px-3 pb-3">
        <div
          className="rounded-lg"
          style={{ height: 32, background: "var(--surface-2)" }}
        />
      </div>
      <div className="flex-1 px-2 space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="rounded-lg"
            style={{ height: 28, background: "var(--surface-2)", opacity: 0.6 }}
          />
        ))}
      </div>
    </aside>
  );
}
