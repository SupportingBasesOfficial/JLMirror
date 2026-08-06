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

const EXPORT_FORMATS = ["csv", "json", "xlsx", "sql"];
const STATUS_COLORS: Record<string, string> = {
  completed: COLORS.green,
  failed: COLORS.red,
  pending: COLORS.amber,
  processing: COLORS.blue,
  partial: COLORS.amber,
  cancelled: COLORS.muted,
};

interface DataExport {
  id: string;
  name: string;
  source_table: string;
  format: string;
  status: string;
  row_count: number | null;
  file_size_bytes: number | null;
  duration_ms: number | null;
  error_message: string | null;
  created_at: string;
}

interface DataImport {
  id: string;
  name: string;
  target_table: string;
  format: string;
  status: string;
  total_rows: number;
  successful_rows: number;
  failed_rows: number;
  duration_ms: number | null;
  error_log: string | null;
  created_at: string;
}

interface ExportTemplate {
  id: string;
  name: string;
  source_table: string;
  format: string;
  columns: string[];
  is_active: boolean;
  created_at: string;
}

interface WhitelistedTable {
  table_name: string;
  allowed_export: boolean;
  allowed_import: boolean;
  max_export_rows: number;
}

interface TransferStats {
  exports: {
    total_exports: string;
    completed: string;
    failed: string;
    processing: string;
    total_rows_exported: string;
    total_size_bytes: string;
  };
  imports: {
    total_imports: string;
    completed: string;
    failed: string;
    partial: string;
    processing: string;
    total_rows_imported: string;
    successful_rows: string;
    failed_rows: string;
  };
  templates_count: string;
  recent_exports: DataExport[];
  recent_imports: DataImport[];
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

function formatSize(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1048576).toFixed(1)}MB`;
}

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function DataTransferPage() {
  const [exportResult, setExportResult] = useState<{
    content: string;
    ext: string;
    name: string;
  } | null>(null);

  // Export form
  const [eName, setEName] = useState("");
  const [eTable, setETable] = useState("");
  const [eFormat, setEFormat] = useState("csv");
  const [eColumns, setEColumns] = useState("");

  // Import form
  const [iName, setIName] = useState("");
  const [iTable, setITable] = useState("");
  const [iFormat, setIFormat] = useState("csv");
  const [iData, setIData] = useState("");

  // Template form
  const [tName, setTName] = useState("");
  const [tTable, setTTable] = useState("");
  const [tFormat, setTFormat] = useState("csv");
  const [tColumns, setTColumns] = useState("");

  const {
    data: exData,
    isLoading: loading,
    mutate: mutateExports,
  } = useApi<{ exports: DataExport[] }>("/api/data-transfer/exports");
  const { data: imData, mutate: mutateImports } = useApi<{
    imports: DataImport[];
  }>("/api/data-transfer/imports");
  const { data: tplData, mutate: mutateTemplates } = useApi<{
    templates: ExportTemplate[];
  }>("/api/data-transfer/templates");
  const { data: wlData, mutate: mutateWhitelist } = useApi<{
    whitelist: WhitelistedTable[];
  }>("/api/data-transfer/whitelist");
  const { data: stats, mutate: mutateStats } = useApi<TransferStats>(
    "/api/data-transfer/stats",
  );
  const exports = exData?.exports ?? [];
  const imports = imData?.imports ?? [];
  const templates = tplData?.templates ?? [];
  const whitelist = wlData?.whitelist ?? [];
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tab, setTab] = useState<"exports" | "imports" | "templates">(
    "exports",
  );
  const [showExport, setShowExport] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);

  async function handleExport() {
    setError(null);
    try {
      const cols = eColumns
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await fetch("/api/data-transfer/exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: eName,
          source_table: eTable,
          format: eFormat,
          columns: cols,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Erro ao exportar");
        return;
      }
      setSuccess(
        `Export concluído: ${data.row_count} linhas, ${formatSize(data.file_size_bytes)}`,
      );
      if (data.file_content) {
        setExportResult({
          content: data.file_content,
          ext: data.file_ext,
          name: eName,
        });
      }
      setShowExport(false);
      setEName("");
      setEColumns("");
      mutateExports();
      mutateStats();
    } catch {
      setError("Erro de conexão");
    }
  }

  async function handleCreateImport() {
    setError(null);
    try {
      const res = await fetch("/api/data-transfer/imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: iName,
          target_table: iTable,
          format: iFormat,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Erro ao criar import");
        return;
      }
      setSuccess("Import criado! Cole os dados e execute.");
      setShowImport(false);
      mutateImports();
      mutateStats();
    } catch {
      setError("Erro de conexão");
    }
  }

  async function handleRunImport(id: string) {
    setError(null);
    try {
      let parsedData: unknown[] = [];
      if (iData) {
        if (iFormat === "json") {
          parsedData = JSON.parse(iData);
        } else {
          // CSV simples: primeira linha = headers
          const lines = iData.split("\n").filter((l) => l.trim());
          if (lines.length > 1) {
            const headers = lines[0].split(",").map((h) => h.trim());
            parsedData = lines.slice(1).map((line) => {
              const values = line.split(",");
              const row = Object.fromEntries(
                headers.map((h, idx) => [h, (values.at(idx) ?? "").trim()]),
              );
              return row;
            });
          }
        }
      }

      const res = await fetch(`/api/data-transfer/imports/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ data: parsedData }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Erro ao executar import");
        return;
      }
      setSuccess(
        `Import: ${data.status} — ${data.successful_rows} sucesso, ${data.failed_rows} falhas de ${data.total_rows} linhas`,
      );
      setIData("");
      mutateImports();
      mutateStats();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao processar dados");
    }
  }

  async function handleCreateTemplate() {
    setError(null);
    try {
      const cols = tColumns
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await fetch("/api/data-transfer/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: tName,
          source_table: tTable,
          format: tFormat,
          columns: cols,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Erro ao criar template");
        return;
      }
      setSuccess("Template criado!");
      setShowTemplate(false);
      setTName("");
      setTColumns("");
      mutateTemplates();
      mutateStats();
    } catch {
      setError("Erro de conexão");
    }
  }

  async function handleDeleteExport(id: string) {
    try {
      const res = await fetch(`/api/data-transfer/exports/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        mutateExports();
        mutateStats();
      }
    } catch (err) {
      console.error("Operacao falhou:", err);
    }
  }

  async function handleDeleteImport(id: string) {
    try {
      const res = await fetch(`/api/data-transfer/imports/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        mutateImports();
        mutateStats();
      }
    } catch (err) {
      console.error("Operacao falhou:", err);
    }
  }

  async function handleDeleteTemplate(id: string) {
    try {
      const res = await fetch(`/api/data-transfer/templates/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        mutateTemplates();
        mutateStats();
      }
    } catch (err) {
      console.error("Operacao falhou:", err);
    }
  }

  function downloadExport() {
    if (exportResult) {
      const blob = new Blob([exportResult.content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${exportResult.name}.${exportResult.ext}`;
      a.click();
      URL.revokeObjectURL(url);
      setExportResult(null);
    }
  }

  const exportableTables = whitelist.filter((w) => w.allowed_export);
  const importableTables = whitelist.filter((w) => w.allowed_import);

  if (loading) return <LoadingState label="Carregando transferencias..." />;

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
            Data Export & Import — Transferência de Dados
          </h1>
          <p className="text-[12px]" style={{ color: COLORS.muted }}>
            CSV · JSON · SQL · Templates · Whitelist de Segurança · Validação
          </p>
        </div>
        <div className="flex gap-2">
          {tab === "exports" && (
            <button
              onClick={() => setShowExport(true)}
              className="text-[12px] px-3 py-1.5 rounded font-bold"
              style={{
                background: COLORS.teal,
                color: COLORS.bg,
                cursor: "pointer",
              }}
            >
              <Plus size={12} className="inline" /> Export
            </button>
          )}
          {tab === "imports" && (
            <button
              onClick={() => setShowImport(true)}
              className="text-[12px] px-3 py-1.5 rounded font-bold"
              style={{
                background: COLORS.teal,
                color: COLORS.bg,
                cursor: "pointer",
              }}
            >
              <Plus size={12} className="inline" /> Import
            </button>
          )}
          {tab === "templates" && (
            <button
              onClick={() => setShowTemplate(true)}
              className="text-[12px] px-3 py-1.5 rounded font-bold"
              style={{
                background: COLORS.teal,
                color: COLORS.bg,
                cursor: "pointer",
              }}
            >
              <Plus size={12} className="inline" /> Template
            </button>
          )}
          <button
            onClick={() => {
              mutateExports();
              mutateImports();
              mutateTemplates();
              mutateWhitelist();
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

      {/* Export result banner */}
      {exportResult && (
        <div
          className="rounded-md p-4"
          style={{
            background: `var(--status-info-bg)`,
            border: `1px solid var(--status-info-border)`,
          }}
        >
          <div
            className="text-[12px] font-bold mb-2"
            style={{ color: COLORS.blue }}
          >
            Export pronto para download
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[12px]" style={{ color: COLORS.muted }}>
              {exportResult.name}.{exportResult.ext} (
              {exportResult.content.length} chars)
            </span>
            <button
              onClick={downloadExport}
              className="px-3 py-2 rounded text-[12px] font-bold"
              style={{
                background: COLORS.blue,
                color: COLORS.bg,
                cursor: "pointer",
              }}
            >
              Download
            </button>
            <button
              onClick={() => setExportResult(null)}
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
              Exports
            </div>
            <div className="text-2xl font-bold" style={{ color: COLORS.teal }}>
              {stats.exports.total_exports}
            </div>
            <div className="text-[10px]" style={{ color: COLORS.muted }}>
              {stats.exports.completed} concluídos
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
              Linhas Exportadas
            </div>
            <div className="text-2xl font-bold" style={{ color: COLORS.green }}>
              {stats.exports.total_rows_exported}
            </div>
            <div className="text-[10px]" style={{ color: COLORS.muted }}>
              {formatSize(parseInt(stats.exports.total_size_bytes || "0", 10))}
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
              Imports
            </div>
            <div className="text-2xl font-bold" style={{ color: COLORS.blue }}>
              {stats.imports.total_imports}
            </div>
            <div className="text-[10px]" style={{ color: COLORS.muted }}>
              {stats.imports.successful_rows} linhas importadas
            </div>
          </div>
          <div
            className="p-4 rounded-xl"
            style={{
              background: COLORS.card,
              border: `1px solid color-mix(in srgb, var(--status-info-text) 27%, transparent)`,
            }}
          >
            <div
              className="text-[10px] uppercase mb-1"
              style={{ color: COLORS.muted }}
            >
              Templates
            </div>
            <div
              className="text-2xl font-bold"
              style={{ color: COLORS.purple }}
            >
              {stats.templates_count}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1">
        {(
          [
            { key: "exports", label: `Exports (${exports.length})` },
            { key: "imports", label: `Imports (${imports.length})` },
            { key: "templates", label: `Templates (${templates.length})` },
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

      {/* Tab: Exports */}
      {tab === "exports" && (
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderTop: "none",
          }}
        >
          {exports.length === 0 ? (
            <div
              className="p-8 text-center text-sm"
              style={{ color: COLORS.muted }}
            >
              Nenhuma exportação realizada
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
                    Tabela
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Formato
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
                    Linhas
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Tamanho
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
                    Data
                  </th>
                  <th
                    className="text-right px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  ></th>
                </tr>
              </thead>
              <tbody>
                {exports.map((e) => (
                  <tr
                    key={e.id}
                    style={{ borderBottom: `1px solid ${COLORS.border}` }}
                  >
                    <td className="px-3 py-2" style={{ color: COLORS.teal }}>
                      {e.name}
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                      {e.source_table}
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.blue }}>
                      {e.format}
                    </td>
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
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                      {e.row_count ?? "—"}
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                      {formatSize(e.file_size_bytes)}
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                      {formatDuration(e.duration_ms)}
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                      {formatTime(e.created_at)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => handleDeleteExport(e.id)}
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab: Imports */}
      {tab === "imports" && (
        <div className="space-y-4">
          <div
            className="rounded-xl overflow-hidden"
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
              borderTop: "none",
            }}
          >
            {imports.length === 0 ? (
              <div
                className="p-8 text-center text-sm"
                style={{ color: COLORS.muted }}
              >
                Nenhuma importação criada
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
                      Tabela
                    </th>
                    <th
                      className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                      style={{ color: COLORS.muted }}
                    >
                      Formato
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
                      Linhas
                    </th>
                    <th
                      className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                      style={{ color: COLORS.muted }}
                    >
                      Sucesso/Falha
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
                      Data
                    </th>
                    <th
                      className="text-right px-3 py-2 font-bold uppercase text-[10px]"
                      style={{ color: COLORS.muted }}
                    ></th>
                  </tr>
                </thead>
                <tbody>
                  {imports.map((imp) => (
                    <tr
                      key={imp.id}
                      style={{ borderBottom: `1px solid ${COLORS.border}` }}
                    >
                      <td className="px-3 py-2" style={{ color: COLORS.teal }}>
                        {imp.name}
                      </td>
                      <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                        {imp.target_table}
                      </td>
                      <td className="px-3 py-2" style={{ color: COLORS.blue }}>
                        {imp.format}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                          style={{
                            background: `${STATUS_COLORS[imp.status] ?? COLORS.muted}15`,
                            color: STATUS_COLORS[imp.status] ?? COLORS.muted,
                          }}
                        >
                          {imp.status}
                        </span>
                      </td>
                      <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                        {imp.total_rows}
                      </td>
                      <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                        <span style={{ color: COLORS.green }}>
                          {imp.successful_rows}
                        </span>{" "}
                        /{" "}
                        <span style={{ color: COLORS.red }}>
                          {imp.failed_rows}
                        </span>
                      </td>
                      <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                        {formatDuration(imp.duration_ms)}
                      </td>
                      <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                        {formatTime(imp.created_at)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {imp.status === "pending" && (
                          <button
                            onClick={() => handleRunImport(imp.id)}
                            className="px-2 py-1 rounded text-[10px] font-bold mr-1"
                            style={{
                              background: `color-mix(in srgb, var(--status-info-text) 12%, transparent)`,
                              border: `1px solid var(--status-info-border)`,
                              color: COLORS.blue,
                              cursor: "pointer",
                            }}
                          >
                            Run
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteImport(imp.id)}
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
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Import data input */}
          {imports.some((imp) => imp.status === "pending") && (
            <div
              className="rounded-xl p-4"
              style={{
                background: COLORS.card,
                border: `1px solid ${COLORS.border}`,
              }}
            >
              <div
                className="text-[12px] font-bold mb-2"
                style={{ color: COLORS.muted }}
              >
                DADOS PARA IMPORT (cole aqui)
              </div>
              <textarea
                value={iData}
                onChange={(e) => setIData(e.target.value)}
                rows={6}
                placeholder={
                  iFormat === "json"
                    ? '[{"name": "value"}, ...]'
                    : "col1,col2,col3\nval1,val2,val3"
                }
                className="w-full rounded-md px-3 py-2 text-[12px]"
                style={{
                  background: COLORS.bg,
                  border: `1px solid ${COLORS.border}`,
                  color: COLORS.text,
                }}
              />
              <div className="flex gap-2 mt-2">
                <select
                  value={iFormat}
                  onChange={(e) => setIFormat(e.target.value)}
                  className="rounded-md px-3 py-1.5 text-[12px]"
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text,
                  }}
                >
                  <option value="csv">CSV</option>
                  <option value="json">JSON</option>
                </select>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Templates */}
      {tab === "templates" && (
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderTop: "none",
          }}
        >
          {templates.length === 0 ? (
            <div
              className="p-8 text-center text-sm"
              style={{ color: COLORS.muted }}
            >
              Nenhum template criado
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
                    Tabela
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Formato
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Colunas
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
                    Criado
                  </th>
                  <th
                    className="text-right px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  ></th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr
                    key={t.id}
                    style={{
                      borderBottom: `1px solid ${COLORS.border}`,
                      opacity: t.is_active ? 1 : 0.4,
                    }}
                  >
                    <td className="px-3 py-2" style={{ color: COLORS.teal }}>
                      {t.name}
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                      {t.source_table}
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.blue }}>
                      {t.format}
                    </td>
                    <td
                      className="px-3 py-2 max-w-[200px] truncate"
                      style={{ color: COLORS.muted }}
                    >
                      {Array.isArray(t.columns)
                        ? t.columns.join(", ") || "*"
                        : "*"}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                        style={{
                          background: t.is_active
                            ? `var(--status-ok-bg)`
                            : `color-mix(in srgb, var(--text-muted) 8%, transparent)`,
                          color: t.is_active ? COLORS.green : COLORS.muted,
                        }}
                      >
                        {t.is_active ? "active" : "inactive"}
                      </span>
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                      {formatTime(t.created_at)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => handleDeleteTemplate(t.id)}
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modal: Export */}
      {showExport && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "var(--overlay-modal)" }}
          onClick={() => setShowExport(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setShowExport(false);
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
                Nova Exportação
              </h2>
              <button
                onClick={() => setShowExport(false)}
                className="text-[16px]"
                style={{ color: COLORS.muted, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>
            <div className="space-y-4">
              <div className="space-y-1">
                <label
                  htmlFor="ex-n"
                  className="text-[11px] font-bold uppercase"
                  style={{ color: COLORS.muted }}
                >
                  Nome
                </label>
                <input
                  id="ex-n"
                  type="text"
                  value={eName}
                  onChange={(e) => setEName(e.target.value)}
                  placeholder="Export Devices 2026"
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
                    htmlFor="ex-t"
                    className="text-[11px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    Tabela
                  </label>
                  <select
                    id="ex-t"
                    value={eTable}
                    onChange={(e) => setETable(e.target.value)}
                    className="w-full rounded-md px-3 py-2 text-[12px]"
                    style={{
                      background: COLORS.bg,
                      border: `1px solid ${COLORS.border}`,
                      color: COLORS.text,
                    }}
                  >
                    <option value="">Selecione...</option>
                    {exportableTables.map((t) => (
                      <option key={t.table_name} value={t.table_name}>
                        {t.table_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="ex-f"
                    className="text-[11px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    Formato
                  </label>
                  <select
                    id="ex-f"
                    value={eFormat}
                    onChange={(e) => setEFormat(e.target.value)}
                    className="w-full rounded-md px-3 py-2 text-[12px]"
                    style={{
                      background: COLORS.bg,
                      border: `1px solid ${COLORS.border}`,
                      color: COLORS.text,
                    }}
                  >
                    {EXPORT_FORMATS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="ex-c"
                  className="text-[11px] font-bold uppercase"
                  style={{ color: COLORS.muted }}
                >
                  Colunas (vírgula, vazio = todas)
                </label>
                <input
                  id="ex-c"
                  type="text"
                  value={eColumns}
                  onChange={(e) => setEColumns(e.target.value)}
                  placeholder="id, name, status"
                  className="w-full rounded-md px-3 py-2 text-[13px]"
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text,
                  }}
                />
              </div>
              <button
                onClick={handleExport}
                disabled={!eName || !eTable}
                className="w-full rounded-md py-2.5 text-sm font-bold disabled:opacity-50"
                style={{
                  background: COLORS.teal,
                  color: COLORS.bg,
                  cursor: !eName || !eTable ? "not-allowed" : "pointer",
                }}
              >
                Exportar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Import */}
      {showImport && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "var(--overlay-modal)" }}
          onClick={() => setShowImport(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setShowImport(false);
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
                Nova Importação
              </h2>
              <button
                onClick={() => setShowImport(false)}
                className="text-[16px]"
                style={{ color: COLORS.muted, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>
            <div className="space-y-4">
              <div className="space-y-1">
                <label
                  htmlFor="im-n"
                  className="text-[11px] font-bold uppercase"
                  style={{ color: COLORS.muted }}
                >
                  Nome
                </label>
                <input
                  id="im-n"
                  type="text"
                  value={iName}
                  onChange={(e) => setIName(e.target.value)}
                  placeholder="Import Devices Batch"
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
                    htmlFor="im-t"
                    className="text-[11px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    Tabela
                  </label>
                  <select
                    id="im-t"
                    value={iTable}
                    onChange={(e) => setITable(e.target.value)}
                    className="w-full rounded-md px-3 py-2 text-[12px]"
                    style={{
                      background: COLORS.bg,
                      border: `1px solid ${COLORS.border}`,
                      color: COLORS.text,
                    }}
                  >
                    <option value="">Selecione...</option>
                    {importableTables.map((t) => (
                      <option key={t.table_name} value={t.table_name}>
                        {t.table_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="im-f"
                    className="text-[11px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    Formato
                  </label>
                  <select
                    id="im-f"
                    value={iFormat}
                    onChange={(e) => setIFormat(e.target.value)}
                    className="w-full rounded-md px-3 py-2 text-[12px]"
                    style={{
                      background: COLORS.bg,
                      border: `1px solid ${COLORS.border}`,
                      color: COLORS.text,
                    }}
                  >
                    <option value="csv">CSV</option>
                    <option value="json">JSON</option>
                  </select>
                </div>
              </div>
              <button
                onClick={handleCreateImport}
                disabled={!iName || !iTable}
                className="w-full rounded-md py-2.5 text-sm font-bold disabled:opacity-50"
                style={{
                  background: COLORS.teal,
                  color: COLORS.bg,
                  cursor: !iName || !iTable ? "not-allowed" : "pointer",
                }}
              >
                Criar Import
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Template */}
      {showTemplate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "var(--overlay-modal)" }}
          onClick={() => setShowTemplate(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setShowTemplate(false);
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
                Novo Template
              </h2>
              <button
                onClick={() => setShowTemplate(false)}
                className="text-[16px]"
                style={{ color: COLORS.muted, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>
            <div className="space-y-4">
              <div className="space-y-1">
                <label
                  htmlFor="tp-n"
                  className="text-[11px] font-bold uppercase"
                  style={{ color: COLORS.muted }}
                >
                  Nome
                </label>
                <input
                  id="tp-n"
                  type="text"
                  value={tName}
                  onChange={(e) => setTName(e.target.value)}
                  placeholder="Devices Full Export"
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
                    htmlFor="tp-t"
                    className="text-[11px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    Tabela
                  </label>
                  <select
                    id="tp-t"
                    value={tTable}
                    onChange={(e) => setTTable(e.target.value)}
                    className="w-full rounded-md px-3 py-2 text-[12px]"
                    style={{
                      background: COLORS.bg,
                      border: `1px solid ${COLORS.border}`,
                      color: COLORS.text,
                    }}
                  >
                    <option value="">Selecione...</option>
                    {exportableTables.map((t) => (
                      <option key={t.table_name} value={t.table_name}>
                        {t.table_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="tp-f"
                    className="text-[11px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    Formato
                  </label>
                  <select
                    id="tp-f"
                    value={tFormat}
                    onChange={(e) => setTFormat(e.target.value)}
                    className="w-full rounded-md px-3 py-2 text-[12px]"
                    style={{
                      background: COLORS.bg,
                      border: `1px solid ${COLORS.border}`,
                      color: COLORS.text,
                    }}
                  >
                    {EXPORT_FORMATS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="tp-c"
                  className="text-[11px] font-bold uppercase"
                  style={{ color: COLORS.muted }}
                >
                  Colunas (vírgula, vazio = todas)
                </label>
                <input
                  id="tp-c"
                  type="text"
                  value={tColumns}
                  onChange={(e) => setTColumns(e.target.value)}
                  placeholder="id, name, ip_address, status"
                  className="w-full rounded-md px-3 py-2 text-[13px]"
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text,
                  }}
                />
              </div>
              <button
                onClick={handleCreateTemplate}
                disabled={!tName || !tTable}
                className="w-full rounded-md py-2.5 text-sm font-bold disabled:opacity-50"
                style={{
                  background: COLORS.teal,
                  color: COLORS.bg,
                  cursor: !tName || !tTable ? "not-allowed" : "pointer",
                }}
              >
                Criar Template
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
