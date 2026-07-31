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
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const assignRolePermissionsSchema = z.object({
  role_id: z.string().uuid(),
  permissions: z.array(z.string()),
});
export type AssignRolePermissionsInput = z.infer<typeof assignRolePermissionsSchema>;

// ========== Profile Schemas ==========
export const updateProfileSchema = z.object({
  full_name: z.string().min(1).optional(),
  email: z.string().email().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const updatePreferencesSchema = z.object({
  preferences: z.record(z.unknown()),
});
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;

export const updateAvatarSchema = z.object({
  avatar_url: z.string().url(),
});
export type UpdateAvatarInput = z.infer<typeof updateAvatarSchema>;

// ========== Settings Schemas ==========
export const updateTenantSettingsSchema = z.object({
  settings: z.record(z.unknown()),
});
export type UpdateTenantSettingsInput = z.infer<typeof updateTenantSettingsSchema>;

export const testSmtpSchema = z.object({
  smtp_host: z.string().min(1),
  smtp_port: z.number().int().min(1).max(65535),
  smtp_user: z.string().optional(),
  smtp_pass: z.string().optional(),
  smtp_from: z.string().email(),
  smtp_to: z.string().email(),
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
  interfaces: z.array(z.object({
    type: z.number().int().default(1),
    ip: z.string().min(1),
    dns: z.string().optional(),
    port: z.string().default("10050"),
    main: z.number().int().default(1),
    useip: z.number().int().default(1),
  })).min(1),
  templateids: z.array(z.string()).optional(),
});
export type ZabbixCreateHostInput = z.infer<typeof zabbixCreateHostSchema>;

export const zabbixUpdateHostSchema = z.object({
  host: z.string().optional(),
  name: z.string().optional(),
  groupids: z.array(z.string()).optional(),
  interfaces: z.array(z.object({
    type: z.number().int(),
    ip: z.string(),
    dns: z.string().optional(),
    port: z.string(),
    main: z.number().int(),
    useip: z.number().int(),
  })).optional(),
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
export type ZabbixCreateTriggerInput = z.infer<typeof zabbixCreateTriggerSchema>;

export const zabbixUpdateTriggerSchema = z.object({
  description: z.string().optional(),
  expression: z.string().optional(),
  priority: z.number().int().min(0).max(5).optional(),
  status: z.number().int().optional(),
});
export type ZabbixUpdateTriggerInput = z.infer<typeof zabbixUpdateTriggerSchema>;

export const zabbixCreateHostGroupSchema = z.object({
  name: z.string().min(1),
});
export type ZabbixCreateHostGroupInput = z.infer<typeof zabbixCreateHostGroupSchema>;

export const zabbixUpdateHostGroupSchema = z.object({
  name: z.string().min(1),
});
export type ZabbixUpdateHostGroupInput = z.infer<typeof zabbixUpdateHostGroupSchema>;

export const zabbixCreateMaintenanceSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  maintenance_type: z.number().int().default(0),
  active_since: z.number().int(),
  active_till: z.number().int(),
  hostids: z.array(z.string()).min(1),
  timeperiods: z.array(z.object({
    timeperiod_type: z.number().int().default(0),
    start_date: z.number().int(),
    period: z.number().int().default(3600),
  })).min(1),
});
export type ZabbixCreateMaintenanceInput = z.infer<typeof zabbixCreateMaintenanceSchema>;

export const zabbixDashboardPrefsSchema = z.object({
  device_type: z.string().default("auto"),
  visible_categories: z.array(z.string()).default([]),
  collapsed_categories: z.array(z.string()).default([]),
  hidden_metrics: z.array(z.string()).default([]),
  pinned_metrics: z.array(z.string()).default([]),
});
export type ZabbixDashboardPrefsInput = z.infer<typeof zabbixDashboardPrefsSchema>;

// ========== Monitoring Schemas ==========
export const monitoringHistoryQuerySchema = z.object({
  device_id: z.string().min(1),
  item_id: z.string().min(1),
  from: z.string().or(z.number()),
  to: z.string().or(z.number()),
  value_type: z.number().int().optional(),
});
export type MonitoringHistoryQueryInput = z.infer<typeof monitoringHistoryQuerySchema>;

export const monitoringProblemsQuerySchema = z.object({
  device_id: z.string().optional(),
  acknowledged: z.boolean().optional(),
  recent: z.boolean().optional(),
  severity_min: z.number().int().optional(),
});
export type MonitoringProblemsQueryInput = z.infer<typeof monitoringProblemsQuerySchema>;

export const monitoringEventsQuerySchema = z.object({
  device_id: z.string().optional(),
  from: z.string().or(z.number()).optional(),
  to: z.string().or(z.number()).optional(),
  value: z.number().int().optional(),
});
export type MonitoringEventsQueryInput = z.infer<typeof monitoringEventsQuerySchema>;

export const monitoringGraphQuerySchema = z.object({
  device_id: z.string().min(1),
});
export type MonitoringGraphQueryInput = z.infer<typeof monitoringGraphQuerySchema>;

export const monitoringMetricsQuerySchema = z.object({
  device_id: z.string().min(1),
  key_search: z.string().optional(),
});
export type MonitoringMetricsQueryInput = z.infer<typeof monitoringMetricsQuerySchema>;

// ========== SLA Schemas ==========
export const createServiceSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  sla_target: z.number().min(0).max(100),
  zabbix_service_id: z.string().optional(),
});
export type CreateServiceInput = z.infer<typeof createServiceSchema>;

export const updateServiceSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  sla_target: z.number().min(0).max(100).optional(),
  zabbix_service_id: z.string().optional(),
  is_active: z.boolean().optional(),
});
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;

export const createMaintenanceWindowSchema = z.object({
  service_id: z.string().uuid(),
  start_time: z.string(),
  end_time: z.string(),
  reason: z.string().min(1),
});
export type CreateMaintenanceWindowInput = z.infer<typeof createMaintenanceWindowSchema>;

export const updateMaintenanceWindowSchema = z.object({
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  reason: z.string().optional(),
});
export type UpdateMaintenanceWindowInput = z.infer<typeof updateMaintenanceWindowSchema>;

export const createServiceIncidentSchema = z.object({
  service_id: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  severity: z.number().int().min(0).max(5),
});
export type CreateServiceIncidentInput = z.infer<typeof createServiceIncidentSchema>;

export const updateServiceIncidentSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  severity: z.number().int().min(0).max(5).optional(),
  status: z.string().optional(),
  resolved_at: z.string().optional(),
});
export type UpdateServiceIncidentInput = z.infer<typeof updateServiceIncidentSchema>;

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
});
export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export const updateTicketSchema = z.object({
  subject: z.string().optional(),
  description: z.string().optional(),
  priority: z.number().int().min(0).max(4).optional(),
  status: z.string().optional(),
  assignee_id: z.string().uuid().optional(),
});
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;

export const createCommentSchema = z.object({
  ticket_id: z.string().uuid(),
  content: z.string().min(1),
  is_internal: z.boolean().default(false),
});
export type CreateCommentInput = z.infer<typeof createCommentSchema>;

// ========== Notification Schemas ==========
export const createChannelSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["email", "slack", "teams", "webhook", "telegram"]),
  config: z.record(z.unknown()),
});
export type CreateChannelInput = z.infer<typeof createChannelSchema>;

export const updateChannelSchema = z.object({
  name: z.string().optional(),
  config: z.record(z.unknown()).optional(),
  is_active: z.boolean().optional(),
});
export type UpdateChannelInput = z.infer<typeof updateChannelSchema>;

export const createRuleSchema = z.object({
  name: z.string().min(1),
  channel_id: z.string().uuid(),
  conditions: z.record(z.unknown()),
  is_active: z.boolean().default(true),
});
export type CreateRuleInput = z.infer<typeof createRuleSchema>;

export const updateRuleSchema = z.object({
  name: z.string().optional(),
  conditions: z.record(z.unknown()).optional(),
  is_active: z.boolean().optional(),
});
export type UpdateRuleInput = z.infer<typeof updateRuleSchema>;

export const sendNotificationSchema = z.object({
  channel_id: z.string().uuid().optional(),
  to: z.string().optional(),
  subject: z.string().min(1),
  body: z.string().min(1),
});
export type SendNotificationInput = z.infer<typeof sendNotificationSchema>;

// ========== Log Schemas ==========
export const logIngestSchema = z.object({
  level: z.enum(["debug", "info", "warn", "error"]),
  message: z.string().min(1),
  source: z.string().min(1),
  meta: z.record(z.unknown()).optional(),
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
});
export type LogSearchInput = z.infer<typeof logSearchSchema>;

// ========== Script Schemas ==========
export const createScriptSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  language: z.enum(["bash", "python", "powershell"]),
  content: z.string().min(1),
  timeout: z.number().int().min(1).max(3600).default(30),
});
export type CreateScriptInput = z.infer<typeof createScriptSchema>;

export const updateScriptSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  content: z.string().optional(),
  timeout: z.number().int().min(1).max(3600).optional(),
});
export type UpdateScriptInput = z.infer<typeof updateScriptSchema>;

export const executeScriptSchema = z.object({
  script_id: z.string().uuid(),
  target_device_id: z.string().optional(),
  args: z.record(z.string()).optional(),
});
export type ExecuteScriptInput = z.infer<typeof executeScriptSchema>;

// ========== Webhook Schemas ==========
export const createWebhookSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  events: z.array(z.string()).min(1),
  secret: z.string().optional(),
  is_active: z.boolean().default(true),
});
export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;

export const updateWebhookSchema = z.object({
  name: z.string().optional(),
  url: z.string().url().optional(),
  events: z.array(z.string()).optional(),
  is_active: z.boolean().optional(),
});
export type UpdateWebhookInput = z.infer<typeof updateWebhookSchema>;

export const triggerWebhookSchema = z.object({
  event: z.string().min(1),
  payload: z.record(z.unknown()),
});
export type TriggerWebhookInput = z.infer<typeof triggerWebhookSchema>;

// ========== Scheduled Task Schemas ==========
export const createScheduledTaskSchema = z.object({
  name: z.string().min(1),
  cron: z.string().min(1),
  script_id: z.string().uuid().optional(),
  command: z.string().optional(),
  is_active: z.boolean().default(true),
});
export type CreateScheduledTaskInput = z.infer<typeof createScheduledTaskSchema>;

export const updateScheduledTaskSchema = z.object({
  name: z.string().optional(),
  cron: z.string().optional(),
  is_active: z.boolean().optional(),
});
export type UpdateScheduledTaskInput = z.infer<typeof updateScheduledTaskSchema>;

// ========== Report Schemas ==========
export const createReportTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  type: z.string().min(1),
  config: z.record(z.unknown()),
});
export type CreateReportTemplateInput = z.infer<typeof createReportTemplateSchema>;

export const createScheduledReportSchema = z.object({
  template_id: z.string().uuid(),
  cron: z.string().min(1),
  recipients: z.array(z.string().email()),
  format: z.enum(["pdf", "csv", "json"]).default("pdf"),
});
export type CreateScheduledReportInput = z.infer<typeof createScheduledReportSchema>;

export const updateScheduledReportSchema = z.object({
  cron: z.string().optional(),
  recipients: z.array(z.string().email()).optional(),
  format: z.enum(["pdf", "csv", "json"]).optional(),
  is_active: z.boolean().optional(),
});
export type UpdateScheduledReportInput = z.infer<typeof updateScheduledReportSchema>;

// ========== Feature Flag Schemas ==========
export const createFeatureFlagSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  type: z.enum(["boolean", "percentage", "variant"]),
  default_value: z.union([z.boolean(), z.number(), z.string()]),
});
export type CreateFeatureFlagInput = z.infer<typeof createFeatureFlagSchema>;

export const updateFeatureFlagSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  default_value: z.union([z.boolean(), z.number(), z.string()]).optional(),
  is_active: z.boolean().optional(),
});
export type UpdateFeatureFlagInput = z.infer<typeof updateFeatureFlagSchema>;

export const evaluateFlagSchema = z.object({
  key: z.string().min(1),
  context: z.record(z.unknown()).optional(),
});
export type EvaluateFlagInput = z.infer<typeof evaluateFlagSchema>;

export const createOverrideSchema = z.object({
  flag_id: z.string().uuid(),
  target_type: z.enum(["user", "tenant", "device"]),
  target_id: z.string().min(1),
  value: z.union([z.boolean(), z.number(), z.string()]),
});
export type CreateOverrideInput = z.infer<typeof createOverrideSchema>;

// ========== Firewall Schemas ==========
export const createFirewallRuleSchema = z.object({
  name: z.string().min(1),
  action: z.enum(["allow", "deny", "reject"]),
  protocol: z.enum(["tcp", "udp", "icmp", "any"]),
  source: z.string().optional(),
  destination: z.string().optional(),
  port: z.string().optional(),
});
export type CreateFirewallRuleInput = z.infer<typeof createFirewallRuleSchema>;

export const updateFirewallRuleSchema = z.object({
  name: z.string().optional(),
  action: z.enum(["allow", "deny", "reject"]).optional(),
  protocol: z.enum(["tcp", "udp", "icmp", "any"]).optional(),
  source: z.string().optional(),
  destination: z.string().optional(),
  port: z.string().optional(),
  is_active: z.boolean().optional(),
});
export type UpdateFirewallRuleInput = z.infer<typeof updateFirewallRuleSchema>;

export const applyFirewallSchema = z.object({
  device_id: z.string().min(1),
  rule_ids: z.array(z.string()).min(1),
});
export type ApplyFirewallInput = z.infer<typeof applyFirewallSchema>;

// ========== K8s Schemas ==========
export const createK8sClusterSchema = z.object({
  name: z.string().min(1),
  api_server: z.string().url(),
  token: z.string().optional(),
  ca_cert: z.string().optional(),
});
export type CreateK8sClusterInput = z.infer<typeof createK8sClusterSchema>;

export const updateK8sClusterSchema = z.object({
  name: z.string().optional(),
  api_server: z.string().url().optional(),
  token: z.string().optional(),
  ca_cert: z.string().optional(),
});
export type UpdateK8sClusterInput = z.infer<typeof updateK8sClusterSchema>;

export const k8sResourceTypeSchema = z.enum(["pods", "services", "deployments", "nodes", "namespaces"]);
export type K8sResourceType = z.infer<typeof k8sResourceTypeSchema>;

// ========== KB Schemas ==========
export const createKbCategorySchema = z.object({
  name: z.string().min(1),
  parent_id: z.string().uuid().optional(),
});
export type CreateKbCategoryInput = z.infer<typeof createKbCategorySchema>;

export const updateKbCategorySchema = z.object({
  name: z.string().optional(),
});
export type UpdateKbCategoryInput = z.infer<typeof updateKbCategorySchema>;

export const createKbArticleSchema = z.object({
  category_id: z.string().uuid().optional(),
  title: z.string().min(1),
  content: z.string().min(1),
  tags: z.array(z.string()).optional(),
});
export type CreateKbArticleInput = z.infer<typeof createKbArticleSchema>;

export const updateKbArticleSchema = z.object({
  title: z.string().optional(),
  content: z.string().optional(),
  tags: z.array(z.string()).optional(),
  is_published: z.boolean().optional(),
});
export type UpdateKbArticleInput = z.infer<typeof updateKbArticleSchema>;

// ========== SSL Schemas ==========
export const createSslCertificateSchema = z.object({
  domain: z.string().min(1),
  issuer: z.string().optional(),
  cert_pem: z.string().optional(),
  key_pem: z.string().optional(),
});
export type CreateSslCertificateInput = z.infer<typeof createSslCertificateSchema>;

export const updateSslCertificateSchema = z.object({
  issuer: z.string().optional(),
  cert_pem: z.string().optional(),
  key_pem: z.string().optional(),
  is_active: z.boolean().optional(),
});
export type UpdateSslCertificateInput = z.infer<typeof updateSslCertificateSchema>;

// ========== System Health Schemas ==========
export const createHealthCheckSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  target: z.string().min(1),
  interval: z.number().int().min(10).default(60),
});
export type CreateHealthCheckInput = z.infer<typeof createHealthCheckSchema>;

export const updateHealthCheckSchema = z.object({
  name: z.string().optional(),
  interval: z.number().int().min(10).optional(),
  is_active: z.boolean().optional(),
});
export type UpdateHealthCheckInput = z.infer<typeof updateHealthCheckSchema>;

export const createIncidentSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  severity: z.number().int().min(0).max(5),
  health_check_id: z.string().uuid().optional(),
});
export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;

export const updateIncidentSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  severity: z.number().int().min(0).max(5).optional(),
  status: z.string().optional(),
  resolved_at: z.string().optional(),
});
export type UpdateIncidentInput = z.infer<typeof updateIncidentSchema>;

export const recordMetricSchema = z.object({
  health_check_id: z.string().uuid(),
  value: z.number(),
  unit: z.string().optional(),
});
export type RecordMetricInput = z.infer<typeof recordMetricSchema>;

// ========== Compliance Schemas ==========
export const createPolicySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  framework: z.string().min(1),
  requirements: z.record(z.unknown()),
});
export type CreatePolicyInput = z.infer<typeof createPolicySchema>;

export const updatePolicySchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  requirements: z.record(z.unknown()).optional(),
  is_active: z.boolean().optional(),
});
export type UpdatePolicyInput = z.infer<typeof updatePolicySchema>;

// ========== Change Management Schemas ==========
export const createChangeRequestSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  priority: z.number().int().min(0).max(4).default(2),
  impact: z.string().min(1),
  rollback_plan: z.string().optional(),
});
export type CreateChangeRequestInput = z.infer<typeof createChangeRequestSchema>;

export const updateChangeRequestSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  priority: z.number().int().min(0).max(4).optional(),
  status: z.string().optional(),
});
export type UpdateChangeRequestInput = z.infer<typeof updateChangeRequestSchema>;

export const createChangeTaskSchema = z.object({
  change_request_id: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  assignee_id: z.string().uuid().optional(),
});
export type CreateChangeTaskInput = z.infer<typeof createChangeTaskSchema>;

export const approveChangeSchema = z.object({
  change_request_id: z.string().uuid(),
  approved: z.boolean(),
  comment: z.string().optional(),
});
export type ApproveChangeInput = z.infer<typeof approveChangeSchema>;

// ========== Data Transfer Schemas ==========
export const createExportTemplateSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  config: z.record(z.unknown()),
});
export type CreateExportTemplateInput = z.infer<typeof createExportTemplateSchema>;

export const updateExportTemplateSchema = z.object({
  name: z.string().optional(),
  config: z.record(z.unknown()).optional(),
});
export type UpdateExportTemplateInput = z.infer<typeof updateExportTemplateSchema>;

export const createDataExportSchema = z.object({
  template_id: z.string().uuid().optional(),
  format: z.enum(["csv", "json", "xml"]),
  tables: z.array(z.string()).min(1),
});
export type CreateDataExportInput = z.infer<typeof createDataExportSchema>;

export const createDataImportSchema = z.object({
  format: z.enum(["csv", "json", "xml"]),
  data: z.string().min(1),
  merge: z.boolean().default(false),
});
export type CreateDataImportInput = z.infer<typeof createDataImportSchema>;

// ========== Execution Schemas ==========
export const approveExecutionSchema = z.object({
  execution_id: z.string().uuid(),
  approved: z.boolean(),
  comment: z.string().optional(),
});
export type ApproveExecutionInput = z.infer<typeof approveExecutionSchema>;

// ========== Admin Schemas ==========
export const adminCreateUserSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(1),
  password: z.string().min(8),
  tenant_id: z.string().uuid(),
  role: z.string().min(1),
});
export type AdminCreateUserInput = z.infer<typeof adminCreateUserSchema>;

export const adminUpdateUserSchema = z.object({
  full_name: z.string().optional(),
  is_active: z.boolean().optional(),
  must_change_password: z.boolean().optional(),
});
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;

// ========== API Key Schemas ==========
export const createApiKeySchema = z.object({
  name: z.string().min(1),
  scopes: z.array(z.string()).default([]),
  expires_at: z.string().optional(),
});
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;

export const updateApiKeySchema = z.object({
  name: z.string().optional(),
  scopes: z.array(z.string()).optional(),
  is_active: z.boolean().optional(),
});
export type UpdateApiKeyInput = z.infer<typeof updateApiKeySchema>;

// ========== Backup Schemas ==========
export const createBackupJobSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  target_host: z.string().min(1),
  backup_type: z.enum(["full", "incremental", "differential"]),
  source_path: z.string().min(1),
  destination_type: z.enum(["local", "s3", "sftp", "nfs"]),
  destination_path: z.string().min(1),
  retention_count: z.number().int().min(1).default(7),
  retention_days: z.number().int().min(1).default(30),
  compression: z.boolean().default(true),
  encryption: z.boolean().default(false),
  encryption_key_id: z.string().optional(),
  is_scheduled: z.boolean().default(false),
  cron_expression: z.string().optional(),
});
export type CreateBackupJobInput = z.infer<typeof createBackupJobSchema>;

export const updateBackupJobSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  target_host: z.string().optional(),
  backup_type: z.enum(["full", "incremental", "differential"]).optional(),
  source_path: z.string().optional(),
  destination_type: z.enum(["local", "s3", "sftp", "nfs"]).optional(),
  destination_path: z.string().optional(),
  retention_count: z.number().int().min(1).optional(),
  retention_days: z.number().int().min(1).optional(),
  compression: z.boolean().optional(),
  encryption: z.boolean().optional(),
  is_scheduled: z.boolean().optional(),
  cron_expression: z.string().optional(),
  is_active: z.boolean().optional(),
});
export type UpdateBackupJobInput = z.infer<typeof updateBackupJobSchema>;

export const createRestoreSchema = z.object({
  job_id: z.string().uuid(),
  snapshot_id: z.string().optional(),
  restore_path: z.string().optional(),
});
export type CreateRestoreInput = z.infer<typeof createRestoreSchema>;

// ========== Asset Schemas ==========
export const createAssetSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  ip_address: z.string().optional(),
  hostname: z.string().optional(),
  location: z.string().optional(),
  owner: z.string().optional(),
  criticality: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  metadata: z.record(z.unknown()).optional(),
});
export type CreateAssetInput = z.infer<typeof createAssetSchema>;

export const updateAssetSchema = z.object({
  name: z.string().optional(),
  type: z.string().optional(),
  ip_address: z.string().optional(),
  hostname: z.string().optional(),
  location: z.string().optional(),
  owner: z.string().optional(),
  criticality: z.enum(["low", "medium", "high", "critical"]).optional(),
  metadata: z.record(z.unknown()).optional(),
  is_active: z.boolean().optional(),
});
export type UpdateAssetInput = z.infer<typeof updateAssetSchema>;

// ========== License Schemas ==========
export const createLicenseSchema = z.object({
  asset_id: z.string().uuid().optional(),
  name: z.string().min(1),
  vendor: z.string().optional(),
  license_key: z.string().optional(),
  type: z.enum(["perpetual", "subscription", "oem", "volume"]),
  seats: z.number().int().min(1).optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  cost: z.number().optional(),
  currency: z.string().default("BRL"),
});
export type CreateLicenseInput = z.infer<typeof createLicenseSchema>;

export const updateLicenseSchema = z.object({
  name: z.string().optional(),
  vendor: z.string().optional(),
  license_key: z.string().optional(),
  seats: z.number().int().min(1).optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  cost: z.number().optional(),
  currency: z.string().optional(),
  is_active: z.boolean().optional(),
});
export type UpdateLicenseInput = z.infer<typeof updateLicenseSchema>;

// ========== Client Portal Schemas ==========
export const createClientUserSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(1),
  password: z.string().min(8),
  company_id: z.string().uuid().optional(),
});
export type CreateClientUserInput = z.infer<typeof createClientUserSchema>;

export const createClientContactSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  company_id: z.string().uuid().optional(),
  role: z.string().optional(),
});
export type CreateClientContactInput = z.infer<typeof createClientContactSchema>;

export const updateClientContactSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  role: z.string().optional(),
});
export type UpdateClientContactInput = z.infer<typeof updateClientContactSchema>;

export const upsertClientCompanySchema = z.object({
  name: z.string().min(1),
  cnpj: z.string().optional(),
  industry: z.string().optional(),
  website: z.string().url().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
});
export type UpsertClientCompanyInput = z.infer<typeof upsertClientCompanySchema>;

// ========== Report Schemas (additional) ==========
export const createReportSchema = z.object({
  template_id: z.string().uuid().optional(),
  name: z.string().min(1),
  type: z.string().min(1),
  format: z.enum(["pdf", "csv", "json"]).default("pdf"),
  parameters: z.record(z.unknown()).optional(),
});
export type CreateReportInput = z.infer<typeof createReportSchema>;

// ========== Threshold Schemas ==========
export const createThresholdSchema = z.object({
  metric: z.string().min(1),
  warning: z.number(),
  critical: z.number(),
  operator: z.enum(["gt", "lt", "gte", "lte", "eq"]).default("gt"),
  device_id: z.string().optional(),
});
export type CreateThresholdInput = z.infer<typeof createThresholdSchema>;

export const updateThresholdSchema = z.object({
  warning: z.number().optional(),
  critical: z.number().optional(),
  operator: z.enum(["gt", "lt", "gte", "lte", "eq"]).optional(),
  is_active: z.boolean().optional(),
});
export type UpdateThresholdInput = z.infer<typeof updateThresholdSchema>;

// ========== Metrics Ingestion Schemas ==========
export const ingestMetricSchema = z.object({
  metric: z.string().min(1),
  value: z.number(),
  unit: z.string().optional(),
  tags: z.record(z.string()).optional(),
  timestamp: z.string().optional(),
});
export type IngestMetricInput = z.infer<typeof ingestMetricSchema>;

export const ingestMetricsBatchSchema = z.object({
  metrics: z.array(ingestMetricSchema).min(1).max(10000),
});
export type IngestMetricsBatchInput = z.infer<typeof ingestMetricsBatchSchema>;
