// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useModuleFlags } from "@/lib/use-module-flags";
import { useUserScope } from "@/components/user-scope-provider";

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
  recent_activity: Array<{
    action: string;
    entity_type: string;
    created_at: string;
  }>;
  recent_tickets: Array<{
    id: string;
    subject: string;
    status: string;
    priority: string;
    created_at: string;
  }>;
  upcoming_changes: Array<{
    id: string;
    rfc_number: string;
    title: string;
    planned_start_at: string;
    priority: string;
  }>;
  ssl_expiring_soon: Array<{ id: string; hostname: string; valid_to: string }>;
}

interface KpiConfig {
  key: string;
  label: string;
  moduleFlag?: string;
  render: (k: DashboardData["kpis"]) => {
    value: string | number;
    sub?: string;
    variant: "ok" | "info" | "warning" | "error" | "default";
    href: string;
  };
}

const KPI_CONFIG: KpiConfig[] = [
  {
    key: "devices",
    label: "Devices",
    render: (k) => ({
      value: `${k.devices.online}/${k.devices.total}`,
      sub: "online",
      variant: "info" as const,
      href: "/dashboard/devices",
    }),
  },
  {
    key: "tickets",
    label: "Tickets",
    moduleFlag: "module_tickets",
    render: (k) => ({
      value: k.tickets.open,
      sub:
        k.tickets.critical > 0 ? `${k.tickets.critical} críticos` : "abertos",
      variant: k.tickets.critical > 0 ? ("error" as const) : ("info" as const),
      href: "/tickets",
    }),
  },
  {
    key: "compliance",
    label: "Compliance",
    moduleFlag: "module_compliance",
    render: (k) => ({
      value: `${k.compliance.rate}%`,
      sub: `${k.compliance.compliant}/${k.compliance.total}`,
      variant: k.compliance.rate >= 80 ? ("ok" as const) : ("warning" as const),
      href: "/compliance",
    }),
  },
  {
    key: "ssl",
    label: "SSL",
    moduleFlag: "module_ssl",
    render: (k) => ({
      value: k.ssl.expiring,
      sub: k.ssl.expiring > 0 ? "expirando" : "ok",
      variant: k.ssl.expiring > 0 ? ("error" as const) : ("ok" as const),
      href: "/ssl",
    }),
  },
  {
    key: "backups",
    label: "Backups",
    moduleFlag: "module_backup",
    render: (k) => ({
      value: `${k.backups.rate}%`,
      sub: `${k.backups.successful}/${k.backups.total}`,
      variant: k.backups.rate >= 90 ? ("ok" as const) : ("warning" as const),
      href: "/backups",
    }),
  },
  {
    key: "firewall",
    label: "Firewall",
    render: (k) => ({
      value: k.firewall.active,
      sub: `de ${k.firewall.total} regras`,
      variant: "info" as const,
      href: "/firewall",
    }),
  },
  {
    key: "changes",
    label: "Changes",
    moduleFlag: "module_changes",
    render: (k) => ({
      value: k.changes.pending,
      sub: `${k.changes.in_progress} em exec.`,
      variant: "info" as const,
      href: "/changes",
    }),
  },
  {
    key: "assets",
    label: "Assets",
    moduleFlag: "module_assets",
    render: (k) => ({
      value: k.assets.total,
      sub: "ativos",
      variant: "default" as const,
      href: "/assets",
    }),
  },
  {
    key: "scripts",
    label: "Scripts",
    render: (k) => ({
      value: k.scripts.total,
      sub: "scripts",
      variant: "info" as const,
      href: "/automation",
    }),
  },
  {
    key: "notifications",
    label: "Notif.",
    moduleFlag: "module_notifications",
    render: (k) => ({
      value: k.notifications.unread,
      sub: "não lidas",
      variant:
        k.notifications.unread > 0
          ? ("warning" as const)
          : ("default" as const),
      href: "/notifications",
    }),
  },
];

const colorMap = {
  default: "var(--text-primary)",
  ok: "var(--status-ok-text)",
  info: "var(--status-info-text)",
  warning: "var(--status-warning-text)",
  error: "var(--status-error-text)",
};

export function DynamicKpiGrid({ kpis }: { kpis: DashboardData["kpis"] }) {
  const {
    isModuleEnabled,
    isClientModuleEnabled,
    isLoading: flagsLoading,
  } = useModuleFlags();
  const { scope } = useUserScope();
  const isClient = scope === "tenant";

  if (flagsLoading) {
    return (
      <div
        className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3"
        aria-hidden="true"
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-xl"
            style={{ background: "var(--surface-2)" }}
          />
        ))}
      </div>
    );
  }

  // Filtra KPIs: se é cliente, usa isClientModuleEnabled; se é admin, usa isModuleEnabled
  const visibleKpis = KPI_CONFIG.filter((kpi) => {
    if (!kpi.moduleFlag) return true;
    return isClient
      ? isClientModuleEnabled(kpi.moduleFlag)
      : isModuleEnabled(kpi.moduleFlag);
  });

  if (visibleKpis.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
      {visibleKpis.map((kpi) => {
        const { value, sub, variant, href } = kpi.render(kpis);
        const color = colorMap[variant];
        return (
          <a
            key={kpi.key}
            href={href}
            className="block p-3 rounded-xl transition-all no-underline hover:opacity-80"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border-default)",
              textDecoration: "none",
            }}
          >
            <div
              className="text-xs uppercase font-semibold mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              {kpi.label}
            </div>
            <div className="text-xl font-bold tabular-nums" style={{ color }}>
              {value}
            </div>
            {sub && (
              <div
                className="text-xs mt-0.5"
                style={{ color: "var(--text-muted)" }}
              >
                {sub}
              </div>
            )}
          </a>
        );
      })}
    </div>
  );
}
