// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useCallback, useEffect, useRef } from "react";
import { useWebSocket, type WebSocketNotification } from "@/hooks/use-websocket";

interface RealtimeNotificationsProps {
  token?: string;
  wsUrl?: string;
}

function getNotificationStyles(severity: WebSocketNotification["severity"]): string {
  switch (severity) {
    case "critical":
      return "border-red-500 bg-red-50 text-red-900";
    case "warning":
      return "border-amber-500 bg-amber-50 text-amber-900";
    default:
      return "border-blue-500 bg-blue-50 text-blue-900";
  }
}

function getSeverityIcon(severity: WebSocketNotification["severity"]): string {
  switch (severity) {
    case "critical":
      return "🚨";
    case "warning":
      return "⚠️";
    default:
      return "ℹ️";
  }
}

export function RealtimeNotifications({ token, wsUrl }: RealtimeNotificationsProps) {
  const visibleToastsRef = useRef<Map<string, HTMLDivElement>>(new Map());

  const showToast = useCallback((notification: WebSocketNotification) => {
    if (typeof document === "undefined") return;

    const toastId = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const toast = document.createElement("div");
    toast.id = toastId;
    toast.className = `fixed top-4 right-4 z-50 max-w-sm rounded-lg border-l-4 p-4 shadow-lg transition-all duration-300 ${getNotificationStyles(notification.severity)}`;
    toast.innerHTML = `
      <div class="flex items-start gap-3">
        <span class="text-lg">${getSeverityIcon(notification.severity)}</span>
        <div class="flex-1">
          <p class="font-semibold text-sm">${notification.title}</p>
          <p class="text-sm mt-1 opacity-90">${notification.message}</p>
        </div>
        <button class="text-lg leading-none opacity-60 hover:opacity-100" aria-label="Fechar">×</button>
      </div>
    `;

    const closeBtn = toast.querySelector("button");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(100%)";
        setTimeout(() => {
          toast.remove();
          visibleToastsRef.current.delete(toastId);
        }, 300);
      });
    }

    document.body.appendChild(toast);
    visibleToastsRef.current.set(toastId, toast);

    setTimeout(() => {
      if (toast.parentElement) {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(100%)";
        setTimeout(() => {
          toast.remove();
          visibleToastsRef.current.delete(toastId);
        }, 300);
      }
    }, 5000);
  }, []);

  const { connect, disconnect, isConnected } = useWebSocket({
    token,
    url: wsUrl,
    onMessage: showToast,
  });

  useEffect(() => {
    if (token) {
      connect();
    }
    const toastsRef = visibleToastsRef;
    return () => {
      disconnect();
      for (const [, toast] of toastsRef.current) {
        toast.remove();
      }
      toastsRef.current.clear();
    };
  }, [token, connect, disconnect]);

  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      {isConnected ? "Conectado ao servidor de notificações" : "Desconectado"}
    </div>
  );
}
