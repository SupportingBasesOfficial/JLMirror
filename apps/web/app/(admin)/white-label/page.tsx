// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState } from "react";
import {
  Palette,
  Save,
  Loader2,
  Building2,
  Mail,
  MessageSquare,
  Webhook,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Eye,
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

interface Branding {
  id: string;
  company_name: string;
  logo_url: string | null;
  logo_width: number;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  footer_text: string | null;
  footer_url: string | null;
  header_bg_color: string;
  header_text_color: string;
  font_family: string;
  is_active: boolean;
}

interface DeliveryConfig {
  id: string;
  auto_reports_enabled: boolean;
  allowed_delivery_methods: string[];
  default_delivery_method: string;
  email_from: string | null;
  email_subject_prefix: string;
  slack_webhook_url: string | null;
  teams_webhook_url: string | null;
  webhook_url: string | null;
  webhook_headers: Record<string, unknown>;
  monthly_report_limit: number;
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

const DELIVERY_METHODS = [
  { key: "email", label: "Email", icon: <Mail size={12} /> },
  { key: "slack", label: "Slack", icon: <MessageSquare size={12} /> },
  { key: "teams", label: "Teams", icon: <MessageSquare size={12} /> },
  { key: "webhook", label: "Webhook", icon: <Webhook size={12} /> },
];

export default function WhiteLabelPage() {
  const { data: brandingData, mutate: mutateBranding } = useApi<{ branding: Branding | null }>("/api/v1/reports/branding");
  const { data: configData, mutate: mutateConfig } = useApi<{ config: DeliveryConfig | null }>("/api/v1/reports/delivery-config");

  const [savingBranding, setSavingBranding] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const branding = brandingData?.branding;
  const config = configData?.config;

  const [brandingForm, setBrandingForm] = useState({
    company_name: branding?.company_name ?? "",
    logo_url: branding?.logo_url ?? "",
    logo_width: branding?.logo_width ?? 180,
    primary_color: branding?.primary_color ?? "#0d9488",
    secondary_color: branding?.secondary_color ?? "#1f2937",
    accent_color: branding?.accent_color ?? "#3b82f6",
    footer_text: branding?.footer_text ?? "",
    footer_url: branding?.footer_url ?? "",
    header_bg_color: branding?.header_bg_color ?? "#ffffff",
    header_text_color: branding?.header_text_color ?? "#1f2937",
    font_family: branding?.font_family ?? "Helvetica",
    is_active: branding?.is_active ?? true,
  });

  const [configForm, setConfigForm] = useState({
    auto_reports_enabled: config?.auto_reports_enabled ?? false,
    allowed_delivery_methods: config?.allowed_delivery_methods ?? ["email"],
    default_delivery_method: config?.default_delivery_method ?? "email",
    email_from: config?.email_from ?? "",
    email_subject_prefix: config?.email_subject_prefix ?? "[Relatório]",
    slack_webhook_url: config?.slack_webhook_url ?? "",
    teams_webhook_url: config?.teams_webhook_url ?? "",
    webhook_url: config?.webhook_url ?? "",
    monthly_report_limit: config?.monthly_report_limit ?? 0,
  });

  // Sincroniza forms quando dados carregam
  const syncBranding = () => {
    if (branding) {
      setBrandingForm({
        company_name: branding.company_name,
        logo_url: branding.logo_url ?? "",
        logo_width: branding.logo_width,
        primary_color: branding.primary_color,
        secondary_color: branding.secondary_color,
        accent_color: branding.accent_color,
        footer_text: branding.footer_text ?? "",
        footer_url: branding.footer_url ?? "",
        header_bg_color: branding.header_bg_color,
        header_text_color: branding.header_text_color,
        font_family: branding.font_family,
        is_active: branding.is_active,
      });
    }
  };

  const syncConfig = () => {
    if (config) {
      setConfigForm({
        auto_reports_enabled: config.auto_reports_enabled,
        allowed_delivery_methods: config.allowed_delivery_methods,
        default_delivery_method: config.default_delivery_method,
        email_from: config.email_from ?? "",
        email_subject_prefix: config.email_subject_prefix,
        slack_webhook_url: config.slack_webhook_url ?? "",
        teams_webhook_url: config.teams_webhook_url ?? "",
        webhook_url: config.webhook_url ?? "",
        monthly_report_limit: config.monthly_report_limit,
      });
    }
  };

  const handleSaveBranding = async () => {
    setSavingBranding(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/v1/reports/branding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...brandingForm,
          logo_url: brandingForm.logo_url || null,
          footer_text: brandingForm.footer_text || null,
          footer_url: brandingForm.footer_url || null,
        }),
      });
      if (res.ok) {
        setSuccess("Branding salvo com sucesso");
        mutateBranding();
      } else {
        const data = await res.json();
        setError(data?.error?.message ?? "Erro ao salvar branding");
      }
    } catch {
      setError("Erro de conexão");
    } finally {
      setSavingBranding(false);
    }
  };

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/v1/reports/delivery-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...configForm,
          email_from: configForm.email_from || null,
          slack_webhook_url: configForm.slack_webhook_url || null,
          teams_webhook_url: configForm.teams_webhook_url || null,
          webhook_url: configForm.webhook_url || null,
        }),
      });
      if (res.ok) {
        setSuccess("Configuração de entrega salva");
        mutateConfig();
      } else {
        const data = await res.json();
        setError(data?.error?.message ?? "Erro ao salvar configuração");
      }
    } catch {
      setError("Erro de conexão");
    } finally {
      setSavingConfig(false);
    }
  };

  const toggleDeliveryMethod = (method: string) => {
    setConfigForm((prev) => {
      const methods = prev.allowed_delivery_methods.includes(method)
        ? prev.allowed_delivery_methods.filter((m) => m !== method)
        : [...prev.allowed_delivery_methods, method];
      return { ...prev, allowed_delivery_methods: methods };
    });
  };

  return (
    <div className="min-h-screen p-6 space-y-6" style={{ background: COLORS.bg, fontFamily: "'JetBrains Mono','Consolas',monospace", color: COLORS.text }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold" style={{ color: COLORS.teal }}>
            <Palette size={18} className="inline mr-1" /> White-label & Entrega
          </h1>
          <p className="text-[12px]" style={{ color: COLORS.muted }}>
            Branding automatizado · Admin controla ativação e entrega
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={syncBranding} className="text-[12px] px-3 py-1.5 rounded font-bold flex items-center gap-2" style={{ background: `${COLORS.muted}15`, border: `1px solid ${COLORS.muted}`, color: COLORS.muted, cursor: "pointer" }}>
            <RefreshCw size={12} /> Sync Branding
          </button>
          <button onClick={syncConfig} className="text-[12px] px-3 py-1.5 rounded font-bold flex items-center gap-2" style={{ background: `${COLORS.muted}15`, border: `1px solid ${COLORS.muted}`, color: COLORS.muted, cursor: "pointer" }}>
            <RefreshCw size={12} /> Sync Config
          </button>
        </div>
      </div>

      {error && <div className="rounded-md p-3 text-sm" style={{ background: "var(--status-error-bg)", border: "1px solid var(--status-error-border)", color: COLORS.red }}>{error}</div>}
      {success && <div className="rounded-md p-3 text-sm" style={{ background: "var(--status-ok-bg)", border: "1px solid var(--status-ok-border)", color: COLORS.green }}>{success}</div>}

      {/* Branding Section */}
      <div className="rounded-xl p-6 space-y-4" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
        <div className="flex items-center gap-2">
          <Building2 size={14} style={{ color: COLORS.teal }} />
          <h2 className="text-sm font-bold" style={{ color: COLORS.teal }}>Branding do Tenant</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label style={labelStyle}>Nome da Empresa *</label>
            <input style={inputStyle} value={brandingForm.company_name} onChange={(e) => setBrandingForm({ ...brandingForm, company_name: e.target.value })} placeholder="Ex: JL Informática" />
          </div>
          <div>
            <label style={labelStyle}>URL do Logo</label>
            <input style={inputStyle} value={brandingForm.logo_url} onChange={(e) => setBrandingForm({ ...brandingForm, logo_url: e.target.value })} placeholder="https://..." />
          </div>
          <div>
            <label style={labelStyle}>Largura do Logo (px)</label>
            <input type="number" style={inputStyle} value={brandingForm.logo_width} onChange={(e) => setBrandingForm({ ...brandingForm, logo_width: parseInt(e.target.value, 10) || 180 })} />
          </div>
          <div>
            <label style={labelStyle}>Fonte</label>
            <select style={inputStyle} value={brandingForm.font_family} onChange={(e) => setBrandingForm({ ...brandingForm, font_family: e.target.value })}>
              <option value="Helvetica">Helvetica</option>
              <option value="Times-Roman">Times Roman</option>
              <option value="Courier">Courier</option>
            </select>
          </div>
        </div>

        {/* Color Pickers */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <ColorPicker label="Cor Primária" value={brandingForm.primary_color} onChange={(v) => setBrandingForm({ ...brandingForm, primary_color: v })} />
          <ColorPicker label="Cor Secundária" value={brandingForm.secondary_color} onChange={(v) => setBrandingForm({ ...brandingForm, secondary_color: v })} />
          <ColorPicker label="Cor de Destaque" value={brandingForm.accent_color} onChange={(v) => setBrandingForm({ ...brandingForm, accent_color: v })} />
          <ColorPicker label="Fundo Header" value={brandingForm.header_bg_color} onChange={(v) => setBrandingForm({ ...brandingForm, header_bg_color: v })} />
          <ColorPicker label="Texto Header" value={brandingForm.header_text_color} onChange={(v) => setBrandingForm({ ...brandingForm, header_text_color: v })} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label style={labelStyle}>Texto do Rodapé</label>
            <input style={inputStyle} value={brandingForm.footer_text} onChange={(e) => setBrandingForm({ ...brandingForm, footer_text: e.target.value })} placeholder="Ex: © 2025 JL Informática" />
          </div>
          <div>
            <label style={labelStyle}>URL do Rodapé</label>
            <input style={inputStyle} value={brandingForm.footer_url} onChange={(e) => setBrandingForm({ ...brandingForm, footer_url: e.target.value })} placeholder="https://..." />
          </div>
        </div>

        {/* Preview */}
        <div className="rounded-lg p-4" style={{ background: brandingForm.header_bg_color, border: `1px solid ${COLORS.border}` }}>
          <div className="flex items-center justify-between">
            <div className="text-lg font-bold" style={{ color: brandingForm.primary_color, fontFamily: brandingForm.font_family }}>
              {brandingForm.company_name || "Nome da Empresa"}
            </div>
            <div className="text-[10px]" style={{ color: brandingForm.header_text_color }}>Preview do Cabeçalho</div>
          </div>
        </div>

        <label className="flex items-center gap-2 text-[12px]" style={{ color: COLORS.text }}>
          <input type="checkbox" checked={brandingForm.is_active} onChange={(e) => setBrandingForm({ ...brandingForm, is_active: e.target.checked })} />
          Branding ativo
        </label>

        <button
          onClick={handleSaveBranding}
          disabled={savingBranding || !brandingForm.company_name}
          className="px-4 py-1.5 rounded text-[12px] font-bold flex items-center gap-2"
          style={{ background: COLORS.teal, color: "white", cursor: "pointer", opacity: (savingBranding || !brandingForm.company_name) ? 0.5 : 1 }}
        >
          {savingBranding ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          Salvar Branding
        </button>
      </div>

      {/* Delivery Config Section */}
      <div className="rounded-xl p-6 space-y-4" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
        <div className="flex items-center gap-2">
          <Mail size={14} style={{ color: COLORS.teal }} />
          <h2 className="text-sm font-bold" style={{ color: COLORS.teal }}>Controle de Entrega (Admin)</h2>
        </div>

        <label className="flex items-center gap-2 text-[12px]" style={{ color: COLORS.text }}>
          <input
            type="checkbox"
            checked={configForm.auto_reports_enabled}
            onChange={(e) => setConfigForm({ ...configForm, auto_reports_enabled: e.target.checked })}
            style={{ width: "16px", height: "16px" }}
          />
          <strong>Relatórios automáticos ativados</strong> — Quando ativo, o tenant pode receber relatórios agendados automaticamente
        </label>

        {/* Allowed Delivery Methods */}
        <div>
          <label style={labelStyle}>Meios de Entrega Permitidos</label>
          <div className="flex items-center gap-2 flex-wrap">
            {DELIVERY_METHODS.map((m) => {
              const active = configForm.allowed_delivery_methods.includes(m.key);
              return (
                <button
                  key={m.key}
                  onClick={() => toggleDeliveryMethod(m.key)}
                  className="px-3 py-1.5 rounded text-[11px] font-bold flex items-center gap-2"
                  style={{
                    background: active ? `${COLORS.teal}15` : "var(--surface-1)",
                    border: `1px solid ${active ? COLORS.teal : COLORS.border}`,
                    color: active ? COLORS.teal : COLORS.muted,
                    cursor: "pointer",
                  }}
                >
                  {m.icon} {m.label}
                  {active && <CheckCircle2 size={10} />}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label style={labelStyle}>Método Padrão</label>
            <select style={inputStyle} value={configForm.default_delivery_method} onChange={(e) => setConfigForm({ ...configForm, default_delivery_method: e.target.value })}>
              {DELIVERY_METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Limite Mensal (0 = ilimitado)</label>
            <input type="number" style={inputStyle} value={configForm.monthly_report_limit} onChange={(e) => setConfigForm({ ...configForm, monthly_report_limit: parseInt(e.target.value, 10) || 0 })} min={0} />
          </div>
        </div>

        {/* Email Config */}
        {configForm.allowed_delivery_methods.includes("email") && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 rounded-lg" style={{ background: "var(--surface-1)" }}>
            <div>
              <label style={labelStyle}>Email Remetente</label>
              <input style={inputStyle} value={configForm.email_from} onChange={(e) => setConfigForm({ ...configForm, email_from: e.target.value })} placeholder="reports@empresa.com" />
            </div>
            <div>
              <label style={labelStyle}>Prefixo do Assunto</label>
              <input style={inputStyle} value={configForm.email_subject_prefix} onChange={(e) => setConfigForm({ ...configForm, email_subject_prefix: e.target.value })} />
            </div>
          </div>
        )}

        {/* Slack Config */}
        {configForm.allowed_delivery_methods.includes("slack") && (
          <div className="p-3 rounded-lg" style={{ background: "var(--surface-1)" }}>
            <label style={labelStyle}>Slack Webhook URL</label>
            <input style={inputStyle} value={configForm.slack_webhook_url} onChange={(e) => setConfigForm({ ...configForm, slack_webhook_url: e.target.value })} placeholder="https://hooks.slack.com/..." />
          </div>
        )}

        {/* Teams Config */}
        {configForm.allowed_delivery_methods.includes("teams") && (
          <div className="p-3 rounded-lg" style={{ background: "var(--surface-1)" }}>
            <label style={labelStyle}>Teams Webhook URL</label>
            <input style={inputStyle} value={configForm.teams_webhook_url} onChange={(e) => setConfigForm({ ...configForm, teams_webhook_url: e.target.value })} placeholder="https://outlook.office.com/..." />
          </div>
        )}

        {/* Webhook Config */}
        {configForm.allowed_delivery_methods.includes("webhook") && (
          <div className="p-3 rounded-lg" style={{ background: "var(--surface-1)" }}>
            <label style={labelStyle}>Webhook URL Genérico</label>
            <input style={inputStyle} value={configForm.webhook_url} onChange={(e) => setConfigForm({ ...configForm, webhook_url: e.target.value })} placeholder="https://..." />
          </div>
        )}

        <button
          onClick={handleSaveConfig}
          disabled={savingConfig}
          className="px-4 py-1.5 rounded text-[12px] font-bold flex items-center gap-2"
          style={{ background: COLORS.teal, color: "white", cursor: "pointer", opacity: savingConfig ? 0.5 : 1 }}
        >
          {savingConfig ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          Salvar Configuração
        </button>
      </div>
    </div>
  );
}

function ColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label style={{
        fontSize: "10px",
        fontWeight: "bold",
        textTransform: "uppercase",
        color: "var(--text-muted)",
        marginBottom: "4px",
        display: "block",
      }}>{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: "32px", height: "32px", border: "1px solid var(--border-default)", borderRadius: "6px", cursor: "pointer", padding: 0 }}
        />
        <input
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-default)",
            color: "var(--text-primary)",
            borderRadius: "6px",
            padding: "6px 10px",
            fontSize: "11px",
            width: "80px",
          }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}
