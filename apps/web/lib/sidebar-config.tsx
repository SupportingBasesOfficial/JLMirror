// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import type { ReactNode } from "react";
import {
  LayoutDashboard,
  TrendingUp,
  Globe,
  CircleAlert,
  Activity,
  Bell,
  Mail,
  Server,
  BarChart3,
  HeartPulse,
  Sailboat,
  Layers,
  ShieldCheck,
  Gauge,
  GitBranch,
  TrendingDown,
  DollarSign,
  Ticket,
  GitPullRequestArrow,
  Plug,
  Wrench,
  Clock,
  Flame,
  Workflow,
  MessageSquare,
  BookOpen,
  FileText,
  FileClock,
  GitCompareArrows,
  Users,
  FileStack,
  UserRound,
  Zap,
  Network,
  Radar,
  FileBarChart,
  ScrollText,
  Settings,
  UserCog,
  UserPlus,
  Puzzle,
  Palette,
  Lock,
  KeyRound,
  Shield,
  CheckCircle2,
  ArrowLeftRight,
  Store,
  Scroll,
  Code2,
  Database,
  Flag,
  CircleAlert as ErrorIcon,
} from "lucide-react";

// --- Tipos do schema de sidebar (3 niveis: Modulo > Categoria > Itens) ---

export type SidebarRole =
  "admin_global" | "noc_operator" | "client_viewer" | "dev";

export type BadgeKey = "incidents" | "tickets" | "tasks" | null;

export interface SidebarItem {
  id: string;
  label: string;
  path?: string;
  icon: ReactNode;
  external?: boolean;
  prefixMatch?: boolean;
  flagKey?: string;
  badgeKey?: BadgeKey;
  roles: SidebarRole[];
}

export interface SidebarCategory {
  id: string;
  label: string;
  icon?: ReactNode;
  badgeKey?: BadgeKey;
  roles: SidebarRole[];
  items: SidebarItem[];
}

export interface SidebarModule {
  id: string;
  sectionTitle: string;
  icon: ReactNode;
  roles: SidebarRole[];
  categories: SidebarCategory[];
}

// --- Helpers de icone ---

const iconProps = {
  size: 18,
  strokeWidth: 2,
  className: "shrink-0",
} as const;

const moduleIconProps = {
  size: 20,
  strokeWidth: 2,
  className: "shrink-0",
} as const;

// Alias para evitar conflito de nomes
const ErrorReportIcon = ErrorIcon;

// --- Arvore completa (100% dos itens existentes mantidos) ---
// Rotas apontam para paginas Next.js ja existentes em apps/web/app/(admin)/

export const SIDEBAR_MODULES: SidebarModule[] = [
  // ====================================================================
  // Modulo 1: Observabilidade
  // ====================================================================
  {
    id: "observability",
    sectionTitle: "Observabilidade",
    icon: <Activity {...moduleIconProps} />,
    roles: ["admin_global", "noc_operator", "client_viewer", "dev"],
    categories: [
      {
        id: "dashboards",
        label: "Painéis de Controle",
        roles: ["admin_global", "noc_operator", "client_viewer", "dev"],
        items: [
          {
            id: "dashboard-general",
            label: "Dashboard Geral",
            path: "/dashboard",
            icon: <LayoutDashboard {...iconProps} />,
            flagKey: "module_dashboard",
            roles: ["admin_global", "noc_operator", "client_viewer", "dev"],
          },
          {
            id: "dashboard-executive",
            label: "Dashboard Executivo",
            path: "/executive-dashboard",
            icon: <TrendingUp {...iconProps} />,
            flagKey: "module_executive_dashboard",
            roles: ["admin_global", "noc_operator", "dev"],
          },
          {
            id: "client-portal",
            label: "Portal do Cliente",
            path: "/client-portal",
            icon: <Users {...iconProps} />,
            flagKey: "module_client_portal",
            roles: ["admin_global", "noc_operator", "dev"],
          },
          {
            id: "status-page",
            label: "Status Page",
            path: "/status-page-admin",
            icon: <Globe {...iconProps} />,
            flagKey: "module_status_page",
            roles: ["admin_global", "noc_operator", "dev"],
          },
        ],
      },
      {
        id: "incidents",
        label: "Incidentes & Alertas",
        icon: <CircleAlert {...iconProps} />,
        badgeKey: "incidents",
        roles: ["admin_global", "noc_operator", "client_viewer", "dev"],
        items: [
          {
            id: "problems",
            label: "Problemas Ativos",
            path: "/dashboard/problems",
            icon: <CircleAlert {...iconProps} />,
            flagKey: "module_zabbix",
            badgeKey: "incidents",
            roles: ["admin_global", "noc_operator", "client_viewer", "dev"],
          },
          {
            id: "events",
            label: "Eventos",
            path: "/dashboard/events",
            icon: <Activity {...iconProps} />,
            flagKey: "module_zabbix",
            roles: ["admin_global", "noc_operator", "client_viewer", "dev"],
          },
          {
            id: "alerts",
            label: "Alertas",
            path: "/dashboard/alerts",
            icon: <Bell {...iconProps} />,
            flagKey: "module_zabbix",
            roles: ["admin_global", "noc_operator", "client_viewer", "dev"],
          },
          {
            id: "push-settings",
            label: "Alertas Push",
            path: "/push-settings",
            icon: <Bell {...iconProps} />,
            flagKey: "module_push",
            roles: ["admin_global", "noc_operator", "client_viewer", "dev"],
          },
          {
            id: "notifications",
            label: "Notificações",
            path: "/notifications",
            icon: <Mail {...iconProps} />,
            flagKey: "module_notifications",
            roles: ["admin_global", "noc_operator", "client_viewer", "dev"],
          },
        ],
      },
      {
        id: "infrastructure",
        label: "Infraestrutura",
        icon: <Server {...iconProps} />,
        roles: ["admin_global", "noc_operator", "client_viewer", "dev"],
        items: [
          {
            id: "devices",
            label: "Dispositivos / Hosts",
            path: "/dashboard/devices",
            prefixMatch: true,
            icon: <Server {...iconProps} />,
            flagKey: "module_devices",
            roles: ["admin_global", "noc_operator", "client_viewer", "dev"],
          },
          {
            id: "graphs",
            label: "Gráficos",
            path: "/dashboard/graphs",
            icon: <BarChart3 {...iconProps} />,
            flagKey: "module_zabbix",
            roles: ["admin_global", "noc_operator", "client_viewer", "dev"],
          },
          {
            id: "system-health",
            label: "System Health",
            path: "/system-health",
            icon: <HeartPulse {...iconProps} />,
            flagKey: "module_system_health",
            roles: ["admin_global", "noc_operator", "client_viewer", "dev"],
          },
          {
            id: "kubernetes",
            label: "Kubernetes",
            path: "/k8s",
            icon: <Sailboat {...iconProps} />,
            flagKey: "module_k8s",
            roles: ["admin_global", "noc_operator", "client_viewer", "dev"],
          },
          {
            id: "assets",
            label: "Ativos (Assets)",
            path: "/assets",
            icon: <Server {...iconProps} />,
            flagKey: "module_assets",
            roles: ["admin_global", "noc_operator", "client_viewer", "dev"],
          },
        ],
      },
    ],
  },

  // ====================================================================
  // Modulo 2: Inteligencia & APM
  // ====================================================================
  {
    id: "intelligence",
    sectionTitle: "Inteligência & APM",
    icon: <TrendingUp {...moduleIconProps} />,
    roles: ["admin_global", "noc_operator", "client_viewer", "dev"],
    categories: [
      {
        id: "sla",
        label: "Disponibilidade & SLA",
        icon: <ShieldCheck {...iconProps} />,
        roles: ["admin_global", "noc_operator", "client_viewer", "dev"],
        items: [
          {
            id: "services",
            label: "Serviços",
            path: "/dashboard/services",
            icon: <Layers {...iconProps} />,
            flagKey: "module_sla",
            roles: ["admin_global", "noc_operator", "client_viewer", "dev"],
          },
          {
            id: "slas",
            label: "SLAs",
            path: "/dashboard/slas",
            icon: <ShieldCheck {...iconProps} />,
            flagKey: "module_sla",
            roles: ["admin_global", "noc_operator", "client_viewer", "dev"],
          },
          {
            id: "sla-dashboard",
            label: "SLA Dashboard",
            path: "/sla-dashboard",
            icon: <Gauge {...iconProps} />,
            flagKey: "module_sla",
            roles: ["admin_global", "noc_operator", "client_viewer", "dev"],
          },
          {
            id: "service-tree",
            label: "Árvore de Serviços",
            path: "/service-tree",
            icon: <GitBranch {...iconProps} />,
            flagKey: "module_sla",
            roles: ["admin_global", "noc_operator", "client_viewer", "dev"],
          },
        ],
      },
      {
        id: "analytics",
        label: "Analytics & IA",
        icon: <TrendingUp {...iconProps} />,
        roles: ["admin_global", "noc_operator", "client_viewer", "dev"],
        items: [
          {
            id: "health-score",
            label: "Health Score",
            path: "/health-score",
            icon: <Activity {...iconProps} />,
            flagKey: "module_system_health",
            roles: ["admin_global", "noc_operator", "client_viewer", "dev"],
          },
          {
            id: "apm",
            label: "APM",
            path: "/apm",
            icon: <Activity {...iconProps} />,
            flagKey: "module_apm",
            roles: ["admin_global", "noc_operator", "client_viewer", "dev"],
          },
          {
            id: "capacity",
            label: "Capacidade",
            path: "/capacity",
            icon: <Gauge {...iconProps} />,
            flagKey: "module_capacity",
            roles: ["admin_global", "noc_operator", "client_viewer", "dev"],
          },
          {
            id: "correlation",
            label: "Correlação",
            path: "/correlation",
            icon: <Layers {...iconProps} />,
            flagKey: "module_correlation",
            roles: ["admin_global", "noc_operator", "dev"],
          },
          {
            id: "ai-anomaly",
            label: "Anomalias (AI)",
            path: "/anomaly-detection",
            icon: <Activity {...iconProps} />,
            flagKey: "module_anomaly",
            roles: ["admin_global", "noc_operator", "dev"],
          },
          {
            id: "predictive-failure",
            label: "Falhas Preditivas",
            path: "/predictive-failure",
            icon: <TrendingDown {...iconProps} />,
            flagKey: "module_predictions",
            roles: ["admin_global", "noc_operator", "dev"],
          },
        ],
      },
      {
        id: "finops",
        label: "FinOps & Custos",
        icon: <DollarSign {...iconProps} />,
        roles: ["admin_global", "noc_operator", "dev"],
        items: [
          {
            id: "finops",
            label: "FinOps & Custos",
            path: "/finops",
            icon: <DollarSign {...iconProps} />,
            flagKey: "module_finops",
            roles: ["admin_global", "noc_operator", "dev"],
          },
        ],
      },
    ],
  },

  // ====================================================================
  // Modulo 3: Operacoes & ITSM
  // ====================================================================
  {
    id: "operations",
    sectionTitle: "Operações & ITSM",
    icon: <Ticket {...moduleIconProps} />,
    roles: ["admin_global", "noc_operator", "client_viewer", "dev"],
    categories: [
      {
        id: "itsm",
        label: "Central de Serviços",
        icon: <Ticket {...iconProps} />,
        badgeKey: "tickets",
        roles: ["admin_global", "noc_operator", "client_viewer", "dev"],
        items: [
          {
            id: "tickets",
            label: "Tickets",
            path: "/tickets",
            icon: <Ticket {...iconProps} />,
            flagKey: "module_tickets",
            badgeKey: "tickets",
            roles: ["admin_global", "noc_operator", "client_viewer", "dev"],
          },
          {
            id: "changes",
            label: "Mudanças",
            path: "/changes",
            icon: <GitPullRequestArrow {...iconProps} />,
            flagKey: "module_changes",
            roles: ["admin_global", "noc_operator", "client_viewer", "dev"],
          },
          {
            id: "itsm-connectors",
            label: "Conectores ITSM",
            path: "/itsm",
            icon: <Plug {...iconProps} />,
            flagKey: "module_itsm",
            roles: ["admin_global", "noc_operator", "dev"],
          },
        ],
      },
      {
        id: "ops-routine",
        label: "Rotina Operacional",
        icon: <Clock {...iconProps} />,
        badgeKey: "tasks",
        roles: ["admin_global", "noc_operator", "client_viewer", "dev"],
        items: [
          {
            id: "maintenance",
            label: "Manutenção",
            path: "/dashboard/maintenance",
            icon: <Wrench {...iconProps} />,
            flagKey: "module_zabbix",
            roles: ["admin_global", "noc_operator", "client_viewer", "dev"],
          },
          {
            id: "scheduled-tasks",
            label: "Tarefas Agendadas",
            path: "/scheduled-tasks",
            icon: <Clock {...iconProps} />,
            flagKey: "module_tasks",
            badgeKey: "tasks",
            roles: ["admin_global", "noc_operator", "client_viewer", "dev"],
          },
          {
            id: "escalation",
            label: "Escalonamento",
            path: "/escalation",
            icon: <Flame {...iconProps} />,
            flagKey: "module_escalation",
            roles: ["admin_global", "noc_operator", "dev"],
          },
          {
            id: "workflows",
            label: "Workflows",
            path: "/workflows",
            icon: <Workflow {...iconProps} />,
            flagKey: "module_workflows",
            roles: ["admin_global", "noc_operator", "dev"],
          },
          {
            id: "chatops",
            label: "ChatOps",
            path: "/chatops",
            icon: <MessageSquare {...iconProps} />,
            flagKey: "module_chatops",
            roles: ["admin_global", "noc_operator", "dev"],
          },
          {
            id: "knowledge-base",
            label: "Base de Conhecimento",
            path: "/knowledge-base",
            icon: <BookOpen {...iconProps} />,
            flagKey: "module_kb",
            roles: ["admin_global", "noc_operator", "client_viewer", "dev"],
          },
        ],
      },
      {
        id: "governance",
        label: "Governança & Contratos",
        icon: <FileText {...iconProps} />,
        roles: ["admin_global", "noc_operator", "dev"],
        items: [
          {
            id: "reports",
            label: "Relatórios",
            path: "/reports",
            icon: <FileText {...iconProps} />,
            flagKey: "module_reports",
            roles: ["admin_global", "noc_operator", "client_viewer", "dev"],
          },
          {
            id: "contracts",
            label: "Contratos & Horas",
            path: "/contracts",
            icon: <FileClock {...iconProps} />,
            roles: ["admin_global", "noc_operator", "dev"],
          },
          {
            id: "config-drift",
            label: "Config Drift",
            path: "/config-drift",
            icon: <GitCompareArrows {...iconProps} />,
            flagKey: "module_drift",
            roles: ["admin_global", "noc_operator", "dev"],
          },
        ],
      },
    ],
  },

  // ====================================================================
  // Modulo 4: Gestao Zabbix & Admin (admin_global, dev)
  // ====================================================================
  {
    id: "zabbix_core",
    sectionTitle: "Gestão Zabbix & Admin",
    icon: <Settings {...moduleIconProps} />,
    roles: ["admin_global", "dev"],
    categories: [
      {
        id: "zabbix-provisioning",
        label: "Provisionamento Core Zabbix",
        icon: <Server {...iconProps} />,
        roles: ["admin_global", "dev"],
        items: [
          {
            id: "host-groups",
            label: "Grupos de Hosts",
            path: "/dashboard/host-groups",
            icon: <Users {...iconProps} />,
            flagKey: "module_zabbix",
            roles: ["admin_global", "dev"],
          },
          {
            id: "templates",
            label: "Templates",
            path: "/dashboard/templates",
            icon: <FileStack {...iconProps} />,
            flagKey: "module_zabbix",
            roles: ["admin_global", "dev"],
          },
          {
            id: "zabbix-users",
            label: "Usuários Zabbix",
            path: "/dashboard/users",
            icon: <UserRound {...iconProps} />,
            flagKey: "module_zabbix",
            roles: ["admin_global", "dev"],
          },
          {
            id: "actions",
            label: "Ações",
            path: "/dashboard/actions",
            icon: <Zap {...iconProps} />,
            flagKey: "module_zabbix",
            roles: ["admin_global", "dev"],
          },
          {
            id: "proxies",
            label: "Proxies",
            path: "/dashboard/proxies",
            icon: <Network {...iconProps} />,
            flagKey: "module_zabbix",
            roles: ["admin_global", "dev"],
          },
          {
            id: "discovery",
            label: "Discovery",
            path: "/dashboard/discovery",
            icon: <Radar {...iconProps} />,
            flagKey: "module_zabbix",
            roles: ["admin_global", "dev"],
          },
          {
            id: "auto-discovery",
            label: "Auto-Discovery",
            path: "/auto-discovery",
            icon: <Radar {...iconProps} />,
            flagKey: "module_discovery",
            roles: ["admin_global", "dev"],
          },
          {
            id: "zabbix-reports",
            label: "Relatórios Zabbix",
            path: "/dashboard/reports",
            icon: <FileBarChart {...iconProps} />,
            flagKey: "module_zabbix",
            roles: ["admin_global", "dev"],
          },
          {
            id: "trends",
            label: "Histórico de Tendências",
            path: "/dashboard/trends",
            icon: <TrendingUp {...iconProps} />,
            flagKey: "module_zabbix",
            roles: ["admin_global", "dev"],
          },
          {
            id: "audit-log",
            label: "Auditoria (Audit Log)",
            path: "/dashboard/audit-log",
            icon: <ScrollText {...iconProps} />,
            flagKey: "module_zabbix",
            roles: ["admin_global", "dev"],
          },
          {
            id: "connectors",
            label: "Conectores Zabbix",
            path: "/dashboard/connectors",
            icon: <Plug {...iconProps} />,
            flagKey: "module_zabbix",
            roles: ["admin_global", "dev"],
          },
          {
            id: "zabbix-server",
            label: "Servidor Zabbix",
            path: "https://zabbix.jlinformatica.com.br",
            external: true,
            icon: <Globe {...iconProps} />,
            roles: ["admin_global", "dev"],
          },
        ],
      },
      {
        id: "tenant-admin",
        label: "Administração do Tenant",
        icon: <Settings {...iconProps} />,
        roles: ["admin_global", "dev"],
        items: [
          {
            id: "admin-global",
            label: "Admin Global",
            path: "/admin",
            icon: <Settings {...iconProps} />,
            flagKey: "module_admin",
            roles: ["admin_global", "dev"],
          },
          {
            id: "system-users",
            label: "Gestão de Usuários (Sistema)",
            path: "/admin/users",
            icon: <UserCog {...iconProps} />,
            flagKey: "module_admin",
            roles: ["admin_global", "dev"],
          },
          {
            id: "onboarding",
            label: "Onboarding",
            path: "/admin/onboarding",
            icon: <UserPlus {...iconProps} />,
            flagKey: "module_admin",
            roles: ["admin_global", "dev"],
          },
          {
            id: "modules",
            label: "Módulos",
            path: "/settings/modules",
            icon: <Puzzle {...iconProps} />,
            flagKey: "module_settings",
            roles: ["admin_global", "dev"],
          },
          {
            id: "modules-client",
            label: "Módulos (Cliente)",
            path: "/settings/modules-client",
            icon: <Puzzle {...iconProps} />,
            flagKey: "module_settings",
            roles: ["admin_global", "dev"],
          },
          {
            id: "tenant-config",
            label: "Config do Tenant",
            path: "/settings",
            icon: <UserCog {...iconProps} />,
            flagKey: "module_settings",
            roles: ["admin_global", "dev"],
          },
          {
            id: "white-label",
            label: "Customização Visual (White-label)",
            path: "/white-label",
            icon: <Palette {...iconProps} />,
            flagKey: "module_settings",
            roles: ["admin_global", "dev"],
          },
        ],
      },
    ],
  },

  // ====================================================================
  // Modulo 5: Seguranca & Compliance
  // ====================================================================
  {
    id: "secops",
    sectionTitle: "Segurança & Compliance",
    icon: <Shield {...moduleIconProps} />,
    roles: ["admin_global", "noc_operator", "client_viewer", "dev"],
    categories: [
      {
        id: "security-posture",
        label: "Postura de Segurança",
        icon: <Shield {...iconProps} />,
        roles: ["admin_global", "noc_operator", "dev"],
        items: [
          {
            id: "firewall",
            label: "Firewall",
            path: "/firewall",
            icon: <Flame {...iconProps} />,
            flagKey: "module_firewall",
            roles: ["admin_global", "noc_operator", "dev"],
          },
          {
            id: "ssl",
            label: "Certificados SSL",
            path: "/ssl",
            icon: <Lock {...iconProps} />,
            flagKey: "module_ssl",
            roles: ["admin_global", "noc_operator", "dev"],
          },
          {
            id: "mfa",
            label: "Autenticação MFA",
            path: "/security/mfa",
            icon: <KeyRound {...iconProps} />,
            flagKey: "module_mfa",
            roles: ["admin_global", "noc_operator", "client_viewer", "dev"],
          },
          {
            id: "patch-management",
            label: "Patch Management",
            path: "/patches",
            icon: <Shield {...iconProps} />,
            flagKey: "module_patches",
            roles: ["admin_global", "noc_operator", "dev"],
          },
        ],
      },
      {
        id: "audit-protection",
        label: "Auditoria & Proteção",
        icon: <ScrollText {...iconProps} />,
        roles: ["admin_global", "noc_operator", "client_viewer", "dev"],
        items: [
          {
            id: "log-audit",
            label: "Auditoria de Logs",
            path: "/security/audit",
            icon: <ScrollText {...iconProps} />,
            flagKey: "module_audit",
            roles: ["admin_global", "noc_operator", "dev"],
          },
          {
            id: "security-audit",
            label: "Auditoria de Segurança",
            path: "/security-audit",
            icon: <ShieldCheck {...iconProps} />,
            flagKey: "module_security_audit",
            roles: ["admin_global", "dev"],
          },
          {
            id: "compliance",
            label: "Conformidade (Compliance)",
            path: "/compliance",
            icon: <CheckCircle2 {...iconProps} />,
            flagKey: "module_compliance",
            roles: ["admin_global", "noc_operator", "client_viewer", "dev"],
          },
          {
            id: "lgpd",
            label: "Governança de Dados (LGPD)",
            path: "/lgpd",
            icon: <FileText {...iconProps} />,
            flagKey: "module_lgpd",
            roles: ["admin_global", "noc_operator", "dev"],
          },
          {
            id: "backups",
            label: "Backups",
            path: "/backups",
            icon: <ArrowLeftRight {...iconProps} />,
            flagKey: "module_backup",
            roles: ["admin_global", "noc_operator", "client_viewer", "dev"],
          },
        ],
      },
    ],
  },

  // ====================================================================
  // Modulo 6: Ferramentas de Desenvolvimento (dev apenas)
  // ====================================================================
  {
    id: "devtools",
    sectionTitle: "Ferramentas de Dev",
    icon: <Code2 {...moduleIconProps} />,
    roles: ["dev"],
    categories: [
      {
        id: "devtools-all",
        label: "DevTools",
        icon: <Code2 {...iconProps} />,
        roles: ["dev"],
        items: [
          {
            id: "api-keys",
            label: "API Keys",
            path: "/api-keys",
            icon: <KeyRound {...iconProps} />,
            flagKey: "module_api_keys",
            roles: ["dev"],
          },
          {
            id: "webhooks",
            label: "Webhooks",
            path: "/webhooks",
            icon: <Network {...iconProps} />,
            flagKey: "module_webhooks",
            roles: ["dev"],
          },
          {
            id: "feature-flags",
            label: "Feature Flags",
            path: "/feature-flags",
            icon: <Flag {...iconProps} />,
            flagKey: "module_feature_flags",
            roles: ["dev"],
          },
          {
            id: "marketplace",
            label: "Marketplace",
            path: "/marketplace",
            icon: <Store {...iconProps} />,
            flagKey: "module_marketplace",
            roles: ["dev"],
          },
          {
            id: "logs",
            label: "Logs do Sistema",
            path: "/logs",
            icon: <Scroll {...iconProps} />,
            flagKey: "module_logs",
            roles: ["dev"],
          },
          {
            id: "traces",
            label: "Rastreamento (Traces)",
            path: "/traces",
            icon: <Activity {...iconProps} />,
            flagKey: "module_traces",
            roles: ["dev"],
          },
          {
            id: "automation",
            label: "Automação",
            path: "/automation",
            prefixMatch: true,
            icon: <Code2 {...iconProps} />,
            flagKey: "module_scripts",
            roles: ["dev"],
          },
          {
            id: "sql-console",
            label: "Console SQL",
            path: "/sql-console",
            icon: <Database {...iconProps} />,
            roles: ["dev"],
          },
          {
            id: "data-transfer",
            label: "Data Transfer",
            path: "/data-transfer",
            icon: <ArrowLeftRight {...iconProps} />,
            flagKey: "module_data_transfer",
            roles: ["dev"],
          },
          {
            id: "error-reports",
            label: "Relatórios de Erro",
            path: "/admin/error-reports",
            icon: <ErrorReportIcon {...iconProps} />,
            flagKey: "module_admin",
            roles: ["dev"],
          },
        ],
      },
    ],
  },
];

// --- Itens do rodape (perfil do utilizador) ---

export const SIDEBAR_FOOTER_ITEMS: SidebarItem[] = [
  {
    id: "profile",
    label: "Meu Perfil",
    path: "/profile",
    icon: <UserRound {...iconProps} />,
    flagKey: "module_profile",
    roles: ["admin_global", "noc_operator", "client_viewer", "dev"],
  },
  {
    id: "sessions",
    label: "Sessões & Segurança",
    path: "/sessions",
    icon: <ShieldCheck {...iconProps} />,
    flagKey: "module_auth",
    roles: ["admin_global", "noc_operator", "client_viewer", "dev"],
  },
];
