// ============================================================================
// JLMIRROR — ORM & Type-Safety Blueprint
// Version: 2.0 (Refactor Blueprint)
// Generated: 2026-08-11
//
// This file is a BLUEPRINT (not production code). It demonstrates how we will
// use Drizzle ORM to map the ideal_schema.sql, generate TypeScript types
// automatically, and establish a bulletproof type-safety workflow where the
// DATABASE IS THE ONLY SOURCE OF TRUTH.
//
// Goals:
//   1. Eliminate column typos (e.g., `full_name` vs `name`) via compile-time
//      schema validation.
//   2. Eliminate duplicated types between frontend and backend.
//   3. Centralize all SQL in typed repository classes (no raw SQL in routes).
//   4. Auto-generate TypeScript types from the database schema.
//
// ============================================================================

// ============================================================================
// SECTION 1: Package Dependencies (to install)
// ============================================================================
//
// pnpm add drizzle-orm pg
// pnpm add -D drizzle-kit @types/pg
//
// We use drizzle-orm with the node-postgres driver (same `pg` we already use
// in @repo/db). No new runtime dependency — Drizzle sits on top of our
// existing pool.
//
// pnpm-workspace.yaml addition:
//   packages:
//     - "packages/db"          # existing — will host Drizzle schema
//     - "packages/drizzle-schema"  # NEW — generated types & schema
//
// ============================================================================
// SECTION 2: Project Structure
// ============================================================================
//
// packages/
//   db/                          # existing @repo/db
//     src/
//       index.ts                 # existing pool, query, tenantQuery
//       drizzle.ts               # NEW — Drizzle instance (reuses pool)
//       schema/                  # NEW — Drizzle schema definitions
//         auth.ts                # users, sessions, mfa, etc.
//         rbac.ts                # roles, permissions, role_permissions
//         tenant.ts              # tenants, tenant_routes, tenant_settings
//         devices.ts             # devices, user_host_groups
//         monitoring.ts          # system_logs, trace_spans, metrics
//         tickets.ts             # tickets, categories, comments, work_logs
//         sla.ts                 # services, incidents, maintenance_windows
//         changes.ts             # change_requests, approvals, tasks
//         assets.ts              # assets, asset_licenses, asset_changes
//         scripts.ts             # scripts, versions, executions
//         firewall.ts            # firewall_rules, versions, changes
//         k8s.ts                 # k8s_clusters, resources_cache, events
//         ssl.ts                 # ssl_certificates, checks, alerts
//         backup.ts              # backup_jobs, snapshots, restores
//         notifications.ts       # channels, rules, log, push_subscriptions
//         compliance.ts          # policies, scans, violations
//         capacity.ts            # thresholds, reports, forecasts, metrics
//         feature-flags.ts       # feature_flags, overrides, events
//         webhooks.ts            # webhooks, deliveries
//         api-keys.ts            # api_keys
//         scheduled-tasks.ts     # scheduled_tasks, runs
//         kb.ts                  # kb_categories, articles, feedback
//         reports.ts             # report_templates, scheduled_reports
//         escalation.ts          # policies, levels, instances
//         workflows.ts           # workflows, steps, executions
//         discovery.ts           # sessions, devices, links
//         anomaly.ts             # detections, config
//         predictions.ts         # predictions, config
//         correlation.ts         # rules, events
//         drift.ts               # baselines, events
//         finops.ts              # cost_entries, optimizations, budgets
//         billing.ts             # subscriptions, invoices
//         marketplace.ts         # apps, installs
//         itsm.ts                # connectors, sync_log
//         chatops.ts             # config, commands
//         lgpd.ts                # requests, audit_log
//         system-health.ts       # checks, incidents, metrics
//         client-portal.ts       # client_portal_users
//         error-reports.ts       # error_reports
//         sql-console.ts         # connections, templates
//         audit.ts               # audit_log
//         data-transfer.ts       # exports, imports, templates, whitelist
//         index.ts               # re-exports all schemas
//       repositories/            # NEW — typed data access layer
//         base.repository.ts     # generic CRUD with tenant context
//         ticket.repository.ts   # example: ticket-specific queries
//         change.repository.ts   # example: change-specific queries
//         user.repository.ts     # example: user-specific queries
//         ... (one per entity)
//     drizzle.config.ts          # Drizzle Kit config (migrate, generate, push)
//     generated/                 # auto-generated by drizzle-kit
//       schema.ts                # full schema export
//       types.ts                 # inferred types (the single source of truth)
//
// apps/
//   api/src/routes/              # routes become THIN — call repositories only
//   web/lib/                     # frontend imports types from @repo/db
//
// ============================================================================
// SECTION 3: Drizzle Instance Setup (packages/db/src/drizzle.ts)
// ============================================================================

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Reutiliza o pool existente do @repo/db — sem nova conexão
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { pool } = require("./index");

export const db = drizzle(pool, {
  schema,
  // Logger em desenvolvimento para debug de queries
  logger: process.env.NODE_ENV === "development",
});

// Função para criar instância Drizzle com contexto de tenant (RLS)
export function getTenantDb(tenantId: string) {
  // Drizzle não suporta SET LOCAL diretamente, então usamos
  // uma conexão dedicada do pool com SET LOCAL antes de cada query
  return drizzle(pool, {
    schema,
    logger: process.env.NODE_ENV === "development",
  });
}

// ============================================================================
// SECTION 4: Schema Definition Examples
// ============================================================================
//
// Cada arquivo de schema espelha exatamente a estrutura do ideal_schema.sql.
// O Drizzle valida em compile-time que cada coluna referenciada existe.
//

// ----------------------------------------------------------------------------
// 4.1 — packages/db/src/schema/auth.ts
// ----------------------------------------------------------------------------

import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  inet,
  varchar,
  integer,
  jsonb,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Enum definido no banco via CHECK constraint — Drizzle mapeia como pgEnum
export const mfaMethodEnum = pgEnum("mfa_method", ["totp", "webauthn"]);

// users table — NOTA: full_name (nunca `name`)
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    fullName: text("full_name"), // ← padronizado: SEMPRE full_name
    isActive: boolean("is_active").notNull().default(true),
    mustChangePassword: boolean("must_change_password")
      .notNull()
      .default(false),
    phone: text("phone"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    emailIdx: uniqueIndex("users_email_unique").on(table.email),
    activeIdx: index("idx_users_active").on(table.isActive),
  }),
);

// sessions table
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    refreshTokenHash: text("refresh_token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    deviceFingerprint: text("device_fingerprint"),
    ipAddress: inet("ip_address"),
    userAgent: text("user_agent"),
    deviceLabel: text("device_label"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdx: index("idx_sessions_user_id").on(table.userId),
    expiresIdx: index("idx_sessions_expires").on(table.expiresAt),
    fingerprintIdx: index("idx_sessions_device_fingerprint").on(
      table.deviceFingerprint,
    ),
    userActiveIdx: index("idx_sessions_user_id_active").on(table.userId),
  }),
);

// trusted_devices table
export const trustedDevices = pgTable(
  "trusted_devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deviceFingerprint: text("device_fingerprint").notNull(),
    deviceLabel: text("device_label"),
    ipAddress: inet("ip_address"),
    userAgent: text("user_agent"),
    trustedAt: timestamp("trusted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userFingerprintUnique: uniqueIndex(
      "trusted_devices_user_fingerprint_unique",
    ).on(table.userId, table.deviceFingerprint),
    userIdx: index("idx_trusted_devices_user_id").on(table.userId),
  }),
);

// user_mfa_totp table
export const userMfaTotp = pgTable(
  "user_mfa_totp",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    secret: text("secret").notNull(),
    recoveryCodes: jsonb("recovery_codes").notNull().default([]),
    isEnabled: boolean("is_enabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userUnique: uniqueIndex("user_mfa_totp_user_unique").on(table.userId),
  }),
);

// mfa_challenges table
export const mfaChallenges = pgTable(
  "mfa_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    method: mfaMethodEnum("method").notNull(),
    challengeToken: text("challenge_token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumed: boolean("consumed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tokenIdx: index("idx_mfa_challenges_token").on(table.challengeToken),
    expiresIdx: index("idx_mfa_challenges_expires").on(table.expiresAt),
  }),
);

// ----------------------------------------------------------------------------
// 4.2 — packages/db/src/schema/tenant.ts
// ----------------------------------------------------------------------------

import { tenants } from "./tenant";

// Re-export para centralizar imports
export { tenants };

// tenants table
export const tenantsTable = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    cnpj: varchar("cnpj", { length: 18 }).unique(),
    contractEndDate: timestamp("contract_end_date", { withTimezone: true }),
    status: varchar("status", { length: 50 }).notNull().default("active"),
    parentTenantId: uuid("parent_tenant_id").references(
      (): any => tenantsTable.id,
      {
        onDelete: "set null",
      },
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
  (table) => ({
    parentIdx: index("idx_tenants_parent").on(table.parentTenantId),
    typeIdx: index("idx_tenants_type").on(table.tenantType),
  }),
);

// tenant_routes table — Zabbix config lives here
export const tenantRoutes = pgTable(
  "tenant_routes",
  {
    tenantId: uuid("tenant_id")
      .primaryKey()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
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
  (table) => ({
    schemaNameUnique: uniqueIndex("tenant_routes_schema_name_unique").on(
      table.schemaName,
    ),
  }),
);

// ----------------------------------------------------------------------------
// 4.3 — packages/db/src/schema/tickets.ts (example with relations)
// ----------------------------------------------------------------------------

import { relations } from "drizzle-orm";

export const tickets = pgTable(
  "tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    ticketNumber: text("ticket_number").notNull(),
    categoryId: uuid("category_id").references(() => ticketCategories.id, {
      onDelete: "set null",
    }),
    subject: text("subject").notNull(),
    description: text("description").notNull(),
    priority: integer("priority").notNull().default(2),
    status: text("status").notNull().default("open"),
    assignedTo: uuid("assigned_to").references(() => users.id, {
      onDelete: "set null",
    }),
    requesterName: text("requester_name"),
    requesterEmail: text("requester_email"),
    requesterPhone: text("requester_phone"),
    source: text("source"),
    tags: text("tags").array().default([]),
    metadata: jsonb("metadata").default({}),
    slaResponseDueAt: timestamp("sla_response_due_at", { withTimezone: true }),
    slaResolutionDueAt: timestamp("sla_resolution_due_at", {
      withTimezone: true,
    }),
    slaRespondedAt: timestamp("sla_responded_at", { withTimezone: true }),
    slaResolvedAt: timestamp("sla_resolved_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantIdx: index("idx_tickets_tenant").on(table.tenantId, table.status),
    numberUnique: uniqueIndex("tickets_ticket_number_unique").on(
      table.tenantId,
      table.ticketNumber,
    ),
    assigneeIdx: index("idx_tickets_assignee").on(table.assignedTo),
    statusIdx: index("idx_tickets_status").on(table.tenantId, table.status),
    slaIdx: index("idx_tickets_sla_due").on(table.slaResolutionDueAt),
  }),
);

// Relations — Drizzle infere JOINs from these definitions
export const ticketsRelations = relations(tickets, ({ one, many }) => ({
  tenant: one(tenantsTable, {
    fields: [tickets.tenantId],
    references: [tenantsTable.id],
  }),
  category: one(ticketCategories, {
    fields: [tickets.categoryId],
    references: [ticketCategories.id],
  }),
  assignee: one(users, {
    fields: [tickets.assignedTo],
    references: [users.id],
    relationName: "assignedTickets",
  }),
  creator: one(users, {
    fields: [tickets.createdBy],
    references: [users.id],
    relationName: "createdTickets",
  }),
  comments: many(ticketComments),
  workLogs: many(ticketWorkLogs),
}));

// ----------------------------------------------------------------------------
// 4.4 — packages/db/src/schema/monitoring.ts (TimescaleDB hypertables)
// ----------------------------------------------------------------------------
//
// TimescaleDB hypertables são criadas como tabelas normais no Drizzle e
// depois convertidas com `create_hypertable()` via migration raw SQL.
// O Drizzle não tem suporte nativo para hypertables, mas mapeia as colunas
// normalmente.
//

export const systemMetrics = pgTable(
  "system_metrics",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    tenantId: uuid("tenant_id").references(() => tenantsTable.id, {
      onDelete: "cascade",
    }),
    metricName: text("metric_name").notNull(),
    metricValue: doublePrecision("metric_value").notNull(),
    labels: jsonb("labels").default({}),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    nameTenantTimeIdx: index("idx_system_metrics_name_tenant_time").on(
      table.metricName,
      table.tenantId,
      table.recordedAt,
    ),
    labelsGinIdx: index("idx_system_metrics_labels_gin").using(
      "gin",
      table.labels,
    ),
  }),
);

// ============================================================================
// SECTION 5: Auto-Generated Types (The Single Source of Truth)
// ============================================================================
//
// Após definir os schemas acima, rodamos:
//
//   pnpm drizzle-kit generate
//
// Isso gera:
//   1. Migration SQL (para revisão e aplicação via pnpm db:migrate)
//   2. Arquivo de tipos TypeScript inferidos
//
// Os tipos gerados são a ÚNICA fonte de verdade consumida por frontend e
// backend. Ninguém escreve interfaces de entidades à mão.
//

// ----------------------------------------------------------------------------
// 5.1 — Tipos inferidos automaticamente (exemplo do que Drizzle gera)
// ----------------------------------------------------------------------------

import type { InferSelectModel, InferInsertModel } from "drizzle-orm";

// Select model — representa uma linha lida do banco
export type User = InferSelectModel<typeof users>;
// Resultado:
// {
//   id: string;
//   email: string;
//   passwordHash: string;
//   fullName: string | null;  // ← SEMPRE full_name, nunca `name`
//   isActive: boolean;
//   mustChangePassword: boolean;
//   phone: string | null;
//   lastLoginAt: Date | null;
//   createdAt: Date;
//   updatedAt: Date;
// }

export type Session = InferSelectModel<typeof sessions>;
export type Ticket = InferSelectModel<typeof tickets>;
export type Tenant = InferSelectModel<typeof tenantsTable>;
export type TenantRoute = InferSelectModel<typeof tenantRoutes>;
export type SystemMetric = InferSelectModel<typeof systemMetrics>;

// Insert model — representa dados para inserir (campos opcionais têm defaults)
export type NewUser = InferInsertModel<typeof users>;
// Resultado:
// {
//   id?: string;           // opcional — tem defaultRandom()
//   email: string;         // obrigatório
//   passwordHash: string;  // obrigatório
//   fullName?: string | null;
//   isActive?: boolean;    // opcional — tem default(true)
//   ...
// }

export type NewTicket = InferInsertModel<typeof tickets>;
export type NewTenant = InferInsertModel<typeof tenantsTable>;

// ----------------------------------------------------------------------------
// 5.2 — Tipos com relações (para queries com JOIN)
// ----------------------------------------------------------------------------

import type { InferModelWithRelations } from "drizzle-orm";

export type TicketWithRelations = InferModelWithRelations<
  typeof tickets,
  typeof ticketsRelations
>;
// Resultado:
// {
//   id: string;
//   tenantId: string;
//   ...todos os campos de Ticket...
//   tenant: { id: string; name: string; ... };        // JOIN automático
//   category: { id: string; name: string; ... } | null;
//   assignee: { id: string; fullName: string; ... } | null;  // ← fullName!
//   creator: { id: string; fullName: string; ... } | null;
//   comments: { id: string; body: string; ... }[];
//   workLogs: { id: string; durationSeconds: number; ... }[];
// }

// ============================================================================
// SECTION 6: Repository Pattern (elimina SQL das rotas)
// ============================================================================
//
// Cada entidade tem um Repository que centraliza TODAS as queries SQL.
// As rotas (apps/api/src/routes/*.ts) ficam thin: apenas chamam o repository
// e retornam JSON.
//

// ----------------------------------------------------------------------------
// 6.1 — Base Repository (genérico com tenant context)
// ----------------------------------------------------------------------------

import { eq, and, desc, sql, count } from "drizzle-orm";

export abstract class BaseRepository<
  TTable extends Record<string, any>,
  TSelect = InferSelectModel<TTable>,
  TInsert = InferInsertModel<TTable>,
> {
  constructor(
    protected readonly db: ReturnType<typeof drizzle>,
    protected readonly table: TTable,
    protected readonly tenantId: string,
  ) {}

  async findById(id: string): Promise<TSelect | null> {
    const result = await this.db
      .select()
      .from(this.table)
      .where(and(eq(this.table.id, id), eq(this.table.tenantId, this.tenantId)))
      .limit(1);
    return result[0] ?? null;
  }

  async findAll(limit = 50, offset = 0): Promise<TSelect[]> {
    return this.db
      .select()
      .from(this.table)
      .where(eq(this.table.tenantId, this.tenantId))
      .orderBy(desc(this.table.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async create(data: TInsert): Promise<TSelect> {
    const result = await this.db
      .insert(this.table)
      .values({ ...data, tenantId: this.tenantId })
      .returning();
    return result[0];
  }

  async update(id: string, data: Partial<TInsert>): Promise<TSelect | null> {
    const result = await this.db
      .update(this.table)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(this.table.id, id), eq(this.table.tenantId, this.tenantId)))
      .returning();
    return result[0] ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db
      .delete(this.table)
      .where(and(eq(this.table.id, id), eq(this.table.tenantId, this.tenantId)))
      .returning();
    return result.length > 0;
  }

  async count(): Promise<number> {
    const result = await this.db
      .select({ count: count() })
      .from(this.table)
      .where(eq(this.table.tenantId, this.tenantId));
    return result[0]?.count ?? 0;
  }
}

// ----------------------------------------------------------------------------
// 6.2 — Ticket Repository (exemplo concreto)
// ----------------------------------------------------------------------------

export class TicketRepository extends BaseRepository<typeof tickets> {
  constructor(db: ReturnType<typeof drizzle>, tenantId: string) {
    super(db, tickets, tenantId);
  }

  // Query específica com JOINs — tipada em compile-time
  async findByIdWithRelations(id: string) {
    return this.db.query.tickets.findFirst({
      where: and(eq(tickets.id, id), eq(tickets.tenantId, this.tenantId)),
      with: {
        tenant: true,
        category: true,
        assignee: {
          columns: {
            id: true,
            fullName: true, // ← compile-time garante que esta coluna existe
            email: true,
          },
        },
        creator: {
          columns: {
            id: true,
            fullName: true, // ← se trocarmos para `name`, TypeScript ERRO
            email: true,
          },
        },
        comments: {
          orderBy: desc(ticketComments.createdAt),
        },
        workLogs: true,
      },
    });
  }

  // Query com filtros dinâmicos
  async findByFilters(filters: {
    status?: string;
    priority?: number;
    assignedTo?: string;
    search?: string;
  }) {
    const conditions = [eq(tickets.tenantId, this.tenantId)];

    if (filters.status) {
      conditions.push(eq(tickets.status, filters.status));
    }
    if (filters.priority !== undefined) {
      conditions.push(eq(tickets.priority, filters.priority));
    }
    if (filters.assignedTo) {
      conditions.push(eq(tickets.assignedTo, filters.assignedTo));
    }
    if (filters.search) {
      conditions.push(
        sql`${tickets.subject} ILIKE ${`%${filters.search}%`} OR
            ${tickets.description} ILIKE ${`%${filters.search}%`}`,
      );
    }

    return this.db
      .select({
        id: tickets.id,
        ticketNumber: tickets.ticketNumber,
        subject: tickets.subject,
        status: tickets.status,
        priority: tickets.priority,
        assigneeName: users.fullName, // ← compile-time: `fullName` existe
        categoryName: ticketCategories.name,
        createdAt: tickets.createdAt,
      })
      .from(tickets)
      .leftJoin(users, eq(tickets.assignedTo, users.id))
      .leftJoin(ticketCategories, eq(tickets.categoryId, ticketCategories.id))
      .where(and(...conditions))
      .orderBy(desc(tickets.createdAt))
      .limit(50);
  }

  // Stats agregadas
  async getStats() {
    const result = await this.db
      .select({
        status: tickets.status,
        count: count(),
      })
      .from(tickets)
      .where(eq(tickets.tenantId, this.tenantId))
      .groupBy(tickets.status);
    return result;
  }
}

// ----------------------------------------------------------------------------
// 6.3 — Change Repository (corrige o bug histórico de `u.name`)
// ----------------------------------------------------------------------------

export class ChangeRepository extends BaseRepository<typeof changeRequests> {
  constructor(db: ReturnType<typeof drizzle>, tenantId: string) {
    super(db, changeRequests, tenantId);
  }

  // Esta query NUNCA mais vai ter o bug `u.name does not exist`
  // porque Drizzle valida em compile-time que `users.fullName` existe
  async findWithUsers(id: string) {
    return this.db
      .select({
        id: changeRequests.id,
        rfcNumber: changeRequests.rfcNumber,
        title: changeRequests.title,
        status: changeRequests.status,
        requesterName: users.fullName, // ← compile-time safe
        assigneeName: users.fullName, // ← compile-time safe
        approverName: users.fullName, // ← compile-time safe
        createdAt: changeRequests.createdAt,
      })
      .from(changeRequests)
      .leftJoin(users, eq(changeRequests.requestedBy, users.id))
      .leftJoin(users, eq(changeRequests.assignedTo, users.id))
      .leftJoin(users, eq(changeRequests.approvedBy, users.id))
      .where(
        and(
          eq(changeRequests.id, id),
          eq(changeRequests.tenantId, this.tenantId),
        ),
      )
      .limit(1);
  }
}

// Import necessário para o exemplo acima
import { changeRequests } from "./schema/changes";
import { ticketCategories } from "./schema/tickets";
import { ticketComments } from "./schema/tickets";
import { ticketWorkLogs } from "./schema/tickets";
import { doublePrecision, bigint } from "drizzle-orm/pg-core";

// ============================================================================
// SECTION 7: Route Refactoring Example (Before vs After)
// ============================================================================
//
// BEFORE (apps/api/src/routes/changes.ts — raw SQL, propenso a typos):
//

// ❌ CÓDIGO ANTIGO — raw SQL, sem type safety
/*
app.get("/api/v1/changes/:id", async (c) => {
  const result = await query(`
    SELECT
      cr.*,
      u.name as requester_name,      -- BUG: coluna `name` não existe!
      a.name as assignee_name,        -- BUG: mesma coisa
      ap.name as approver_name        -- BUG: mesma coisa
    FROM change_requests cr
    LEFT JOIN users u ON cr.requested_by = u.id
    LEFT JOIN users a ON cr.assigned_to = a.id
    LEFT JOIN users ap ON cr.approved_by = ap.id
    WHERE cr.id = $1 AND cr.tenant_id = $2
  `, [id, tenantId]);

  if (result.error) return c.json({ error: "Internal error" }, 500);
  return c.json({ data: result.data?.rows[0] });
});
*/

// ✅ CÓDIGO NOVO — usa Repository, type-safe em compile-time
/*
import { ChangeRepository } from "@repo/db/repositories/change.repository";

app.get("/api/v1/changes/:id", async (c) => {
  const { id } = c.req.param();
  const tenantId = c.get("tenantId");

  const repo = new ChangeRepository(db, tenantId);
  const change = await repo.findWithUsers(id);

  if (!change) return c.json({ error: { message: "Change não encontrado" } }, 404);
  return c.json({ data: change });
});
*/

// ============================================================================
// SECTION 8: Drizzle Kit Configuration (drizzle.config.ts)
// ============================================================================

import type { Config } from "drizzle-kit";

const drizzleConfig: Config = {
  schema: "./src/schema/index.ts", // ponto de entrada dos schemas
  out: "./drizzle", // diretório de migrations geradas
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Gerar tipos TypeScript além de SQL
  verbose: true,
  strict: true,
};

export default drizzleConfig;

// ============================================================================
// SECTION 9: Migration & Type Generation Workflow
// ============================================================================
//
// O fluxo completo de desenvolvimento passa a ser:
//
// 1. ALTERAR O SCHEMA NO BANCO PRIMEIRO (ideal_schema.sql)
//    - Criar/alterar tabela em packages/db/src/schema/<domain>.ts
//    - Ou escrever migration SQL manual em migrations/
//
// 2. GERAR MIGRATION
//    pnpm --filter @repo/db drizzle-kit generate
//    → Gera SQL migration em packages/db/drizzle/<timestamp>_<name>.sql
//    → Gera/atualiza packages/db/generated/types.ts (tipos inferidos)
//
// 3. APLICAR MIGRATION
//    pnpm db:migrate
//    → Aplica migration no banco via drizzle-kit migrate
//
// 4. TYPESCRIPT COMPILA? (verificação automática)
//    pnpm check-types
//    → Se uma coluna foi renomeada, TODAS as referências quebram em compile-time
//    → Impossível ter bug de "column does not exist" em produção
//
// 5. RODAR TESTES
//    pnpm test
//    → Repositories têm testes unitários com banco de teste
//
// FLUXO DE REFACTORING INCREMENTAL:
//    Fase 1: Instalar Drizzle, criar schema espelho (não usado em prod)
//    Fase 2: Gerar tipos, substituir interfaces manuais no frontend
//    Fase 3: Criar repositories, migrar rotas uma a uma (começando pelas
//            que mais têm bugs)
//    Fase 4: Remover query() raw do @repo/db (deprecated)
//    Fase 5: Drizzle gerencia migrations (substitui migrations/ manual)
//
// ============================================================================
// SECTION 10: Frontend Type Import (Single Source of Truth)
// ============================================================================
//
// O frontend importa tipos DIRETAMENTE do @repo/db. Nada de interfaces
// duplicadas em apps/web/.
//

// ❌ ANTES — frontend define seus próprios tipos (duplicação)
/*
// apps/web/lib/types.ts
export interface Ticket {
  id: string;
  subject: string;
  status: string;
  assigneeName: string;  // pode divergir do backend
  ...
}
*/

// ✅ DEPOIS — frontend importa do package compartilhado
/*
// apps/web/app/(admin)/tickets/page.tsx
import type { Ticket, TicketWithRelations } from "@repo/db/generated/types";

const { data, error } = useApi<{ data: Ticket[] }>("/api/v1/tickets");
//                   ↑ type-safe: Ticket vem do schema do banco
*/

// ============================================================================
// SECTION 11: Type-Safety Guarantees (Como elimina cada um dos 14 issues)
// ============================================================================
//
// | Issue # | Descrição | Como Drizzle resolve |
// |---------|-----------|---------------------|
// | 7       | No ORM — raw SQL em rotas | Drizzle centraliza SQL em schemas + repositories |
// | 8       | Type duplication (frontend vs backend) | Tipos gerados de @repo/db, importados por ambos |
// | 9       | Inconsistent error handling | Repository retorna `{ data, error }` padronizado |
// | 10      | No repository pattern | BaseRepository + repositories por entidade |
// | 11      | Manual feature flag checks | Middleware tipado: `requireModuleFlag("sla")` |
// | 12      | tenant_template unclear | Drizzle schema para tenant_template separado |
// | 13      | No DB views for common JOINs | Drizzle suporta views via `pgView()` |
// | 14      | Text comparison RLS slower | Schema documenta qual pattern usar por tabela |
// | 15      | IDOR on detail endpoints | BaseRepository sempre filtra por tenantId |
// | 16      | Inconsistent API URL prefix | (frontend issue — não Drizzle) |
// | 17      | No unified error boundary | (frontend issue — não Drizzle) |
// | 18      | No request cancellation | (frontend issue — não Drizzle) |
// | 19      | Record<string, unknown} | Tipos gerados substituem todos `any`/`unknown` |
// | 20      | Sidebar auto-expand | (frontend issue — não Drizzle) |
//
// ISSUES RESOLVIDOS PELO DRIZZLE: 7, 8, 9, 10, 12, 13, 14, 15, 19 (9 de 14)
// ISSUES DE FRONTEND (resolvidos separadamente): 16, 17, 18, 20
// ISSUE 11 (feature flags): resolvido com helper tipado + cache automático
//
// ============================================================================
// SECTION 12: Comparison — Drizzle vs Kysely (Decision Matrix)
// ============================================================================
//
// | Critério | Drizzle ORM | Kysely |
// |----------|-------------|--------|
// | Syntax | Declarativo (schema-first) | Builder fluente (query-first) |
// | Type generation | Automática (InferSelectModel) | Manual ou via kysely-codegen |
// | Migrations | drizzle-kit (generate + migrate) | Externo (kysely-migration-cli) |
// | Relations | Built-in (relations() + with) | Manual JOINs tipados |
// | Bundle size | ~30KB | ~50KB |
// | Learning curve | Baixa (parece SQL) | Média (builder API) |
// | RLS support | Sim (SET LOCAL via raw) | Sim (raw execute) |
// | TimescaleDB | Tabelas normais (raw SQL p/ hypertable) | Mesmo |
// | Comunidade | Maior (12k+ stars) | Menor (8k+ stars) |
// | Edge runtime | Sim (Cloudflare Workers) | Sim |
//
// DECISÃO: Drizzle ORM
// Motivos:
//   1. Schema-first alinha com nosso "banco como fonte de verdade"
//   2. Type generation automática (InferSelectModel) — zero boilerplate
//   3. Relations built-in eliminam JOINs manuais repetitivos
//   4. drizzle-kit unifica migrations + type generation em um comando
//   5. Syntax declarativo é mais legível para novos desenvolvedores
//   6. Suporte a pgView() para nossas views existentes
//
// ============================================================================
// SECTION 13: Phased Rollout Plan
// ============================================================================
//
// FASE 1 (Semana 1-2): Fundação
//   - Instalar drizzle-orm, drizzle-kit no @repo/db
//   - Criar drizzle.config.ts
//   - Definir schemas para as 10 tabelas mais críticas:
//     users, sessions, tenants, tenant_routes, tenant_users,
//     tickets, change_requests, devices, feature_flags, audit_log
//   - Rodar drizzle-kit generate → validar tipos gerados
//   - Nenhuma rota alterada ainda
//
// FASE 2 (Semana 3-4): Tipos Compartilhados
//   - Substituir interfaces manuais no frontend por tipos de @repo/db
//   - apps/web passa a importar de @repo/db/generated/types
//   - pnpm check-types garante que tudo compila
//   - Nenhuma mudança de runtime — apenas tipos
//
// FASE 3 (Semana 5-8): Repositories
//   - Criar BaseRepository + 10 repositories prioritários:
//     TicketRepository, ChangeRepository, UserRepository, TenantRepository,
//     DeviceRepository, ScriptRepository, AssetRepository, SslRepository,
//     BackupRepository, NotificationRepository
//   - Migrar rotas correspondentes uma a uma
//   - Cada rota migrada: deletar SQL raw, usar repository, rodar testes
//
// FASE 4 (Semana 9-12): Expansão
//   - Definir schemas para as 90+ tabelas restantes
//   - Criar repositories para todas as entidades
//   - Migrar todas as rotas restantes
//   - Marcar query() e tenantQuery() como @deprecated
//
// FASE 5 (Semana 13+): Cleanup
//   - Remover query() e tenantQuery() do @repo/db
//   - Drizzle gerencia todas as migrations (substitui migrations/ manual)
//   - Documentação atualizada (ARCHITECTURE.md, SCHEMA.md)
//
// ============================================================================
// FIM DO BLUEPRINT
// ============================================================================
