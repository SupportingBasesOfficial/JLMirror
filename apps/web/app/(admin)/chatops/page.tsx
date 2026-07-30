"use client";

import { useState, useCallback } from "react";
import {
  MessageSquare,
  Save,
  Loader2,
  RefreshCw,
  Terminal,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
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
};

interface ChatOpsConfig {
  id: string;
  platform: string;
  slack_bot_token: string | null;
  enabled_commands: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface ChatOpsCommand {
  id: string;
  source: string;
  chat_user_name: string | null;
  chat_channel_name: string | null;
  command: string;
  arguments: string | null;
  response_text: string | null;
  status: string;
  error_message: string | null;
  response_time_ms: number | null;
  created_at: string;
}

const inputStyle = {
  background: "var(--surface-1)",
  border: "1px solid var(--border-default)",
  color: "var(--text-primary)",
  borderRadius: "6px",
  padding: "6px 10px",
  fontSize: "12px",
  width: "100%",
} as const;

const labelStyle = {
  fontSize: "10px",
  fontWeight: "bold",
  textTransform: "uppercase" as const,
  color: "var(--text-muted)",
  marginBottom: "4px",
  display: "block",
};

const AVAILABLE_COMMANDS = ["status", "incidents", "ack", "resolve", "services", "silence"];

export default function ChatOpsPage() {
  const { data: configData, mutate: mutateConfig } = useApi<{ configs: ChatOpsConfig[] }>("/api/v1/chatops/config");
  const { data: historyData, mutate: mutateHistory } = useApi<{ commands: ChatOpsCommand[] }>("/api/v1/chatops/history?limit=30");
  const { data: statsData } = useApi<{ total: number; executed: number; failed: number; by_command: Array<Record<string, unknown>>; by_source: Array<Record<string, unknown>> }>("/api/v1/chatops/stats");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [slackForm, setSlackForm] = useState({
    slack_verification_token: "",
    slack_signing_secret: "",
    slack_bot_token: "",
    enabled_commands: ["status", "ack", "resolve", "incidents", "services", "silence"],
    is_active: true,
  });

  const configs = configData?.configs ?? [];
  const commands = historyData?.commands ?? [];
  const stats = statsData;

  const handleSaveSlack = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/v1/chatops/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ platform: "slack", ...slackForm }),
      });
      if (res.ok) {
        setSuccess("Configuração Slack salva com sucesso");
        mutateConfig();
      } else {
        const data = await res.json();
        setError(data?.error?.message ?? "Erro ao salvar");
      }
    } catch {
      setError("Erro de conexão");
    } finally {
      setSaving(false);
    }
  }, [slackForm, mutateConfig]);

  const toggleCommand = (cmd: string) => {
    setSlackForm((prev) => ({
      ...prev,
      enabled_commands: prev.enabled_commands.includes(cmd)
        ? prev.enabled_commands.filter((c) => c !== cmd)
        : [...prev.enabled_commands, cmd],
    }));
  };

  const sourceIcon = (source: string) => {
    if (source === "slack") return <MessageSquare size={10} style={{ color: COLORS.blue }} />;
    if (source === "teams") return <MessageSquare size={10} style={{ color: COLORS.teal }} />;
    return <Terminal size={10} style={{ color: COLORS.muted }} />;
  };

  return (
    <div className="min-h-screen p-6 space-y-6" style={{ background: COLORS.bg, fontFamily: "'JetBrains Mono','Consolas',monospace", color: COLORS.text }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold" style={{ color: COLORS.teal }}>
            <Terminal size={18} className="inline mr-1" /> ChatOps
          </h1>
          <p className="text-[12px]" style={{ color: COLORS.muted }}>
            Comandos via Slack/Teams · status, ack, resolve, incidents
          </p>
        </div>
        <button onClick={() => { mutateConfig(); mutateHistory(); }} className="text-[12px] px-3 py-1.5 rounded font-bold flex items-center gap-2" style={{ background: `${COLORS.muted}15`, border: `1px solid ${COLORS.muted}`, color: COLORS.muted, cursor: "pointer" }}>
          <RefreshCw size={12} /> Atualizar
        </button>
      </div>

      {error && <div className="rounded-md p-3 text-sm" style={{ background: "var(--status-error-bg)", border: "1px solid var(--status-error-border)", color: COLORS.red }}>{error}</div>}
      {success && <div className="rounded-md p-3 text-sm" style={{ background: "var(--status-ok-bg)", border: "1px solid var(--status-ok-border)", color: COLORS.green }}>{success}</div>}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total" value={stats.total} color={COLORS.text} />
          <StatCard label="Executados" value={stats.executed} color={COLORS.green} icon={<CheckCircle2 size={14} />} />
          <StatCard label="Falharam" value={stats.failed} color={COLORS.red} icon={<XCircle size={14} />} />
          <StatCard label="Por Comando" value={stats.by_command.length} color={COLORS.blue} icon={<Terminal size={14} />} />
        </div>
      )}

      {/* Slack Config */}
      <div className="rounded-xl p-6 space-y-4" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
        <div className="flex items-center gap-2">
          <MessageSquare size={14} style={{ color: COLORS.blue }} />
          <h2 className="text-sm font-bold" style={{ color: COLORS.teal }}>Configuração Slack</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label style={labelStyle}>Verification Token</label>
            <input style={inputStyle} value={slackForm.slack_verification_token} onChange={(e) => setSlackForm({ ...slackForm, slack_verification_token: e.target.value })} placeholder="xoxb-..." />
          </div>
          <div>
            <label style={labelStyle}>Signing Secret</label>
            <input style={inputStyle} value={slackForm.slack_signing_secret} onChange={(e) => setSlackForm({ ...slackForm, slack_signing_secret: e.target.value })} placeholder="secret..." />
          </div>
          <div>
            <label style={labelStyle}>Bot Token</label>
            <input style={inputStyle} value={slackForm.slack_bot_token} onChange={(e) => setSlackForm({ ...slackForm, slack_bot_token: e.target.value })} placeholder="xoxb-..." />
          </div>
        </div>

        {/* Enabled Commands */}
        <div>
          <label style={labelStyle}>Comandos Habilitados</label>
          <div className="flex items-center gap-2 flex-wrap">
            {AVAILABLE_COMMANDS.map((cmd) => {
              const active = slackForm.enabled_commands.includes(cmd);
              return (
                <button
                  key={cmd}
                  onClick={() => toggleCommand(cmd)}
                  className="px-3 py-1.5 rounded text-[11px] font-bold flex items-center gap-1"
                  style={{
                    background: active ? `${COLORS.teal}15` : "var(--surface-1)",
                    border: `1px solid ${active ? COLORS.teal : COLORS.border}`,
                    color: active ? COLORS.teal : COLORS.muted,
                    cursor: "pointer",
                  }}
                >
                  /{cmd}
                  {active && <CheckCircle2 size={10} />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Webhook URLs */}
        <div className="p-3 rounded-lg" style={{ background: "var(--surface-1)" }}>
          <p className="text-[10px] font-bold uppercase mb-2" style={{ color: COLORS.muted }}>URLs do Webhook</p>
          <p className="text-[11px]" style={{ color: COLORS.text }}>
            Slack: <code style={{ color: COLORS.teal }}>POST /api/v1/chatops/webhook/slack</code>
          </p>
          <p className="text-[11px]" style={{ color: COLORS.text }}>
            Teams: <code style={{ color: COLORS.teal }}>POST /api/v1/chatops/webhook/teams</code>
          </p>
          <p className="text-[10px] mt-1" style={{ color: COLORS.muted }}>
            Inclua o header X-Tenant-Id com o UUID do tenant
          </p>
        </div>

        <label className="flex items-center gap-2 text-[12px]" style={{ color: COLORS.text }}>
          <input type="checkbox" checked={slackForm.is_active} onChange={(e) => setSlackForm({ ...slackForm, is_active: e.target.checked })} />
          Integração ativa
        </label>

        <button onClick={handleSaveSlack} disabled={saving} className="px-4 py-1.5 rounded text-[12px] font-bold flex items-center gap-2" style={{ background: COLORS.teal, color: "white", cursor: "pointer", opacity: saving ? 0.5 : 1 }}>
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Salvar Slack
        </button>
      </div>

      {/* Command History */}
      <div className="rounded-xl overflow-hidden" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
        <div className="p-4 border-b" style={{ borderColor: COLORS.border }}>
          <h3 className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Histórico de Comandos ({commands.length})</h3>
        </div>
        <div className="divide-y" style={{ borderColor: COLORS.border }}>
          {commands.map((cmd) => (
            <div key={cmd.id} className="p-4">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  {sourceIcon(cmd.source)}
                  <span className="text-[12px] font-bold" style={{ color: COLORS.text }}>
                    /{cmd.command} {cmd.arguments ?? ""}
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase" style={{
                    background: cmd.status === "executed" ? `${COLORS.green}15` : `${COLORS.red}15`,
                    color: cmd.status === "executed" ? COLORS.green : COLORS.red,
                  }}>
                    {cmd.status}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[10px]" style={{ color: COLORS.muted }}>
                  {cmd.response_time_ms != null && <span>{cmd.response_time_ms}ms</span>}
                  <Clock size={10} />
                  {new Date(cmd.created_at).toLocaleString("pt-BR")}
                </div>
              </div>
              <p className="text-[11px]" style={{ color: COLORS.muted }}>
                {cmd.chat_user_name ?? "—"} · #{cmd.chat_channel_name ?? "—"}
              </p>
              {cmd.response_text && (
                <p className="text-[11px] mt-1 p-2 rounded" style={{ background: "var(--surface-1)", color: COLORS.text, whiteSpace: "pre-wrap" }}>
                  {cmd.response_text}
                </p>
              )}
              {cmd.error_message && (
                <p className="text-[10px] mt-1" style={{ color: COLORS.red }}>Erro: {cmd.error_message}</p>
              )}
            </div>
          ))}
          {commands.length === 0 && (
            <div className="p-6 text-center">
              <Terminal size={24} className="mx-auto mb-2" style={{ color: COLORS.muted }} />
              <p className="text-[12px]" style={{ color: COLORS.muted }}>Nenhum comando executado ainda</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color, icon }: { label: string; value: number; color: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--surface-2)", border: "1px solid var(--border-default)" }}>
      <div className="text-[10px] font-bold uppercase mb-1 flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
        {icon} {label}
      </div>
      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
    </div>
  );
}
