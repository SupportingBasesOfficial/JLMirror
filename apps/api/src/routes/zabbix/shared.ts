// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// Utilidades compartilhadas entre os módulos de rota do Zabbix

import { query } from "@repo/db";
import { cachedQuery, cacheDel, cacheGet, cacheSet } from "@repo/cache";
import { BlindedZabbixClient, decryptTokenParts } from "@repo/zabbix";
import { enqueueZabbixWrite } from "../../lib/zabbix-write-processor.js";

export interface ZabbixTenantConfig {
  zabbix_api_url: string;
  zabbix_encrypted_token: string;
  zabbix_token_iv: string;
  zabbix_token_tag: string;
  zabbix_host_group_id: string;
}

// Contexto do client Zabbix — inclui hostGroupId para isolamento IDOR
export interface ZabbixClientContext {
  client: BlindedZabbixClient;
  hostGroupId: string;
}

// Cache em memoria do token descriptografado (TTL 55s — menor que cache de config de 60s)
// Evita descriptografia AES-256-GCM em toda request
const tokenMemoryCache = new Map<
  string,
  { token: string; expiresAt: number }
>();
const TOKEN_CACHE_TTL_MS = 55_000;

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
  // Limpa tambem cache em memoria do token
  tokenMemoryCache.delete(tenantId);
}

// Descriptografa token com cache em memoria para evitar custo de AES-256-GCM em toda request
function getDecryptedToken(
  tenantId: string,
  config: ZabbixTenantConfig,
): string | null {
  const cached = tokenMemoryCache.get(tenantId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }

  const apiToken = decryptTokenParts(
    config.zabbix_encrypted_token,
    config.zabbix_token_iv,
    config.zabbix_token_tag,
  );

  if (apiToken) {
    tokenMemoryCache.set(tenantId, {
      token: apiToken,
      expiresAt: Date.now() + TOKEN_CACHE_TTL_MS,
    });
  }

  return apiToken;
}

// Cria instância do BlindedZabbixClient com config do tenant
// Retorna contexto com client + hostGroupId para isolamento IDOR
export async function createZabbixClient(
  tenantId: string,
): Promise<ZabbixClientContext | null> {
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

  const apiToken = getDecryptedToken(tenantId, config);

  if (!apiToken) {
    return null;
  }

  return {
    client: new BlindedZabbixClient({
      apiUrl: config.zabbix_api_url,
      apiToken,
    }),
    hostGroupId: config.zabbix_host_group_id,
  };
}

// Verifica se um hostId pertence ao host_group_id do tenant (protecao IDOR)
// Usa cache Redis (60s) para evitar chamada ao Zabbix em toda verificacao
export async function verifyHostOwnership(
  ctx: ZabbixClientContext,
  hostId: string,
): Promise<boolean> {
  const cacheKey = `zabbix:host_owner:${hostId}`;
  try {
    const cached = await cacheGet(cacheKey);
    if (cached !== null) {
      return cached === ctx.hostGroupId;
    }
  } catch {
    // Silencioso — continua para verificacao direta
  }

  try {
    const host = await ctx.client.getDevice(hostId);
    if (!host) return false;

    // Verifica se o host pertence ao grupo do tenant
    const groups = host.hostGroups ?? host.hostgroups ?? host.groups ?? [];
    const belongs = groups.some((g) => g.groupid === ctx.hostGroupId);

    // Cacheia resultado (mesmo negativo) por 60s
    try {
      await cacheSet(cacheKey, belongs ? ctx.hostGroupId : "none", 60);
    } catch {
      // Silencioso
    }

    return belongs;
  } catch {
    return false;
  }
}

// Verifica se multiplos hostIds pertencem ao tenant (batch)
export async function verifyHostsOwnership(
  ctx: ZabbixClientContext,
  hostIds: string[],
): Promise<boolean> {
  for (const hostId of hostIds) {
    const belongs = await verifyHostOwnership(ctx, hostId);
    if (!belongs) return false;
  }
  return true;
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
  if (lowerMsg.includes("circuit breaker")) {
    return {
      error: {
        code: "ZABBIX_CIRCUIT_OPEN",
        message: "Monitoramento temporariamente indisponível para este host",
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

// Resposta padrao de acesso negado (IDOR protection)
export function accessDeniedResponse() {
  return {
    error: {
      code: "ACCESS_DENIED",
      message: "Você não tem permissão para acessar este recurso",
    },
  };
}

// Ofusca campos sensíveis em dados do Zabbix antes de retornar ao frontend
// Campos: passwd, password, secret, value (em macros secretas), chaves de criptografia
export function redactSensitiveFields<T>(data: T): T {
  if (data === null || data === undefined) return data;

  if (Array.isArray(data)) {
    return data.map((item) => redactSensitiveFields(item)) as unknown as T;
  }

  if (typeof data === "object" && !Array.isArray(data)) {
    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(
      data as Record<string, unknown>,
    )) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey === "passwd" ||
        lowerKey === "password" ||
        lowerKey === "secret" ||
        lowerKey === "private_key" ||
        lowerKey === "encryption_key" ||
        lowerKey === "connection_string"
      ) {
        redacted[key] = "******";
      } else if (
        lowerKey === "value" &&
        (data as { type?: number }).type === 1
      ) {
        // Macro secreta (type=1) — ja ofuscada no client, mas garantimos aqui tambem
        redacted[key] = "******";
      } else {
        redacted[key] = redactSensitiveFields(value);
      }
    }
    return redacted as unknown as T;
  }

  return data;
}

// Enfileira um job de escrita no Zabbix e retorna o jobId
// As rotas usam isso para responder 202 Accepted imediatamente
// O worker processa em background e notifica via WebSocket quando conclui
export async function enqueueWriteJob(args: {
  tenantId: string;
  userId: string;
  operation: string;
  method: string;
  params: Record<string, unknown>;
}): Promise<string | undefined> {
  return enqueueZabbixWrite(args);
}
