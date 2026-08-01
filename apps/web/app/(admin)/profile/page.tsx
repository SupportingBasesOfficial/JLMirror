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

const AVATAR_COLORS = ["#1BA898", "#3E8BF0", "#8B5CF6", "#F5A623", "#E5484D", "#30A46C", "#EC4899", "#14B8A6"];
const TIMEZONES = ["America/Sao_Paulo", "America/New_York", "America/Chicago", "Europe/London", "Europe/Paris", "Asia/Tokyo", "UTC"];
const THEMES = ["dark", "light", "auto"];
const DENSITIES = ["compact", "comfortable", "spacious"];
const DIGEST_FREQS = ["instant", "hourly", "daily", "weekly", "never"];

interface Profile {
  id: string;
  user_id: string;
  display_name: string | null;
  bio: string | null;
  phone: string | null;
  location: string | null;
  timezone: string;
  locale: string;
  avatar_url: string | null;
  avatar_initials: string | null;
  avatar_color: string;
  job_title: string | null;
  department: string | null;
  skills: string[];
  social_links: Record<string, string>;
  notification_email: boolean;
  notification_push: boolean;
  notification_sms: boolean;
  notification_digest_frequency: string;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  theme: string;
  density: string;
  sidebar_collapsed: boolean;
  email: string | null;
  name: string | null;
  role: string | null;
}

interface Session {
  id: string;
  device_type: string;
  device_name: string | null;
  ip_address: string | null;
  location: string | null;
  is_active: boolean;
  last_activity: string;
  expires_at: string | null;
  created_at: string;
}

interface SecurityEvent {
  id: string;
  event_type: string;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

const EVENT_COLORS: Record<string, string> = {
  login: COLORS.green, logout: COLORS.muted, password_change: COLORS.amber,
  mfa_enable: COLORS.green, mfa_disable: COLORS.red, session_revoked: COLORS.red,
  password_reset_request: COLORS.amber, password_reset_complete: COLORS.green,
  profile_update: COLORS.blue, avatar_change: COLORS.purple, preferences_update: COLORS.blue,
};

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function ProfilePage() {
  const { data: pData, mutate: mutateProfile } = useApi<{ profile: Profile }>("/api/profile");
  const { data: sData, mutate: mutateSessions } = useApi<{ sessions: Session[] }>("/api/profile/sessions");
  const { data: secData, mutate: mutateSecurityLog } = useApi<{ events: SecurityEvent[] }>("/api/profile/security?limit=20");
  const profile = pData?.profile ?? null;
  const sessions = sData?.sessions ?? [];
  const securityLog = secData?.events ?? [];
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tab, setTab] = useState<"profile" | "preferences" | "security">("profile");

  // Edit form
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [phone, setPhone] = useState("");
  const [locationVal, setLocationVal] = useState("");
  const [timezone, setTimezone] = useState("America/Sao_Paulo");
  const [jobTitle, setJobTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [skills, setSkills] = useState("");
  const [avatarInitials, setAvatarInitials] = useState("");
  const [avatarColor, setAvatarColor] = useState(COLORS.teal);

  // Preferences form
  const [notifEmail, setNotifEmail] = useState(true);
  const [notifPush, setNotifPush] = useState(true);
  const [notifSms, setNotifSms] = useState(false);
  const [digestFreq, setDigestFreq] = useState("daily");
  const [quietStart, setQuietStart] = useState("");
  const [quietEnd, setQuietEnd] = useState("");
  const [theme, setTheme] = useState("dark");
  const [density, setDensity] = useState("comfortable");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
     
    if (profile) {
      setDisplayName(profile.display_name ?? "");
      setBio(profile.bio ?? "");
      setPhone(profile.phone ?? "");
      setLocationVal(profile.location ?? "");
      setTimezone(profile.timezone ?? "America/Sao_Paulo");
      setJobTitle(profile.job_title ?? "");
      setDepartment(profile.department ?? "");
      setSkills(Array.isArray(profile.skills) ? profile.skills.join(", ") : "");
      setAvatarInitials(profile.avatar_initials ?? "");
      setAvatarColor(profile.avatar_color ?? COLORS.teal);
      setNotifEmail(profile.notification_email ?? true);
      setNotifPush(profile.notification_push ?? true);
      setNotifSms(profile.notification_sms ?? false);
      setDigestFreq(profile.notification_digest_frequency ?? "daily");
      setQuietStart(profile.quiet_hours_start ?? "");
      setQuietEnd(profile.quiet_hours_end ?? "");
      setTheme(profile.theme ?? "dark");
      setDensity(profile.density ?? "comfortable");
      setSidebarCollapsed(profile.sidebar_collapsed ?? false);
    }
  }, [profile]);

  async function handleSaveProfile() {
    setError(null);
    try {
      const skillsArr = skills.split(",").map((s) => s.trim()).filter(Boolean);
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          display_name: displayName, bio: bio || undefined, phone: phone || undefined,
          location: locationVal || undefined, timezone, job_title: jobTitle || undefined,
          department: department || undefined, skills: skillsArr,
        }),
      });
      if (res.ok) {
        setSuccess("Perfil atualizado!");
        mutateProfile();
      }
    } catch { setError("Erro de conexão"); }
  }

  async function handleSaveAvatar() {
    setError(null);
    try {
      const res = await fetch("/api/profile/avatar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ avatar_initials: avatarInitials, avatar_color: avatarColor }),
      });
      if (res.ok) {
        setSuccess("Avatar atualizado!");
        mutateProfile();
      }
    } catch { setError("Erro de conexão"); }
  }

  async function handleSavePreferences() {
    setError(null);
    try {
      const res = await fetch("/api/profile/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          notification_email: notifEmail, notification_push: notifPush,
          notification_sms: notifSms, notification_digest_frequency: digestFreq,
          quiet_hours_start: quietStart || null, quiet_hours_end: quietEnd || null,
          theme, density, sidebar_collapsed: sidebarCollapsed,
        }),
      });
      if (res.ok) {
        setSuccess("Preferências atualizadas!");
        mutateProfile();
      }
    } catch { setError("Erro de conexão"); }
  }

  async function handleRevokeSession(id: string) {
    try {
      const res = await fetch(`/api/profile/sessions/${id}`, { method: "DELETE", credentials: "include" });
      if (res.ok) { mutateSessions(); mutateSecurityLog(); }
    } catch { /* Ignora */ }
  }

  async function handleRevokeAllSessions() {
    try {
      const res = await fetch("/api/profile/sessions", { method: "DELETE", credentials: "include" });
      if (res.ok) { setSuccess("Todas as sessões revogadas"); mutateSessions(); mutateSecurityLog(); }
    } catch { /* Ignora */ }
  }

  if (!pData && !sData && !secData) return <LoadingState label="Carregando perfil..." />;

  return (
    <div
      className="min-h-screen p-6 space-y-6"
      style={{ background: COLORS.bg, fontFamily: "'JetBrains Mono','Consolas',monospace", color: COLORS.text }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold" style={{ color: COLORS.teal }}>
            Perfil & Preferências
          </h1>
          <p className="text-[12px]" style={{ color: COLORS.muted }}>
            Avatar · Dados Pessoais · Notificações · Segurança · Sessões
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { mutateProfile(); mutateSessions(); mutateSecurityLog(); }} className="text-[12px] px-3 py-1.5 rounded border" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.muted, cursor: "pointer" }}>
            <RefreshCw size={12} className="inline" /> Atualizar
          </button>
          <a href="/dashboard" className="text-[12px] px-3 py-1.5 rounded border" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.muted }}>
            <ArrowLeft size={12} className="inline" /> Dashboard
          </a>
        </div>
      </div>

      {error && (
        <div className="rounded-md p-3 text-sm" style={{ background: `var(--status-error-bg)`, border: `1px solid var(--status-error-border)`, color: COLORS.red }}>{error}</div>
      )}
      {success && (
        <div className="rounded-md p-3 text-sm" style={{ background: `var(--status-ok-bg)`, border: `1px solid var(--status-ok-border)`, color: COLORS.green }}>{success}</div>
      )}

      {/* Avatar + Info */}
      {profile && (
        <div className="flex items-center gap-4 p-4 rounded-xl" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
          <div
            className="flex items-center justify-center rounded-full text-lg font-bold"
            style={{ width: 64, height: 64, background: avatarColor, color: "var(--surface-0)" }}
          >
            {avatarInitials || "U"}
          </div>
          <div>
            <div className="text-sm font-bold" style={{ color: COLORS.teal }}>{profile.name ?? profile.display_name ?? "User"}</div>
            <div className="text-[12px]" style={{ color: COLORS.muted }}>{profile.email}</div>
            <div className="text-[10px]" style={{ color: COLORS.muted }}>{profile.role} · {profile.department ?? "—"}</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1">
        {([
          { key: "profile", label: "Perfil" },
          { key: "preferences", label: "Preferências" },
          { key: "security", label: "Segurança & Sessões" },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-4 py-2 rounded-t-md text-[12px] font-bold transition-colors"
            style={{
              background: tab === t.key ? COLORS.card : "transparent",
              border: `1px solid ${COLORS.border}`,
              borderBottom: tab === t.key ? "none" : `1px solid ${COLORS.border}`,
              color: tab === t.key ? COLORS.teal : COLORS.muted,
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Profile */}
      {tab === "profile" && (
        <div className="space-y-4 rounded-xl p-6" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderTop: "none" }}>
          {/* Avatar */}
          <div>
            <h3 className="text-[12px] font-bold mb-3" style={{ color: COLORS.muted }}>AVATAR</h3>
            <div className="flex items-center gap-4">
              <div
                className="flex items-center justify-center rounded-full text-xl font-bold"
                style={{ width: 80, height: 80, background: avatarColor, color: "var(--surface-0)" }}
              >
                {avatarInitials || "U"}
              </div>
              <div className="space-y-2">
                <div>
                  <label htmlFor="av-i" className="text-[10px] font-bold uppercase mr-2" style={{ color: COLORS.muted }}>Iniciais</label>
                  <input id="av-i" type="text" maxLength={3} value={avatarInitials} onChange={(e) => setAvatarInitials(e.target.value.toUpperCase())} placeholder="JD" className="rounded-md px-3 py-2 text-[13px] w-20" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
                </div>
                <div className="flex gap-2">
                  {AVATAR_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setAvatarColor(color)}
                      className="rounded-full"
                      style={{ width: 24, height: 24, background: color, border: avatarColor === color ? `2px solid ${COLORS.text}` : "none", cursor: "pointer" }}
                    />
                  ))}
                </div>
                <button onClick={handleSaveAvatar} className="px-3 py-1.5 rounded text-[11px] font-bold" style={{ background: COLORS.teal, color: COLORS.bg, cursor: "pointer" }}>Salvar Avatar</button>
              </div>
            </div>
          </div>

          {/* Dados pessoais */}
          <div>
            <h3 className="text-[12px] font-bold mb-3" style={{ color: COLORS.muted }}>DADOS PESSOAIS</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label htmlFor="pf-dn" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Nome de Exibição</label>
                <input id="pf-dn" type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
              </div>
              <div className="space-y-1">
                <label htmlFor="pf-jt" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Cargo</label>
                <input id="pf-jt" type="text" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="DevOps Engineer" className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
              </div>
              <div className="space-y-1">
                <label htmlFor="pf-de" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Departamento</label>
                <input id="pf-de" type="text" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="IT" className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
              </div>
              <div className="space-y-1">
                <label htmlFor="pf-ph" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Telefone</label>
                <input id="pf-ph" type="text" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+55 11 99999-9999" className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
              </div>
              <div className="space-y-1">
                <label htmlFor="pf-lo" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Localização</label>
                <input id="pf-lo" type="text" value={locationVal} onChange={(e) => setLocationVal(e.target.value)} placeholder="São Paulo, BR" className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
              </div>
              <div className="space-y-1">
                <label htmlFor="pf-tz" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Timezone</label>
                <select id="pf-tz" value={timezone} onChange={(e) => setTimezone(e.target.value)} className="w-full rounded-md px-3 py-2 text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}>
                  {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1 mt-4">
              <label htmlFor="pf-bio" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Bio</label>
              <textarea id="pf-bio" value={bio} onChange={(e) => setBio(e.target.value)} rows={3} placeholder="Breve descrição sobre você" className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
            </div>
            <div className="space-y-1 mt-4">
              <label htmlFor="pf-sk" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Skills (vírgula)</label>
              <input id="pf-sk" type="text" value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="Docker, Kubernetes, PostgreSQL" className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
            </div>
            <button onClick={handleSaveProfile} className="mt-4 px-4 py-2 rounded-md text-[12px] font-bold" style={{ background: COLORS.teal, color: COLORS.bg, cursor: "pointer" }}>
              Salvar Perfil
            </button>
          </div>
        </div>
      )}

      {/* Tab: Preferences */}
      {tab === "preferences" && (
        <div className="space-y-6 rounded-xl p-6" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderTop: "none" }}>
          {/* Notificacoes */}
          <div>
            <h3 className="text-[12px] font-bold mb-3" style={{ color: COLORS.muted }}>NOTIFICAÇÕES</h3>
            <div className="space-y-3">
              <label className="flex items-center gap-3 text-[13px]" style={{ color: COLORS.text }}>
                <input type="checkbox" checked={notifEmail} onChange={(e) => setNotifEmail(e.target.checked)} style={{ accentColor: COLORS.teal }} />
                Email
              </label>
              <label className="flex items-center gap-3 text-[13px]" style={{ color: COLORS.text }}>
                <input type="checkbox" checked={notifPush} onChange={(e) => setNotifPush(e.target.checked)} style={{ accentColor: COLORS.teal }} />
                Push
              </label>
              <label className="flex items-center gap-3 text-[13px]" style={{ color: COLORS.text }}>
                <input type="checkbox" checked={notifSms} onChange={(e) => setNotifSms(e.target.checked)} style={{ accentColor: COLORS.teal }} />
                SMS
              </label>
              <div className="space-y-1">
                <label htmlFor="pr-df" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Frequência do Digest</label>
                <select id="pr-df" value={digestFreq} onChange={(e) => setDigestFreq(e.target.value)} className="w-full rounded-md px-3 py-2 text-[12px] max-w-[200px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}>
                  {DIGEST_FREQS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4 max-w-[300px]">
                <div className="space-y-1">
                  <label htmlFor="pr-qs" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Quiet Hours Start</label>
                  <input id="pr-qs" type="time" value={quietStart} onChange={(e) => setQuietStart(e.target.value)} className="w-full rounded-md px-3 py-2 text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
                </div>
                <div className="space-y-1">
                  <label htmlFor="pr-qe" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Quiet Hours End</label>
                  <input id="pr-qe" type="time" value={quietEnd} onChange={(e) => setQuietEnd(e.target.value)} className="w-full rounded-md px-3 py-2 text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
                </div>
              </div>
            </div>
          </div>

          {/* Aparencia */}
          <div>
            <h3 className="text-[12px] font-bold mb-3" style={{ color: COLORS.muted }}>APARÊNCIA</h3>
            <div className="grid grid-cols-2 gap-4 max-w-[400px]">
              <div className="space-y-1">
                <label htmlFor="pr-th" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Tema</label>
                <select id="pr-th" value={theme} onChange={(e) => setTheme(e.target.value)} className="w-full rounded-md px-3 py-2 text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}>
                  {THEMES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="pr-de" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Densidade</label>
                <select id="pr-de" value={density} onChange={(e) => setDensity(e.target.value)} className="w-full rounded-md px-3 py-2 text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}>
                  {DENSITIES.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>
            <label className="flex items-center gap-3 text-[13px] mt-3" style={{ color: COLORS.text }}>
              <input type="checkbox" checked={sidebarCollapsed} onChange={(e) => setSidebarCollapsed(e.target.checked)} style={{ accentColor: COLORS.teal }} />
              Sidebar recolhida por padrão
            </label>
          </div>

          <button onClick={handleSavePreferences} className="px-4 py-2 rounded-md text-[12px] font-bold" style={{ background: COLORS.teal, color: COLORS.bg, cursor: "pointer" }}>
            Salvar Preferências
          </button>
        </div>
      )}

      {/* Tab: Security */}
      {tab === "security" && (
        <div className="space-y-6 rounded-xl p-6" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderTop: "none" }}>
          {/* Sessions */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[12px] font-bold" style={{ color: COLORS.muted }}>SESSÕES ATIVAS</h3>
              {sessions.filter((s) => s.is_active).length > 1 && (
                <button onClick={handleRevokeAllSessions} className="px-3 py-1.5 rounded text-[11px] font-bold" style={{ background: `color-mix(in srgb, var(--status-error-text) 12%, transparent)`, border: `1px solid var(--status-error-border)`, color: COLORS.red, cursor: "pointer" }}>
                  Revogar Todas
                </button>
              )}
            </div>
            <div className="space-y-2">
              {sessions.length === 0 && <div className="text-[12px]" style={{ color: COLORS.muted }}>Nenhuma sessão registrada</div>}
              {sessions.map((s) => (
                <div key={s.id} className="flex items-center justify-between p-3 rounded-md" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
                  <div className="flex items-center gap-3">
                    <div className="text-[12px]">
                      <div style={{ color: COLORS.teal }}>{s.device_name ?? s.device_type}</div>
                      <div style={{ color: COLORS.muted }}>{s.ip_address ?? "—"} · {s.location ?? "—"}</div>
                      <div style={{ color: COLORS.muted }}>{formatTime(s.last_activity)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.is_active ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: `var(--status-ok-bg)`, color: COLORS.green }}>active</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: `color-mix(in srgb, var(--text-muted) 8%, transparent)`, color: COLORS.muted }}>revoked</span>
                    )}
                    {s.is_active && (
                      <button onClick={() => handleRevokeSession(s.id)} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: `color-mix(in srgb, var(--status-error-text) 12%, transparent)`, border: `1px solid var(--status-error-border)`, color: COLORS.red, cursor: "pointer" }}>Revogar</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Security Log */}
          <div>
            <h3 className="text-[12px] font-bold mb-3" style={{ color: COLORS.muted }}>HISTÓRICO DE SEGURANÇA</h3>
            <div className="space-y-1">
              {securityLog.length === 0 && <div className="text-[12px]" style={{ color: COLORS.muted }}>Nenhum evento registrado</div>}
              {securityLog.map((e) => (
                <div key={e.id} className="flex items-center justify-between p-2 rounded-md text-[12px]" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: `${EVENT_COLORS[e.event_type] ?? COLORS.muted}15`, color: EVENT_COLORS[e.event_type] ?? COLORS.muted }}>
                    {e.event_type}
                  </span>
                  <span style={{ color: COLORS.muted }}>{e.ip_address ?? "—"}</span>
                  <span style={{ color: COLORS.muted }}>{formatTime(e.created_at)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
