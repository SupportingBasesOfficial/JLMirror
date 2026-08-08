// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState, useCallback } from "react";
import {
  Database,
  Play,
  Plus,
  RefreshCw,
  Save,
  X,
  CheckCircle2,
  AlertCircle,
  Search,
} from "lucide-react";
import { useApi } from "@/lib/use-api";
import { apiFetchWithProgress } from "@/lib/zabbix-fetch";

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

interface SqlConnection {
  id: string;
  name: string;
  db_engine: string;
  host: string;
  port: number;
  database_name: string;
  is_read_only: boolean;
  is_active: boolean;
  last_used_at: string | null;
}

interface SqlTemplate {
  id: string;
  name: string;
  description: string | null;
  sql_text: string;
  category: string | null;
  db_engine: string | null;
  tags: string[];
}

interface QueryResult {
  rows: Record<string, unknown>[];
  total_rows: number;
  truncated: boolean;
  execution_ms: number;
  fields: string[];
}

export default function SqlConsolePage() {
  const [selectedConn, setSelectedConn] = useState<string>("");
  const [query, setQuery] = useState<string>("SELECT 1;");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [showCreateConn, setShowCreateConn] = useState(false);
  const [templateSearch, setTemplateSearch] = useState("");

  const { data: connData, mutate: mutateConns } = useApi<{
    connections: SqlConnection[];
  }>("/api/v1/sql-console/connections");

  const { data: tmplData } = useApi<{ templates: SqlTemplate[] }>(
    "/api/v1/sql-console/templates",
  );

  const connections = connData?.connections ?? [];
  const templates = tmplData?.templates ?? [];

  const filteredTemplates = templates.filter(
    (t) =>
      !templateSearch ||
      t.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
      t.category?.toLowerCase().includes(templateSearch.toLowerCase()),
  );

  const handleExecute = useCallback(async () => {
    if (!selectedConn || !query.trim()) return;
    setExecuting(true);
    setError(null);
    setResult(null);
    try {
      const res = await apiFetchWithProgress<QueryResult>(
        "/api/v1/sql-console/execute",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            connection_id: selectedConn,
            query,
          }),
        },
        () => {},
      );
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao executar query");
    } finally {
      setExecuting(false);
    }
  }, [selectedConn, query]);

  const handleSaveTemplate = useCallback(
    async (name: string, category: string) => {
      try {
        await apiFetchWithProgress(
          "/api/v1/sql-console/templates",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name,
              sql_text: query,
              category: category || undefined,
              tags: [],
            }),
          },
          () => {},
        );
        setShowSaveTemplate(false);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Erro ao salvar template");
      }
    },
    [query],
  );

  const handleCreateConn = useCallback(
    async (formData: Record<string, string>) => {
      try {
        await apiFetchWithProgress(
          "/api/v1/sql-console/connections",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: formData.name,
              db_engine: formData.db_engine || "postgres",
              host: formData.host,
              port: Number(formData.port) || 5432,
              database_name: formData.database_name,
              username: formData.username,
              password: formData.password,
              is_read_only: formData.is_read_only === "true",
            }),
          },
          () => {},
        );
        await mutateConns();
        setShowCreateConn(false);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Erro ao criar conexao");
      }
    },
    [mutateConns],
  );

  return (
    <div
      className="p-6 space-y-4"
      style={{ background: COLORS.bg, minHeight: "100vh" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-2xl font-bold flex items-center gap-2"
            style={{ color: COLORS.text }}
          >
            <Database size={28} style={{ color: COLORS.teal }} />
            SQL Console
          </h1>
          <p className="text-sm mt-1" style={{ color: COLORS.muted }}>
            Execute queries em bancos de clientes — ferramenta interna JL
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => mutateConns()}
            className="p-2 rounded-lg border"
            style={{ borderColor: COLORS.border, color: COLORS.muted }}
            title="Atualizar"
          >
            <RefreshCw size={18} />
          </button>
          <button
            type="button"
            onClick={() => setShowCreateConn(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-white font-medium"
            style={{ background: COLORS.teal }}
          >
            <Plus size={18} />
            Nova Conexão
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Sidebar: Templates */}
        <div
          className="rounded-xl border p-3 lg:col-span-1"
          style={{ background: COLORS.card, borderColor: COLORS.border }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Search size={16} style={{ color: COLORS.muted }} />
            <input
              type="text"
              placeholder="Buscar templates..."
              value={templateSearch}
              onChange={(e) => setTemplateSearch(e.target.value)}
              className="flex-1 text-sm bg-transparent outline-none"
              style={{ color: COLORS.text }}
            />
          </div>
          <div className="space-y-1 max-h-[60vh] overflow-y-auto">
            {filteredTemplates.length === 0 ? (
              <p
                className="text-xs text-center py-4"
                style={{ color: COLORS.muted }}
              >
                Nenhum template salvo
              </p>
            ) : (
              filteredTemplates.map((tmpl) => (
                <button
                  type="button"
                  key={tmpl.id}
                  onClick={() => setQuery(tmpl.sql_text)}
                  className="w-full text-left p-2 rounded-lg transition-colors hover:opacity-80"
                  style={{ background: `${COLORS.border}20` }}
                >
                  <p
                    className="text-sm font-medium"
                    style={{ color: COLORS.text }}
                  >
                    {tmpl.name}
                  </p>
                  {tmpl.category && (
                    <p className="text-xs" style={{ color: COLORS.muted }}>
                      {tmpl.category}
                    </p>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Main: Editor + Results */}
        <div className="lg:col-span-3 space-y-4">
          {/* Connection selector + toolbar */}
          <div
            className="flex items-center gap-3 p-3 rounded-xl border"
            style={{ background: COLORS.card, borderColor: COLORS.border }}
          >
            <select
              value={selectedConn}
              onChange={(e) => setSelectedConn(e.target.value)}
              className="px-3 py-2 rounded-lg border flex-1"
              style={{
                background: COLORS.bg,
                borderColor: COLORS.border,
                color: COLORS.text,
              }}
            >
              <option value="">Selecione uma conexão...</option>
              {connections.map((conn) => (
                <option key={conn.id} value={conn.id}>
                  {conn.name} — {conn.host}:{conn.port}/{conn.database_name}
                  {conn.is_read_only ? " (read-only)" : ""}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowSaveTemplate(true)}
              disabled={!query.trim()}
              className="p-2 rounded-lg border disabled:opacity-50"
              style={{ borderColor: COLORS.border, color: COLORS.muted }}
              title="Salvar como template"
            >
              <Save size={18} />
            </button>
            <button
              type="button"
              onClick={handleExecute}
              disabled={!selectedConn || !query.trim() || executing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-white font-medium disabled:opacity-50"
              style={{ background: COLORS.teal }}
            >
              {executing ? (
                <RefreshCw size={16} className="animate-spin" />
              ) : (
                <Play size={16} />
              )}
              Executar
            </button>
          </div>

          {/* Editor */}
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full h-48 p-4 rounded-xl border font-mono text-sm resize-y"
            style={{
              background: COLORS.card,
              borderColor: COLORS.border,
              color: COLORS.text,
              fontFamily: "'Cascadia Code', 'Fira Code', monospace",
            }}
            placeholder="SELECT * FROM ..."
            spellCheck={false}
          />

          {/* Error */}
          {error && (
            <div
              className="p-4 rounded-xl border flex items-start gap-3"
              style={{
                background: `${COLORS.red}10`,
                borderColor: `${COLORS.red}40`,
              }}
            >
              <AlertCircle
                size={20}
                style={{ color: COLORS.red, flexShrink: 0 }}
              />
              <div>
                <p
                  className="font-medium text-sm"
                  style={{ color: COLORS.red }}
                >
                  Erro na execução
                </p>
                <p
                  className="text-xs mt-1 font-mono"
                  style={{ color: COLORS.red }}
                >
                  {error}
                </p>
              </div>
            </div>
          )}

          {/* Results */}
          {result && (
            <div
              className="rounded-xl border overflow-hidden"
              style={{ background: COLORS.card, borderColor: COLORS.border }}
            >
              <div
                className="flex items-center justify-between p-3 border-b"
                style={{ borderColor: COLORS.border }}
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} style={{ color: COLORS.green }} />
                  <span
                    className="text-sm font-medium"
                    style={{ color: COLORS.text }}
                  >
                    {result.total_rows} linha(s) em {result.execution_ms}ms
                  </span>
                  {result.truncated && (
                    <span
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{
                        background: `${COLORS.amber}20`,
                        color: COLORS.amber,
                      }}
                    >
                      Truncado
                    </span>
                  )}
                </div>
                <span className="text-xs" style={{ color: COLORS.muted }}>
                  {result.fields.length} coluna(s)
                </span>
              </div>
              <div className="overflow-x-auto max-h-[40vh]">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: `${COLORS.border}20` }}>
                      {result.fields.map((field) => (
                        <th
                          key={field}
                          className="px-3 py-2 text-left font-medium whitespace-nowrap"
                          style={{ color: COLORS.muted }}
                        >
                          {field}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, i) => (
                      <tr
                        key={i}
                        className="border-t"
                        style={{ borderColor: `${COLORS.border}30` }}
                      >
                        {result.fields.map((field) => (
                          <td
                            key={field}
                            className="px-3 py-1.5 whitespace-nowrap font-mono"
                            style={{ color: COLORS.text }}
                          >
                            {String(row[field] ?? "NULL")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showSaveTemplate && (
        <SaveTemplateModal
          onClose={() => setShowSaveTemplate(false)}
          onSave={handleSaveTemplate}
        />
      )}
      {showCreateConn && (
        <CreateConnectionModal
          onClose={() => setShowCreateConn(false)}
          onCreate={handleCreateConn}
        />
      )}
    </div>
  );
}

function SaveTemplateModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (name: string, category: string) => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)" }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6"
        style={{
          background: COLORS.card,
          border: `1px solid ${COLORS.border}`,
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold" style={{ color: COLORS.text }}>
            Salvar como Template
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{ color: COLORS.muted }}
          >
            <X size={20} />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label
              className="text-xs font-medium mb-1 block"
              style={{ color: COLORS.muted }}
            >
              Nome
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border"
              style={{
                background: COLORS.bg,
                borderColor: COLORS.border,
                color: COLORS.text,
              }}
              placeholder="Ex: Buscar usuários ativos"
            />
          </div>
          <div>
            <label
              className="text-xs font-medium mb-1 block"
              style={{ color: COLORS.muted }}
            >
              Categoria (opcional)
            </label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border"
              style={{
                background: COLORS.bg,
                borderColor: COLORS.border,
                color: COLORS.text,
              }}
              placeholder="Ex: Diagnóstico"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border font-medium"
              style={{ borderColor: COLORS.border, color: COLORS.muted }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => onSave(name, category)}
              disabled={!name}
              className="flex-1 px-4 py-2 rounded-lg text-white font-medium disabled:opacity-50"
              style={{ background: COLORS.teal }}
            >
              Salvar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CreateConnectionModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (formData: Record<string, string>) => void;
}) {
  const [formData, setFormData] = useState<Record<string, string>>({
    name: "",
    db_engine: "postgres",
    host: "",
    port: "5432",
    database_name: "",
    username: "",
    password: "",
    is_read_only: "true",
  });

  const update = (key: string, value: string) =>
    setFormData((prev) => ({ ...prev, [key]: value }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)" }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
        style={{
          background: COLORS.card,
          border: `1px solid ${COLORS.border}`,
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold" style={{ color: COLORS.text }}>
            Nova Conexão
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{ color: COLORS.muted }}
          >
            <X size={20} />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label
              className="text-xs font-medium mb-1 block"
              style={{ color: COLORS.muted }}
            >
              Nome
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => update("name", e.target.value)}
              className="w-full px-3 py-2 rounded-lg border"
              style={{
                background: COLORS.bg,
                borderColor: COLORS.border,
                color: COLORS.text,
              }}
              placeholder="Ex: AçoPeças Produção"
            />
          </div>
          <div>
            <label
              className="text-xs font-medium mb-1 block"
              style={{ color: COLORS.muted }}
            >
              Engine
            </label>
            <select
              value={formData.db_engine}
              onChange={(e) => update("db_engine", e.target.value)}
              className="w-full px-3 py-2 rounded-lg border"
              style={{
                background: COLORS.bg,
                borderColor: COLORS.border,
                color: COLORS.text,
              }}
            >
              <option value="postgres">PostgreSQL</option>
              <option value="mysql">MySQL</option>
              <option value="sqlserver">SQL Server</option>
              <option value="oracle">Oracle</option>
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label
                className="text-xs font-medium mb-1 block"
                style={{ color: COLORS.muted }}
              >
                Host
              </label>
              <input
                type="text"
                value={formData.host}
                onChange={(e) => update("host", e.target.value)}
                className="w-full px-3 py-2 rounded-lg border"
                style={{
                  background: COLORS.bg,
                  borderColor: COLORS.border,
                  color: COLORS.text,
                }}
                placeholder="10.0.0.1"
              />
            </div>
            <div>
              <label
                className="text-xs font-medium mb-1 block"
                style={{ color: COLORS.muted }}
              >
                Porta
              </label>
              <input
                type="number"
                value={formData.port}
                onChange={(e) => update("port", e.target.value)}
                className="w-full px-3 py-2 rounded-lg border"
                style={{
                  background: COLORS.bg,
                  borderColor: COLORS.border,
                  color: COLORS.text,
                }}
              />
            </div>
          </div>
          <div>
            <label
              className="text-xs font-medium mb-1 block"
              style={{ color: COLORS.muted }}
            >
              Database
            </label>
            <input
              type="text"
              value={formData.database_name}
              onChange={(e) => update("database_name", e.target.value)}
              className="w-full px-3 py-2 rounded-lg border"
              style={{
                background: COLORS.bg,
                borderColor: COLORS.border,
                color: COLORS.text,
              }}
              placeholder="nome_do_banco"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                className="text-xs font-medium mb-1 block"
                style={{ color: COLORS.muted }}
              >
                Usuário
              </label>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => update("username", e.target.value)}
                className="w-full px-3 py-2 rounded-lg border"
                style={{
                  background: COLORS.bg,
                  borderColor: COLORS.border,
                  color: COLORS.text,
                }}
              />
            </div>
            <div>
              <label
                className="text-xs font-medium mb-1 block"
                style={{ color: COLORS.muted }}
              >
                Senha
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => update("password", e.target.value)}
                className="w-full px-3 py-2 rounded-lg border"
                style={{
                  background: COLORS.bg,
                  borderColor: COLORS.border,
                  color: COLORS.text,
                }}
              />
            </div>
          </div>
          <div>
            <label
              className="text-xs font-medium mb-1 block"
              style={{ color: COLORS.muted }}
            >
              Modo
            </label>
            <select
              value={formData.is_read_only}
              onChange={(e) => update("is_read_only", e.target.value)}
              className="w-full px-3 py-2 rounded-lg border"
              style={{
                background: COLORS.bg,
                borderColor: COLORS.border,
                color: COLORS.text,
              }}
            >
              <option value="true">Read-only (apenas SELECT)</option>
              <option value="false">
                Full access (permite INSERT/UPDATE/DELETE)
              </option>
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border font-medium"
              style={{ borderColor: COLORS.border, color: COLORS.muted }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => onCreate(formData)}
              disabled={!formData.name || !formData.host || !formData.password}
              className="flex-1 px-4 py-2 rounded-lg text-white font-medium disabled:opacity-50"
              style={{ background: COLORS.teal }}
            >
              Criar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
