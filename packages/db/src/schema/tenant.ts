// @ai-context: .zero-error/architecture-map.md#state-store
// Drizzle schema — Tenant Management module
// Mirrors refactor-blueprint/ideal_schema.sql Section 3.5 + Section 5
// (validated live against TimescaleDB 2.29.1 / PostgreSQL 16.14, 2026-08-11)
import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  index,
  uniqueIndex,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { users } from "./auth";

export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    cnpj: varchar("cnpj", { length: 18 }).unique(),
    contractEndDate: timestamp("contract_end_date", { withTimezone: true }),
    status: varchar("status", { length: 50 }).notNull().default("active"),
    // self-referencing FK — defined via callback to avoid init-order issues
    parentTenantId: uuid("parent_tenant_id").references(
      (): AnyPgColumn => tenants.id,
    ),
    tenantType: varchar("tenant_type", { length: 20 })
      .notNull()
      .default("client"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_tenants_parent").on(table.parentTenantId),
    index("idx_tenants_type").on(table.tenantType),
    index("idx_tenants_status").on(table.status),
    check(
      "tenants_status_check",
      sql`${table.status} IN ('active', 'inactive', 'suspended')`,
    ),
    check(
      "tenants_tenant_type_check",
      sql`${table.tenantType} IN ('owner', 'manager', 'client')`,
    ),
  ],
);

export const tenantRoutes = pgTable(
  "tenant_routes",
  {
    tenantId: uuid("tenant_id")
      .primaryKey()
      .references(() => tenants.id, { onDelete: "cascade" }),
    clusterId: varchar("cluster_id", { length: 50 }).notNull(),
    clusterHost: varchar("cluster_host", { length: 255 }).notNull(),
    clusterDatabaseName: varchar("cluster_database_name", {
      length: 63,
    }).notNull(),
    clusterPort: integer("cluster_port").notNull().default(5432),
    schemaName: varchar("schema_name", { length: 63 }).notNull().unique(),
    isEnterprise: boolean("is_enterprise").notNull().default(false),
    zabbixHostGroupId: text("zabbix_host_group_id").notNull(),
    zabbixApiUrl: text("zabbix_api_url").notNull(),
    zabbixEncryptedToken: text("zabbix_encrypted_token").notNull(),
    zabbixTokenIv: text("zabbix_token_iv").notNull(),
    zabbixTokenTag: text("zabbix_token_tag").notNull(),
    zabbixConnectorToken: text("zabbix_connector_token"),
    status: varchar("status", { length: 50 }).notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("tenant_routes_schema_name_unique").on(table.schemaName),
    check(
      "chk_schema_name_format",
      sql`${table.schemaName} ~ '^tenant_[a-f0-9]{8}$'`,
    ),
    check(
      "tenant_routes_status_check",
      sql`${table.status} IN ('active', 'inactive', 'migrating')`,
    ),
  ],
);

export const tenantUsers = pgTable(
  "tenant_users",
  {
    // composite PK — see relations() below; @repo/shared-validation's
    // updateUserRoleSchema.scope maps 1:1 to this `scope` column
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 50 }).notNull(),
    scope: varchar("scope", { length: 10 }).notNull().default("tenant"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("tenant_users_pkey").on(table.userId, table.tenantId),
    index("idx_tenant_users_lookup").on(table.userId),
    index("idx_tenant_users_tenant").on(table.tenantId),
    check(
      "tenant_users_scope_check",
      sql`${table.scope} IN ('global', 'tenant')`,
    ),
  ],
);

export const tenantsRelations = relations(tenants, ({ one, many }) => ({
  parent: one(tenants, {
    fields: [tenants.parentTenantId],
    references: [tenants.id],
    relationName: "tenantHierarchy",
  }),
  children: many(tenants, { relationName: "tenantHierarchy" }),
  route: one(tenantRoutes, {
    fields: [tenants.id],
    references: [tenantRoutes.tenantId],
  }),
  tenantUsers: many(tenantUsers),
}));

export const tenantRoutesRelations = relations(tenantRoutes, ({ one }) => ({
  tenant: one(tenants, {
    fields: [tenantRoutes.tenantId],
    references: [tenants.id],
  }),
}));

export const tenantUsersRelations = relations(tenantUsers, ({ one }) => ({
  tenant: one(tenants, {
    fields: [tenantUsers.tenantId],
    references: [tenants.id],
  }),
}));
