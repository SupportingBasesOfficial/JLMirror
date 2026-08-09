// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
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

// Valida formato de hostId — Zabbix usa IDs numericos como strings
// Rejeita caracteres nao-numericos para evitar injecao na URL
function isValidHostId(id: string): boolean {
  if (!id || id.length === 0 || id.length > 50) return false;
  return /^\d+$/.test(id);
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

  // Validacao de hostId — evita 500 com IDs invalidos
  if (!isValidHostId(hostId)) {
    return (
      <StateDisplay
        variant="warning"
        title="ID inválido"
        message="O ID do dispositivo deve ser numérico."
      />
    );
  }

  const [hostResult, itemsResult, triggersResult] = await Promise.all([
    serverApiGetWithToken<ZabbixHostResponse>(
      `/api/v1/zabbix/devices/${hostId}`,
      accessToken,
      refreshToken,
    ),
    serverApiGetWithToken<ZabbixItemsResponse>(
      `/api/v1/zabbix/devices/${hostId}/items`,
      accessToken,
      refreshToken,
    ),
    serverApiGetWithToken<ZabbixTriggersResponse>(
      `/api/v1/zabbix/triggers?host_id=${hostId}`,
      accessToken,
      refreshToken,
    ),
  ]);

  // Trata erros especificos
  if (hostResult.error) {
    const errorCode = hostResult.error.code;
    if (errorCode === "ACCESS_DENIED") {
      return (
        <StateDisplay
          variant="error"
          title="Acesso negado"
          message="Você não tem permissão para acessar este dispositivo."
        />
      );
    }
    if (errorCode === "DEVICE_NOT_FOUND") {
      return (
        <StateDisplay
          variant="warning"
          title="Dispositivo não encontrado"
          message={`Host ID ${hostId} não encontrado no Zabbix.`}
        />
      );
    }
    if (errorCode === "ZABBIX_API_ERROR") {
      return (
        <StateDisplay
          variant="error"
          title="Zabbix indisponível"
          message="Não foi possível conectar ao servidor Zabbix."
        />
      );
    }
    return (
      <StateDisplay
        variant="error"
        title="Erro ao carregar dispositivo"
        message={hostResult.error.message}
      />
    );
  }

  if (itemsResult.error) {
    // Host carregou mas items falharam — mostra host com aviso
    return (
      <StateDisplay
        variant="warning"
        title="Métricas indisponíveis"
        message="O dispositivo foi encontrado, mas não foi possível carregar suas métricas. Tente novamente."
      />
    );
  }

  const host = hostResult.data?.host;
  const items = itemsResult.data?.items ?? [];
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
      hostIp={host.interfaces?.[0]?.ip ?? "N/A"}
      triggers={triggers}
    />
  );
}
