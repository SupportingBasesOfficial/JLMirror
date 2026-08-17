// @ai-context: .zero-error/architecture-map.md#ingress
// Hook de push notifications — registra token no login, remove no logout,
// trata notificacoes recebidas em foreground e taps em notificacoes.
import { useEffect, useRef, useCallback } from "react";
import { useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import {
  registerForPushNotifications,
  subscribePushToken,
  unsubscribePushToken,
  type PushNotificationData,
} from "@/lib/push-notifications";
import { useAuth } from "@/lib/auth-context";

export function usePushNotifications() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const pushTokenRef = useRef<string | null>(null);

  // Registra token quando usuario autentica
  useEffect(() => {
    if (!isAuthenticated) {
      // No logout, remove o token do backend
      if (pushTokenRef.current) {
        unsubscribePushToken(pushTokenRef.current);
        pushTokenRef.current = null;
      }
      return;
    }

    // No login, registra o token
    let mounted = true;

    async function register() {
      const token = await registerForPushNotifications();
      if (!token || !mounted) return;

      pushTokenRef.current = token;
      await subscribePushToken(token);
    }

    register();

    return () => {
      mounted = false;
    };
  }, [isAuthenticated]);

  // Handler para tap em notificacao (app aberto ou background)
  const handleNotificationResponse = useCallback(
    (response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content
        .data as PushNotificationData;

      // Deep link baseado no tipo de notificacao
      if (data.type === "ticket" && data.ticket_id) {
        router.push(`/ticket/${data.ticket_id}`);
      } else if (data.type === "device" && data.device_id) {
        router.push(`/device/${data.device_id}`);
      } else if (data.type === "alert") {
        router.push("/(tabs)/alerts");
      }
    },
    [router],
  );

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      handleNotificationResponse,
    );

    return () => {
      subscription.remove();
    };
  }, [handleNotificationResponse]);
}
