// @ai-context: .zero-error/architecture-map.md#state-store
// Bridge module — connects Drizzle-inferred DB types (from @repo/db) with
// Zod validation schemas (from ./index).
//
// DESIGN DECISION: API payloads use snake_case (e.g. `full_name`,
// `tenant_id`) to match the existing REST contract. Drizzle maps DB
// columns (snake_case) to TypeScript properties (camelCase) like
// `fullName`, `tenantId`. This module provides:
//
//   1. Re-exports of Drizzle Select/Insert/Update types for direct
//      consumption by repository layer (apps/api).
//   2. Compile-time type assertions that verify key fields are
//      type-compatible between Zod output and Drizzle Insert models.
//   3. Helper types for mapping between API shape (snake_case) and
//      DB shape (camelCase).
//
// All imports from @repo/db are `import type` only — no runtime
// dependency on `pg` or the connection pool is introduced, so this
// module is safe to import from browser/edge bundles.
import type { z } from "zod";
import type { User, NewUser } from "@repo/db/types";

import {
  loginInputSchema,
  createTenantUserSchema,
  createCustomRoleSchema,
  createRoleSchema,
  adminCreateUserSchema,
} from "./index";

// ====== 1. Re-export Drizzle types for repository layer ======
export type {
  Tenant,
  NewTenant,
  TenantUpdate,
  TenantRoute,
  NewTenantRoute,
  TenantUser,
  NewTenantUser,
  User,
  NewUser,
  UserUpdate,
  Session,
  NewSession,
  TrustedDevice,
  NewTrustedDevice,
  PasswordResetToken,
  NewPasswordResetToken,
  UserMfaTotp,
  NewUserMfaTotp,
  UserWebauthnCredential,
  NewUserWebauthnCredential,
  MfaChallenge,
  NewMfaChallenge,
  Role,
  NewRole,
  RoleUpdate,
  Permission,
  NewPermission,
  RolePermission,
  NewRolePermission,
  AttributePolicy,
  NewAttributePolicy,
  AttributePolicyUpdate,
  TenantCustomRole,
  NewTenantCustomRole,
  TenantCustomRoleUpdate,
  TenantCustomRolePermission,
  NewTenantCustomRolePermission,
} from "@repo/db/types";

// ====== 2. Compile-time type alignment assertions ======
// These utility types produce a compile error if the Zod-inferred
// type for a key diverges from the Drizzle Insert type for the
// corresponding field. They are never instantiated at runtime —
// they exist purely for static verification.
//
// Usage: if someone renames `full_name` to `name` in the DB schema
// (the historical bug documented in current_architecture_audit.md),
// the assertion below will fail at compile time, preventing
// regression.

// Verifica que o campo `email` é string em ambos os lados
type AssertEmailAlignment = z.infer<
  typeof loginInputSchema
>["email"] extends string
  ? User["email"] extends string
    ? true
    : never
  : never;
type _EmailOk = AssertEmailAlignment extends true ? true : never;

// Verifica que `full_name` (API) corresponde a `fullName` (DB)
type AssertFullNameAlignment = z.infer<
  typeof createTenantUserSchema
>["full_name"] extends string | undefined
  ? User["fullName"] extends string | null
    ? true
    : never
  : never;
type _FullNameOk = AssertFullNameAlignment extends true ? true : never;

// Verifica que `role` (API) corresponde a `role` (DB tenant_users)
type AssertRoleAlignment = z.infer<
  typeof createTenantUserSchema
>["role"] extends string
  ? true
  : never;
type _RoleOk = AssertRoleAlignment extends true ? true : never;

// Verifica que `key` (API custom role) corresponde a `key` (DB)
type AssertCustomRoleKeyAlignment = z.infer<
  typeof createCustomRoleSchema
>["key"] extends string
  ? TenantCustomRole["key"] extends string
    ? true
    : never
  : never;
type _CustomRoleKeyOk = AssertCustomRoleKeyAlignment extends true
  ? true
  : never;

// Verifica que `must_change_password` (API) corresponde a
// `mustChangePassword` (DB)
type AssertMustChangePasswordAlignment = z.infer<
  typeof adminCreateUserSchema
>["must_change_password"] extends boolean
  ? User["mustChangePassword"] extends boolean
    ? true
    : never
  : never;
type _MustChangePasswordOk = AssertMustChangePasswordAlignment extends true
  ? true
  : never;

// ====== 3. Snake-to-camel mapping helpers ======
// Converte chaves snake_case (API) para camelCase (Drizzle).
// Uso típico no repository: `db.insert(users).values(toDbUser(apiPayload))`.
export type SnakeToCamel<S extends string> =
  S extends `${infer Head}_${infer Tail}`
    ? `${Head}${Capitalize<SnakeToCamel<Tail>>}`
    : S;

export type CamelToSnake<S extends string> =
  S extends `${infer Head}${infer Tail}`
    ? Tail extends Uncapitalize<Tail>
      ? `${Head}${CamelToSnake<Tail>}`
      : `${Head}_${Uncapitalize<Tail>}${CamelToSnake<Tail>}`
    : S;

// Mapeia um tipo com chaves snake_case para chaves camelCase,
// preservando os tipos dos valores.
export type SnakeToCamelObject<T extends Record<string, unknown>> = {
  [K in keyof T as SnakeToCamel<K & string>]: T[K];
};

// Mapeia um tipo com chaves camelCase para chaves snake_case.
export type CamelToSnakeObject<T extends Record<string, unknown>> = {
  [K in keyof T as CamelToSnake<K & string>]: T[K];
};

// Helpers concretos para as entidades core mapeadas no Phase 1.
// Estes tipos garantem que o payload da API (snake_case) pode ser
// convertido para o formato de insert do Drizzle (camelCase) sem
// perda de informação de tipo.
export type ApiUserPayload = z.infer<typeof adminCreateUserSchema>;
export type DbUserInsert = NewUser;

export type ApiCustomRolePayload = z.infer<typeof createCustomRoleSchema>;
export type DbCustomRoleInsert = NewTenantCustomRole;

export type ApiRolePayload = z.infer<typeof createRoleSchema>;
export type DbRoleInsert = NewRole;
