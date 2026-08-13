// @ai-context: .zero-error/architecture-map.md#ingress
// Root layout — auth gate + providers globais.
// Se nao autenticado → redirect para /(auth)/login.
// Se autenticado → renderiza (tabs).
import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { OfflineBanner } from "@/components/ui/offline-banner";
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

    if (!isAuthenticated && !inAuthGroup) {
      router.replace("/(auth)/login");
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
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AuthGate>
          <StatusBar style="light" />
          <OfflineBanner />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="device/[id]" />
            <Stack.Screen name="ticket/[id]" />
          </Stack>
        </AuthGate>
      </AuthProvider>
    </QueryClientProvider>
  );
}
