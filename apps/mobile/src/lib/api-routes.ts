// @ai-context: .zero-error/architecture-map.md#ingress
// Centralized API route registry — port de apps/web/lib/api-routes.ts.
// No mobile nao ha BFF proxy — todas as URLs usam EXPO_PUBLIC_API_URL como base.
//
// Tipos de resposta sao co-located aqui, tipos de request vem de
// @repo/shared-validation (Zod schemas inferidos).
import type {
  LoginInput,
  MfaVerifyInput,
  ChangePasswordInput,
  ForgotPasswordInput,
  ResetPasswordInput,
} from "@repo/shared-validation";

const API_BASE =
  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

// ============================================================================
// Response types — espelham o backend (snake_case, per API contract)
// ============================================================================

export interface AuthUser {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  must_change_password: boolean;
}

export interface TenantMembership {
  tenant_id: string;
  role: string;
  scope: "global" | "tenant";
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  user: AuthUser;
  tenants: TenantMembership[];
  mfa_required?: boolean;
  mfa_challenge_token?: string;
}

export interface AuthMeResponse {
  user: AuthUser;
  scope: "global" | "tenant";
  tenants: TenantMembership[];
}

export interface RefreshResponse {
  access_token: string;
  refresh_token: string;
}

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
  recent_activity: {
    action: string;
    entity_type: string;
    created_at: string;
  }[];
  recent_tickets: {
    id: string;
    subject: string;
    status: string;
    priority: string;
    created_at: string;
  }[];
  upcoming_changes: {
    id: string;
    rfc_number: string;
    title: string;
    planned_start_at: string;
    priority: string;
  }[];

  ssl_expiring_soon: Array<{ id: string; hostname: string; valid_to: string }>;
  [key: string]: unknown;
}

// --- Devices ---
export interface Device {
  id: string;
  tenant_id: string;
  hostname: string;
  ip: string;
  type: string;
  status: string;
  zabbix_host_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DevicesListResponse {
  devices: Device[];
}

// --- Tickets ---
export interface Ticket {
  id: string;
  tenant_id: string;
  ticket_number: string;
  subject: string;
  description: string | null;
  status: string;
  priority: string;
  source: string | null;
  category_id: string | null;
  category_name?: string;
  category_color?: string;
  requester_name: string | null;
  requester_email: string | null;
  requester_phone: string | null;
  assigned_to: string | null;
  assigned_name?: string | null;
  tags: string[];
  sla_response_due: string | null;
  sla_resolution_due: string | null;
  is_overdue: boolean;
  response_time_mins: number | null;
  resolution_time_mins: number | null;
  rating: number | null;
  created_at: string;
  updated_at: string;
}

export interface TicketComment {
  id: string;
  tenant_id: string;
  ticket_id: string;
  author_id: string | null;
  author_name: string;
  author_type: string;
  body: string;
  is_internal: boolean;
  created_at: string;
}

export interface TicketStats {
  total: string;
  by_status: { status: string; count: string }[];
  by_priority: { priority: string; count: string }[];
  sla: {
    overdue: string;
    open_tickets: string;
    avg_response_mins: string | null;
    avg_resolution_mins: string | null;
    avg_rating: string | null;
  };
  by_category: {
    name: string;
    color: string;
    ticket_count: string;
    open_count: string;
  }[];
}

export interface TicketCategory {
  id: string;
  name: string;
  description: string | null;
  color: string;
  sla_response_hours: number;
  sla_resolution_hours: number;
  is_active: boolean;
}

export interface TicketDetailResponse {
  ticket: Ticket;
  comments: TicketComment[];
}

// --- Profile ---
export interface ProfileData {
  id: string;
  email: string;
  full_name: string | null;
  display_name: string | null;
  bio: string | null;
  phone: string | null;
  location: string | null;
  timezone: string | null;
  locale: string | null;
  job_title: string | null;
  department: string | null;
  skills: string[] | null;
  social_links: Record<string, string> | null;
  avatar_initials: string | null;
  avatar_color: string | null;
  notification_email: boolean | null;
  notification_push: boolean | null;
  notification_sms: boolean | null;
  notification_digest_frequency: string | null;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  theme: string | null;
  density: string | null;
  sidebar_collapsed: boolean | null;
  role: string;
  tenant_name: string | null;
}

export interface ProfileResponse {
  profile: ProfileData;
}

export interface UserSession {
  id: string;
  device_type: string;
  device_name: string | null;
  ip_address: string | null;
  location: string | null;
  is_active: boolean;
  last_activity: string;
  expires_at: string | null;
  created_at: string;
}

export interface SecurityEvent {
  id: string;
  event_type: string;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

// --- Anomaly Detections (Alerts) ---
export interface AnomalyDetection {
  id: string;
  tenant_id: string;
  device_id: string;
  device_hostname?: string;
  metric: string;
  severity: string;
  status: string;
  detected_at: string;
  value: number | string;
  expected: number | string | null;
  description: string | null;
}

export interface AnomalyDetectionsResponse {
  detections: AnomalyDetection[];
}

// --- Zabbix (fonte primaria de triggers/alertas) ---
export interface ZabbixHostInterface {
  ip: string;
  type: string;
  port: string;
  dns: string;
}

export interface ZabbixHostGroup {
  groupid: string;
  name: string;
}

export interface ZabbixHost {
  hostid: string;
  host: string;
  name: string;
  status: string;
  available?: number;
  parentTemplates?: Array<{ templateid: string; host: string; name: string }>;
  hostgroups?: ZabbixHostGroup[];
  inventory?: Record<string, string> | [];
  interfaces?: ZabbixHostInterface[];
}

export interface ZabbixDevicesListResponse {
  devices: ZabbixHost[];
}

export interface ZabbixItem {
  itemid: string;
  hostid: string;
  name: string;
  key_: string;
  value_type: number;
  lastvalue?: string;
  lastclock?: string;
  units?: string;
  state?: number;
  status?: number;
}

export interface ZabbixProblemTag {
  tag: string;
  value: string;
}

export interface ZabbixEvent {
  eventid: string;
  objectid: string;
  clock: number;
  ns: number;
  value: number;
  source: number;
  object: number;
  acknowledged: number;
  name?: string;
  severity?: number;
  suppressed?: boolean;
  hosts?: ZabbixHost[];
}

export interface ZabbixTrigger {
  triggerid: string;
  description: string;
  expression: string;
  priority: string; // "0"-"5"
  value: string; // "0" = OK, "1" = PROBLEM
  state: string;
  status: string;
  url?: string;
  comments?: string;
  error?: string;
  templateid?: string;
  hosts?: ZabbixHost[];
  items?: ZabbixItem[];
  lastchange: string;
  lastEvent?: ZabbixEvent;
  tags?: ZabbixProblemTag[];
  suppressed?: boolean;
}

export interface ZabbixTriggersResponse {
  data: ZabbixTrigger[];
}

export interface ZabbixHostResponse {
  host: ZabbixHost;
}

export interface ZabbixItemsResponse {
  items: ZabbixItem[];
}

// SINCED CONTRACT: Alinhamento de tipo nominal com o validador do monorepo @repo/shared-validation
export interface ZabbixHistoryEntry {
  itemid: string;
  clock: number;
  ns: number;
  value: string;
}

export interface ZabbixHistoryResponse {
  data: ZabbixHistoryEntry[];
}

// ============================================================================
// Route registry — typed constants for all endpoints
// ============================================================================

export const apiRoutes = {
  auth: {
    login: `${API_BASE}/auth/login`,
    refresh: `${API_BASE}/auth/refresh`,
    logout: `${API_BASE}/auth/logout`,
    me: `${API_BASE}/auth/me`,
    changePassword: `${API_BASE}/auth/change-password`,
    forgotPassword: `${API_BASE}/auth/forgot-password`,
    resetPassword: `${API_BASE}/auth/reset-password`,
    sessions: `${API_BASE}/auth/sessions`,
  },
  mfa: {
    verify: `${API_BASE}/mfa/verify`,
    setup: `${API_BASE}/mfa/setup`,
    disable: `${API_BASE}/mfa/disable`,
  },
  dashboard: {
    overview: `${API_BASE}/dashboard/overview`,
  },
  devices: {
    list: `${API_BASE}/devices`,
    detail: (id: string) => `${API_BASE}/devices/${id}`,
  },

  anomaly: {
    overview: `${API_BASE}/anomaly`,
    detections: `${API_BASE}/anomaly/detections`,
  },
  zabbix: {
    devices: `${API_BASE}/zabbix/devices`,
    deviceDetail: (hostId: string) => `${API_BASE}/zabbix/devices/${hostId}`,
    deviceItems: (hostId: string) =>
      `${API_BASE}/zabbix/devices/${hostId}/items`,
    triggers: (hostId?: string) =>
      hostId
        ? `${API_BASE}/zabbix/triggers?host_id=${hostId}`
        : `${API_BASE}/zabbix/triggers`,
    problems: `${API_BASE}/zabbix/problems`,
    events: `${API_BASE}/zabbix/events`,
    history: (
      itemId: string,
      from?: number,
      to?: number,
      valueType?: number,
    ) => {
      const qs = new URLSearchParams();
      qs.set("item_id", itemId);
      if (from) qs.set("from", String(from));
      if (to) qs.set("to", String(to));
      if (valueType != null) qs.set("value_type", String(valueType));
      return `${API_BASE}/zabbix/history?${qs.toString()}`;
    },
    historyBatch: (itemIds: string[], from?: number, to?: number) => {
      const qs = new URLSearchParams();
      qs.set("item_ids", itemIds.join(","));
      if (from) qs.set("from", String(from));
      if (to) qs.set("to", String(to));
      return `${API_BASE}/zabbix/history-batch?${qs.toString()}`;
    },
    acknowledge: `${API_BASE}/zabbix/acknowledge`,
    graphs: (hostId?: string) =>
      hostId
        ? `${API_BASE}/zabbix/graphs?host_id=${hostId}`
        : `${API_BASE}/zabbix/graphs`,
    graphData: (graphId: string, from?: number, to?: number) => {
      const qs = new URLSearchParams();
      if (from) qs.set("from", String(from));
      if (to) qs.set("to", String(to));
      const q = qs.toString();
      return q
        ? `${API_BASE}/zabbix/graphs/${graphId}/data?${q}`
        : `${API_BASE}/zabbix/graphs/${graphId}/data`;
    },
  },
  profile: {
    get: `${API_BASE}/profile`,
    update: `${API_BASE}/profile`,
    avatar: `${API_BASE}/profile/avatar`,
    preferences: `${API_BASE}/profile/preferences`,
    sessions: `${API_BASE}/profile/sessions`,
    sessionRevoke: (id: string) => `${API_BASE}/profile/sessions/${id}`,
    securityLog: (limit: number) =>
      `${API_BASE}/profile/security-log?limit=${limit}`,
  },
  tickets: {
    list: `${API_BASE}/tickets`,
    create: `${API_BASE}/tickets`,
    detail: (id: string) => `${API_BASE}/tickets/${id}`,
    update: (id: string) => `${API_BASE}/tickets/${id}`,
    comments: (id: string) => `${API_BASE}/tickets/${id}/comments`,
    categories: `${API_BASE}/tickets/categories`,
    categoryDetail: (id: string) => `${API_BASE}/tickets/categories/${id}`,
    stats: `${API_BASE}/tickets/stats`,
  },
  settings: {
    modules: `${API_BASE}/settings/modules`,
  },
  push: {
    subscribe: `${API_BASE}/push/subscribe`,
    unsubscribe: `${API_BASE}/push/unsubscribe`,
    nativeSubscribe: `${API_BASE}/push/native/subscribe`,
    nativeUnsubscribe: `${API_BASE}/push/native/unsubscribe`,
  },
} as const;

export const wsUrl = process.env.EXPO_PUBLIC_WS_URL ?? "ws://localhost:3001/ws";

// Re-export input types para conveniencia
export type {
  LoginInput,
  MfaVerifyInput,
  ChangePasswordInput,
  ForgotPasswordInput,
  ResetPasswordInput,
};
