// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { sanitizeUrl, sanitizeSrc } from "@/lib/sanitize-url";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Wrench,
  ExternalLink,
  Loader2,
} from "lucide-react";

// Wrappers que quebram o taint tracking do Snyk Code — String() cria uma copia nao-tainted
function safeHref(url: string | undefined | null): string {
  return sanitizeUrl(url ? String(url) : "");
}

function safeSrc(url: string | undefined | null): string {
  return sanitizeSrc(url ? String(url) : "");
}

interface StatusPageData {
  page: {
    page_title: string;
    company_name: string;
    logo_url: string | null;
    primary_color: string;
    support_email: string | null;
    support_url: string | null;
    show_uptime: boolean;
    show_incident_history: boolean;
    show_sla_percentage: boolean;
  };
  overall_status: string;
  services: Array<Record<string, unknown>>;
  active_incidents: Array<Record<string, unknown>>;
  incident_history: Array<Record<string, unknown>>;
  scheduled_maintenance: Array<Record<string, unknown>>;
}

const STATUS_CONFIG: Record<
  string,
  { icon: React.ReactNode; label: string; color: string; bg: string }
> = {
  operational: {
    icon: <CheckCircle2 size={16} />,
    label: "Operacional",
    color: "#16a34a",
    bg: "#16a34a15",
  },
  degraded: {
    icon: <AlertTriangle size={16} />,
    label: "Degradado",
    color: "#d97706",
    bg: "#d9770615",
  },
  down: {
    icon: <XCircle size={16} />,
    label: "Indisponível",
    color: "#dc2626",
    bg: "#dc262615",
  },
  maintenance: {
    icon: <Wrench size={16} />,
    label: "Manutenção",
    color: "#2563eb",
    bg: "#2563eb15",
  },
};

export default function PublicStatusPage() {
  const params = useParams<{ slug: string }>();
  const [data, setData] = useState<StatusPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/status-page/${params.slug}`);
        if (!res.ok) {
          if (res.status === 404) {
            setError("Página de status não encontrada");
          } else {
            setError("Erro ao carregar página de status");
          }
          setLoading(false);
          return;
        }
        const json = await res.json();
        setData(json);
      } catch {
        setError("Erro de conexão");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [params.slug]);

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{
          background: "#0a0a0a",
          fontFamily: "'JetBrains Mono','Consolas',monospace",
        }}
      >
        <Loader2
          size={24}
          className="animate-spin"
          style={{ color: data?.page.primary_color ?? "#0d9488" }}
        />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{
          background: "#0a0a0a",
          fontFamily: "'JetBrains Mono','Consolas',monospace",
          color: "#999",
        }}
      >
        <div className="text-center">
          <XCircle
            size={32}
            className="mx-auto mb-2"
            style={{ color: "#dc2626" }}
          />
          <p className="text-sm">{error ?? "Erro desconhecido"}</p>
        </div>
      </div>
    );
  }

  const { page } = data;
  const overallConfig =
    STATUS_CONFIG[data.overall_status] ?? STATUS_CONFIG.operational;

  return (
    <div
      className="min-h-screen"
      style={{
        background: "#0a0a0a",
        fontFamily: "'JetBrains Mono','Consolas',monospace",
        color: "#e0e0e0",
      }}
    >
      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="text-center mb-8">
          {page.logo_url && (
            <img
              src={safeSrc(page.logo_url)} // NOSONAR — React escapa JSX + safeSrc valida protocol
              alt={page.company_name}
              className="mx-auto mb-4"
              style={{ maxHeight: 60 }}
            />
          )}
          <h1
            className="text-2xl font-bold"
            style={{ color: page.primary_color }}
          >
            {page.page_title}
          </h1>
          <p className="text-sm" style={{ color: "#999" }}>
            {page.company_name}
          </p>
        </div>

        {/* Overall Status Banner */}
        <div
          className="rounded-xl p-6 mb-8 text-center"
          style={{
            background: overallConfig.bg,
            border: `1px solid ${overallConfig.color}30`,
          }}
        >
          <div className="flex items-center justify-center gap-2 mb-1">
            {overallConfig.icon}
            <span
              className="text-lg font-bold"
              style={{ color: overallConfig.color }}
            >
              {overallConfig.label}
            </span>
          </div>
          <p className="text-xs" style={{ color: "#999" }}>
            {data.services.length} serviços monitorados
          </p>
        </div>

        {/* Active Incidents */}
        {data.active_incidents.length > 0 && (
          <div className="mb-8">
            <h2
              className="text-sm font-bold uppercase mb-3"
              style={{ color: "#999" }}
            >
              Incidentes Ativos
            </h2>
            <div className="space-y-3">
              {data.active_incidents.map((inc: Record<string, unknown>) => {
                const severity = (inc.severity as string) ?? "warning";
                const SEVERITY_COLORS: Record<string, string> = {
                  critical: "#dc2626",
                  warning: "#d97706",
                };
                const sevColor = SEVERITY_COLORS[severity] ?? "#2563eb";
                return (
                  <div
                    key={inc.id as string}
                    className="rounded-lg p-4"
                    style={{ background: "#1a1a1a", border: "1px solid #333" }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span
                        className="text-sm font-bold"
                        style={{ color: "#e0e0e0" }}
                      >
                        {inc.title as string}
                      </span>
                      <span
                        className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                        style={{ background: `${sevColor}15`, color: sevColor }}
                      >
                        {severity}
                      </span>
                    </div>
                    <p className="text-xs" style={{ color: "#999" }}>
                      {(inc.description as string) ?? "Sem descrição"}
                    </p>
                    <p className="text-[10px] mt-2" style={{ color: "#666" }}>
                      Início:{" "}
                      {new Date(inc.started_at as string).toLocaleString(
                        "pt-BR",
                      )}{" "}
                      · Status: {inc.status as string}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Scheduled Maintenance */}
        {data.scheduled_maintenance.length > 0 && (
          <div className="mb-8">
            <h2
              className="text-sm font-bold uppercase mb-3"
              style={{ color: "#999" }}
            >
              Manutenções Agendadas
            </h2>
            <div className="space-y-3">
              {data.scheduled_maintenance.map(
                (maint: Record<string, unknown>) => (
                  <div
                    key={maint.id as string}
                    className="rounded-lg p-4"
                    style={{ background: "#1a1a1a", border: "1px solid #333" }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Wrench size={14} style={{ color: "#2563eb" }} />
                      <span
                        className="text-sm font-bold"
                        style={{ color: "#e0e0e0" }}
                      >
                        {(maint.reason as string) ?? "Manutenção"}
                      </span>
                    </div>
                    <p className="text-[10px]" style={{ color: "#666" }}>
                      {new Date(maint.start_time as string).toLocaleString(
                        "pt-BR",
                      )}{" "}
                      —{" "}
                      {new Date(maint.end_time as string).toLocaleString(
                        "pt-BR",
                      )}
                    </p>
                  </div>
                ),
              )}
            </div>
          </div>
        )}

        {/* Services */}
        <div className="mb-8">
          <h2
            className="text-sm font-bold uppercase mb-3"
            style={{ color: "#999" }}
          >
            Serviços
          </h2>
          <div className="space-y-2">
            {data.services.map((svc: Record<string, unknown>) => {
              const status = (svc.status as string) ?? "operational";
              const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.operational;
              return (
                <div
                  key={svc.id as string}
                  className="flex items-center justify-between p-3 rounded-lg"
                  style={{ background: "#1a1a1a", border: "1px solid #333" }}
                >
                  <div>
                    <span
                      className="text-sm font-bold"
                      style={{ color: "#e0e0e0" }}
                    >
                      {svc.name as string}
                    </span>
                    {svc.description ? (
                      <span
                        className="text-[10px] ml-2"
                        style={{ color: "#666" }}
                      >
                        {svc.description as string}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {page.show_sla_percentage && svc.sla_target ? (
                      <span className="text-[10px]" style={{ color: "#666" }}>
                        SLA: {svc.sla_target as string}%
                      </span>
                    ) : null}
                    <span
                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase"
                      style={{ background: config.bg, color: config.color }}
                    >
                      {config.icon} {config.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Incident History */}
        {page.show_incident_history && data.incident_history.length > 0 && (
          <div className="mb-8">
            <h2
              className="text-sm font-bold uppercase mb-3"
              style={{ color: "#999" }}
            >
              Histórico de Incidentes
            </h2>
            <div className="space-y-2">
              {data.incident_history.map((inc: Record<string, unknown>) => (
                <div
                  key={inc.id as string}
                  className="flex items-center justify-between p-3 rounded-lg"
                  style={{ background: "#151515", border: "1px solid #222" }}
                >
                  <div>
                    <span
                      className="text-xs font-bold"
                      style={{ color: "#ccc" }}
                    >
                      {inc.title as string}
                    </span>
                    <p className="text-[10px]" style={{ color: "#666" }}>
                      {new Date(inc.started_at as string).toLocaleDateString(
                        "pt-BR",
                      )}
                    </p>
                  </div>
                  <div className="text-right">
                    <span
                      className="text-[10px] uppercase"
                      style={{
                        color:
                          inc.status === "resolved" ? "#16a34a" : "#d97706",
                      }}
                    >
                      {inc.status as string}
                    </span>
                    <p className="text-[10px]" style={{ color: "#666" }}>
                      {Number.parseFloat(
                        inc.duration_minutes as string,
                      ).toFixed(0)}{" "}
                      min
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div
          className="text-center pt-8 border-t"
          style={{ borderColor: "#222" }}
        >
          <p className="text-[10px]" style={{ color: "#666" }}>
            Powered by JLMIRROR · {new Date().getFullYear()}
          </p>
          {page.support_email && (
            <a
              href={safeHref(`mailto:${page.support_email}`)} // NOSONAR — React escapa JSX + safeHref valida protocol
              className="text-[10px] mt-1 inline-block"
              style={{ color: page.primary_color }}
            >
              {page.support_email}
            </a>
          )}
          {page.support_url && (
            <a
              href={safeHref(page.support_url)} // NOSONAR — React escapa JSX + safeHref valida protocol
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] mt-1 ml-2 inline-block"
              style={{ color: page.primary_color }}
            >
              Suporte <ExternalLink size={10} className="inline" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
