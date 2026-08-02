// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

// Re-exporta do UserScopeProvider context para manter compatibilidade
// com componentes que importam de @/lib/use-user-scope
export { useUserScope } from "@/components/user-scope-provider";
