"use client";

import { useState, useEffect, useCallback } from "react";

type PushPermission = "default" | "granted" | "denied";

interface PushSubscriptionState {
  isSupported: boolean;
  permission: PushPermission;
  isSubscribed: boolean;
  loading: boolean;
  error: string | null;
}

export function usePushNotifications() {
  const [state, setState] = useState<PushSubscriptionState>({
    isSupported: false,
    permission: "default",
    isSubscribed: false,
    loading: false,
    error: null,
  });

  // Verifica suporte e permissao ao montar
  useEffect(() => {
    const isSupported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
    if (!isSupported) {
      setState((prev) => ({ ...prev, isSupported: false }));
      return;
    }

    const permission = Notification.permission as PushPermission;
    setState((prev) => ({ ...prev, isSupported: true, permission }));

    // Verifica se ja esta inscrito
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        setState((prev) => ({ ...prev, isSubscribed: !!sub }));
      })
      .catch(() => undefined);
  }, []);

  // Registra o service worker
  const registerSW = useCallback(async (): Promise<ServiceWorkerRegistration | null> => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
    try {
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      return reg;
    } catch {
      return null;
    }
  }, []);

  // Solicita permissao e inscreve
  const subscribe = useCallback(async (): Promise<boolean> => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const reg = await registerSW();
      if (!reg) {
        setState((prev) => ({ ...prev, loading: false, error: "Service Worker não pôde ser registrado" }));
        return false;
      }

      const permission = await Notification.requestPermission();
      setState((prev) => ({ ...prev, permission }));

      if (permission !== "granted") {
        setState((prev) => ({ ...prev, loading: false, error: "Permissão de notificação negada" }));
        return false;
      }

      // Busca a VAPID public key
      const keyRes = await fetch("/api/push/vapid-public-key", { credentials: "include" });
      if (!keyRes.ok) {
        setState((prev) => ({ ...prev, loading: false, error: "Não foi possível obter a chave VAPID" }));
        return false;
      }
      const { public_key } = await keyRes.json();
      if (!public_key) {
        setState((prev) => ({ ...prev, loading: false, error: "Chave VAPID não configurada no servidor" }));
        return false;
      }

      // Converte VAPID key para Uint8Array
      const applicationServerKey = urlBase64ToUint8Array(public_key) as unknown as BufferSource;

      // Inscreve no push manager
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });

      // Envia para o backend
      const subJSON = subscription.toJSON();
      const subscribeRes = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          endpoint: subJSON.endpoint,
          keys: subJSON.keys,
          device_type: detectDeviceType(),
          user_agent: navigator.userAgent,
        }),
      });

      if (!subscribeRes.ok) {
        setState((prev) => ({ ...prev, loading: false, error: "Erro ao registrar inscrição no servidor" }));
        return false;
      }

      setState((prev) => ({ ...prev, loading: false, isSubscribed: true, error: null }));
      return true;
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : "Erro ao inscrever",
      }));
      return false;
    }
  }, [registerSW]);

  // Cancela a inscricao
  const unsubscribe = useCallback(async (): Promise<boolean> => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();

      if (sub) {
        await sub.unsubscribe();

        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
      }

      setState((prev) => ({ ...prev, loading: false, isSubscribed: false, error: null }));
      return true;
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : "Erro ao cancelar inscrição",
      }));
      return false;
    }
  }, []);

  // Envia push de teste
  const sendTest = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch("/api/push/test", {
        method: "POST",
        credentials: "include",
      });
      return res.ok;
    } catch {
      return false;
    }
  }, []);

  return {
    ...state,
    subscribe,
    unsubscribe,
    sendTest,
  };
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function detectDeviceType(): string {
  const ua = navigator.userAgent;
  if (/tablet|ipad/i.test(ua)) return "tablet";
  if (/mobile|iphone|ipod|android.*mobile/i.test(ua)) return "mobile";
  return "desktop";
}
