import useSWR, { type SWRConfiguration } from "swr";
import { apiFetch } from "@/lib/zabbix-fetch";

// Hook generico para fetch com SWR — cache client-side, revalidacao automatica e retry.
// Substitui o padrao manual useEffect + useState + apiFetch em todas as paginas.
//
// Uso:
//   const { data, error, isLoading, mutate } = useApi<{ data: ZabbixUser[] }>("/api/zabbix/users");
//
// Configuracao padrao:
//   - revalidateOnFocus: true (revalida ao voltar a aba do navegador)
//   - revalidateOnReconnect: true (revalida ao reconectar a rede)
//   - dedupingInterval: 2000ms (evita requests duplicados em 2s)
//   - errorRetryCount: 3
export function useApi<T>(
  url: string | null,
  config?: SWRConfiguration,
) {
  const { data, error, isLoading, mutate } = useSWR<T>(
    url,
    (u: string) => apiFetch<T>(u),
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      dedupingInterval: 2000,
      errorRetryCount: 3,
      ...config,
    },
  );

  return {
    data,
    error: error instanceof Error ? error.message : null,
    isLoading: isLoading && !data,
    mutate,
  };
}
