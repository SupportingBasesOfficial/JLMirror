// @ai-context: .zero-error/architecture-map.md#state-store
// Drizzle schema — Logs & Tracing module (monthly partitioned tables)
// Mirrors refactor-blueprint/ideal_schema.sql Section 10
// (validated live against TimescaleDB 2.29.1 / PostgreSQL 16.14, 2026-08-11)
//
// TABLES MAPPED:
//   system_logs  — Partitioned by month (created_at) — centralized logs
//   trace_spans  — Partitioned by month (created_at) — OpenTelemetry traces
//
// PARTITIONED TABLE NOTES:
//   - Both tables: PARTITION BY RANGE (created_at), monthly partitions
//   - Partition management handled by partition-manager.ts worker
//   - RLS enabled on both (tenant_id::text = current_setting(...))
//   - Drizzle maps partitioned tables normally — the composite PK includes
//     the partition column (created_at) as required by PostgreSQL.
import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  index,
  primaryKey,
  check,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { tenants } from "./tenant";

// ============================================================================
// system_logs — Partitioned by month (created_at)
// Logs centralizados do JLMIRROR (API, dispositivos, scripts, automacoes).
// PARTITION BY RANGE (created_at) — monthly partitions managed by
// partition-manager.ts worker.
// RLS: tenant_id::text = current_setting('app.current_tenant_id').
//
// Schema (post-partitioning migration 20260728000000):
//   id, tenant_id, source, level, message, payload, correlation_id, created_at
// ============================================================================
export const systemLogs = pgTable(
  "system_logs",
  {
    id: uuid("id").defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id, {
      onDelete: "cascade",
    }),
    source: text("source").notNull(),
    level: text("level").notNull().default("info"),
    message: text("message").notNull(),
    payload: jsonb("payload").notNull().default({}),
    correlationId: text("correlation_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Composite PK — required for partition by created_at
    primaryKey({ columns: [table.id, table.createdAt] }),
    index("idx_system_logs_tenant_created").on(
      table.tenantId,
      sql`${table.createdAt} DESC`,
    ),
    index("idx_system_logs_source").on(
      table.source,
      sql`${table.createdAt} DESC`,
    ),
    // Partial index on level (error/fatal only) — defined in migration
    check(
      "system_logs_level_check",
      sql`${table.level} IN ('debug', 'info', 'warn', 'error', 'fatal')`,
    ),
  ],
);

// ============================================================================
// trace_spans — Partitioned by month (created_at)
// OpenTelemetry-style trace spans for distributed tracing.
// PARTITION BY RANGE (created_at) — monthly partitions managed by
// partition-manager.ts worker.
// RLS: tenant_id::text = current_setting('app.current_tenant_id').
// ============================================================================
export const traceSpans = pgTable(
  "trace_spans",
  {
    id: uuid("id").defaultRandom(),
    traceId: text("trace_id").notNull(),
    spanId: text("span_id").notNull(),
    parentSpanId: text("parent_span_id"),
    tenantId: uuid("tenant_id").references(() => tenants.id, {
      onDelete: "cascade",
    }),
    operationName: text("operation_name").notNull(),
    service: text("service").notNull(),
    kind: text("kind").notNull().default("internal"),
    startTime: timestamp("start_time", { withTimezone: true }).notNull(),
    endTime: timestamp("end_time", { withTimezone: true }).notNull(),
    durationMs: integer("duration_ms").notNull(),
    status: text("status").notNull().default("ok"),
    statusMessage: text("status_message"),
    attributes: jsonb("attributes").notNull().default({}),
    events: jsonb("events").notNull().default([]),
    resource: jsonb("resource").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Composite PK — required for partition by created_at
    primaryKey({ columns: [table.id, table.createdAt] }),
    index("idx_trace_spans_trace").on(table.traceId, table.startTime),
    index("idx_trace_spans_tenant").on(
      table.tenantId,
      sql`${table.startTime} DESC`,
    ),
    index("idx_trace_spans_service").on(
      table.service,
      sql`${table.startTime} DESC`,
    ),
    check(
      "trace_spans_kind_check",
      sql`${table.kind} IN ('server', 'client', 'producer', 'consumer', 'internal')`,
    ),
    check(
      "trace_spans_status_check",
      sql`${table.status} IN ('ok', 'error', 'unset')`,
    ),
  ],
);

// Relations
export const systemLogsRelations = relations(systemLogs, ({ one }) => ({
  tenant: one(tenants, {
    fields: [systemLogs.tenantId],
    references: [tenants.id],
  }),
}));

export const traceSpansRelations = relations(traceSpans, ({ one }) => ({
  tenant: one(tenants, {
    fields: [traceSpans.tenantId],
    references: [tenants.id],
  }),
}));
