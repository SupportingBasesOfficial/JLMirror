import Redis from "ioredis";
import { query } from "@repo/db";

// Cliente Redis singleton para cache geral
let cacheClient: Redis | null = null;
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

// Fecha todas as conexoes Redis — usado no graceful shutdown
export async function closeCache(): Promise<void> {
  const promises: Promise<void>[] = [];
  if (cacheClient) {
    promises.push(cacheClient.quit().then(() => { cacheClient = null; }));
  }
  if (bullmqConnection) {
    promises.push(bullmqConnection.quit().then(() => { bullmqConnection = null; }));
  }
  await Promise.all(promises);
}

// Cache get/set para strings
export async function cacheGet(key: string): Promise<string | null> {
  try {
    const client = createCacheClient();
    return await client.get(key);
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
    if (ttlSeconds) {
      await client.set(key, value, "EX", ttlSeconds);
    } else {
      await client.set(key, value);
    }
  } catch {
    // Silencioso — cache é best-effort
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
    await client.del(key);
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
      console.error("[cachedQuery] Erro na fn:", cacheKey, err instanceof Error ? err.message : String(err));
      return null as T;
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

  const result = await query<T>(sql, params);
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
    await client.publish(channel, message);
  } catch {
    // Silencioso
  }
}

export async function subscribe(
  channel: string,
  handler: (message: string) => void,
): Promise<void> {
  try {
    const client = createCacheClient();
    await client.subscribe(channel);
    client.on("message", (_channel, message) => {
      if (_channel === channel) {
        handler(message);
      }
    });
  } catch {
    // Silencioso
  }
}
