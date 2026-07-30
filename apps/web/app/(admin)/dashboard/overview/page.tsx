"use client";

import { Card, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { LoadingState } from "@/components/ui/state-display";
import { useApi } from "@/lib/use-api";

interface DashboardData {
  kpis: {
    devices: { total: number; online: number };
    tickets: { open: number; critical: number };
    compliance: { total: number; compliant: number; rate: number };
    ssl: { total: number; expiring: number };
    backups: { total: number; successful: number; rate: number };
    firewall: { total: number; active: number };
    changes: { pending: number; in_progress: number };
    assets: { total: number };
    scripts: { total: number };
    notifications: { unread: number };
  };
  recent_activity: Array<{ action: string; entity_type: string; created_at: string }>;
  recent_tickets: Array<{ id: string; subject: string; status: string; priority: string; created_at: string }>;
  upcoming_changes: Array<{ id: string; rfc_number: string; title: string; planned_start_at: string; priority: string }>;
  ssl_expiring_soon: Array<{ id: string; hostname: string; valid_to: string }>;
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function MiniKpi({ label, value, sub, variant, href }: { label: string; value: string | number; sub?: string; variant: "ok" | "info" | "warning" | "error" | "default"; href: string }) {
  const colorMap = {
    default: "var(--text-primary)",
    ok: "var(--status-ok-text)",
    info: "var(--status-info-text)",
    warning: "var(--status-warning-text)",
    error: "var(--status-error-text)",
  };
  const color = colorMap[variant];
  return (
    <a href={href} className="block p-3 rounded-xl transition-all no-underline" style={{ background: "var(--surface-2)", border: "1px solid var(--border-default)", textDecoration: "none" }}>
      <div className="text-xs uppercase font-semibold mb-1" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="text-xl font-bold tabular-nums" style={{ color }}>{value}</div>
      {sub && <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{sub}</div>}
    </a>
  );
}

const STATUS_VARIANT: Record<string, "ok" | "info" | "warning" | "error" | "neutral"> = {
  open: "info", in_progress: "warning", resolved: "ok", closed: "neutral",
  pending: "neutral", approved: "ok", critical: "error", high: "warning",
};

export default function DashboardOverview() {
  const { data, isLoading, mutate } = useApi<DashboardData>("/api/dashboard/overview");

  if (isLoading) {
    return <LoadingState label="Carregando KPIs..." />;
  }

  if (!data) {
    return (
      <div className="text-sm" style={{ color: "var(--text-muted)" }}>
        Sem dados disponíveis
      </div>
    );
  }

  const k = data.kpis;

  return (
    <div className="space-y-4">
      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <MiniKpi label="Devices" value={`${k.devices.online}/${k.devices.total}`} sub="online" variant="info" href="/dashboard/devices" />
        <MiniKpi label="Tickets" value={k.tickets.open} sub={k.tickets.critical > 0 ? `${k.tickets.critical} críticos` : "abertos"} variant={k.tickets.critical > 0 ? "error" : "info"} href="/tickets" />
        <MiniKpi label="Compliance" value={`${k.compliance.rate}%`} sub={`${k.compliance.compliant}/${k.compliance.total}`} variant={k.compliance.rate >= 80 ? "ok" : "warning"} href="/compliance" />
        <MiniKpi label="SSL" value={k.ssl.expiring} sub={k.ssl.expiring > 0 ? "expirando" : "ok"} variant={k.ssl.expiring > 0 ? "error" : "ok"} href="/ssl" />
        <MiniKpi label="Backups" value={`${k.backups.rate}%`} sub={`${k.backups.successful}/${k.backups.total}`} variant={k.backups.rate >= 90 ? "ok" : "warning"} href="/backups" />
        <MiniKpi label="Firewall" value={k.firewall.active} sub={`de ${k.firewall.total} regras`} variant="info" href="/firewall" />
        <MiniKpi label="Changes" value={k.changes.pending} sub={`${k.changes.in_progress} em exec.`} variant="info" href="/changes" />
        <MiniKpi label="Assets" value={k.assets.total} sub="ativos" variant="default" href="/assets" />
        <MiniKpi label="Scripts" value={k.scripts.total} sub="scripts" variant="info" href="/automation" />
        <MiniKpi label="Notif." value={k.notifications.unread} sub="não lidas" variant={k.notifications.unread > 0 ? "warning" : "default"} href="/notifications" />
      </div>

      {/* Two columns: Activity + Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Activity */}
        <Card>
          <CardHeader title="Atividade Recente" />
          <div className="space-y-1">
            {data.recent_activity.length === 0 && <div className="text-sm" style={{ color: "var(--text-muted)" }}>Sem atividade</div>}
            {data.recent_activity.map((act, i) => (
              <div key={i} className="flex items-center justify-between text-sm py-1.5" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <span style={{ color: "var(--text-secondary)" }}>{act.action}</span>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>{formatTime(act.created_at)}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Upcoming Changes + SSL Expiring */}
        <div className="space-y-4">
          {/* Upcoming Changes */}
          <Card>
            <CardHeader title="Próximas Mudanças" />
            <div className="space-y-1">
              {data.upcoming_changes.length === 0 && <div className="text-sm" style={{ color: "var(--text-muted)" }}>Nenhuma mudança agendada</div>}
              {data.upcoming_changes.map((ch) => (
                <a key={ch.id} href="/changes" className="flex items-center justify-between text-sm py-1.5 no-underline" style={{ textDecoration: "none", borderBottom: "1px solid var(--border-subtle)" }}>
                  <div className="min-w-0">
                    <span className="font-semibold" style={{ color: "var(--brand-primary)" }}>{ch.rfc_number}</span>
                    <span className="ml-2 truncate" style={{ color: "var(--text-secondary)" }}>{ch.title}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge variant={STATUS_VARIANT[ch.priority] ?? "neutral"}>{ch.priority}</StatusBadge>
                    <span className="text-xs" style={{ color: "var(--status-info-text)" }}>{formatTime(ch.planned_start_at)}</span>
                  </div>
                </a>
              ))}
            </div>
          </Card>

          {/* SSL Expiring */}
          {data.ssl_expiring_soon.length > 0 && (
            <Card>
              <CardHeader title="SSL Expirando" />
              <div className="space-y-1">
                {data.ssl_expiring_soon.map((ssl) => (
                  <a key={ssl.id} href="/ssl" className="flex items-center justify-between text-sm py-1.5 no-underline" style={{ textDecoration: "none", borderBottom: "1px solid var(--border-subtle)" }}>
                    <span style={{ color: "var(--text-secondary)" }}>{ssl.hostname}</span>
                    <span className="text-xs font-semibold" style={{ color: "var(--status-error-text)" }}>{formatTime(ssl.valid_to)}</span>
                  </a>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Recent Tickets */}
      <Card>
        <CardHeader title="Tickets Recentes" />
        <div className="space-y-1">
          {data.recent_tickets.length === 0 && <div className="text-sm" style={{ color: "var(--text-muted)" }}>Nenhum ticket</div>}
          {data.recent_tickets.map((t) => (
            <a key={t.id} href="/tickets" className="flex items-center justify-between text-sm py-1.5 no-underline" style={{ textDecoration: "none", borderBottom: "1px solid var(--border-subtle)" }}>
              <div className="flex items-center gap-2 min-w-0">
                <StatusBadge variant={STATUS_VARIANT[t.status] ?? "neutral"}>{t.status}</StatusBadge>
                <span className="truncate" style={{ color: "var(--text-secondary)" }}>{t.subject}</span>
              </div>
              <span className="text-xs shrink-0" style={{ color: "var(--text-muted)" }}>{formatTime(t.created_at)}</span>
            </a>
          ))}
        </div>
      </Card>
    </div>
  );
}
