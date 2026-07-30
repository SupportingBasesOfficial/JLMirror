export interface AuthUser {
  sub: string;
  tenant_id: string;
  roles: string[];
}

declare module "hono" {
  interface ContextVariableMap {
    user: AuthUser;
    correlationId: string;
  }
}
