// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import crypto from "node:crypto";

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
  macros?: ZabbixMacro[];
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
  sortorder: number;
  description?: string;
  parentid?: string;
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
  operations?: Array<{ operationid: string; actionid: string; operationtype: number; esc_period: string; esc_step_from: number; esc_step_to: number; evaltype: number; opmessage?: unknown; opconditions?: unknown[]; opcommand?: unknown }>;
}

export interface ZabbixDiscoveryRule {
  ruleid: string;
  druleid: string;
  name: string;
  key_: string;
  hostid: string;
  status: string;
  iprange?: string;
  dchecks?: Array<{ dcheckid: string; druleid: string; type: number; key_: string; ports: string; uniq: number }>;
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

// ========== Criptografia AES-256-GCM para tokens ==========

export function encryptTokenParts(
  plaintext: string,
  encryptionKey?: string,
): { encrypted: string; iv: string; tag: string } {
  const key = encryptionKey ?? process.env.ENCRYPTION_KEY ?? "";
  if (!key) throw new Error("ENCRYPTION_KEY não configurado");

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
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
    const key = encryptionKey ?? process.env.ENCRYPTION_KEY ?? "";
    if (!key) throw new Error("ENCRYPTION_KEY não configurado");

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
    this.timeout = opts.timeout ?? 30_000;
    // Circuit breaker key baseado na URL da API (compartilhado entre tenants do mesmo Zabbix)
    this.circuitKey = opts.circuitKey ?? `zabbix:${this.apiUrl}`;
  }

  // RPC generico para a API Zabbix — params aceita objeto ou array (para delete operations)
  // Circuit breaker protege contra cascata de falhas quando Zabbix esta indisponivel
  async rpc<T = unknown>(method: string, params?: Record<string, unknown> | unknown[], skipAuth = false): Promise<T> {
    // Verifica circuit breaker (import dinamico para evitar dependencia circular)
    const { circuitCanCall, circuitOnSuccess, circuitOnFailure } = await import("@repo/cache");
    const canCall = await circuitCanCall(this.circuitKey);
    if (!canCall) {
      throw new Error("Zabbix API indisponivel (circuit breaker aberto)");
    }

    const id = ++this.requestId;
    const body = {
      jsonrpc: "2.0",
      method,
      params: params ?? {},
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
      });

      if (!res.ok) {
        await circuitOnFailure(this.circuitKey);
        throw new Error(`Zabbix API HTTP ${res.status}`);
      }

      const json = (await res.json()) as { result?: T; error?: { message: string; code?: number } };

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
  async createHost(data: Record<string, unknown>): Promise<{ hostids: string[] }> {
    const apiData: Record<string, unknown> = { ...data };
    // Zabbix 7.x espera groups: [{groupid: "1"}] em vez de groupids: ["1"]
    if (Array.isArray(data.groupids)) {
      apiData.groups = (data.groupids as string[]).map((id) => ({ groupid: id }));
      delete apiData.groupids;
    }
    // Zabbix 7.x espera templates: [{templateid: "1"}] em vez de templateids: ["1"]
    if (Array.isArray(data.templateids)) {
      apiData.templates = (data.templateids as string[]).map((id) => ({ templateid: id }));
      delete apiData.templateids;
    }
    return this.rpc<{ hostids: string[] }>("host.create", apiData);
  }

  // updateHost — transforma groupids/templateids se presentes
  async updateHost(hostId: string, data: Record<string, unknown>): Promise<{ hostids: string[] }> {
    const apiData: Record<string, unknown> = { ...data };
    if (Array.isArray(data.groupids)) {
      apiData.groups = (data.groupids as string[]).map((id) => ({ groupid: id }));
      delete apiData.groupids;
    }
    if (Array.isArray(data.templateids)) {
      apiData.templates = (data.templateids as string[]).map((id) => ({ templateid: id }));
      delete apiData.templateids;
    }
    return this.rpc<{ hostids: string[] }>("host.update", { hostid: hostId, ...apiData });
  }

  async deleteHost(hostIds: string[]): Promise<{ hostids: string[] }> {
    return this.rpc<{ hostids: string[] }>("host.delete", hostIds as unknown as Record<string, unknown>);
  }

  // Host Groups
  async getHostGroups(): Promise<ZabbixHostGroup[]> {
    return this.rpc<ZabbixHostGroup[]>("hostgroup.get", {
      output: ["groupid", "name"],
      sortfield: "name",
    });
  }

  async getHostGroupsWithHosts(): Promise<ZabbixHostGroup[]> {
    return this.rpc<ZabbixHostGroup[]>("hostgroup.get", {
      output: ["groupid", "name"],
      selectHosts: ["hostid", "host", "name", "status"],
      sortfield: "name",
    });
  }

  async createHostGroup(name: string): Promise<{ groupids: string[] }> {
    return this.rpc<{ groupids: string[] }>("hostgroup.create", { name });
  }

  async updateHostGroup(groupId: string, name: string): Promise<{ groupids: string[] }> {
    return this.rpc<{ groupids: string[] }>("hostgroup.update", { groupid: groupId, name });
  }

  async deleteHostGroup(groupIds: string[]): Promise<{ groupids: string[] }> {
    return this.rpc<{ groupids: string[] }>("hostgroup.delete", groupIds as unknown as Record<string, unknown>);
  }

  // Items
  async getItems(hostId: string): Promise<ZabbixItem[]> {
    return this.rpc<ZabbixItem[]>("item.get", {
      hostids: hostId,
      output: [
        "itemid", "hostid", "name", "key_", "value_type",
        "type", "units", "history", "trends", "lastvalue",
        "lastclock", "delay", "state", "status",
      ],
      sortfield: "name",
    });
  }

  async getKeyItems(hostIds: string[], keySearch?: string): Promise<ZabbixItem[]> {
    const params: Record<string, unknown> = {
      hostids: hostIds,
      output: [
        "itemid", "hostid", "name", "key_", "value_type",
        "type", "units", "history", "trends", "lastvalue",
        "lastclock", "delay", "state", "status",
      ],
      sortfield: "name",
    };
    if (keySearch) {
      params.search = { key_: keySearch };
      params.searchByAny = true;
    }
    return this.rpc<ZabbixItem[]>("item.get", params);
  }

  async createItem(data: Record<string, unknown>): Promise<{ itemids: string[] }> {
    return this.rpc<{ itemids: string[] }>("item.create", data);
  }

  async updateItem(itemId: string, data: Record<string, unknown>): Promise<{ itemids: string[] }> {
    return this.rpc<{ itemids: string[] }>("item.update", { itemid: itemId, ...data });
  }

  async deleteItem(itemIds: string[]): Promise<{ itemids: string[] }> {
    return this.rpc<{ itemids: string[] }>("item.delete", itemIds as unknown as Record<string, unknown>);
  }

  // Triggers — expandDescription removido (deprecated no Zabbix 7.x, descriptions sempre expandidas)
  async getTriggers(hostIds?: string[]): Promise<ZabbixTrigger[]> {
    const params: Record<string, unknown> = {
      output: "extend",
      selectHosts: ["hostid", "host", "name"],
      selectItems: ["itemid", "name", "key_"],
    };
    if (hostIds) params.hostids = hostIds;
    return this.rpc<ZabbixTrigger[]>("trigger.get", params);
  }

  // createTrigger — Zabbix 7.x espera expression como string e hostid no formato correto
  async createTrigger(data: Record<string, unknown>): Promise<{ triggerids: string[] }> {
    const apiData: Record<string, unknown> = { ...data };
    // Zabbix 7.x usa description em vez de comments para triggers
    if (data.description && !data.comments) {
      apiData.description = data.description;
    }
    return this.rpc<{ triggerids: string[] }>("trigger.create", apiData);
  }

  async updateTrigger(triggerId: string, data: Record<string, unknown>): Promise<{ triggerids: string[] }> {
    return this.rpc<{ triggerids: string[] }>("trigger.update", { triggerid: triggerId, ...data });
  }

  async deleteTrigger(triggerIds: string[]): Promise<{ triggerids: string[] }> {
    return this.rpc<{ triggerids: string[] }>("trigger.delete", triggerIds as unknown as Record<string, unknown>);
  }

  // Problems — Zabbix 7.4 nao suporta selectHosts em problem.get
  async getProblems(hostIds?: string[], options?: { acknowledged?: boolean; recent?: boolean; suppressed?: boolean }): Promise<ZabbixProblem[]> {
    const params: Record<string, unknown> = {
      output: "extend",
      recent: options?.recent ?? false,
      sortfield: ["eventid"],
      sortorder: "DESC",
    };
    if (hostIds) params.hostids = hostIds;
    if (options?.acknowledged !== undefined) params.acknowledged = options.acknowledged;
    if (options?.suppressed !== undefined) params.suppressed = options.suppressed;
    return this.rpc<ZabbixProblem[]>("problem.get", params);
  }

  // Events — adicionado acknowledged, limit e selectHosts
  async getEvents(hostIds: string[], options?: { from?: number; to?: number; value?: number; acknowledged?: boolean; limit?: number }): Promise<ZabbixEvent[]> {
    const params: Record<string, unknown> = {
      output: "extend",
      sortfield: ["clock", "eventid"],
      sortorder: "DESC",
      limit: options?.limit ?? 100,
      selectHosts: ["hostid", "host", "name"],
    };
    if (hostIds.length > 0) params.hostids = hostIds;
    if (options?.from) params.time_from = options.from;
    if (options?.to) params.time_till = options.to;
    if (options?.value !== undefined) params.value = options.value;
    if (options?.acknowledged !== undefined) params.acknowledged = options.acknowledged;
    return this.rpc<ZabbixEvent[]>("event.get", params);
  }

  // History — valueType opcional (quando undefined, Zabbix busca em todas as tabelas)
  async getHistory(itemId: string, from: number, to: number, valueType?: number): Promise<ZabbixHistoryEntry[]> {
    const params: Record<string, unknown> = {
      itemids: itemId,
      time_from: from,
      time_till: to,
      sortfield: "clock",
      sortorder: "ASC",
      output: "extend",
      limit: 5000,
    };
    if (valueType !== undefined) params.history = valueType;
    return this.rpc<ZabbixHistoryEntry[]>("history.get", params);
  }

  async getHistoryBatch(itemIds: string[], from: number, to: number, valueType?: number): Promise<ZabbixHistoryEntry[]> {
    const params: Record<string, unknown> = {
      itemids: itemIds,
      time_from: from,
      time_till: to,
      sortfield: "clock",
      sortorder: "ASC",
      output: "extend",
      limit: 10000,
    };
    if (valueType !== undefined) params.history = valueType;
    return this.rpc<ZabbixHistoryEntry[]>("history.get", params);
  }

  // Graphs — hostId opcional (quando undefined, retorna todos os grafos)
  async getGraphs(hostId?: string): Promise<ZabbixGraph[]> {
    const params: Record<string, unknown> = {
      output: ["graphid", "name", "width", "height", "graphtype", "yaxismin", "yaxismax"],
      selectGraphItems: ["itemid", "color", "drawtype", "sortorder", "yaxisside", "calc_fnc", "type"],
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
    };
    if (hostId) params.hostids = hostId;
    return this.rpc<ZabbixTemplate[]>("template.get", params);
  }

  // Proxies
  async getProxies(): Promise<ZabbixProxy[]> {
    return this.rpc<ZabbixProxy[]>("proxy.get", {
      output: ["proxyid", "name", "status"],
      selectHosts: ["hostid", "host", "name"],
    });
  }

  // Maintenance — selectHostGroups (renamed de selectGroups no Zabbix 7.x)
  async getMaintenances(hostIds?: string[]): Promise<ZabbixMaintenance[]> {
    const params: Record<string, unknown> = {
      output: "extend",
      selectHostGroups: ["groupid", "name"],
      selectHosts: ["hostid", "host", "name"],
    };
    if (hostIds) params.hostids = hostIds;
    return this.rpc<ZabbixMaintenance[]>("maintenance.get", params);
  }

  // createMaintenance — transforma hostids para hosts: [{hostid: "1"}] (formato Zabbix 7.x)
  async createMaintenance(data: Record<string, unknown>): Promise<{ maintenanceids: string[] }> {
    const apiData: Record<string, unknown> = { ...data };
    if (Array.isArray(data.hostids)) {
      apiData.hosts = (data.hostids as string[]).map((id) => ({ hostid: id }));
      delete apiData.hostids;
    }
    return this.rpc<{ maintenanceids: string[] }>("maintenance.create", apiData);
  }

  async deleteMaintenance(maintenanceIds: string[]): Promise<{ maintenanceids: string[] }> {
    return this.rpc<{ maintenanceids: string[] }>("maintenance.delete", maintenanceIds as unknown as Record<string, unknown>);
  }

  // Acknowledge events
  async acknowledgeEvents(eventIds: string[], message: string, action: number): Promise<{ eventids: string[] }> {
    return this.rpc<{ eventids: string[] }>("event.acknowledge", {
      eventids: eventIds,
      message,
      action,
    });
  }

  // Services (SLA)
  async getServices(parentId?: string): Promise<ZabbixService[]> {
    const params: Record<string, unknown> = {
      output: "extend",
    };
    if (parentId) params.parentids = parentId;
    return this.rpc<ZabbixService[]>("service.get", params);
  }

  async getSlas(): Promise<ZabbixSla[]> {
    return this.rpc<ZabbixSla[]>("sla.get", { output: "extend" });
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
    if (data.usrgrps) params.usrgrps = data.usrgrps.map((id) => ({ usrgrpid: id }));
    return this.rpc<{ userids: string[] }>("user.create", params);
  }

  async updateUser(userId: string, data: {
    username?: string;
    name?: string;
    surname?: string;
    roleid?: string;
    passwd?: string;
    usrgrps?: string[];
  }): Promise<{ userids: string[] }> {
    const params: Record<string, unknown> = { userid: userId };
    if (data.username !== undefined) params.username = data.username;
    if (data.name !== undefined) params.name = data.name;
    if (data.surname !== undefined) params.surname = data.surname;
    if (data.roleid !== undefined) params.roleid = data.roleid;
    if (data.passwd !== undefined) params.passwd = data.passwd;
    if (data.usrgrps !== undefined) params.usrgrps = data.usrgrps.map((id) => ({ usrgrpid: id }));
    return this.rpc<{ userids: string[] }>("user.update", params);
  }

  async deleteUser(userIds: string[]): Promise<{ userids: string[] }> {
    return this.rpc<{ userids: string[] }>("user.delete", userIds as unknown as Record<string, unknown>);
  }

  // User Groups
  async getUserGroups(): Promise<ZabbixUserGroup[]> {
    return this.rpc<ZabbixUserGroup[]>("usergroup.get", {
      output: "extend",
      selectUsers: ["userid", "username", "name", "surname"],
    });
  }

  async createUserGroup(name: string, permission?: { id: string; permission: number }): Promise<{ usrgrpids: string[] }> {
    const params: Record<string, unknown> = { name };
    if (permission) {
      params.rights = [{ id: permission.id, permission: permission.permission }];
    }
    return this.rpc<{ usrgrpids: string[] }>("usergroup.create", params);
  }

  async updateUserGroup(groupId: string, data: { name?: string; rights?: Array<{ id: string; permission: number }> }): Promise<{ usrgrpids: string[] }> {
    const params: Record<string, unknown> = { usrgrpid: groupId };
    if (data.name !== undefined) params.name = data.name;
    if (data.rights !== undefined) params.rights = data.rights;
    return this.rpc<{ usrgrpids: string[] }>("usergroup.update", params);
  }

  async deleteUserGroup(groupIds: string[]): Promise<{ usrgrpids: string[] }> {
    return this.rpc<{ usrgrpids: string[] }>("usergroup.delete", groupIds as unknown as Record<string, unknown>);
  }

  // Actions
  async getActions(): Promise<ZabbixAction[]> {
    return this.rpc<ZabbixAction[]>("action.get", {
      output: ["actionid", "name", "status", "eventsource"],
    });
  }

  // Discovery rules
  async getDiscoveryRules(): Promise<ZabbixDiscoveryRule[]> {
    return this.rpc<ZabbixDiscoveryRule[]>("discoveryrule.get", {
      output: ["ruleid", "name", "key_", "hostid", "status"],
    });
  }

  // Reports
  async getReports(): Promise<ZabbixReport[]> {
    return this.rpc<ZabbixReport[]>("report.get", {
      output: "extend",
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
