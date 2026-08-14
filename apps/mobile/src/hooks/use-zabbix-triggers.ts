// Hook de triggers do Zabbix (fonte primaria de alertas ativos)
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { apiRoutes, type ZabbixTriggersResponse } from "@/lib/api-routes";

interface UseZabbixTriggersParams {
  hostId?: string;
  /** Filtrar apenas triggers em estado PROBLEM (value === "1") */
  onlyActive?: boolean;
}

export function useZabbixTriggers(params: UseZabbixTriggersParams = {}) {
  const { hostId, onlyActive = true } = params;
  const url = apiRoutes.zabbix.triggers(hostId);

  return useQuery<ZabbixTriggersResponse>({
    queryKey: ["zabbix", "triggers", hostId, onlyActive],
    queryFn: () => api.get(url),
    refetchInterval: 15_000,
    select: (data) => {
      if (!onlyActive) return data;
      // Filtra apenas triggers em estado PROBLEM (value === "1")
      const filtered = (data.data ?? []).filter((t) => t.value === "1");
      return { data: filtered };
    },
  });
}
