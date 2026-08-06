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

interface ApiKey {
  id: string;
  name: string;
  description: string | null;
  key_prefix: string;
  scopes: string[];
  allowed_ips: string[];
  rate_limit_per_min: number;
  rate_limit_per_hour: number;
  rate_limit_per_day: number;
  is_active: boolean;
  expires_at: string | null;
  last_used_at: string | null;
  last_used_ip: string | null;
  total_requests: string;
  requests_today: number;
  requests_this_hour: number;
  requests_this_minute: number;
  rotated_from: string | null;
  rotated_at: string | null;
  created_at: string;
}

interface KeyStats {
  overview: {
    total_keys: string;
    active_keys: string;
    expired: string;
    expiring_soon: string;
    total_requests: string;
    requests_today: string;
  };
  top_keys: {
    id: string;
    name: string;
    key_prefix: string;
    total_requests: string;
    requests_today: number;
    last_used_at: string | null;
    is_active: boolean;
  }[];
  recent_usage: { day: string; requests: string }[];
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

export default function ApiKeysPage() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);

  // Form
  const [fName, setFName] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fScopes, setFScopes] = useState("");
  const [fIps, setFIps] = useState("");
  const [fRateMin, setFRateMin] = useState(60);
  const [fRateHour, setFRateHour] = useState(3600);
  const [fRateDay, setFRateDay] = useState(86400);
  const [fExpires, setFExpires] = useState("");

  const { data: kData, mutate: mutateKeys } = useApi<{ keys: ApiKey[] }>(
    "/api/api-keys",
  );
  const { data: stats, mutate: mutateStats } = useApi<KeyStats>(
    "/api/api-keys/stats",
  );

  const keys = kData?.keys ?? [];
  const loading = false;

  async function handleCreate() {
    setError(null);
    try {
      const scopes = fScopes
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const ips = fIps
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: fName,
          description: fDesc || undefined,
          scopes,
          allowed_ips: ips,
          rate_limit_per_min: fRateMin,
          rate_limit_per_hour: fRateHour,
          rate_limit_per_day: fRateDay,
          expires_at: fExpires || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Erro ao criar API key");
        return;
      }
      setNewKey(data.key);
      setSuccess(
        "API key criada! Copie a chave agora — ela não será exibida novamente.",
      );
      setShowCreate(false);
      setFName("");
      setFDesc("");
      setFScopes("");
      setFIps("");
      setFExpires("");
      mutateKeys();
      mutateStats();
    } catch {
      setError("Erro de conexão");
    }
  }

  async function handleRotate(id: string) {
    try {
      const res = await fetch(`/api/api-keys/${id}/rotate`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok) {
        setNewKey(data.key);
        setSuccess("Chave rotacionada! Copie a nova chave agora.");
        mutateKeys();
        mutateStats();
      }
    } catch (err) {
      console.error("Operacao falhou:", err);
    }
  }

  async function handleToggle(id: string, active: boolean) {
    try {
      const res = await fetch(`/api/api-keys/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ is_active: !active }),
      });
      if (res.ok) {
        mutateKeys();
        mutateStats();
      }
    } catch (err) {
      console.error("Operacao falhou:", err);
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/api-keys/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        mutateKeys();
        mutateStats();
      }
    } catch (err) {
      console.error("Operacao falhou:", err);
    }
  }

  function copyKey() {
    if (newKey) {
      navigator.clipboard.writeText(newKey);
      setSuccess("Chave copiada para a área de transferência!");
    }
  }

  const [now, setNow] = useState(0);

  useEffect(() => {
    setNow(Date.now());
  }, [kData]);

  if (loading) return <LoadingState label="Carregando API Keys..." />;

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
            API Keys — Gerenciamento de Chaves
          </h1>
          <p className="text-[12px]" style={{ color: COLORS.muted }}>
            Escopos · Rate Limiting · Rotação · IP Allowlist · Expiração
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
            <Plus size={12} className="inline" /> API Key
          </button>
          <button
            onClick={() => {
              mutateKeys();
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

      {/* New key banner */}
      {newKey && (
        <div
          className="rounded-md p-4"
          style={{
            background: `var(--status-warning-bg)`,
            border: `1px solid var(--status-warning-border)`,
          }}
        >
          <div
            className="text-[12px] font-bold mb-2"
            style={{ color: COLORS.amber }}
          >
            ⚠ Nova API Key — copie agora!
          </div>
          <div className="flex items-center gap-3">
            <code
              className="flex-1 text-[12px] p-2 rounded overflow-x-auto"
              style={{
                background: COLORS.bg,
                border: `1px solid ${COLORS.border}`,
                color: COLORS.teal,
              }}
            >
              {newKey}
            </code>
            <button
              onClick={copyKey}
              className="px-3 py-2 rounded text-[12px] font-bold"
              style={{
                background: COLORS.teal,
                color: COLORS.bg,
                cursor: "pointer",
              }}
            >
              Copiar
            </button>
            <button
              onClick={() => setNewKey(null)}
              className="px-3 py-2 rounded text-[12px] font-bold"
              style={{
                background: COLORS.card,
                border: `1px solid ${COLORS.border}`,
                color: COLORS.muted,
                cursor: "pointer",
              }}
            >
              Fechar
            </button>
          </div>
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
              Total Keys
            </div>
            <div className="text-2xl font-bold" style={{ color: COLORS.teal }}>
              {stats.overview.total_keys}
            </div>
            <div className="text-[10px]" style={{ color: COLORS.muted }}>
              {stats.overview.active_keys} ativas
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
              Expirando
            </div>
            <div className="text-2xl font-bold" style={{ color: COLORS.amber }}>
              {stats.overview.expiring_soon}
            </div>
            <div className="text-[10px]" style={{ color: COLORS.muted }}>
              {stats.overview.expired} expiradas
            </div>
          </div>
          <div
            className="p-4 rounded-xl"
            style={{
              background: COLORS.card,
              border: `1px solid var(--status-info-border)`,
            }}
          >
            <div
              className="text-[10px] uppercase mb-1"
              style={{ color: COLORS.muted }}
            >
              Total Requests
            </div>
            <div className="text-2xl font-bold" style={{ color: COLORS.blue }}>
              {stats.overview.total_requests}
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
              Requests Hoje
            </div>
            <div className="text-2xl font-bold" style={{ color: COLORS.green }}>
              {stats.overview.requests_today}
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: COLORS.card,
          border: `1px solid ${COLORS.border}`,
        }}
      >
        {keys.length === 0 ? (
          <div
            className="p-8 text-center text-sm"
            style={{ color: COLORS.muted }}
          >
            Nenhuma API key criada
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
                  Prefixo
                </th>
                <th
                  className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                  style={{ color: COLORS.muted }}
                >
                  Escopos
                </th>
                <th
                  className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                  style={{ color: COLORS.muted }}
                >
                  Rate Limit
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
                  Requests
                </th>
                <th
                  className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                  style={{ color: COLORS.muted }}
                >
                  Expira
                </th>
                <th
                  className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                  style={{ color: COLORS.muted }}
                >
                  Último uso
                </th>
                <th
                  className="text-right px-3 py-2 font-bold uppercase text-[10px]"
                  style={{ color: COLORS.muted }}
                ></th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => {
                const isExpired =
                  k.expires_at && new Date(k.expires_at).getTime() < now;
                const isExpiringSoon =
                  k.expires_at &&
                  !isExpired &&
                  new Date(k.expires_at).getTime() <
                    now + 7 * 24 * 60 * 60 * 1000;
                return (
                  <tr
                    key={k.id}
                    style={{
                      borderBottom: `1px solid ${COLORS.border}`,
                      opacity: k.is_active ? 1 : 0.4,
                    }}
                  >
                    <td className="px-3 py-2" style={{ color: COLORS.teal }}>
                      {k.name}
                      {k.rotated_from && (
                        <span
                          className="text-[10px] ml-1"
                          style={{ color: COLORS.purple }}
                        >
                          ↻ rotated
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                      {k.key_prefix}...
                    </td>
                    <td
                      className="px-3 py-2 max-w-[120px] truncate"
                      style={{ color: COLORS.muted }}
                    >
                      {Array.isArray(k.scopes)
                        ? k.scopes.join(", ") || "—"
                        : "—"}
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                      {k.rate_limit_per_min}/min
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                        style={{
                          background: k.is_active
                            ? `var(--status-ok-bg)`
                            : `color-mix(in srgb, var(--text-muted) 8%, transparent)`,
                          color: k.is_active ? COLORS.green : COLORS.muted,
                        }}
                      >
                        {k.is_active ? "active" : "inactive"}
                      </span>
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                      <span style={{ color: COLORS.blue }}>
                        {k.total_requests}
                      </span>
                      <span className="text-[10px]">
                        {" "}
                        ({k.requests_today}/hoje)
                      </span>
                    </td>
                    <td
                      className="px-3 py-2"
                      style={{
                        color: isExpired
                          ? COLORS.red
                          : isExpiringSoon
                            ? COLORS.amber
                            : COLORS.muted,
                      }}
                    >
                      {formatTime(k.expires_at)}
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                      {formatTime(k.last_used_at)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex gap-1 justify-end">
                        <button
                          onClick={() => handleRotate(k.id)}
                          className="px-2 py-1 rounded text-[10px] font-bold"
                          style={{
                            background: `color-mix(in srgb, var(--status-info-text) 12%, transparent)`,
                            border: `1px solid color-mix(in srgb, var(--status-info-text) 27%, transparent)`,
                            color: COLORS.purple,
                            cursor: "pointer",
                          }}
                        >
                          Rotate
                        </button>
                        <button
                          onClick={() => handleToggle(k.id, k.is_active)}
                          className="px-2 py-1 rounded text-[10px] font-bold"
                          style={{
                            background: `color-mix(in srgb, var(--status-warning-text) 12%, transparent)`,
                            border: `1px solid var(--status-warning-border)`,
                            color: COLORS.amber,
                            cursor: "pointer",
                          }}
                        >
                          {k.is_active ? "Disable" : "Enable"}
                        </button>
                        <button
                          onClick={() => handleDelete(k.id)}
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
                );
              })}
            </tbody>
          </table>
        )}
      </div>

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
                Nova API Key
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
                  htmlFor="ak-n"
                  className="text-[11px] font-bold uppercase"
                  style={{ color: COLORS.muted }}
                >
                  Nome
                </label>
                <input
                  id="ak-n"
                  type="text"
                  value={fName}
                  onChange={(e) => setFName(e.target.value)}
                  placeholder="Mobile App Integration"
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
                  htmlFor="ak-d"
                  className="text-[11px] font-bold uppercase"
                  style={{ color: COLORS.muted }}
                >
                  Descrição (opcional)
                </label>
                <input
                  id="ak-d"
                  type="text"
                  value={fDesc}
                  onChange={(e) => setFDesc(e.target.value)}
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
                  htmlFor="ak-s"
                  className="text-[11px] font-bold uppercase"
                  style={{ color: COLORS.muted }}
                >
                  Escopos (vírgula)
                </label>
                <input
                  id="ak-s"
                  type="text"
                  value={fScopes}
                  onChange={(e) => setFScopes(e.target.value)}
                  placeholder="devices:read, monitoring:read"
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
                  htmlFor="ak-i"
                  className="text-[11px] font-bold uppercase"
                  style={{ color: COLORS.muted }}
                >
                  IPs Permitidas (vírgula, opcional)
                </label>
                <input
                  id="ak-i"
                  type="text"
                  value={fIps}
                  onChange={(e) => setFIps(e.target.value)}
                  placeholder="192.168.1.1, 10.0.0.0/24"
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
                    htmlFor="ak-rm"
                    className="text-[11px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    Rate/min
                  </label>
                  <input
                    id="ak-rm"
                    type="number"
                    value={fRateMin}
                    onChange={(e) =>
                      setFRateMin(parseInt(e.target.value, 10) || 60)
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
                    htmlFor="ak-rh"
                    className="text-[11px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    Rate/hora
                  </label>
                  <input
                    id="ak-rh"
                    type="number"
                    value={fRateHour}
                    onChange={(e) =>
                      setFRateHour(parseInt(e.target.value, 10) || 3600)
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
                    htmlFor="ak-rd"
                    className="text-[11px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    Rate/dia
                  </label>
                  <input
                    id="ak-rd"
                    type="number"
                    value={fRateDay}
                    onChange={(e) =>
                      setFRateDay(parseInt(e.target.value, 10) || 86400)
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
              <div className="space-y-1">
                <label
                  htmlFor="ak-e"
                  className="text-[11px] font-bold uppercase"
                  style={{ color: COLORS.muted }}
                >
                  Expira em (opcional)
                </label>
                <input
                  id="ak-e"
                  type="datetime-local"
                  value={fExpires}
                  onChange={(e) =>
                    setFExpires(
                      e.target.value
                        ? new Date(e.target.value).toISOString()
                        : "",
                    )
                  }
                  className="w-full rounded-md px-3 py-2 text-[13px]"
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text,
                  }}
                />
              </div>
              <button
                onClick={handleCreate}
                disabled={!fName}
                className="w-full rounded-md py-2.5 text-sm font-bold disabled:opacity-50"
                style={{
                  background: COLORS.teal,
                  color: COLORS.bg,
                  cursor: !fName ? "not-allowed" : "pointer",
                }}
              >
                Criar API Key
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
