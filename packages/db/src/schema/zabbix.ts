// @ai-context: .zero-error/architecture-map.md#state-store
// Drizzle schema — Zabbix integration module
// Mirrors refactor-blueprint/ideal_schema.sql Section 9 + Section 10
// (validated live against TimescaleDB 2.29.1 / PostgreSQL 16.14, 2026-08-11)
//
// TABLES MAPPED:
//   devices               — public.devices (Zabbix host sync target)
//   user_host_groups      — public.user_host_groups (per-user Zabbix host group access)
//   zabbix_history_cache  — TimescaleDB hypertable (connector streaming cache)
//
// NOTE: tenant_routes (with zabbix_* config columns) is mapped in ./tenant.ts
// NOTE: RLS policies are defined in migrations, not in Drizzle — Drizzle only
//       defines structure. RLS is enforced at the PostgreSQL level via
//       `SET LOCAL app.current_tenant_id` injected by withTenantDb().
import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  bigserial,
  integer,
  smallint,
  bigint,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { tenants } from "./tenant";
import { users } from "./auth";

// ============================================================================
// devices — public.devices
// Sincroniza hosts do Zabbix para esta tabela com RLS por tenant.
// Unique constraint em (tenant_id, zabbix_host_id) WHERE zabbix_host_id IS NOT NULL
// ============================================================================
export const devices = pgTable(
  "devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    hostname: text("hostname").notNull(),
    ip: text("ip").notNull(),
    type: text("type").notNull().default("server"),
    deviceType: text("device_type"),
    vendor: text("vendor"),
    model: text("model"),
    status: text("status").notNull().default("active"),
    isActive: boolean("is_active").notNull().default(true),
    zabbixHostId: text("zabbix_host_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_devices_tenant_id").on(table.tenantId),
    index("idx_devices_hostname").on(table.hostname),
    index("idx_devices_status").on(table.status),
    // Partial unique index — only enforces uniqueness when zabbix_host_id IS NOT NULL
    // Drizzle supports partial unique indexes via .where() on uniqueIndex
    uniqueIndex("idx_devices_tenant_zabbix")
      .on(table.tenantId, table.zabbixHostId)
      .where(sql`${table.zabbixHostId} IS NOT NULL`),
  ],
);

// ============================================================================
// user_host_groups — public.user_host_groups
// Mapeia usuarios a host groups do Zabbix para acesso granular por tenant.
// ============================================================================
export const userHostGroups = pgTable(
  "user_host_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    zabbixHostGroupId: text("zabbix_host_group_id").notNull(),
    zabbixHostGroupName: text("zabbix_host_group_name"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_user_host_groups_tenant").on(table.tenantId),
    index("idx_user_host_groups_user").on(table.userId),
    uniqueIndex("user_host_groups_tenant_user_group_unique").on(
      table.tenantId,
      table.userId,
      table.zabbixHostGroupId,
    ),
  ],
);

// ============================================================================
// zabbix_history_cache — TimescaleDB hypertable
// Cache de history do Zabbix via connector streaming.
// Hypertable partitionado por received_at (chunk_time_interval = 1 day).
// RLS habilitado (tenant_id::text = current_setting('app.current_tenant_id')).
// Retention: 30 dias. Compression DROPPED (incompativel com RLS — ver note em
// migrations/20260808200000_zabbix_history_cache.sql).
//
// IMPORTANTE: Esta tabela usa BIGSERIAL (auto-increment bigint) + composite PK
// (id, received_at) — Drizzle mapeia via bigserial + timestamp.
// ============================================================================
export const zabbixHistoryCache = pgTable(
  "zabbix_history_cache",
  {
    // bigserial — auto-increment bigint (TimescaleDB hypertable requirement)
    id: bigserial("id", { mode: "number" }).notNull(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    itemid: text("itemid").notNull(),
    hostid: text("hostid").notNull(),
    // clock = Unix timestamp em segundos (bigint — Zabbix usa BIGINT)
    clock: bigint("clock", { mode: "number" }).notNull(),
    // ns = nanosegundos (integer — Zabbix usa INTEGER)
    ns: integer("ns").notNull().default(0),
    value: text("value").notNull(),
    // value_type = tipo do valor Zabbix (0=float, 1=str, 2=log, 3=int, 4=text)
    valueType: smallint("value_type").notNull().default(0),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Composite PK — required for hypertable partitioning by received_at
    primaryKey({ columns: [table.id, table.receivedAt] }),
    index("idx_zabbix_history_tenant_item_time").on(
      table.tenantId,
      table.itemid,
      sql`${table.clock} DESC`,
    ),
    index("idx_zabbix_history_tenant_host").on(table.tenantId, table.hostid),
  ],
);

// Relations
export const devicesRelations = relations(devices, ({ one }) => ({
  tenant: one(tenants, {
    fields: [devices.tenantId],
    references: [tenants.id],
  }),
}));

export const userHostGroupsRelations = relations(userHostGroups, ({ one }) => ({
  tenant: one(tenants, {
    fields: [userHostGroups.tenantId],
    references: [tenants.id],
  }),
  user: one(users, {
    fields: [userHostGroups.userId],
    references: [users.id],
  }),
}));

export const zabbixHistoryCacheRelations = relations(
  zabbixHistoryCache,
  ({ one }) => ({
    tenant: one(tenants, {
      fields: [zabbixHistoryCache.tenantId],
      references: [tenants.id],
    }),
  }),
);
