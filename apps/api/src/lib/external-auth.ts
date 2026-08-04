// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// Lookup/criacao de usuario por email para auth externa (OAuth, LDAP)

import { query } from "@repo/db";

interface ExternalUserInfo {
  email: string;
  name: string;
}

interface ResolvedUser {
  id: string;
  email: string;
  fullName: string | null;
  isActive: boolean;
  isNew: boolean;
}

export async function findOrCreateExternalUser(
  info: ExternalUserInfo,
  passwordPlaceholder: string,
): Promise<ResolvedUser | { error: "USER_INACTIVE" }> {
  const existing = await query<{
    id: string;
    email: string;
    full_name: string | null;
    is_active: boolean;
  }>(
    "SELECT id, email, full_name, is_active FROM public.users WHERE email = $1",
    [info.email],
  );

  if (existing.data?.rows[0]) {
    const user = existing.data.rows[0];
    if (!user.is_active) {
      return { error: "USER_INACTIVE" };
    }
    return {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      isActive: user.is_active,
      isNew: false,
    };
  }

  const newUser = await query<{ id: string }>(
    "INSERT INTO public.users (email, password_hash, full_name, is_active) VALUES ($1, $2, $3, true) RETURNING id",
    [info.email, passwordPlaceholder, info.name],
  );

  return {
    id: newUser.data?.rows[0]?.id as string,
    email: info.email,
    fullName: info.name,
    isActive: true,
    isNew: true,
  };
}

interface TenantAuthInfo {
  roles: string[];
  primaryTenantId: string;
  scope: "global" | "tenant";
  tenantIds: string[];
  tenants: Array<{ tenant_id: string; role: string; scope: string }>;
}

export async function getUserTenantAuth(
  userId: string,
): Promise<TenantAuthInfo | null> {
  const result = await query<{
    tenant_id: string;
    role: string;
    scope: string;
  }>("SELECT * FROM public.get_tenant_user_auth($1)", [userId]);

  if (!result.data?.rows.length) return null;

  return {
    roles: result.data.rows.map((r) => r.role),
    primaryTenantId: result.data.rows[0].tenant_id,
    scope: result.data.rows[0].scope as "global" | "tenant",
    tenantIds: result.data.rows.map((r) => r.tenant_id),
    tenants: result.data.rows.map((r) => ({
      tenant_id: r.tenant_id,
      role: r.role,
      scope: r.scope,
    })),
  };
}
