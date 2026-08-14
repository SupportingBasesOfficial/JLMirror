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
  };
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
  category_id: string | null;
  category_name?: string;
  category_color?: string;
  requester_name: string | null;
  requester_email: string | null;
  assigned_to: string | null;
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

export interface TicketDetailResponse {
  ticket: Ticket;
  comments: TicketComment[];
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
export interface ZabbixHost {
  hostid: string;
  host: string;
  name: string;
  status: number; // 0 = monitored, 1 = not monitored
  available?: number;
  interfaces?: Array<{
    interfaceid: string;
    ip: string;
    type: number;
    port: number;
  }>;
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
  tickets: {
    list: `${API_BASE}/tickets`,
    create: `${API_BASE}/tickets`,
    detail: (id: string) => `${API_BASE}/tickets/${id}`,
    update: (id: string) => `${API_BASE}/tickets/${id}`,
    comments: (id: string) => `${API_BASE}/tickets/${id}/comments`,
    categories: `${API_BASE}/tickets/categories`,
    stats: `${API_BASE}/tickets/stats`,
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
    history: (itemId: string, from?: number, to?: number) => {
      const qs = new URLSearchParams();
      qs.set("item_id", itemId);
      if (from) qs.set("from", String(from));
      if (to) qs.set("to", String(to));
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
