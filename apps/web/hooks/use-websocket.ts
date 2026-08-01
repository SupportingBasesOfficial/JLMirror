// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface WebSocketNotification {
  type: "notification" | "alert" | "system";
  title: string;
  message: string;
  severity: "info" | "warning" | "critical";
  timestamp: string;
  data?: Record<string, unknown>;
}

export interface UseWebSocketOptions {
  url?: string;
  token?: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  onMessage?: (notification: WebSocketNotification) => void;
}

export interface UseWebSocketResult {
  isConnected: boolean;
  notifications: WebSocketNotification[];
  connect: () => void;
  disconnect: () => void;
  clearNotifications: () => void;
}

export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketResult {
  const {
    url,
    token,
    reconnectInterval = 5000,
    maxReconnectAttempts = 10,
    onMessage,
  } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldReconnectRef = useRef(true);
  const connectRef = useRef<() => void>(() => {});

  const [isConnected, setIsConnected] = useState(false);
  const [notifications, setNotifications] = useState<WebSocketNotification[]>([]);

  const getWsUrl = useCallback((): string => {
    if (url) return url;
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";
    const wsBaseUrl = apiBaseUrl.replace(/^http/, "ws").replace(/\/api\/v1$/, "");
    return `${wsBaseUrl}/ws${token ? `?token=${token}` : ""}`;
  }, [url, token]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const wsUrl = getWsUrl();
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    shouldReconnectRef.current = true;

    ws.onopen = () => {
      setIsConnected(true);
      reconnectAttemptsRef.current = 0;
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const notification: WebSocketNotification = JSON.parse(event.data as string);
        setNotifications((prev) => [notification, ...prev].slice(0, 100));
        onMessage?.(notification);
      } catch {
        // Ignora mensagens não-JSON
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      wsRef.current = null;

      if (shouldReconnectRef.current && reconnectAttemptsRef.current < maxReconnectAttempts) {
        reconnectAttemptsRef.current++;
        reconnectTimerRef.current = setTimeout(() => {
          connectRef.current();
        }, reconnectInterval);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [getWsUrl, reconnectInterval, maxReconnectAttempts, onMessage]);

  // Mantém o ref atualizado para permitir reconexão sem dependência circular
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    isConnected,
    notifications,
    connect,
    disconnect,
    clearNotifications,
  };
}
