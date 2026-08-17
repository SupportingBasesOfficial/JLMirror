// Hook de tickets — lista paginada com filtros
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import {
  apiRoutes,
  type PaginatedResponse,
  type Ticket,
} from "@/lib/api-routes";

interface UseTicketsParams {
  status?: string;
  priority?: string;
  search?: string;
  overdue?: boolean;
  page?: number;
  limit?: number;
}

export function useTickets(params: UseTicketsParams = {}) {
  const { status, priority, search, overdue, page = 1, limit = 20 } = params;

  const queryParams = new URLSearchParams();
  if (status) queryParams.set("status", status);
  if (priority) queryParams.set("priority", priority);
  if (search) queryParams.set("search", search);
  if (overdue) queryParams.set("overdue", "true");
  queryParams.set("page", String(page));
  queryParams.set("limit", String(limit));

  const url = `${apiRoutes.tickets.list}?${queryParams.toString()}`;

  return useQuery<PaginatedResponse<Ticket>>({
    queryKey: [
      "tickets",
      "list",
      status,
      priority,
      search,
      overdue,
      page,
      limit,
    ],
    queryFn: () => api.get(url),
    staleTime: 15_000,
  });
}
