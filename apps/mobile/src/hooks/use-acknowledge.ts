// Hook para acknowledge de eventos do Zabbix
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { apiRoutes } from "@/lib/api-routes";

interface AcknowledgeParams {
  eventids: string[];
  message?: string;
  action?: number;
}

export function useAcknowledge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: AcknowledgeParams) =>
      api.post(apiRoutes.zabbix.acknowledge, {
        eventids: params.eventids,
        message: params.message ?? "",
        action: params.action ?? 1,
      }),
    onSuccess: () => {
      // Invalida caches de triggers e problems
      queryClient.invalidateQueries({ queryKey: ["zabbix", "triggers"] });
      queryClient.invalidateQueries({ queryKey: ["zabbix", "problems"] });
    },
  });
}
