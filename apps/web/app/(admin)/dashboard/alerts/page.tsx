import { cookies } from "next/headers";
import { serverApiGetWithToken } from "@/lib/api-client";
import Link from "next/link";
import { ChevronRight, CheckCircle2 } from "lucide-react";
import type { ZabbixTrigger } from "@repo/zabbix";
import { StatusBadge } from "@/components/ui/status-badge";
import { StateDisplay } from "@/components/ui/state-display";

function timeAgo(timestamp: string): string {
  const diff = Math.floor(Date.now() / 1000) - parseInt(timestamp);
  if (diff < 60) return "agora";
  if (diff < 3600) return Math.floor(diff / 60) + "min";
  if (diff < 86400) return Math.floor(diff / 3600) + "h";
  return Math.floor(diff / 86400) + "d";
}

export default async function AlertsPage() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("access_token")?.value;
  const refreshToken = cookieStore.get("refresh_token")?.value;

  if (!accessToken) {
    return (
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
          Alertas
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
          Não autenticado. Faça login para continuar.
        </p>
      </div>
    );
  }

  const triggersResult = await serverApiGetWithToken<{ data: ZabbixTrigger[] }>(
    "/api/v1/zabbix/triggers",
    accessToken,
    refreshToken,
  );

  const triggers = (triggersResult.data?.data ?? []).filter((t) => t.value === "1");
  const criticalTriggers = triggers.filter((t) => t.priority === "4" || t.priority === "5");
  const warningTriggers = triggers.filter((t) => t.priority === "2" || t.priority === "3");
  const infoTriggers = triggers.filter((t) => t.priority === "0" || t.priority === "1");

  return (
    <div className="space-y-5" style={{ animation: "fadeIn 0.3s ease-out" }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
          Alertas Ativos
        </h1>
        <div className="flex items-center gap-3 text-[10px]" style={{ color: "var(--text-muted)" }}>
          <span className="flex items-center gap-1">
            <span className="rounded-full" style={{ width: 6, height: 6, background: "var(--status-error-text)" }} />
            {criticalTriggers.length} crítico{criticalTriggers.length !== 1 ? "s" : ""}
          </span>
          <span className="flex items-center gap-1">
            <span className="rounded-full" style={{ width: 6, height: 6, background: "var(--status-warning-text)" }} />
            {warningTriggers.length} aviso{warningTriggers.length !== 1 ? "s" : ""}
          </span>
          <span className="flex items-center gap-1">
            <span className="rounded-full" style={{ width: 6, height: 6, background: "var(--text-muted)" }} />
            {infoTriggers.length} info
          </span>
        </div>
      </div>

      {/* Críticos */}
      {criticalTriggers.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="rounded-full" style={{ width: 8, height: 8, background: "var(--status-error-text)", boxShadow: "0 0 8px color-mix(in srgb, var(--status-error-text) 40%, transparent)" }} />
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--status-error-text)" }}>Críticos</span>
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>({criticalTriggers.length})</span>
          </div>
          <div className="space-y-1.5">
            {criticalTriggers.map((t) => {
              const hostName = t.hosts?.[0]?.name ?? "N/A";
              const hostId = t.hosts?.[0]?.hostid;
              return (
                <Link
                  key={t.triggerid}
                  href={hostId ? `/dashboard/devices/${hostId}` : "/dashboard"}
                  className="block rounded-lg p-3 transition-all duration-150 no-underline hover:translate-x-1"
                  style={{ background: "var(--surface-2)", border: "1px solid var(--status-error-border)", textDecoration: "none" }}
                >
                  <div className="flex items-center gap-3">
                    <span className="rounded-full shrink-0" style={{ width: 6, height: 6, background: "var(--status-error-text)", boxShadow: "0 0 6px color-mix(in srgb, var(--status-error-text) 40%, transparent)" }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                        {t.description}
                      </div>
                      <div className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                        {hostName} · há {timeAgo(t.lastchange)}
                      </div>
                    </div>
                    <StatusBadge variant="error">Crítico</StatusBadge>
                    <ChevronRight size={14} className="shrink-0" style={{ color: "var(--text-muted)" }} />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Avisos */}
      {warningTriggers.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="rounded-full" style={{ width: 8, height: 8, background: "var(--status-warning-text)", boxShadow: "0 0 8px color-mix(in srgb, var(--status-warning-text) 40%, transparent)" }} />
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--status-warning-text)" }}>Avisos</span>
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>({warningTriggers.length})</span>
          </div>
          <div className="space-y-1.5">
            {warningTriggers.map((t) => {
              const hostName = t.hosts?.[0]?.name ?? "N/A";
              const hostId = t.hosts?.[0]?.hostid;
              return (
                <Link
                  key={t.triggerid}
                  href={hostId ? `/dashboard/devices/${hostId}` : "/dashboard"}
                  className="block rounded-lg p-3 transition-all duration-150 no-underline hover:translate-x-1"
                  style={{ background: "var(--surface-2)", border: "1px solid var(--status-warning-border)", textDecoration: "none" }}
                >
                  <div className="flex items-center gap-3">
                    <span className="rounded-full shrink-0" style={{ width: 6, height: 6, background: "var(--status-warning-text)", boxShadow: "0 0 6px color-mix(in srgb, var(--status-warning-text) 40%, transparent)" }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                        {t.description}
                      </div>
                      <div className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                        {hostName} · há {timeAgo(t.lastchange)}
                      </div>
                    </div>
                    <StatusBadge variant="warning">Aviso</StatusBadge>
                    <ChevronRight size={14} className="shrink-0" style={{ color: "var(--text-muted)" }} />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Info */}
      {infoTriggers.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="rounded-full" style={{ width: 8, height: 8, background: "var(--text-muted)" }} />
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Informações</span>
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>({infoTriggers.length})</span>
          </div>
          <div className="space-y-1.5">
            {infoTriggers.map((t) => {
              const hostName = t.hosts?.[0]?.name ?? "N/A";
              const hostId = t.hosts?.[0]?.hostid;
              return (
                <Link
                  key={t.triggerid}
                  href={hostId ? `/dashboard/devices/${hostId}` : "/dashboard"}
                  className="block rounded-lg p-3 transition-all duration-150 no-underline hover:translate-x-1"
                  style={{ background: "var(--surface-2)", border: "1px solid var(--border-default)", textDecoration: "none" }}
                >
                  <div className="flex items-center gap-3">
                    <span className="rounded-full shrink-0" style={{ width: 6, height: 6, background: "var(--text-muted)" }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                        {t.description}
                      </div>
                      <div className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                        {hostName} · há {timeAgo(t.lastchange)}
                      </div>
                    </div>
                    <StatusBadge variant="neutral">Info</StatusBadge>
                    <ChevronRight size={14} className="shrink-0" style={{ color: "var(--text-muted)" }} />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {triggers.length === 0 && (
        <StateDisplay
          variant="ok"
          title="Nenhum alerta ativo"
          message="Todos os sistemas estão operando normalmente."
        />
      )}
    </div>
  );
}
