// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState, useCallback } from "react";
import {
  Plug,
  Plus,
  Save,
  Loader2,
  RefreshCw,
  Trash2,
  TestTube,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Activity,
  AlertTriangle,
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

interface ITSMConnector {
  id: string;
  name: string;
  connector_type: string;
  base_url: string;
  auth_type: string;
  username: string | null;
  field_mapping: Record<string, string>;
  sync_direction: string;
  auto_create_on_incident: boolean;
  auto_update_on_resolve: boolean;
  is_active: boolean;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  created_at: string;
}

interface SyncLogEntry {
  id: string;
  connector_id: string;
  connector_name: string;
  source_type: string;
  source_id: string | null;
  operation: string;
  external_ticket_id: string | null;
  external_ticket_url: string | null;
  status: string;
  error_message: string | null;
  duration_ms: number | null;
  created_at: string;
}

const CONNECTOR_TYPES = [
  { value: "jira", label: "Jira" },
  { value: "freshservice", label: "FreshService" },
  { value: "servicenow", label: "ServiceNow" },
  { value: "zendesk", label: "Zendesk" },
  { value: "custom", label: "Custom (API genérica)" },
];

const AUTH_TYPES = [
  { value: "api_key", label: "API Key" },
  { value: "basic", label: "Basic Auth" },
  { value: "bearer", label: "Bearer Token" },
  { value: "oauth2", label: "OAuth2" },
];

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

export default function ITSMPage() {
  const { data: connectorsData, mutate: mutateConnectors } = useApi<{ connectors: ITSMConnector[] }>("/api/v1/itsm/connectors");
  const { data: logsData, mutate: mutateLogs } = useApi<{ logs: SyncLogEntry[] }>("/api/v1/itsm/sync-log?limit=20");
  const { data: statsData } = useApi<{ active_connectors: number; total_syncs: number; successful_syncs: number; failed_syncs: number; by_type: Array<Record<string, unknown>> }>("/api/v1/itsm/stats");

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    connector_type: "jira",
    base_url: "",
    auth_type: "api_key",
    api_key: "",
    username: "",
    password: "",
    bearer_token: "",
    field_mapping: '{"title": "summary", "description": "description", "severity": "priority"}',
    sync_direction: "outbound",
    auto_create_on_incident: false,
    auto_update_on_resolve: false,
    is_active: true,
  });

  const connectors = connectorsData?.connectors ?? [];
  const logs = logsData?.logs ?? [];
  const stats = statsData;

  const handleCreate = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      let fieldMapping: Record<string, string>;
      try {
        fieldMapping = JSON.parse(form.field_mapping);
      } catch {
        setError("JSON inválido no field_mapping");
        setSaving(false);
        return;
      }

      const res = await fetch("/api/v1/itsm/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: form.name,
          connector_type: form.connector_type,
          base_url: form.base_url,
          auth_type: form.auth_type,
          api_key: form.api_key || undefined,
          username: form.username || undefined,
          password: form.password || undefined,
          bearer_token: form.bearer_token || undefined,
          field_mapping: fieldMapping,
          sync_direction: form.sync_direction,
          auto_create_on_incident: form.auto_create_on_incident,
          auto_update_on_resolve: form.auto_update_on_resolve,
          is_active: form.is_active,
        }),
      });
      if (res.ok) {
        setSuccess("Connector criado com sucesso");
        setShowForm(false);
        setForm({ name: "", connector_type: "jira", base_url: "", auth_type: "api_key", api_key: "", username: "", password: "", bearer_token: "", field_mapping: '{"title": "summary", "description": "description", "severity": "priority"}', sync_direction: "outbound", auto_create_on_incident: false, auto_update_on_resolve: false, is_active: true });
        mutateConnectors();
      } else {
        const data = await res.json();
        setError(data?.error?.message ?? "Erro ao criar connector");
      }
    } catch {
      setError("Erro de conexão");
    } finally {
      setSaving(false);
    }
  }, [form, mutateConnectors]);

  const handleTest = useCallback(async (id: string) => {
    setTesting(id);
    setError(null);
    try {
      const res = await fetch(`/api/v1/itsm/connectors/${id}/test`, { method: "POST", credentials: "include" });
      const data = await res.json();
      if (data.test_result?.success) {
        setSuccess(`Teste OK — Ticket criado: ${data.test_result.external_ticket_id ?? "—"}`);
      } else {
        setError(`Teste falhou: ${data.test_result?.error ?? "Erro desconhecido"}`);
      }
      mutateConnectors();
    } catch {
      setError("Erro de conexão no teste");
    } finally {
      setTesting(null);
    }
  }, [mutateConnectors]);

  const handleDelete = useCallback(async (id: string) => {
    await fetch(`/api/v1/itsm/connectors/${id}`, { method: "DELETE", credentials: "include" });
    mutateConnectors();
  }, [mutateConnectors]);

  return (
    <div className="min-h-screen p-6 space-y-6" style={{ background: COLORS.bg, fontFamily: "'JetBrains Mono','Consolas',monospace", color: COLORS.text }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold" style={{ color: COLORS.teal }}>
            <Plug size={18} className="inline mr-1" /> ITSM Connectors
          </h1>
          <p className="text-[12px]" style={{ color: COLORS.muted }}>
            Framework agnóstico · Jira, FreshService, ServiceNow, Zendesk, Custom
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { mutateConnectors(); mutateLogs(); }} className="text-[12px] px-3 py-1.5 rounded font-bold flex items-center gap-2" style={{ background: `${COLORS.muted}15`, border: `1px solid ${COLORS.muted}`, color: COLORS.muted, cursor: "pointer" }}>
            <RefreshCw size={12} /> Atualizar
          </button>
          <button onClick={() => setShowForm(!showForm)} className="text-[12px] px-3 py-1.5 rounded font-bold flex items-center gap-2" style={{ background: COLORS.teal, color: "white", cursor: "pointer" }}>
            <Plus size={12} /> Novo Connector
          </button>
        </div>
      </div>

      {error && <div className="rounded-md p-3 text-sm" style={{ background: "var(--status-error-bg)", border: "1px solid var(--status-error-border)", color: COLORS.red }}>{error}</div>}
      {success && <div className="rounded-md p-3 text-sm" style={{ background: "var(--status-ok-bg)", border: "1px solid var(--status-ok-border)", color: COLORS.green }}>{success}</div>}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Connectors Ativos" value={stats.active_connectors} color={COLORS.text} icon={<Plug size={14} />} />
          <StatCard label="Total Syncs" value={stats.total_syncs} color={COLORS.blue} icon={<Activity size={14} />} />
          <StatCard label="Sucessos" value={stats.successful_syncs} color={COLORS.green} icon={<CheckCircle2 size={14} />} />
          <StatCard label="Falhas" value={stats.failed_syncs} color={COLORS.red} icon={<XCircle size={14} />} />
        </div>
      )}

      {/* Create Form */}
      {showForm && (
        <div className="rounded-xl p-6 space-y-4" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
          <h3 className="text-sm font-bold" style={{ color: COLORS.teal }}>Novo Connector ITSM</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>Nome *</label>
              <input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ex: Jira Production" />
            </div>
            <div>
              <label style={labelStyle}>Tipo *</label>
              <select style={inputStyle} value={form.connector_type} onChange={(e) => setForm({ ...form, connector_type: e.target.value })}>
                {CONNECTOR_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Base URL *</label>
              <input style={inputStyle} value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })} placeholder="https://your-itsm.atlassian.net" />
            </div>
            <div>
              <label style={labelStyle}>Auth Type *</label>
              <select style={inputStyle} value={form.auth_type} onChange={(e) => setForm({ ...form, auth_type: e.target.value })}>
                {AUTH_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            {form.auth_type === "api_key" && (
              <div>
                <label style={labelStyle}>API Key</label>
                <input type="password" style={inputStyle} value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} />
              </div>
            )}
            {form.auth_type === "basic" && (
              <>
                <div>
                  <label style={labelStyle}>Username</label>
                  <input style={inputStyle} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
                </div>
                <div>
                  <label style={labelStyle}>Password</label>
                  <input type="password" style={inputStyle} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                </div>
              </>
            )}
            {form.auth_type === "bearer" && (
              <div>
                <label style={labelStyle}>Bearer Token</label>
                <input type="password" style={inputStyle} value={form.bearer_token} onChange={(e) => setForm({ ...form, bearer_token: e.target.value })} />
              </div>
            )}
          </div>
          <div>
            <label style={labelStyle}>Field Mapping (JSON)</label>
            <textarea style={{ ...inputStyle, minHeight: "80px", fontFamily: "monospace" }} value={form.field_mapping} onChange={(e) => setForm({ ...form, field_mapping: e.target.value })} />
            <p className="text-[10px] mt-1" style={{ color: COLORS.muted }}>Mapeia campos do JLMIRROR para campos do ITSM externo</p>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-2 text-[11px]" style={{ color: COLORS.text }}>
              <input type="checkbox" checked={form.auto_create_on_incident} onChange={(e) => setForm({ ...form, auto_create_on_incident: e.target.checked })} /> Auto-criar em incidentes
            </label>
            <label className="flex items-center gap-2 text-[11px]" style={{ color: COLORS.text }}>
              <input type="checkbox" checked={form.auto_update_on_resolve} onChange={(e) => setForm({ ...form, auto_update_on_resolve: e.target.checked })} /> Auto-atualizar ao resolver
            </label>
            <label className="flex items-center gap-2 text-[11px]" style={{ color: COLORS.text }}>
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Ativo
            </label>
          </div>
          <button onClick={handleCreate} disabled={saving || !form.name || !form.base_url} className="px-4 py-1.5 rounded text-[12px] font-bold flex items-center gap-2" style={{ background: COLORS.teal, color: "white", cursor: "pointer", opacity: (saving || !form.name || !form.base_url) ? 0.5 : 1 }}>
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Criar Connector
          </button>
        </div>
      )}

      {/* Connectors List */}
      <div className="rounded-xl overflow-hidden" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
        <div className="p-4 border-b" style={{ borderColor: COLORS.border }}>
          <h3 className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Connectors ({connectors.length})</h3>
        </div>
        <div className="divide-y" style={{ borderColor: COLORS.border }}>
          {connectors.map((conn) => (
            <div key={conn.id} className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded flex items-center justify-center" style={{ background: `${COLORS.teal}15` }}>
                    <Plug size={14} style={{ color: COLORS.teal }} />
                  </div>
                  <div>
                    <p className="text-[12px] font-bold" style={{ color: COLORS.text }}>
                      {conn.name}
                      {!conn.is_active && <span className="ml-2 text-[10px] uppercase" style={{ color: COLORS.muted }}>(inativo)</span>}
                    </p>
                    <p className="text-[10px]" style={{ color: COLORS.muted }}>
                      {conn.connector_type} · {conn.base_url} · {conn.auth_type}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {conn.last_sync_status === "success" && <CheckCircle2 size={12} style={{ color: COLORS.green }} />}
                  {conn.last_sync_status === "failed" && <AlertTriangle size={12} style={{ color: COLORS.amber }} />}
                  <button onClick={() => handleTest(conn.id)} disabled={testing === conn.id} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: `${COLORS.blue}15`, border: `1px solid ${COLORS.blue}`, color: COLORS.blue, cursor: "pointer", opacity: testing === conn.id ? 0.5 : 1 }}>
                    {testing === conn.id ? <Loader2 size={10} className="animate-spin" /> : <TestTube size={10} />} Testar
                  </button>
                  <button onClick={() => handleDelete(conn.id)} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: `${COLORS.red}15`, border: `1px solid ${COLORS.red}`, color: COLORS.red, cursor: "pointer" }}>
                    <Trash2 size={10} />
                  </button>
                </div>
              </div>
              {conn.last_sync_error && (
                <p className="text-[10px] mt-1 p-2 rounded" style={{ background: "var(--status-error-bg)", color: COLORS.red }}>
                  {conn.last_sync_error}
                </p>
              )}
              {conn.last_sync_at && (
                <p className="text-[10px] mt-1" style={{ color: COLORS.muted }}>
                  Último sync: {new Date(conn.last_sync_at).toLocaleString("pt-BR")}
                </p>
              )}
            </div>
          ))}
          {connectors.length === 0 && (
            <div className="p-6 text-center">
              <Plug size={24} className="mx-auto mb-2" style={{ color: COLORS.muted }} />
              <p className="text-[12px]" style={{ color: COLORS.muted }}>Nenhum connector configurado</p>
            </div>
          )}
        </div>
      </div>

      {/* Sync Log */}
      <div className="rounded-xl overflow-hidden" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
        <div className="p-4 border-b" style={{ borderColor: COLORS.border }}>
          <h3 className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Sync Log ({logs.length})</h3>
        </div>
        <div className="divide-y" style={{ borderColor: COLORS.border }}>
          {logs.map((log) => (
            <div key={log.id} className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {log.status === "success" ? <CheckCircle2 size={12} style={{ color: COLORS.green }} /> : <XCircle size={12} style={{ color: COLORS.red }} />}
                <div>
                  <p className="text-[12px] font-bold" style={{ color: COLORS.text }}>
                    {log.operation} · {log.connector_name}
                  </p>
                  <p className="text-[10px]" style={{ color: COLORS.muted }}>
                    {log.source_type} · {new Date(log.created_at).toLocaleString("pt-BR")}
                    {log.duration_ms != null && ` · ${log.duration_ms}ms`}
                  </p>
                  {log.external_ticket_url && (
                    <a href={log.external_ticket_url} target="_blank" rel="noopener noreferrer" className="text-[10px] flex items-center gap-1 mt-1" style={{ color: COLORS.teal }}>
                      {log.external_ticket_id} <ExternalLink size={10} />
                    </a>
                  )}
                  {log.error_message && (
                    <p className="text-[10px] mt-1" style={{ color: COLORS.red }}>{log.error_message}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
          {logs.length === 0 && (
            <div className="p-6 text-center">
              <p className="text-[12px]" style={{ color: COLORS.muted }}>Nenhuma sincronização registrada</p>
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
