import { cookies } from "next/headers";
import { serverApiGetWithToken } from "@/lib/api-client";
import { DeviceGrid } from "@/components/device-grid";
import { DeviceSearch } from "@/components/device-search";
import { StateDisplay } from "@/components/ui/state-display";
import { StatusBadge } from "@/components/ui/status-badge";
import { Folder } from "lucide-react";
import type { ZabbixHost, ZabbixItem, ZabbixTrigger } from "@repo/zabbix";

async function getZabbixDevices(accessToken: string, refreshToken?: string) {
  const result = await serverApiGetWithToken<{ devices: ZabbixHost[] }>(
    "/api/v1/zabbix/devices",
    accessToken,
    refreshToken,
  );
  return result;
}

async function getZabbixTriggers(accessToken: string, refreshToken?: string) {
  const result = await serverApiGetWithToken<{ data: ZabbixTrigger[] }>(
    "/api/v1/zabbix/triggers",
    accessToken,
    refreshToken,
  );
  return result;
}

async function getDeviceItems(accessToken: string, refreshToken: string | undefined, hostId: string) {
  const result = await serverApiGetWithToken<{ items: ZabbixItem[] }>(
    `/api/v1/zabbix/devices/${hostId}/items`,
    accessToken,
    refreshToken,
  );
  return result;
}

export default async function DevicesPage() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("access_token")?.value;
  const refreshToken = cookieStore.get("refresh_token")?.value;

  if (!accessToken) {
    return (
      <StateDisplay
        variant="warning"
        title="Não autenticado"
        message="Faça login para continuar."
      />
    );
  }

  const devicesResult = await getZabbixDevices(accessToken, refreshToken);
  const devices = devicesResult.data?.devices ?? [];

  const [triggersResult, ...itemsResults] = await Promise.all([
    getZabbixTriggers(accessToken, refreshToken),
    ...devices.map((d) => getDeviceItems(accessToken, refreshToken, d.hostid)),
  ]);

  const triggers = triggersResult.data?.data ?? [];
  const onlineDevices = devices.filter((d) => d.status === "0");
  const offlineDevices = devices.filter((d) => d.status !== "0");

  // Agrupa triggers por hostid
  const triggersByHost: Record<string, ZabbixTrigger[]> = {};
  for (const t of triggers) {
    for (const h of t.hosts ?? []) {
      if (!triggersByHost[h.hostid]) triggersByHost[h.hostid] = [];
      triggersByHost[h.hostid].push(t);
    }
  }

  // Mapeia CPU e rede por hostid
  const cpuByHost = new Map<string, number>();
  const netInByHost = new Map<string, number>();
  const netOutByHost = new Map<string, number>();
  const netSpeedByHost = new Map<string, number>();
  const deviceItems = devices.map((d) => ({ hostid: d.hostid, items: [] as ZabbixItem[] }));
  for (const result of itemsResults) {
    const items = result?.data?.items ?? [];
    for (const item of items) {
      const match = deviceItems.find((d) => d.hostid === item.hostid);
      if (match) match.items.push(item);
    }
  }
  for (const { hostid, items } of deviceItems) {
    for (const item of items) {
      if (item.key_.includes("system.cpu.util")) {
        cpuByHost.set(hostid, parseFloat(item.lastvalue));
      }
      if (item.key_.includes("net.if.in") && item.units === "bps") {
        const val = parseFloat(item.lastvalue);
        const current = netInByHost.get(hostid) ?? 0;
        if (val > current) netInByHost.set(hostid, val);
      }
      if (item.key_.includes("net.if.out") && item.units === "bps") {
        const val = parseFloat(item.lastvalue);
        const current = netOutByHost.get(hostid) ?? 0;
        if (val > current) netOutByHost.set(hostid, val);
      }
      if (item.key_.includes("net.if.speed")) {
        const val = parseFloat(item.lastvalue);
        const current = netSpeedByHost.get(hostid) ?? 0;
        if (val > current) netSpeedByHost.set(hostid, val);
      }
    }
  }

  // Agrupa dispositivos por grupo do Zabbix (suporta Zabbix 5.x com groups e 6.x+ com host_groups)
  const devicesByGroup: Record<string, { groupName: string; devices: ZabbixHost[] }> = {};
  for (const d of devices) {
    const groups = d.groups ?? d.hostgroups ?? [];
    if (groups.length === 0) {
      const key = "__sem_grupo";
      if (!devicesByGroup[key]) devicesByGroup[key] = { groupName: "Sem categoria", devices: [] };
      devicesByGroup[key].devices.push(d);
    } else {
      for (const g of groups) {
        if (!devicesByGroup[g.groupid]) devicesByGroup[g.groupid] = { groupName: g.name, devices: [] };
        devicesByGroup[g.groupid].devices.push(d);
      }
    }
  }

  const groupEntries = Object.entries(devicesByGroup).sort((a, b) => a[1].groupName.localeCompare(b[1].groupName));

  return (
    <div className="space-y-5" style={{ animation: "fadeIn 0.3s ease-out" }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
          Dispositivos
        </h1>
        <div className="flex items-center gap-3">
          <StatusBadge variant="ok" dot>{onlineDevices.length} online</StatusBadge>
          <StatusBadge variant="error" dot>{offlineDevices.length} offline</StatusBadge>
          <StatusBadge variant="info" dot>{devices.length} total</StatusBadge>
        </div>
      </div>

      {/* Busca rapida */}
      <DeviceSearch
        devices={devices}
        triggersByHost={Object.fromEntries(
          Object.entries(triggersByHost).map(([hostid, trigs]) => [
            hostid,
            trigs.map((t) => ({ description: t.description, priority: t.priority })),
          ])
        )}
      />

      {/* Dispositivos agrupados por tipo/categoria */}
      {groupEntries.length > 0 && (
        <div className="space-y-5">
          {groupEntries.map(([groupId, { groupName, devices: groupDevices }]) => {
            const groupOnline = groupDevices.filter((d) => d.status === "0").length;
            const groupOffline = groupDevices.length - groupOnline;
            return (
              <div key={groupId}>
                <div className="flex items-center gap-2 mb-3">
                  <Folder size={16} className="shrink-0" style={{ color: "var(--brand-primary)" }} />
                  <span className="text-sm font-semibold" style={{ color: "var(--brand-primary)" }}>{groupName}</span>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    ({groupDevices.length} · {groupOnline} online · {groupOffline} offline)
                  </span>
                </div>
                <DeviceGrid
                  devices={groupDevices}
                  triggersByHost={triggersByHost}
                  cpuByHost={cpuByHost}
                  netInByHost={netInByHost}
                  netOutByHost={netOutByHost}
                  netSpeedByHost={netSpeedByHost}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {devices.length === 0 && (
        <StateDisplay
          variant="empty"
          title="Nenhum dispositivo monitorado"
          message="Verifique a conexão com o Zabbix ou cadastre hosts no servidor."
        />
      )}
    </div>
  );
}
