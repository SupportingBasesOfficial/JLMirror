// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState, useEffect } from "react";
import { RefreshCw, ArrowLeft } from "lucide-react";
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

const COLOR_PRESETS = ["#1BA898", "#3E8BF0", "#8B5CF6", "#F5A623", "#E5484D", "#30A46C", "#EC4899", "#14B8A6"];

interface Settings {
  company_name: string | null;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  custom_css: string | null;
  login_message: string | null;
  smtp_enabled: boolean;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_username: string | null;
  smtp_password_encrypted: string | null;
  smtp_from_email: string | null;
  smtp_from_name: string | null;
  smtp_use_tls: boolean;
  smtp_use_ssl: boolean;
  slack_webhook_url: string | null;
  slack_enabled: boolean;
  discord_webhook_url: string | null;
  discord_enabled: boolean;
  telegram_bot_token: string | null;
  telegram_chat_id: string | null;
  telegram_enabled: boolean;
  max_devices: number;
  max_users: number;
  max_api_keys: number;
  max_webhooks: number;
  max_scheduled_tasks: number;
  max_storage_mb: number;
  max_retention_days: number;
  enable_monitoring: boolean;
  enable_alerts: boolean;
  enable_tickets: boolean;
  enable_kb: boolean;
  enable_reports: boolean;
  enable_api_access: boolean;
  password_min_length: number;
  password_require_uppercase: boolean;
  password_require_lowercase: boolean;
  password_require_numbers: boolean;
  password_require_symbols: boolean;
  session_timeout_minutes: number;
  max_login_attempts: number;
  lockout_duration_minutes: number;
  require_mfa: boolean;
  ip_whitelist: string[];
}

interface Usage {
  limits: Record<string, number>;
  usage: {
    devices: { current: number; max: number };
    users: { current: number; max: number };
    api_keys: { current: number; max: number };
    webhooks: { current: number; max: number };
    scheduled_tasks: { current: number; max: number };
  };
}

function pct(current: number, max: number): number {
  return max > 0 ? Math.min(100, Math.round((current / max) * 100)) : 0;
}

function UsageBar({ label, current, max, color }: { label: string; current: number; max: number; color: string }) {
  const percentage = pct(current, max);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px]">
        <span style={{ color: COLORS.muted }}>{label}</span>
        <span style={{ color: percentage > 80 ? COLORS.red : COLORS.text }}>{current} / {max}</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: COLORS.bg }}>
        <div className="h-full rounded-full" style={{ width: `${percentage}%`, background: percentage > 80 ? COLORS.red : color }} />
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { data: settingsData, mutate: mutateSettings } = useApi<{ settings: Settings }>("/api/settings");
  const { data: usage, mutate: mutateUsage } = useApi<Usage>("/api/settings/usage");
  const settings = settingsData?.settings ?? null;
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tab, setTab] = useState<"branding" | "integrations" | "limits" | "security">("branding");
  const [smtpTestEmail, setSmtpTestEmail] = useState("");
  const [smtpTestResult, setSmtpTestResult] = useState<string | null>(null);

  // Branding
  const [companyName, setCompanyName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#1BA898");
  const [secondaryColor, setSecondaryColor] = useState("#35D0C4");
  const [customCss, setCustomCss] = useState("");
  const [loginMessage, setLoginMessage] = useState("");

  // SMTP
  const [smtpEnabled, setSmtpEnabled] = useState(false);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpUsername, setSmtpUsername] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpFromEmail, setSmtpFromEmail] = useState("");
  const [smtpFromName, setSmtpFromName] = useState("");
  const [smtpUseTls, setSmtpUseTls] = useState(true);
  const [smtpUseSsl, setSmtpUseSsl] = useState(false);

  // Integrations
  const [slackEnabled, setSlackEnabled] = useState(false);
  const [slackWebhook, setSlackWebhook] = useState("");
  const [discordEnabled, setDiscordEnabled] = useState(false);
  const [discordWebhook, setDiscordWebhook] = useState("");
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [telegramBotToken, setTelegramBotToken] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");

  // Limits
  const [maxDevices, setMaxDevices] = useState(100);
  const [maxUsers, setMaxUsers] = useState(50);
  const [maxApiKeys, setMaxApiKeys] = useState(20);
  const [maxWebhooks, setMaxWebhooks] = useState(10);
  const [maxScheduledTasks, setMaxScheduledTasks] = useState(25);
  const [maxStorageMb, setMaxStorageMb] = useState(10240);
  const [maxRetentionDays, setMaxRetentionDays] = useState(90);

  // Features
  const [enableMonitoring, setEnableMonitoring] = useState(true);
  const [enableAlerts, setEnableAlerts] = useState(true);
  const [enableTickets, setEnableTickets] = useState(true);
  const [enableKb, setEnableKb] = useState(true);
  const [enableReports, setEnableReports] = useState(true);
  const [enableApiAccess, setEnableApiAccess] = useState(true);

  // Security
  const [passwordMinLength, setPasswordMinLength] = useState(12);
  const [passwordRequireUppercase, setPasswordRequireUppercase] = useState(true);
  const [passwordRequireLowercase, setPasswordRequireLowercase] = useState(true);
  const [passwordRequireNumbers, setPasswordRequireNumbers] = useState(true);
  const [passwordRequireSymbols, setPasswordRequireSymbols] = useState(true);
  const [sessionTimeout, setSessionTimeout] = useState(60);
  const [maxLoginAttempts, setMaxLoginAttempts] = useState(5);
  const [lockoutDuration, setLockoutDuration] = useState(30);
  const [requireMfa, setRequireMfa] = useState(false);
  const [ipWhitelist, setIpWhitelist] = useState("");

  useEffect(() => {
     
    if (settings) {
      setCompanyName(settings.company_name ?? "");
      setLogoUrl(settings.logo_url ?? "");
      setPrimaryColor(settings.primary_color ?? "#1BA898");
      setSecondaryColor(settings.secondary_color ?? "#35D0C4");
      setCustomCss(settings.custom_css ?? "");
      setLoginMessage(settings.login_message ?? "");
      setSmtpEnabled(settings.smtp_enabled ?? false);
      setSmtpHost(settings.smtp_host ?? "");
      setSmtpPort(settings.smtp_port ?? 587);
      setSmtpUsername(settings.smtp_username ?? "");
      setSmtpPassword("");
      setSmtpFromEmail(settings.smtp_from_email ?? "");
      setSmtpFromName(settings.smtp_from_name ?? "");
      setSmtpUseTls(settings.smtp_use_tls ?? true);
      setSmtpUseSsl(settings.smtp_use_ssl ?? false);
      setSlackEnabled(settings.slack_enabled ?? false);
      setSlackWebhook(settings.slack_webhook_url ?? "");
      setDiscordEnabled(settings.discord_enabled ?? false);
      setDiscordWebhook(settings.discord_webhook_url ?? "");
      setTelegramEnabled(settings.telegram_enabled ?? false);
      setTelegramBotToken("");
      setTelegramChatId(settings.telegram_chat_id ?? "");
      setMaxDevices(settings.max_devices ?? 100);
      setMaxUsers(settings.max_users ?? 50);
      setMaxApiKeys(settings.max_api_keys ?? 20);
      setMaxWebhooks(settings.max_webhooks ?? 10);
      setMaxScheduledTasks(settings.max_scheduled_tasks ?? 25);
      setMaxStorageMb(settings.max_storage_mb ?? 10240);
      setMaxRetentionDays(settings.max_retention_days ?? 90);
      setEnableMonitoring(settings.enable_monitoring ?? true);
      setEnableAlerts(settings.enable_alerts ?? true);
      setEnableTickets(settings.enable_tickets ?? true);
      setEnableKb(settings.enable_kb ?? true);
      setEnableReports(settings.enable_reports ?? true);
      setEnableApiAccess(settings.enable_api_access ?? true);
      setPasswordMinLength(settings.password_min_length ?? 12);
      setPasswordRequireUppercase(settings.password_require_uppercase ?? true);
      setPasswordRequireLowercase(settings.password_require_lowercase ?? true);
      setPasswordRequireNumbers(settings.password_require_numbers ?? true);
      setPasswordRequireSymbols(settings.password_require_symbols ?? true);
      setSessionTimeout(settings.session_timeout_minutes ?? 60);
      setMaxLoginAttempts(settings.max_login_attempts ?? 5);
      setLockoutDuration(settings.lockout_duration_minutes ?? 30);
      setRequireMfa(settings.require_mfa ?? false);
      setIpWhitelist(Array.isArray(settings.ip_whitelist) ? settings.ip_whitelist.join(", ") : "");
    }
  }, [settings]);

  async function handleSaveBranding() {
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          company_name: companyName, logo_url: logoUrl || null,
          primary_color: primaryColor, secondary_color: secondaryColor,
          custom_css: customCss || null, login_message: loginMessage || null,
        }),
      });
      if (res.ok) { setSuccess("Branding atualizado!"); mutateSettings(); }
    } catch { setError("Erro de conexão"); }
  }

  async function handleSaveSmtp() {
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        smtp_enabled: smtpEnabled, smtp_host: smtpHost || null, smtp_port: smtpPort,
        smtp_username: smtpUsername || null, smtp_from_email: smtpFromEmail || null,
        smtp_from_name: smtpFromName || null, smtp_use_tls: smtpUseTls, smtp_use_ssl: smtpUseSsl,
      };
      if (smtpPassword) { payload.smtp_password_encrypted = smtpPassword; }
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (res.ok) { setSuccess("SMTP atualizado!"); mutateSettings(); }
    } catch { setError("Erro de conexão"); }
  }

  async function handleTestSmtp() {
    setSmtpTestResult(null);
    setError(null);
    if (!smtpTestEmail) { setError("Informe um email para teste"); return; }
    try {
      const res = await fetch("/api/settings/test-smtp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          smtp_host: smtpHost, smtp_port: smtpPort,
          smtp_username: smtpUsername || undefined,
          smtp_from_email: smtpFromEmail, smtp_from_name: smtpFromName || undefined,
          smtp_use_tls: smtpUseTls, smtp_use_ssl: smtpUseSsl,
          test_email: smtpTestEmail,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSmtpTestResult(`${data.message}${data.warnings?.length ? " | Avisos: " + data.warnings.join("; ") : ""}`);
      } else {
        setError(data.error?.message ?? "Erro no teste SMTP");
      }
    } catch { setError("Erro de conexão"); }
  }

  async function handleSaveIntegrations() {
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        slack_enabled: slackEnabled, slack_webhook_url: slackWebhook || null,
        discord_enabled: discordEnabled, discord_webhook_url: discordWebhook || null,
        telegram_enabled: telegramEnabled, telegram_chat_id: telegramChatId || null,
      };
      if (telegramBotToken) { payload.telegram_bot_token = telegramBotToken; }
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (res.ok) { setSuccess("Integrações atualizadas!"); mutateSettings(); }
    } catch { setError("Erro de conexão"); }
  }

  async function handleSaveLimits() {
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          max_devices: maxDevices, max_users: maxUsers, max_api_keys: maxApiKeys,
          max_webhooks: maxWebhooks, max_scheduled_tasks: maxScheduledTasks,
          max_storage_mb: maxStorageMb, max_retention_days: maxRetentionDays,
          enable_monitoring: enableMonitoring, enable_alerts: enableAlerts,
          enable_tickets: enableTickets, enable_kb: enableKb,
          enable_reports: enableReports, enable_api_access: enableApiAccess,
        }),
      });
      if (res.ok) { setSuccess("Limites atualizados!"); mutateSettings(); mutateUsage(); }
    } catch { setError("Erro de conexão"); }
  }

  async function handleSaveSecurity() {
    setError(null);
    try {
      const ipArr = ipWhitelist.split(",").map((s) => s.trim()).filter(Boolean);
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          password_min_length: passwordMinLength,
          password_require_uppercase: passwordRequireUppercase,
          password_require_lowercase: passwordRequireLowercase,
          password_require_numbers: passwordRequireNumbers,
          password_require_symbols: passwordRequireSymbols,
          session_timeout_minutes: sessionTimeout,
          max_login_attempts: maxLoginAttempts,
          lockout_duration_minutes: lockoutDuration,
          require_mfa: requireMfa,
          ip_whitelist: ipArr,
        }),
      });
      if (res.ok) { setSuccess("Segurança atualizada!"); mutateSettings(); }
    } catch { setError("Erro de conexão"); }
  }

  const TABS = [
    { key: "branding", label: "Branding" },
    { key: "integrations", label: "Integrações & SMTP" },
    { key: "limits", label: "Limites & Features" },
    { key: "security", label: "Segurança" },
  ] as const;

  if (!settingsData && !usage) return <LoadingState label="Carregando configuracoes..." />;

  return (
    <div className="min-h-screen p-6 space-y-6" style={{ background: COLORS.bg, fontFamily: "'JetBrains Mono','Consolas',monospace", color: COLORS.text }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold" style={{ color: COLORS.teal }}>Settings do Tenant</h1>
          <p className="text-[12px]" style={{ color: COLORS.muted }}>Branding · Integrações · SMTP · Limites · Segurança</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { mutateSettings(); mutateUsage(); }} className="text-[12px] px-3 py-1.5 rounded border" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.muted, cursor: "pointer" }}><RefreshCw size={12} className="inline" /> Atualizar</button>
          <a href="/dashboard" className="text-[12px] px-3 py-1.5 rounded border" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.muted }}><ArrowLeft size={12} className="inline" /> Dashboard</a>
        </div>
      </div>

      {error && <div className="rounded-md p-3 text-sm" style={{ background: `var(--status-error-bg)`, border: `1px solid var(--status-error-border)`, color: COLORS.red }}>{error}</div>}
      {success && <div className="rounded-md p-3 text-sm" style={{ background: `var(--status-ok-bg)`, border: `1px solid var(--status-ok-border)`, color: COLORS.green }}>{success}</div>}

      {/* Usage Overview */}
      {usage && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 p-4 rounded-xl" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
          <UsageBar label="Devices" current={usage.usage.devices.current} max={usage.usage.devices.max} color={COLORS.teal} />
          <UsageBar label="Users" current={usage.usage.users.current} max={usage.usage.users.max} color={COLORS.blue} />
          <UsageBar label="API Keys" current={usage.usage.api_keys.current} max={usage.usage.api_keys.max} color={COLORS.purple} />
          <UsageBar label="Webhooks" current={usage.usage.webhooks.current} max={usage.usage.webhooks.max} color={COLORS.amber} />
          <UsageBar label="Tasks" current={usage.usage.scheduled_tasks.current} max={usage.usage.scheduled_tasks.max} color={COLORS.green} />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className="px-4 py-2 rounded-t-md text-[12px] font-bold transition-colors"
            style={{ background: tab === t.key ? COLORS.card : "transparent", border: `1px solid ${COLORS.border}`, borderBottom: tab === t.key ? "none" : `1px solid ${COLORS.border}`, color: tab === t.key ? COLORS.teal : COLORS.muted, cursor: "pointer" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Branding */}
      {tab === "branding" && (
        <div className="space-y-4 rounded-xl p-6" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderTop: "none" }}>
          <h3 className="text-[12px] font-bold mb-3" style={{ color: COLORS.muted }}>BRANDING</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label htmlFor="br-cn" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Nome da Empresa</label>
              <input id="br-cn" type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="JL Informática" className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
            </div>
            <div className="space-y-1">
              <label htmlFor="br-lu" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Logo URL</label>
              <input id="br-lu" type="text" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://..." className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label htmlFor="br-pc" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Cor Primária</label>
              <div className="flex items-center gap-2">
                <input id="br-pc" type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="rounded h-10 w-12" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}` }} />
                <input type="text" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="rounded-md px-3 py-2 text-[12px] flex-1" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
              </div>
              <div className="flex gap-1 mt-1">
                {COLOR_PRESETS.map((c) => <button key={c} onClick={() => setPrimaryColor(c)} className="rounded-full" style={{ width: 18, height: 18, background: c, border: primaryColor === c ? `2px solid ${COLORS.text}` : "none", cursor: "pointer" }} />)}
              </div>
            </div>
            <div className="space-y-1">
              <label htmlFor="br-sc" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Cor Secundária</label>
              <div className="flex items-center gap-2">
                <input id="br-sc" type="color" value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} className="rounded h-10 w-12" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}` }} />
                <input type="text" value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} className="rounded-md px-3 py-2 text-[12px] flex-1" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
              </div>
              <div className="flex gap-1 mt-1">
                {COLOR_PRESETS.map((c) => <button key={c} onClick={() => setSecondaryColor(c)} className="rounded-full" style={{ width: 18, height: 18, background: c, border: secondaryColor === c ? `2px solid ${COLORS.text}` : "none", cursor: "pointer" }} />)}
              </div>
            </div>
          </div>
          <div className="space-y-1">
            <label htmlFor="br-lm" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Mensagem de Login</label>
            <input id="br-lm" type="text" value={loginMessage} onChange={(e) => setLoginMessage(e.target.value)} placeholder="Bem-vindo ao portal" className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
          </div>
          <div className="space-y-1">
            <label htmlFor="br-css" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>CSS Customizado</label>
            <textarea id="br-css" value={customCss} onChange={(e) => setCustomCss(e.target.value)} rows={4} placeholder="/* CSS customizado */" className="w-full rounded-md px-3 py-2 text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
          </div>
          <button onClick={handleSaveBranding} className="px-4 py-2 rounded-md text-[12px] font-bold" style={{ background: COLORS.teal, color: COLORS.bg, cursor: "pointer" }}>Salvar Branding</button>
        </div>
      )}

      {/* Tab: Integrations */}
      {tab === "integrations" && (
        <div className="space-y-6 rounded-xl p-6" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderTop: "none" }}>
          {/* SMTP */}
          <div>
            <h3 className="text-[12px] font-bold mb-3" style={{ color: COLORS.muted }}>SMTP</h3>
            <label className="flex items-center gap-3 text-[13px] mb-3" style={{ color: COLORS.text }}>
              <input type="checkbox" checked={smtpEnabled} onChange={(e) => setSmtpEnabled(e.target.checked)} style={{ accentColor: COLORS.teal }} /> Habilitar SMTP
            </label>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label htmlFor="sm-h" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Host</label>
                <input id="sm-h" type="text" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.gmail.com" className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
              </div>
              <div className="space-y-1">
                <label htmlFor="sm-p" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Porta</label>
                <input id="sm-p" type="number" value={smtpPort} onChange={(e) => setSmtpPort(parseInt(e.target.value, 10))} className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
              </div>
              <div className="space-y-1">
                <label htmlFor="sm-u" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Usuário</label>
                <input id="sm-u" type="text" value={smtpUsername} onChange={(e) => setSmtpUsername(e.target.value)} className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
              </div>
              <div className="space-y-1">
                <label htmlFor="sm-pw" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Senha {settings?.smtp_password_encrypted === "***" ? "(definida)" : ""}</label>
                <input id="sm-pw" type="password" value={smtpPassword} onChange={(e) => setSmtpPassword(e.target.value)} placeholder="••••••" className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
              </div>
              <div className="space-y-1">
                <label htmlFor="sm-fe" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>From Email</label>
                <input id="sm-fe" type="email" value={smtpFromEmail} onChange={(e) => setSmtpFromEmail(e.target.value)} placeholder="noreply@empresa.com" className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
              </div>
              <div className="space-y-1">
                <label htmlFor="sm-fn" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>From Name</label>
                <input id="sm-fn" type="text" value={smtpFromName} onChange={(e) => setSmtpFromName(e.target.value)} placeholder="JLMirror" className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
              </div>
            </div>
            <div className="flex gap-4 mt-3">
              <label className="flex items-center gap-2 text-[12px]" style={{ color: COLORS.text }}>
                <input type="checkbox" checked={smtpUseTls} onChange={(e) => setSmtpUseTls(e.target.checked)} style={{ accentColor: COLORS.teal }} /> TLS
              </label>
              <label className="flex items-center gap-2 text-[12px]" style={{ color: COLORS.text }}>
                <input type="checkbox" checked={smtpUseSsl} onChange={(e) => setSmtpUseSsl(e.target.checked)} style={{ accentColor: COLORS.teal }} /> SSL
              </label>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={handleSaveSmtp} className="px-4 py-2 rounded-md text-[12px] font-bold" style={{ background: COLORS.teal, color: COLORS.bg, cursor: "pointer" }}>Salvar SMTP</button>
              <div className="flex items-center gap-2">
                <input type="email" value={smtpTestEmail} onChange={(e) => setSmtpTestEmail(e.target.value)} placeholder="email@teste.com" className="rounded-md px-3 py-2 text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
                <button onClick={handleTestSmtp} className="px-3 py-2 rounded-md text-[12px] font-bold" style={{ background: `color-mix(in srgb, var(--status-info-text) 12%, transparent)`, border: `1px solid var(--status-info-border)`, color: COLORS.blue, cursor: "pointer" }}>Testar</button>
              </div>
            </div>
            {smtpTestResult && <div className="mt-2 p-2 rounded text-[12px]" style={{ background: `var(--status-info-bg)`, border: `1px solid var(--status-info-border)`, color: COLORS.blue }}>{smtpTestResult}</div>}
          </div>

          {/* Slack */}
          <div>
            <h3 className="text-[12px] font-bold mb-3" style={{ color: COLORS.muted }}>SLACK</h3>
            <label className="flex items-center gap-3 text-[13px] mb-3" style={{ color: COLORS.text }}>
              <input type="checkbox" checked={slackEnabled} onChange={(e) => setSlackEnabled(e.target.checked)} style={{ accentColor: COLORS.teal }} /> Habilitar Slack
            </label>
            <div className="space-y-1">
              <label htmlFor="sl-w" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Webhook URL</label>
              <input id="sl-w" type="text" value={slackWebhook} onChange={(e) => setSlackWebhook(e.target.value)} placeholder="https://hooks.slack.com/services/..." className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
            </div>
          </div>

          {/* Discord */}
          <div>
            <h3 className="text-[12px] font-bold mb-3" style={{ color: COLORS.muted }}>DISCORD</h3>
            <label className="flex items-center gap-3 text-[13px] mb-3" style={{ color: COLORS.text }}>
              <input type="checkbox" checked={discordEnabled} onChange={(e) => setDiscordEnabled(e.target.checked)} style={{ accentColor: COLORS.teal }} /> Habilitar Discord
            </label>
            <div className="space-y-1">
              <label htmlFor="dc-w" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Webhook URL</label>
              <input id="dc-w" type="text" value={discordWebhook} onChange={(e) => setDiscordWebhook(e.target.value)} placeholder="https://discord.com/api/webhooks/..." className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
            </div>
          </div>

          {/* Telegram */}
          <div>
            <h3 className="text-[12px] font-bold mb-3" style={{ color: COLORS.muted }}>TELEGRAM</h3>
            <label className="flex items-center gap-3 text-[13px] mb-3" style={{ color: COLORS.text }}>
              <input type="checkbox" checked={telegramEnabled} onChange={(e) => setTelegramEnabled(e.target.checked)} style={{ accentColor: COLORS.teal }} /> Habilitar Telegram
            </label>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label htmlFor="tg-t" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Bot Token {settings?.telegram_bot_token === "***" ? "(definido)" : ""}</label>
                <input id="tg-t" type="password" value={telegramBotToken} onChange={(e) => setTelegramBotToken(e.target.value)} placeholder="••••••" className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
              </div>
              <div className="space-y-1">
                <label htmlFor="tg-c" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Chat ID</label>
                <input id="tg-c" type="text" value={telegramChatId} onChange={(e) => setTelegramChatId(e.target.value)} placeholder="-1001234567890" className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
              </div>
            </div>
          </div>

          <button onClick={handleSaveIntegrations} className="px-4 py-2 rounded-md text-[12px] font-bold" style={{ background: COLORS.teal, color: COLORS.bg, cursor: "pointer" }}>Salvar Integrações</button>
        </div>
      )}

      {/* Tab: Limits */}
      {tab === "limits" && (
        <div className="space-y-6 rounded-xl p-6" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderTop: "none" }}>
          <div>
            <h3 className="text-[12px] font-bold mb-3" style={{ color: COLORS.muted }}>LIMITES DE RECURSOS</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Max Devices", val: maxDevices, set: setMaxDevices },
                { label: "Max Users", val: maxUsers, set: setMaxUsers },
                { label: "Max API Keys", val: maxApiKeys, set: setMaxApiKeys },
                { label: "Max Webhooks", val: maxWebhooks, set: setMaxWebhooks },
                { label: "Max Scheduled Tasks", val: maxScheduledTasks, set: setMaxScheduledTasks },
                { label: "Max Storage (MB)", val: maxStorageMb, set: setMaxStorageMb },
                { label: "Max Retention (days)", val: maxRetentionDays, set: setMaxRetentionDays },
              ].map((f) => (
                <div key={f.label} className="space-y-1">
                  <label className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>{f.label}</label>
                  <input type="number" value={f.val} onChange={(e) => f.set(parseInt(e.target.value, 10))} className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-[12px] font-bold mb-3" style={{ color: COLORS.muted }}>FEATURES</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: "Monitoring", val: enableMonitoring, set: setEnableMonitoring },
                { label: "Alerts", val: enableAlerts, set: setEnableAlerts },
                { label: "Tickets", val: enableTickets, set: setEnableTickets },
                { label: "Knowledge Base", val: enableKb, set: setEnableKb },
                { label: "Reports", val: enableReports, set: setEnableReports },
                { label: "API Access", val: enableApiAccess, set: setEnableApiAccess },
              ].map((f) => (
                <label key={f.label} className="flex items-center gap-3 text-[13px]" style={{ color: COLORS.text }}>
                  <input type="checkbox" checked={f.val} onChange={(e) => f.set(e.target.checked)} style={{ accentColor: COLORS.teal }} /> {f.label}
                </label>
              ))}
            </div>
          </div>

          <button onClick={handleSaveLimits} className="px-4 py-2 rounded-md text-[12px] font-bold" style={{ background: COLORS.teal, color: COLORS.bg, cursor: "pointer" }}>Salvar Limites</button>
        </div>
      )}

      {/* Tab: Security */}
      {tab === "security" && (
        <div className="space-y-6 rounded-xl p-6" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderTop: "none" }}>
          <div>
            <h3 className="text-[12px] font-bold mb-3" style={{ color: COLORS.muted }}>POLÍTICA DE SENHAS</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="space-y-1">
                <label htmlFor="se-ml" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Tamanho Mínimo</label>
                <input id="se-ml" type="number" value={passwordMinLength} onChange={(e) => setPasswordMinLength(parseInt(e.target.value, 10))} min={8} max={128} className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
              </div>
              <div className="space-y-1">
                <label htmlFor="se-st" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Session Timeout (min)</label>
                <input id="se-st" type="number" value={sessionTimeout} onChange={(e) => setSessionTimeout(parseInt(e.target.value, 10))} className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
              </div>
              <div className="space-y-1">
                <label htmlFor="se-la" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Max Login Attempts</label>
                <input id="se-la" type="number" value={maxLoginAttempts} onChange={(e) => setMaxLoginAttempts(parseInt(e.target.value, 10))} className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
              </div>
              <div className="space-y-1">
                <label htmlFor="se-ld" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Lockout (min)</label>
                <input id="se-ld" type="number" value={lockoutDuration} onChange={(e) => setLockoutDuration(parseInt(e.target.value, 10))} className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
              <label className="flex items-center gap-2 text-[12px]" style={{ color: COLORS.text }}>
                <input type="checkbox" checked={passwordRequireUppercase} onChange={(e) => setPasswordRequireUppercase(e.target.checked)} style={{ accentColor: COLORS.teal }} /> A-Z
              </label>
              <label className="flex items-center gap-2 text-[12px]" style={{ color: COLORS.text }}>
                <input type="checkbox" checked={passwordRequireLowercase} onChange={(e) => setPasswordRequireLowercase(e.target.checked)} style={{ accentColor: COLORS.teal }} /> a-z
              </label>
              <label className="flex items-center gap-2 text-[12px]" style={{ color: COLORS.text }}>
                <input type="checkbox" checked={passwordRequireNumbers} onChange={(e) => setPasswordRequireNumbers(e.target.checked)} style={{ accentColor: COLORS.teal }} /> 0-9
              </label>
              <label className="flex items-center gap-2 text-[12px]" style={{ color: COLORS.text }}>
                <input type="checkbox" checked={passwordRequireSymbols} onChange={(e) => setPasswordRequireSymbols(e.target.checked)} style={{ accentColor: COLORS.teal }} /> !@#
              </label>
            </div>
          </div>

          <div>
            <h3 className="text-[12px] font-bold mb-3" style={{ color: COLORS.muted }}>MFA & IP WHITELIST</h3>
            <label className="flex items-center gap-3 text-[13px] mb-3" style={{ color: COLORS.text }}>
              <input type="checkbox" checked={requireMfa} onChange={(e) => setRequireMfa(e.target.checked)} style={{ accentColor: COLORS.teal }} /> Exigir MFA para todos os usuários
            </label>
            <div className="space-y-1">
              <label htmlFor="se-ip" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>IP Whitelist (vírgula, vazio = todos)</label>
              <input id="se-ip" type="text" value={ipWhitelist} onChange={(e) => setIpWhitelist(e.target.value)} placeholder="192.168.1.0/24, 10.0.0.5" className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
            </div>
          </div>

          <button onClick={handleSaveSecurity} className="px-4 py-2 rounded-md text-[12px] font-bold" style={{ background: COLORS.teal, color: COLORS.bg, cursor: "pointer" }}>Salvar Segurança</button>
        </div>
      )}
    </div>
  );
}
