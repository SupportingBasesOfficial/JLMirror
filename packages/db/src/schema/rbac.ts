// @ai-context: .zero-error/architecture-map.md#state-store
// Drizzle schema — RBAC (Role-Based Access Control) module
// Mirrors refactor-blueprint/ideal_schema.sql Section 4
// (validated live against TimescaleDB 2.29.1 / PostgreSQL 16.14, 2026-08-11)
import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  varchar,
  integer,
  jsonb,
  primaryKey,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { tenants } from "./tenant";

export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  description: text("description"),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const permissions = pgTable(
  "permissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull().unique(),
    description: text("description"),
    category: varchar("category", { length: 100 }).notNull().default("general"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_permissions_category").on(table.category)],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.roleId, table.permissionId] }),
    index("idx_role_permissions_permission").on(table.permissionId),
  ],
);

export const attributePolicies = pgTable(
  "attribute_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roleKey: varchar("role_key", { length: 50 }).notNull(),
    permissionKey: text("permission_key").notNull(),
    conditionType: varchar("condition_type", { length: 50 }).notNull(),
    conditionValue: jsonb("condition_value").notNull(),
    effect: varchar("effect", { length: 20 }).notNull().default("deny"),
    priority: integer("priority").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_attribute_policies_role").on(table.roleKey, table.isActive),
    check(
      "attribute_policies_condition_type_check",
      sql`${table.conditionType} IN ('time_window', 'ip_range', 'location', 'device')`,
    ),
    check(
      "attribute_policies_effect_check",
      sql`${table.effect} IN ('allow', 'deny')`,
    ),
  ],
);

export const tenantCustomRoles = pgTable(
  "tenant_custom_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("tenant_custom_roles_tenant_key_unique").on(
      table.tenantId,
      table.key,
    ),
    index("idx_tenant_custom_roles_tenant").on(table.tenantId, table.isActive),
  ],
);

export const tenantCustomRolePermissions = pgTable(
  "tenant_custom_role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => tenantCustomRoles.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permissionId] })],
);

export const rolesRelations = relations(roles, ({ many }) => ({
  rolePermissions: many(rolePermissions),
}));

export const permissionsRelations = relations(permissions, ({ many }) => ({
  rolePermissions: many(rolePermissions),
  tenantCustomRolePermissions: many(tenantCustomRolePermissions),
}));

export const rolePermissionsRelations = relations(
  rolePermissions,
  ({ one }) => ({
    role: one(roles, {
      fields: [rolePermissions.roleId],
      references: [roles.id],
    }),
    permission: one(permissions, {
      fields: [rolePermissions.permissionId],
      references: [permissions.id],
    }),
  }),
);

export const tenantCustomRolesRelations = relations(
  tenantCustomRoles,
  ({ one, many }) => ({
    tenant: one(tenants, {
      fields: [tenantCustomRoles.tenantId],
      references: [tenants.id],
    }),
    permissions: many(tenantCustomRolePermissions),
  }),
);

export const tenantCustomRolePermissionsRelations = relations(
  tenantCustomRolePermissions,
  ({ one }) => ({
    role: one(tenantCustomRoles, {
      fields: [tenantCustomRolePermissions.roleId],
      references: [tenantCustomRoles.id],
    }),
    permission: one(permissions, {
      fields: [tenantCustomRolePermissions.permissionId],
      references: [permissions.id],
    }),
  }),
);
