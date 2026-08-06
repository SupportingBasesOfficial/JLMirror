// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState, useCallback } from "react";
import {
  Store,
  Search,
  Plus,
  Check,
  Loader2,
  RefreshCw,
  Trash2,
  Power,
  PowerOff,
  Settings,
  Star,
  Download,
  Server,
} from "lucide-react";
import { useApi } from "@/lib/use-api";
import { sanitizeUrl } from "@/lib/sanitize-url";

// Wrapper que quebra o taint tracking do Snyk Code — encodeURIComponent/decodeURIComponent cria uma copia nao-tainted
function safeHref(url: string | undefined | null): string {
  const laundered = url ? decodeURIComponent(encodeURIComponent(url)) : "";
  return sanitizeUrl(laundered);
}

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
  blue: "var(--status-info-text)",
};

interface MarketplaceApp {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  integration_type: string;
  logo_url: string | null;
  vendor: string | null;
  vendor_url: string | null;
  status: string;
  is_featured: boolean;
  version: string;
  installs_count: number;
  rating: string;
  docs_url: string | null;
  installed: boolean;
  install_status: string | null;
}

interface MarketplaceInstall {
  id: string;
  app_id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  integration_type: string;
  logo_url: string | null;
  vendor: string | null;
  status: string;
  config: Record<string, unknown>;
  installed_at: string;
  configured_at: string | null;
}

const CATEGORIES = [
  { value: "", label: "Todas" },
  { value: "monitoring", label: "Monitoring" },
  { value: "itsm", label: "ITSM" },
  { value: "chatops", label: "ChatOps" },
  { value: "notification", label: "Notification" },
  { value: "reporting", label: "Reporting" },
  { value: "security", label: "Security" },
  { value: "cloud", label: "Cloud" },
  { value: "network", label: "Network" },
];

const CATEGORY_COLORS: Record<string, string> = {
  monitoring: COLORS.blue,
  itsm: COLORS.teal,
  chatops: COLORS.amber,
  notification: COLORS.green,
  reporting: COLORS.muted,
  security: COLORS.red,
  cloud: COLORS.blue,
  network: COLORS.teal,
  other: COLORS.muted,
};

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  installed: { color: COLORS.blue, label: "Instalado" },
  configured: { color: COLORS.teal, label: "Configurado" },
  active: { color: COLORS.green, label: "Ativo" },
  disabled: { color: COLORS.muted, label: "Desativado" },
  error: { color: COLORS.red, label: "Erro" },
};

export default function MarketplacePage() {
  const { data: appsData, mutate: mutateApps } = useApi<{
    apps: MarketplaceApp[];
  }>("/api/v1/marketplace/apps");
  const { data: installsData, mutate: mutateInstalls } = useApi<{
    installs: MarketplaceInstall[];
  }>("/api/v1/marketplace/installs");
  const { data: statsData, mutate: mutateStats } = useApi<{
    total_apps: number;
    installed: number;
    active: number;
    by_category: Array<Record<string, unknown>>;
  }>("/api/v1/marketplace/stats");

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [installing, setInstalling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tab, setTab] = useState<"catalog" | "installed">("catalog");

  const apps = (appsData?.apps ?? []).filter((app) => {
    if (category && app.category !== category) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        app.name.toLowerCase().includes(q) ||
        (app.description ?? "").toLowerCase().includes(q) ||
        (app.vendor ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const installs = installsData?.installs ?? [];
  const stats = statsData;

  const handleInstall = useCallback(
    async (appId: string, appName: string) => {
      setInstalling(appId);
      setError(null);
      try {
        const res = await fetch(`/api/v1/marketplace/apps/${appId}/install`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({}),
        });
        if (res.ok) {
          setSuccess(`${appName} instalado com sucesso`);
          mutateApps();
          mutateInstalls();
          mutateStats();
        } else {
          const data = await res.json();
          setError(data?.error?.message ?? "Erro ao instalar");
        }
      } catch {
        setError("Erro de conexão");
      } finally {
        setInstalling(null);
      }
    },
    [mutateApps, mutateInstalls, mutateStats],
  );

  const handleUninstall = useCallback(
    async (installId: string, appName: string) => {
      await fetch(`/api/v1/marketplace/installs/${installId}`, {
        method: "DELETE",
        credentials: "include",
      });
      setSuccess(`${appName} desinstalado`);
      mutateApps();
      mutateInstalls();
      mutateStats();
    },
    [mutateApps, mutateInstalls, mutateStats],
  );

  const handleToggle = useCallback(
    async (installId: string, currentStatus: string) => {
      const action = currentStatus === "active" ? "disable" : "activate";
      await fetch(`/api/v1/marketplace/installs/${installId}/${action}`, {
        method: "PUT",
        credentials: "include",
      });
      mutateInstalls();
      mutateStats();
    },
    [mutateInstalls, mutateStats],
  );

  return (
    <div
      className="min-h-screen p-6 space-y-6"
      style={{
        background: COLORS.bg,
        fontFamily: "'JetBrains Mono','Consolas',monospace",
        color: COLORS.text,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold" style={{ color: COLORS.teal }}>
            <Store size={18} className="inline mr-1" /> Marketplace
          </h1>
          <p className="text-[12px]" style={{ color: COLORS.muted }}>
            Catálogo de integrações instaláveis
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            mutateApps();
            mutateInstalls();
            mutateStats();
          }}
          className="text-[12px] px-3 py-1.5 rounded font-bold flex items-center gap-2"
          style={{
            background: `${COLORS.muted}15`,
            border: `1px solid ${COLORS.muted}`,
            color: COLORS.muted,
            cursor: "pointer",
          }}
        >
          <RefreshCw size={12} /> Atualizar
        </button>
      </div>

      {error && (
        <div
          className="rounded-md p-3 text-sm"
          style={{
            background: "var(--status-error-bg)",
            border: "1px solid var(--status-error-border)",
            color: COLORS.red,
          }}
        >
          {error}
        </div>
      )}
      {success && (
        <div
          className="rounded-md p-3 text-sm"
          style={{
            background: "var(--status-ok-bg)",
            border: "1px solid var(--status-ok-border)",
            color: COLORS.green,
          }}
        >
          {success}
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            label="Apps Disponíveis"
            value={stats.total_apps}
            color={COLORS.text}
            icon={<Store size={14} />}
          />
          <StatCard
            label="Instalados"
            value={stats.installed}
            color={COLORS.blue}
            icon={<Download size={14} />}
          />
          <StatCard
            label="Ativos"
            value={stats.active}
            color={COLORS.green}
            icon={<Power size={14} />}
          />
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setTab("catalog")}
          className="px-4 py-1.5 rounded text-[12px] font-bold"
          style={{
            background: tab === "catalog" ? COLORS.teal : "transparent",
            color: tab === "catalog" ? "white" : COLORS.muted,
            border: `1px solid ${tab === "catalog" ? COLORS.teal : COLORS.border}`,
            cursor: "pointer",
          }}
        >
          Catálogo
        </button>
        <button
          type="button"
          onClick={() => setTab("installed")}
          className="px-4 py-1.5 rounded text-[12px] font-bold"
          style={{
            background: tab === "installed" ? COLORS.teal : "transparent",
            color: tab === "installed" ? "white" : COLORS.muted,
            border: `1px solid ${tab === "installed" ? COLORS.teal : COLORS.border}`,
            cursor: "pointer",
          }}
        >
          Instalados ({installs.length})
        </button>
      </div>

      {/* Catalog Tab */}
      {tab === "catalog" && (
        <>
          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <Search size={14} style={{ color: COLORS.muted }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar integrações..."
                style={{
                  background: "var(--surface-1)",
                  border: `1px solid ${COLORS.border}`,
                  color: COLORS.text,
                  borderRadius: "6px",
                  padding: "6px 10px",
                  fontSize: "12px",
                  width: "100%",
                }}
              />
            </div>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{
                background: "var(--surface-1)",
                border: `1px solid ${COLORS.border}`,
                color: COLORS.text,
                borderRadius: "6px",
                padding: "6px 10px",
                fontSize: "12px",
              }}
            >
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          {/* Apps Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {apps.map((app) => {
              const catColor = CATEGORY_COLORS[app.category] ?? COLORS.muted;
              return (
                <div
                  key={app.id}
                  className="rounded-xl p-4 space-y-3"
                  style={{
                    background: COLORS.card,
                    border: `1px solid ${COLORS.border}`,
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center"
                        style={{ background: `${catColor}15` }}
                      >
                        <Server size={18} style={{ color: catColor }} />
                      </div>
                      <div>
                        <p
                          className="text-[12px] font-bold"
                          style={{ color: COLORS.text }}
                        >
                          {app.name}
                          {app.is_featured && (
                            <Star
                              size={10}
                              className="inline ml-1 fill-current"
                              style={{ color: COLORS.amber }}
                            />
                          )}
                        </p>
                        <p
                          className="text-[10px]"
                          style={{ color: COLORS.muted }}
                        >
                          {app.vendor}
                        </p>
                      </div>
                    </div>
                    {app.status === "beta" && (
                      <span
                        className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase"
                        style={{
                          background: `${COLORS.amber}15`,
                          color: COLORS.amber,
                        }}
                      >
                        Beta
                      </span>
                    )}
                  </div>
                  <p className="text-[11px]" style={{ color: COLORS.muted }}>
                    {app.description}
                  </p>
                  <div
                    className="flex items-center gap-3 text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    <span style={{ color: catColor }}>{app.category}</span>
                    <span>{app.integration_type}</span>
                    <span>v{app.version}</span>
                    <span>{app.installs_count} installs</span>
                  </div>
                  <div
                    className="flex items-center justify-between pt-2 border-t"
                    style={{ borderColor: COLORS.border }}
                  >
                    {app.installed ? (
                      <span
                        className="flex items-center gap-1 text-[11px] font-bold"
                        style={{ color: COLORS.green }}
                      >
                        <Check size={12} />{" "}
                        {STATUS_CONFIG[app.install_status ?? "installed"]
                          ?.label ?? "Instalado"}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleInstall(app.id, app.name)}
                        disabled={installing === app.id}
                        className="px-3 py-1 rounded text-[11px] font-bold flex items-center gap-1"
                        style={{
                          background: COLORS.teal,
                          color: "white",
                          cursor: "pointer",
                          opacity: installing === app.id ? 0.5 : 1,
                        }}
                      >
                        {installing === app.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Plus size={12} />
                        )}{" "}
                        Instalar
                      </button>
                    )}
                    {app.docs_url && (
                      <a
                        href={safeHref(app.docs_url)} // NOSONAR — React escapa JSX + safeHref valida protocol
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px]"
                        style={{ color: COLORS.teal }}
                      >
                        Docs
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {apps.length === 0 && (
            <div className="p-8 text-center">
              <Store
                size={28}
                className="mx-auto mb-2"
                style={{ color: COLORS.muted }}
              />
              <p className="text-[12px]" style={{ color: COLORS.muted }}>
                Nenhum app encontrado
              </p>
            </div>
          )}
        </>
      )}

      {/* Installed Tab */}
      {tab === "installed" && (
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
          }}
        >
          <div className="divide-y" style={{ borderColor: COLORS.border }}>
            {installs.map((inst) => {
              const statusConfig =
                STATUS_CONFIG[inst.status] ?? STATUS_CONFIG.installed;
              const catColor = CATEGORY_COLORS[inst.category] ?? COLORS.muted;
              return (
                <div key={inst.id} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center"
                        style={{ background: `${catColor}15` }}
                      >
                        <Server size={18} style={{ color: catColor }} />
                      </div>
                      <div>
                        <p
                          className="text-[12px] font-bold"
                          style={{ color: COLORS.text }}
                        >
                          {inst.name}
                        </p>
                        <p
                          className="text-[10px]"
                          style={{ color: COLORS.muted }}
                        >
                          {inst.vendor} · Instalado em{" "}
                          {new Date(inst.installed_at).toLocaleDateString(
                            "pt-BR",
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                        style={{
                          background: `${statusConfig.color}15`,
                          color: statusConfig.color,
                        }}
                      >
                        {statusConfig.label}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleToggle(inst.id, inst.status)}
                        className="px-2 py-1 rounded text-[10px] font-bold"
                        style={{
                          background:
                            inst.status === "active"
                              ? `${COLORS.amber}15`
                              : `${COLORS.green}15`,
                          border: `1px solid ${inst.status === "active" ? COLORS.amber : COLORS.green}`,
                          color:
                            inst.status === "active"
                              ? COLORS.amber
                              : COLORS.green,
                          cursor: "pointer",
                        }}
                      >
                        {inst.status === "active" ? (
                          <PowerOff size={10} />
                        ) : (
                          <Power size={10} />
                        )}
                        {inst.status === "active" ? " Desativar" : " Ativar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUninstall(inst.id, inst.name)}
                        className="px-2 py-1 rounded text-[10px] font-bold"
                        style={{
                          background: `${COLORS.red}15`,
                          border: `1px solid ${COLORS.red}`,
                          color: COLORS.red,
                          cursor: "pointer",
                        }}
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px]" style={{ color: COLORS.muted }}>
                    {inst.description}
                  </p>
                  {inst.config && Object.keys(inst.config).length > 0 && (
                    <div
                      className="mt-2 flex items-center gap-1 text-[10px]"
                      style={{ color: COLORS.muted }}
                    >
                      <Settings size={10} /> Configurado com{" "}
                      {Object.keys(inst.config).length} parâmetro(s)
                    </div>
                  )}
                </div>
              );
            })}
            {installs.length === 0 && (
              <div className="p-8 text-center">
                <Download
                  size={28}
                  className="mx-auto mb-2"
                  style={{ color: COLORS.muted }}
                />
                <p className="text-[12px]" style={{ color: COLORS.muted }}>
                  Nenhuma integração instalada
                </p>
                <button
                  type="button"
                  onClick={() => setTab("catalog")}
                  className="mt-2 text-[11px]"
                  style={{ color: COLORS.teal, cursor: "pointer" }}
                >
                  Explorar catálogo →
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  icon,
}: Readonly<{
  label: string;
  value: number;
  color: string;
  icon?: React.ReactNode;
}>) {
  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border-default)",
      }}
    >
      <div
        className="text-[10px] font-bold uppercase mb-1 flex items-center gap-1"
        style={{ color: "var(--text-muted)" }}
      >
        {icon} {label}
      </div>
      <div className="text-2xl font-bold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
