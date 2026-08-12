// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// Lookup/criacao de usuario por email para auth externa (OAuth, LDAP)
// Refatorado para usar Drizzle ORM em vez de query() raw SQL.

import { withTenantDb, schema } from "@repo/db/drizzle";
import { eq, sql } from "drizzle-orm";

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
  const existing = await withTenantDb(async (db) => {
    const [row] = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        fullName: schema.users.fullName,
        isActive: schema.users.isActive,
      })
      .from(schema.users)
      .where(eq(schema.users.email, info.email))
      .limit(1);
    return row;
  });

  if (existing) {
    if (!existing.isActive) {
      return { error: "USER_INACTIVE" };
    }
    return {
      id: existing.id,
      email: existing.email,
      fullName: existing.fullName,
      isActive: existing.isActive,
      isNew: false,
    };
  }

  const newUser = await withTenantDb(async (db) => {
    const [row] = await db
      .insert(schema.users)
      .values({
        email: info.email,
        passwordHash: passwordPlaceholder,
        fullName: info.name,
        isActive: true,
      })
      .returning({ id: schema.users.id });
    return row;
  });

  return {
    id: newUser!.id,
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
  // A funcao RPC get_tenant_user_auth faz joins complexos entre
  // tenant_users e tenants. Mantemos a chamada via Drizzle sql template
  // para nao duplicar a logica de join em TypeScript.
  const result = await withTenantDb(async (db) => {
    return db.execute<{
      tenant_id: string;
      role: string;
      scope: string;
    }>(sql`SELECT * FROM public.get_tenant_user_auth(${userId})`);
  });

  if (!result.rows.length) return null;

  return {
    roles: result.rows.map((r) => r.role),
    primaryTenantId: result.rows[0]!.tenant_id,
    scope: result.rows[0]!.scope as "global" | "tenant",
    tenantIds: result.rows.map((r) => r.tenant_id),
    tenants: result.rows.map((r) => ({
      tenant_id: r.tenant_id,
      role: r.role,
      scope: r.scope,
    })),
  };
}
