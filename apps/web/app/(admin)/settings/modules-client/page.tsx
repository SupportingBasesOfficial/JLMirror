// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState, useMemo } from "react";
import {
  ArrowLeft,
  RefreshCw,
  Puzzle,
  Check,
  Loader2,
  Eye,
  EyeOff,
} from "lucide-react";
import Link from "next/link";
import { LoadingState } from "@/components/ui/state-display";
import { useApi } from "@/lib/use-api";
import { apiFetch } from "@/lib/zabbix-fetch";

const COLORS = {
  bg: "var(--surface-0)",
  card: "var(--surface-2)",
  border: "var(--border-default)",
  text: "var(--text-primary)",
  muted: "var(--text-muted)",
  teal: "var(--brand-primary)",
  green: "var(--status-ok-text)",
  red: "var(--status-error-text)",
  amber: "var(--status-warning-text)",
};

interface ModuleFlag {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  is_active: boolean;
  client_visible: boolean;
  client_enabled: boolean;
}

interface ModulesResponse {
  modules: ModuleFlag[];
}

// Categorias para agrupar os módulos na UI do cliente
const CATEGORIES: { title: string; prefixes: string[] }[] = [
  {
    title: "Monitoramento & Infraestrutura",
    prefixes: [
      "module_system_health",
      "module_capacity",
      "module_assets",
      "module_backup",
      "module_ssl",
      "module_discovery",
    ],
  },
  {
    title: "Operações",
    prefixes: [
      "module_tickets",
      "module_changes",
      "module_kb",
      "module_tasks",
      "module_workflows",
      "module_notifications",
      "module_push",
      "module_chatops",
    ],
  },
  {
    title: "Segurança & Compliance",
    prefixes: ["module_compliance", "module_correlation", "module_drift"],
  },
  {
    title: "Inteligência & Analytics",
    prefixes: [
      "module_anomaly",
      "module_predictions",
      "module_apm",
      "module_logs",
      "module_traces",
      "module_executive_dashboard",
      "module_reports",
      "module_finops",
    ],
  },
  {
    title: "Integrações & Extensões",
    prefixes: [
      "module_api_keys",
      "module_webhooks",
      "module_itsm",
      "module_marketplace",
      "module_data_transfer",
      "module_status_page",
      "module_sla",
    ],
  },
];

function getCategory(key: string): string {
  for (const cat of CATEGORIES) {
    if (cat.prefixes.includes(key)) return cat.title;
  }
  return "Outros";
}

export default function ClientModulesPage() {
  const { data, isLoading, progress, mutate } = useApi<ModulesResponse>(
    "/api/v1/settings/modules",
  );
  const [toggling, setToggling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Cliente só vê módulos onde client_visible = true
  const clientModules = useMemo(() => {
    return (data?.modules ?? []).filter((m) => m.client_visible);
  }, [data]);

  const groupedModules = useMemo(() => {
    const groups: Record<string, ModuleFlag[]> = {};
    for (const mod of clientModules) {
      const cat = getCategory(mod.key);
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(mod);
    }
    return groups;
  }, [clientModules]);

  const activeCount = clientModules.filter((m) => m.client_enabled).length;
  const inactiveCount = clientModules.length - activeCount;

  async function toggleClientModule(key: string, enabled: boolean) {
    setToggling(key);
    setError(null);
    try {
      await apiFetch(`/api/v1/settings/modules/${key}/client`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      await mutate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao alterar módulo");
    } finally {
      setToggling(null);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen p-6" style={{ background: COLORS.bg }}>
        <LoadingState label="Carregando módulos..." progress={progress} />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6" style={{ background: COLORS.bg }}>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 text-xs font-medium transition-colors hover:opacity-70"
            style={{ color: COLORS.muted }}
          >
            <ArrowLeft size={14} />
            Dashboard
          </Link>
        </div>

        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center rounded-xl"
              style={{
                width: 44,
                height: 44,
                background: "var(--brand-glow)",
                border: `1px solid ${COLORS.teal}33`,
              }}
            >
              <Puzzle size={22} style={{ color: COLORS.teal }} />
            </div>
            <div>
              <h1 className="text-xl font-bold" style={{ color: COLORS.text }}>
                Meus Módulos
              </h1>
              <p className="text-xs" style={{ color: COLORS.muted }}>
                {activeCount} ativos · {inactiveCount} disponíveis ·{" "}
                {clientModules.length} liberados
              </p>
            </div>
          </div>
          <button
            onClick={() => mutate()}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all hover:opacity-80"
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
              color: COLORS.text,
            }}
          >
            <RefreshCw size={13} />
            Atualizar
          </button>
        </div>

        {error && (
          <div
            className="rounded-lg px-4 py-3 mb-6 text-xs font-medium"
            style={{
              background: `${COLORS.red}11`,
              border: `1px solid ${COLORS.red}33`,
              color: COLORS.red,
            }}
          >
            {error}
          </div>
        )}

        {clientModules.length === 0 ? (
          <div
            className="rounded-xl p-8 text-center"
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
            }}
          >
            <EyeOff
              size={32}
              style={{ color: COLORS.muted, margin: "0 auto 12px" }}
            />
            <p className="text-sm font-medium" style={{ color: COLORS.text }}>
              Nenhum módulo liberado ainda
            </p>
            <p className="text-xs mt-1" style={{ color: COLORS.muted }}>
              Seu administrador ainda não liberou módulos opcionais para
              ativação.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedModules).map(([category, mods]) => (
              <div key={category}>
                <h2
                  className="text-[10px] font-bold uppercase tracking-widest mb-3"
                  style={{ color: COLORS.muted }}
                >
                  {category}
                </h2>
                <div
                  className="grid gap-3"
                  style={{
                    gridTemplateColumns:
                      "repeat(auto-fill, minmax(320px, 1fr))",
                  }}
                >
                  {mods.map((mod) => (
                    <ClientModuleCard
                      key={mod.key}
                      module={mod}
                      toggling={toggling === mod.key}
                      onToggle={(enabled) =>
                        toggleClientModule(mod.key, enabled)
                      }
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ClientModuleCard({
  module: mod,
  toggling,
  onToggle,
}: {
  module: ModuleFlag;
  toggling: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  return (
    <div
      className="rounded-xl p-4 transition-all"
      style={{
        background: COLORS.card,
        border: `1px solid ${mod.client_enabled ? `${COLORS.teal}33` : COLORS.border}`,
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <h3
            className="text-sm font-semibold truncate"
            style={{ color: COLORS.text }}
          >
            {mod.name}
          </h3>
          <p
            className="text-[11px] mt-0.5 line-clamp-2"
            style={{ color: COLORS.muted }}
          >
            {mod.description}
          </p>
        </div>
        <ToggleSwitch
          enabled={mod.client_enabled}
          disabled={toggling}
          loading={toggling}
          onToggle={onToggle}
        />
      </div>
      <div className="flex items-center gap-1.5 mt-2">
        {mod.client_enabled ? (
          <>
            <Check size={12} style={{ color: COLORS.green }} />
            <span
              className="text-[10px] font-medium"
              style={{ color: COLORS.green }}
            >
              Ativo
            </span>
          </>
        ) : (
          <>
            <Eye size={12} style={{ color: COLORS.amber }} />
            <span
              className="text-[10px] font-medium"
              style={{ color: COLORS.amber }}
            >
              Disponível
            </span>
          </>
        )}
        <span
          className="text-[10px] ml-auto font-mono"
          style={{ color: COLORS.muted, opacity: 0.5 }}
        >
          {mod.key}
        </span>
      </div>
    </div>
  );
}

function ToggleSwitch({
  enabled,
  disabled,
  loading,
  onToggle,
}: {
  enabled: boolean;
  disabled: boolean;
  loading: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  return (
    <button
      onClick={() => !disabled && onToggle(!enabled)}
      disabled={disabled}
      className="relative shrink-0 transition-all"
      style={{
        width: 36,
        height: 20,
        borderRadius: 10,
        background: enabled ? COLORS.teal : "var(--surface-3, #333)",
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled && !enabled ? 0.5 : 1,
      }}
    >
      {loading ? (
        <Loader2
          size={12}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin"
          style={{ color: "white" }}
        />
      ) : (
        <span
          className="absolute top-1/2 -translate-y-1/2 rounded-full transition-all"
          style={{
            width: 14,
            height: 14,
            background: "white",
            left: enabled ? 20 : 3,
          }}
        />
      )}
    </button>
  );
}
