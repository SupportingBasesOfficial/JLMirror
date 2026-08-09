// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { z } from "zod";

// ========== Auth Schemas ==========
export const loginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  device_fingerprint: z.string().optional(),
  device_label: z.string().optional(),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

export const refreshTokenSchema = z.object({
  refresh_token: z.string().min(1),
});
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;

export const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8),
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(32),
  new_password: z.string().min(8),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const oauthCallbackSchema = z.object({
  code: z.string().min(1),
  provider: z.enum(["google"]),
});
export type OauthCallbackInput = z.infer<typeof oauthCallbackSchema>;

export const ldapBindSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});
export type LdapBindInput = z.infer<typeof ldapBindSchema>;

// ========== MFA Schemas ==========
export const mfaSetupVerifySchema = z.object({
  secret: z.string().min(1),
  code: z.string().min(6).max(6),
});
export type MfaSetupVerifyInput = z.infer<typeof mfaSetupVerifySchema>;

export const mfaVerifySchema = z.object({
  challenge_token: z.string().min(1),
  code: z.string().min(6).max(6),
});
export type MfaVerifyInput = z.infer<typeof mfaVerifySchema>;

// ========== RBAC Schemas ==========
export const createRoleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  permissions: z.array(z.string()).default([]),
  key: z.string().min(1).optional(),
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const createTenantUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  full_name: z.string().optional(),
  role: z.string().min(1),
  scope: z.enum(["global", "tenant"]).default("tenant"),
});
export type CreateTenantUserInput = z.infer<typeof createTenantUserSchema>;

export const createCustomRoleSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(100)
    .regex(
      /^[a-z][a-z0-9_:]*$/,
      "Key deve começar com letra e conter apenas minúsculas, números, _ ou :",
    ),
  description: z.string().max(500).optional(),
  permissions: z.array(z.string().uuid()).default([]),
});
export type CreateCustomRoleInput = z.infer<typeof createCustomRoleSchema>;

export const updateUserRoleSchema = z.object({
  role: z.string().min(1).max(100),
  scope: z.enum(["global", "tenant"]).optional(),
  tenant_id: z.string().uuid().optional(),
});
export type UpdateUserRoleInput = z.infer<typeof updateUserRoleSchema>;

export const updateUserStatusSchema = z.object({
  is_active: z.boolean(),
  tenant_id: z.string().uuid().optional(),
});
export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>;

export const resetUserPasswordSchema = z.object({
  password: z.string().min(8).max(128),
  must_change_password: z.boolean().optional(),
});
export type ResetUserPasswordInput = z.infer<typeof resetUserPasswordSchema>;

export const updateUserDetailsSchema = z.object({
  full_name: z.string().max(255).optional(),
  email: z.string().email().optional(),
});
export type UpdateUserDetailsInput = z.infer<typeof updateUserDetailsSchema>;

export const assignRolePermissionsSchema = z.object({
  role_id: z.string().uuid(),
  permissions: z.array(z.string()),
  permission_ids: z.array(z.string()).default([]),
});
export type AssignRolePermissionsInput = z.infer<
  typeof assignRolePermissionsSchema
>;

// ========== Profile Schemas ==========
export const updateProfileSchema = z.object({
  full_name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  display_name: z.string().optional(),
  bio: z.string().optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
  timezone: z.string().optional(),
  locale: z.string().optional(),
  job_title: z.string().optional(),
  department: z.string().optional(),
  skills: z.array(z.string()).optional(),
  social_links: z.record(z.string()).optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const updatePreferencesSchema = z.object({
  notification_email: z.boolean().optional(),
  notification_push: z.boolean().optional(),
  notification_sms: z.boolean().optional(),
  notification_digest_frequency: z
    .enum(["instant", "hourly", "daily", "weekly"])
    .optional(),
  quiet_hours_start: z.string().optional(),
  quiet_hours_end: z.string().optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
  density: z.enum(["compact", "comfortable"]).optional(),
  sidebar_collapsed: z.boolean().optional(),
  dashboard_layout: z.record(z.unknown()).optional(),
});
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;

export const updateAvatarSchema = z.object({
  avatar_url: z.string().url().optional(),
  avatar_initials: z.string().optional(),
  avatar_color: z.string().optional(),
});
export type UpdateAvatarInput = z.infer<typeof updateAvatarSchema>;

// ========== Settings Schemas ==========
export const updateTenantSettingsSchema = z.object({
  settings: z.record(z.unknown()),
  smtp_password_encrypted: z.string().optional(),
  telegram_bot_token: z.string().optional(),
  ip_whitelist: z.array(z.string()).optional(),
});
export type UpdateTenantSettingsInput = z.infer<
  typeof updateTenantSettingsSchema
>;

export const testSmtpSchema = z.object({
  smtp_host: z.string().min(1),
  smtp_port: z.number().int().min(1).max(65535),
  smtp_user: z.string().optional(),
  smtp_pass: z.string().optional(),
  smtp_from: z.string().email(),
  smtp_to: z.string().email(),
  smtp_use_ssl: z.boolean().optional(),
  smtp_use_tls: z.boolean().optional(),
  smtp_username: z.string().optional(),
  smtp_password_encrypted: z.string().optional(),
  smtp_from_email: z.string().email().optional(),
  test_email: z.string().email().optional(),
});
export type TestSmtpInput = z.infer<typeof testSmtpSchema>;

// ========== Zabbix Schemas ==========
export const zabbixAcknowledgeSchema = z.object({
  eventids: z.array(z.string()).min(1),
  message: z.string().default(""),
  action: z.number().int().default(1),
});

export const zabbixCreateHostSchema = z.object({
  host: z.string().min(1),
  name: z.string().min(1),
  groupids: z.array(z.string()).min(1),
  interfaces: z
    .array(
      z.object({
        type: z.number().int().default(1),
        ip: z.string().min(1),
        dns: z.string().optional(),
        port: z.string().default("10050"),
        main: z.number().int().default(1),
        useip: z.number().int().default(1),
      }),
    )
    .min(1),
  templateids: z.array(z.string()).optional(),
});
export type ZabbixCreateHostInput = z.infer<typeof zabbixCreateHostSchema>;

export const zabbixUpdateHostSchema = z.object({
  host: z.string().optional(),
  name: z.string().optional(),
  groupids: z.array(z.string()).optional(),
  interfaces: z
    .array(
      z.object({
        type: z.number().int(),
        ip: z.string(),
        dns: z.string().optional(),
        port: z.string(),
        main: z.number().int(),
        useip: z.number().int(),
      }),
    )
    .optional(),
  templateids: z.array(z.string()).optional(),
  status: z.number().int().optional(),
});
export type ZabbixUpdateHostInput = z.infer<typeof zabbixUpdateHostSchema>;

export const zabbixCreateItemSchema = z.object({
  hostid: z.string().min(1),
  name: z.string().min(1),
  key_: z.string().min(1),
  type: z.number().int(),
  value_type: z.number().int(),
  units: z.string().optional(),
  history: z.string().default("90d"),
  trends: z.string().default("365d"),
});
export type ZabbixCreateItemInput = z.infer<typeof zabbixCreateItemSchema>;

export const zabbixUpdateItemSchema = z.object({
  name: z.string().optional(),
  key_: z.string().optional(),
  type: z.number().int().optional(),
  value_type: z.number().int().optional(),
  units: z.string().optional(),
  history: z.string().optional(),
  trends: z.string().optional(),
});
export type ZabbixUpdateItemInput = z.infer<typeof zabbixUpdateItemSchema>;

export const zabbixCreateTriggerSchema = z.object({
  description: z.string().min(1),
  expression: z.string().min(1),
  priority: z.number().int().min(0).max(5).default(1),
});
export type ZabbixCreateTriggerInput = z.infer<
  typeof zabbixCreateTriggerSchema
>;

export const zabbixUpdateTriggerSchema = z.object({
  description: z.string().optional(),
  expression: z.string().optional(),
  priority: z.number().int().min(0).max(5).optional(),
  status: z.number().int().optional(),
});
export type ZabbixUpdateTriggerInput = z.infer<
  typeof zabbixUpdateTriggerSchema
>;

export const zabbixCreateHostGroupSchema = z.object({
  name: z.string().min(1),
});
export type ZabbixCreateHostGroupInput = z.infer<
  typeof zabbixCreateHostGroupSchema
>;

export const zabbixUpdateHostGroupSchema = z.object({
  name: z.string().min(1),
});
export type ZabbixUpdateHostGroupInput = z.infer<
  typeof zabbixUpdateHostGroupSchema
>;

export const zabbixCreateMaintenanceSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  maintenance_type: z.number().int().default(0),
  active_since: z.number().int(),
  active_till: z.number().int(),
  hostids: z.array(z.string()).min(1),
  timeperiods: z
    .array(
      z.object({
        timeperiod_type: z.number().int().default(0),
        start_date: z.number().int(),
        period: z.number().int().default(3600),
      }),
    )
    .min(1),
});
export type ZabbixCreateMaintenanceInput = z.infer<
  typeof zabbixCreateMaintenanceSchema
>;

export const zabbixDashboardPrefsSchema = z.object({
  device_type: z.string().default("auto"),
  visible_categories: z.array(z.string()).default([]),
  collapsed_categories: z.array(z.string()).default([]),
  hidden_metrics: z.array(z.string()).default([]),
  pinned_metrics: z.array(z.string()).default([]),
});
export type ZabbixDashboardPrefsInput = z.infer<
  typeof zabbixDashboardPrefsSchema
>;

// ========== Zabbix User Schemas ==========
export const zabbixCreateUserSchema = z.object({
  username: z.string().min(1),
  name: z.string().optional(),
  surname: z.string().optional(),
  roleid: z.string().min(1),
  passwd: z.string().optional(),
  usrgrps: z.array(z.string()).optional(),
});
export type ZabbixCreateUserInput = z.infer<typeof zabbixCreateUserSchema>;

export const zabbixUpdateUserSchema = z.object({
  username: z.string().optional(),
  name: z.string().optional(),
  surname: z.string().optional(),
  roleid: z.string().optional(),
  passwd: z.string().optional(),
  usrgrps: z.array(z.string()).optional(),
});
export type ZabbixUpdateUserInput = z.infer<typeof zabbixUpdateUserSchema>;

export const zabbixCreateUserGroupSchema = z.object({
  name: z.string().min(1),
  permission: z
    .object({
      id: z.string().min(1),
      permission: z.number().int().min(0).max(4),
    })
    .optional(),
});
export type ZabbixCreateUserGroupInput = z.infer<
  typeof zabbixCreateUserGroupSchema
>;

export const zabbixUpdateUserGroupSchema = z.object({
  name: z.string().optional(),
  rights: z
    .array(
      z.object({
        id: z.string().min(1),
        permission: z.number().int().min(0).max(4),
      }),
    )
    .optional(),
});
export type ZabbixUpdateUserGroupInput = z.infer<
  typeof zabbixUpdateUserGroupSchema
>;

// ========== User Host Group Assignment ==========
export const assignUserHostGroupSchema = z.object({
  user_id: z.string().uuid(),
  zabbix_host_group_id: z.string().min(1),
  zabbix_host_group_name: z.string().optional(),
});
export type AssignUserHostGroupInput = z.infer<
  typeof assignUserHostGroupSchema
>;

// ========== Zabbix Script Execute Schema ==========
export const zabbixScriptExecuteSchema = z.object({
  hostid: z.string().min(1),
});
export type ZabbixScriptExecuteInput = z.infer<
  typeof zabbixScriptExecuteSchema
>;

// ========== Zabbix Configuration Export Schema ==========
export const zabbixConfigExportSchema = z.object({
  hosts: z.array(z.string()).optional(),
  templates: z.array(z.string()).optional(),
  format: z.enum(["json", "yaml", "xml"]).default("json"),
});
export type ZabbixConfigExportInput = z.infer<typeof zabbixConfigExportSchema>;

// ========== Zabbix Configuration Import Schema ==========
export const zabbixConfigImportSchema = z.object({
  source: z.string().min(1),
  format: z.enum(["json", "yaml", "xml"]),
});
export type ZabbixConfigImportInput = z.infer<typeof zabbixConfigImportSchema>;

// ========== Monitoring Schemas ==========
export const monitoringHistoryQuerySchema = z.object({
  device_id: z.string().min(1),
  item_id: z.string().min(1),
  from: z.string().or(z.number()),
  to: z.string().or(z.number()),
  value_type: z.number().int().optional(),
});
export type MonitoringHistoryQueryInput = z.infer<
  typeof monitoringHistoryQuerySchema
>;

export const monitoringProblemsQuerySchema = z.object({
  device_id: z.string().optional(),
  acknowledged: z.boolean().optional(),
  recent: z.boolean().optional(),
  severity_min: z.number().int().optional(),
});
export type MonitoringProblemsQueryInput = z.infer<
  typeof monitoringProblemsQuerySchema
>;

export const monitoringEventsQuerySchema = z.object({
  device_id: z.string().optional(),
  from: z.string().or(z.number()).optional(),
  to: z.string().or(z.number()).optional(),
  value: z.number().int().optional(),
});
export type MonitoringEventsQueryInput = z.infer<
  typeof monitoringEventsQuerySchema
>;

export const monitoringGraphQuerySchema = z.object({
  device_id: z.string().min(1),
});
export type MonitoringGraphQueryInput = z.infer<
  typeof monitoringGraphQuerySchema
>;

export const monitoringMetricsQuerySchema = z.object({
  device_id: z.string().min(1),
  key_search: z.string().optional(),
});
export type MonitoringMetricsQueryInput = z.infer<
  typeof monitoringMetricsQuerySchema
>;

// ========== SLA Schemas ==========
export const createServiceSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  service_type: z.string().min(1).max(100),
  status: z
    .enum(["operational", "degraded", "down", "maintenance"])
    .default("operational"),
  device_ids: z.array(z.string()).default([]),
  sla_target_percentage: z.number().min(0).max(100),
  coverage_hours: z.string().default("24x7"),
  coverage_timezone: z.string().default("UTC"),
  coverage_days: z.array(z.string()).default([]),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  zabbix_service_id: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
  is_active: z.boolean().default(true),
});
export type CreateServiceInput = z.infer<typeof createServiceSchema>;

export const updateServiceSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  service_type: z.string().min(1).max(100).optional(),
  status: z.enum(["operational", "degraded", "down", "maintenance"]).optional(),
  device_ids: z.array(z.string()).optional(),
  sla_target_percentage: z.number().min(0).max(100).optional(),
  coverage_hours: z.string().optional(),
  coverage_timezone: z.string().optional(),
  coverage_days: z.array(z.string()).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  zabbix_service_id: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  is_active: z.boolean().optional(),
});
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;

export const createMaintenanceWindowSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  device_ids: z.array(z.string()).default([]),
  start_at: z.string(),
  end_at: z.string(),
  maintenance_type: z
    .enum(["scheduled", "emergency", "corrective"])
    .default("scheduled"),
  metadata: z.record(z.unknown()).default({}),
});
export type CreateMaintenanceWindowInput = z.infer<
  typeof createMaintenanceWindowSchema
>;

export const updateMaintenanceWindowSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  device_ids: z.array(z.string()).optional(),
  start_at: z.string().optional(),
  end_at: z.string().optional(),
  status: z.enum(["scheduled", "active", "completed", "cancelled"]).optional(),
  maintenance_type: z.enum(["scheduled", "emergency", "corrective"]).optional(),
});
export type UpdateMaintenanceWindowInput = z.infer<
  typeof updateMaintenanceWindowSchema
>;

export const createServiceIncidentSchema = z.object({
  service_id: z.string().uuid(),
  title: z.string().min(1).max(255),
  description: z.string().max(5000).optional(),
  severity: z.number().int().min(0).max(5),
  status: z
    .enum(["open", "investigating", "resolved", "closed"])
    .default("open"),
  started_at: z.string().optional(),
  resolved_at: z.string().optional(),
  root_cause: z.string().max(5000).optional(),
  resolution_notes: z.string().max(5000).optional(),
  affected_device_ids: z.array(z.string()).default([]),
  ticket_id: z.string().optional(),
  zabbix_event_id: z.string().optional(),
});
export type CreateServiceIncidentInput = z.infer<
  typeof createServiceIncidentSchema
>;

export const updateServiceIncidentSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).optional(),
  severity: z.number().int().min(0).max(5).optional(),
  status: z.enum(["open", "investigating", "resolved", "closed"]).optional(),
  resolved_at: z.string().optional(),
  root_cause: z.string().max(5000).optional(),
  resolution_notes: z.string().max(5000).optional(),
  affected_device_ids: z.array(z.string()).optional(),
  ticket_id: z.string().optional(),
});
export type UpdateServiceIncidentInput = z.infer<
  typeof updateServiceIncidentSchema
>;

export const slaReportQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  service_id: z.string().uuid().optional(),
});
export type SlaReportQueryInput = z.infer<typeof slaReportQuerySchema>;

// ========== Ticket Schemas ==========
export const createCategorySchema = z.object({
  name: z.string().min(1),
  parent_id: z.string().uuid().optional(),
  description: z.string().optional(),
  color: z.string().optional(),
  sla_response_hours: z.number().optional(),
  sla_resolution_hours: z.number().optional(),
  is_active: z.boolean().default(true),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = z.object({
  name: z.string().optional(),
});
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const createTicketSchema = z.object({
  category_id: z.string().uuid().optional(),
  subject: z.string().min(1),
  description: z.string().min(1),
  priority: z.number().int().min(0).max(4).default(2),
  source: z.string().optional(),
  requester_name: z.string().optional(),
  requester_email: z.string().optional(),
  requester_phone: z.string().optional(),
  assigned_to: z.string().uuid().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export const updateTicketSchema = z.object({
  subject: z.string().optional(),
  description: z.string().optional(),
  priority: z.number().int().min(0).max(4).optional(),
  status: z.string().optional(),
  assignee_id: z.string().uuid().optional(),
  tags: z.array(z.string()).optional(),
  category_id: z.string().uuid().optional(),
});
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;

export const createCommentSchema = z.object({
  ticket_id: z.string().uuid(),
  is_internal: z.boolean().default(false),
  body: z.string().min(1).max(10000),
});
export type CreateCommentInput = z.infer<typeof createCommentSchema>;

// ========== Notification Schemas ==========
export const createChannelSchema = z.object({
  name: z.string().min(1).max(255),
  channel_type: z.enum([
    "slack",
    "email",
    "webhook",
    "teams",
    "telegram",
    "discord",
    "pagerduty",
    "web_push",
  ]),
  config: z.record(z.unknown()).default({}),
  is_active: z.boolean().default(true),
});
export type CreateChannelInput = z.infer<typeof createChannelSchema>;

export const updateChannelSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  channel_type: z
    .enum([
      "slack",
      "email",
      "webhook",
      "teams",
      "telegram",
      "discord",
      "pagerduty",
      "web_push",
    ])
    .optional(),
  config: z.record(z.unknown()).optional(),
  is_active: z.boolean().optional(),
  is_verified: z.boolean().optional(),
});
export type UpdateChannelInput = z.infer<typeof updateChannelSchema>;

export const createRuleSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(5000).optional(),
  event_source: z.enum([
    "ssl.expiring_soon",
    "ssl.expired",
    "ssl.revoked",
    "backup.completed",
    "backup.failed",
    "backup.corrupted",
    "k8s.pod_crash",
    "k8s.node_down",
    "k8s.event_warning",
    "firewall.applied",
    "firewall.failed",
    "script.executed",
    "script.failed",
    "script.approval_needed",
    "monitoring.cpu_high",
    "monitoring.disk_high",
    "monitoring.memory_high",
    "monitoring.service_down",
    "custom",
  ]),
  event_category: z.enum([
    "security",
    "backup",
    "k8s",
    "firewall",
    "script",
    "monitoring",
    "custom",
  ]),
  severity_filter: z
    .enum(["all", "info", "warning", "critical"])
    .default("all"),
  channel_ids: z.array(z.string().uuid()).default([]),
  template_subject: z.string().max(500).optional(),
  template_body: z.string().max(10000).optional(),
  cooldown_minutes: z.number().int().min(0).max(10080).default(60),
  is_active: z.boolean().default(true),
});
export type CreateRuleInput = z.infer<typeof createRuleSchema>;

export const updateRuleSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).optional(),
  event_source: z
    .enum([
      "ssl.expiring_soon",
      "ssl.expired",
      "ssl.revoked",
      "backup.completed",
      "backup.failed",
      "backup.corrupted",
      "k8s.pod_crash",
      "k8s.node_down",
      "k8s.event_warning",
      "firewall.applied",
      "firewall.failed",
      "script.executed",
      "script.failed",
      "script.approval_needed",
      "monitoring.cpu_high",
      "monitoring.disk_high",
      "monitoring.memory_high",
      "monitoring.service_down",
      "custom",
    ])
    .optional(),
  event_category: z
    .enum([
      "security",
      "backup",
      "k8s",
      "firewall",
      "script",
      "monitoring",
      "custom",
    ])
    .optional(),
  severity_filter: z.enum(["all", "info", "warning", "critical"]).optional(),
  channel_ids: z.array(z.string().uuid()).optional(),
  template_subject: z.string().max(500).optional(),
  template_body: z.string().max(10000).optional(),
  cooldown_minutes: z.number().int().min(0).max(10080).optional(),
  is_active: z.boolean().optional(),
});
export type UpdateRuleInput = z.infer<typeof updateRuleSchema>;

export const sendNotificationSchema = z.object({
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(10000),
  event_source: z.enum([
    "ssl.expiring_soon",
    "ssl.expired",
    "ssl.revoked",
    "backup.completed",
    "backup.failed",
    "backup.corrupted",
    "k8s.pod_crash",
    "k8s.node_down",
    "k8s.event_warning",
    "firewall.applied",
    "firewall.failed",
    "script.executed",
    "script.failed",
    "script.approval_needed",
    "monitoring.cpu_high",
    "monitoring.disk_high",
    "monitoring.memory_high",
    "monitoring.service_down",
    "custom",
  ]),
  event_category: z.enum([
    "security",
    "backup",
    "k8s",
    "firewall",
    "script",
    "monitoring",
    "custom",
  ]),
  severity: z.enum(["info", "warning", "critical"]),
  payload: z.record(z.unknown()).default({}),
});
export type SendNotificationInput = z.infer<typeof sendNotificationSchema>;

// ========== Log Schemas ==========
export const logIngestSchema = z.object({
  level: z.enum(["debug", "info", "warn", "error"]),
  message: z.string().min(1),
  source: z.string().min(1),
  meta: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
  span_id: z.string().optional(),
  host: z.string().optional(),
  service: z.string().optional(),
  trace_id: z.string().optional(),
});
export type LogIngestInput = z.infer<typeof logIngestSchema>;

export const logIngestBatchSchema = z.object({
  logs: z.array(logIngestSchema).min(1).max(1000),
});
export type LogIngestBatchInput = z.infer<typeof logIngestBatchSchema>;

export const logSearchSchema = z.object({
  query: z.string().optional(),
  level: z.enum(["debug", "info", "warn", "error"]).optional(),
  source: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.number().int().min(1).max(1000).default(100),
  offset: z.number().int().min(0).default(0),
  service: z.string().optional(),
  message_pattern: z.string().optional(),
  tags: z.array(z.string()).optional(),
  trace_id: z.string().optional(),
});
export type LogSearchInput = z.infer<typeof logSearchSchema>;

// ========== Script Schemas ==========
const hostnameSchema = z
  .string()
  .min(1)
  .max(253)
  .regex(
    /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$/,
    "Hostname deve ser um dominio valido (nao IP)",
  )
  .refine(
    (val) =>
      !/^\d{1,3}(\.\d{1,3}){3}$/.test(val) &&
      !val.includes(":") &&
      val.toLowerCase() !== "localhost",
    "IPs e localhost nao sao permitidos, use um dominio valido",
  );

export const createScriptSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  language: z.enum(["bash", "python", "powershell"]),
  content: z.string().min(1).max(100000, "Script muito grande (max 100KB)"),
  timeout_seconds: z.number().int().min(1).max(3600).default(30),
  requires_approval: z.boolean().default(false),
  max_concurrent_executions: z.number().int().min(1).max(100).default(1),
  allowed_hosts: z.array(hostnameSchema).max(50).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
});
export type CreateScriptInput = z.infer<typeof createScriptSchema>;

export const updateScriptSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  content: z.string().min(1).max(100000).optional(),
  language: z.enum(["bash", "python", "powershell"]).optional(),
  timeout_seconds: z.number().int().min(1).max(3600).optional(),
  requires_approval: z.boolean().optional(),
  max_concurrent_executions: z.number().int().min(1).max(100).optional(),
  allowed_hosts: z.array(hostnameSchema).max(50).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  is_active: z.boolean().optional(),
});
export type UpdateScriptInput = z.infer<typeof updateScriptSchema>;

export const executeScriptSchema = z.object({
  script_id: z.string().uuid(),
  target_device_id: z.string().uuid().optional(),
  args: z.record(z.string().max(500)).optional(),
  target_host: hostnameSchema.optional(),
});
export type ExecuteScriptInput = z.infer<typeof executeScriptSchema>;

// ========== Webhook Schemas ==========
export const createWebhookSchema = z.object({
  name: z.string().min(1).max(200),
  url: z.string().url(),
  events: z.array(z.string().min(1).max(100)).min(1).max(50),
  secret: z.string().max(500).optional(),
  is_active: z.boolean().default(true),
  description: z.string().max(2000).optional(),
  method: z.enum(["GET", "POST", "PUT", "PATCH"]).default("POST"),
  headers: z.record(z.string().max(500)).optional(),
  max_retries: z.number().int().min(0).max(10).default(3),
  retry_delay_seconds: z.number().int().min(1).max(3600).default(60),
  timeout_seconds: z.number().int().min(1).max(300).default(30),
  expected_status_code: z.number().int().min(100).max(599).default(200),
});
export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;

export const updateWebhookSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  url: z.string().url().optional(),
  method: z.enum(["GET", "POST", "PUT", "PATCH"]).optional(),
  secret: z.string().max(500).optional(),
  events: z.array(z.string().min(1).max(100)).max(50).optional(),
  is_active: z.boolean().optional(),
  is_verified: z.boolean().optional(),
  headers: z.record(z.string().max(500)).optional(),
  max_retries: z.number().int().min(0).max(10).optional(),
  retry_delay_seconds: z.number().int().min(1).max(3600).optional(),
  timeout_seconds: z.number().int().min(1).max(300).optional(),
  expected_status_code: z.number().int().min(100).max(599).optional(),
});
export type UpdateWebhookInput = z.infer<typeof updateWebhookSchema>;

export const triggerWebhookSchema = z.object({
  event: z.string().min(1).max(100),
  payload: z.record(z.unknown()),
  event_name: z.string().min(1).max(100).optional(),
  source_type: z.string().max(100).optional(),
  source_id: z.string().max(200).optional(),
});
export type TriggerWebhookInput = z.infer<typeof triggerWebhookSchema>;

// ========== Scheduled Task Schemas ==========
export const createScheduledTaskSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  task_type: z
    .enum([
      "http_request",
      "database_query",
      "cleanup",
      "script",
      "shell_command",
      "report",
      "custom",
    ])
    .default("script"),
  cron_expression: z
    .string()
    .min(1)
    .max(100)
    .regex(
      /^[\d*,\-\/\s]+$/,
      "Expressao cron deve conter apenas digitos, *, -, /, e espacos",
    ),
  config: z.record(z.unknown()).optional(),
  is_active: z.boolean().default(true),
  timezone: z.string().max(50).default("UTC"),
  max_execution_seconds: z.number().int().min(1).max(3600).default(300),
  retry_on_failure: z.boolean().default(false),
  max_retries: z.number().int().min(0).max(10).default(3),
  retry_delay_seconds: z.number().int().min(1).max(86400).default(60),
  notify_on_failure: z.boolean().default(false),
  notify_emails: z.array(z.string().email()).max(20).optional(),
});
export type CreateScheduledTaskInput = z.infer<
  typeof createScheduledTaskSchema
>;

export const updateScheduledTaskSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  task_type: z
    .enum([
      "http_request",
      "database_query",
      "cleanup",
      "script",
      "shell_command",
      "report",
      "custom",
    ])
    .optional(),
  cron_expression: z
    .string()
    .min(1)
    .max(100)
    .regex(
      /^[\d*,\-\/\s]+$/,
      "Expressao cron deve conter apenas digitos, *, -, /, e espacos",
    )
    .optional(),
  config: z.record(z.unknown()).optional(),
  is_active: z.boolean().optional(),
  timezone: z.string().max(50).optional(),
  max_execution_seconds: z.number().int().min(1).max(3600).optional(),
  retry_on_failure: z.boolean().optional(),
  max_retries: z.number().int().min(0).max(10).optional(),
  retry_delay_seconds: z.number().int().min(1).max(86400).optional(),
  notify_on_failure: z.boolean().optional(),
  notify_emails: z.array(z.string().email()).max(20).optional(),
});
export type UpdateScheduledTaskInput = z.infer<
  typeof updateScheduledTaskSchema
>;

// ========== Report Schemas ==========
export const createReportTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  type: z.string().min(1),
  config: z.record(z.unknown()),
  report_type: z.string().optional(),
  data_sources: z.array(z.string()).optional(),
  filters: z.record(z.unknown()).optional(),
  columns: z.array(z.string()).optional(),
  group_by: z.string().optional(),
  chart_type: z.string().optional(),
  format: z.enum(["pdf", "csv", "json"]).default("pdf"),
  is_active: z.boolean().default(true),
});
export type CreateReportTemplateInput = z.infer<
  typeof createReportTemplateSchema
>;

export const createScheduledReportSchema = z.object({
  template_id: z.string().uuid(),
  cron: z.string().min(1),
  recipients: z
    .array(z.string().email())
    .min(1, "Pelo menos um destinatário é obrigatório"),
  format: z.enum(["pdf", "csv", "json"]).default("pdf"),
  name: z.string().optional(),
  description: z.string().optional(),
  schedule_cron: z.string().optional(),
  schedule_description: z.string().optional(),
  delivery_method: z.enum(["email", "webhook", "storage"]).default("email"),
  is_active: z.boolean().default(true),
});
export type CreateScheduledReportInput = z.infer<
  typeof createScheduledReportSchema
>;

export const updateScheduledReportSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(500).optional(),
  cron: z.string().optional(),
  schedule_cron: z.string().optional(),
  schedule_description: z.string().max(200).optional(),
  recipients: z.array(z.string().email()).optional(),
  delivery_method: z.enum(["email", "webhook", "storage"]).optional(),
  format: z.enum(["pdf", "csv", "json"]).optional(),
  is_active: z.boolean().optional(),
});
export type UpdateScheduledReportInput = z.infer<
  typeof updateScheduledReportSchema
>;

export const reportBrandingSchema = z.object({
  company_name: z.string().min(1).max(200),
  logo_url: z.string().url().optional(),
  logo_width: z.number().int().min(1).max(500).optional(),
  primary_color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  secondary_color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  accent_color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  footer_text: z.string().max(500).optional(),
  footer_url: z.string().url().optional(),
  header_bg_color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  header_text_color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  font_family: z.string().max(100).optional(),
  is_active: z.boolean().optional(),
});
export type ReportBrandingInput = z.infer<typeof reportBrandingSchema>;

export const reportDeliveryConfigSchema = z.object({
  auto_reports_enabled: z.boolean().optional(),
  allowed_delivery_methods: z
    .array(z.enum(["email", "webhook", "storage"]))
    .optional(),
  default_delivery_method: z.enum(["email", "webhook", "storage"]).optional(),
  email_from: z.string().email().optional(),
  email_subject_prefix: z.string().max(100).optional(),
  slack_webhook_url: z.string().url().optional(),
  teams_webhook_url: z.string().url().optional(),
  webhook_url: z.string().url().optional(),
  webhook_headers: z.record(z.string()).optional(),
  monthly_report_limit: z.number().int().min(0).max(10000).optional(),
});
export type ReportDeliveryConfigInput = z.infer<
  typeof reportDeliveryConfigSchema
>;

// ========== Feature Flag Schemas ==========
export const createFeatureFlagSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  type: z.enum(["boolean", "percentage", "variant"]),
  default_value: z.union([z.boolean(), z.number(), z.string()]),
  flag_type: z.string().optional(),
  is_active: z.boolean().default(true),
  rollout_percentage: z.number().int().min(0).max(100).optional(),
  variants: z.record(z.unknown()).optional(),
  target_segments: z.array(z.string()).optional(),
  excluded_tenant_ids: z.array(z.string().uuid()).optional(),
  starts_at: z.string().optional(),
  ends_at: z.string().optional(),
});
export type CreateFeatureFlagInput = z.infer<typeof createFeatureFlagSchema>;

export const updateFeatureFlagSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  default_value: z.union([z.boolean(), z.number(), z.string()]).optional(),
  is_active: z.boolean().optional(),
  variants: z.record(z.unknown()).optional(),
  target_segments: z.array(z.string()).optional(),
  excluded_tenant_ids: z.array(z.string().uuid()).optional(),
});
export type UpdateFeatureFlagInput = z.infer<typeof updateFeatureFlagSchema>;

export const evaluateFlagSchema = z.object({
  key: z.string().min(1),
  context: z.record(z.unknown()).optional(),
  user_id: z.string().optional(),
});
export type EvaluateFlagInput = z.infer<typeof evaluateFlagSchema>;

export const createOverrideSchema = z.object({
  flag_id: z.string().uuid(),
  target_type: z.enum(["user", "tenant", "device"]),
  target_id: z.string().min(1),
  value: z.union([z.boolean(), z.number(), z.string()]),
  reason: z.string().optional(),
});
export type CreateOverrideInput = z.infer<typeof createOverrideSchema>;

// ========== Firewall Schemas ==========
// Regex segura: hostname/IP/porta/interface sem metacaracteres shell
const SAFE_HOSTNAME = z
  .string()
  .regex(
    /^[a-zA-Z0-9.\-_]+$/,
    "Host inválido: apenas letras, números, pontos, hífens e underscores",
  );
const SAFE_IP = z
  .string()
  .regex(
    /^[a-zA-Z0-9.\-_/]+$/,
    "IP inválido: apenas letras, números, pontos, hífens, underscores e barras",
  );
const SAFE_PORT = z
  .string()
  .regex(/^[0-9]+(:[0-9]+)?$/, "Porta inválida: apenas números ou intervalo");
const SAFE_INTERFACE = z
  .string()
  .regex(/^[a-zA-Z0-9.+\-_]+$/, "Interface inválida");
const SAFE_BACKEND = z.enum(["iptables", "nftables", "ufw"]);

export const createFirewallRuleSchema = z.object({
  name: z.string().min(1),
  action: z.enum(["allow", "deny", "reject"]),
  protocol: z.enum(["tcp", "udp", "icmp", "any"]),
  source: SAFE_IP.optional(),
  destination: SAFE_IP.optional(),
  port: SAFE_PORT.optional(),
  host: SAFE_HOSTNAME.min(1),
  backend: SAFE_BACKEND,
  chain: z.enum(["INPUT", "OUTPUT", "FORWARD"]).default("INPUT"),
  source_ip: SAFE_IP.optional(),
  source_port: SAFE_PORT.optional(),
  destination_ip: SAFE_IP.optional(),
  destination_port: SAFE_PORT.optional(),
  interface_in: SAFE_INTERFACE.optional(),
  interface_out: SAFE_INTERFACE.optional(),
  state: z
    .string()
    .regex(/^[A-Z_,]+$/)
    .optional(),
  priority: z.number().int().default(100),
  description: z.string().optional(),
});
export type CreateFirewallRuleInput = z.infer<typeof createFirewallRuleSchema>;

export const updateFirewallRuleSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  action: z.enum(["allow", "deny", "reject"]).optional(),
  protocol: z.enum(["tcp", "udp", "icmp", "any"]).optional(),
  source: SAFE_IP.optional(),
  destination: SAFE_IP.optional(),
  port: SAFE_PORT.optional(),
  is_active: z.boolean().optional(),
  is_enabled: z.boolean().optional(),
  host: SAFE_HOSTNAME.optional(),
  backend: SAFE_BACKEND.optional(),
  chain: z.enum(["INPUT", "OUTPUT", "FORWARD"]).optional(),
  source_ip: SAFE_IP.optional(),
  source_port: SAFE_PORT.optional(),
  destination_ip: SAFE_IP.optional(),
  destination_port: SAFE_PORT.optional(),
  interface_in: SAFE_INTERFACE.optional(),
  interface_out: SAFE_INTERFACE.optional(),
  state: z
    .string()
    .regex(/^[A-Z_,]+$/)
    .optional(),
  priority: z.number().int().min(0).max(32767).optional(),
  description: z.string().max(2000).optional(),
});
export type UpdateFirewallRuleInput = z.infer<typeof updateFirewallRuleSchema>;

export const applyFirewallSchema = z.object({
  device_id: z.string().min(1),
  rule_ids: z.array(z.string()).min(1),
  host: SAFE_HOSTNAME.optional(),
  dry_run: z.boolean().default(false),
});
export type ApplyFirewallInput = z.infer<typeof applyFirewallSchema>;

// ========== K8s Schemas ==========
const SAFE_PATH = z
  .string()
  .regex(
    /^[a-zA-Z0-9.\-_/]+$/,
    "Caminho inválido: apenas letras, números, pontos, hífens, underscores e barras",
  );
const SAFE_CONTEXT = z
  .string()
  .regex(/^[a-zA-Z0-9.\-_]+$/, "Contexto inválido");

export const createK8sClusterSchema = z.object({
  name: z.string().min(1),
  api_server: z.string().url(),
  token: z.string().optional(),
  ca_cert: z.string().optional(),
  display_name: z.string().optional(),
  api_server_url: z.string().url().optional(),
  context: SAFE_CONTEXT.optional(),
  namespace: z
    .string()
    .regex(/^[a-zA-Z0-9.\-_]+$/)
    .optional(),
  kubeconfig_path: SAFE_PATH.optional(),
});
export type CreateK8sClusterInput = z.infer<typeof createK8sClusterSchema>;

export const updateK8sClusterSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  display_name: z.string().max(200).optional(),
  api_server_url: z.string().url().optional(),
  context: SAFE_CONTEXT.optional(),
  namespace: z
    .string()
    .regex(/^[a-zA-Z0-9.\-_]+$/)
    .optional(),
  kubeconfig_path: SAFE_PATH.optional(),
  is_active: z.boolean().optional(),
});
export type UpdateK8sClusterInput = z.infer<typeof updateK8sClusterSchema>;

export const k8sResourceTypeSchema = z.enum([
  "pods",
  "services",
  "deployments",
  "nodes",
  "namespaces",
]);
export type K8sResourceType = z.infer<typeof k8sResourceTypeSchema>;

// ========== KB Schemas ==========
export const createKbCategorySchema = z.object({
  name: z.string().min(1),
  parent_id: z.string().uuid().optional(),
  slug: z.string().optional(),
  description: z.string().optional(),
  sort_order: z.number().int().default(0),
  is_active: z.boolean().default(true),
});
export type CreateKbCategoryInput = z.infer<typeof createKbCategorySchema>;

export const updateKbCategorySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  slug: z.string().max(200).optional(),
  parent_id: z.string().uuid().nullable().optional(),
  sort_order: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});
export type UpdateKbCategoryInput = z.infer<typeof updateKbCategorySchema>;

export const createKbArticleSchema = z.object({
  category_id: z.string().uuid().optional(),
  title: z.string().min(1).max(300),
  content: z.string().min(1),
  tags: z.array(z.string().max(50)).max(20).optional(),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
  summary: z.string().max(500).optional(),
  content_format: z.enum(["markdown", "html", "plaintext"]).default("markdown"),
  visibility: z.enum(["public", "internal", "private"]).default("internal"),
  is_pinned: z.boolean().default(false),
});
export type CreateKbArticleInput = z.infer<typeof createKbArticleSchema>;

export const updateKbArticleSchema = z.object({
  category_id: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(300).optional(),
  content: z.string().min(1).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  summary: z.string().max(500).optional(),
  content_format: z.enum(["markdown", "html", "plaintext"]).optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  visibility: z.enum(["public", "internal", "private"]).optional(),
  is_pinned: z.boolean().optional(),
  expires_at: z.string().datetime().nullable().optional(),
});
export type UpdateKbArticleInput = z.infer<typeof updateKbArticleSchema>;

export const kbArticleFeedbackSchema = z.object({
  helpful: z.boolean(),
});
export type KbArticleFeedbackInput = z.infer<typeof kbArticleFeedbackSchema>;

// ========== SSL Schemas ==========
export const createSslCertificateSchema = z.object({
  hostname: z
    .string()
    .min(1)
    .max(253)
    .regex(
      /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$/,
      "Hostname deve ser um domínio válido (não IP)",
    ),
  domain: z.string().min(1).max(253).optional(),
  issuer: z.string().max(200).optional(),
  cert_pem: z.string().optional(),
  key_pem: z.string().optional(),
  port: z.number().int().min(1).max(65535).default(443),
  protocol: z.string().max(50).optional(),
  alert_days_before: z.number().int().min(1).max(365).default(30),
  is_auto_renewed: z.boolean().default(false),
  ca_provider: z.string().max(100).optional(),
});
export type CreateSslCertificateInput = z.infer<
  typeof createSslCertificateSchema
>;

export const updateSslCertificateSchema = z.object({
  hostname: z
    .string()
    .min(1)
    .max(253)
    .regex(
      /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$/,
      "Hostname deve ser um domínio válido (não IP)",
    )
    .optional(),
  port: z.number().int().min(1).max(65535).optional(),
  protocol: z.string().max(50).optional(),
  alert_days_before: z.number().int().min(1).max(365).optional(),
  is_auto_renewed: z.boolean().optional(),
  ca_provider: z.string().max(100).optional(),
  is_active: z.boolean().optional(),
});
export type UpdateSslCertificateInput = z.infer<
  typeof updateSslCertificateSchema
>;

// ========== System Health Schemas ==========
export const createHealthCheckSchema = z.object({
  name: z.string().min(1).max(255),
  service_type: z.enum([
    "database",
    "redis",
    "api",
    "zabbix",
    "smtp",
    "dns",
    "webhook",
    "external_api",
    "filesystem",
    "queue",
    "custom",
  ]),
  endpoint: z.string().url().optional(),
  check_interval_seconds: z.number().int().min(10).max(86400).default(60),
  timeout_seconds: z.number().int().min(1).max(300).default(10),
  expected_status_code: z.number().int().min(100).max(599).optional(),
  is_active: z.boolean().default(true),
  metadata: z.record(z.unknown()).default({}),
});
export type CreateHealthCheckInput = z.infer<typeof createHealthCheckSchema>;

export const updateHealthCheckSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  service_type: z
    .enum([
      "database",
      "redis",
      "api",
      "zabbix",
      "smtp",
      "dns",
      "webhook",
      "external_api",
      "filesystem",
      "queue",
      "custom",
    ])
    .optional(),
  endpoint: z.string().url().optional(),
  check_interval_seconds: z.number().int().min(10).max(86400).optional(),
  timeout_seconds: z.number().int().min(1).max(300).optional(),
  expected_status_code: z.number().int().min(100).max(599).optional(),
  is_active: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type UpdateHealthCheckInput = z.infer<typeof updateHealthCheckSchema>;

export const createIncidentSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  severity: z.enum(["info", "warning", "major", "critical", "maintenance"]),
  health_check_id: z.string().uuid().optional(),
  status: z
    .enum([
      "investigating",
      "identified",
      "monitoring",
      "resolved",
      "scheduled",
    ])
    .default("investigating"),
  affected_services: z.array(z.string()).default([]),
  impact: z
    .enum(["none", "minor", "moderate", "significant", "severe"])
    .optional(),
  is_scheduled: z.boolean().default(false),
  scheduled_start: z.string().optional(),
  scheduled_end: z.string().optional(),
});
export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;

export const updateIncidentSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).optional(),
  severity: z
    .enum(["info", "warning", "major", "critical", "maintenance"])
    .optional(),
  status: z
    .enum([
      "investigating",
      "identified",
      "monitoring",
      "resolved",
      "scheduled",
    ])
    .optional(),
  root_cause: z.string().max(5000).optional(),
  resolution_notes: z.string().max(5000).optional(),
  impact: z
    .enum(["none", "minor", "moderate", "significant", "severe"])
    .optional(),
  affected_services: z.array(z.string()).optional(),
});
export type UpdateIncidentInput = z.infer<typeof updateIncidentSchema>;

export const recordMetricSchema = z.object({
  metric_name: z.string().min(1).max(255),
  metric_type: z.enum([
    "cpu",
    "memory",
    "disk",
    "network",
    "database",
    "redis",
    "api",
    "queue",
    "custom",
  ]),
  value: z.number(),
  unit: z.string().min(1).max(50).default("percent"),
  labels: z.record(z.unknown()).default({}),
  threshold_warning: z.number().optional(),
  threshold_critical: z.number().optional(),
});
export type RecordMetricInput = z.infer<typeof recordMetricSchema>;

// ========== Compliance Schemas ==========
export const createPolicySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  framework: z.string().min(1),
  requirements: z.record(z.unknown()),
  policy_category: z.string().optional(),
  severity: z.string().optional(),
  rule_type: z.string().optional(),
  rule_config: z.record(z.unknown()).optional(),
  check_interval_hours: z.number().int().min(1).default(24),
  is_active: z.boolean().default(true),
});
export type CreatePolicyInput = z.infer<typeof createPolicySchema>;

export const updatePolicySchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  requirements: z.record(z.unknown()).optional(),
  is_active: z.boolean().optional(),
  rule_config: z.record(z.unknown()).optional(),
});
export type UpdatePolicyInput = z.infer<typeof updatePolicySchema>;

// ========== Change Management Schemas ==========
export const createChangeRequestSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(10000).optional(),
  change_type: z.enum(["standard", "normal", "emergency"]),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  risk_level: z.enum(["low", "medium", "high", "critical"]).default("low"),
  planned_start_at: z.string().datetime().optional(),
  planned_end_at: z.string().datetime().optional(),
  affected_systems: z.array(z.string()).default([]),
  affected_services: z.array(z.string()).default([]),
  impact_assessment: z.string().max(10000).optional(),
  rollback_plan: z.string().max(10000).optional(),
  approval_required: z.boolean().default(true),
  related_ticket_id: z.string().uuid().optional(),
});
export type CreateChangeRequestInput = z.infer<
  typeof createChangeRequestSchema
>;

export const updateChangeRequestSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(10000).optional(),
  change_type: z.enum(["standard", "normal", "emergency"]).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  risk_level: z.enum(["low", "medium", "high", "critical"]).optional(),
  status: z
    .enum([
      "draft",
      "submitted",
      "under_review",
      "approved",
      "rejected",
      "scheduled",
      "in_progress",
      "implemented",
      "failed",
      "rolled_back",
      "cancelled",
    ])
    .optional(),
  assigned_to: z.string().uuid().optional(),
  planned_start_at: z.string().datetime().optional(),
  planned_end_at: z.string().datetime().optional(),
  affected_systems: z.array(z.string()).optional(),
  affected_services: z.array(z.string()).optional(),
  impact_assessment: z.string().max(10000).optional(),
  rollback_plan: z.string().max(10000).optional(),
  rollback_status: z
    .enum(["not_needed", "planned", "executed", "failed"])
    .optional(),
  implementation_notes: z.string().max(10000).optional(),
  post_implementation_review: z.string().max(10000).optional(),
});
export type UpdateChangeRequestInput = z.infer<
  typeof updateChangeRequestSchema
>;

export const createChangeTaskSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(10000).optional(),
  task_order: z.number().int().min(0).default(0),
  task_type: z
    .enum(["pre_check", "implementation", "post_check", "rollback"])
    .default("implementation"),
  assigned_to: z.string().uuid().optional(),
});
export type CreateChangeTaskInput = z.infer<typeof createChangeTaskSchema>;

export const approveChangeSchema = z.object({
  comment: z.string().max(5000).optional(),
  approver_role: z.string().max(255).optional(),
});
export type ApproveChangeInput = z.infer<typeof approveChangeSchema>;

// ========== Data Transfer Schemas ==========
export const createExportTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  source_table: z
    .string()
    .min(1)
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, "Nome de tabela inválido"),
  format: z.enum(["csv", "json", "sql"]).default("csv"),
  columns: z
    .array(
      z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, "Nome de coluna inválido"),
    )
    .default([]),
  filters: z.record(z.unknown()).default({}),
  include_headers: z.boolean().default(true),
  delimiter: z.string().default(","),
  encoding: z.string().default("utf-8"),
  is_active: z.boolean().default(true),
});
export type CreateExportTemplateInput = z.infer<
  typeof createExportTemplateSchema
>;

export const updateExportTemplateSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  source_table: z
    .string()
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, "Nome de tabela inválido")
    .optional(),
  format: z.enum(["csv", "json", "sql"]).optional(),
  columns: z
    .array(
      z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, "Nome de coluna inválido"),
    )
    .optional(),
  filters: z.record(z.unknown()).optional(),
  include_headers: z.boolean().optional(),
  delimiter: z.string().optional(),
  encoding: z.string().optional(),
  is_active: z.boolean().optional(),
});
export type UpdateExportTemplateInput = z.infer<
  typeof updateExportTemplateSchema
>;

export const createDataExportSchema = z.object({
  template_id: z.string().uuid().optional(),
  name: z.string().min(1),
  source_table: z
    .string()
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, "Nome de tabela inválido"),
  format: z.enum(["csv", "json", "sql"]).default("csv"),
  columns: z
    .array(
      z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, "Nome de coluna inválido"),
    )
    .default([]),
  filters: z.record(z.unknown()).default({}),
});
export type CreateDataExportInput = z.infer<typeof createDataExportSchema>;

export const createDataImportSchema = z.object({
  format: z.enum(["csv", "json", "xml"]),
  data: z.string().min(1),
  merge: z.boolean().default(false),
  target_table: z
    .string()
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, "Nome de tabela inválido"),
  name: z.string().optional(),
  file_path: z.string().optional(),
  column_mapping: z.record(z.unknown()).optional(),
  options: z.record(z.unknown()).optional(),
});
export type CreateDataImportInput = z.infer<typeof createDataImportSchema>;

export const runImportSchema = z.object({
  data: z.array(z.record(z.unknown())).min(1).max(10000),
});
export type RunImportInput = z.infer<typeof runImportSchema>;

// ========== Execution Schemas ==========
export const approveExecutionSchema = z.object({
  execution_id: z.string().uuid(),
  approved: z.boolean(),
  comment: z.string().optional(),
  decision: z.string().optional(),
});
export type ApproveExecutionInput = z.infer<typeof approveExecutionSchema>;

// ========== Admin Schemas ==========
export const adminCreateUserSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(1),
  password: z.string().min(8),
  tenant_id: z.string().uuid(),
  role: z.string().min(1),
  company_id: z.string().uuid().optional(),
  provisional_password: z.string().optional(),
  phone: z.string().optional(),
  must_change_password: z.boolean().default(true),
});
export type AdminCreateUserInput = z.infer<typeof adminCreateUserSchema>;

export const adminUpdateUserSchema = z.object({
  full_name: z.string().optional(),
  is_active: z.boolean().optional(),
  must_change_password: z.boolean().optional(),
});
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;

// ========== Billing Schemas ==========
export const createBillingSubscriptionSchema = z.object({
  plan: z.enum(["starter", "pro", "enterprise"]).default("starter"),
  billing_cycle: z.enum(["monthly", "quarterly", "yearly"]).default("monthly"),
  payment_method: z.enum(["PIX", "BOLETO", "CREDIT_CARD"]).default("PIX"),
  amount_cents: z.number().int().positive().max(99999999999),
  customer_name: z.string().min(1).max(200),
  customer_email: z.string().email().max(200),
  customer_cpf_cnpj: z
    .string()
    .min(11)
    .max(18)
    .regex(
      /^[\d./-]+$/,
      "CPF/CNPJ deve conter apenas digitos, pontos, hifens e barras",
    ),
  customer_phone: z.string().max(20).optional(),
});
export type CreateBillingSubscriptionInput = z.infer<
  typeof createBillingSubscriptionSchema
>;

export const createBillingPaymentSchema = z.object({
  subscription_id: z.string().uuid().optional(),
  amount_cents: z.number().int().positive().max(99999999999),
  payment_method: z.enum(["PIX", "BOLETO", "CREDIT_CARD"]),
  due_date: z.string().min(1).max(20),
  description: z.string().max(500).optional(),
});
export type CreateBillingPaymentInput = z.infer<
  typeof createBillingPaymentSchema
>;

export const asaasWebhookSchema = z.object({
  event: z.string().max(100).optional(),
  payment: z.object({
    id: z.string().min(1).max(100),
    status: z.string().max(50),
  }),
});
export type AsaasWebhookInput = z.infer<typeof asaasWebhookSchema>;

// ========== API Key Schemas ==========
const ipAddressSchema = z
  .string()
  .regex(
    /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/,
    "IP inválido: use formato IPv4 ou CIDR (ex: 192.168.1.0/24)",
  );

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(200),
  scopes: z.array(z.string().min(1).max(100)).max(50).default([]),
  expires_at: z.string().optional(),
  description: z.string().max(2000).optional(),
  allowed_ips: z.array(ipAddressSchema).max(50).optional(),
  rate_limit_per_min: z.number().int().min(0).max(100000).optional(),
  rate_limit_per_hour: z.number().int().min(0).max(1000000).optional(),
  rate_limit_per_day: z.number().int().min(0).max(10000000).optional(),
});
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;

export const updateApiKeySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  scopes: z.array(z.string().min(1).max(100)).max(50).optional(),
  is_active: z.boolean().optional(),
  allowed_ips: z.array(ipAddressSchema).max(50).optional(),
  rate_limit_per_min: z.number().int().min(0).max(100000).optional(),
  rate_limit_per_hour: z.number().int().min(0).max(1000000).optional(),
  rate_limit_per_day: z.number().int().min(0).max(10000000).optional(),
  expires_at: z.string().optional(),
});
export type UpdateApiKeyInput = z.infer<typeof updateApiKeySchema>;

// ========== Backup Schemas ==========
const SAFE_HOST_PATH = z
  .string()
  .regex(
    /^[a-zA-Z0-9.\-_/]+$/,
    "Caminho/host inválido: apenas letras, números, pontos, hífens, underscores e barras",
  );

export const createBackupJobSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(5000).optional(),
  target_host: SAFE_HOST_PATH.min(1),
  backup_type: z.enum(["full", "incremental", "differential", "snapshot"]),
  source_path: SAFE_HOST_PATH.min(1),
  destination_type: z.enum(["local", "s3", "sftp", "nfs", "azure_blob", "gcs"]),
  destination_path: SAFE_HOST_PATH.min(1),
  retention_count: z.number().int().min(1).max(365).default(7),
  retention_days: z.number().int().min(1).max(3650).default(30),
  compression: z.enum(["none", "gzip", "zstd", "bzip2", "lz4"]).default("gzip"),
  encryption: z.boolean().default(false),
  encryption_key_id: z.string().max(255).optional(),
  is_scheduled: z.boolean().default(false),
  cron_expression: z.string().max(100).optional(),
});
export type CreateBackupJobInput = z.infer<typeof createBackupJobSchema>;

export const updateBackupJobSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).optional(),
  target_host: SAFE_HOST_PATH.optional(),
  backup_type: z
    .enum(["full", "incremental", "differential", "snapshot"])
    .optional(),
  source_path: SAFE_HOST_PATH.optional(),
  destination_type: z
    .enum(["local", "s3", "sftp", "nfs", "azure_blob", "gcs"])
    .optional(),
  destination_path: SAFE_HOST_PATH.optional(),
  retention_count: z.number().int().min(1).max(365).optional(),
  retention_days: z.number().int().min(1).max(3650).optional(),
  compression: z.enum(["none", "gzip", "zstd", "bzip2", "lz4"]).optional(),
  encryption: z.boolean().optional(),
  encryption_key_id: z.string().max(255).optional(),
  is_scheduled: z.boolean().optional(),
  cron_expression: z.string().max(100).optional(),
  is_active: z.boolean().optional(),
});
export type UpdateBackupJobInput = z.infer<typeof updateBackupJobSchema>;

export const createRestoreSchema = z.object({
  snapshot_id: z.string().uuid(),
  target_host: SAFE_HOST_PATH.min(1),
  target_path: SAFE_HOST_PATH.min(1),
  overwrite_existing: z.boolean().default(false),
});
export type CreateRestoreInput = z.infer<typeof createRestoreSchema>;

// ========== Asset Schemas ==========
export const createAssetSchema = z.object({
  name: z.string().min(1).max(255),
  asset_tag: z.string().min(1).max(100),
  asset_type: z.string().min(1).max(100),
  category: z.string().optional(),
  status: z
    .enum(["active", "inactive", "retired", "maintenance"])
    .default("active"),
  criticality: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  ip_address: z.string().optional(),
  hostname: z.string().optional(),
  mac_address: z.string().optional(),
  serial_number: z.string().optional(),
  manufacturer: z.string().optional(),
  model: z.string().optional(),
  os_type: z.string().optional(),
  os_version: z.string().optional(),
  location: z.string().optional(),
  rack: z.string().optional(),
  rack_position: z.string().optional(),
  purchase_date: z.string().optional(),
  purchase_cost: z.number().min(0).optional(),
  warranty_expiry: z.string().optional(),
  vendor: z.string().optional(),
  assigned_to: z.string().optional(),
  department: z.string().optional(),
  notes: z.string().max(5000).optional(),
  tags: z.array(z.string()).optional(),
  custom_fields: z.record(z.unknown()).optional(),
  parent_asset_id: z.string().uuid().optional(),
});
export type CreateAssetInput = z.infer<typeof createAssetSchema>;

export const updateAssetSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  asset_tag: z.string().min(1).max(100).optional(),
  asset_type: z.string().min(1).max(100).optional(),
  category: z.string().optional(),
  status: z.enum(["active", "inactive", "retired", "maintenance"]).optional(),
  criticality: z.enum(["low", "medium", "high", "critical"]).optional(),
  ip_address: z.string().optional(),
  hostname: z.string().optional(),
  mac_address: z.string().optional(),
  serial_number: z.string().optional(),
  manufacturer: z.string().optional(),
  model: z.string().optional(),
  os_type: z.string().optional(),
  os_version: z.string().optional(),
  location: z.string().optional(),
  rack: z.string().optional(),
  rack_position: z.string().optional(),
  purchase_date: z.string().optional(),
  purchase_cost: z.number().min(0).optional(),
  warranty_expiry: z.string().optional(),
  vendor: z.string().optional(),
  assigned_to: z.string().optional(),
  department: z.string().optional(),
  notes: z.string().max(5000).optional(),
  tags: z.array(z.string()).optional(),
  custom_fields: z.record(z.unknown()).optional(),
  parent_asset_id: z.string().uuid().optional(),
});
export type UpdateAssetInput = z.infer<typeof updateAssetSchema>;

// ========== License Schemas ==========
export const createLicenseSchema = z.object({
  license_key: z.string().optional(),
  software_name: z.string().min(1),
  vendor: z.string().optional(),
  license_type: z.enum(["perpetual", "subscription", "oem", "volume"]),
  seats_total: z.number().int().min(1).default(1),
  seats_used: z.number().int().min(0).default(0),
  purchase_date: z.string().optional(),
  expiry_date: z.string().optional(),
  renewal_date: z.string().optional(),
  cost: z.number().optional(),
  is_active: z.boolean().default(true),
  notes: z.string().optional(),
});
export type CreateLicenseInput = z.infer<typeof createLicenseSchema>;

export const updateLicenseSchema = z.object({
  license_key: z.string().optional(),
  software_name: z.string().optional(),
  vendor: z.string().optional(),
  license_type: z
    .enum(["perpetual", "subscription", "oem", "volume"])
    .optional(),
  seats_total: z.number().int().min(1).optional(),
  seats_used: z.number().int().min(0).optional(),
  purchase_date: z.string().optional(),
  expiry_date: z.string().optional(),
  renewal_date: z.string().optional(),
  cost: z.number().optional(),
  is_active: z.boolean().optional(),
  notes: z.string().optional(),
});
export type UpdateLicenseInput = z.infer<typeof updateLicenseSchema>;

// ========== Client Portal Schemas ==========
export const createClientUserSchema = z
  .object({
    email: z.string().email(),
    full_name: z.string().min(1),
    password: z.string().min(8).optional(),
    company_id: z.string().uuid().optional(),
    provisional_password: z.string().min(8).optional(),
    phone: z.string().optional(),
    must_change_password: z.boolean().default(true),
    role: z.string().optional(),
  })
  .refine((data) => data.password || data.provisional_password, {
    message: "password ou provisional_password é obrigatório",
    path: ["password"],
  });
export type CreateClientUserInput = z.infer<typeof createClientUserSchema>;

export const createClientContactSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  company_id: z.string().uuid().optional(),
  role: z.string().optional(),
  department: z.string().optional(),
  is_primary: z.boolean().optional().default(false),
  notes: z.string().optional(),
});
export type CreateClientContactInput = z.infer<
  typeof createClientContactSchema
>;

export const updateClientContactSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  role: z.string().optional(),
  department: z.string().optional(),
  is_primary: z.boolean().optional(),
  is_active: z.boolean().optional(),
  notes: z.string().optional(),
});
export type UpdateClientContactInput = z.infer<
  typeof updateClientContactSchema
>;

export const upsertClientCompanySchema = z.object({
  legal_name: z.string().max(255).optional(),
  cnpj: z.string().max(18).optional(),
  contract_value: z.number().min(0).optional(),
  billing_day: z.number().int().min(1).max(28).optional(),
  billing_cycle: z.enum(["monthly", "quarterly", "yearly"]).optional(),
  plan_tier: z.enum(["basic", "pro", "enterprise", "custom"]).optional(),
  address_street: z.string().max(255).optional(),
  address_city: z.string().max(100).optional(),
  address_state: z.string().max(50).optional(),
  address_zip: z.string().max(20).optional(),
  address_country: z.string().max(50).optional(),
  notes: z.string().max(10000).optional(),
});
export type UpsertClientCompanyInput = z.infer<
  typeof upsertClientCompanySchema
>;

// ========== Report Schemas (additional) ==========
export const createReportSchema = z.object({
  template_id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  type: z.string().min(1).max(100),
  format: z.enum(["pdf", "csv", "json"]).default("pdf"),
  parameters: z.record(z.unknown()).optional(),
  report_type: z
    .enum([
      "capacity_summary",
      "trend_analysis",
      "forecast",
      "utilization_breakdown",
    ])
    .optional(),
  date_range_start: z.string().optional(),
  date_range_end: z.string().optional(),
  is_scheduled: z.boolean().default(false),
  cron_expression: z.string().max(100).optional(),
});
export type CreateReportInput = z.infer<typeof createReportSchema>;

// ========== Threshold Schemas ==========
export const createThresholdSchema = z
  .object({
    resource_type: z.string().min(1).max(100),
    resource_name: z.string().min(1).max(200),
    warning_pct: z.number().min(0).max(100),
    critical_pct: z.number().min(0).max(100),
    is_active: z.boolean().default(true),
  })
  .refine((data) => data.critical_pct > data.warning_pct, {
    message: "critical_pct deve ser maior que warning_pct",
    path: ["critical_pct"],
  });
export type CreateThresholdInput = z.infer<typeof createThresholdSchema>;

export const updateThresholdSchema = z.object({
  warning_pct: z.number().min(0).max(100).optional(),
  critical_pct: z.number().min(0).max(100).optional(),
  is_active: z.boolean().optional(),
});
export type UpdateThresholdInput = z.infer<typeof updateThresholdSchema>;

// ========== Metrics Ingestion Schemas ==========
export const ingestMetricSchema = z.object({
  resource_type: z.string().min(1).max(100),
  resource_id: z.string().max(200).optional(),
  resource_name: z.string().min(1).max(200),
  metric_name: z.string().min(1).max(100),
  metric_value: z.number(),
  metric_unit: z.string().max(50).optional(),
  max_capacity: z.number().min(0).optional(),
  utilization_pct: z.number().min(0).max(100).optional(),
  metadata: z.record(z.unknown()).optional(),
  timestamp: z.string().optional(),
});
export type IngestMetricInput = z.infer<typeof ingestMetricSchema>;

export const ingestMetricsBatchSchema = z
  .array(ingestMetricSchema)
  .min(1)
  .max(1000);
export type IngestMetricsBatchInput = z.infer<typeof ingestMetricsBatchSchema>;

// ========== Push Schemas ==========
export const pushSubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  device_type: z.string().optional(),
  user_agent: z.string().optional(),
});
export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>;

export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().min(1),
});
export type PushUnsubscribeInput = z.infer<typeof pushUnsubscribeSchema>;

export const pushBroadcastSchema = z.object({
  title: z.string().min(1),
  message: z.string().min(1),
});
export type PushBroadcastInput = z.infer<typeof pushBroadcastSchema>;

// ========== Anomaly Schemas ==========
export const anomalyAnalyzeSchema = z.object({
  device_id: z.string().min(1),
  metric_name: z.string().min(1),
  values: z.array(z.number()).min(1),
  observed_value: z.number(),
});
export type AnomalyAnalyzeInput = z.infer<typeof anomalyAnalyzeSchema>;

export const anomalyConfigSchema = z.object({
  metric_name: z.string().min(1),
  algorithm: z.enum(["zscore", "iqr", "ewma"]).optional(),
  window_size: z.number().int().min(2).optional(),
  zscore_threshold: z.number().positive().optional(),
  iqr_multiplier: z.number().positive().optional(),
  ewma_alpha: z.number().min(0).max(1).optional(),
  warning_threshold: z.number().optional(),
  critical_threshold: z.number().optional(),
  is_active: z.boolean().optional(),
});
export type AnomalyConfigInput = z.infer<typeof anomalyConfigSchema>;

// ========== Drift Schemas ==========
export const driftBaselineSchema = z.object({
  device_id: z.string().min(1),
  name: z.string().min(1),
  config_snapshot: z.record(z.unknown()),
});
export type DriftBaselineInput = z.infer<typeof driftBaselineSchema>;

export const driftScanSchema = z.object({
  device_id: z.string().min(1),
  current_config: z.record(z.unknown()),
});
export type DriftScanInput = z.infer<typeof driftScanSchema>;

// ========== Discovery Schemas ==========
export const discoverySessionSchema = z.object({
  name: z.string().min(1),
  ip_ranges: z.array(z.string()).min(1),
  snmp_communities: z.array(z.string()).optional(),
  snmp_ports: z.array(z.number().int()).optional(),
  snmp_timeout_ms: z.number().int().positive().optional(),
  snmp_retries: z.number().int().min(0).optional(),
  use_snmp: z.boolean().optional(),
  use_lldp: z.boolean().optional(),
  use_arp: z.boolean().optional(),
});
export type DiscoverySessionInput = z.infer<typeof discoverySessionSchema>;

// ========== Finops Schemas ==========
export const finopsCostSchema = z.object({
  period_start: z.string().min(1),
  period_end: z.string().min(1),
  category: z.string().min(1),
  resource_name: z.string().optional(),
  resource_type: z.string().optional(),
  cost_amount: z.number(),
  currency: z.string().optional(),
  usage_quantity: z.number().optional(),
  usage_unit: z.string().optional(),
  source: z.string().optional(),
});
export type FinopsCostInput = z.infer<typeof finopsCostSchema>;

export const finopsOptimizationSchema = z.object({
  category: z.string().min(1),
  resource_name: z.string().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  estimated_savings_monthly: z.number(),
  estimated_savings_annual: z.number().optional(),
  currency: z.string().optional(),
  effort: z.enum(["low", "medium", "high"]).optional(),
});
export type FinopsOptimizationInput = z.infer<typeof finopsOptimizationSchema>;

export const finopsOptimizationStatusSchema = z.object({
  status: z.enum([
    "identified",
    "approved",
    "in_progress",
    "implemented",
    "rejected",
  ]),
  actual_savings_monthly: z.number().optional(),
});
export type FinopsOptimizationStatusInput = z.infer<
  typeof finopsOptimizationStatusSchema
>;

export const finopsBudgetSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000),
  category: z.string().optional(),
  budget_amount: z.number(),
  currency: z.string().optional(),
  alert_threshold_pct: z.number().optional(),
});
export type FinopsBudgetInput = z.infer<typeof finopsBudgetSchema>;

// ========== ITSM Schemas ==========
export const itsmConnectorSchema = z.object({
  name: z.string().min(1),
  connector_type: z.enum([
    "jira",
    "freshservice",
    "servicenow",
    "zendesk",
    "custom",
  ]),
  base_url: z.string().min(1),
  auth_type: z.string().min(1),
  api_key: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  bearer_token: z.string().optional(),
  oauth_client_id: z.string().optional(),
  oauth_client_secret: z.string().optional(),
  oauth_token_url: z.string().optional(),
  field_mapping: z.record(z.unknown()).optional(),
  sync_direction: z.string().optional(),
  auto_create_on_incident: z.boolean().optional(),
  auto_update_on_resolve: z.boolean().optional(),
  is_active: z.boolean().optional(),
});
export type ItsmConnectorInput = z.infer<typeof itsmConnectorSchema>;

export const itsmCreateTicketSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  severity: z.enum(["info", "warning", "critical"]).optional(),
  source_id: z.string().optional(),
  source_type: z.string().optional(),
  extra_fields: z.record(z.unknown()).optional(),
});
export type ItsmCreateTicketInput = z.infer<typeof itsmCreateTicketSchema>;

// ========== ChatOps Schemas ==========
export const chatopsConfigSchema = z.object({
  platform: z.enum(["slack", "teams"]),
  slack_verification_token: z.string().optional(),
  slack_signing_secret: z.string().optional(),
  slack_bot_token: z.string().optional(),
  teams_app_id: z.string().optional(),
  teams_app_password: z.string().optional(),
  enabled_commands: z.array(z.string()).optional(),
  is_active: z.boolean().optional(),
});
export type ChatopsConfigInput = z.infer<typeof chatopsConfigSchema>;

// ========== Client Portal Schemas ==========
export const clientPortalUserSchema = z.object({
  email: z.string().email(),
  contact_name: z.string().min(1),
  company_name: z.string().optional(),
  phone: z.string().optional(),
  can_view_incidents: z.boolean().optional(),
  can_view_sla: z.boolean().optional(),
  can_view_services: z.boolean().optional(),
  can_create_tickets: z.boolean().optional(),
});
export type ClientPortalUserInput = z.infer<typeof clientPortalUserSchema>;

// ========== Marketplace Schemas ==========
export const marketplaceInstallSchema = z
  .object({
    config: z.record(z.unknown()).optional(),
  })
  .optional();
export type MarketplaceInstallInput = z.infer<typeof marketplaceInstallSchema>;

export const marketplaceConfigureSchema = z.object({
  config: z.record(z.unknown()).optional(),
});
export type MarketplaceConfigureInput = z.infer<
  typeof marketplaceConfigureSchema
>;

// ========== Predictions Schemas ==========
export const predictionAnalyzeSchema = z.object({
  device_id: z.string().min(1),
  metric_name: z.string().min(1),
  values: z.array(z.number()).min(1),
});
export type PredictionAnalyzeInput = z.infer<typeof predictionAnalyzeSchema>;

export const predictionConfigSchema = z.object({
  metric_name: z.string().min(1),
  model_type: z.enum(["linear", "exponential", "arima", "lstm"]).optional(),
  window_size: z.number().int().min(2).optional(),
  threshold_value: z.number(),
  threshold_direction: z.enum(["above", "below"]).optional(),
  prediction_horizon_hours: z.number().int().positive().optional(),
  warning_probability: z.number().min(0).max(1).optional(),
  critical_probability: z.number().min(0).max(1).optional(),
  is_active: z.boolean().optional(),
});
export type PredictionConfigInput = z.infer<typeof predictionConfigSchema>;

// ========== Status Page Schemas ==========
export const statusPageConfigSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  page_title: z.string().optional(),
  company_name: z.string().min(1),
  logo_url: z.string().optional(),
  primary_color: z.string().optional(),
  show_uptime: z.boolean().optional(),
  show_incident_history: z.boolean().optional(),
  show_sla_percentage: z.boolean().optional(),
  days_of_history: z.number().int().min(1).optional(),
  support_email: z.string().optional(),
  support_url: z.string().optional(),
  is_published: z.boolean().optional(),
});
export type StatusPageConfigInput = z.infer<typeof statusPageConfigSchema>;
