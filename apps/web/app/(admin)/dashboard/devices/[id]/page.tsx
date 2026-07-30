import { cookies } from "next/headers";
import { serverApiGetWithToken } from "@/lib/api-client";
import { DeviceDetailClient } from "@/components/device-detail-client";
import { StateDisplay } from "@/components/ui/state-display";
import type { ZabbixHost, ZabbixItem, ZabbixTrigger } from "@repo/zabbix";

interface ZabbixHostResponse {
  host: ZabbixHost;
}

interface ZabbixItemsResponse {
  items: ZabbixItem[];
}

interface ZabbixTriggersResponse {
  data: ZabbixTrigger[];
}

export default async function DeviceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: hostId } = await params;
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("access_token")?.value;
  const refreshToken = cookieStore.get("refresh_token")?.value;

  if (!accessToken) {
    return (
      <StateDisplay
        variant="warning"
        title="Não autenticado"
        message="Faça login para continuar."
      />
    );
  }

  const [hostResult, itemsResult, triggersResult] = await Promise.all([
    serverApiGetWithToken<ZabbixHostResponse>(`/api/v1/zabbix/devices/${hostId}`, accessToken, refreshToken),
    serverApiGetWithToken<ZabbixItemsResponse>(`/api/v1/zabbix/devices/${hostId}/items`, accessToken, refreshToken),
    serverApiGetWithToken<ZabbixTriggersResponse>(`/api/v1/zabbix/triggers?host_id=${hostId}`, accessToken, refreshToken),
  ]);

  if (hostResult.error || itemsResult.error) {
    return (
      <StateDisplay
        variant="error"
        title="Erro ao carregar dispositivo"
        message={hostResult.error?.message ?? itemsResult.error?.message}
      />
    );
  }

  const host = hostResult.data.host;
  const items = itemsResult.data.items;
  const triggers = triggersResult.data?.data ?? [];

  if (!host) {
    return (
      <StateDisplay
        variant="warning"
        title="Dispositivo não encontrado"
        message={`Host ID ${hostId} não encontrado no Zabbix.`}
      />
    );
  }

  return (
    <DeviceDetailClient
      items={items}
      hostId={host.hostid}
      hostName={host.name}
      hostIp={host.interfaces[0]?.ip ?? "N/A"}
      triggers={triggers}
    />
  );
}
