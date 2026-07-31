import useSWR, { type SWRConfiguration } from "swr";
import { useState, useCallback } from "react";
import { apiFetchWithProgress } from "@/lib/zabbix-fetch";

// Hook generico para fetch com SWR — cache client-side, revalidacao automatica e retry.
// Agora com progresso real de download (0-100) baseado em bytes recebidos vs Content-Length.
//
// Uso:
//   const { data, error, isLoading, progress, mutate } = useApi<{ data: ZabbixUser[] }>("/api/zabbix/users");
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
  const [progress, setProgress] = useState(0);

  const fetcher = useCallback(
    (u: string) => {
      setProgress(0);
      return apiFetchWithProgress<T>(u, undefined, (pct) => {
        setProgress(pct);
      });
    },
    [],
  );

  const { data, error, isLoading, mutate } = useSWR<T>(
    url,
    fetcher,
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
    progress: data ? 100 : progress,
    mutate,
  };
}
