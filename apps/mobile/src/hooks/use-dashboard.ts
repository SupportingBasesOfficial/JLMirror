// @ai-context: .zero-error/architecture-map.md#ingress
// Hook de dashboard — TanStack Query com auto-refresh a cada 30s.
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { apiRoutes, type DashboardOverviewResponse } from "@/lib/api-routes";

export function useDashboard() {
  return useQuery<DashboardOverviewResponse>({
    queryKey: ["dashboard", "overview"],
    queryFn: () => api.get(apiRoutes.dashboard.overview),
    refetchInterval: 30_000,
  });
}
