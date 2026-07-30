"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronRight, Activity } from "lucide-react";

interface BreadcrumbPart {
  label: string;
  href?: string;
}

function getBreadcrumbs(pathname: string | null): BreadcrumbPart[] {
  if (!pathname) return [{ label: "Dashboard" }];
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return [{ label: "Dashboard" }];

  const labelMap: Record<string, string> = {
    dashboard: "Dashboard",
    devices: "Dispositivos",
    alerts: "Alertas",
    problems: "Problemas",
    events: "Eventos",
    maintenance: "Manutenção",
    graphs: "Gráficos",
    services: "Serviços",
    slas: "SLAs",
    "host-groups": "Grupos de Hosts",
    templates: "Templates",
    users: "Usuários",
    actions: "Ações",
    proxies: "Proxies",
    discovery: "Discovery",
    reports: "Relatórios",
    overview: "Visão Geral",
    "executive-dashboard": "Executive",
    "system-health": "System Health",
    capacity: "Capacity",
    tickets: "Tickets",
    changes: "Mudanças",
    "knowledge-base": "Base de Conhecimento",
    "scheduled-tasks": "Tarefas Agendadas",
    notifications: "Notificações",
    compliance: "Compliance",
    firewall: "Firewall",
    ssl: "SSL",
    k8s: "Kubernetes",
    backups: "Backups",
    assets: "Assets",
    "api-keys": "API Keys",
    webhooks: "Webhooks",
    "feature-flags": "Feature Flags",
    logs: "Logs",
    traces: "Traces",
    "data-transfer": "Data Transfer",
    automation: "Automação",
    admin: "Admin Global",
    settings: "Configurações",
    profile: "Meu Perfil",
    security: "Segurança",
    audit: "Auditoria",
    mfa: "MFA",
    scripts: "Scripts",
  };

  const crumbs: BreadcrumbPart[] = [];
  let currentPath = "";
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    currentPath += `/${seg}`;
    const label = labelMap[seg] ?? seg.charAt(0).toUpperCase() + seg.slice(1);
    const isLast = i === segments.length - 1;
    crumbs.push({ label, href: isLast ? undefined : currentPath });
  }
  return crumbs;
}

export function TopBar() {
  const [now, setNow] = useState(() => new Date());
  const pathname = usePathname();

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const breadcrumbs = getBreadcrumbs(pathname);
  const timeStr = now.toLocaleTimeString("pt-BR", { hour12: false });
  const dateStr = now.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <div
      className="flex items-center justify-between px-4 py-3 mb-4 rounded-xl"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-default)",
      }}
    >
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 min-w-0">
        {breadcrumbs.map((crumb, idx) => (
          <div key={idx} className="flex items-center gap-1.5 min-w-0">
            {idx > 0 && (
              <ChevronRight size={14} className="shrink-0" style={{ color: "var(--text-muted)" }} />
            )}
            <span
              className={`text-sm font-medium truncate ${idx === breadcrumbs.length - 1 ? "font-semibold" : ""}`}
              style={{
                color: idx === breadcrumbs.length - 1 ? "var(--text-primary)" : "var(--text-muted)",
              }}
            >
              {crumb.label}
            </span>
          </div>
        ))}
      </div>

      {/* Live clock + connection */}
      <div className="flex items-center gap-4 shrink-0">
        <div className="flex items-center gap-1.5">
          <span
            className="rounded-full"
            style={{
              width: 8,
              height: 8,
              background: "var(--status-ok-text)",
              boxShadow: "0 0 8px var(--status-ok-border)",
              animation: "pulse 2s infinite",
            }}
          />
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--status-ok-text)" }}>
            Online
          </span>
        </div>
        <div className="hidden sm:flex items-center gap-2 pl-3" style={{ borderLeft: "1px solid var(--border-default)" }}>
          <Activity size={14} className="shrink-0" style={{ color: "var(--text-muted)" }} />
          <div className="text-right" suppressHydrationWarning>
            <div className="text-sm font-semibold tabular-nums" style={{ color: "var(--text-primary)" }} suppressHydrationWarning>
              {timeStr}
            </div>
            <div className="text-xs capitalize" style={{ color: "var(--text-muted)" }} suppressHydrationWarning>
              {dateStr}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
