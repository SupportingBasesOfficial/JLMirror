// Hook de devices — lista com busca em cache local
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { apiRoutes, type DevicesListResponse } from "@/lib/api-routes";

export function useDevices() {
  return useQuery<DevicesListResponse>({
    queryKey: ["devices", "list"],
    queryFn: () => api.get(apiRoutes.devices.list),
    staleTime: 60_000,
  });
}
