import type { ReactNode } from "react";
import {
  LayoutDashboard,
  Server,
  Bell,
  TrendingUp,
  CircleAlert,
  Activity,
  Wrench,
  BarChart3,
  HeartPulse,
  Layers,
  ShieldCheck,
  Shield,
  Workflow,
  Gauge,
  Ticket,
  GitPullRequestArrow,
  GitBranch,
  GitCompareArrows,
  TrendingDown,
  DollarSign,
  Store,
  BookOpen,
  Clock,
  Mail,
  MessageSquare,
  Users,
  FileStack,
  Palette,
  Zap,
  Plug,
  Network,
  Radar,
  FileBarChart,
  FileText,
  CheckCircle2,
  ScrollText,
  Flame,
  Lock,
  KeyRound,
  Sailboat,
  Flag,
  Scroll,
  ArrowLeftRight,
  Code2,
  Settings,
  UserCog,
  UserRound,
  UserPlus,
  Globe,
  Puzzle,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
  external?: boolean;
  prefixMatch?: boolean;
  flagKey?: string;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

const iconProps = {
  size: 18,
  strokeWidth: 2,
  className: "shrink-0",
} as const;

export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Dashboard",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: <LayoutDashboard {...iconProps} />, flagKey: "module_dashboard" },
      { label: "Dispositivos", href: "/dashboard/devices", prefixMatch: true, icon: <Server {...iconProps} />, flagKey: "module_devices" },
      { label: "Alertas", href: "/dashboard/alerts", icon: <Bell {...iconProps} />, flagKey: "module_zabbix" },
      { label: "Executive", href: "/executive-dashboard", icon: <TrendingUp {...iconProps} />, flagKey: "module_executive_dashboard" },
      { label: "Push", href: "/push-settings", icon: <Bell {...iconProps} />, flagKey: "module_push" },
    ],
  },
  {
    title: "Monitoramento",
    items: [
      { label: "Problemas", href: "/dashboard/problems", icon: <CircleAlert {...iconProps} />, flagKey: "module_zabbix" },
      { label: "Eventos", href: "/dashboard/events", icon: <Activity {...iconProps} />, flagKey: "module_zabbix" },
      { label: "Gráficos", href: "/dashboard/graphs", icon: <BarChart3 {...iconProps} />, flagKey: "module_zabbix" },
      { label: "Manutenção", href: "/dashboard/maintenance", icon: <Wrench {...iconProps} />, flagKey: "module_zabbix" },
      { label: "System Health", href: "/system-health", icon: <HeartPulse {...iconProps} />, flagKey: "module_system_health" },
      { label: "Health Score", href: "/health-score", icon: <Activity {...iconProps} />, flagKey: "module_system_health" },
      { label: "Capacity", href: "/capacity", icon: <Gauge {...iconProps} />, flagKey: "module_capacity" },
      { label: "Serviços", href: "/dashboard/services", icon: <Layers {...iconProps} />, flagKey: "module_sla" },
      { label: "SLAs", href: "/dashboard/slas", icon: <ShieldCheck {...iconProps} />, flagKey: "module_sla" },
      { label: "SLA Dashboard", href: "/sla-dashboard", icon: <Gauge {...iconProps} />, flagKey: "module_sla" },
      { label: "Service Tree", href: "/service-tree", icon: <GitBranch {...iconProps} />, flagKey: "module_sla" },
      { label: "Correlação", href: "/correlation", icon: <Layers {...iconProps} />, flagKey: "module_correlation" },
      { label: "AI Anomaly", href: "/anomaly-detection", icon: <Activity {...iconProps} />, flagKey: "module_anomaly" },
      { label: "Predictive Failure", href: "/predictive-failure", icon: <TrendingDown {...iconProps} />, flagKey: "module_predictions" },
    ],
  },
  {
    title: "Operações",
    items: [
      { label: "Tickets", href: "/tickets", icon: <Ticket {...iconProps} />, flagKey: "module_tickets" },
      { label: "Mudanças", href: "/changes", icon: <GitPullRequestArrow {...iconProps} />, flagKey: "module_changes" },
      { label: "Base de Conhecimento", href: "/knowledge-base", icon: <BookOpen {...iconProps} />, flagKey: "module_kb" },
      { label: "Tarefas Agendadas", href: "/scheduled-tasks", icon: <Clock {...iconProps} />, flagKey: "module_tasks" },
      { label: "Notificações", href: "/notifications", icon: <Mail {...iconProps} />, flagKey: "module_notifications" },
      { label: "ChatOps", href: "/chatops", icon: <MessageSquare {...iconProps} />, flagKey: "module_chatops" },
      { label: "Config Drift", href: "/config-drift", icon: <GitCompareArrows {...iconProps} />, flagKey: "module_drift" },
      { label: "ITSM Connectors", href: "/itsm", icon: <Plug {...iconProps} />, flagKey: "module_itsm" },
      { label: "Relatórios", href: "/reports", icon: <FileText {...iconProps} />, flagKey: "module_reports" },
      { label: "Workflows", href: "/workflows", icon: <Workflow {...iconProps} />, flagKey: "module_workflows" },
    ],
  },
  {
    title: "Administração",
    items: [
      { label: "Admin Global", href: "/admin", icon: <Settings {...iconProps} />, flagKey: "module_admin" },
      { label: "Onboarding", href: "/admin/onboarding", icon: <UserPlus {...iconProps} />, flagKey: "module_admin" },
      { label: "Módulos", href: "/settings/modules", icon: <Puzzle {...iconProps} />, flagKey: "module_settings" },
      { label: "Client Portal", href: "/client-portal", icon: <Users {...iconProps} />, flagKey: "module_client_portal" },
      { label: "Config do Tenant", href: "/settings", icon: <UserCog {...iconProps} />, flagKey: "module_settings" },
      { label: "White-label", href: "/white-label", icon: <Palette {...iconProps} />, flagKey: "module_settings" },
      { label: "Status Page", href: "/status-page-admin", icon: <Globe {...iconProps} />, flagKey: "module_status_page" },
      { label: "Grupos de Hosts", href: "/dashboard/host-groups", icon: <Users {...iconProps} />, flagKey: "module_zabbix" },
      { label: "Templates", href: "/dashboard/templates", icon: <FileStack {...iconProps} />, flagKey: "module_zabbix" },
      { label: "Usuários Zabbix", href: "/dashboard/users", icon: <UserRound {...iconProps} />, flagKey: "module_zabbix" },
      { label: "Ações", href: "/dashboard/actions", icon: <Zap {...iconProps} />, flagKey: "module_zabbix" },
      { label: "Proxies", href: "/dashboard/proxies", icon: <Network {...iconProps} />, flagKey: "module_zabbix" },
      { label: "Discovery", href: "/dashboard/discovery", icon: <Radar {...iconProps} />, flagKey: "module_zabbix" },
      { label: "Auto-Discovery", href: "/auto-discovery", icon: <Radar {...iconProps} />, flagKey: "module_discovery" },
      { label: "Relatórios Zabbix", href: "/dashboard/reports", icon: <FileBarChart {...iconProps} />, flagKey: "module_zabbix" },
      { label: "Meu Perfil", href: "/profile", icon: <UserRound {...iconProps} />, flagKey: "module_profile" },
      { label: "Sessões & Segurança", href: "/sessions", icon: <ShieldCheck {...iconProps} />, flagKey: "module_auth" },
      { label: "Zabbix Server", href: "https://zabbix.jlinformatica.com.br", external: true, icon: <Globe {...iconProps} /> },
    ],
  },
  {
    title: "Segurança & Compliance",
    items: [
      { label: "Firewall", href: "/firewall", icon: <Flame {...iconProps} />, flagKey: "module_firewall" },
      { label: "SSL", href: "/ssl", icon: <Lock {...iconProps} />, flagKey: "module_ssl" },
      { label: "MFA", href: "/security/mfa", icon: <KeyRound {...iconProps} />, flagKey: "module_mfa" },
      { label: "Patch Management", href: "/patches", icon: <Shield {...iconProps} />, flagKey: "module_patches" },
      { label: "Auditoria de Logs", href: "/security/audit", icon: <ScrollText {...iconProps} />, flagKey: "module_audit" },
      { label: "Security Audit", href: "/security-audit", icon: <ShieldCheck {...iconProps} />, flagKey: "module_security_audit" },
      { label: "Compliance", href: "/compliance", icon: <CheckCircle2 {...iconProps} />, flagKey: "module_compliance" },
      { label: "LGPD", href: "/lgpd", icon: <FileText {...iconProps} />, flagKey: "module_lgpd" },
      { label: "Backups", href: "/backups", icon: <ArrowLeftRight {...iconProps} />, flagKey: "module_backup" },
      { label: "Kubernetes", href: "/k8s", icon: <Sailboat {...iconProps} />, flagKey: "module_k8s" },
      { label: "Assets", href: "/assets", icon: <Server {...iconProps} />, flagKey: "module_assets" },
      { label: "FinOps", href: "/finops", icon: <DollarSign {...iconProps} />, flagKey: "module_finops" },
    ],
  },
  {
    title: "DevTools",
    items: [
      { label: "API Keys", href: "/api-keys", icon: <KeyRound {...iconProps} />, flagKey: "module_api_keys" },
      { label: "Webhooks", href: "/webhooks", icon: <Network {...iconProps} />, flagKey: "module_webhooks" },
      { label: "Feature Flags", href: "/feature-flags", icon: <Flag {...iconProps} />, flagKey: "module_feature_flags" },
      { label: "Marketplace", href: "/marketplace", icon: <Store {...iconProps} />, flagKey: "module_marketplace" },
      { label: "Logs", href: "/logs", icon: <Scroll {...iconProps} />, flagKey: "module_logs" },
      { label: "Traces", href: "/traces", icon: <Activity {...iconProps} />, flagKey: "module_traces" },
      { label: "Data Transfer", href: "/data-transfer", icon: <ArrowLeftRight {...iconProps} />, flagKey: "module_data_transfer" },
      { label: "Automação", href: "/automation/scripts", icon: <Code2 {...iconProps} />, flagKey: "module_scripts" },
    ],
  },
];
