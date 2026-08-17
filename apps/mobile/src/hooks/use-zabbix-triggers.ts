// Hook de triggers do Zabbix (fonte primaria de alertas ativos)
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { apiRoutes, type ZabbixTriggersResponse } from "@/lib/api-routes";

// Intervalo de auto-refresh (paridade com web: 30s)
const AUTO_REFRESH_INTERVAL = 30_000;
// Intervalo padrao (backward-compat para consumers que nao optam em autoRefresh)
const DEFAULT_REFRESH_INTERVAL = 15_000;

interface UseZabbixTriggersParams {
  hostId?: string;
  /** Filtrar apenas triggers em estado PROBLEM (value === "1") */
  onlyActive?: boolean;
  /**
   * Auto-refresh a cada 30s quando ativado.
   * - true  -> refetch a cada 30s
   * - false -> sem auto-refresh
   * - undefined -> comportamento padrao (15s, backward-compat)
   */
  autoRefresh?: boolean;
}

export function useZabbixTriggers(params: UseZabbixTriggersParams = {}) {
  const { hostId, onlyActive = true, autoRefresh } = params;
  const url = apiRoutes.zabbix.triggers(hostId);

  // Calcula refetchInterval conforme autoRefresh:
  // undefined preserva comportamento anterior (15s) para nao quebrar index.tsx
  const refetchInterval =
    autoRefresh === undefined
      ? DEFAULT_REFRESH_INTERVAL
      : autoRefresh
        ? AUTO_REFRESH_INTERVAL
        : false;

  return useQuery<ZabbixTriggersResponse>({
    queryKey: ["zabbix", "triggers", hostId, onlyActive, autoRefresh],
    queryFn: () => api.get(url),
    refetchInterval,
    select: (data) => {
      if (!onlyActive) return data;
      // Filtra apenas triggers em estado PROBLEM (value === "1")
      const filtered = (data.data ?? []).filter((t) => t.value === "1");
      return { data: filtered };
    },
  });
}
