// @ai-context: .zero-error/architecture-map.md#state-store
// Drizzle schema — Authentication & Authorization module
// Mirrors refactor-blueprint/ideal_schema.sql Section 3
// (validated live against TimescaleDB 2.29.1 / PostgreSQL 16.14, 2026-08-11)
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
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// STANDARDIZED: this table uses `full_name`, NEVER `name`. This was the
// root cause of a historical production bug (500 on /api/v1/changes due to
// `u.name does not exist`) documented in current_architecture_audit.md.
// Drizzle's generated types make that specific class of bug impossible —
// referencing `users.name` here would be a TypeScript compile error.
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    fullName: text("full_name"),
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
  (table) => [
    uniqueIndex("users_email_unique").on(table.email),
    index("idx_users_active").on(table.isActive),
  ],
);

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
  (table) => [
    index("idx_sessions_user_id").on(table.userId),
    index("idx_sessions_expires").on(table.expiresAt),
    index("idx_sessions_device_fingerprint").on(table.deviceFingerprint),
  ],
);

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
  (table) => [
    uniqueIndex("trusted_devices_user_fingerprint_unique").on(
      table.userId,
      table.deviceFingerprint,
    ),
    index("idx_trusted_devices_user_id").on(table.userId),
  ],
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    requestedIp: text("requested_ip"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_password_reset_tokens_user_id").on(table.userId),
    index("idx_password_reset_tokens_expires").on(table.expiresAt),
  ],
);

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
  (table) => [uniqueIndex("user_mfa_totp_user_unique").on(table.userId)],
);

export const userWebauthnCredentials = pgTable(
  "user_webauthn_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    credentialId: text("credential_id").notNull().unique(),
    publicKey: jsonb("public_key").notNull(),
    counter: integer("counter").notNull().default(0),
    deviceType: varchar("device_type", { length: 50 }),
    name: varchar("name", { length: 100 }),
    isEnabled: boolean("is_enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (table) => [index("idx_webauthn_user_id").on(table.userId)],
);

export const mfaChallenges = pgTable(
  "mfa_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    method: varchar("method", { length: 20 }).notNull(),
    challengeToken: text("challenge_token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumed: boolean("consumed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_mfa_challenges_token").on(table.challengeToken),
    index("idx_mfa_challenges_expires").on(table.expiresAt),
    check(
      "mfa_challenges_method_check",
      sql`${table.method} IN ('totp', 'webauthn')`,
    ),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  trustedDevices: many(trustedDevices),
  passwordResetTokens: many(passwordResetTokens),
  mfaTotp: many(userMfaTotp),
  webauthnCredentials: many(userWebauthnCredentials),
  mfaChallenges: many(mfaChallenges),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const trustedDevicesRelations = relations(trustedDevices, ({ one }) => ({
  user: one(users, {
    fields: [trustedDevices.userId],
    references: [users.id],
  }),
}));

export const passwordResetTokensRelations = relations(
  passwordResetTokens,
  ({ one }) => ({
    user: one(users, {
      fields: [passwordResetTokens.userId],
      references: [users.id],
    }),
  }),
);

export const userMfaTotpRelations = relations(userMfaTotp, ({ one }) => ({
  user: one(users, { fields: [userMfaTotp.userId], references: [users.id] }),
}));

export const userWebauthnCredentialsRelations = relations(
  userWebauthnCredentials,
  ({ one }) => ({
    user: one(users, {
      fields: [userWebauthnCredentials.userId],
      references: [users.id],
    }),
  }),
);

export const mfaChallengesRelations = relations(mfaChallenges, ({ one }) => ({
  user: one(users, { fields: [mfaChallenges.userId], references: [users.id] }),
}));
