"use client";

import { useMemo } from "react";
import { useApi } from "@/lib/use-api";

interface ModuleFlag {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  is_active: boolean;
}

interface ModulesResponse {
  modules: ModuleFlag[];
}

// Hook que busca as feature flags de modulos e retorna um map { [flagKey]: enabled }
// Cache de 60s via SWR (dedupingInterval alto para evitar refetch excessivo)
export function useModuleFlags() {
  const { data, mutate } = useApi<ModulesResponse>("/api/v1/settings/modules", {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 60_000,
    errorRetryCount: 1,
  });

  const flagMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    if (data?.modules) {
      for (const mod of data.modules) {
        map[mod.key] = mod.enabled;
      }
    }
    return map;
  }, [data]);

  // Verifica se um modulo esta ativo. Se a flag nao foi carregada ainda, assume true (nao bloqueia UI durante loading)
  function isModuleEnabled(flagKey: string | undefined): boolean {
    if (!flagKey) return true;
    if (flagMap[flagKey] === undefined) return true;
    return flagMap[flagKey];
  }

  return { flagMap, isModuleEnabled, mutate };
}
