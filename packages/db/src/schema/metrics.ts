// @ai-context: .zero-error/architecture-map.md#state-store
// Drizzle schema — Metrics & Observability module (TimescaleDB hypertables)
// Mirrors refactor-blueprint/ideal_schema.sql Section 10
// (validated live against TimescaleDB 2.29.1 / PostgreSQL 16.14, 2026-08-11)
//
// TABLES MAPPED:
//   system_metrics     — TimescaleDB hypertable (internal JLMIRROR metrics)
//   capacity_metrics   — Partitioned by month (capacity planning metrics)
//
// HYPERTABLE NOTES:
//   - system_metrics: chunk_time_interval = 1 day, retention = 90 days
//   - RLS enabled on both tables (tenant_id::text = current_setting(...))
//   - Compression DROPPED on system_metrics (incompatible with RLS — see
//     migrations/20260801140000_timescaledb_system_metrics.sql comment)
//
// PARTITIONED TABLE NOTES:
//   - capacity_metrics: PARTITION BY RANGE (created_at), monthly partitions
//   - Drizzle maps partitioned tables normally — partition management is
//     handled by partition-manager.ts worker (creates/drops monthly partitions)
import {
  pgTable,
  uuid,
  text,
  doublePrecision,
  timestamp,
  bigserial,
  jsonb,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { tenants } from "./tenant";

// ============================================================================
// system_metrics — TimescaleDB hypertable
// Metricas internas do JLMIRROR (latencia, throughput, pool stats, etc).
// Hypertable partitionado por recorded_at (chunk_time_interval = 1 day).
// RLS: tenant_id::text = current_setting('app.current_tenant_id') OR tenant_id IS NULL.
// Retention: 90 dias. Compression DROPPED (incompativel com RLS).
//
// IMPORTANTE: BIGSERIAL + composite PK (id, recorded_at) — Drizzle mapeia
// via bigserial + timestamp + primaryKey().
// ============================================================================
export const systemMetrics = pgTable(
  "system_metrics",
  {
    // bigserial — auto-increment bigint (TimescaleDB hypertable requirement)
    id: bigserial("id", { mode: "number" }).notNull(),
    tenantId: uuid("tenant_id").references(() => tenants.id, {
      onDelete: "cascade",
    }),
    metricName: text("metric_name").notNull(),
    metricValue: doublePrecision("metric_value").notNull(),
    labels: jsonb("labels").notNull().default({}),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Composite PK — required for hypertable partitioning by recorded_at
    primaryKey({ columns: [table.id, table.recordedAt] }),
    index("idx_system_metrics_name_tenant_time").on(
      table.metricName,
      table.tenantId,
      sql`${table.recordedAt} DESC`,
    ),
    // GIN index on labels JSONB — defined in migration, not Drizzle
    // (Drizzle does not support GIN indexes in schema definition)
  ],
);

// ============================================================================
// capacity_metrics — Partitioned by month (created_at)
// Metricas de capacity planning (CPU, memory, disk, network per resource).
// PARTITION BY RANGE (created_at) — monthly partitions managed by
// partition-manager.ts worker.
// RLS: tenant_id::text = current_setting('app.current_tenant_id').
// ============================================================================
export const capacityMetrics = pgTable(
  "capacity_metrics",
  {
    id: uuid("id").defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id, {
      onDelete: "cascade",
    }),
    resourceName: text("resource_name").notNull(),
    metricType: text("metric_type").notNull(),
    value: doublePrecision("value").notNull(),
    unit: text("unit"),
    labels: jsonb("labels").notNull().default({}),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Composite PK — required for partition by created_at
    primaryKey({ columns: [table.id, table.createdAt] }),
    index("idx_capacity_metrics_tenant_created").on(
      table.tenantId,
      sql`${table.createdAt} DESC`,
    ),
    index("idx_capacity_metrics_resource").on(
      table.resourceName,
      table.metricType,
      sql`${table.createdAt} DESC`,
    ),
  ],
);

// Relations
export const systemMetricsRelations = relations(systemMetrics, ({ one }) => ({
  tenant: one(tenants, {
    fields: [systemMetrics.tenantId],
    references: [tenants.id],
  }),
}));

export const capacityMetricsRelations = relations(
  capacityMetrics,
  ({ one }) => ({
    tenant: one(tenants, {
      fields: [capacityMetrics.tenantId],
      references: [tenants.id],
    }),
  }),
);
