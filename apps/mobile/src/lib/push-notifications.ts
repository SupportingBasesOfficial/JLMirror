// @ai-context: .zero-error/architecture-map.md#ingress
// Push notifications service — registra token nativo (APNs/FCM) no backend.
// Handlers de foreground/background/response para notificacoes recebidas.
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { api } from "@/lib/api-client";
import { apiRoutes } from "@/lib/api-routes";

// Configura comportamento quando notificacao chega em foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Solicita permissoes de notificacao e retorna o push token
export async function registerForPushNotifications(): Promise<string | null> {
  try {
    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      return null;
    }

    const tokenResponse = await Notifications.getExpoPushTokenAsync({
      projectId: "jlmirror-mobile",
    });

    return tokenResponse.data;
  } catch {
    return null;
  }
}

// Envia o push token para o backend (rota nativa)
export async function subscribePushToken(
  pushToken: string,
  userAgent?: string,
): Promise<boolean> {
  try {
    const platform = Platform.OS === "ios" ? "ios" : "android";
    await api.post(apiRoutes.push.nativeSubscribe, {
      push_token: pushToken,
      platform,
      device_type: Platform.OS,
      user_agent: userAgent,
    });
    return true;
  } catch {
    // Falha silenciosa — nao bloqueia o login
    return false;
  }
}

// Remove o push token do backend (no logout)
export async function unsubscribePushToken(pushToken: string): Promise<void> {
  try {
    await api.post(apiRoutes.push.nativeUnsubscribe, {
      push_token: pushToken,
    });
  } catch {
    // Ignora erro no logout
  }
}

// Tipo para dados de notificacao recebida
export interface PushNotificationData {
  type?: string;
  ticket_id?: string;
  device_id?: string;
  alert_id?: string;
  [key: string]: unknown;
}
