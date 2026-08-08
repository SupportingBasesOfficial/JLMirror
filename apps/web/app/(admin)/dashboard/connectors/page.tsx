// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState } from "react";
import {
  RefreshCw,
  Plug,
  Plus,
  Trash2,
  Loader2,
  Check,
  AlertCircle,
  Copy,
} from "lucide-react";
import { apiFetch } from "@/lib/zabbix-fetch";
import { useApi } from "@/lib/use-api";
import { useZabbixWrite } from "@/lib/use-zabbix-write";
import {
  ErrorState,
  EmptyState,
  LoadingState,
} from "@/components/ui/state-display";

interface ZabbixConnector {
  connectorid: string;
  name: string;
  url: string;
  data_type: string;
  status: string;
}

export default function ConnectorsPage() {
  const { data, error, isLoading, progress, mutate } = useApi<{
    data: ZabbixConnector[];
  }>("/api/zabbix/connectors");
  const connectors = data?.data ?? [];
  const [showSetup, setShowSetup] = useState(false);
  const [dataType, setDataType] = useState("history");
  const [connectorName, setConnectorName] = useState("");
  const [setupResult, setSetupResult] = useState<{
    stream_url: string;
    connectorids: string[];
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { write, status: writeStatus } = useZabbixWrite({
    onSuccess: (result) => {
      setSetupResult(result as { stream_url: string; connectorids: string[] });
      void mutate();
    },
    onError: (err) => setActionError(err),
  });

  async function handleSetup() {
    setActionError(null);
    setSetupResult(null);
    await write("/api/zabbix/connector/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: connectorName.trim() || undefined,
        data_type: dataType,
      }),
    });
  }

  async function handleDelete(connectorId: string) {
    if (
      !confirm(
        "Confirma remover este connector? O token de streaming será invalidado.",
      )
    )
      return;
    setActionError(null);
    try {
      await apiFetch(`/api/zabbix/connector/${connectorId}`, {
        method: "DELETE",
      });
      await mutate();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Erro ao remover connector",
      );
    }
  }

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const isPending = writeStatus === "pending";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Plug size={20} style={{ color: "var(--brand-primary)" }} />
          <h1
            className="text-xl font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            Connectors de Streaming
          </h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowSetup((v) => !v)}
            disabled={isPending}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors hover:opacity-80 disabled:opacity-50"
            style={{
              background: "var(--brand-glow)",
              border: "1px solid var(--brand-primary)",
              color: "var(--brand-primary)",
            }}
          >
            <Plus size={14} />
            Configurar Connector
          </button>
          <button
            onClick={() => mutate()}
            disabled={isPending}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors hover:opacity-80 disabled:opacity-50"
            style={{
              background: "var(--brand-glow)",
              border: "1px solid var(--brand-primary)",
              color: "var(--brand-primary)",
            }}
          >
            <RefreshCw size={14} />
            Atualizar
          </button>
        </div>
      </div>

      {writeStatus === "pending" && (
        <div
          className="flex items-center gap-2 rounded-lg p-3"
          style={{
            background: "var(--brand-glow)",
            border: "1px solid var(--brand-primary)",
          }}
        >
          <Loader2
            size={16}
            className="animate-spin"
            style={{ color: "var(--brand-primary)" }}
          />
          <span className="text-sm" style={{ color: "var(--brand-primary)" }}>
            Configurando connector no Zabbix...
          </span>
        </div>
      )}
      {writeStatus === "success" && setupResult && (
        <div
          className="rounded-lg p-4"
          style={{
            background: "var(--status-success-bg)",
            border: "1px solid var(--status-success-border)",
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Check size={16} style={{ color: "var(--status-success-text)" }} />
            <span
              className="text-sm font-medium"
              style={{ color: "var(--status-success-text)" }}
            >
              Connector criado com sucesso!
            </span>
          </div>
          <div className="mt-2 space-y-2">
            <div>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                URL do endpoint receptor:
              </span>
              <div className="flex items-center gap-2 mt-1">
                <code
                  className="text-xs flex-1 rounded p-2"
                  style={{
                    background: "var(--surface-0)",
                    color: "var(--text-primary)",
                  }}
                >
                  {setupResult.stream_url}
                </code>
                <button
                  onClick={() => copyUrl(setupResult.stream_url)}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg"
                  style={{
                    background: "var(--surface-3)",
                    color: "var(--text-primary)",
                  }}
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? "Copiado" : "Copiar"}
                </button>
              </div>
            </div>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              O Zabbix connector enviará dados de history para esta URL
              automaticamente. Os dados serão armazenados no TimescaleDB e o
              dashboard os usará como cache.
            </p>
          </div>
        </div>
      )}
      {writeStatus === "error" && (
        <div
          className="flex items-center gap-2 rounded-lg p-3"
          style={{
            background: "var(--status-error-bg)",
            border: "1px solid var(--status-error-border)",
          }}
        >
          <AlertCircle
            size={16}
            style={{ color: "var(--status-error-text)" }}
          />
          <span
            className="text-sm"
            style={{ color: "var(--status-error-text)" }}
          >
            Falha ao configurar connector. Verifique se o Zabbix está acessível.
          </span>
        </div>
      )}

      {showSetup && (
        <div
          className="space-y-3 rounded-lg p-4"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border-default)",
          }}
        >
          <h3
            className="text-sm font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            Configurar novo connector
          </h3>
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Nome do connector (opcional)..."
              value={connectorName}
              onChange={(e) => setConnectorName(e.target.value)}
              disabled={isPending}
              className="flex-1 rounded-lg px-3 py-1.5 text-sm outline-none disabled:opacity-50"
              style={{
                background: "var(--surface-0)",
                border: "1px solid var(--border-default)",
                color: "var(--text-primary)",
              }}
            />
            <select
              value={dataType}
              onChange={(e) => setDataType(e.target.value)}
              disabled={isPending}
              className="rounded-lg px-3 py-1.5 text-sm outline-none disabled:opacity-50"
              style={{
                background: "var(--surface-0)",
                border: "1px solid var(--border-default)",
                color: "var(--text-primary)",
              }}
            >
              <option value="history">History</option>
              <option value="trends">Trends</option>
              <option value="events">Events</option>
            </select>
            <button
              onClick={handleSetup}
              disabled={isPending}
              className="flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium disabled:opacity-50"
              style={{
                background: "var(--brand-primary)",
                color: "var(--surface-0)",
              }}
            >
              {isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Plus size={14} />
              )}
              Criar
            </button>
          </div>
        </div>
      )}

      {(error || actionError) && (
        <ErrorState
          title="Erro"
          message={error ?? actionError ?? "Erro desconhecido"}
        />
      )}

      {isLoading ? (
        <LoadingState label="Carregando connectors..." progress={progress} />
      ) : connectors.length === 0 ? (
        <EmptyState title="Nenhum connector configurado" />
      ) : (
        <div className="space-y-2">
          {connectors.map((conn) => (
            <div
              key={conn.connectorid}
              className="rounded-lg p-4"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border-default)",
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <span
                    className="text-sm font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {conn.name}
                  </span>
                  <span
                    className="text-xs ml-2 px-1.5 py-0.5 rounded"
                    style={{
                      background: "var(--brand-glow)",
                      color: "var(--brand-primary)",
                    }}
                  >
                    {conn.data_type}
                  </span>
                  {conn.status === "0" && (
                    <span
                      className="text-xs ml-2 px-1.5 py-0.5 rounded"
                      style={{
                        background: "var(--status-success-bg)",
                        color: "var(--status-success-text)",
                      }}
                    >
                      Ativo
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(conn.connectorid)}
                  disabled={isPending}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
                  style={{
                    background: "var(--status-error-bg)",
                    border: "1px solid var(--status-error-border)",
                    color: "var(--status-error-text)",
                  }}
                >
                  <Trash2 size={12} />
                  Remover
                </button>
              </div>
              <div className="mt-2">
                <code
                  className="text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  {conn.url}
                </code>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
