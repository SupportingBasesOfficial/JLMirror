"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { useWebSocket } from "@/lib/use-websocket";

interface RealtimeNotification {
  id: string;
  event: string;
  title: string;
  message: string;
  timestamp: string;
  severity?: "info" | "warning" | "critical";
}

interface RealtimeContextValue {
  isConnected: boolean;
  notifications: RealtimeNotification[];
  dismissNotification: (id: string) => void;
  clearAll: () => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function RealtimeProvider({ children, token }: { children: ReactNode; token: string | null }) {
  const [notifications, setNotifications] = useState<RealtimeNotification[]>([]);

  const handleWsMessage = useCallback((msg: { type: string; [key: string]: unknown }) => {
    if (msg.type === "notification" || msg.type === "task.failed") {
      const notif: RealtimeNotification = {
        id: crypto.randomUUID(),
        event: (msg.event as string) ?? msg.type,
        title: (msg.task_name as string) ?? (msg.title as string) ?? "Notificacao",
        message: (msg.error as string) ?? (msg.message as string) ?? JSON.stringify(msg).substring(0, 200),
        timestamp: (msg.timestamp as string) ?? new Date().toISOString(),
        severity: msg.type === "task.failed" ? "critical" : (msg.severity as "info" | "warning" | "critical") ?? "info",
      };
      setNotifications((prev) => [notif, ...prev].slice(0, 50));
    }
  }, []);

  const { isConnected } = useWebSocket(token, { onMessage: handleWsMessage });

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  return (
    <RealtimeContext.Provider value={{ isConnected, notifications, dismissNotification, clearAll }}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext);
  if (!ctx) {
    return { isConnected: false, notifications: [], dismissNotification: () => {}, clearAll: () => {} };
  }
  return ctx;
}
