// Hook de ticket detalhe com comentarios
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { apiRoutes, type TicketDetailResponse } from "@/lib/api-routes";

export function useTicket(id: string) {
  return useQuery<TicketDetailResponse>({
    queryKey: ["tickets", "detail", id],
    queryFn: () => api.get(apiRoutes.tickets.detail(id)),
    enabled: !!id,
  });
}
