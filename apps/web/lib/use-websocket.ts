// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface WebSocketMessage {
  type: string;
  [key: string]: unknown;
}

interface UseWebSocketOptions {
  onMessage?: (msg: WebSocketMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

// Hook para conectar ao WebSocket da API e receber notificacoes em tempo real
export function useWebSocket(
  token: string | null,
  options: UseWebSocketOptions = {},
) {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const connect = useCallback(() => {
    if (!token) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const wsBaseUrl =
      process.env.NEXT_PUBLIC_WS_URL ??
      `ws://${window.location.hostname}:3001/ws`;
    const wsUrl = `${wsBaseUrl}${wsBaseUrl.includes("?") ? "&" : "?"}token=${token}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      optionsRef.current.onConnect?.();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WebSocketMessage;
        setLastMessage(msg);
        optionsRef.current.onMessage?.(msg);
      } catch {
        // Ignora mensagens invalidas
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      wsRef.current = null;
      optionsRef.current.onDisconnect?.();
      // Reconnect apos 5 segundos
      if (token) {
        reconnectTimerRef.current = setTimeout(() => connect(), 5000);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [token]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  const sendMessage = useCallback((msg: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  return { isConnected, lastMessage, sendMessage };
}
