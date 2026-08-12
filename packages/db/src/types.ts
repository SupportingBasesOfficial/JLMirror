// @ai-context: .zero-error/architecture-map.md#state-store
// Inferred TypeScript types for every Drizzle-mapped table.
//
// Drizzle ORM infers these directly from the schema definitions in
// ./schema/* at compile time — there is no separate "generate" step
// (unlike Prisma). This module simply re-exports the inferred
// Select / Insert / Update types so downstream packages
// (@repo/shared-validation, apps/api, apps/web) can consume them
// without depending on Drizzle internals.
//
// CONVENTION: every table `foo` exports three types:
//   - Foo        (Select — full row as read from DB)
//   - NewFoo     (Insert — payload for INSERT)
//   - FooUpdate  (Update — partial payload for UPDATE)
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { eq, and, getTableColumns } from "drizzle-orm";
import * as schema from "./schema/index";

// ====== Tenants ======
export type Tenant = InferSelectModel<typeof schema.tenants>;
export type NewTenant = InferInsertModel<typeof schema.tenants>;
export type TenantUpdate = Partial<NewTenant>;

export type TenantRoute = InferSelectModel<typeof schema.tenantRoutes>;
export type NewTenantRoute = InferInsertModel<typeof schema.tenantRoutes>;
export type TenantRouteUpdate = Partial<NewTenantRoute>;

export type TenantUser = InferSelectModel<typeof schema.tenantUsers>;
export type NewTenantUser = InferInsertModel<typeof schema.tenantUsers>;
export type TenantUserUpdate = Partial<NewTenantUser>;

// ====== Auth / Users ======
export type User = InferSelectModel<typeof schema.users>;
export type NewUser = InferInsertModel<typeof schema.users>;
export type UserUpdate = Partial<NewUser>;

export type Session = InferSelectModel<typeof schema.sessions>;
export type NewSession = InferInsertModel<typeof schema.sessions>;

export type TrustedDevice = InferSelectModel<typeof schema.trustedDevices>;
export type NewTrustedDevice = InferInsertModel<typeof schema.trustedDevices>;

export type PasswordResetToken = InferSelectModel<
  typeof schema.passwordResetTokens
>;
export type NewPasswordResetToken = InferInsertModel<
  typeof schema.passwordResetTokens
>;

export type UserMfaTotp = InferSelectModel<typeof schema.userMfaTotp>;
export type NewUserMfaTotp = InferInsertModel<typeof schema.userMfaTotp>;

export type UserWebauthnCredential = InferSelectModel<
  typeof schema.userWebauthnCredentials
>;
export type NewUserWebauthnCredential = InferInsertModel<
  typeof schema.userWebauthnCredentials
>;

export type MfaChallenge = InferSelectModel<typeof schema.mfaChallenges>;
export type NewMfaChallenge = InferInsertModel<typeof schema.mfaChallenges>;

// ====== RBAC ======
export type Role = InferSelectModel<typeof schema.roles>;
export type NewRole = InferInsertModel<typeof schema.roles>;
export type RoleUpdate = Partial<NewRole>;

export type Permission = InferSelectModel<typeof schema.permissions>;
export type NewPermission = InferInsertModel<typeof schema.permissions>;

export type RolePermission = InferSelectModel<typeof schema.rolePermissions>;
export type NewRolePermission = InferInsertModel<typeof schema.rolePermissions>;

export type AttributePolicy = InferSelectModel<typeof schema.attributePolicies>;
export type NewAttributePolicy = InferInsertModel<
  typeof schema.attributePolicies
>;
export type AttributePolicyUpdate = Partial<NewAttributePolicy>;

export type TenantCustomRole = InferSelectModel<
  typeof schema.tenantCustomRoles
>;
export type NewTenantCustomRole = InferInsertModel<
  typeof schema.tenantCustomRoles
>;
export type TenantCustomRoleUpdate = Partial<NewTenantCustomRole>;

export type TenantCustomRolePermission = InferSelectModel<
  typeof schema.tenantCustomRolePermissions
>;
export type NewTenantCustomRolePermission = InferInsertModel<
  typeof schema.tenantCustomRolePermissions
>;

// ====== Zabbix ======
export type Device = InferSelectModel<typeof schema.devices>;
export type NewDevice = InferInsertModel<typeof schema.devices>;
export type DeviceUpdate = Partial<NewDevice>;

export type UserHostGroup = InferSelectModel<typeof schema.userHostGroups>;
export type NewUserHostGroup = InferInsertModel<typeof schema.userHostGroups>;

export type ZabbixHistoryCache = InferSelectModel<
  typeof schema.zabbixHistoryCache
>;
export type NewZabbixHistoryCache = InferInsertModel<
  typeof schema.zabbixHistoryCache
>;

// ====== Metrics (TimescaleDB hypertables + partitioned) ======
export type SystemMetric = InferSelectModel<typeof schema.systemMetrics>;
export type NewSystemMetric = InferInsertModel<typeof schema.systemMetrics>;

export type CapacityMetric = InferSelectModel<typeof schema.capacityMetrics>;
export type NewCapacityMetric = InferInsertModel<typeof schema.capacityMetrics>;

// ====== Logs & Traces (monthly partitioned) ======
export type SystemLog = InferSelectModel<typeof schema.systemLogs>;
export type NewSystemLog = InferInsertModel<typeof schema.systemLogs>;

export type TraceSpan = InferSelectModel<typeof schema.traceSpans>;
export type NewTraceSpan = InferInsertModel<typeof schema.traceSpans>;

// Re-export helper operators for ergonomic typed queries downstream.
export { eq, and, getTableColumns, schema };
