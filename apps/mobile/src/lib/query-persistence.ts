// @ai-context: .zero-error/architecture-map.md#ingress
// Persistencia offline — persiste cache do TanStack Query em storage local.
// Usa AsyncStorage em nativo, localStorage em web (polyfill).
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import type { QueryClient } from "@tanstack/react-query";
import { Platform } from "react-native";

// Storage compativel com web e nativo
interface StorageAdapter {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}

// Cria storage adapter — AsyncStorage em nativo, localStorage em web
async function createStorageAdapter(): Promise<StorageAdapter> {
  if (Platform.OS === "web") {
    // Web — usa localStorage com fallback para noop
    const storage =
      typeof window !== "undefined" && window.localStorage
        ? window.localStorage
        : {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          };

    return {
      getItem: (key: string) => Promise.resolve(storage.getItem(key)),
      setItem: (key: string, value: string) => {
        storage.setItem(key, value);
        return Promise.resolve();
      },
      removeItem: (key: string) => {
        storage.removeItem(key);
        return Promise.resolve();
      },
    };
  }

  // Nativo — usa AsyncStorage
  const AsyncStorage = (
    await import("@react-native-async-storage/async-storage")
  ).default;
  return {
    getItem: (key: string) => AsyncStorage.getItem(key),
    setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
    removeItem: (key: string) => AsyncStorage.removeItem(key),
  };
}

// Cria persister compativel com web e nativo
function createPersister(storage: StorageAdapter) {
  return {
    persistClient: async (client: unknown) => {
      try {
        storage.setItem("jlmirror-query-cache", JSON.stringify(client));
      } catch {
        // Ignora erros de quota excedida
      }
    },
    restoreClient: async () => {
      try {
        const cached = await storage.getItem("jlmirror-query-cache");
        return cached ? JSON.parse(cached) : undefined;
      } catch {
        return undefined;
      }
    },
    removeClient: async () => {
      try {
        await storage.removeItem("jlmirror-query-cache");
      } catch {
        // Ignora
      }
    },
  };
}

// Configura persistencia no QueryClient
export async function setupQueryPersistence(
  queryClient: QueryClient,
): Promise<() => void> {
  const storage = await createStorageAdapter();
  const persister = createPersister(storage);

  const [unsubscribe] = persistQueryClient({
    queryClient,
    persister,
    maxAge: 24 * 60 * 60 * 1000, // 24 horas
    dehydrateOptions: {
      // Nao persiste queries de auth (tokens sao no secure-store)
      shouldDehydrateQuery: (query) => {
        const queryKey = query.queryKey[0] as string;
        return queryKey !== "auth";
      },
    },
  });

  return unsubscribe;
}
