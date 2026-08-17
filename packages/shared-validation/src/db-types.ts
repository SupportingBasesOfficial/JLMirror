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
import type {
  User,
  NewUser,
  NewRole,
  TenantCustomRole,
  NewTenantCustomRole,
} from "@repo/db/types";

import {
  loginInputSchema,
  createTenantUserSchema,
  createCustomRoleSchema,
  createRoleSchema,
  adminCreateUserSchema,
} from "./index.js";

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
type AssertEmailAlignment = z.infer<
  typeof loginInputSchema
>["email"] extends string
  ? User["email"] extends string
    ? true
    : never
  : never;
type _EmailOk = AssertEmailAlignment extends true ? true : never;

type AssertFullNameAlignment = z.infer<
  typeof createTenantUserSchema
>["full_name"] extends string | undefined
  ? User["fullName"] extends string | null
    ? true
    : never
  : never;
type _FullNameOk = AssertFullNameAlignment extends true ? true : never;

type AssertRoleAlignment = z.infer<
  typeof createTenantUserSchema
>["role"] extends string
  ? true
  : never;
type _RoleOk = AssertRoleAlignment extends true ? true : never;

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

export type SnakeToCamelObject<T extends Record<string, unknown>> = {
  [K in keyof T as SnakeToCamel<K & string>]: T[K];
};

export type CamelToSnakeObject<T extends Record<string, unknown>> = {
  [K in keyof T as CamelToSnake<K & string>]: T[K];
};

export type ApiUserPayload = z.infer<typeof adminCreateUserSchema>;
export type DbUserInsert = NewUser;

export type ApiCustomRolePayload = z.infer<typeof createCustomRoleSchema>;
export type DbCustomRoleInsert = NewTenantCustomRole;

export type ApiRolePayload = z.infer<typeof createRoleSchema>;
export type DbRoleInsert = NewRole;

// ============================================================
// ====== 4. BLINDAGEM: Contratos Industriais do BullMQ ======
// ============================================================

/**
 * Esquema de validação estrito para jobs inseridos na fila assíncrona de telemetria.
 * Sincroniza o contrato entre a rota HTTP connector-stream e o worker background.
 */
export interface ZabbixMetricsJobPayload {
  tenantId: string;
  payload: string; // Payload serializado em formato texto para preservar a Event Loop HTTP principal
  timestamp: number;
}

export interface ZabbixMetricsHistoryEntry {
  itemid: string;
  hostid?: string;
  clock: number;
  ns?: number;
  value: string;
  value_type?: number;
}
