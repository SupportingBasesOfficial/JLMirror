// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState, useEffect } from "react";
import { RefreshCw, ArrowLeft, Plus } from "lucide-react";
import { LoadingState } from "@/components/ui/state-display";
import { useApi } from "@/lib/use-api";

const COLORS = {
  bg: "var(--surface-0)",
  card: "var(--surface-2)",
  cardHover: "var(--surface-hover)",
  border: "var(--border-default)",
  text: "var(--text-primary)",
  muted: "var(--text-muted)",
  teal: "var(--brand-primary)",
  green: "var(--status-ok-text)",
  red: "var(--status-error-text)",
  amber: "var(--status-warning-text)",
  blue: "var(--status-info-text)",
  purple: "var(--status-info-text)",
};

const RESOURCE_ICONS: Record<string, string> = {
  pod: "⊙",
  service: "≡",
  deployment: "▲",
  configmap: "⚙",
  secret: "🔒",
  node: "▣",
  namespace: "▤",
  daemonset: "◈",
  statefulset: "◆",
  ingress: "→",
  pvc: "💾",
  job: "▶",
  cronjob: "⏰",
};

const READY_COLORS: Record<string, string> = {
  Running: COLORS.green,
  Active: COLORS.green,
  Ready: COLORS.green,
  Pending: COLORS.amber,
  Failed: COLORS.red,
  CrashLoopBackOff: COLORS.red,
  ImagePullBackOff: COLORS.red,
  Evicted: COLORS.red,
};

interface K8sCluster {
  id: string;
  name: string;
  display_name: string | null;
  api_server_url: string;
  context: string | null;
  namespace: string;
  is_active: boolean;
  last_connected_at: string | null;
  version: string | null;
  node_count: number;
}

interface K8sResource {
  id: string;
  namespace: string;
  name: string;
  uid: string | null;
  status: Record<string, unknown>;
  spec: Record<string, unknown>;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  ready: string | null;
  restarts: number;
  node_name: string | null;
  pod_ip: string | null;
  age_seconds: number | null;
  cached_at: string;
}

interface K8sEvent {
  id: string;
  namespace: string;
  name: string;
  type: string | null;
  reason: string | null;
  message: string | null;
  involved_object_kind: string | null;
  involved_object_name: string | null;
  involved_object_namespace: string | null;
  source: string | null;
  first_timestamp: string | null;
  last_timestamp: string | null;
  count: number;
  ingested_at: string;
}

interface Overview {
  cluster: K8sCluster;
  resource_counts: {
    resource_type: string;
    count: string;
    healthy: string;
    unhealthy: string;
  }[];
  event_counts_24h: { type: string; count: string }[];
}

function formatAge(seconds: number | null): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function K8sPage() {
  const [clusters, setClusters] = useState<K8sCluster[]>([]);
  const [selectedCluster, setSelectedCluster] = useState<string>("");
  const [resources, setResources] = useState<K8sResource[]>([]);
  const [events, setEvents] = useState<K8sEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<
    "overview" | "pods" | "services" | "deployments" | "events"
  >("overview");
  const [namespaceFilter, setNamespaceFilter] = useState("");
  const [showRegister, setShowRegister] = useState(false);

  // Register form
  const [formName, setFormName] = useState("");
  const [formApiUrl, setFormApiUrl] = useState("");
  const [formContext, setFormContext] = useState("");
  const [formNamespace, setFormNamespace] = useState("default");

  const {
    data: cData,
    isLoading: loading,
    mutate: mutateClusters,
  } = useApi<{ clusters: K8sCluster[] }>("/api/k8s/clusters");
  const overviewUrl = selectedCluster
    ? `/api/k8s/${selectedCluster}/overview`
    : null;
  const { data: overview, mutate: mutateOverview } =
    useApi<Overview>(overviewUrl);

  useEffect(() => {
    if (cData?.clusters?.length && !selectedCluster) {
      setSelectedCluster(cData.clusters[0]!.id);
    }
  }, [cData, selectedCluster]);

  const resourceUrl = (() => {
    if (!selectedCluster) return null;
    if (tab === "pods") {
      const params = new URLSearchParams();
      if (namespaceFilter && namespaceFilter !== "all")
        params.set("namespace", namespaceFilter);
      return `/api/k8s/${selectedCluster}/resources/pod?${params.toString()}`;
    }
    if (tab === "services") {
      const params = new URLSearchParams();
      if (namespaceFilter && namespaceFilter !== "all")
        params.set("namespace", namespaceFilter);
      return `/api/k8s/${selectedCluster}/resources/service?${params.toString()}`;
    }
    if (tab === "deployments") {
      const params = new URLSearchParams();
      if (namespaceFilter && namespaceFilter !== "all")
        params.set("namespace", namespaceFilter);
      return `/api/k8s/${selectedCluster}/resources/deployment?${params.toString()}`;
    }
    return null;
  })();
  const { data: rData, mutate: mutateResources } = useApi<{
    items: K8sResource[];
  }>(resourceUrl);

  const eventsUrl = (() => {
    if (!selectedCluster || tab !== "events") return null;
    const params = new URLSearchParams();
    if (namespaceFilter && namespaceFilter !== "all")
      params.set("namespace", namespaceFilter);
    params.set("limit", "100");
    return `/api/k8s/${selectedCluster}/events?${params.toString()}`;
  })();
  const { data: eData } = useApi<{ events: K8sEvent[] }>(eventsUrl);

  useEffect(() => {
    if (rData?.items) setResources(rData.items);
  }, [rData]);

  useEffect(() => {
    if (eData?.events) setEvents(eData.events);
  }, [eData]);

  useEffect(() => {
    if (cData?.clusters) setClusters(cData.clusters);
  }, [cData]);

  async function handleRegister() {
    setError(null);
    try {
      const res = await fetch("/api/k8s/clusters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: formName,
          api_server_url: formApiUrl,
          context: formContext || undefined,
          namespace: formNamespace,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Erro ao registrar cluster");
        return;
      }
      setShowRegister(false);
      setFormName("");
      setFormApiUrl("");
      setFormContext("");
      setFormNamespace("default");
      mutateClusters();
    } catch {
      setError("Erro de conexão");
    }
  }

  async function handleSync(resourceType: string) {
    if (!selectedCluster) return;
    try {
      const res = await fetch(
        `/api/k8s/${selectedCluster}/resources/${resourceType}`,
        {
          method: "POST",
          credentials: "include",
        },
      );
      if (res.ok) {
        mutateResources();
      }
    } catch (err) {
      console.error("Operacao falhou:", err);
      setError(
        "Operação falhou: " +
          (err instanceof Error ? err.message : "erro desconhecido"),
      );
    }
  }

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
            Kubernetes — Monitoramento
          </h1>
          <p className="text-[12px]" style={{ color: COLORS.muted }}>
            Clusters · Pods · Services · Deployments · Events
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowRegister(true)}
            className="text-[12px] px-3 py-1.5 rounded font-bold"
            style={{
              background: COLORS.teal,
              color: COLORS.bg,
              cursor: "pointer",
            }}
          >
            <Plus size={12} className="inline" /> Registrar Cluster
          </button>
          <button
            onClick={() => {
              mutateClusters();
              mutateOverview();
            }}
            className="text-[12px] px-3 py-1.5 rounded border"
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
              color: COLORS.muted,
              cursor: "pointer",
            }}
          >
            <RefreshCw size={12} className="inline" /> Atualizar
          </button>
          <a
            href="/dashboard"
            className="text-[12px] px-3 py-1.5 rounded border"
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
              color: COLORS.muted,
            }}
          >
            <ArrowLeft size={12} className="inline" /> Dashboard
          </a>
        </div>
      </div>

      {error && (
        <div
          className="rounded-md p-3 text-sm"
          style={{
            background: `var(--status-error-bg)`,
            border: `1px solid var(--status-error-border)`,
            color: COLORS.red,
          }}
        >
          {error}
        </div>
      )}

      {/* Cluster selector */}
      <div
        className="rounded-xl p-4 flex flex-wrap items-end gap-4"
        style={{
          background: COLORS.card,
          border: `1px solid ${COLORS.border}`,
        }}
      >
        <div className="space-y-1">
          <label
            htmlFor="k8s-cluster-select"
            className="text-[11px] font-bold uppercase"
            style={{ color: COLORS.muted }}
          >
            Cluster
          </label>
          <select
            id="k8s-cluster-select"
            value={selectedCluster}
            onChange={(e) => setSelectedCluster(e.target.value)}
            className="rounded-md px-3 py-1.5 text-[13px]"
            style={{
              background: COLORS.bg,
              border: `1px solid ${COLORS.border}`,
              color: COLORS.text,
              minWidth: 200,
            }}
          >
            <option value="">Selecione...</option>
            {clusters.map((cl) => (
              <option key={cl.id} value={cl.id}>
                {cl.display_name ?? cl.name} {cl.is_active ? "" : "(inativo)"}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label
            htmlFor="k8s-ns-filter"
            className="text-[11px] font-bold uppercase"
            style={{ color: COLORS.muted }}
          >
            Namespace
          </label>
          <input
            id="k8s-ns-filter"
            type="text"
            value={namespaceFilter}
            onChange={(e) => setNamespaceFilter(e.target.value)}
            placeholder="all"
            className="rounded-md px-3 py-1.5 text-[13px]"
            style={{
              background: COLORS.bg,
              border: `1px solid ${COLORS.border}`,
              color: COLORS.text,
              width: 120,
            }}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 flex-wrap">
        {(
          [
            { key: "overview", label: "Overview" },
            { key: "pods", label: "Pods" },
            { key: "services", label: "Services" },
            { key: "deployments", label: "Deployments" },
            { key: "events", label: "Events" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-4 py-2 rounded-t-md text-[12px] font-bold transition-colors"
            style={{
              background: tab === t.key ? COLORS.card : "transparent",
              border: `1px solid ${COLORS.border}`,
              borderBottom:
                tab === t.key ? "none" : `1px solid ${COLORS.border}`,
              color: tab === t.key ? COLORS.teal : COLORS.muted,
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Overview */}
      {tab === "overview" && (
        <div
          className="rounded-xl p-6"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderTop: "none",
          }}
        >
          {loading ? (
            <LoadingState label="Carregando clusters..." />
          ) : !overview ? (
            <div
              className="p-8 text-center text-sm"
              style={{ color: COLORS.muted }}
            >
              Selecione um cluster
            </div>
          ) : (
            <div className="space-y-6">
              {/* Cluster info */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div
                  className="p-3 rounded-md"
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                  }}
                >
                  <div
                    className="text-[10px] uppercase mb-1"
                    style={{ color: COLORS.muted }}
                  >
                    API Server
                  </div>
                  <div
                    className="text-[12px] truncate"
                    style={{ color: COLORS.teal }}
                  >
                    {overview.cluster.api_server_url}
                  </div>
                </div>
                <div
                  className="p-3 rounded-md"
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                  }}
                >
                  <div
                    className="text-[10px] uppercase mb-1"
                    style={{ color: COLORS.muted }}
                  >
                    Context
                  </div>
                  <div className="text-[12px]" style={{ color: COLORS.text }}>
                    {overview.cluster.context ?? "—"}
                  </div>
                </div>
                <div
                  className="p-3 rounded-md"
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                  }}
                >
                  <div
                    className="text-[10px] uppercase mb-1"
                    style={{ color: COLORS.muted }}
                  >
                    Nodes
                  </div>
                  <div
                    className="text-[12px] font-bold"
                    style={{ color: COLORS.blue }}
                  >
                    {overview.cluster.node_count}
                  </div>
                </div>
                <div
                  className="p-3 rounded-md"
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                  }}
                >
                  <div
                    className="text-[10px] uppercase mb-1"
                    style={{ color: COLORS.muted }}
                  >
                    Version
                  </div>
                  <div className="text-[12px]" style={{ color: COLORS.text }}>
                    {overview.cluster.version ?? "—"}
                  </div>
                </div>
              </div>

              {/* Resource counts */}
              <div>
                <div
                  className="text-[12px] font-bold mb-3"
                  style={{ color: COLORS.muted }}
                >
                  RECURSOS
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {overview.resource_counts.map((rc) => (
                    <div
                      key={rc.resource_type}
                      className="p-3 rounded-md"
                      style={{
                        background: COLORS.bg,
                        border: `1px solid ${COLORS.border}`,
                      }}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[14px]">
                          {RESOURCE_ICONS[rc.resource_type] ?? "•"}
                        </span>
                        <span
                          className="text-[12px] font-bold uppercase"
                          style={{ color: COLORS.text }}
                        >
                          {rc.resource_type}
                        </span>
                      </div>
                      <div
                        className="text-[10px] space-y-0.5"
                        style={{ color: COLORS.muted }}
                      >
                        <div>
                          total:{" "}
                          <span style={{ color: COLORS.text }}>{rc.count}</span>
                        </div>
                        <div>
                          healthy:{" "}
                          <span style={{ color: COLORS.green }}>
                            {rc.healthy}
                          </span>
                        </div>
                        <div>
                          unhealthy:{" "}
                          <span
                            style={{
                              color:
                                rc.unhealthy !== "0" ? COLORS.red : COLORS.text,
                            }}
                          >
                            {rc.unhealthy}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {overview.resource_counts.length === 0 && (
                    <div
                      className="text-[12px] col-span-full"
                      style={{ color: COLORS.muted }}
                    >
                      Nenhum recurso em cache. Execute sync.
                    </div>
                  )}
                </div>
              </div>

              {/* Events 24h */}
              <div>
                <div
                  className="text-[12px] font-bold mb-3"
                  style={{ color: COLORS.muted }}
                >
                  EVENTOS (24h)
                </div>
                <div className="flex gap-4">
                  {overview.event_counts_24h.map((ec) => (
                    <div
                      key={ec.type}
                      className="p-3 rounded-md"
                      style={{
                        background: COLORS.bg,
                        border: `1px solid ${COLORS.border}`,
                      }}
                    >
                      <span
                        className="text-[12px] font-bold"
                        style={{
                          color:
                            ec.type === "Warning" ? COLORS.amber : COLORS.green,
                        }}
                      >
                        {ec.type}
                      </span>
                      <span
                        className="text-[16px] font-bold ml-2"
                        style={{ color: COLORS.text }}
                      >
                        {ec.count}
                      </span>
                    </div>
                  ))}
                  {overview.event_counts_24h.length === 0 && (
                    <div
                      className="text-[12px]"
                      style={{ color: COLORS.muted }}
                    >
                      Nenhum evento nas últimas 24h
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Pods */}
      {tab === "pods" && (
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderTop: "none",
          }}
        >
          <div
            className="flex items-center justify-between p-3"
            style={{ borderBottom: `1px solid ${COLORS.border}` }}
          >
            <span className="text-[12px]" style={{ color: COLORS.muted }}>
              {resources.length} pod(s)
            </span>
            <button
              onClick={() => handleSync("pod")}
              className="text-[11px] px-2 py-1 rounded font-bold"
              style={{
                background: COLORS.blue,
                color: "#fff",
                cursor: "pointer",
              }}
            >
              ↻ Sync
            </button>
          </div>
          {resources.length === 0 ? (
            <div
              className="p-8 text-center text-sm"
              style={{ color: COLORS.muted }}
            >
              Nenhum pod em cache
            </div>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Namespace
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Name
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Status
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Restarts
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Node
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    IP
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Age
                  </th>
                </tr>
              </thead>
              <tbody>
                {resources.map((r) => (
                  <tr
                    key={r.id}
                    style={{ borderBottom: `1px solid ${COLORS.border}` }}
                  >
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                      {r.namespace}
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.text }}>
                      {r.name}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className="px-2 py-0.5 rounded text-[10px] font-bold"
                        style={{
                          background: `${READY_COLORS[r.ready ?? ""] ?? COLORS.muted}15`,
                          color: READY_COLORS[r.ready ?? ""] ?? COLORS.muted,
                        }}
                      >
                        {r.ready ?? "Unknown"}
                      </span>
                    </td>
                    <td
                      className="px-3 py-2"
                      style={{
                        color: r.restarts > 0 ? COLORS.amber : COLORS.muted,
                      }}
                    >
                      {r.restarts}
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                      {r.node_name ?? "—"}
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                      {r.pod_ip ?? "—"}
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                      {formatAge(r.age_seconds)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab: Services */}
      {tab === "services" && (
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderTop: "none",
          }}
        >
          <div
            className="flex items-center justify-between p-3"
            style={{ borderBottom: `1px solid ${COLORS.border}` }}
          >
            <span className="text-[12px]" style={{ color: COLORS.muted }}>
              {resources.length} service(s)
            </span>
            <button
              onClick={() => handleSync("service")}
              className="text-[11px] px-2 py-1 rounded font-bold"
              style={{
                background: COLORS.blue,
                color: "#fff",
                cursor: "pointer",
              }}
            >
              ↻ Sync
            </button>
          </div>
          {resources.length === 0 ? (
            <div
              className="p-8 text-center text-sm"
              style={{ color: COLORS.muted }}
            >
              Nenhum service em cache
            </div>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Namespace
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Name
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Type
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Cluster IP
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Age
                  </th>
                </tr>
              </thead>
              <tbody>
                {resources.map((r) => {
                  const spec = r.spec as Record<string, unknown>;
                  return (
                    <tr
                      key={r.id}
                      style={{ borderBottom: `1px solid ${COLORS.border}` }}
                    >
                      <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                        {r.namespace}
                      </td>
                      <td className="px-3 py-2" style={{ color: COLORS.text }}>
                        {r.name}
                      </td>
                      <td className="px-3 py-2" style={{ color: COLORS.blue }}>
                        {String(spec?.type ?? "ClusterIP")}
                      </td>
                      <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                        {String(spec?.clusterIP ?? "—")}
                      </td>
                      <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                        {formatAge(r.age_seconds)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab: Deployments */}
      {tab === "deployments" && (
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderTop: "none",
          }}
        >
          <div
            className="flex items-center justify-between p-3"
            style={{ borderBottom: `1px solid ${COLORS.border}` }}
          >
            <span className="text-[12px]" style={{ color: COLORS.muted }}>
              {resources.length} deployment(s)
            </span>
            <button
              onClick={() => handleSync("deployment")}
              className="text-[11px] px-2 py-1 rounded font-bold"
              style={{
                background: COLORS.blue,
                color: "#fff",
                cursor: "pointer",
              }}
            >
              ↻ Sync
            </button>
          </div>
          {resources.length === 0 ? (
            <div
              className="p-8 text-center text-sm"
              style={{ color: COLORS.muted }}
            >
              Nenhum deployment em cache
            </div>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Namespace
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Name
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Ready
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Age
                  </th>
                </tr>
              </thead>
              <tbody>
                {resources.map((r) => (
                  <tr
                    key={r.id}
                    style={{ borderBottom: `1px solid ${COLORS.border}` }}
                  >
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                      {r.namespace}
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.text }}>
                      {r.name}
                    </td>
                    <td
                      className="px-3 py-2"
                      style={{
                        color:
                          r.ready === "Ready" ? COLORS.green : COLORS.amber,
                      }}
                    >
                      {r.ready ?? "—"}
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                      {formatAge(r.age_seconds)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab: Events */}
      {tab === "events" && (
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderTop: "none",
          }}
        >
          {events.length === 0 ? (
            <div
              className="p-8 text-center text-sm"
              style={{ color: COLORS.muted }}
            >
              Nenhum evento encontrado
            </div>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Type
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Reason
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Object
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Namespace
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Message
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Last Seen
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Count
                  </th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr
                    key={e.id}
                    style={{ borderBottom: `1px solid ${COLORS.border}` }}
                  >
                    <td className="px-3 py-2">
                      <span
                        className="px-2 py-0.5 rounded text-[10px] font-bold"
                        style={{
                          background:
                            e.type === "Warning"
                              ? `var(--status-warning-bg)`
                              : `var(--status-ok-bg)`,
                          color:
                            e.type === "Warning" ? COLORS.amber : COLORS.green,
                        }}
                      >
                        {e.type ?? "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.text }}>
                      {e.reason ?? "—"}
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                      {e.involved_object_kind}/{e.involved_object_name}
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                      {e.namespace}
                    </td>
                    <td
                      className="px-3 py-2 max-w-[300px] truncate"
                      style={{ color: COLORS.text }}
                    >
                      {e.message}
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                      {formatTime(e.last_timestamp)}
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                      {e.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modal: Registrar cluster */}
      {showRegister && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "var(--overlay-modal)" }}
          onClick={() => setShowRegister(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setShowRegister(false);
          }}
          role="button"
          tabIndex={0}
        >
          <div
            className="rounded-xl p-6 max-w-md w-full"
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
            }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="presentation"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold" style={{ color: COLORS.teal }}>
                Registrar Cluster
              </h2>
              <button
                onClick={() => setShowRegister(false)}
                className="text-[16px]"
                style={{ color: COLORS.muted, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>
            <div className="space-y-4">
              <div className="space-y-1">
                <label
                  htmlFor="k8s-name"
                  className="text-[11px] font-bold uppercase"
                  style={{ color: COLORS.muted }}
                >
                  Nome
                </label>
                <input
                  id="k8s-name"
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="prod-cluster"
                  className="w-full rounded-md px-3 py-2 text-[13px]"
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text,
                  }}
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="k8s-api"
                  className="text-[11px] font-bold uppercase"
                  style={{ color: COLORS.muted }}
                >
                  API Server URL
                </label>
                <input
                  id="k8s-api"
                  type="text"
                  value={formApiUrl}
                  onChange={(e) => setFormApiUrl(e.target.value)}
                  placeholder="https://k8s.example.com:6443"
                  className="w-full rounded-md px-3 py-2 text-[13px]"
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text,
                  }}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label
                    htmlFor="k8s-ctx"
                    className="text-[11px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    Context
                  </label>
                  <input
                    id="k8s-ctx"
                    type="text"
                    value={formContext}
                    onChange={(e) => setFormContext(e.target.value)}
                    placeholder="arn:aws:eks:..."
                    className="w-full rounded-md px-3 py-2 text-[13px]"
                    style={{
                      background: COLORS.bg,
                      border: `1px solid ${COLORS.border}`,
                      color: COLORS.text,
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="k8s-ns"
                    className="text-[11px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    Namespace
                  </label>
                  <input
                    id="k8s-ns"
                    type="text"
                    value={formNamespace}
                    onChange={(e) => setFormNamespace(e.target.value)}
                    className="w-full rounded-md px-3 py-2 text-[13px]"
                    style={{
                      background: COLORS.bg,
                      border: `1px solid ${COLORS.border}`,
                      color: COLORS.text,
                    }}
                  />
                </div>
              </div>
              <button
                onClick={handleRegister}
                disabled={!formName || !formApiUrl}
                className="w-full rounded-md py-2.5 text-sm font-bold disabled:opacity-50"
                style={{
                  background: COLORS.teal,
                  color: COLORS.bg,
                  cursor: !formName || !formApiUrl ? "not-allowed" : "pointer",
                }}
              >
                Registrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
