// Hooks para dados Zabbix de um device: host, items, history e triggers
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import {
  apiRoutes,
  type ZabbixHostResponse,
  type ZabbixItemsResponse,
  type ZabbixHistoryResponse,
  type ZabbixTriggersResponse,
} from "@/lib/api-routes";

/** Detalhe do host no Zabbix. */
export function useZabbixHost(hostId: string | null | undefined) {
  return useQuery<ZabbixHostResponse>({
    queryKey: ["zabbix", "host", hostId],
    queryFn: () => api.get(apiRoutes.zabbix.deviceDetail(hostId!)),
    enabled: !!hostId,
  });
}

/** Items (metricas) do host no Zabbix. */
export function useZabbixItems(hostId: string | null | undefined) {
  return useQuery<ZabbixItemsResponse>({
    queryKey: ["zabbix", "items", hostId],
    queryFn: () => api.get(apiRoutes.zabbix.deviceItems(hostId!)),
    enabled: !!hostId,
    refetchInterval: 30_000,
  });
}

/** History (serie temporal) de um item. */
export function useZabbixHistory(
  itemId: string | null | undefined,
  from?: number,
  to?: number,
  valueType?: number,
) {
  return useQuery<ZabbixHistoryResponse>({
    queryKey: ["zabbix", "history", itemId, from, to, valueType],
    queryFn: () =>
      api.get(apiRoutes.zabbix.history(itemId!, from, to, valueType)),
    enabled: !!itemId,
    refetchInterval: 60_000,
    refetchOnMount: false,
  });
}

/** Triggers ativos de um host. */
export function useZabbixHostTriggers(hostId: string | null | undefined) {
  return useQuery<ZabbixTriggersResponse>({
    queryKey: ["zabbix", "triggers", hostId],
    queryFn: () => api.get(apiRoutes.zabbix.triggers(hostId!)),
    enabled: !!hostId,
    refetchInterval: 15_000,
    select: (data) => ({
      data: (data.data ?? []).filter((t) => t.value === "1"),
    }),
  });
}
