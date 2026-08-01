// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { verifyToken } from "@repo/auth";
import { publish, psubscribe } from "@repo/cache";
import type { Server } from "http";
import { WebSocketServer, WebSocket } from "ws";

// WebSocket para notificações em tempo real
// O cliente conecta via ws://localhost:3001/ws?token=<access_token>
//
// Arquitetura distribuída: cada instância da API mantém apenas as conexões
// TCP locais. Notificações são publicadas em canais Redis Pub/Sub. Todas as
// instâncias subscrevem os canais via PSUBSCRIBE e a que retém a conexão TCP
// entrega o frame. Não há double delivery — toda entrega passa pelo Redis.

// Mapa de conexões ativas LOCAIS: tenantId:userId -> Set<WebSocket>
const localConnections = new Map<string, Set<WebSocket>>();

// Canais Redis para pub/sub de notificações
const CHANNEL_TENANT_PREFIX = "ws:tenant:";
const CHANNEL_USER_PREFIX = "ws:user:";

let redisSubscribed = false;

export function setupWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server, path: "/ws" });

  // Subscreve canais Redis uma única vez por instância via PSUBSCRIBE (pattern matching)
  if (!redisSubscribed) {
    psubscribe(CHANNEL_TENANT_PREFIX + "*", (_channel, message) => handleRedisMessage(message));
    psubscribe(CHANNEL_USER_PREFIX + "*", (_channel, message) => handleRedisMessage(message));
    redisSubscribed = true;
    console.warn("[ws] Redis Pub/Sub subscreveu canais de notificação (PSUBSCRIBE)");
  }

  wss.on("connection", (ws: WebSocket, req) => {
    const url = new URL(req.url ?? "", "http://localhost");
    const token = url.searchParams.get("token");

    if (!token) {
      ws.send(JSON.stringify({ error: "Token não fornecido" }));
      ws.close(4001);
      return;
    }

    let userId: string;
    let tenantId: string;

    try {
      const payload = verifyToken(token);
      if (payload.type !== "access") {
        ws.send(JSON.stringify({ error: "Tipo de token inválido" }));
        ws.close(4001);
        return;
      }
      userId = payload.sub;
      tenantId = payload.tenant_id;
    } catch {
      ws.send(JSON.stringify({ error: "Token inválido" }));
      ws.close(4001);
      return;
    }

    const key = `${tenantId}:${userId}`;
    if (!localConnections.has(key)) {
      localConnections.set(key, new Set());
    }
    localConnections.get(key)!.add(ws);

    ws.send(JSON.stringify({ type: "connected", user_id: userId, tenant_id: tenantId }));

    ws.on("message", async (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
        } else if (msg.type === "mark_read") {
          await query(
            "UPDATE public.notification_log SET status = 'read' WHERE id = $1 AND tenant_id = $2",
            [msg.notification_id, tenantId],
          );
          ws.send(JSON.stringify({ type: "marked_read", notification_id: msg.notification_id }));
        }
      } catch {
        // Ignora mensagens inválidas
      }
    });

    const cleanup = () => {
      const conns = localConnections.get(key);
      if (conns) {
        conns.delete(ws);
        if (conns.size === 0) {
          localConnections.delete(key);
        }
      }
    };

    ws.on("close", cleanup);
    ws.on("error", cleanup);
  });
}

// Recebe mensagem do Redis Pub/Sub e entrega localmente aos WebSockets conectados
function handleRedisMessage(message: string): void {
  try {
    const envelope = JSON.parse(message) as {
      channel: string;
      targetKey: string;
      payload: string;
    };

    const conns = localConnections.get(envelope.targetKey);
    if (conns) {
      for (const ws of conns) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(envelope.payload);
        }
      }
    }
  } catch {
    // Ignora mensagens malformadas
  }
}

// Envia notificação push para um usuário específico via Redis Pub/Sub
// A instancia que retém a conexão TCP entrega o frame via PSUBSCRIBE handler
export async function pushNotificationToUser(tenantId: string, userId: string, notification: Record<string, unknown>): Promise<void> {
  const targetKey = `${tenantId}:${userId}`;
  const payload = JSON.stringify({ type: "notification", ...notification });
  const envelope = JSON.stringify({
    channel: "user",
    targetKey,
    payload,
  });
  await publish(CHANNEL_USER_PREFIX + targetKey, envelope);
}

// Envia notificação broadcast para todos os usuários de um tenant via Redis Pub/Sub
// A instancia que retém as conexões TCP entrega os frames via PSUBSCRIBE handler
export async function pushNotificationToTenant(tenantId: string, notification: Record<string, unknown>): Promise<void> {
  const payload = JSON.stringify({ type: "notification", ...notification });
  const envelope = JSON.stringify({
    channel: "tenant",
    targetKey: tenantId,
    payload,
  });
  await publish(CHANNEL_TENANT_PREFIX + tenantId, envelope);
}

// Route Hono para health check do WebSocket
export const wsRoute = new Hono();

wsRoute.get("/health", (c) => {
  let totalConnections = 0;
  for (const conns of localConnections.values()) {
    totalConnections += conns.size;
  }
  return c.json({ status: "ok", connections: totalConnections });
});
