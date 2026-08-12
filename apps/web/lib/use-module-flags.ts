// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useMemo } from "react";
import { useApi } from "@/lib/use-api";
import { apiRoutes, type ModuleFlagsResponse } from "@/lib/api-routes";

// Hook que busca as feature flags de modulos e retorna um map { [flagKey]: enabled }
// Cache de 60s via SWR (dedupingInterval alto para evitar refetch excessivo)
// Para clientes tenant: usa client_visible AND client_enabled
// Para admin global: usa default_value (enabled)
export function useModuleFlags() {
  // Usa rota centralizada + tipo type-safe de api-routes.ts
  const { data, mutate, isLoading } = useApi<ModuleFlagsResponse>(
    apiRoutes.settings.modules,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 60_000,
      errorRetryCount: 1,
    },
  );

  const flagMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    const clientMap: Record<string, boolean> = {};
    if (data?.modules) {
      for (const mod of data.modules) {
        map[mod.key] = mod.enabled;
        // Módulo visível para cliente se client_visible AND client_enabled
        clientMap[mod.key] = mod.client_visible && mod.client_enabled;
      }
    }
    return { admin: map, client: clientMap };
  }, [data]);

  // Default seguro: se a flag nao foi carregada ainda, retorna false (nao mostra modulo desativado)
  function isModuleEnabled(flagKey: string | undefined): boolean {
    if (!flagKey) return true;
    if (flagMap.admin[flagKey] === undefined) return false;
    return flagMap.admin[flagKey];
  }

  // Para sidebar do cliente: módulo só aparece se client_visible AND client_enabled
  function isClientModuleEnabled(flagKey: string | undefined): boolean {
    if (!flagKey) return true;
    if (flagMap.client[flagKey] === undefined) return false;
    return flagMap.client[flagKey];
  }

  return {
    flagMap: flagMap.admin,
    clientFlagMap: flagMap.client,
    isModuleEnabled,
    isClientModuleEnabled,
    mutate,
    isLoading,
  };
}
