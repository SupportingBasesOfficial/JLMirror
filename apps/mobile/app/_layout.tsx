// @ai-context: .zero-error/architecture-map.md#ingress
// Root layout — auth gate + providers globais.
// Se nao autenticado → redirect para /(auth)/login.
// Se autenticado → renderiza (tabs).
import "../src/theme/global.css";
import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { setupQueryPersistence } from "@/lib/query-persistence";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
      refetchOnWindowFocus: false,
      gcTime: 24 * 60 * 60 * 1000, // 24h — mantem cache para offline
    },
  },
});

// Configura persistencia offline do cache (async — nao bloqueia render)
setupQueryPersistence(queryClient).catch(() => {
  // Falha silenciosa — persistencia e opcional
});

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  // Registra push notifications quando autenticado
  usePushNotifications();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === "(auth)";

    // Se nao autenticado, so pode ficar dentro de (auth)
    if (!isAuthenticated && !inAuthGroup) {
      router.replace("/(auth)/landing");
    } else if (isAuthenticated && inAuthGroup) {
      router.replace("/(tabs)");
    }
  }, [isLoading, isAuthenticated, segments, router]);

  if (isLoading) {
    // Tela de splash — pode ser substituida por um splash screen nativo
    return null;
  }

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AuthGate>
            <StatusBar style="light" />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(auth)" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen
                name="device/[id]"
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="ticket/[id]"
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="ticket/new"
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="profile/edit"
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="profile/sessions"
                options={{ headerShown: false }}
              />
            </Stack>
          </AuthGate>
        </AuthProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
