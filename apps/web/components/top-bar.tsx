// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useEffect, useState, useRef } from "react";
import { usePathname } from "next/navigation";
import { ChevronRight, Activity, Bell, X } from "lucide-react";
import { useRealtime } from "@/lib/realtime-provider";
import { ThemeToggle } from "@/components/theme-toggle";

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
    "push-settings": "Push",
    "sla-dashboard": "SLA Dashboard",
    "health-score": "Health Score",
    "service-tree": "Service Tree",
    correlation: "Correlação",
    "anomaly-detection": "AI Anomaly",
    "predictive-failure": "Predictive Failure",
    chatops: "ChatOps",
    "config-drift": "Config Drift",
    itsm: "ITSM Connectors",
    workflows: "Workflows",
    "client-portal": "Client Portal",
    "white-label": "White-label",
    "status-page-admin": "Status Page",
    "auto-discovery": "Auto-Discovery",
    marketplace: "Marketplace",
    finops: "FinOps",
    patches: "Patch Management",
    lgpd: "LGPD",
    "security-audit": "Security Audit",
    apm: "APM",
    onboarding: "Onboarding",
    modules: "Módulos",
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

const SEVERITY_DOT: Record<string, string> = {
  info: "var(--status-info-text, #3E8BF0)",
  warning: "var(--status-warning-text, #F5A623)",
  critical: "var(--status-error-text, #E5484D)",
};

export function TopBar() {
  const [now, setNow] = useState(() => new Date());
  const pathname = usePathname();
  const { isConnected, notifications, dismissNotification, clearAll } =
    useRealtime();
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Fecha o painel ao clicar fora
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifPanel(false);
      }
    }
    if (showNotifPanel) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showNotifPanel]);

  const breadcrumbs = getBreadcrumbs(pathname);
  const timeStr = now.toLocaleTimeString("pt-BR", { hour12: false });
  const dateStr = now.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const unreadCount = notifications.length;

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
              <ChevronRight
                size={14}
                className="shrink-0"
                style={{ color: "var(--text-muted)" }}
              />
            )}
            <span
              className={`text-sm font-medium truncate ${idx === breadcrumbs.length - 1 ? "font-semibold" : ""}`}
              style={{
                color:
                  idx === breadcrumbs.length - 1
                    ? "var(--text-primary)"
                    : "var(--text-muted)",
              }}
            >
              {crumb.label}
            </span>
          </div>
        ))}
      </div>

      {/* Live clock + connection + notificações */}
      <div className="flex items-center gap-4 shrink-0">
        {/* Sino de notificações */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setShowNotifPanel((v) => !v)}
            className="relative flex items-center justify-center rounded-lg p-1.5 transition-colors"
            style={{
              background: showNotifPanel ? "var(--surface-2)" : "transparent",
              border: "1px solid var(--border-default)",
            }}
            aria-label="Notificações"
          >
            <Bell size={16} style={{ color: "var(--text-secondary)" }} />
            {unreadCount > 0 && (
              <span
                className="absolute -top-1 -right-1 flex items-center justify-center rounded-full text-[10px] font-bold text-white"
                style={{
                  background: "var(--status-error-text, #E5484D)",
                  minWidth: 16,
                  height: 16,
                  padding: "0 4px",
                }}
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>

          {showNotifPanel && (
            <div
              className="absolute right-0 top-full mt-2 w-80 rounded-xl shadow-xl z-50"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border-default)",
              }}
            >
              <div
                className="flex items-center justify-between px-3 py-2 border-b"
                style={{ borderColor: "var(--border-default)" }}
              >
                <span
                  className="text-sm font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  Notificações
                </span>
                {unreadCount > 0 && (
                  <button
                    onClick={clearAll}
                    className="text-[11px] font-medium hover:underline"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Limpar tudo
                  </button>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div
                    className="px-3 py-8 text-center text-sm"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Sem notificações
                  </div>
                ) : (
                  notifications.slice(0, 20).map((n) => (
                    <div
                      key={n.id}
                      className="flex items-start gap-2 px-3 py-2 border-b last:border-0"
                      style={{
                        borderColor:
                          "var(--border-subtle, var(--border-default))",
                      }}
                    >
                      <span
                        className="rounded-full mt-1 shrink-0"
                        style={{
                          width: 6,
                          height: 6,
                          background:
                            SEVERITY_DOT[n.severity ?? "info"] ??
                            SEVERITY_DOT.info,
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-xs font-semibold truncate"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {n.title}
                        </p>
                        <p
                          className="text-[11px] mt-0.5 line-clamp-2"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {n.message}
                        </p>
                        <p
                          className="text-[10px] mt-1"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {new Date(n.timestamp).toLocaleTimeString("pt-BR")}
                        </p>
                      </div>
                      <button
                        onClick={() => dismissNotification(n.id)}
                        className="shrink-0 opacity-50 hover:opacity-100"
                        style={{ color: "var(--text-muted)" }}
                        aria-label="Dispensar"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Theme toggle */}
        <ThemeToggle />

        {/* Indicador de conexão real */}
        <div className="flex items-center gap-1.5">
          <span
            className="rounded-full"
            style={{
              width: 8,
              height: 8,
              background: isConnected
                ? "var(--status-ok-text, #30A46C)"
                : "var(--status-warning-text, #F5A623)",
              boxShadow: isConnected
                ? "0 0 8px var(--status-ok-border, #30A46C44)"
                : "0 0 8px var(--status-warning-border, #F5A62344)",
              animation: "pulse 2s infinite",
            }}
          />
          <span
            className="text-xs font-semibold uppercase tracking-wide"
            style={{
              color: isConnected
                ? "var(--status-ok-text, #30A46C)"
                : "var(--status-warning-text, #F5A623)",
            }}
          >
            {isConnected ? "Online" : "Reconectando"}
          </span>
        </div>

        {/* Live clock */}
        <div
          className="hidden sm:flex items-center gap-2 pl-3"
          style={{ borderLeft: "1px solid var(--border-default)" }}
        >
          <Activity
            size={14}
            className="shrink-0"
            style={{ color: "var(--text-muted)" }}
          />
          <div className="text-right" suppressHydrationWarning>
            <div
              className="text-sm font-semibold tabular-nums"
              style={{ color: "var(--text-primary)" }}
              suppressHydrationWarning
            >
              {timeStr}
            </div>
            <div
              className="text-xs capitalize"
              style={{ color: "var(--text-muted)" }}
              suppressHydrationWarning
            >
              {dateStr}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
