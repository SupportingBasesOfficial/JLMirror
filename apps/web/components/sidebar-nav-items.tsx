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
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
  external?: boolean;
  prefixMatch?: boolean;
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
    title: "Visão Geral",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: <LayoutDashboard {...iconProps} /> },
      { label: "Dispositivos", href: "/dashboard/devices", prefixMatch: true, icon: <Server {...iconProps} /> },
      { label: "Alertas", href: "/dashboard/alerts", icon: <Bell {...iconProps} /> },
      { label: "Push", href: "/push-settings", icon: <Bell {...iconProps} /> },
      { label: "Executive", href: "/executive-dashboard", icon: <TrendingUp {...iconProps} /> },
    ],
  },
  {
    title: "Monitoramento",
    items: [
      { label: "Problemas", href: "/dashboard/problems", icon: <CircleAlert {...iconProps} /> },
      { label: "Eventos", href: "/dashboard/events", icon: <Activity {...iconProps} /> },
      { label: "Manutenção", href: "/dashboard/maintenance", icon: <Wrench {...iconProps} /> },
      { label: "Gráficos", href: "/dashboard/graphs", icon: <BarChart3 {...iconProps} /> },
      { label: "System Health", href: "/system-health", icon: <HeartPulse {...iconProps} /> },
    ],
  },
  {
    title: "SLA & Serviços",
    items: [
      { label: "Serviços", href: "/dashboard/services", icon: <Layers {...iconProps} /> },
      { label: "SLAs", href: "/dashboard/slas", icon: <ShieldCheck {...iconProps} /> },
      { label: "SLA Dashboard", href: "/sla-dashboard", icon: <Gauge {...iconProps} /> },
      { label: "Service Tree", href: "/service-tree", icon: <GitBranch {...iconProps} /> },
      { label: "Capacity", href: "/capacity", icon: <Gauge {...iconProps} /> },
    ],
  },
  {
    title: "Operações",
    items: [
      { label: "Tickets", href: "/tickets", icon: <Ticket {...iconProps} /> },
      { label: "Mudanças", href: "/changes", icon: <GitPullRequestArrow {...iconProps} /> },
      { label: "Base de Conhecimento", href: "/knowledge-base", icon: <BookOpen {...iconProps} /> },
      { label: "Tarefas Agendadas", href: "/scheduled-tasks", icon: <Clock {...iconProps} /> },
      { label: "ChatOps", href: "/chatops", icon: <MessageSquare {...iconProps} /> },
      { label: "Config Drift", href: "/config-drift", icon: <GitCompareArrows {...iconProps} /> },
      { label: "ITSM Connectors", href: "/itsm", icon: <Plug {...iconProps} /> },
      { label: "Notificações", href: "/notifications", icon: <Mail {...iconProps} /> },
    ],
  },
  {
    title: "Administração Zabbix",
    items: [
      { label: "Grupos de Hosts", href: "/dashboard/host-groups", icon: <Users {...iconProps} /> },
      { label: "Templates", href: "/dashboard/templates", icon: <FileStack {...iconProps} /> },
      { label: "Usuários Zabbix", href: "/dashboard/users", icon: <UserRound {...iconProps} /> },
      { label: "Ações", href: "/dashboard/actions", icon: <Zap {...iconProps} /> },
      { label: "Proxies", href: "/dashboard/proxies", icon: <Network {...iconProps} /> },
      { label: "Discovery", href: "/dashboard/discovery", icon: <Radar {...iconProps} /> },
      { label: "Auto-Discovery", href: "/auto-discovery", icon: <Radar {...iconProps} /> },
      { label: "Relatórios Zabbix", href: "/dashboard/reports", icon: <FileBarChart {...iconProps} /> },
    ],
  },
  {
    title: "Relatórios & Compliance",
    items: [
      { label: "Relatórios", href: "/reports", icon: <FileText {...iconProps} /> },
      { label: "White-label", href: "/white-label", icon: <Palette {...iconProps} /> },
      { label: "FinOps", href: "/finops", icon: <DollarSign {...iconProps} /> },
      { label: "Compliance", href: "/compliance", icon: <CheckCircle2 {...iconProps} /> },
      { label: "Auditoria", href: "/security/audit", icon: <ScrollText {...iconProps} /> },
    ],
  },
  {
    title: "Segurança",
    items: [
      { label: "Firewall", href: "/firewall", icon: <Flame {...iconProps} /> },
      { label: "SSL", href: "/ssl", icon: <Lock {...iconProps} /> },
      { label: "MFA", href: "/security/mfa", icon: <KeyRound {...iconProps} /> },
      { label: "Auditoria", href: "/security-audit", icon: <ShieldCheck {...iconProps} /> },
    ],
  },
  {
    title: "Infraestrutura",
    items: [
      { label: "Kubernetes", href: "/k8s", icon: <Sailboat {...iconProps} /> },
      { label: "Backups", href: "/backups", icon: <ArrowLeftRight {...iconProps} /> },
      { label: "Assets", href: "/assets", icon: <Server {...iconProps} /> },
      { label: "Health Score", href: "/health-score", icon: <Activity {...iconProps} /> },
      { label: "Patch Management", href: "/patches", icon: <Shield {...iconProps} /> },
      { label: "Correlação", href: "/correlation", icon: <Layers {...iconProps} /> },
      { label: "AI Anomaly", href: "/anomaly-detection", icon: <Activity {...iconProps} /> },
      { label: "Predictive Failure", href: "/predictive-failure", icon: <TrendingDown {...iconProps} /> },
      { label: "Workflows", href: "/workflows", icon: <Workflow {...iconProps} /> },
    ],
  },
  {
    title: "DevTools",
    items: [
      { label: "API Keys", href: "/api-keys", icon: <KeyRound {...iconProps} /> },
      { label: "Webhooks", href: "/webhooks", icon: <Network {...iconProps} /> },
      { label: "Feature Flags", href: "/feature-flags", icon: <Flag {...iconProps} /> },
      { label: "Marketplace", href: "/marketplace", icon: <Store {...iconProps} /> },
      { label: "Logs", href: "/logs", icon: <Scroll {...iconProps} /> },
      { label: "Traces", href: "/traces", icon: <Activity {...iconProps} /> },
      { label: "Data Transfer", href: "/data-transfer", icon: <ArrowLeftRight {...iconProps} /> },
      { label: "Automação", href: "/automation/scripts", icon: <Code2 {...iconProps} /> },
    ],
  },
  {
    title: "Configurações",
    items: [
      { label: "Admin Global", href: "/admin", icon: <Settings {...iconProps} /> },
      { label: "Client Portal", href: "/client-portal", icon: <Users {...iconProps} /> },
      { label: "Status Page", href: "/status-page-admin", icon: <Globe {...iconProps} /> },
      { label: "Onboarding", href: "/admin/onboarding", icon: <UserPlus {...iconProps} /> },
      { label: "Config do Tenant", href: "/settings", icon: <UserCog {...iconProps} /> },
      { label: "Meu Perfil", href: "/profile", icon: <UserRound {...iconProps} /> },
      { label: "Sessões & Segurança", href: "/sessions", icon: <ShieldCheck {...iconProps} /> },
      { label: "LGPD", href: "/lgpd", icon: <FileText {...iconProps} /> },
      { label: "Zabbix Server", href: "https://zabbix.jlinformatica.com.br", external: true, icon: <Globe {...iconProps} /> },
    ],
  },
];
