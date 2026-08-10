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

const STATUS_COLORS: Record<string, string> = {
  pending: COLORS.amber,
  approved: COLORS.blue,
  running: COLORS.teal,
  completed: COLORS.green,
  failed: COLORS.red,
  timeout: COLORS.red,
  cancelled: COLORS.muted,
  rejected: COLORS.red,
};

const LANG_COLORS: Record<string, string> = {
  bash: COLORS.green,
  python: COLORS.blue,
  powershell: COLORS.purple,
  node: COLORS.teal,
};

interface Script {
  id: string;
  name: string;
  description: string | null;
  language: string;
  version: number;
  timeout_seconds: number;
  requires_approval: boolean;
  max_concurrent_executions: number;
  allowed_hosts: string[];
  tags: string[];
  is_active: boolean;
  created_at: string;
}

interface Execution {
  id: string;
  script_id: string;
  version: number;
  status: string;
  target_host: string;
  initiated_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  exit_code: number | null;
  duration_ms: number | null;
  created_at: string;
  script_name?: string;
  script_language?: string;
}

interface PendingExecution extends Execution {
  script_name: string;
  script_language: string;
  requires_approval: boolean;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export default function ScriptsPage() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tab, setTab] = useState<"scripts" | "executions" | "pending">(
    "scripts",
  );
  const [showCreate, setShowCreate] = useState(false);
  const [executeScript, setExecuteScript] = useState<Script | null>(null);
  const [targetHost, setTargetHost] = useState("");
  const [execStatusFilter, setExecStatusFilter] = useState("");

  // Create form
  const [formName, setFormName] = useState("");
  const [formLanguage, setFormLanguage] = useState("bash");
  const [formContent, setFormContent] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formTimeout, setFormTimeout] = useState(300);
  const [formRequiresApproval, setFormRequiresApproval] = useState(true);
  const [formAllowedHosts, setFormAllowedHosts] = useState("");

  const scriptsQuery = "/api/scripts?active=true";
  const execQuery = (() => {
    const params = new URLSearchParams();
    if (execStatusFilter) params.set("status", execStatusFilter);
    params.set("limit", "50");
    return `/api/executions?${params.toString()}`;
  })();
  const {
    data: sData,
    isLoading: loading,
    mutate: mutateScripts,
  } = useApi<{ data: Script[] }>(scriptsQuery);
  const { data: eData, mutate: mutateExecutions } = useApi<{
    data: Execution[];
  }>(execQuery);
  const { data: pData, mutate: mutatePending } = useApi<{
    pending: PendingExecution[];
  }>("/api/executions/pending");
  const scripts = sData?.data ?? [];
  const executions = eData?.data ?? [];
  const pending = pData?.pending ?? [];

  async function handleCreate() {
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: formName,
          description: formDescription || undefined,
          language: formLanguage,
          content: formContent,
          timeout_seconds: formTimeout,
          requires_approval: formRequiresApproval,
          allowed_hosts: formAllowedHosts
            ? formAllowedHosts.split(",").map((h) => h.trim())
            : [],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Erro ao criar script");
        return;
      }
      setSuccess("Script criado com sucesso!");
      setShowCreate(false);
      setFormName("");
      setFormContent("");
      setFormDescription("");
      setFormAllowedHosts("");
      mutateScripts();
    } catch {
      setError("Erro de conexão");
    }
  }

  async function handleExecute() {
    if (!executeScript || !targetHost) return;
    setError(null);
    try {
      const res = await fetch(`/api/scripts/${executeScript.id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ target_host: targetHost }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Erro ao executar script");
        return;
      }
      setSuccess(data.message ?? "Execução criada");
      setExecuteScript(null);
      setTargetHost("");
      mutateExecutions();
      mutatePending();
    } catch {
      setError("Erro de conexão");
    }
  }

  async function handleApprove(
    executionId: string,
    decision: "approved" | "rejected",
  ) {
    setError(null);
    try {
      const res = await fetch(`/api/executions/${executionId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ decision }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Erro ao aprovar");
        return;
      }
      setSuccess(
        `Execução ${decision === "approved" ? "aprovada" : "rejeitada"}`,
      );
      mutatePending();
      mutateExecutions();
    } catch {
      setError("Erro de conexão");
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
            Automação — Scripts
          </h1>
          <p className="text-[12px]" style={{ color: COLORS.muted }}>
            Execução remota com approval workflow
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
            <Plus size={12} className="inline" /> Novo Script
          </button>
          <button
            onClick={() => {
              mutateScripts();
              mutateExecutions();
              mutatePending();
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

      {/* Tabs */}
      <div className="flex gap-1">
        {(
          [
            { key: "scripts", label: `Scripts (${scripts.length})` },
            { key: "pending", label: `Aprovações (${pending.length})` },
            { key: "executions", label: "Execuções" },
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

      {/* Tab: Scripts */}
      {tab === "scripts" && (
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderTop: "none",
          }}
        >
          {loading ? (
            <LoadingState label="Carregando scripts..." />
          ) : scripts.length === 0 ? (
            <div
              className="p-8 text-center text-sm"
              style={{ color: COLORS.muted }}
            >
              Nenhum script ativo
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
                    Linguagem
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Versão
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Timeout
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Approval
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Hosts
                  </th>
                  <th
                    className="text-right px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {scripts.map((s) => (
                  <tr
                    key={s.id}
                    style={{ borderBottom: `1px solid ${COLORS.border}` }}
                  >
                    <td className="px-3 py-2">
                      <div style={{ color: COLORS.text }}>{s.name}</div>
                      {s.description && (
                        <div
                          className="text-[10px]"
                          style={{ color: COLORS.muted }}
                        >
                          {s.description}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                        style={{
                          background: `${LANG_COLORS[s.language] ?? COLORS.muted}15`,
                          color: LANG_COLORS[s.language] ?? COLORS.muted,
                        }}
                      >
                        {s.language}
                      </span>
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                      v{s.version}
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                      {s.timeout_seconds}s
                    </td>
                    <td className="px-3 py-2">
                      <span
                        style={{
                          color: s.requires_approval
                            ? COLORS.amber
                            : COLORS.green,
                        }}
                      >
                        {s.requires_approval ? "Sim" : "Não"}
                      </span>
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                      {s.allowed_hosts.length > 0
                        ? s.allowed_hosts.join(", ")
                        : "Qualquer"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => {
                          setExecuteScript(s);
                          setTargetHost("");
                        }}
                        className="px-2 py-1 rounded text-[11px] font-bold"
                        style={{
                          background: COLORS.teal,
                          color: COLORS.bg,
                          cursor: "pointer",
                        }}
                      >
                        Executar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab: Pending */}
      {tab === "pending" && (
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderTop: "none",
          }}
        >
          {pending.length === 0 ? (
            <div
              className="p-8 text-center text-sm"
              style={{ color: COLORS.muted }}
            >
              Nenhuma aprovação pendente
            </div>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Script
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Host
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Solicitado
                  </th>
                  <th
                    className="text-right px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {pending.map((p) => (
                  <tr
                    key={p.id}
                    style={{ borderBottom: `1px solid ${COLORS.border}` }}
                  >
                    <td className="px-3 py-2">
                      <div style={{ color: COLORS.text }}>{p.script_name}</div>
                      <span
                        className="text-[10px] uppercase"
                        style={{
                          color: LANG_COLORS[p.script_language] ?? COLORS.muted,
                        }}
                      >
                        {p.script_language}
                      </span>
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.teal }}>
                      {p.target_host}
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                      {formatTime(p.created_at)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex gap-1 justify-end">
                        <button
                          onClick={() => handleApprove(p.id, "approved")}
                          className="px-2 py-1 rounded text-[11px] font-bold"
                          style={{
                            background: COLORS.green,
                            color: COLORS.bg,
                            cursor: "pointer",
                          }}
                        >
                          ✓ Aprovar
                        </button>
                        <button
                          onClick={() => handleApprove(p.id, "rejected")}
                          className="px-2 py-1 rounded text-[11px] font-bold"
                          style={{
                            background: COLORS.red,
                            color: "#fff",
                            cursor: "pointer",
                          }}
                        >
                          ✕ Rejeitar
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

      {/* Tab: Executions */}
      {tab === "executions" && (
        <>
          <div className="flex gap-2 items-center">
            <select
              value={execStatusFilter}
              onChange={(e) => setExecStatusFilter(e.target.value)}
              className="rounded-md px-3 py-1.5 text-[13px]"
              style={{
                background: COLORS.card,
                border: `1px solid ${COLORS.border}`,
                color: COLORS.text,
              }}
            >
              <option value="">Todos os status</option>
              <option value="pending">Pendente</option>
              <option value="approved">Aprovado</option>
              <option value="running">Executando</option>
              <option value="completed">Completo</option>
              <option value="failed">Falhou</option>
              <option value="timeout">Timeout</option>
              <option value="cancelled">Cancelado</option>
              <option value="rejected">Rejeitado</option>
            </select>
          </div>
          <div
            className="rounded-xl overflow-hidden"
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
              borderTop: "none",
            }}
          >
            {executions.length === 0 ? (
              <div
                className="p-8 text-center text-sm"
                style={{ color: COLORS.muted }}
              >
                Nenhuma execução encontrada
              </div>
            ) : (
              <table className="w-full text-[12px]">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
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
                      Host
                    </th>
                    <th
                      className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                      style={{ color: COLORS.muted }}
                    >
                      Versão
                    </th>
                    <th
                      className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                      style={{ color: COLORS.muted }}
                    >
                      Exit Code
                    </th>
                    <th
                      className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                      style={{ color: COLORS.muted }}
                    >
                      Duração
                    </th>
                    <th
                      className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                      style={{ color: COLORS.muted }}
                    >
                      Criado
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {executions.map((e) => (
                    <tr
                      key={e.id}
                      style={{ borderBottom: `1px solid ${COLORS.border}` }}
                    >
                      <td className="px-3 py-2">
                        <span
                          className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                          style={{
                            background: `${STATUS_COLORS[e.status] ?? COLORS.muted}15`,
                            color: STATUS_COLORS[e.status] ?? COLORS.muted,
                          }}
                        >
                          {e.status}
                        </span>
                      </td>
                      <td className="px-3 py-2" style={{ color: COLORS.teal }}>
                        {e.target_host}
                      </td>
                      <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                        v{e.version}
                      </td>
                      <td
                        className="px-3 py-2"
                        style={{
                          color:
                            e.exit_code === 0
                              ? COLORS.green
                              : e.exit_code != null
                                ? COLORS.red
                                : COLORS.muted,
                        }}
                      >
                        {e.exit_code ?? "—"}
                      </td>
                      <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                        {formatDuration(e.duration_ms)}
                      </td>
                      <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                        {formatTime(e.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* Modal: Criar script */}
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
            className="rounded-xl p-6 max-w-2xl w-full max-h-[85vh] overflow-y-auto"
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
                Novo Script
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
                  htmlFor="script-name"
                  className="text-[11px] font-bold uppercase"
                  style={{ color: COLORS.muted }}
                >
                  Nome
                </label>
                <input
                  id="script-name"
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="ex: backup-config"
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
                    htmlFor="script-lang"
                    className="text-[11px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    Linguagem
                  </label>
                  <select
                    id="script-lang"
                    value={formLanguage}
                    onChange={(e) => setFormLanguage(e.target.value)}
                    className="w-full rounded-md px-3 py-2 text-[13px]"
                    style={{
                      background: COLORS.bg,
                      border: `1px solid ${COLORS.border}`,
                      color: COLORS.text,
                    }}
                  >
                    <option value="bash">Bash</option>
                    <option value="python">Python</option>
                    <option value="powershell">PowerShell</option>
                    <option value="node">Node.js</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="script-timeout"
                    className="text-[11px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    Timeout (s)
                  </label>
                  <input
                    id="script-timeout"
                    type="number"
                    value={formTimeout}
                    onChange={(e) =>
                      setFormTimeout(parseInt(e.target.value, 10) || 300)
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
                  htmlFor="script-desc"
                  className="text-[11px] font-bold uppercase"
                  style={{ color: COLORS.muted }}
                >
                  Descrição
                </label>
                <input
                  id="script-desc"
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Opcional"
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
                  htmlFor="script-content"
                  className="text-[11px] font-bold uppercase"
                  style={{ color: COLORS.muted }}
                >
                  Conteúdo
                </label>
                <textarea
                  id="script-content"
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  rows={10}
                  placeholder="#!/bin/bash&#10;echo 'Hello World'"
                  className="w-full rounded-md px-3 py-2 text-[12px] font-mono"
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text,
                  }}
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="script-hosts"
                  className="text-[11px] font-bold uppercase"
                  style={{ color: COLORS.muted }}
                >
                  Hosts permitidos (comma-separated, vazio = qualquer)
                </label>
                <input
                  id="script-hosts"
                  type="text"
                  value={formAllowedHosts}
                  onChange={(e) => setFormAllowedHosts(e.target.value)}
                  placeholder="host1.local,host2.local"
                  className="w-full rounded-md px-3 py-2 text-[13px]"
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text,
                  }}
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="script-approval"
                  type="checkbox"
                  checked={formRequiresApproval}
                  onChange={(e) => setFormRequiresApproval(e.target.checked)}
                />
                <label
                  htmlFor="script-approval"
                  className="text-[12px]"
                  style={{ color: COLORS.text }}
                >
                  Requer aprovação
                </label>
              </div>
              <button
                onClick={handleCreate}
                disabled={!formName || !formContent}
                className="w-full rounded-md py-2.5 text-sm font-bold disabled:opacity-50"
                style={{
                  background: COLORS.teal,
                  color: COLORS.bg,
                  cursor: !formName || !formContent ? "not-allowed" : "pointer",
                }}
              >
                Criar Script
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Executar script */}
      {executeScript && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "var(--overlay-modal)" }}
          onClick={() => setExecuteScript(null)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setExecuteScript(null);
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
                Executar: {executeScript.name}
              </h2>
              <button
                onClick={() => setExecuteScript(null)}
                className="text-[16px]"
                style={{ color: COLORS.muted, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>
            <div className="space-y-4">
              <div className="space-y-1">
                <label
                  htmlFor="exec-host"
                  className="text-[11px] font-bold uppercase"
                  style={{ color: COLORS.muted }}
                >
                  Host alvo
                </label>
                <input
                  id="exec-host"
                  type="text"
                  value={targetHost}
                  onChange={(e) => setTargetHost(e.target.value)}
                  placeholder="server01.local"
                  className="w-full rounded-md px-3 py-2 text-[13px]"
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text,
                  }}
                />
                {executeScript.allowed_hosts.length > 0 && (
                  <div className="text-[10px]" style={{ color: COLORS.muted }}>
                    Permitidos: {executeScript.allowed_hosts.join(", ")}
                  </div>
                )}
              </div>
              {executeScript.requires_approval && (
                <div
                  className="rounded-md p-3 text-[11px]"
                  style={{
                    background: `var(--status-warning-bg)`,
                    border: `1px solid var(--status-warning-border)`,
                    color: COLORS.amber,
                  }}
                >
                  ⚠ Este script requer aprovação. A execução ficará pendente até
                  ser aprovada por outro usuário.
                </div>
              )}
              <button
                onClick={handleExecute}
                disabled={!targetHost}
                className="w-full rounded-md py-2.5 text-sm font-bold disabled:opacity-50"
                style={{
                  background: COLORS.teal,
                  color: COLORS.bg,
                  cursor: !targetHost ? "not-allowed" : "pointer",
                }}
              >
                {executeScript.requires_approval
                  ? "Solicitar Execução"
                  : "Executar Agora"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
