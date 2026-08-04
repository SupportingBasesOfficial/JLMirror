// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState, useCallback } from "react";
import { Globe, Save, Loader2, RefreshCw, ExternalLink } from "lucide-react";
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
};

interface StatusPageConfig {
  id: string;
  slug: string;
  page_title: string;
  company_name: string;
  logo_url: string | null;
  primary_color: string;
  show_uptime: boolean;
  show_incident_history: boolean;
  show_sla_percentage: boolean;
  days_of_history: number;
  support_email: string | null;
  support_url: string | null;
  is_published: boolean;
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

export default function StatusPageAdminPage() {
  const { data: configData, mutate } = useApi<{
    config: StatusPageConfig | null;
  }>("/api/v1/status-page/admin/config");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const config = configData?.config;

  const [form, setForm] = useState({
    slug: config?.slug ?? "",
    page_title: config?.page_title ?? "Status do Sistema",
    company_name: config?.company_name ?? "",
    logo_url: config?.logo_url ?? "",
    primary_color: config?.primary_color ?? "#0d9488",
    show_uptime: config?.show_uptime ?? true,
    show_incident_history: config?.show_incident_history ?? true,
    show_sla_percentage: config?.show_sla_percentage ?? false,
    days_of_history: config?.days_of_history ?? 90,
    support_email: config?.support_email ?? "",
    support_url: config?.support_url ?? "",
    is_published: config?.is_published ?? false,
  });

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/v1/status-page/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...form,
          logo_url: form.logo_url || null,
          support_email: form.support_email || null,
          support_url: form.support_url || null,
        }),
      });
      if (res.ok) {
        setSuccess("Configuração salva com sucesso");
        mutate();
      } else {
        const data = await res.json();
        setError(data?.error?.message ?? "Erro ao salvar");
      }
    } catch {
      setError("Erro de conexão");
    } finally {
      setSaving(false);
    }
  }, [form, mutate]);

  const publicUrl = form.slug ? `/status/${form.slug}` : null;

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
            <Globe size={18} className="inline mr-1" /> Status Page Público
          </h1>
          <p className="text-[12px]" style={{ color: COLORS.muted }}>
            Página pública de status · Acessível sem autenticação
          </p>
        </div>
        <button
          onClick={() => mutate()}
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

      {/* Public URL Preview */}
      {publicUrl && (
        <div
          className="rounded-lg p-3 flex items-center gap-2"
          style={{
            background: "var(--surface-1)",
            border: `1px solid ${COLORS.border}`,
          }}
        >
          <Globe size={14} style={{ color: COLORS.teal }} />
          <span className="text-[12px]" style={{ color: COLORS.muted }}>
            URL pública:
          </span>
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12px] font-bold flex items-center gap-1"
            style={{ color: COLORS.teal }}
          >
            {publicUrl} <ExternalLink size={10} />
          </a>
          {!form.is_published && (
            <span
              className="text-[10px] px-2 py-0.5 rounded"
              style={{ background: `${COLORS.amber}15`, color: COLORS.amber }}
            >
              Não publicado
            </span>
          )}
        </div>
      )}

      {/* Config Form */}
      <div
        className="rounded-xl p-6 space-y-4"
        style={{
          background: COLORS.card,
          border: `1px solid ${COLORS.border}`,
        }}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label style={labelStyle}>Slug (URL) *</label>
            <input
              style={inputStyle}
              value={form.slug}
              onChange={(e) =>
                setForm({
                  ...form,
                  slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                })
              }
              placeholder="ex: jl-informatica"
            />
            <p className="text-[10px] mt-1" style={{ color: COLORS.muted }}>
              Apenas letras minúsculas, números e hífens
            </p>
          </div>
          <div>
            <label style={labelStyle}>Nome da Empresa *</label>
            <input
              style={inputStyle}
              value={form.company_name}
              onChange={(e) =>
                setForm({ ...form, company_name: e.target.value })
              }
            />
          </div>
          <div>
            <label style={labelStyle}>Título da Página</label>
            <input
              style={inputStyle}
              value={form.page_title}
              onChange={(e) => setForm({ ...form, page_title: e.target.value })}
            />
          </div>
          <div>
            <label style={labelStyle}>URL do Logo</label>
            <input
              style={inputStyle}
              value={form.logo_url}
              onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
              placeholder="https://..."
            />
          </div>
          <div>
            <label style={labelStyle}>Cor Primária</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.primary_color}
                onChange={(e) =>
                  setForm({ ...form, primary_color: e.target.value })
                }
                style={{
                  width: "32px",
                  height: "32px",
                  border: "1px solid var(--border-default)",
                  borderRadius: "6px",
                  cursor: "pointer",
                  padding: 0,
                }}
              />
              <input
                style={{ ...inputStyle, width: "80px" }}
                value={form.primary_color}
                onChange={(e) =>
                  setForm({ ...form, primary_color: e.target.value })
                }
              />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Dias de Histórico</label>
            <input
              type="number"
              style={inputStyle}
              value={form.days_of_history}
              onChange={(e) =>
                setForm({
                  ...form,
                  days_of_history: parseInt(e.target.value, 10) || 90,
                })
              }
              min={1}
              max={365}
            />
          </div>
          <div>
            <label style={labelStyle}>Email de Suporte</label>
            <input
              style={inputStyle}
              value={form.support_email}
              onChange={(e) =>
                setForm({ ...form, support_email: e.target.value })
              }
              placeholder="suporte@empresa.com"
            />
          </div>
          <div>
            <label style={labelStyle}>URL de Suporte</label>
            <input
              style={inputStyle}
              value={form.support_url}
              onChange={(e) =>
                setForm({ ...form, support_url: e.target.value })
              }
              placeholder="https://..."
            />
          </div>
        </div>

        {/* Toggles */}
        <div className="flex items-center gap-4 flex-wrap">
          <label
            className="flex items-center gap-2 text-[11px]"
            style={{ color: COLORS.text }}
          >
            <input
              type="checkbox"
              checked={form.show_uptime}
              onChange={(e) =>
                setForm({ ...form, show_uptime: e.target.checked })
              }
            />{" "}
            Mostrar Uptime
          </label>
          <label
            className="flex items-center gap-2 text-[11px]"
            style={{ color: COLORS.text }}
          >
            <input
              type="checkbox"
              checked={form.show_incident_history}
              onChange={(e) =>
                setForm({ ...form, show_incident_history: e.target.checked })
              }
            />{" "}
            Mostrar Histórico
          </label>
          <label
            className="flex items-center gap-2 text-[11px]"
            style={{ color: COLORS.text }}
          >
            <input
              type="checkbox"
              checked={form.show_sla_percentage}
              onChange={(e) =>
                setForm({ ...form, show_sla_percentage: e.target.checked })
              }
            />{" "}
            Mostrar SLA %
          </label>
          <label
            className="flex items-center gap-2 text-[11px] font-bold"
            style={{ color: form.is_published ? COLORS.green : COLORS.amber }}
          >
            <input
              type="checkbox"
              checked={form.is_published}
              onChange={(e) =>
                setForm({ ...form, is_published: e.target.checked })
              }
              style={{ width: "16px", height: "16px" }}
            />
            {form.is_published ? "Publicado" : "Não publicado"}
          </label>
        </div>

        <button
          onClick={handleSave}
          disabled={saving || !form.slug || !form.company_name}
          className="px-4 py-1.5 rounded text-[12px] font-bold flex items-center gap-2"
          style={{
            background: COLORS.teal,
            color: "white",
            cursor: "pointer",
            opacity: saving || !form.slug || !form.company_name ? 0.5 : 1,
          }}
        >
          {saving ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Save size={12} />
          )}{" "}
          Salvar Configuração
        </button>
      </div>
    </div>
  );
}
