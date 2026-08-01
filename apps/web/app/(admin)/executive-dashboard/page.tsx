// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

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

interface Overview {
  availability: { total_devices: number; online: number; offline: number; warning: number; uptime_pct: number };
  tickets: { total: number; open: number; resolved: number; critical: number; resolution_rate: number };
  assets: { total: number; active: number };
  compliance: { total_controls: number; passed: number; failed: number; score: number };
  infrastructure: { capacity_alerts: number; ssl_expiring: number; ssl_expired: number; firewall_rules: number; backups_total: number; backups_successful: number; backup_success_rate: number };
  platform: { kb_articles: number; active_tasks: number; active_api_keys: number; active_webhooks: number; unread_notifications: number; critical_health_checks: number };
}

interface AlertItem {
  id: string;
  [key: string]: unknown;
}

interface Alerts {
  total_alerts: number;
  critical_tickets: AlertItem[];
  ssl_alerts: AlertItem[];
  capacity_risks: AlertItem[];
  failed_backups: AlertItem[];
  health_alerts: AlertItem[];
}

interface Summary {
  top_devices: Array<Record<string, unknown>>;
  recent_activity: Array<Record<string, unknown>>;
  recent_tickets: Array<Record<string, unknown>>;
  recent_backups: Array<Record<string, unknown>>;
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function KpiCard({ label, value, sub, color, icon }: { label: string; value: string | number; sub?: string; color: string; icon?: string }) {
  return (
    <div className="p-4 rounded-xl" style={{ background: COLORS.card, border: `1px solid ${color}33` }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase font-bold" style={{ color: COLORS.muted }}>{label}</span>
        {icon && <span className="text-[16px]" style={{ color }}>{icon}</span>}
      </div>
      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
      {sub && <div className="text-[10px] mt-1" style={{ color: COLORS.muted }}>{sub}</div>}
    </div>
  );
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pctVal = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-2 rounded-full overflow-hidden" style={{ background: COLORS.bg }}>
      <div className="h-full rounded-full transition-all" style={{ width: `${pctVal}%`, background: color }} />
    </div>
  );
}

function AlertRow({ title, subtitle, badge, badgeColor }: { title: string; subtitle: string; badge: string; badgeColor: string }) {
  return (
    <div className="flex items-center justify-between p-2 rounded-md text-[12px]" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
      <div>
        <div style={{ color: COLORS.text }}>{title}</div>
        <div style={{ color: COLORS.muted }}>{subtitle}</div>
      </div>
      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: `${badgeColor}15`, color: badgeColor }}>{badge}</span>
    </div>
  );
}

export default function ExecutiveDashboardPage() {
  const { data: overview, error: errOv, isLoading: loadingOv, mutate: mutOv } = useApi<Overview>("/api/dashboard/executive/overview");
  const { data: alerts, error: errAl, isLoading: loadingAl, mutate: mutAl } = useApi<Alerts>("/api/dashboard/executive/alerts");
  const { data: summary, error: errSu, isLoading: loadingSu, mutate: mutSu } = useApi<Summary>("/api/dashboard/executive/summary");

  const error = errOv ?? errAl ?? errSu ?? null;
  const loading = loadingOv && loadingAl && loadingSu;

  const uptimeColor = overview ? (overview.availability.uptime_pct >= 99 ? COLORS.green : overview.availability.uptime_pct >= 95 ? COLORS.amber : COLORS.red) : COLORS.muted;
  const complianceColor = overview ? (overview.compliance.score >= 80 ? COLORS.green : overview.compliance.score >= 60 ? COLORS.amber : COLORS.red) : COLORS.muted;
  const ticketColor = overview ? (overview.tickets.resolution_rate >= 80 ? COLORS.green : overview.tickets.resolution_rate >= 50 ? COLORS.amber : COLORS.red) : COLORS.muted;
  const backupColor = overview ? (overview.infrastructure.backup_success_rate >= 95 ? COLORS.green : overview.infrastructure.backup_success_rate >= 80 ? COLORS.amber : COLORS.red) : COLORS.muted;

  if (loading) return <LoadingState label="Carregando dashboard..." />;

  return (
    <div className="min-h-screen p-6 space-y-6" style={{ background: COLORS.bg, fontFamily: "'JetBrains Mono','Consolas',monospace", color: COLORS.text }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold" style={{ color: COLORS.teal }}>Dashboard Executivo</h1>
          <p className="text-[12px]" style={{ color: COLORS.muted }}>KPIs Agregados · Disponibilidade · Segurança · Compliance · Infraestrutura</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { mutOv(); mutAl(); mutSu(); }} className="text-[12px] px-3 py-1.5 rounded border" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.muted, cursor: "pointer" }}><RefreshCw size={12} className="inline" /> Atualizar</button>
          <a href="/dashboard" className="text-[12px] px-3 py-1.5 rounded border" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.muted }}><ArrowLeft size={12} className="inline" /> Dashboard</a>
        </div>
      </div>

      {error && <div className="rounded-md p-3 text-sm" style={{ background: `var(--status-error-bg)`, border: `1px solid var(--status-error-border)`, color: COLORS.red }}>{error}</div>}

      {/* KPI Cards */}
      {overview && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
          <KpiCard label="Uptime" value={`${overview.availability.uptime_pct}%`} sub={`${overview.availability.online}/${overview.availability.total_devices} online`} color={uptimeColor} icon="↑" />
          <KpiCard label="Tickets Resolvidos" value={`${overview.tickets.resolution_rate}%`} sub={`${overview.tickets.resolved}/${overview.tickets.total} total`} color={ticketColor} icon="✓" />
          <KpiCard label="Compliance" value={`${overview.compliance.score}%`} sub={`${overview.compliance.passed}/${overview.compliance.total_controls} controles`} color={complianceColor} icon="§" />
          <KpiCard label="Backup Success" value={`${overview.infrastructure.backup_success_rate}%`} sub={`${overview.infrastructure.backups_successful}/${overview.infrastructure.backups_total} backups`} color={backupColor} icon="💾" />
          <KpiCard label="Alertas" value={alerts?.total_alerts ?? 0} sub={`${overview.tickets.critical} críticos`} color={alerts && alerts.total_alerts > 0 ? COLORS.amber : COLORS.green} icon="⚠" />
          <KpiCard label="Assets Ativos" value={overview.assets.active} sub={`${overview.assets.total} total`} color={COLORS.blue} icon="▣" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Availability & Infrastructure */}
        <div className="space-y-6">
          {overview && (
            <div className="p-4 rounded-xl" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
              <h3 className="text-[12px] font-bold mb-3" style={{ color: COLORS.muted }}>DISPONIBILIDADE</h3>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span style={{ color: COLORS.green }}>Online</span>
                    <span style={{ color: COLORS.muted }}>{overview.availability.online} / {overview.availability.total_devices}</span>
                  </div>
                  <ProgressBar value={overview.availability.online} max={overview.availability.total_devices} color={COLORS.green} />
                </div>
                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span style={{ color: COLORS.amber }}>Warning</span>
                    <span style={{ color: COLORS.muted }}>{overview.availability.warning}</span>
                  </div>
                  <ProgressBar value={overview.availability.warning} max={overview.availability.total_devices} color={COLORS.amber} />
                </div>
                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span style={{ color: COLORS.red }}>Offline</span>
                    <span style={{ color: COLORS.muted }}>{overview.availability.offline}</span>
                  </div>
                  <ProgressBar value={overview.availability.offline} max={overview.availability.total_devices} color={COLORS.red} />
                </div>
              </div>
            </div>
          )}

          {overview && (
            <div className="p-4 rounded-xl" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
              <h3 className="text-[12px] font-bold mb-3" style={{ color: COLORS.muted }}>INFRAESTRUTURA</h3>
              <div className="grid grid-cols-2 gap-3 text-[12px]">
                <div className="p-2 rounded" style={{ background: COLORS.bg }}>
                  <div style={{ color: COLORS.muted }}>Capacity Alerts</div>
                  <div style={{ color: overview.infrastructure.capacity_alerts > 0 ? COLORS.amber : COLORS.green }}>{overview.infrastructure.capacity_alerts}</div>
                </div>
                <div className="p-2 rounded" style={{ background: COLORS.bg }}>
                  <div style={{ color: COLORS.muted }}>SSL Expiring</div>
                  <div style={{ color: overview.infrastructure.ssl_expiring > 0 ? COLORS.amber : COLORS.green }}>{overview.infrastructure.ssl_expiring}</div>
                </div>
                <div className="p-2 rounded" style={{ background: COLORS.bg }}>
                  <div style={{ color: COLORS.muted }}>SSL Expired</div>
                  <div style={{ color: overview.infrastructure.ssl_expired > 0 ? COLORS.red : COLORS.green }}>{overview.infrastructure.ssl_expired}</div>
                </div>
                <div className="p-2 rounded" style={{ background: COLORS.bg }}>
                  <div style={{ color: COLORS.muted }}>Firewall Rules</div>
                  <div style={{ color: COLORS.blue }}>{overview.infrastructure.firewall_rules}</div>
                </div>
                <div className="p-2 rounded" style={{ background: COLORS.bg }}>
                  <div style={{ color: COLORS.muted }}>Health Critical</div>
                  <div style={{ color: overview.platform.critical_health_checks > 0 ? COLORS.red : COLORS.green }}>{overview.platform.critical_health_checks}</div>
                </div>
                <div className="p-2 rounded" style={{ background: COLORS.bg }}>
                  <div style={{ color: COLORS.muted }}>Unread Notif.</div>
                  <div style={{ color: overview.platform.unread_notifications > 0 ? COLORS.amber : COLORS.muted }}>{overview.platform.unread_notifications}</div>
                </div>
              </div>
            </div>
          )}

          {overview && (
            <div className="p-4 rounded-xl" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
              <h3 className="text-[12px] font-bold mb-3" style={{ color: COLORS.muted }}>PLATAFORMA</h3>
              <div className="grid grid-cols-2 gap-3 text-[12px]">
                <div className="p-2 rounded" style={{ background: COLORS.bg }}>
                  <div style={{ color: COLORS.muted }}>KB Articles</div>
                  <div style={{ color: COLORS.teal }}>{overview.platform.kb_articles}</div>
                </div>
                <div className="p-2 rounded" style={{ background: COLORS.bg }}>
                  <div style={{ color: COLORS.muted }}>Active Tasks</div>
                  <div style={{ color: COLORS.teal }}>{overview.platform.active_tasks}</div>
                </div>
                <div className="p-2 rounded" style={{ background: COLORS.bg }}>
                  <div style={{ color: COLORS.muted }}>API Keys</div>
                  <div style={{ color: COLORS.purple }}>{overview.platform.active_api_keys}</div>
                </div>
                <div className="p-2 rounded" style={{ background: COLORS.bg }}>
                  <div style={{ color: COLORS.muted }}>Webhooks</div>
                  <div style={{ color: COLORS.purple }}>{overview.platform.active_webhooks}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Center: Alerts */}
        <div className="space-y-6">
          {alerts && (
            <div className="p-4 rounded-xl" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[12px] font-bold" style={{ color: COLORS.muted }}>ALERTAS ATIVOS</h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold" style={{ background: alerts.total_alerts > 0 ? `color-mix(in srgb, var(--status-warning-text) 12%, transparent)` : `color-mix(in srgb, var(--status-ok-text) 12%, transparent)`, color: alerts.total_alerts > 0 ? COLORS.amber : COLORS.green }}>
                  {alerts.total_alerts} total
                </span>
              </div>

              {alerts.critical_tickets.length > 0 && (
                <div className="mb-3">
                  <div className="text-[10px] font-bold uppercase mb-1" style={{ color: COLORS.red }}>Tickets Críticos</div>
                  {alerts.critical_tickets.map((t) => (
                    <AlertRow key={t.id as string} title={t.title as string} subtitle={formatTime(t.created_at as string)} badge={t.priority as string} badgeColor={COLORS.red} />
                  ))}
                </div>
              )}

              {alerts.ssl_alerts.length > 0 && (
                <div className="mb-3">
                  <div className="text-[10px] font-bold uppercase mb-1" style={{ color: COLORS.amber }}>SSL</div>
                  {alerts.ssl_alerts.map((s) => (
                    <AlertRow key={s.id as string} title={s.hostname as string} subtitle={`Expires: ${formatTime(s.valid_to as string)}`} badge={s.status as string} badgeColor={s.status === "expired" ? COLORS.red : COLORS.amber} />
                  ))}
                </div>
              )}

              {alerts.capacity_risks.length > 0 && (
                <div className="mb-3">
                  <div className="text-[10px] font-bold uppercase mb-1" style={{ color: COLORS.amber }}>Capacity</div>
                  {alerts.capacity_risks.map((cap) => (
                    <AlertRow key={cap.id as string} title={cap.resource_name as string} subtitle={`${cap.resource_type as string} · ${formatTime(cap.generated_at as string)}`} badge={cap.confidence as string} badgeColor={cap.confidence === "high" ? COLORS.red : COLORS.amber} />
                  ))}
                </div>
              )}

              {alerts.failed_backups.length > 0 && (
                <div className="mb-3">
                  <div className="text-[10px] font-bold uppercase mb-1" style={{ color: COLORS.red }}>Backups Falhados</div>
                  {alerts.failed_backups.map((b) => (
                    <AlertRow key={b.id as string} title={b.file_path as string} subtitle={formatTime(b.created_at as string)} badge="failed" badgeColor={COLORS.red} />
                  ))}
                </div>
              )}

              {alerts.health_alerts.length > 0 && (
                <div className="mb-3">
                  <div className="text-[10px] font-bold uppercase mb-1" style={{ color: COLORS.amber }}>Health Checks</div>
                  {alerts.health_alerts.map((h) => (
                    <AlertRow key={h.id as string} title={h.check_name as string} subtitle={h.message as string} badge={h.severity as string} badgeColor={h.severity === "critical" ? COLORS.red : COLORS.amber} />
                  ))}
                </div>
              )}

              {alerts.total_alerts === 0 && (
                <div className="text-center py-4 text-[12px]" style={{ color: COLORS.green }}>✓ Nenhum alerta ativo</div>
              )}
            </div>
          )}
        </div>

        {/* Right: Recent Activity & Top Devices */}
        <div className="space-y-6">
          {summary && (
            <div className="p-4 rounded-xl" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
              <h3 className="text-[12px] font-bold mb-3" style={{ color: COLORS.muted }}>TOP DEVICES</h3>
              <div className="space-y-1">
                {summary.top_devices.length === 0 && <div className="text-[12px]" style={{ color: COLORS.muted }}>Nenhum device</div>}
                {summary.top_devices.map((d, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded text-[12px]" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <div>
                      <div style={{ color: COLORS.teal }}>{d.name as string}</div>
                      <div style={{ color: COLORS.muted }}>{d.hostname as string}</div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: d.status === "online" ? `var(--status-ok-bg)` : d.status === "warning" ? `var(--status-warning-bg)` : `var(--status-error-bg)`, color: d.status === "online" ? COLORS.green : d.status === "warning" ? COLORS.amber : COLORS.red }}>
                      {d.status as string}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {summary && (
            <div className="p-4 rounded-xl" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
              <h3 className="text-[12px] font-bold mb-3" style={{ color: COLORS.muted }}>ATIVIDADE RECENTE</h3>
              <div className="space-y-1">
                {summary.recent_activity.length === 0 && <div className="text-[12px]" style={{ color: COLORS.muted }}>Nenhuma atividade</div>}
                {summary.recent_activity.map((a, i) => (
                  <div key={i} className="flex items-center justify-between p-1.5 text-[11px]" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <span style={{ color: COLORS.blue }}>{a.action as string}</span>
                    <span style={{ color: COLORS.muted }}>{a.resource_type as string}</span>
                    <span style={{ color: COLORS.muted }}>{formatTime(a.created_at as string)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {summary && (
            <div className="p-4 rounded-xl" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
              <h3 className="text-[12px] font-bold mb-3" style={{ color: COLORS.muted }}>TICKETS RECENTES</h3>
              <div className="space-y-1">
                {summary.recent_tickets.length === 0 && <div className="text-[12px]" style={{ color: COLORS.muted }}>Nenhum ticket</div>}
                {summary.recent_tickets.map((t, i) => (
                  <div key={i} className="flex items-center justify-between p-2 text-[12px]" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <div style={{ color: COLORS.text }}>{t.title as string}</div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: t.priority === "critical" ? `var(--status-error-bg)` : t.priority === "high" ? `var(--status-warning-bg)` : `var(--status-info-bg)`, color: t.priority === "critical" ? COLORS.red : t.priority === "high" ? COLORS.amber : COLORS.blue }}>
                      {t.priority as string}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
