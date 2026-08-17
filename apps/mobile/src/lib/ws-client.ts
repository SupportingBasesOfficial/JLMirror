// @ai-context: .zero-error/architecture-map.md#ingress
// WebSocket client — conexao persistente para notificacoes em tempo real.
// Conecta em ws://host/ws?token=<access_token>, reconecta automaticamente.
import { useEffect, useRef, useState, useCallback } from "react";
import { wsUrl } from "@/lib/api-routes";
import { getAccessToken } from "@/lib/secure-storage";

export interface WsNotification {
  type: string;
  [key: string]: unknown;
}

interface UseWebSocketOptions {
  // Se false, nao conecta
  enabled?: boolean;
  // Callback chamado quando uma notificacao chega
  onNotification?: (notification: WsNotification) => void;
}

// Hook que mantem uma conexao WebSocket ativa enquanto montado
export function useWebSocket(options: UseWebSocketOptions = {}) {
  const { enabled = true, onNotification } = options;
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onNotificationRef = useRef(onNotification);

  // Mantem o callback atualizado sem recriar a conexao
  useEffect(() => {
    onNotificationRef.current = onNotification;
  }, [onNotification]);

  const connect = useCallback(async () => {
    if (!enabled) return;

    const token = await getAccessToken();
    if (!token) return;

    const url = `${wsUrl}?token=${encodeURIComponent(token)}`;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WsNotification;
          if (data.type === "connected" || data.type === "pong") return;
          onNotificationRef.current?.(data);
        } catch {
          // Ignora mensagens invalidas
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;
        // Reconecta apos 3s se ainda habilitado
        if (enabled) {
          reconnectTimer.current = setTimeout(() => connect(), 3000);
        }
      };

      ws.onerror = () => {
        // onclose vai lidar com a reconexao
        ws.close();
      };
    } catch {
      // Falha ao criar WebSocket — tenta novamente em 5s
      if (enabled) {
        reconnectTimer.current = setTimeout(() => connect(), 5000);
      }
    }
  }, [enabled]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      setIsConnected(false);
    };
  }, [connect]);

  const sendMessage = useCallback((message: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  return { isConnected, sendMessage };
}
