// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useApi } from "@/lib/use-api";
import { apiRoutes, type ModuleFlagsResponse } from "@/lib/api-routes";

/**
 * Enum tipado e estrito contendo as chaves exatas de módulos do JLMIRROR.
 */
export type AvailableModuleKeys =
  | "module_devices"
  | "module_audit"
  | "module_logs"
  | "module_traces"
  | "module_scripts"
  | "module_executions"
  | "module_firewall"
  | "module_k8s"
  | "module_ssl"
  | "module_backup"
  | "module_notifications"
  | "module_assets"
  | "module_capacity"
  | "module_compliance"
  | "module_tickets"
  | "module_kb"
  | "module_system_health"
  | "module_api_keys"
  | "module_webhooks"
  | "module_tasks"
  | "module_data_transfer"
  | "module_lgpd"
  | "module_escalation"
  | "module_patches"
  | "module_security_audit"
  | "module_correlation"
  | "module_workflows"
  | "module_push"
  | "module_client_portal"
  | "module_chatops"
  | "module_status_page"
  | "module_drift"
  | "module_itsm"
  | "module_discovery"
  | "module_anomaly"
  | "module_predictions"
  | "module_finops"
  | "module_marketplace"
  | "module_executive_dashboard"
  | "module_reports"
  | "module_changes"
  | "module_admin"
  | "module_sla"
  | "module_apm";

/**
 * União inteligente que aceita strings de configurações dinâmicas (KPIs/Sidebars)
 * mas preserva o autocompletar do IDE para as chaves nativas do JLMIRROR.
 */
export type ModuleKeyInput = AvailableModuleKeys | (string & {});

export function useModuleFlags() {
  const router = useRouter();

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
        clientMap[mod.key] = mod.client_visible && mod.client_enabled;
      }
    }
    return { admin: map, client: clientMap };
  }, [data]);

  function isModuleEnabled(flagKey: ModuleKeyInput | undefined): boolean {
    if (!flagKey) return true;

    // CORREÇÃO CIRÚRGICA: Se o código testar o termo legado "module_zabbix", redireciona para "module_devices"
    const resolvedKey =
      flagKey === "module_zabbix" ? "module_devices" : flagKey;

    // Retorno defensivo: se a flag não existir ou for undefined, assume false com segurança
    return (flagMap.admin as Record<string, boolean>)[resolvedKey] ?? false;
  }

  function isClientModuleEnabled(flagKey: ModuleKeyInput | undefined): boolean {
    if (!flagKey) return true;
    const resolvedKey =
      flagKey === "module_zabbix" ? "module_devices" : flagKey;

    return (flagMap.client as Record<string, boolean>)[resolvedKey] ?? false;
  }

  /**
   * Barramento ativo e reativo de navegação.
   * Protege páginas Web inacabadas ou desativadas, enviando o utilizador para o Marketplace.
   */
  function requireModuleGuard(flagKey: ModuleKeyInput): boolean {
    const enabled = isModuleEnabled(flagKey);
    if (!isLoading && !enabled) {
      router.replace("/marketplace");
      return false;
    }
    return enabled;
  }

  return {
    flagMap: flagMap.admin,
    clientFlagMap: flagMap.client,
    isModuleEnabled,
    isClientModuleEnabled,
    requireModuleGuard,
    mutate,
    isLoading,
  };
}
