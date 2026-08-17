// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import crypto from "node:crypto";
import { Agent, setGlobalDispatcher } from "undici";

// ========== Tipos Zabbix ==========

export interface ZabbixHost {
  hostid: string;
  host: string;
  name: string;
  status: string;
  interfaces?: ZabbixInterface[];
  hostGroups?: ZabbixHostGroup[];
  hostgroups?: ZabbixHostGroup[];
  groups?: ZabbixHostGroup[];
  proxyid?: string;
  templates?: ZabbixTemplate[];
  parentTemplates?: ZabbixTemplate[];
  macros?: ZabbixMacro[];
  inventory?: ZabbixHostInventory;
}

export interface ZabbixInterface {
  interfaceid: string;
  hostid: string;
  ip: string;
  dns: string;
  type: number;
  port: string;
  main: number;
  useip: number;
}

export interface ZabbixHostGroup {
  groupid: string;
  name: string;
  hosts?: ZabbixHost[];
}

export interface ZabbixHostInventory {
  type?: string;
  os?: string;
  serialno_a?: string;
  vendor?: string;
  model?: string;
  location?: string;
  tag?: string;
  [key: string]: string | undefined;
}

export interface ZabbixTemplate {
  templateid: string;
  host: string;
  name: string;
  description?: string;
}

export interface ZabbixMacro {
  hostmacroid: string;
  macro: string;
  value: string;
}

export interface ZabbixItem {
  itemid: string;
  hostid: string;
  name: string;
  key_: string;
  value_type: number;
  type: number;
  units: string;
  history: string;
  trends: string;
  lastvalue: string;
  lastclock: string;
  delay: string;
  state: number;
  status: number;
  error?: string;
}

export interface ZabbixTrigger {
  triggerid: string;
  description: string;
  expression: string;
  priority: string;
  value: string;
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
  // Tags do trigger (selectTags) — espelha ZabbixProblemTag para paridade mobile
  tags?: ZabbixProblemTag[];
  // Suppressed via lastEvent (problem.get retorna suppressed; trigger.get via selectLastEvent)
  suppressed?: boolean;
}

export interface ZabbixProblemTag {
  tag: string;
  value: string;
}

export interface ZabbixProblem {
  eventid: string;
  objectid: string;
  source: number;
  object: number;
  acknowledged: number;
  clock: number;
  ns: number;
  name: string;
  severity: number;
  hosts?: ZabbixHost[];
  relatedObject?: ZabbixTrigger;
  suppressed?: boolean;
  tags?: ZabbixProblemTag[];
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

export interface ZabbixHistoryEntry {
  itemid: string;
  clock: number;
  ns: number;
  value: string;
}

export interface ZabbixGraph {
  graphid: string;
  name: string;
  width: number;
  height: number;
  yaxismin: number;
  yaxismax: number;
  templateid?: string;
  graphtype?: number;
  items?: ZabbixGraphItem[];
  gitems?: ZabbixGraphItem[];
  hosts?: ZabbixHost[];
}

export interface ZabbixGraphItem {
  gitemid: string;
  graphid: string;
  itemid: string;
  drawtype: number;
  sortorder: number;
  color: string;
  yaxisside: number;
  calc_fnc: number;
  type: number;
}

export interface ZabbixMaintenance {
  maintenanceid: string;
  name: string;
  maintenance_type: number;
  state: string;
  description: string;
  active_since: number;
  active_till: number;
  hosts?: ZabbixHost[];
  groups?: ZabbixHostGroup[];
  timeperiods?: unknown[];
}

export interface ZabbixProxy {
  proxyid: string;
  name: string;
  status: string;
  hosts?: ZabbixHost[];
}

export interface ZabbixService {
  serviceid: string;
  name: string;
  status: string;
  sortorder?: number;
  description?: string;
  // Zabbix 7.x: parentid nao existe como campo — parents via selectParents
  parentid?: string;
  parents?: { serviceid: string; name: string }[];
  children?: ZabbixService[];
}

export interface ZabbixSla {
  slaid: string;
  name: string;
  status: number;
  state?: string;
  slo?: number;
  period?: string;
  schedule?: unknown[];
  excluded_downtimes?: unknown[];
}

export interface ZabbixUser {
  userid: string;
  username: string;
  name: string;
  surname: string;
  roleid: string;
  role?: { roleid: string; name: string };
  users_status?: string;
  passwd?: string;
  usrgrps?: ZabbixUserGroup[];
}

export interface ZabbixUserGroup {
  usrgrpid: string;
  name: string;
  users?: ZabbixUser[];
  rights?: Array<{ id: string; permission: number }>;
}

export interface ZabbixAction {
  actionid: string;
  name: string;
  status: string;
  eventsource: number;
  r_eventid?: string;
  operations?: Array<{
    operationid: string;
    actionid: string;
    operationtype: number;
    esc_period: string;
    esc_step_from: number;
    esc_step_to: number;
    evaltype: number;
    opmessage?: unknown;
    opconditions?: unknown[];
    opcommand?: unknown;
  }>;
}

export interface ZabbixDiscoveryRule {
  ruleid: string;
  druleid: string;
  name: string;
  key_: string;
  hostid: string;
  status: string;
  iprange?: string;
  dchecks?: Array<{
    dcheckid: string;
    druleid: string;
    type: number;
    key_: string;
    ports: string;
    uniq: number;
  }>;
}

export interface ZabbixReport {
  reportid: string;
  name: string;
  status: string;
  userid: string;
  dashboardid: string;
  period: number;
  cycle: number;
  description?: string;
}

export interface ZabbixTrendEntry {
  itemid: string;
  clock: number;
  num: number;
  value_min: string;
  value_avg: string;
  value_max: string;
}

export interface ZabbixUserMacro {
  hostmacroid: string;
  macro: string;
  value: string;
  type: number;
  hostid?: string;
}

export interface ZabbixValueMap {
  valuemapid: string;
  name: string;
  mappings: Array<{ type: number; value: string; newvalue: string }>;
}

export interface ZabbixAlert {
  alertid: string;
  actionid: string;
  eventid: string;
  userid: string;
  mediatypeid: string;
  sendto: string;
  subject: string;
  message: string;
  status: string;
  clock: number;
}

export interface ZabbixMediaType {
  mediatypeid: string;
  name: string;
  type: number;
  status: string;
  webhook_url?: string;
}

export interface ZabbixHttpTest {
  httptestid: string;
  name: string;
  hostid: string;
  status: string;
  steps?: Array<{ httpstepid: string; name: string; no: number }>;
}

export interface ZabbixCorrelation {
  correlationid: string;
  name: string;
  status: string;
  description?: string;
}

export interface ZabbixDashboard {
  dashboardid: string;
  name: string;
  userid: string;
  pages?: Array<{ dashboard_pageid: string; name: string }>;
}

export interface ZabbixProxyGroup {
  proxy_groupid: string;
  name: string;
  failover_delay: string;
  description?: string;
}

export interface ZabbixToken {
  tokenid: string;
  name: string;
  description?: string;
  userid: string;
  status: string;
  expires_at?: string;
}

export interface ZabbixAuditLogEntry {
  auditid: string;
  userid: string;
  username: string;
  clock: number;
  action: number;
  resourcetype: number;
  resourceid: string;
  resourcename: string;
  details: string;
}

export interface ZabbixHaNode {
  ha_nodeid: string;
  name: string;
  address: string;
  port: number;
  status: number;
  lastaccess: number;
}

export interface ZabbixConnector {
  connectorid: string;
  name: string;
  url: string;
  data_type: string;
  status: string;
}

// ========== Criptografia AES-256-GCM para tokens ==========

export function encryptTokenParts(
  plaintext: string,
  encryptionKey?: string,
): { encrypted: string; iv: string; tag: string } {
  const key =
    encryptionKey ??
    process.env.ZABBIX_ENCRYPTION_KEY_HEX ??
    process.env.ENCRYPTION_KEY ??
    "";
  if (!key) throw new Error("ZABBIX_ENCRYPTION_KEY_HEX não configurado");

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    Buffer.from(key, "hex"),
    iv,
  );
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return {
    encrypted: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

export function decryptTokenParts(
  encrypted: string,
  iv: string,
  tag: string,
  encryptionKey?: string,
): string | null {
  try {
    const key =
      encryptionKey ??
      process.env.ZABBIX_ENCRYPTION_KEY_HEX ??
      process.env.ENCRYPTION_KEY ??
      "";
    if (!key) throw new Error("ZABBIX_ENCRYPTION_KEY_HEX não configurado");

    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      Buffer.from(key, "hex"),
      Buffer.from(iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encrypted, "base64")),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

// ========== BlindedZabbixClient ==========

// Agent HTTP com Keep-Alive para reutilizar conexoes TCP/TLS
// Reduz latencia em chamadas repetidas a API do Zabbix
const keepAliveAgent = new Agent({
  keepAliveTimeout: 30_000,
  keepAliveMaxTimeout: 120_000,
  pipelining: 1,
  headersTimeout: 15_000,
  bodyTimeout: 15_000,
});
setGlobalDispatcher(keepAliveAgent);

// Limpa parametros removendo campos undefined, null e arrays vazios
// Zabbix 7.4 rejeita parametros inesperados com erro -32602
function cleanParams(params: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    cleaned[key] = value;
  }
  return cleaned;
}

interface BlindedZabbixClientOptions {
  apiUrl: string;
  apiToken: string;
  timeout?: number;
  circuitKey?: string;
}

export class BlindedZabbixClient {
  private apiUrl: string;
  private apiToken: string;
  private timeout: number;
  private requestId: number = 0;
  private circuitKey: string;

  constructor(opts: BlindedZabbixClientOptions) {
    this.apiUrl = opts.apiUrl;
    this.apiToken = opts.apiToken;
    // Timeout padrao 8s — documentacao Zabbix recomenda 5-10s
    // history.get pode demorar mais, usar timeout maior para esses casos
    this.timeout = opts.timeout ?? 8_000;
    // Circuit breaker key baseado na URL da API (compartilhado entre tenants do mesmo Zabbix)
    this.circuitKey = opts.circuitKey ?? `zabbix:${this.apiUrl}`;
  }

  // RPC generico para a API Zabbix — params aceita objeto ou array (para delete operations)
  // Circuit breaker protege contra cascata de falhas quando Zabbix esta indisponivel
  async rpc<T = unknown>(
    method: string,
    params?: Record<string, unknown> | unknown[],
    skipAuth = false,
  ): Promise<T> {
    // Verifica circuit breaker (import dinamico para evitar dependencia circular)
    const { circuitCanCall, circuitOnSuccess, circuitOnFailure } =
      await import("@repo/cache");
    const canCall = await circuitCanCall(this.circuitKey);
    if (!canCall) {
      throw new Error("Zabbix API indisponivel (circuit breaker aberto)");
    }

    const id = ++this.requestId;
    // Limpa params se for objeto (arrays para delete passam direto)
    const cleanedParams = Array.isArray(params)
      ? params
      : params
        ? cleanParams(params)
        : {};
    const body = {
      jsonrpc: "2.0",
      method,
      params: cleanedParams,
      id,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeout);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json-rpc",
      };
      if (!skipAuth) {
        headers["Authorization"] = `Bearer ${this.apiToken}`;
      }
      const res = await fetch(this.apiUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
        // undici Agent com Keep-Alive ja configurado via setGlobalDispatcher
      });

      if (!res.ok) {
        await circuitOnFailure(this.circuitKey);
        throw new Error(`Zabbix API HTTP ${res.status}`);
      }

      const json = (await res.json()) as {
        result?: T;
        error?: { message: string; code?: number };
      };

      if (json.error) {
        // Erro de negocio (parametros invalidos, etc) — nao conta como falha de circuito
        throw new Error(`Zabbix API error: ${json.error.message}`);
      }

      await circuitOnSuccess(this.circuitKey);
      return json.result as T;
    } catch (err) {
      // Erro de rede/timeout — conta como falha do circuito
      if (err instanceof Error && !err.message.includes("circuit breaker")) {
        await circuitOnFailure(this.circuitKey);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  // API version — params deve ser array vazio conforme docs do Zabbix
  async getApiVersion(): Promise<string> {
    return this.rpc<string>("apiinfo.version", [], true);
  }

  // Hosts / Devices — selectHostGroups (renamed de selectGroups no Zabbix 7.x)
  async getDevices(hostGroupId?: string): Promise<ZabbixHost[]> {
    const params: Record<string, unknown> = {
      output: ["hostid", "host", "name", "status"],
      selectInterfaces: ["ip", "type", "port", "dns"],
      selectHostGroups: ["groupid", "name"],
      selectParentTemplates: ["templateid", "host", "name"],
      selectInventory: [
        "type",
        "os",
        "serialno_a",
        "vendor",
        "model",
        "location",
        "tag",
      ],
    };
    if (hostGroupId) {
      params.groupids = hostGroupId;
    }
    return this.rpc<ZabbixHost[]>("host.get", params);
  }

  async getDevice(hostId: string): Promise<ZabbixHost | null> {
    const result = await this.rpc<ZabbixHost[]>("host.get", {
      output: ["hostid", "host", "name", "status"],
      selectInterfaces: ["ip", "type"],
      selectHostGroups: ["groupid", "name"],
      hostids: hostId,
    });
    return result[0] ?? null;
  }

  // createHost — transforma groupids/templateids do schema para formato esperado pela API Zabbix 7.x
  async createHost(
    data: Record<string, unknown>,
  ): Promise<{ hostids: string[] }> {
    const apiData: Record<string, unknown> = { ...data };
    // Zabbix 7.x espera groups: [{groupid: "1"}] em vez de groupids: ["1"]
    if (Array.isArray(data.groupids)) {
      apiData.groups = (data.groupids as string[]).map((id) => ({
        groupid: id,
      }));
      delete apiData.groupids;
    }
    // Zabbix 7.x espera templates: [{templateid: "1"}] em vez de templateids: ["1"]
    if (Array.isArray(data.templateids)) {
      apiData.templates = (data.templateids as string[]).map((id) => ({
        templateid: id,
      }));
      delete apiData.templateids;
    }
    return this.rpc<{ hostids: string[] }>("host.create", apiData);
  }

  // updateHost — transforma groupids/templateids se presentes
  async updateHost(
    hostId: string,
    data: Record<string, unknown>,
  ): Promise<{ hostids: string[] }> {
    const apiData: Record<string, unknown> = { ...data };
    if (Array.isArray(data.groupids)) {
      apiData.groups = (data.groupids as string[]).map((id) => ({
        groupid: id,
      }));
      delete apiData.groupids;
    }
    if (Array.isArray(data.templateids)) {
      apiData.templates = (data.templateids as string[]).map((id) => ({
        templateid: id,
      }));
      delete apiData.templateids;
    }
    return this.rpc<{ hostids: string[] }>("host.update", {
      hostid: hostId,
      ...apiData,
    });
  }

  async deleteHost(hostIds: string[]): Promise<{ hostids: string[] }> {
    return this.rpc<{ hostids: string[] }>(
      "host.delete",
      hostIds as unknown as Record<string, unknown>,
    );
  }

  // Host Groups
  async getHostGroups(): Promise<ZabbixHostGroup[]> {
    return this.rpc<ZabbixHostGroup[]>("hostgroup.get", {
      output: ["groupid", "name"],
      sortfield: "name",
      limit: 200,
    });
  }

  async getHostGroupsWithHosts(): Promise<ZabbixHostGroup[]> {
    return this.rpc<ZabbixHostGroup[]>("hostgroup.get", {
      output: ["groupid", "name"],
      selectHosts: ["hostid", "host", "name", "status"],
      sortfield: "name",
      limit: 200,
    });
  }

  async createHostGroup(name: string): Promise<{ groupids: string[] }> {
    return this.rpc<{ groupids: string[] }>("hostgroup.create", { name });
  }

  async updateHostGroup(
    groupId: string,
    name: string,
  ): Promise<{ groupids: string[] }> {
    return this.rpc<{ groupids: string[] }>("hostgroup.update", {
      groupid: groupId,
      name,
    });
  }

  async deleteHostGroup(groupIds: string[]): Promise<{ groupids: string[] }> {
    return this.rpc<{ groupids: string[] }>(
      "hostgroup.delete",
      groupIds as unknown as Record<string, unknown>,
    );
  }

  // Items
  async getItems(hostId: string): Promise<ZabbixItem[]> {
    return this.rpc<ZabbixItem[]>("item.get", {
      hostids: hostId,
      output: [
        "itemid",
        "hostid",
        "name",
        "key_",
        "value_type",
        "type",
        "units",
        "history",
        "trends",
        "lastvalue",
        "lastclock",
        "delay",
        "state",
        "status",
      ],
      sortfield: "name",
    });
  }

  // Busca items de multiplos hosts em uma unica chamada API (evita N+1)
  // Retorna todos os items agrupados por hostid no campo hostid de cada item
  async getItemsForHosts(hostIds: string[]): Promise<ZabbixItem[]> {
    if (hostIds.length === 0) return [];
    return this.rpc<ZabbixItem[]>("item.get", {
      hostids: hostIds,
      output: [
        "itemid",
        "hostid",
        "name",
        "key_",
        "value_type",
        "type",
        "units",
        "history",
        "trends",
        "lastvalue",
        "lastclock",
        "delay",
        "state",
        "status",
      ],
      sortfield: "name",
    });
  }

  async getKeyItems(
    hostIds: string[],
    keySearch?: string,
  ): Promise<ZabbixItem[]> {
    const params: Record<string, unknown> = {
      hostids: hostIds,
      output: [
        "itemid",
        "hostid",
        "name",
        "key_",
        "value_type",
        "type",
        "units",
        "history",
        "trends",
        "lastvalue",
        "lastclock",
        "delay",
        "state",
        "status",
      ],
      sortfield: "name",
    };
    if (keySearch) {
      params.search = { key_: keySearch };
      params.searchByAny = true;
    }
    return this.rpc<ZabbixItem[]>("item.get", params);
  }

  async createItem(
    data: Record<string, unknown>,
  ): Promise<{ itemids: string[] }> {
    return this.rpc<{ itemids: string[] }>("item.create", data);
  }

  async updateItem(
    itemId: string,
    data: Record<string, unknown>,
  ): Promise<{ itemids: string[] }> {
    return this.rpc<{ itemids: string[] }>("item.update", {
      itemid: itemId,
      ...data,
    });
  }

  async deleteItem(itemIds: string[]): Promise<{ itemids: string[] }> {
    return this.rpc<{ itemids: string[] }>(
      "item.delete",
      itemIds as unknown as Record<string, unknown>,
    );
  }

  // Triggers — expandDescription removido (deprecated no Zabbix 7.x, descriptions sempre expandidas)
  async getTriggers(
    hostIds?: string[],
    options?: { activeOnly?: boolean },
  ): Promise<ZabbixTrigger[]> {
    const params: Record<string, unknown> = {
      output: [
        "triggerid",
        "description",
        "expression",
        "priority",
        "value",
        "state",
        "status",
        "url",
        "comments",
        "error",
        "templateid",
        "lastchange",
      ],
      selectHosts: ["hostid", "host", "name"],
      selectItems: ["itemid", "name", "key_"],
      selectLastEvent: [
        "eventid",
        "value",
        "acknowledged",
        "clock",
        "severity",
        "suppressed",
      ],
      // selectTags retorna tags do trigger (paridade com problem.get tags)
      selectTags: ["tag", "value"],
      // only_true retorna apenas triggers em estado de problema (value=1)
      // Sem isso, o limite de 200 pode cortar triggers ativos
      only_true: options?.activeOnly ?? true,
      limit: 200,
    };
    if (hostIds) params.hostids = hostIds;
    return this.rpc<ZabbixTrigger[]>("trigger.get", params);
  }

  // createTrigger — Zabbix 7.x espera expression como string e hostid no formato correto
  async createTrigger(
    data: Record<string, unknown>,
  ): Promise<{ triggerids: string[] }> {
    const apiData: Record<string, unknown> = { ...data };
    // Zabbix 7.x usa description em vez de comments para triggers
    if (data.description && !data.comments) {
      apiData.description = data.description;
    }
    return this.rpc<{ triggerids: string[] }>("trigger.create", apiData);
  }

  async updateTrigger(
    triggerId: string,
    data: Record<string, unknown>,
  ): Promise<{ triggerids: string[] }> {
    return this.rpc<{ triggerids: string[] }>("trigger.update", {
      triggerid: triggerId,
      ...data,
    });
  }

  async deleteTrigger(triggerIds: string[]): Promise<{ triggerids: string[] }> {
    return this.rpc<{ triggerids: string[] }>(
      "trigger.delete",
      triggerIds as unknown as Record<string, unknown>,
    );
  }

  // Problems — Zabbix 7.4 nao suporta selectHosts em problem.get
  async getProblems(
    hostIds?: string[],
    options?: {
      acknowledged?: boolean;
      recent?: boolean;
      suppressed?: boolean;
    },
  ): Promise<ZabbixProblem[]> {
    const params: Record<string, unknown> = {
      output: [
        "eventid",
        "objectid",
        "source",
        "object",
        "acknowledged",
        "clock",
        "ns",
        "name",
        "severity",
      ],
      recent: options?.recent ?? false,
      sortfield: ["eventid"],
      sortorder: "DESC",
      limit: 200,
    };
    if (hostIds) params.hostids = hostIds;
    if (options?.acknowledged !== undefined)
      params.acknowledged = options.acknowledged;
    if (options?.suppressed !== undefined)
      params.suppressed = options.suppressed;
    return this.rpc<ZabbixProblem[]>("problem.get", params);
  }

  // Events — adicionado acknowledged, limit e selectHosts
  async getEvents(
    hostIds: string[],
    options?: {
      from?: number;
      to?: number;
      value?: number;
      acknowledged?: boolean;
      limit?: number;
    },
  ): Promise<ZabbixEvent[]> {
    const params: Record<string, unknown> = {
      output: [
        "eventid",
        "objectid",
        "clock",
        "ns",
        "value",
        "source",
        "object",
        "acknowledged",
        "name",
        "severity",
      ],
      sortfield: ["clock", "eventid"],
      sortorder: "DESC",
      limit: options?.limit ?? 100,
      selectHosts: ["hostid", "host", "name"],
    };
    if (hostIds.length > 0) params.hostids = hostIds;
    if (options?.from) params.time_from = options.from;
    if (options?.to) params.time_till = options.to;
    if (options?.value !== undefined) params.value = options.value;
    if (options?.acknowledged !== undefined)
      params.acknowledged = options.acknowledged;
    return this.rpc<ZabbixEvent[]>("event.get", params);
  }

  // History — valueType opcional (quando undefined, Zabbix busca em todas as tabelas)
  // Usa timeout maior (15s) pois history.get pode demorar com muitos itens
  async getHistory(
    itemId: string,
    from: number,
    to: number,
    valueType?: number,
  ): Promise<ZabbixHistoryEntry[]> {
    const params: Record<string, unknown> = {
      itemids: itemId,
      time_from: from,
      time_till: to,
      sortfield: "clock",
      sortorder: "ASC",
      output: ["itemid", "clock", "ns", "value"],
      limit: 5000,
    };
    if (valueType !== undefined) params.history = valueType;
    const prevTimeout = this.timeout;
    this.timeout = 15_000;
    try {
      return await this.rpc<ZabbixHistoryEntry[]>("history.get", params);
    } finally {
      this.timeout = prevTimeout;
    }
  }

  async getHistoryBatch(
    itemIds: string[],
    from: number,
    to: number,
    valueType?: number,
  ): Promise<ZabbixHistoryEntry[]> {
    const params: Record<string, unknown> = {
      itemids: itemIds,
      time_from: from,
      time_till: to,
      sortfield: "clock",
      sortorder: "ASC",
      output: ["itemid", "clock", "ns", "value"],
      limit: 10000,
    };
    if (valueType !== undefined) params.history = valueType;
    const prevTimeout = this.timeout;
    this.timeout = 15_000;
    try {
      return await this.rpc<ZabbixHistoryEntry[]>("history.get", params);
    } finally {
      this.timeout = prevTimeout;
    }
  }

  // Graphs — hostId opcional (quando undefined, retorna todos os grafos)
  async getGraphs(hostId?: string): Promise<ZabbixGraph[]> {
    const params: Record<string, unknown> = {
      output: [
        "graphid",
        "name",
        "width",
        "height",
        "graphtype",
        "yaxismin",
        "yaxismax",
      ],
      selectGraphItems: [
        "itemid",
        "color",
        "drawtype",
        "sortorder",
        "yaxisside",
        "calc_fnc",
        "type",
      ],
      selectHosts: ["hostid", "host", "name"],
      sortfield: "name",
    };
    if (hostId) params.hostids = hostId;
    return this.rpc<ZabbixGraph[]>("graph.get", params);
  }

  // Templates
  async getTemplates(hostId?: string): Promise<ZabbixTemplate[]> {
    const params: Record<string, unknown> = {
      output: ["templateid", "host", "name"],
      limit: 200,
    };
    if (hostId) params.hostids = hostId;
    return this.rpc<ZabbixTemplate[]>("template.get", params);
  }

  // Proxies
  async getProxies(): Promise<ZabbixProxy[]> {
    return this.rpc<ZabbixProxy[]>("proxy.get", {
      output: ["proxyid", "name", "status"],
      selectHosts: ["hostid", "host", "name"],
      limit: 100,
    });
  }

  // Maintenance — selectHostGroups (renamed de selectGroups no Zabbix 7.x)
  async getMaintenances(hostIds?: string[]): Promise<ZabbixMaintenance[]> {
    const params: Record<string, unknown> = {
      output: [
        "maintenanceid",
        "name",
        "maintenance_type",
        "state",
        "description",
        "active_since",
        "active_till",
      ],
      selectHostGroups: ["groupid", "name"],
      selectHosts: ["hostid", "host", "name"],
      limit: 100,
    };
    if (hostIds) params.hostids = hostIds;
    return this.rpc<ZabbixMaintenance[]>("maintenance.get", params);
  }

  // createMaintenance — transforma hostids para hosts: [{hostid: "1"}] (formato Zabbix 7.x)
  async createMaintenance(
    data: Record<string, unknown>,
  ): Promise<{ maintenanceids: string[] }> {
    const apiData: Record<string, unknown> = { ...data };
    if (Array.isArray(data.hostids)) {
      apiData.hosts = (data.hostids as string[]).map((id) => ({ hostid: id }));
      delete apiData.hostids;
    }
    return this.rpc<{ maintenanceids: string[] }>(
      "maintenance.create",
      apiData,
    );
  }

  async deleteMaintenance(
    maintenanceIds: string[],
  ): Promise<{ maintenanceids: string[] }> {
    return this.rpc<{ maintenanceids: string[] }>(
      "maintenance.delete",
      maintenanceIds as unknown as Record<string, unknown>,
    );
  }

  // Acknowledge events
  async acknowledgeEvents(
    eventIds: string[],
    message: string,
    action: number,
  ): Promise<{ eventids: string[] }> {
    return this.rpc<{ eventids: string[] }>("event.acknowledge", {
      eventids: eventIds,
      message,
      action,
    });
  }

  // Services (SLA) — compativel com Zabbix 6.0+ e 7.x
  // Zabbix 7.x nao tem campo parentid no output — parents via selectParents
  async getServices(parentId?: string): Promise<ZabbixService[]> {
    const params: Record<string, unknown> = {
      output: ["serviceid", "name", "status", "sortorder", "description"],
      selectChildren: ["serviceid", "name", "status"],
      selectParents: ["serviceid", "name"],
    };
    if (parentId) params.parentids = parentId;
    return this.rpc<ZabbixService[]>("service.get", params);
  }

  async getSlas(): Promise<ZabbixSla[]> {
    return this.rpc<ZabbixSla[]>("sla.get", {
      output: ["slaid", "name", "status", "slo", "period"],
      limit: 100,
    });
  }

  // Users — Zabbix 7.x usa roleid em vez de role
  async getUsers(): Promise<ZabbixUser[]> {
    return this.rpc<ZabbixUser[]>("user.get", {
      output: ["userid", "username", "name", "surname", "roleid"],
    });
  }

  async createUser(data: {
    username: string;
    name?: string;
    surname?: string;
    roleid: string;
    passwd?: string;
    usrgrps?: string[];
  }): Promise<{ userids: string[] }> {
    const params: Record<string, unknown> = {
      username: data.username,
      roleid: data.roleid,
    };
    if (data.name) params.name = data.name;
    if (data.surname) params.surname = data.surname;
    if (data.passwd) params.passwd = data.passwd;
    if (data.usrgrps)
      params.usrgrps = data.usrgrps.map((id) => ({ usrgrpid: id }));
    return this.rpc<{ userids: string[] }>("user.create", params);
  }

  async updateUser(
    userId: string,
    data: {
      username?: string;
      name?: string;
      surname?: string;
      roleid?: string;
      passwd?: string;
      usrgrps?: string[];
    },
  ): Promise<{ userids: string[] }> {
    const params: Record<string, unknown> = { userid: userId };
    if (data.username !== undefined) params.username = data.username;
    if (data.name !== undefined) params.name = data.name;
    if (data.surname !== undefined) params.surname = data.surname;
    if (data.roleid !== undefined) params.roleid = data.roleid;
    if (data.passwd !== undefined) params.passwd = data.passwd;
    if (data.usrgrps !== undefined)
      params.usrgrps = data.usrgrps.map((id) => ({ usrgrpid: id }));
    return this.rpc<{ userids: string[] }>("user.update", params);
  }

  async deleteUser(userIds: string[]): Promise<{ userids: string[] }> {
    return this.rpc<{ userids: string[] }>(
      "user.delete",
      userIds as unknown as Record<string, unknown>,
    );
  }

  // User Groups
  async getUserGroups(): Promise<ZabbixUserGroup[]> {
    return this.rpc<ZabbixUserGroup[]>("usergroup.get", {
      output: ["usrgrpid", "name"],
      selectUsers: ["userid", "username", "name", "surname"],
      limit: 100,
    });
  }

  async createUserGroup(
    name: string,
    permission?: { id: string; permission: number },
  ): Promise<{ usrgrpids: string[] }> {
    const params: Record<string, unknown> = { name };
    if (permission) {
      params.rights = [
        { id: permission.id, permission: permission.permission },
      ];
    }
    return this.rpc<{ usrgrpids: string[] }>("usergroup.create", params);
  }

  async updateUserGroup(
    groupId: string,
    data: { name?: string; rights?: Array<{ id: string; permission: number }> },
  ): Promise<{ usrgrpids: string[] }> {
    const params: Record<string, unknown> = { usrgrpid: groupId };
    if (data.name !== undefined) params.name = data.name;
    if (data.rights !== undefined) params.rights = data.rights;
    return this.rpc<{ usrgrpids: string[] }>("usergroup.update", params);
  }

  async deleteUserGroup(groupIds: string[]): Promise<{ usrgrpids: string[] }> {
    return this.rpc<{ usrgrpids: string[] }>(
      "usergroup.delete",
      groupIds as unknown as Record<string, unknown>,
    );
  }

  // Actions
  async getActions(): Promise<ZabbixAction[]> {
    return this.rpc<ZabbixAction[]>("action.get", {
      output: ["actionid", "name", "status", "eventsource"],
      limit: 100,
    });
  }

  // Discovery rules
  async getDiscoveryRules(): Promise<ZabbixDiscoveryRule[]> {
    return this.rpc<ZabbixDiscoveryRule[]>("discoveryrule.get", {
      output: ["ruleid", "name", "key_", "hostid", "status"],
      limit: 200,
    });
  }

  // Reports
  async getReports(): Promise<ZabbixReport[]> {
    return this.rpc<ZabbixReport[]>("report.get", {
      output: [
        "reportid",
        "name",
        "status",
        "userid",
        "dashboardid",
        "period",
        "cycle",
        "description",
      ],
      limit: 100,
    });
  }

  // ========== Novos metodos Zabbix 7.4 ==========

  // Trends — dados consolidados por hora (min/max/avg) para graficos de longo prazo
  async getTrends(
    itemIds: string[],
    from: number,
    to: number,
    valueType?: number,
  ): Promise<ZabbixTrendEntry[]> {
    const params: Record<string, unknown> = {
      itemids: itemIds,
      time_from: from,
      time_till: to,
      sortfield: "clock",
      sortorder: "ASC",
      output: ["itemid", "clock", "num", "value_min", "value_avg", "value_max"],
      limit: 5000,
    };
    if (valueType !== undefined) params.history = valueType;
    const prevTimeout = this.timeout;
    this.timeout = 15_000;
    try {
      return await this.rpc<ZabbixTrendEntry[]>("trend.get", params);
    } finally {
      this.timeout = prevTimeout;
    }
  }

  // Script execute — executa comando remoto via Agent/SSH
  async executeScript(
    scriptId: string,
    hostId: string,
  ): Promise<{ result: string }> {
    return this.rpc<{ result: string }>("script.execute", {
      scriptid: scriptId,
      hostid: hostId,
    });
  }

  // Item execute — forca "Check Now" em um item
  async executeItem(itemId: string): Promise<{ itemids: string[] }> {
    return this.rpc<{ itemids: string[] }>("item.execute", {
      itemid: itemId,
    });
  }

  // User Macros — macros globais, de template ou de host
  // Ofusca macros secretas (type=1) no retorno
  async getUserMacros(hostId?: string): Promise<ZabbixUserMacro[]> {
    const params: Record<string, unknown> = {
      output: ["hostmacroid", "macro", "value", "type", "hostid"],
      limit: 500,
    };
    if (hostId) params.hostids = hostId;
    const macros = await this.rpc<ZabbixUserMacro[]>("usermacro.get", params);
    // Ofusca macros secretas (type=1) — nao expoe o valor real
    return macros.map((m) => (m.type === 1 ? { ...m, value: "******" } : m));
  }

  // Value Maps — tabelas de mapeamento de valores (ex: 0=Down, 1=Up)
  async getValueMaps(): Promise<ZabbixValueMap[]> {
    return this.rpc<ZabbixValueMap[]>("valuemap.get", {
      output: ["valuemapid", "name"],
      selectMappings: ["type", "value", "newvalue"],
      limit: 200,
    });
  }

  // Alerts — historico de notificacoes disparadas
  async getAlerts(limit?: number): Promise<ZabbixAlert[]> {
    return this.rpc<ZabbixAlert[]>("alert.get", {
      output: [
        "alertid",
        "actionid",
        "eventid",
        "userid",
        "mediatypeid",
        "sendto",
        "subject",
        "message",
        "status",
        "clock",
      ],
      sortfield: "clock",
      sortorder: "DESC",
      limit: limit ?? 100,
    });
  }

  // Media Types — canais de envio (webhook, email, SMS, Telegram)
  async getMediaTypes(): Promise<ZabbixMediaType[]> {
    return this.rpc<ZabbixMediaType[]>("mediatype.get", {
      output: ["mediatypeid", "name", "type", "status"],
      limit: 100,
    });
  }

  // HTTP Tests — monitoramento de cenarios web
  async getHttpTests(hostId?: string): Promise<ZabbixHttpTest[]> {
    const params: Record<string, unknown> = {
      output: ["httptestid", "name", "hostid", "status"],
      selectSteps: ["httpstepid", "name", "no"],
      limit: 200,
    };
    if (hostId) params.hostids = hostId;
    return this.rpc<ZabbixHttpTest[]>("httptest.get", params);
  }

  // Correlations — regras de correlacao de eventos
  async getCorrelations(): Promise<ZabbixCorrelation[]> {
    return this.rpc<ZabbixCorrelation[]>("correlation.get", {
      output: ["correlationid", "name", "status", "description"],
      limit: 100,
    });
  }

  // Dashboards — dashboards globais do Zabbix
  async getDashboards(): Promise<ZabbixDashboard[]> {
    return this.rpc<ZabbixDashboard[]>("dashboard.get", {
      output: ["dashboardid", "name", "userid"],
      selectPages: ["dashboard_pageid", "name"],
      limit: 100,
    });
  }

  // Proxy Groups — grupos de proxies para HA e balanceamento
  async getProxyGroups(): Promise<ZabbixProxyGroup[]> {
    return this.rpc<ZabbixProxyGroup[]>("proxygroup.get", {
      output: ["proxy_groupid", "name", "failover_delay", "description"],
      limit: 100,
    });
  }

  // Tokens — tokens de API gerados para integracoes
  async getTokens(): Promise<ZabbixToken[]> {
    return this.rpc<ZabbixToken[]>("token.get", {
      output: [
        "tokenid",
        "name",
        "description",
        "userid",
        "status",
        "expires_at",
      ],
      limit: 100,
    });
  }

  // Audit Log — logs de auditoria do Zabbix
  async getAuditLog(limit?: number): Promise<ZabbixAuditLogEntry[]> {
    return this.rpc<ZabbixAuditLogEntry[]>("auditlog.get", {
      output: [
        "auditid",
        "userid",
        "username",
        "clock",
        "action",
        "resourcetype",
        "resourceid",
        "resourcename",
        "details",
      ],
      sortfield: "clock",
      sortorder: "DESC",
      limit: limit ?? 100,
    });
  }

  // HA Nodes — estado de Alta Disponibilidade do Zabbix Server
  async getHaNodes(): Promise<ZabbixHaNode[]> {
    return this.rpc<ZabbixHaNode[]>("hanode.get", {
      output: ["ha_nodeid", "name", "address", "port", "status", "lastaccess"],
      limit: 50,
    });
  }

  // Connectors — configuracoes de streaming de dados
  async getConnectors(): Promise<ZabbixConnector[]> {
    return this.rpc<ZabbixConnector[]>("connector.get", {
      output: ["connectorid", "name", "url", "data_type", "status"],
      limit: 50,
    });
  }

  // Criar connector para streaming de history
  async createConnector(data: {
    name: string;
    url: string;
    data_type: string;
    token: string;
  }): Promise<{ connectorids: string[] }> {
    return this.rpc<{ connectorids: string[] }>("connector.create", {
      name: data.name,
      url: data.url,
      data_type: data.data_type,
      token: data.token,
    });
  }

  // Configuration export — exporta configuracoes (YAML/JSON)
  async exportConfiguration(options: {
    hosts?: string[];
    templates?: string[];
    format?: string;
  }): Promise<string> {
    const params: Record<string, unknown> = {
      format: options.format ?? "json",
    };
    if (options.hosts) params.options = { hosts: options.hosts };
    if (options.templates) {
      params.options = {
        ...(params.options as Record<string, unknown>),
        templates: options.templates,
      };
    }
    return this.rpc<string>("configuration.export", params);
  }

  // Configuration import — importa configuracoes (YAML/JSON)
  async importConfiguration(
    configString: string,
    format: string,
  ): Promise<{ imported: string }> {
    return this.rpc<{ imported: string }>("configuration.import", {
      format,
      rules: {},
      source: configString,
    });
  }

  // Ping — testa conectividade com a API Zabbix
  // Tenta apiinfo.version (sem auth) primeiro, depois host.get com auth
  async ping(): Promise<boolean> {
    try {
      await this.getApiVersion();
      return true;
    } catch {
      // Fallback: tenta uma chamada autenticada simples
      try {
        await this.rpc<unknown[]>("host.get", { output: ["hostid"], limit: 1 });
        return true;
      } catch {
        return false;
      }
    }
  }
}
