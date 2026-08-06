// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { sanitizeUrl } from "@/lib/sanitize-url";
import {
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  X,
  Menu,
} from "lucide-react";
import { LogoutButton } from "@/components/logout-button";
import { ZabbixPingIndicator } from "@/components/zabbix-ping-indicator";
import { useModuleFlags } from "@/lib/use-module-flags";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  flagKey?: string;
  external?: boolean;
  tooltip?: string;
}

interface NavSection {
  title: string;
  icon: React.ReactNode;
  items: NavItem[];
}

function isActive(pathname: string | null, item: NavItem): boolean {
  if (!pathname) return false;
  if (item.href === "/dashboard")
    return (
      pathname === "/dashboard" ||
      pathname.startsWith("/dashboard/devices") ||
      pathname.startsWith("/dashboard/problems") ||
      pathname.startsWith("/dashboard/events") ||
      pathname.startsWith("/dashboard/graphs") ||
      pathname.startsWith("/dashboard/host-groups") ||
      pathname.startsWith("/dashboard/templates") ||
      pathname.startsWith("/dashboard/triggers")
    );
  return pathname === item.href;
}

function sectionHasActive(
  section: NavSection,
  pathname: string | null,
): boolean {
  return section.items.some((item) => isActive(pathname, item));
}

// Ícones reutilizáveis (SVG inline 16x16)
const icon = (paths: string) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d={paths} />
  </svg>
);

const iconMulti = (children: React.ReactNode) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
);

const CLIENT_NAV_SECTIONS: NavSection[] = [
  {
    title: "Meu Ambiente",
    icon: iconMulti(
      <>
        <rect width="7" height="9" x="3" y="3" rx="1" />
        <rect width="7" height="5" x="14" y="3" rx="1" />
        <rect width="7" height="9" x="14" y="12" rx="1" />
        <rect width="7" height="5" x="3" y="16" rx="1" />
      </>,
    ),
    items: [
      {
        label: "Dashboard",
        href: "/dashboard",
        tooltip: "Visão geral do seu ambiente com indicadores e gráficos",
        icon: iconMulti(
          <>
            <rect width="7" height="9" x="3" y="3" rx="1" />
            <rect width="7" height="5" x="14" y="3" rx="1" />
            <rect width="7" height="9" x="14" y="12" rx="1" />
            <rect width="7" height="5" x="3" y="16" rx="1" />
          </>,
        ),
      },
      {
        label: "Problemas",
        href: "/dashboard/problems",
        tooltip: "Alertas e problemas ativos nos seus dispositivos",
        icon: icon(
          "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z M12 9v4 M12 17h.01",
        ),
      },
      {
        label: "Eventos",
        href: "/dashboard/events",
        tooltip: "Histórico de eventos e ocorrências do sistema",
        icon: iconMulti(
          <>
            <path d="M8 2v4" />
            <path d="M16 2v4" />
            <rect width="18" height="18" x="3" y="4" rx="2" />
            <path d="M3 10h18" />
          </>,
        ),
      },
      {
        label: "Dispositivos",
        href: "/dashboard/devices",
        tooltip: "Lista de servidores, equipamentos e dispositivos monitorados",
        icon: iconMulti(
          <>
            <rect width="20" height="14" x="2" y="3" rx="2" />
            <line x1="8" x2="16" y1="21" y2="21" />
            <line x1="12" x2="12" y1="17" y2="21" />
          </>,
        ),
      },
      {
        label: "Gráficos",
        href: "/dashboard/graphs",
        tooltip:
          "Visualize gráficos de desempenho e métricas dos seus dispositivos",
        icon: iconMulti(
          <>
            <path d="M3 3v18h18" />
            <path d="m19 9-5 5-4-4-3 3" />
          </>,
        ),
      },
      {
        label: "Saúde do Sistema",
        href: "/system-health",
        tooltip: "Indicadores de saúde e disponibilidade dos seus serviços",
        flagKey: "module_system_health",
        icon: icon("M22 12h-4l-3 9L9 3l-3 9H2"),
      },
      {
        label: "Score de Saúde",
        href: "/health-score",
        tooltip:
          "Nota geral de saúde do seu ambiente baseada em múltiplos fatores",
        icon: icon("M22 12h-4l-3 9L9 3l-3 9H2"),
      },
    ],
  },
  {
    title: "Suporte",
    icon: iconMulti(
      <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />,
    ),
    items: [
      {
        label: "Chamados",
        href: "/tickets",
        tooltip: "Abra e acompanhe chamados de suporte técnico",
        flagKey: "module_tickets",
        icon: iconMulti(
          <>
            <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
            <path d="M13 5v2" />
            <path d="M13 17v2" />
            <path d="M13 11v2" />
          </>,
        ),
      },
      {
        label: "Base de Conhecimento",
        href: "/knowledge-base",
        tooltip: "Artigos, tutoriais e documentação para ajudar você",
        flagKey: "module_kb",
        icon: iconMulti(
          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />,
        ),
      },
      {
        label: "SLA",
        href: "/sla-dashboard",
        tooltip: "Acompanhe os acordos de nível de serviço e seus indicadores",
        flagKey: "module_sla",
        icon: iconMulti(
          <>
            <path d="M12 2v4" />
            <path d="m6 6 3 3" />
            <path d="M18 6l-3 3" />
            <path d="M2 12h4" />
            <path d="M18 12h4" />
            <path d="M12 18v4" />
            <path d="m6 18 3-3" />
            <path d="m18 18-3-3" />
            <circle cx="12" cy="12" r="2" />
          </>,
        ),
      },
      {
        label: "Mudanças",
        href: "/changes",
        tooltip: "Solicite e acompanhe mudanças no seu ambiente",
        flagKey: "module_changes",
        icon: iconMulti(
          <>
            <path d="M12 2v4" />
            <path d="M12 18v4" />
            <path d="M4.93 4.93l2.83 2.83" />
            <path d="M16.24 16.24l2.83 2.83" />
            <path d="M2 12h4" />
            <path d="M18 12h4" />
            <path d="M4.93 19.07l2.83-2.83" />
            <path d="M16.24 7.76l2.83-2.83" />
          </>,
        ),
      },
    ],
  },
  {
    title: "Infraestrutura",
    icon: iconMulti(
      <>
        <rect width="20" height="14" x="2" y="3" rx="2" />
        <line x1="8" x2="16" y1="21" y2="21" />
        <line x1="12" x2="12" y1="17" y2="21" />
      </>,
    ),
    items: [
      {
        label: "Ativos",
        href: "/assets",
        tooltip: "Inventário completo de equipamentos e ativos de TI",
        flagKey: "module_assets",
        icon: iconMulti(
          <>
            <path d="M20 7h-9" />
            <path d="M14 17H5" />
            <circle cx="17" cy="17" r="3" />
            <circle cx="7" cy="7" r="3" />
          </>,
        ),
      },
      {
        label: "Backups",
        href: "/backups",
        tooltip: "Gerencie cópias de segurança e restaurações",
        flagKey: "module_backup",
        icon: iconMulti(
          <>
            <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
          </>,
        ),
      },
      {
        label: "Certificados SSL",
        href: "/ssl",
        tooltip: "Gerencie certificados de segurança dos seus sites",
        flagKey: "module_ssl",
        icon: iconMulti(
          <>
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </>,
        ),
      },
      {
        label: "Capacidade",
        href: "/capacity",
        tooltip: "Planejamento de capacidade de storage, CPU e memória",
        flagKey: "module_capacity",
        icon: iconMulti(
          <>
            <path d="M3 3v18h18" />
            <path d="M7 16v-5" />
            <path d="M12 16v-10" />
            <path d="M17 16v-3" />
          </>,
        ),
      },
      {
        label: "Auto-Descoberta",
        href: "/auto-discovery",
        tooltip: "Descoberta automática de novos dispositivos na rede",
        flagKey: "module_discovery",
        icon: iconMulti(
          <>
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
            <path d="M11 8v6" />
            <path d="M8 11h6" />
          </>,
        ),
      },
    ],
  },
  {
    title: "Inteligência",
    icon: iconMulti(
      <>
        <path d="M12 2a10 10 0 1 0 10 10 10 10 0 0 0-10-10z" />
        <path d="M12 6v6l4 2" />
      </>,
    ),
    items: [
      {
        label: "Dashboard Executivo",
        href: "/executive-dashboard",
        tooltip: "Visão executiva com KPIs de negócio e resumo gerencial",
        flagKey: "module_executive_dashboard",
        icon: iconMulti(
          <>
            <rect width="18" height="18" x="3" y="3" rx="2" />
            <path d="M3 9h18" />
            <path d="M9 21V9" />
          </>,
        ),
      },
      {
        label: "Anomalias IA",
        href: "/anomaly-detection",
        tooltip: "Detecção automática de comportamentos anormais com IA",
        flagKey: "module_anomaly",
        icon: iconMulti(
          <>
            <path d="M12 2v4" />
            <path d="M12 18v4" />
            <path d="M4.93 4.93l2.83 2.83" />
            <path d="M16.24 16.24l2.83 2.83" />
            <path d="M2 12h4" />
            <path d="M18 12h4" />
            <path d="M4.93 19.07l2.83-2.83" />
            <path d="M16.24 7.76l2.83-2.83" />
          </>,
        ),
      },
      {
        label: "Predições",
        href: "/predictive-failure",
        tooltip: "Previsão de falhas antes que aconteçam, com IA",
        flagKey: "module_predictions",
        icon: iconMulti(<path d="M22 12h-4l-3 9L9 3l-3 9H2" />),
      },
      {
        label: "Correlação",
        href: "/correlation",
        tooltip: "Correlação de eventos para identificar causas raiz",
        flagKey: "module_correlation",
        icon: iconMulti(
          <>
            <circle cx="6" cy="6" r="3" />
            <circle cx="18" cy="18" r="3" />
            <path d="M6 9v6" />
            <path d="M18 15V9" />
            <path d="M9 6h6" />
            <path d="M15 18H9" />
          </>,
        ),
      },
      {
        label: "Drift de Config",
        href: "/config-drift",
        tooltip: "Detecta mudanças não autorizadas na configuração",
        flagKey: "module_drift",
        icon: iconMulti(<path d="M3 12h4l3 8 4-16 3 8h4" />),
      },
      {
        label: "Logs",
        href: "/logs",
        tooltip: "Busca e análise de logs do sistema",
        flagKey: "module_logs",
        icon: iconMulti(
          <>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
            <path d="M16 13H8" />
            <path d="M16 17H8" />
            <path d="M10 9H8" />
          </>,
        ),
      },
      {
        label: "Traces",
        href: "/traces",
        tooltip: "Rastreamento distribuído de requisições entre serviços",
        flagKey: "module_traces",
        icon: iconMulti(<path d="M3 12h4l3 8 4-16 3 8h4" />),
      },
      {
        label: "APM",
        href: "/apm",
        tooltip: "Monitoramento de performance de aplicações",
        flagKey: "module_apm",
        icon: iconMulti(
          <>
            <path d="M3 3v18h18" />
            <path d="m19 9-5 5-4-4-3 3" />
          </>,
        ),
      },
      {
        label: "Relatórios",
        href: "/reports",
        tooltip: "Relatórios agendados e exportação de dados",
        flagKey: "module_reports",
        icon: iconMulti(
          <>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
            <path d="M16 13H8" />
            <path d="M16 17H8" />
            <path d="M10 9H8" />
          </>,
        ),
      },
      {
        label: "FinOps",
        href: "/finops",
        tooltip: "Gestão financeira de TI — custos de cloud e infraestrutura",
        flagKey: "module_finops",
        icon: iconMulti(
          <>
            <line x1="12" x2="12" y1="2" y2="22" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </>,
        ),
      },
    ],
  },
  {
    title: "Automação",
    icon: iconMulti(
      <>
        <path d="M12 2v4" />
        <path d="M12 18v4" />
        <path d="M4.93 4.93l2.83 2.83" />
        <path d="M16.24 16.24l2.83 2.83" />
        <path d="M2 12h4" />
        <path d="M18 12h4" />
        <path d="M4.93 19.07l2.83-2.83" />
        <path d="M16.24 7.76l2.83-2.83" />
      </>,
    ),
    items: [
      {
        label: "Tarefas Agendadas",
        href: "/scheduled-tasks",
        tooltip: "Tarefas automáticas e cron jobs do sistema",
        flagKey: "module_tasks",
        icon: iconMulti(
          <>
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </>,
        ),
      },
      {
        label: "Workflows",
        href: "/workflows",
        tooltip: "Crie fluxos de automação entre sistemas",
        flagKey: "module_workflows",
        icon: iconMulti(
          <>
            <rect width="18" height="18" x="3" y="3" rx="2" />
            <path d="M9 3v18" />
            <path d="M15 3v18" />
          </>,
        ),
      },
      {
        label: "Webhooks",
        href: "/webhooks",
        tooltip:
          "Integrações que enviam dados automaticamente para outros sistemas",
        flagKey: "module_webhooks",
        icon: iconMulti(
          <>
            <path d="M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2" />
            <path d="m6.17 17.83-5.7 5.7" />
            <path d="M12 16.98v-3.3c0-1.1.94-1.94 1.9-2.48A4 4 0 0 0 14 6.8c-.7 0-1.4.2-2 .57" />
            <path d="M8.17 5.83l5.7-5.7" />
            <circle cx="6" cy="6" r="3" />
            <circle cx="18" cy="18" r="3" />
          </>,
        ),
      },
      {
        label: "Notificações",
        href: "/notifications",
        tooltip: "Central de notificações e alertas do sistema",
        flagKey: "module_notifications",
        icon: iconMulti(
          <>
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </>,
        ),
      },
      {
        label: "Notificações Push",
        href: "/push-settings",
        tooltip: "Configurar alertas push no navegador e dispositivos",
        flagKey: "module_push",
        icon: iconMulti(
          <>
            <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0 1 18 14.158V11a6.002 6.002 0 0 0-4-5.659V5a2 2 0 1 0-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5" />
            <path d="M10 21a2 2 0 0 0 4 0" />
          </>,
        ),
      },
      {
        label: "ChatOps",
        href: "/chatops",
        tooltip: "Integração com Slack, Teams e outras plataformas de chat",
        flagKey: "module_chatops",
        icon: iconMulti(
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
        ),
      },
    ],
  },
  {
    title: "Integrações",
    icon: iconMulti(
      <>
        <path d="M4 7h16" />
        <path d="M4 17h16" />
        <path d="M4 12h16" />
        <circle cx="8" cy="7" r="2" />
        <circle cx="16" cy="17" r="2" />
      </>,
    ),
    items: [
      {
        label: "Chaves de API",
        href: "/api-keys",
        tooltip: "Gerencie chaves de acesso para integrações via API",
        flagKey: "module_api_keys",
        icon: iconMulti(
          <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />,
        ),
      },
      {
        label: "ITSM",
        href: "/itsm",
        tooltip:
          "Integração com sistemas de gestão de TI (ServiceNow, Jira, etc)",
        flagKey: "module_itsm",
        icon: iconMulti(
          <>
            <path d="M3 3v18h18" />
            <path d="M7 16v-5" />
            <path d="M12 16v-10" />
            <path d="M17 16v-3" />
          </>,
        ),
      },
      {
        label: "Marketplace",
        href: "/marketplace",
        tooltip: "Extensões e add-ons para expandir o sistema",
        flagKey: "module_marketplace",
        icon: iconMulti(
          <>
            <path d="M3 3v18h18" />
            <path d="M7 16v-5" />
            <path d="M12 16v-10" />
            <path d="M17 16v-3" />
          </>,
        ),
      },
      {
        label: "Transferência de Dados",
        href: "/data-transfer",
        tooltip: "Exportação e migração de dados entre sistemas",
        flagKey: "module_data_transfer",
        icon: iconMulti(
          <>
            <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
          </>,
        ),
      },
      {
        label: "Página de Status",
        href: "/status",
        tooltip: "Página pública de status dos seus serviços",
        flagKey: "module_status_page",
        icon: iconMulti(
          <>
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </>,
        ),
      },
    ],
  },
  {
    title: "Conformidade",
    icon: iconMulti(
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1Z" />,
    ),
    items: [
      {
        label: "Auditoria",
        href: "/compliance",
        tooltip: "Relatórios de conformidade e auditoria de segurança",
        flagKey: "module_compliance",
        icon: iconMulti(
          <>
            <path d="M9 12l2 2 4-4" />
            <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1Z" />
          </>,
        ),
      },
    ],
  },
  {
    title: "Conta",
    icon: iconMulti(
      <>
        <circle cx="12" cy="8" r="5" />
        <path d="M20 21a8 8 0 0 0-16 0" />
      </>,
    ),
    items: [
      {
        label: "Meu Perfil",
        href: "/profile",
        tooltip: "Edite seus dados pessoais e preferências",
        flagKey: "module_profile",
        icon: iconMulti(
          <>
            <circle cx="12" cy="8" r="5" />
            <path d="M20 21a8 8 0 0 0-16 0" />
          </>,
        ),
      },
      {
        label: "Sessões & Segurança",
        href: "/sessions",
        tooltip: "Gerencie sessões ativas, MFA e segurança da sua conta",
        flagKey: "module_auth",
        icon: iconMulti(
          <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1Z" />,
        ),
      },
      {
        label: "Meus Módulos",
        href: "/settings/modules-client",
        tooltip: "Ative ou desative os módulos disponíveis para você",
        icon: iconMulti(
          <>
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <path d="M3.27 6.96 12 12.01l8.73-5.05" />
            <path d="M12 22.08V12" />
          </>,
        ),
      },
    ],
  },
];

function LogoMark({ size }: Readonly<{ size: number }>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className="shrink-0"
    >
      <path
        d="M8 22V10M8 10L14 16M8 10L2 16"
        stroke="var(--brand-primary)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="translate(4 0)"
      />
      <path
        d="M20 10V22M20 22L26 16M20 22L14 16"
        stroke="var(--brand-secondary)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="translate(-2 0)"
      />
      <circle cx="16" cy="16" r="2" fill="var(--brand-primary)" />
    </svg>
  );
}

export function ClientSidebar() {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState("");
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    new Set(),
  );
  const searchRef = useRef<HTMLInputElement>(null);
  const pathname = usePathname();
  const { isClientModuleEnabled, isLoading: flagsLoading } = useModuleFlags();

  const sidebarWidth = collapsed ? "w-16" : "w-64";

  const filteredSections = useMemo(() => {
    const flagFiltered = CLIENT_NAV_SECTIONS.map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => !item.flagKey || isClientModuleEnabled(item.flagKey),
      ),
    })).filter((section) => section.items.length > 0);

    if (!query.trim()) return flagFiltered;
    const q = query.toLowerCase();
    return flagFiltered
      .map((section) => ({
        ...section,
        items: section.items.filter((item) =>
          item.label.toLowerCase().includes(q),
        ),
      }))
      .filter((section) => section.items.length > 0);
  }, [query, isClientModuleEnabled]);

  const isSearching = query.trim().length > 0;

  function toggleSection(title: string) {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }

  function isSectionExpanded(section: NavSection): boolean {
    if (isSearching) return true;
    if (sectionHasActive(section, pathname)) return true;
    return !collapsedSections.has(section.title);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed top-3 left-3 z-50 rounded-lg p-2 transition-colors md:hidden"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border-default)",
          color: "var(--text-primary)",
        }}
        aria-label="Toggle sidebar"
      >
        {open ? <X size={18} /> : <Menu size={18} />}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-30 md:hidden"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
          aria-label="Fechar menu"
        />
      )}

      <aside
        className={`fixed md:sticky md:top-0 z-40 ${sidebarWidth} flex flex-col shrink-0 transition-all duration-300 h-screen ${open ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
        style={{
          borderRight: "1px solid var(--border-subtle)",
          background: "var(--surface-1)",
        }}
      >
        <div
          className={`flex items-center justify-between ${collapsed ? "px-2" : "px-4"} pt-5 pb-3`}
        >
          <div
            className={`flex items-center gap-2.5 ${collapsed ? "md:hidden" : ""}`}
          >
            <div className="relative">
              <div
                className="absolute inset-0 rounded-lg"
                style={{
                  background:
                    "radial-gradient(circle, var(--brand-glow) 0%, transparent 70%)",
                  filter: "blur(4px)",
                }}
              />
              <div className="relative">
                <LogoMark size={26} />
              </div>
            </div>
            <div className="min-w-0">
              <h2
                className="text-sm font-bold tracking-tight"
                style={{ color: "var(--brand-primary)" }}
              >
                JLMIRROR
              </h2>
              <p
                className="text-[10px] truncate tracking-wide"
                style={{ color: "var(--text-muted)" }}
              >
                Portal do Cliente
              </p>
            </div>
          </div>

          <div
            className={`hidden md:flex items-center justify-center ${collapsed ? "" : "md:hidden"}`}
          >
            <LogoMark size={26} />
          </div>

          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="hidden md:flex items-center justify-center rounded-lg p-1.5 transition-all shrink-0 hover:scale-105"
            style={{
              background: collapsed ? "var(--brand-glow)" : "transparent",
              border: "1px solid var(--border-default)",
              color: collapsed ? "var(--brand-primary)" : "var(--text-muted)",
              cursor: "pointer",
            }}
            aria-label={collapsed ? "Expandir sidebar" : "Recolher sidebar"}
            title={collapsed ? "Expandir" : "Recolher"}
          >
            {collapsed ? (
              <PanelLeftOpen size={14} />
            ) : (
              <PanelLeftClose size={14} />
            )}
          </button>
        </div>

        {!collapsed && (
          <div className="px-3 pb-3">
            <div
              className="relative flex items-center rounded-lg transition-all"
              style={{
                background: "var(--surface-0)",
                border: "1px solid var(--border-default)",
              }}
            >
              <Search
                size={14}
                className="absolute left-2.5 shrink-0 pointer-events-none"
                style={{ color: "var(--text-muted)" }}
              />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar..."
                className="w-full bg-transparent pl-8 pr-7 py-2 text-xs font-medium outline-none"
                style={{ color: "var(--text-primary)" }}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-1.5 rounded p-0.5 transition-colors"
                  style={{ color: "var(--text-muted)" }}
                  aria-label="Limpar busca"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 pb-2 sidebar-nav-scroll">
          {flagsLoading && (
            <div
              className="px-3 py-8 text-center text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              Carregando módulos...
            </div>
          )}
          {!flagsLoading && filteredSections.length === 0 && (
            <div
              className="px-3 py-8 text-center text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              Nenhum resultado para "{query}"
            </div>
          )}
          {!flagsLoading &&
            filteredSections.map((section) => {
              const expanded = isSectionExpanded(section);
              const hasActive = sectionHasActive(section, pathname);
              return (
                <div key={section.title} className="mb-1">
                  {!collapsed && (
                    <button
                      type="button"
                      onClick={() => toggleSection(section.title)}
                      className="flex items-center gap-1.5 w-full px-3 pt-3 pb-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors group"
                      style={{
                        color: hasActive
                          ? "var(--brand-secondary)"
                          : "var(--text-muted)",
                      }}
                    >
                      <span className="shrink-0 opacity-70">
                        {section.icon}
                      </span>
                      <span>{section.title}</span>
                      <ChevronDown
                        size={12}
                        className="shrink-0 transition-transform duration-200"
                        style={{
                          transform: expanded
                            ? "rotate(0deg)"
                            : "rotate(-90deg)",
                        }}
                      />
                    </button>
                  )}

                  {collapsed && (
                    <div className="pt-3 pb-1 flex justify-center">
                      <div
                        className="h-px w-6"
                        style={{ background: "var(--border-default)" }}
                      />
                    </div>
                  )}

                  <div
                    className="space-y-0.5 overflow-hidden transition-all duration-200"
                    style={{
                      maxHeight: expanded ? "1000px" : "0px",
                      opacity: expanded ? 1 : 0,
                    }}
                  >
                    {section.items.map((item) => {
                      const active = isActive(pathname, item);
                      return (
                        <Link
                          key={item.label}
                          href={sanitizeUrl(item.href)} // NOSONAR — React escapa JSX + sanitizeUrl valida protocol
                          onClick={() => setOpen(false)}
                          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150 no-underline group/item"
                          style={{
                            color: active
                              ? "var(--brand-primary)"
                              : "var(--text-secondary)",
                            background: active
                              ? "var(--brand-glow)"
                              : "transparent",
                            textDecoration: "none",
                            justifyContent: collapsed ? "center" : "flex-start",
                            position: "relative",
                          }}
                          title={
                            collapsed
                              ? item.label
                              : (item.tooltip ?? item.label)
                          }
                        >
                          {active && !collapsed && (
                            <span
                              className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full"
                              style={{
                                background:
                                  "linear-gradient(180deg, var(--brand-secondary), var(--brand-primary))",
                                boxShadow: "0 0 8px var(--brand-glow)",
                              }}
                            />
                          )}
                          <span
                            className="shrink-0 transition-transform duration-150 group-hover/item:scale-110"
                            style={{
                              filter: active
                                ? "drop-shadow(0 0 4px var(--brand-glow))"
                                : "none",
                            }}
                          >
                            {item.icon}
                          </span>
                          <span
                            className={collapsed ? "md:hidden" : "truncate"}
                          >
                            {item.label}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
        </nav>

        <div
          className="px-3 pt-3 pb-3 space-y-2"
          style={{ borderTop: "1px solid var(--border-subtle)" }}
        >
          <div
            className={`flex items-center gap-2.5 ${collapsed ? "md:hidden" : ""}`}
          >
            <div
              className="relative flex items-center justify-center rounded-full shrink-0"
              style={{
                width: 34,
                height: 34,
                background: "var(--brand-glow)",
                border: "1px solid var(--brand-primary)",
              }}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--brand-primary)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span
                className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full"
                style={{
                  background: "var(--status-ok-text)",
                  border: "2px solid var(--surface-1)",
                }}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div
                className="text-sm font-semibold truncate"
                style={{ color: "var(--text-primary)" }}
              >
                Usuário
              </div>
              <div
                className="text-[10px] truncate"
                style={{ color: "var(--text-muted)" }}
              >
                Cliente
              </div>
            </div>
          </div>

          <ZabbixPingIndicator collapsed={collapsed} />
          <LogoutButton collapsed={collapsed} />
        </div>
      </aside>
    </>
  );
}
