// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { useWebSocket } from "@/lib/use-websocket";

interface RealtimeNotification {
  id: string;
  event: string;
  title: string;
  message: string;
  timestamp: string;
  severity?: "info" | "warning" | "critical";
}

// Mapa de jobId -> callback para notificar componentes que aguardam write
type WriteCompleteCallback = (
  status: "success" | "error",
  result?: unknown,
  error?: string,
) => void;

interface RealtimeContextValue {
  isConnected: boolean;
  notifications: RealtimeNotification[];
  dismissNotification: (id: string) => void;
  clearAll: () => void;
  // Registra callback para quando um write job completa via WebSocket
  registerWriteCallback: (
    jobId: string,
    callback: WriteCompleteCallback,
  ) => void;
  unregisterWriteCallback: (jobId: string) => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function RealtimeProvider({
  children,
  token,
}: {
  children: ReactNode;
  token: string | null;
}) {
  const [notifications, setNotifications] = useState<RealtimeNotification[]>(
    [],
  );
  // Mapa de callbacks pendentes — jobId -> callback
  const writeCallbacksRef = useRef<Map<string, WriteCompleteCallback>>(
    new Map(),
  );

  const handleWsMessage = useCallback(
    (msg: { type: string; [key: string]: unknown }) => {
      if (msg.type === "notification" || msg.type === "task.failed") {
        const notif: RealtimeNotification = {
          id: crypto.randomUUID(),
          event: (msg.event as string) ?? msg.type,
          title:
            (msg.task_name as string) ?? (msg.title as string) ?? "Notificacao",
          message:
            (msg.error as string) ??
            (msg.message as string) ??
            JSON.stringify(msg).substring(0, 200),
          timestamp: (msg.timestamp as string) ?? new Date().toISOString(),
          severity:
            msg.type === "task.failed"
              ? "critical"
              : ((msg.severity as "info" | "warning" | "critical") ?? "info"),
        };
        setNotifications((prev) => [notif, ...prev].slice(0, 50));
      }

      // Write job do Zabbix concluido — notifica o componente aguardando
      if (msg.type === "zabbix_write_complete") {
        const jobId = msg.jobId as string;
        const status = msg.status as "success" | "error";
        const operation = msg.operation as string;
        const error = msg.error as string | undefined;
        const result = msg.result;

        // Dispara callback registrado pelo componente
        const callback = writeCallbacksRef.current.get(jobId);
        if (callback) {
          callback(status, result, error);
          writeCallbacksRef.current.delete(jobId);
        }

        // Tambem mostra notificacao visual
        const notif: RealtimeNotification = {
          id: crypto.randomUUID(),
          event: "zabbix_write",
          title:
            status === "success" ? "Operação concluída" : "Operação falhou",
          message:
            status === "success"
              ? `${operation} executado com sucesso`
              : `${operation} falhou: ${error ?? "erro desconhecido"}`,
          timestamp: new Date().toISOString(),
          severity: status === "success" ? "info" : "critical",
        };
        setNotifications((prev) => [notif, ...prev].slice(0, 50));
      }
    },
    [],
  );

  const { isConnected } = useWebSocket(token, { onMessage: handleWsMessage });

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const registerWriteCallback = useCallback(
    (jobId: string, callback: WriteCompleteCallback) => {
      writeCallbacksRef.current.set(jobId, callback);
    },
    [],
  );

  const unregisterWriteCallback = useCallback((jobId: string) => {
    writeCallbacksRef.current.delete(jobId);
  }, []);

  return (
    <RealtimeContext.Provider
      value={{
        isConnected,
        notifications,
        dismissNotification,
        clearAll,
        registerWriteCallback,
        unregisterWriteCallback,
      }}
    >
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext);
  if (!ctx) {
    return {
      isConnected: false,
      notifications: [],
      dismissNotification: () => {},
      clearAll: () => {},
      registerWriteCallback: () => {},
      unregisterWriteCallback: () => {},
    };
  }
  return ctx;
}
