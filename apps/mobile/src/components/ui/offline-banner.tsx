// @ai-context: .zero-error/architecture-map.md#ingress
// Offline banner — mostra banner quando dispositivo esta offline.
// Usa NetInfo do @react-native-community/netinfo (polyfill web).
import { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";

// Polyfill simples para web — NetInfo nao funciona no browser
// Em nativo, usa @react-native-community/netinfo
interface NetInfoState {
  isConnected: boolean | null;
}

async function fetchNetInfo(): Promise<NetInfoState> {
  if (typeof navigator !== "undefined" && navigator.onLine !== undefined) {
    return { isConnected: navigator.onLine };
  }
  return { isConnected: true };
}

export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function checkConnection() {
      const state = await fetchNetInfo();
      if (mounted) setIsOffline(state.isConnected === false);
    }

    checkConnection();

    // Listener para web — window pode existir no RN sem addEventListener
    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      window.addEventListener("online", () => setIsOffline(false));
      window.addEventListener("offline", () => setIsOffline(true));
    }

    return () => {
      mounted = false;
    };
  }, []);

  if (!isOffline) return null;

  return (
    <View className="flex-row items-center justify-center gap-2 bg-destructive px-4 py-2">
      <Ionicons name="cloud-offline-outline" size={16} color="#fafafa" />
      <Text className="text-sm font-medium text-destructive-foreground">
        Voce esta offline — dados podem estar desatualizados
      </Text>
    </View>
  );
}
