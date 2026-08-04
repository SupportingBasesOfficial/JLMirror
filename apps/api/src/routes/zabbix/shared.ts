// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// Utilidades compartilhadas entre os módulos de rota do Zabbix

import { query } from "@repo/db";
import { cachedQuery, cacheDel } from "@repo/cache";
import { BlindedZabbixClient, decryptTokenParts } from "@repo/zabbix";

export interface ZabbixTenantConfig {
  zabbix_api_url: string;
  zabbix_encrypted_token: string;
  zabbix_token_iv: string;
  zabbix_token_tag: string;
  zabbix_host_group_id: string;
}

// Busca config do Zabbix do tenant com cache Redis (60s)
export async function getTenantZabbixConfig(
  tenantId: string,
): Promise<ZabbixTenantConfig | null> {
  const cacheKey = `zabbix:config:${tenantId}`;
  return cachedQuery<ZabbixTenantConfig | null>(
    cacheKey,
    async () => {
      const configResult = await query<ZabbixTenantConfig>(
        "SELECT * FROM public.get_tenant_zabbix_config($1)",
        [tenantId],
      );

      if (configResult.error || !configResult.data?.rows[0]) {
        return null;
      }

      const config = configResult.data.rows[0];

      if (
        !config.zabbix_encrypted_token ||
        !config.zabbix_token_iv ||
        !config.zabbix_token_tag
      ) {
        return null;
      }

      return {
        zabbix_api_url: config.zabbix_api_url,
        zabbix_encrypted_token: config.zabbix_encrypted_token,
        zabbix_token_iv: config.zabbix_token_iv,
        zabbix_token_tag: config.zabbix_token_tag,
        zabbix_host_group_id: config.zabbix_host_group_id,
      };
    },
    60,
    [`tenant:${tenantId}`],
  );
}

// Invalida cache de config Zabbix do tenant
export async function invalidateZabbixConfigCache(
  tenantId: string,
): Promise<void> {
  await cacheDel(`zabbix:config:${tenantId}`);
}

// Cria instância do BlindedZabbixClient com config do tenant
export async function createZabbixClient(
  tenantId: string,
): Promise<BlindedZabbixClient | null> {
  const config = await getTenantZabbixConfig(tenantId);

  if (!config) {
    return null;
  }

  if (
    !config.zabbix_encrypted_token ||
    !config.zabbix_token_iv ||
    !config.zabbix_token_tag
  ) {
    return null;
  }

  const apiToken = decryptTokenParts(
    config.zabbix_encrypted_token,
    config.zabbix_token_iv,
    config.zabbix_token_tag,
  );

  if (!apiToken) {
    return null;
  }

  return new BlindedZabbixClient({
    apiUrl: config.zabbix_api_url,
    apiToken,
  });
}

// Helper para classificar erros da API Zabbix
export function zabbixErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Erro desconhecido";
  const lowerMsg = message.toLowerCase();

  if (
    lowerMsg.includes("timeout") ||
    lowerMsg.includes("etimedout") ||
    lowerMsg.includes("aborted")
  ) {
    return {
      error: {
        code: "ZABBIX_TIMEOUT",
        message: "Timeout na comunicação com Zabbix",
      },
    };
  }
  if (
    lowerMsg.includes("econnrefused") ||
    lowerMsg.includes("enotfound") ||
    lowerMsg.includes("econnreset")
  ) {
    return {
      error: {
        code: "ZABBIX_UNREACHABLE",
        message: "Servidor Zabbix indisponível",
      },
    };
  }
  if (
    lowerMsg.includes("unauthorized") ||
    lowerMsg.includes("forbidden") ||
    lowerMsg.includes("403")
  ) {
    return {
      error: {
        code: "ZABBIX_AUTH_ERROR",
        message: "Token Zabbix inválido ou sem permissão",
      },
    };
  }
  return { error: { code: "ZABBIX_API_ERROR", message } };
}

// Resposta padrão de config não encontrada
export function configNotFoundResponse() {
  return {
    error: {
      code: "ZABBIX_CONFIG_NOT_FOUND",
      message: "Configuração Zabbix não encontrada para o tenant",
    },
  };
}

// Resposta padrão de erro de validação
export function validationErrorResponse(details: unknown) {
  return {
    error: {
      code: "VALIDATION_ERROR",
      message: "Dados inválidos",
      details,
    },
  };
}
