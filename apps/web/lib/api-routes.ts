// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// Centralized API route registry — single source of truth for all backend
// endpoints consumed by the frontend. Eliminates hardcoded URL strings scattered
// across pages/components.
//
// DESIGN PRINCIPLES:
//   1. Every API path lives here as a typed constant.
//   2. Dynamic segments use template functions (e.g. `apiRoutes.zabbix.history`
//      is a function `(params) => string`).
//   3. Types for request/response payloads are co-located with each route,
//      re-exported from @repo/shared-validation (Zod schemas) and @repo/db/types
//      (Drizzle-inferred row types).
//   4. The BFF proxy (apps/web/app/api/[...path]/route.ts) forwards /api/v1/*
//      to the backend, so client-side fetches use relative paths (no host).
//      Server Components use serverApiGetWithToken with the full
//      API_INTERNAL_URL (see lib/api-client.ts).
//
// USAGE (client-side):
//   import { apiRoutes } from "@/lib/api-routes";
//   const { data } = useApi(apiRoutes.profile.get());
//   await fetch(apiRoutes.auth.login, { method: "POST", body: ... });
//
// USAGE (server-side):
//   import { apiRoutes } from "@/lib/api-routes";
//   await serverApiGetWithToken(apiRoutes.dashboard.overview, token);

import type {
  LoginInput,
  MfaVerifyInput,
  ChangePasswordInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  UpdateProfileInput,
  UpdatePreferencesInput,
  UpdateAvatarInput,
  UpdateTenantSettingsInput,
  CreateTenantUserInput,
  UpdateUserRoleInput,
  UpdateUserStatusInput,
  ResetUserPasswordInput,
  UpdateUserDetailsInput,
  ZabbixCreateHostInput,
  ZabbixUpdateHostInput,
  ZabbixCreateTriggerInput,
  ZabbixUpdateTriggerInput,
  ZabbixCreateItemInput,
  ZabbixUpdateItemInput,
  ZabbixCreateHostGroupInput,
  ZabbixUpdateHostGroupInput,
  ZabbixCreateMaintenanceInput,
  ZabbixDashboardPrefsInput,
  ZabbixCreateUserInput,
  ZabbixUpdateUserInput,
  ZabbixCreateUserGroupInput,
  ZabbixUpdateUserGroupInput,
  AssignUserHostGroupInput,
  ZabbixScriptExecuteInput,
  ZabbixConfigExportInput,
  ZabbixConfigImportInput,
  MonitoringHistoryQueryInput,
  MonitoringProblemsQueryInput,
  MonitoringEventsQueryInput,
  MonitoringGraphQueryInput,
  MonitoringMetricsQueryInput,
} from "@repo/shared-validation";

// ============================================================================
// Response types — co-located with routes for type-safe consumption.
// These mirror the backend's JSON response shapes (snake_case, per API contract).
// ============================================================================

/** Login response — returned by POST /api/v1/auth/login (via BFF /api/auth/login). */
export interface LoginResponse {
  user: {
    id: string;
    email: string;
    full_name: string | null;
    must_change_password?: boolean;
  };
  tenants?: Array<{ id: string; name: string; status: string }>;
  scope: "global" | "tenant";
  must_change_password: boolean;
  mfa_required?: boolean;
  challenge_token?: string;
  access_token?: string;
  refresh_token?: string;
}

/** MFA verify response — returned by POST /api/v1/mfa/verify (via BFF /api/auth/mfa-verify). */
export interface MfaVerifyResponse {
  user: { id: string; email: string; full_name: string | null };
  scope: "global" | "tenant";
  must_change_password: boolean;
  access_token?: string;
  refresh_token?: string;
}

/** Auth me response — returned by GET /api/v1/auth/me. */
export interface AuthMeResponse {
  user: {
    id: string;
    email: string;
    full_name: string | null;
    is_active: boolean;
  };
  scope: "global" | "tenant";
  tenant_id: string | null;
  role: string | null;
  permissions: string[];
}

/** Profile response — returned by GET /api/v1/profile. */
export interface ProfileResponse {
  profile: {
    id: string;
    user_id: string;
    display_name: string | null;
    bio: string | null;
    phone: string | null;
    location: string | null;
    timezone: string;
    locale: string;
    avatar_url: string | null;
    avatar_initials: string | null;
    avatar_color: string;
    job_title: string | null;
    department: string | null;
    skills: string[];
    social_links: Record<string, string>;
    notification_email: boolean;
    notification_push: boolean;
    notification_sms: boolean;
    notification_digest_frequency: string;
    quiet_hours_start: string | null;
    quiet_hours_end: string | null;
    theme: string;
    density: string;
    sidebar_collapsed: boolean;
    // Joined from users table
    email: string | null;
    full_name: string | null;
    role: string | null;
  };
}

/** Module flags response — returned by GET /api/v1/settings/modules. */
export interface ModuleFlagsResponse {
  modules: Array<{
    key: string;
    name: string;
    description: string;
    enabled: boolean;
    is_active: boolean;
    client_visible: boolean;
    client_enabled: boolean;
  }>;
}

/** Dashboard overview response — returned by GET /api/v1/dashboard/overview. */
export interface DashboardOverviewResponse {
  kpis: {
    devices: { total: number; online: number };
    tickets: { open: number; critical: number };
    compliance: { total: number; compliant: number; rate: number };
    ssl: { total: number; expiring: number };
    backups: { total: number; successful: number; rate: number };
    firewall: { total: number; active: number };
    changes: { pending: number; in_progress: number };
    assets: { total: number };
    scripts: { total: number };
    notifications: { unread: number };
  };
  recent_activity: Array<{
    action: string;
    entity_type: string;
    created_at: string;
  }>;
  recent_tickets: Array<{
    id: string;
    subject: string;
    status: string;
    priority: string;
    created_at: string;
  }>;
  upcoming_changes: Array<{
    id: string;
    rfc_number: string;
    title: string;
    planned_start_at: string;
    priority: string;
  }>;
  ssl_expiring_soon: Array<{ id: string; hostname: string; valid_to: string }>;
}

// ============================================================================
// API Route Registry
// ============================================================================

export const apiRoutes = {
  // ====== Auth ======
  auth: {
    /** POST /api/auth/login — BFF route (sets httpOnly cookies). */
    login: "/api/auth/login" as const,
    /** POST /api/auth/logout — BFF route (clears cookies). */
    logout: "/api/auth/logout" as const,
    /** POST /api/auth/mfa-verify — BFF route (MFA second factor). */
    mfaVerify: "/api/auth/mfa-verify" as const,
    /** GET /api/v1/auth/me — current user info + scope + permissions. */
    me: "/api/v1/auth/me" as const,
    /** GET /api/v1/auth/sessions — active sessions. */
    sessions: "/api/v1/auth/sessions" as const,
    /** DELETE /api/v1/auth/sessions — revoke all sessions. */
    sessionsRevokeAll: "/api/v1/auth/sessions" as const,
    /** DELETE /api/v1/auth/sessions/:id — revoke single session. */
    sessionRevoke: (id: string) => `/api/v1/auth/sessions/${id}` as const,
    /** GET /api/v1/auth/devices — trusted devices. */
    devices: "/api/v1/auth/devices" as const,
    /** POST /api/v1/auth/refresh — refresh access token. */
    refresh: "/api/v1/auth/refresh" as const,
    /** POST /api/v1/auth/forgot-password — request password reset. */
    forgotPassword: "/api/v1/auth/forgot-password" as const,
    /** POST /api/v1/auth/reset-password — reset password with token. */
    resetPassword: "/api/v1/auth/reset-password" as const,
    /** POST /api/v1/auth/change-password — change password (authenticated). */
    changePassword: "/api/v1/auth/change-password" as const,
    /** GET /api/auth/oauth/google — OAuth login via Google (BFF redirect). */
    oauthGoogle: "/api/auth/oauth/google" as const,
  },

  // ====== MFA ======
  mfa: {
    /** POST /api/v1/mfa/setup — initiate MFA setup (returns QR + secret). */
    setup: "/api/v1/mfa/setup" as const,
    /** POST /api/v1/mfa/setup/verify — verify TOTP code to complete setup. */
    setupVerify: "/api/v1/mfa/setup/verify" as const,
    /** POST /api/v1/mfa/verify — verify MFA challenge during login. */
    verify: "/api/v1/mfa/verify" as const,
    /** POST /api/v1/mfa/disable — disable MFA (requires code). */
    disable: "/api/v1/mfa/disable" as const,
    /** GET /api/v1/mfa/status — current MFA status. */
    status: "/api/v1/mfa/status" as const,
    /** GET /api/v1/mfa/recovery-codes — list recovery codes. */
    recoveryCodes: "/api/v1/mfa/recovery-codes" as const,
    /** POST /api/v1/mfa/recovery-codes/regenerate — regenerate recovery codes. */
    recoveryCodesRegenerate: "/api/v1/mfa/recovery-codes/regenerate" as const,
  },

  // ====== Profile ======
  profile: {
    /** GET /api/v1/profile — current user profile. */
    get: () => "/api/v1/profile" as const,
    /** PUT /api/v1/profile — update profile fields. */
    update: "/api/v1/profile" as const,
    /** PUT /api/v1/profile/avatar — update avatar. */
    avatar: "/api/v1/profile/avatar" as const,
    /** PUT /api/v1/profile/preferences — update preferences. */
    preferences: "/api/v1/profile/preferences" as const,
    /** GET /api/v1/profile/sessions — active sessions. */
    sessions: "/api/v1/profile/sessions" as const,
    /** DELETE /api/v1/profile/sessions/:id — revoke session. */
    sessionRevoke: (id: string) => `/api/v1/profile/sessions/${id}` as const,
    /** GET /api/v1/profile/security/log — security audit log. */
    securityLog: (limit = 20) =>
      `/api/v1/profile/security/log?limit=${limit}` as const,
  },

  // ====== Dashboard ======
  dashboard: {
    /** GET /api/v1/dashboard/overview — KPIs + recent activity. */
    overview: "/api/v1/dashboard/overview" as const,
    /** POST /api/v1/dashboard/sync-devices — trigger device sync. */
    syncDevices: "/api/v1/dashboard/sync-devices" as const,
    /** GET /api/v1/dashboard/executive/overview — executive KPIs. */
    executiveOverview: "/api/v1/dashboard/executive/overview" as const,
    /** GET /api/v1/dashboard/executive/alerts — executive alerts. */
    executiveAlerts: "/api/v1/dashboard/executive/alerts" as const,
    /** GET /api/v1/dashboard/executive/summary — executive summary. */
    executiveSummary: "/api/v1/dashboard/executive/summary" as const,
  },

  // ====== Zabbix ======
  zabbix: {
    /** GET /api/v1/zabbix/devices — list devices (hosts). */
    devices: "/api/v1/zabbix/devices" as const,
    /** GET /api/v1/zabbix/triggers — list triggers. */
    triggers: "/api/v1/zabbix/triggers" as const,
    /** GET /api/v1/zabbix/problems — active problems. */
    problems: "/api/v1/zabbix/problems" as const,
    /** GET /api/v1/zabbix/events — event log. */
    events: "/api/v1/zabbix/events" as const,
    /** GET /api/v1/zabbix/history?item_id=&from=&to= — time series. */
    history: (params: {
      item_id: string;
      from?: number;
      to?: number;
      value_type?: number;
    }) => {
      const qs = new URLSearchParams();
      qs.set("item_id", params.item_id);
      if (params.from) qs.set("from", String(params.from));
      if (params.to) qs.set("to", String(params.to));
      if (params.value_type !== undefined)
        qs.set("value_type", String(params.value_type));
      return `/api/v1/zabbix/history?${qs.toString()}` as const;
    },
    /** GET /api/v1/zabbix/history-batch?item_ids=1,2,3&from=&to= — batch series. */
    historyBatch: (params: {
      item_ids: string[];
      from?: number;
      to?: number;
      value_type?: number;
    }) => {
      const qs = new URLSearchParams();
      qs.set("item_ids", params.item_ids.join(","));
      if (params.from) qs.set("from", String(params.from));
      if (params.to) qs.set("to", String(params.to));
      if (params.value_type !== undefined)
        qs.set("value_type", String(params.value_type));
      return `/api/v1/zabbix/history-batch?${qs.toString()}` as const;
    },
    /** GET /api/v1/zabbix/trends?item_ids=&from=&to= — consolidated trends. */
    trends: (params: {
      item_ids: string[];
      from?: number;
      to?: number;
      value_type?: number;
    }) => {
      const qs = new URLSearchParams();
      qs.set("item_ids", params.item_ids.join(","));
      if (params.from) qs.set("from", String(params.from));
      if (params.to) qs.set("to", String(params.to));
      if (params.value_type !== undefined)
        qs.set("value_type", String(params.value_type));
      return `/api/v1/zabbix/trends?${qs.toString()}` as const;
    },
    /** GET /api/v1/zabbix/graphs?host_id= — list graphs. */
    graphs: (hostId?: string) =>
      hostId
        ? (`/api/v1/zabbix/graphs?host_id=${hostId}` as const)
        : ("/api/v1/zabbix/graphs" as const),
    /** GET /api/v1/zabbix/graphs/:graphid/data?from=&to= — graph series. */
    graphData: (graphId: string, from?: number, to?: number) => {
      const qs = new URLSearchParams();
      if (from) qs.set("from", String(from));
      if (to) qs.set("to", String(to));
      const q = qs.toString();
      return q
        ? (`/api/v1/zabbix/graphs/${graphId}/data?${q}` as const)
        : (`/api/v1/zabbix/graphs/${graphId}/data` as const);
    },
    /** POST /api/v1/zabbix/acknowledge — acknowledge problem. */
    acknowledge: "/api/v1/zabbix/acknowledge" as const,
    /** GET /api/v1/zabbix/services — service tree. */
    services: "/api/v1/zabbix/services" as const,
    /** GET /api/v1/zabbix/host-groups — host groups. */
    hostGroups: "/api/v1/zabbix/host-groups" as const,
    /** GET /api/v1/zabbix/templates — templates. */
    templates: "/api/v1/zabbix/templates" as const,
    /** GET /api/v1/zabbix/users — Zabbix users. */
    users: "/api/v1/zabbix/users" as const,
    /** GET /api/v1/zabbix/proxies — proxies. */
    proxies: "/api/v1/zabbix/proxies" as const,
    /** GET /api/v1/zabbix/actions — actions. */
    actions: "/api/v1/zabbix/actions" as const,
    /** GET /api/v1/zabbix/discovery — discovery rules. */
    discovery: "/api/v1/zabbix/discovery" as const,
    /** GET /api/v1/zabbix/audit-log — audit log. */
    auditLog: "/api/v1/zabbix/audit-log" as const,
    /** GET /api/v1/zabbix/connectors — connectors. */
    connectors: "/api/v1/zabbix/connectors" as const,
    /** GET /api/v1/zabbix/ping — health check. */
    ping: "/api/v1/zabbix/ping" as const,
  },

  // ====== Settings / Modules ======
  settings: {
    /** GET /api/v1/settings/modules — module feature flags. */
    modules: "/api/v1/settings/modules" as const,
    /** PUT /api/v1/settings/modules/:key — toggle module (admin). */
    toggleModule: (key: string) => `/api/v1/settings/modules/${key}` as const,
    /** GET /api/v1/settings — tenant settings (white-label, SMTP, etc). */
    get: "/api/v1/settings" as const,
    /** PUT /api/v1/settings — update tenant settings. */
    update: "/api/v1/settings" as const,
  },

  // ====== Admin / Users ======
  users: {
    /** GET /api/v1/users/all — all users (admin). */
    all: "/api/v1/users/all" as const,
    /** GET /api/v1/users/roles — available roles. */
    roles: "/api/v1/users/roles" as const,
    /** POST /api/v1/users — create user. */
    create: "/api/v1/users" as const,
    /** PATCH /api/v1/users/:id/role — update user role. */
    updateRole: (id: string) => `/api/v1/users/${id}/role` as const,
    /** PATCH /api/v1/users/:id/status — activate/deactivate user. */
    updateStatus: (id: string) => `/api/v1/users/${id}/status` as const,
    /** POST /api/v1/users/:id/reset-password — reset password. */
    resetPassword: (id: string) =>
      `/api/v1/users/${id}/reset-password` as const,
    /** PATCH /api/v1/users/:id — update user details. */
    updateDetails: (id: string) => `/api/v1/users/${id}` as const,
  },

  // ====== System Health ======
  systemHealth: {
    /** GET /api/v1/system-health/stats — health KPIs. */
    stats: "/api/v1/system-health/stats" as const,
    /** GET /api/v1/system-health/score — health score. */
    score: "/api/v1/system-health/score" as const,
  },

  // ====== Tickets ======
  tickets: {
    /** GET /api/v1/tickets — list tickets. */
    list: "/api/v1/tickets" as const,
    /** POST /api/v1/tickets — create ticket. */
    create: "/api/v1/tickets" as const,
    /** GET /api/v1/tickets/categories — ticket categories. */
    categories: "/api/v1/tickets/categories" as const,
    /** GET /api/v1/tickets/stats — ticket stats. */
    stats: "/api/v1/tickets/stats" as const,
  },

  // ====== Tasks ======
  tasks: {
    /** GET /api/v1/tasks — scheduled tasks. */
    list: "/api/v1/tasks" as const,
    /** POST /api/v1/tasks — create task. */
    create: "/api/v1/tasks" as const,
    /** GET /api/v1/tasks/stats — task stats. */
    stats: "/api/v1/tasks/stats" as const,
  },

  // ====== Errors (frontend error reporting) ======
  errors: {
    /** POST /api/v1/errors/report — submit client-side error. */
    report: "/api/v1/errors/report" as const,
    /** GET /api/v1/errors/reports — list error reports (admin). */
    reports: (limit?: number) =>
      limit
        ? (`/api/v1/errors/reports?limit=${limit}` as const)
        : ("/api/v1/errors/reports" as const),
  },

  // ====== Branding (BFF routes) ======
  branding: {
    /** GET /api/branding — default branding. */
    get: "/api/branding" as const,
    /** GET /api/branding/:slug — tenant branding by slug. */
    bySlug: (slug: string) => `/api/branding/${slug}` as const,
  },

  // ====== WebSocket token (BFF) ======
  ws: {
    /** GET /api/ws-token — get WebSocket auth token. */
    token: "/api/ws-token" as const,
  },
} as const;

// ============================================================================
// Type-safe request payload types — re-exported for convenience.
// These are the Zod-inferred types from @repo/shared-validation, ensuring
// that any POST/PUT body matches the exact schema the backend validates against.
// ============================================================================

export type {
  LoginInput,
  MfaVerifyInput,
  ChangePasswordInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  UpdateProfileInput,
  UpdatePreferencesInput,
  UpdateAvatarInput,
  UpdateTenantSettingsInput,
  CreateTenantUserInput,
  UpdateUserRoleInput,
  UpdateUserStatusInput,
  ResetUserPasswordInput,
  UpdateUserDetailsInput,
  ZabbixCreateHostInput,
  ZabbixUpdateHostInput,
  ZabbixCreateTriggerInput,
  ZabbixUpdateTriggerInput,
  ZabbixCreateItemInput,
  ZabbixUpdateItemInput,
  ZabbixCreateHostGroupInput,
  ZabbixUpdateHostGroupInput,
  ZabbixCreateMaintenanceInput,
  ZabbixDashboardPrefsInput,
  ZabbixCreateUserInput,
  ZabbixUpdateUserInput,
  ZabbixCreateUserGroupInput,
  ZabbixUpdateUserGroupInput,
  AssignUserHostGroupInput,
  ZabbixScriptExecuteInput,
  ZabbixConfigExportInput,
  ZabbixConfigImportInput,
  MonitoringHistoryQueryInput,
  MonitoringProblemsQueryInput,
  MonitoringEventsQueryInput,
  MonitoringGraphQueryInput,
  MonitoringMetricsQueryInput,
};
