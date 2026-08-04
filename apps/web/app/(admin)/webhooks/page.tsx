// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState } from "react";
import { RefreshCw, ArrowLeft, Plus } from "lucide-react";
import { LoadingState } from "@/components/ui/state-display";
import { useApi } from "@/lib/use-api";

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
  purple: "var(--status-info-text)",
};

const METHODS = ["POST", "PUT", "PATCH"];
const DELIVERY_STATUS_COLORS: Record<string, string> = {
  success: COLORS.green,
  failed: COLORS.red,
  pending: COLORS.amber,
  retrying: COLORS.blue,
};

interface Webhook {
  id: string;
  name: string;
  description: string | null;
  url: string;
  method: string;
  events: string[];
  is_active: boolean;
  is_verified: boolean;
  max_retries: number;
  retry_delay_seconds: number;
  timeout_seconds: number;
  expected_status_code: number;
  last_triggered_at: string | null;
  last_delivery_status: string | null;
  total_deliveries: number;
  successful_deliveries: number;
  failed_deliveries: number;
  created_at: string;
}

interface WebhookStats {
  overview: {
    total_webhooks: string;
    active_webhooks: string;
    verified_webhooks: string;
    total_deliveries: string;
    successful_deliveries: string;
    failed_deliveries: string;
  };
  recent_deliveries: {
    id: string;
    event_name: string;
    status: string;
    attempt_number: number;
    response_status_code: number | null;
    response_time_ms: number | null;
    error_message: string | null;
    created_at: string;
    webhook_name: string;
  }[];
  pending_retries: string;
  top_webhooks: {
    id: string;
    name: string;
    total_deliveries: number;
    successful_deliveries: number;
    failed_deliveries: number;
    last_delivery_status: string | null;
  }[];
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

export default function WebhooksPage() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tab, setTab] = useState<"webhooks" | "deliveries">("webhooks");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedWebhook] = useState<string | null>(null);

  // Form
  const [fName, setFName] = useState("");
  const [fUrl, setFUrl] = useState("");
  const [fMethod, setFMethod] = useState("POST");
  const [fEvents, setFEvents] = useState("");
  const [fSecret, setFSecret] = useState("");
  const [fMaxRetries, setFMaxRetries] = useState(3);
  const [fTimeout, setFTimeout] = useState(30);
  const [fExpectedStatus, setFExpectedStatus] = useState(200);

  const { data: whData, mutate: mutateWebhooks } = useApi<{
    webhooks: Webhook[];
  }>("/api/webhooks");
  const { data: stats, mutate: mutateStats } = useApi<WebhookStats>(
    "/api/webhooks/stats",
  );

  const webhooks = whData?.webhooks ?? [];
  const loading = false;

  async function handleCreate() {
    setError(null);
    try {
      const events = fEvents
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await fetch("/api/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: fName,
          url: fUrl,
          method: fMethod,
          events,
          secret: fSecret || undefined,
          max_retries: fMaxRetries,
          timeout_seconds: fTimeout,
          expected_status_code: fExpectedStatus,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Erro ao criar webhook");
        return;
      }
      setSuccess("Webhook criado!");
      setShowCreate(false);
      setFName("");
      setFUrl("");
      setFEvents("");
      setFSecret("");
      mutateWebhooks();
      mutateStats();
    } catch {
      setError("Erro de conexão");
    }
  }

  async function handleTest(id: string) {
    try {
      const res = await fetch(`/api/webhooks/${id}/test`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(
          `Teste: ${data.success ? "✓ Sucesso" : "✕ Falha"} (${data.status_code}, ${data.response_time_ms}ms)`,
        );
        mutateWebhooks();
        mutateStats();
      }
    } catch {
      /* Ignora */
    }
  }

  async function handleToggle(id: string, active: boolean) {
    try {
      const res = await fetch(`/api/webhooks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ is_active: !active }),
      });
      if (res.ok) {
        mutateWebhooks();
        mutateStats();
      }
    } catch {
      /* Ignora */
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/webhooks/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        mutateWebhooks();
        mutateStats();
      }
    } catch {
      /* Ignora */
    }
  }

  async function handleRetry(webhookId: string, deliveryId: string) {
    try {
      const res = await fetch(
        `/api/webhooks/${webhookId}/deliveries/${deliveryId}/retry`,
        { method: "POST", credentials: "include" },
      );
      const data = await res.json();
      if (res.ok) {
        setSuccess(
          `Retry: ${data.success ? "✓ Sucesso" : "✕ Falha"} (tentativa ${data.attempt})`,
        );
        mutateStats();
      }
    } catch {
      /* Ignora */
    }
  }

  if (loading) return <LoadingState label="Carregando webhooks..." />;

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
            Webhooks — Gerenciamento de Integrações
          </h1>
          <p className="text-[12px]" style={{ color: COLORS.muted }}>
            Assinaturas HMAC · Retries · Logs de Entrega · Eventos
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCreate(true)}
            className="text-[12px] px-3 py-1.5 rounded font-bold"
            style={{
              background: COLORS.teal,
              color: COLORS.bg,
              cursor: "pointer",
            }}
          >
            <Plus size={12} className="inline" /> Webhook
          </button>
          <button
            onClick={() => {
              mutateWebhooks();
              mutateStats();
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
      {success && (
        <div
          className="rounded-md p-3 text-sm"
          style={{
            background: `var(--status-ok-bg)`,
            border: `1px solid var(--status-ok-border)`,
            color: COLORS.green,
          }}
        >
          {success}
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div
            className="p-4 rounded-xl"
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
            }}
          >
            <div
              className="text-[10px] uppercase mb-1"
              style={{ color: COLORS.muted }}
            >
              Webhooks
            </div>
            <div className="text-2xl font-bold" style={{ color: COLORS.teal }}>
              {stats.overview.total_webhooks}
            </div>
            <div className="text-[10px]" style={{ color: COLORS.muted }}>
              {stats.overview.active_webhooks} ativos ·{" "}
              {stats.overview.verified_webhooks} verificados
            </div>
          </div>
          <div
            className="p-4 rounded-xl"
            style={{
              background: COLORS.card,
              border: `1px solid var(--status-ok-border)`,
            }}
          >
            <div
              className="text-[10px] uppercase mb-1"
              style={{ color: COLORS.muted }}
            >
              Entregas
            </div>
            <div className="text-2xl font-bold" style={{ color: COLORS.green }}>
              {stats.overview.total_deliveries}
            </div>
            <div className="text-[10px]" style={{ color: COLORS.muted }}>
              {stats.overview.successful_deliveries} sucesso
            </div>
          </div>
          <div
            className="p-4 rounded-xl"
            style={{
              background: COLORS.card,
              border: `1px solid var(--status-error-border)`,
            }}
          >
            <div
              className="text-[10px] uppercase mb-1"
              style={{ color: COLORS.muted }}
            >
              Falhas
            </div>
            <div className="text-2xl font-bold" style={{ color: COLORS.red }}>
              {stats.overview.failed_deliveries}
            </div>
          </div>
          <div
            className="p-4 rounded-xl"
            style={{
              background: COLORS.card,
              border: `1px solid var(--status-warning-border)`,
            }}
          >
            <div
              className="text-[10px] uppercase mb-1"
              style={{ color: COLORS.muted }}
            >
              Retries Pendentes
            </div>
            <div className="text-2xl font-bold" style={{ color: COLORS.amber }}>
              {stats.pending_retries}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1">
        {(
          [
            { key: "webhooks", label: `Webhooks (${webhooks.length})` },
            { key: "deliveries", label: "Entregas Recentes" },
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

      {/* Tab: Webhooks */}
      {tab === "webhooks" && (
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderTop: "none",
          }}
        >
          {webhooks.length === 0 ? (
            <div
              className="p-8 text-center text-sm"
              style={{ color: COLORS.muted }}
            >
              Nenhum webhook configurado
            </div>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Nome
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    URL
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Método
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Eventos
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
                    Entregas
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Último
                  </th>
                  <th
                    className="text-right px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  ></th>
                </tr>
              </thead>
              <tbody>
                {webhooks.map((w) => (
                  <tr
                    key={w.id}
                    style={{
                      borderBottom: `1px solid ${COLORS.border}`,
                      opacity: w.is_active ? 1 : 0.4,
                    }}
                  >
                    <td className="px-3 py-2" style={{ color: COLORS.teal }}>
                      {w.name}
                      {w.is_verified && (
                        <span
                          className="text-[10px] ml-1"
                          style={{ color: COLORS.green }}
                        >
                          ✓ verified
                        </span>
                      )}
                    </td>
                    <td
                      className="px-3 py-2 max-w-[200px] truncate"
                      style={{ color: COLORS.muted }}
                    >
                      {w.url}
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                      {w.method}
                    </td>
                    <td
                      className="px-3 py-2 max-w-[120px] truncate"
                      style={{ color: COLORS.muted }}
                    >
                      {Array.isArray(w.events) ? w.events.join(", ") : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                        style={{
                          background: w.is_active
                            ? `var(--status-ok-bg)`
                            : `color-mix(in srgb, var(--text-muted) 8%, transparent)`,
                          color: w.is_active ? COLORS.green : COLORS.muted,
                        }}
                      >
                        {w.is_active ? "active" : "inactive"}
                      </span>
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                      <span style={{ color: COLORS.blue }}>
                        {w.total_deliveries}
                      </span>
                      <span className="text-[10px]">
                        {" "}
                        ({w.successful_deliveries}✓ / {w.failed_deliveries}✕)
                      </span>
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                      {formatTime(w.last_triggered_at)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex gap-1 justify-end">
                        <button
                          onClick={() => handleTest(w.id)}
                          className="px-2 py-1 rounded text-[10px] font-bold"
                          style={{
                            background: `color-mix(in srgb, var(--status-info-text) 12%, transparent)`,
                            border: `1px solid var(--status-info-border)`,
                            color: COLORS.blue,
                            cursor: "pointer",
                          }}
                        >
                          Test
                        </button>
                        <button
                          onClick={() => handleToggle(w.id, w.is_active)}
                          className="px-2 py-1 rounded text-[10px] font-bold"
                          style={{
                            background: `color-mix(in srgb, var(--status-warning-text) 12%, transparent)`,
                            border: `1px solid var(--status-warning-border)`,
                            color: COLORS.amber,
                            cursor: "pointer",
                          }}
                        >
                          {w.is_active ? "Disable" : "Enable"}
                        </button>
                        <button
                          onClick={() => handleDelete(w.id)}
                          className="px-2 py-1 rounded text-[10px] font-bold"
                          style={{
                            background: `color-mix(in srgb, var(--status-error-text) 12%, transparent)`,
                            border: `1px solid var(--status-error-border)`,
                            color: COLORS.red,
                            cursor: "pointer",
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab: Deliveries */}
      {tab === "deliveries" && (
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderTop: "none",
          }}
        >
          {(stats?.recent_deliveries ?? []).length === 0 ? (
            <div
              className="p-8 text-center text-sm"
              style={{ color: COLORS.muted }}
            >
              Nenhuma entrega registrada
            </div>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Evento
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
                    Tentativa
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    HTTP
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Tempo
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Erro
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Data
                  </th>
                  <th
                    className="text-right px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  ></th>
                </tr>
              </thead>
              <tbody>
                {(stats?.recent_deliveries ?? []).map((d) => (
                  <tr
                    key={d.id}
                    style={{ borderBottom: `1px solid ${COLORS.border}` }}
                  >
                    <td className="px-3 py-2" style={{ color: COLORS.teal }}>
                      {d.event_name}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                        style={{
                          background: `${DELIVERY_STATUS_COLORS[d.status] ?? COLORS.muted}15`,
                          color:
                            DELIVERY_STATUS_COLORS[d.status] ?? COLORS.muted,
                        }}
                      >
                        {d.status}
                      </span>
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                      #{d.attempt_number}
                    </td>
                    <td
                      className="px-3 py-2"
                      style={{
                        color:
                          d.response_status_code &&
                          d.response_status_code >= 200 &&
                          d.response_status_code < 300
                            ? COLORS.green
                            : COLORS.red,
                      }}
                    >
                      {d.response_status_code ?? "—"}
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                      {d.response_time_ms != null
                        ? `${d.response_time_ms}ms`
                        : "—"}
                    </td>
                    <td
                      className="px-3 py-2 max-w-[200px] truncate"
                      style={{ color: COLORS.red }}
                    >
                      {d.error_message ?? "—"}
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                      {formatTime(d.created_at)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {d.status !== "success" && (
                        <button
                          onClick={() =>
                            handleRetry(selectedWebhook ?? "", d.id)
                          }
                          disabled={!selectedWebhook}
                          className="px-2 py-1 rounded text-[10px] font-bold disabled:opacity-30"
                          style={{
                            background: `color-mix(in srgb, var(--status-info-text) 12%, transparent)`,
                            border: `1px solid color-mix(in srgb, var(--status-info-text) 27%, transparent)`,
                            color: COLORS.purple,
                            cursor: selectedWebhook ? "pointer" : "not-allowed",
                          }}
                        >
                          Retry
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modal: Create */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "var(--overlay-modal)" }}
          onClick={() => setShowCreate(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setShowCreate(false);
          }}
          role="button"
          tabIndex={0}
        >
          <div
            className="rounded-xl p-6 max-w-md w-full max-h-[85vh] overflow-y-auto"
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
                Novo Webhook
              </h2>
              <button
                onClick={() => setShowCreate(false)}
                className="text-[16px]"
                style={{ color: COLORS.muted, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>
            <div className="space-y-4">
              <div className="space-y-1">
                <label
                  htmlFor="wh-n"
                  className="text-[11px] font-bold uppercase"
                  style={{ color: COLORS.muted }}
                >
                  Nome
                </label>
                <input
                  id="wh-n"
                  type="text"
                  value={fName}
                  onChange={(e) => setFName(e.target.value)}
                  placeholder="Slack Notification"
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
                  htmlFor="wh-u"
                  className="text-[11px] font-bold uppercase"
                  style={{ color: COLORS.muted }}
                >
                  URL
                </label>
                <input
                  id="wh-u"
                  type="text"
                  value={fUrl}
                  onChange={(e) => setFUrl(e.target.value)}
                  placeholder="https://hooks.slack.com/services/..."
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
                    htmlFor="wh-m"
                    className="text-[11px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    Método
                  </label>
                  <select
                    id="wh-m"
                    value={fMethod}
                    onChange={(e) => setFMethod(e.target.value)}
                    className="w-full rounded-md px-3 py-2 text-[12px]"
                    style={{
                      background: COLORS.bg,
                      border: `1px solid ${COLORS.border}`,
                      color: COLORS.text,
                    }}
                  >
                    {METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="wh-s"
                    className="text-[11px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    Secret (opcional)
                  </label>
                  <input
                    id="wh-s"
                    type="text"
                    value={fSecret}
                    onChange={(e) => setFSecret(e.target.value)}
                    placeholder="whsec_..."
                    className="w-full rounded-md px-3 py-2 text-[13px]"
                    style={{
                      background: COLORS.bg,
                      border: `1px solid ${COLORS.border}`,
                      color: COLORS.text,
                    }}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="wh-e"
                  className="text-[11px] font-bold uppercase"
                  style={{ color: COLORS.muted }}
                >
                  Eventos (vírgula)
                </label>
                <input
                  id="wh-e"
                  type="text"
                  value={fEvents}
                  onChange={(e) => setFEvents(e.target.value)}
                  placeholder="device.created, device.deleted"
                  className="w-full rounded-md px-3 py-2 text-[13px]"
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text,
                  }}
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label
                    htmlFor="wh-r"
                    className="text-[11px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    Max Retries
                  </label>
                  <input
                    id="wh-r"
                    type="number"
                    value={fMaxRetries}
                    onChange={(e) =>
                      setFMaxRetries(parseInt(e.target.value, 10) || 3)
                    }
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
                    htmlFor="wh-t"
                    className="text-[11px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    Timeout (s)
                  </label>
                  <input
                    id="wh-t"
                    type="number"
                    value={fTimeout}
                    onChange={(e) =>
                      setFTimeout(parseInt(e.target.value, 10) || 30)
                    }
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
                    htmlFor="wh-sc"
                    className="text-[11px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    Status Esperado
                  </label>
                  <input
                    id="wh-sc"
                    type="number"
                    value={fExpectedStatus}
                    onChange={(e) =>
                      setFExpectedStatus(parseInt(e.target.value, 10) || 200)
                    }
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
                onClick={handleCreate}
                disabled={!fName || !fUrl || !fEvents}
                className="w-full rounded-md py-2.5 text-sm font-bold disabled:opacity-50"
                style={{
                  background: COLORS.teal,
                  color: COLORS.bg,
                  cursor:
                    !fName || !fUrl || !fEvents ? "not-allowed" : "pointer",
                }}
              >
                Criar Webhook
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
