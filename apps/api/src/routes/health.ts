import { Hono } from "hono";
import { query } from "@repo/db";
import { cacheGet, createCacheClient } from "@repo/cache";

export const healthRoute = new Hono();

interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  checks: {
    db: { status: "connected" | "disconnected"; latencyMs?: number; error?: string };
    redis: { status: "connected" | "disconnected"; latencyMs?: number; error?: string };
    zabbix: { status: "configured" | "not_configured"; url?: string };
    queues: { status: "connected" | "disconnected"; activeJobs?: number; error?: string };
    pubsub: { status: "connected" | "disconnected"; error?: string };
  };
  timestamp: string;
  uptime: number;
}

async function checkDb(): Promise<{ status: "connected" | "disconnected"; latencyMs?: number; error?: string }> {
  const start = Date.now();
  const result = await query("SELECT 1 as ok");
  const latencyMs = Date.now() - start;
  if (result.error) {
    return { status: "disconnected", error: result.error.message };
  }
  return { status: "connected", latencyMs };
}

async function checkRedis(): Promise<{ status: "connected" | "disconnected"; latencyMs?: number; error?: string }> {
  try {
    const start = Date.now();
    await cacheGet("__health_check__");
    const latencyMs = Date.now() - start;
    return { status: "connected", latencyMs };
  } catch (error) {
    return { status: "disconnected", error: error instanceof Error ? error.message : "Unknown error" };
  }
}

function checkZabbix(): { status: "configured" | "not_configured"; url?: string } {
  const url = process.env.ZABBIX_API_URL;
  if (url) {
    return { status: "configured", url };
  }
  return { status: "not_configured" };
}

// Verifica saúde das filas BullMQ — testa conectividade Redis com comando PING via BullMQ
async function checkQueues(): Promise<{ status: "connected" | "disconnected"; activeJobs?: number; error?: string }> {
  try {
    const redis = createCacheClient();
    const pong = await redis.ping();

    // Conta jobs ativos nas filas principais
    let activeJobs = 0;
    for (const queueName of ["task-scheduler", "alerting-engine", "device-sync", "partition-manager"]) {
      const count = await redis.llen(`bull:${queueName}:active`);
      activeJobs += typeof count === "number" ? count : parseInt(String(count), 10) || 0;
    }

    if (pong === "PONG") {
      return { status: "connected", activeJobs };
    }
    return { status: "disconnected", error: "Redis PING falhou" };
  } catch (error) {
    return { status: "disconnected", error: error instanceof Error ? error.message : "Unknown error" };
  }
}

// Verifica Redis Pub/Sub — publica uma mensagem de teste no canal de health
async function checkPubSub(): Promise<{ status: "connected" | "disconnected"; error?: string }> {
  try {
    const redis = createCacheClient();
    await redis.publish("health:check", JSON.stringify({ ts: Date.now() }));
    return { status: "connected" };
  } catch (error) {
    return { status: "disconnected", error: error instanceof Error ? error.message : "Unknown error" };
  }
}

healthRoute.get("/", async (c) => {
  const [dbCheck, redisCheck, queuesCheck, pubsubCheck] = await Promise.all([
    checkDb(),
    checkRedis(),
    checkQueues(),
    checkPubSub(),
  ]);
  const zabbixCheck = checkZabbix();

  const allHealthy = dbCheck.status === "connected" && redisCheck.status === "connected" && queuesCheck.status === "connected";
  const anyDegraded = dbCheck.status === "disconnected" || redisCheck.status === "disconnected" || queuesCheck.status === "disconnected";

  const status: HealthStatus = {
    status: allHealthy ? "healthy" : anyDegraded ? "degraded" : "unhealthy",
    checks: {
      db: dbCheck,
      redis: redisCheck,
      zabbix: zabbixCheck,
      queues: queuesCheck,
      pubsub: pubsubCheck,
    },
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  };

  const httpStatus = status.status === "healthy" ? 200 : status.status === "degraded" ? 200 : 503;
  return c.json(status, httpStatus);
});

healthRoute.get("/live", (c) => {
  return c.json({ status: "alive", timestamp: new Date().toISOString() });
});

healthRoute.get("/ready", async (c) => {
  const dbCheck = await checkDb();
  if (dbCheck.status !== "connected") {
    return c.json({ status: "not_ready", db: dbCheck.status }, 503);
  }
  return c.json({ status: "ready", timestamp: new Date().toISOString() });
});
