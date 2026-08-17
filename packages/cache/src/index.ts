// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import Redis from "ioredis";
import { query, getCurrentTenantId } from "@repo/db";

export {
  circuitCanCall,
  circuitOnSuccess,
  circuitOnFailure,
  circuitGetState,
} from "./circuit-breaker.js";

// Cliente Redis singleton para cache geral
let cacheClient: Redis | null = null;
// Cliente Redis dedicado para pub/sub — não pode compartilhar com cache
// pois entra em subscriber mode e bloqueia comandos normais (ping/get/set)
let pubsubClient: Redis | null = null;
let bullmqConnection: Redis | null = null;

// Cria ou reutiliza cliente Redis para cache geral
export function createCacheClient(): Redis {
  if (!cacheClient) {
    const url = process.env.REDIS_URL ?? "redis://localhost:6379";
    cacheClient = new Redis(url, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 200, 2000),
    });
  }
  return cacheClient;
}

// Conexao Redis dedicada para BullMQ — exige maxRetriesPerRequest: null
export function createBullMQConnection(): Redis {
  if (!bullmqConnection) {
    const url = process.env.REDIS_URL ?? "redis://localhost:6379";
    bullmqConnection = new Redis(url, {
      maxRetriesPerRequest: null,
      retryStrategy: (times) => Math.min(times * 200, 2000),
    });
  }
  return bullmqConnection;
}

// Cria ou reutiliza cliente Redis dedicado para pub/sub
// Separado do cacheClient pois subscribe/psubscribe colocam o cliente
// em subscriber mode, impedindo comandos normais (get/set/ping/publish)
function createPubSubClient(): Redis {
  if (!pubsubClient) {
    const url = process.env.REDIS_URL ?? "redis://localhost:6379";
    pubsubClient = new Redis(url, {
      maxRetriesPerRequest: null,
      retryStrategy: (times) => Math.min(times * 200, 2000),
    });
  }
  return pubsubClient;
}

// Fecha todas as conexoes Redis — usado no graceful shutdown
export async function closeCache(): Promise<void> {
  const promises: Promise<void>[] = [];
  if (cacheClient) {
    promises.push(
      cacheClient.quit().then(() => {
        cacheClient = null;
      }),
    );
  }
  if (pubsubClient) {
    promises.push(
      pubsubClient.quit().then(() => {
        pubsubClient = null;
      }),
    );
  }
  if (bullmqConnection) {
    promises.push(
      bullmqConnection.quit().then(() => {
        bullmqConnection = null;
      }),
    );
  }
  await Promise.all(promises);
}

/**
 * Resolve e isola a chave com o prefixo do tenant atual obtido do AsyncLocalStorage.
 * Chaves com o prefixo explicito "global:" ignoram esta isolação (ex: rate limit global).
 */
function resolveKey(key: string): string {
  if (key.startsWith("global:")) return key;
  const tenantId = getCurrentTenantId();
  return tenantId ? `tenant:${tenantId}:${key}` : `global:${key}`;
}

// Cache get/set para strings
export async function cacheGet(key: string): Promise<string | null> {
  try {
    const client = createCacheClient();
    return await client.get(resolveKey(key));
  } catch {
    return null;
  }
}

export async function cacheSet(
  key: string,
  value: string,
  ttlSeconds?: number,
): Promise<void> {
  try {
    const client = createCacheClient();
    const scopedKey = resolveKey(key);
    if (ttlSeconds) {
      await client.set(scopedKey, value, "EX", ttlSeconds);
    } else {
      await client.set(scopedKey, value);
    }
  } catch {
    // Silencioso — cache é best-effort
  }
}

// Incremento atomico com TTL fixo — para rate limiting
// Usa INCR + EXPIRE apenas na primeira chamada (quando retorna 1)
// Isso evita o bug de resetar o TTL a cada request, que faz o contador
// nunca expirar enquanto ha trafego continuo
export async function cacheIncr(
  key: string,
  ttlSeconds: number,
): Promise<number> {
  try {
    const client = createCacheClient();
    const scopedKey = resolveKey(key);
    // INCR é atomico no Redis — cria a key com valor 1 se nao existe
    const count = await client.incr(scopedKey);
    // So define TTL na primeira chamada (count === 1) para nao resetar a janela
    if (count === 1) {
      await client.expire(scopedKey, ttlSeconds);
    }
    return count;
  } catch {
    return 0;
  }
}

// Cache get/set para JSON
export async function cacheGetJSON<T>(key: string): Promise<T | null> {
  const raw = await cacheGet(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function cacheSetJSON(
  key: string,
  value: unknown,
  ttlSeconds?: number,
): Promise<void> {
  await cacheSet(key, JSON.stringify(value), ttlSeconds);
}

// Invalida chave de cache
export async function cacheDel(key: string): Promise<void> {
  try {
    const client = createCacheClient();
    await client.del(resolveKey(key));
  } catch {
    // Silencioso
  }
}

// Invalida todas as chaves que comecam com o prefixo (SCAN + DEL)
export async function cacheDelByPrefix(prefix: string): Promise<void> {
  try {
    const client = createCacheClient();
    const scopedPrefix = resolveKey(prefix);
    let cursor = "0";
    do {
      const [nextCursor, keys] = await client.scan(
        cursor,
        "MATCH",
        `${scopedPrefix}*`,
        "COUNT",
        100,
      );
      cursor = nextCursor;
      if (keys.length > 0) {
        await client.del(...keys);
      }
    } while (cursor !== "0");
  } catch {
    // Silencioso
  }
}

// Query com cache — busca do Redis primeiro, fallback para DB
export async function cachedQuery<T>(
  cacheKey: string,
  sqlOrFn: string | (() => Promise<T>),
  paramsOrTtl: unknown[] | number = 60,
  ttlSecondsOrTags?: number | string[],
): Promise<T> {
  // Sobrecarga: (cacheKey, asyncFn, ttlSeconds, tags?)
  if (typeof sqlOrFn === "function") {
    const ttl = typeof paramsOrTtl === "number" ? paramsOrTtl : 60;
    const cached = await cacheGetJSON<T>(cacheKey);
    if (cached) return cached;

    try {
      const data = await sqlOrFn();
      if (data !== null && data !== undefined) {
        await cacheSetJSON(cacheKey, data, ttl);
      }
      return data;
    } catch (err) {
      console.error(
        "[cachedQuery] Erro na fn:",
        cacheKey,
        err instanceof Error ? err.message : String(err),
      );
      return null as unknown as T;
    }
  }

  // Sobrecarga original: (cacheKey, sql, params, ttlSeconds)
  const sql = sqlOrFn;
  const params = paramsOrTtl as unknown[];
  const ttl = typeof ttlSecondsOrTags === "number" ? ttlSecondsOrTags : 60;

  const cached = await cacheGetJSON<T[]>(cacheKey);
  if (cached) {
    return { data: cached, error: null } as unknown as T;
  }

  const result = await query<
    T extends Record<string, unknown> ? T : Record<string, unknown>
  >(sql, params);
  if (result.error || !result.data) {
    return { data: null, error: result.error } as unknown as T;
  }

  await cacheSetJSON(cacheKey, result.data.rows, ttl);
  return { data: result.data.rows, error: null } as unknown as T;
}

// Pub/Sub para WebSocket realtime
export async function publish(channel: string, message: string): Promise<void> {
  try {
    const client = createCacheClient();
    await client.publish(resolveKey(channel), message);
  } catch {
    // Silencioso
  }
}

export async function subscribe(
  channel: string,
  handler: (message: string) => void,
): Promise<void> {
  try {
    const client = createPubSubClient();
    const scopedChannel = resolveKey(channel);
    await client.subscribe(scopedChannel);
    client.on("message", (_channel, message) => {
      if (_channel === scopedChannel) {
        handler(message);
      }
    });
  } catch {
    // Silencioso
  }
}

// Pattern subscription com PSUBSCRIBE para canais com wildcard
export async function psubscribe(
  pattern: string,
  handler: (channel: string, message: string) => void,
): Promise<void> {
  try {
    const client = createPubSubClient();
    const scopedPattern = resolveKey(pattern);
    await client.psubscribe(scopedPattern);
    client.on("pmessage", (_pattern, channel, message) => {
      if (_pattern === pattern) {
        handler(channel, message);
      }
    });
  } catch {
    // Silencioso
  }
}
