// Hook de stats de tickets (SLA, overdue, totais por status/prioridade)
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { apiRoutes, type TicketStats } from "@/lib/api-routes";

export function useTicketStats() {
  return useQuery<TicketStats>({
    queryKey: ["tickets", "stats"],
    queryFn: () => api.get(apiRoutes.tickets.stats),
    refetchInterval: 60_000,
  });
}
