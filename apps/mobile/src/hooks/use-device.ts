// Hook de device detalhe
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { apiRoutes, type Device } from "@/lib/api-routes";

export function useDevice(id: string) {
  return useQuery<Device>({
    queryKey: ["devices", "detail", id],
    queryFn: () => api.get(apiRoutes.devices.detail(id)),
    enabled: !!id,
  });
}
