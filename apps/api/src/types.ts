// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
export interface AuthUser {
  sub: string;
  tenant_id: string;
  roles: string[];
  scope: "global" | "tenant";
  // Para JL staff (scope=global), múltiplos tenants podem ser acessíveis
  tenantIds?: string[];
}

declare module "hono" {
  interface ContextVariableMap {
    user: AuthUser;
    correlationId: string;
  }
}
