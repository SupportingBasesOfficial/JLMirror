// Hook de lista de devices do Zabbix com triggers e metricas CPU agregadas
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import {
  apiRoutes,
  type ZabbixDevicesListResponse,
  type ZabbixTriggersResponse,
  type ZabbixItemsResponse,
  type ZabbixHost,
  type ZabbixTrigger,
} from "@/lib/api-routes";

export interface DeviceWithMetrics {
  host: ZabbixHost;
  triggers: ZabbixTrigger[];
  cpuPercent: number | undefined;
  memPercent: number | undefined;
  uptime: number | undefined;
  netInBps: number | undefined;
  netOutBps: number | undefined;
  netSpeedBps: number | undefined;
}

interface ZabbixDevicesWithMetricsResponse {
  devices: DeviceWithMetrics[];
}

/** Busca devices do Zabbix + triggers ativos + items (CPU/mem) em paralelo. */
export function useZabbixDevices() {
  return useQuery<ZabbixDevicesWithMetricsResponse>({
    queryKey: ["zabbix", "devices", "with-metrics"],
    queryFn: async () => {
      const [devsRes, triggersRes] = await Promise.all([
        api.get<ZabbixDevicesListResponse>(apiRoutes.zabbix.devices),
        api.get<ZabbixTriggersResponse>(apiRoutes.zabbix.triggers()),
      ]);

      const hosts = devsRes.devices ?? [];
      const activeTriggers = (triggersRes.data ?? []).filter(
        (t) => t.value === "1",
      );

      // Agrupa triggers por hostid
      const triggersByHost: Record<string, ZabbixTrigger[]> = {};
      for (const t of activeTriggers) {
        for (const h of t.hosts ?? []) {
          if (!triggersByHost[h.hostid]) triggersByHost[h.hostid] = [];
          triggersByHost[h.hostid]!.push(t);
        }
      }

      // Busca items (CPU/mem) para todos os hosts em batch
      // Primeiro tenta history-batch para ultimos valores
      // Se nao funcionar, faz por host (limitado para performance)
      const devices: DeviceWithMetrics[] = hosts.map((host) => {
        const hostTriggers = triggersByHost[host.hostid] ?? [];
        return {
          host,
          triggers: hostTriggers,
          cpuPercent: undefined,
          memPercent: undefined,
          uptime: undefined,
          netInBps: undefined,
          netOutBps: undefined,
          netSpeedBps: undefined,
        };
      });

      // Busca items para os primeiros 20 hosts (evita N+1)
      const hostsToFetch = hosts.slice(0, 20);
      const itemPromises = hostsToFetch.map((h) =>
        api
          .get<ZabbixItemsResponse>(apiRoutes.zabbix.deviceItems(h.hostid))
          .then((res) => ({ hostid: h.hostid, items: res.items ?? [] }))
          .catch(() => ({ hostid: h.hostid, items: [] })),
      );
      const itemsResults = await Promise.all(itemPromises);

      for (const { hostid, items } of itemsResults) {
        const dev = devices.find((d) => d.host.hostid === hostid);
        if (!dev) continue;
        // CPU util
        const cpuItem = items.find((i) => i.key_ === "system.cpu.util");
        if (cpuItem?.lastvalue) {
          const v = Number.parseFloat(cpuItem.lastvalue);
          if (!Number.isNaN(v)) dev.cpuPercent = v;
        }
        // Memory util
        const memItem = items.find(
          (i) =>
            i.key_ === "vm.memory.util" || i.key_ === "vm.memory.utilization",
        );
        if (memItem?.lastvalue) {
          const v = Number.parseFloat(memItem.lastvalue);
          if (!Number.isNaN(v)) dev.memPercent = v;
        }
        // Uptime
        const uptimeItem = items.find((i) => i.key_ === "system.uptime");
        if (uptimeItem?.lastvalue) {
          const v = Number.parseFloat(uptimeItem.lastvalue);
          if (!Number.isNaN(v)) dev.uptime = v;
        }
        // Network in (bps) — pega o maior valor entre interfaces
        for (const item of items) {
          if (item.key_.includes("net.if.in") && item.units === "bps") {
            const v = Number.parseFloat(item.lastvalue ?? "");
            if (!Number.isNaN(v) && v > (dev.netInBps ?? 0)) dev.netInBps = v;
          }
          if (item.key_.includes("net.if.out") && item.units === "bps") {
            const v = Number.parseFloat(item.lastvalue ?? "");
            if (!Number.isNaN(v) && v > (dev.netOutBps ?? 0)) dev.netOutBps = v;
          }
          if (item.key_.includes("net.if.speed")) {
            const v = Number.parseFloat(item.lastvalue ?? "");
            if (!Number.isNaN(v) && v > (dev.netSpeedBps ?? 0))
              dev.netSpeedBps = v;
          }
        }
      }

      return { devices };
    },
    refetchInterval: 30_000,
  });
}
