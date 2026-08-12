// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { cookies } from "next/headers";
import { Suspense } from "react";
import { serverApiGetWithToken } from "@/lib/api-client";
import { apiRoutes } from "@/lib/api-routes";
import { DeviceGrid } from "@/components/device-grid";
import { StateDisplay } from "@/components/ui/state-display";
import { KpiCard } from "@/components/ui/kpi-card";
import { StatusBadge } from "@/components/ui/status-badge";
import Link from "next/link";
import {
  Server,
  Wifi,
  WifiOff,
  Bell,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import type { ZabbixHost, ZabbixTrigger } from "@repo/zabbix";
import DashboardOverviewWrapper from "./dashboard-overview-wrapper";
import { DeviceSyncTrigger } from "./device-sync-trigger";
import { DashboardAutoRefresh } from "./dashboard-auto-refresh";

async function getZabbixDevices(accessToken: string, refreshToken?: string) {
  // Usa rota centralizada de apiRoutes
  const result = await serverApiGetWithToken<{ devices: ZabbixHost[] }>(
    apiRoutes.zabbix.devices,
    accessToken,
    refreshToken,
  );
  return result;
}

async function getZabbixTriggers(accessToken: string, refreshToken?: string) {
  // Usa rota centralizada de apiRoutes
  const result = await serverApiGetWithToken<{ data: ZabbixTrigger[] }>(
    apiRoutes.zabbix.triggers,
    accessToken,
    refreshToken,
  );
  return result;
}

function timeAgo(timestamp: string, fallbackClock?: number | string): string {
  const ts = Number.parseInt(timestamp);
  const fallback =
    typeof fallbackClock === "string"
      ? Number.parseInt(fallbackClock)
      : fallbackClock;
  const effectiveTs =
    (!ts || ts <= 0) && fallback && fallback > 0 ? fallback : ts;
  if (!effectiveTs || effectiveTs <= 0) return "—";
  const diff = Math.floor(Date.now() / 1000) - effectiveTs;
  if (diff < 0) return "agora";
  if (diff < 60) return "agora";
  if (diff < 3600) return Math.floor(diff / 60) + "min";
  if (diff < 86400) return Math.floor(diff / 3600) + "h";
  return Math.floor(diff / 86400) + "d";
}

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("access_token")?.value;
  const refreshToken = cookieStore.get("refresh_token")?.value;

  if (!accessToken) {
    return (
      <StateDisplay
        variant="warning"
        title="Não autenticado"
        message="Faça login para continuar."
      />
    );
  }

  // Paraleliza: busca devices + triggers do Zabbix ao mesmo tempo
  // Items (CPU/rede) sao lazy-loaded pelo DeviceGrid no cliente via SWR
  const [devicesResult, triggersResult] = await Promise.all([
    getZabbixDevices(accessToken, refreshToken),
    getZabbixTriggers(accessToken, refreshToken),
  ]);

  const devices = devicesResult.data?.devices ?? [];
  const triggers = triggersResult.data?.data ?? [];
  const onlineCount = devices.filter((d) => d.status === "0").length;
  const offlineCount = devices.length - onlineCount;
  // Filtra apenas triggers ativos (value === "1" = problema em andamento)
  const activeTriggers = triggers.filter((t) => t.value === "1");
  const alertCount = activeTriggers.length;
  const criticalCount = activeTriggers.filter(
    (t) => t.priority === "4" || t.priority === "5",
  ).length;

  // Agrupa triggers por hostid
  const triggersByHost: Record<string, ZabbixTrigger[]> = {};
  for (const t of activeTriggers) {
    for (const h of t.hosts ?? []) {
      if (!triggersByHost[h.hostid]) triggersByHost[h.hostid] = [];
      triggersByHost[h.hostid]!.push(t);
    }
  }

  return (
    <div className="space-y-5" style={{ animation: "fadeIn 0.3s ease-out" }}>
      {/* Header com titulo e auto-refresh */}
      <div className="flex items-center justify-between">
        <h1
          className="text-xl font-bold"
          style={{ color: "var(--text-primary)" }}
        >
          Dashboard
        </h1>
        <DashboardAutoRefresh />
      </div>

      {/* Dispara sync de devices do Zabbix imediatamente ao carregar o dashboard */}
      <DeviceSyncTrigger />

      {/* KPIs consolidados de todos os modulos — carrega em paralelo via Suspense */}
      <Suspense
        fallback={
          <div
            className="h-48 animate-pulse rounded-xl"
            style={{ background: "var(--surface-2)" }}
          />
        }
      >
        <DashboardOverviewWrapper />
      </Suspense>

      {/* Summary cards */}
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}
      >
        <KpiCard
          label="Online"
          value={onlineCount}
          unit={`de ${devices.length}`}
          icon={<Wifi size={18} />}
          variant="ok"
        />
        <KpiCard
          label="Offline"
          value={offlineCount}
          unit={`de ${devices.length}`}
          icon={<WifiOff size={18} />}
          variant={offlineCount > 0 ? "error" : "default"}
        />
        <KpiCard
          label="Total"
          value={devices.length}
          unit="dispositivos"
          icon={<Server size={18} />}
          variant="info"
        />
        <KpiCard
          label="Alertas"
          value={alertCount}
          unit="ativos"
          icon={<Bell size={18} />}
          variant={alertCount > 0 ? "warning" : "ok"}
        />
        {criticalCount > 0 && (
          <KpiCard
            label="Críticos"
            value={criticalCount}
            unit="urgentes"
            icon={<AlertTriangle size={18} />}
            variant="error"
          />
        )}
      </div>

      {/* Active alerts section - em cima, prioridade maxima */}
      {activeTriggers.length > 0 && (
        <div className="space-y-4">
          {/* Header com contadores */}
          <div className="flex items-center justify-between">
            <div
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-muted)" }}
            >
              Alertas Ativos
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge variant="error" dot>
                {criticalCount} crítico{criticalCount !== 1 ? "s" : ""}
              </StatusBadge>
              <StatusBadge variant="warning" dot>
                {
                  activeTriggers.filter(
                    (t) => t.priority === "2" || t.priority === "3",
                  ).length
                }{" "}
                aviso
                {activeTriggers.filter(
                  (t) => t.priority === "2" || t.priority === "3",
                ).length !== 1
                  ? "s"
                  : ""}
              </StatusBadge>
              <StatusBadge variant="neutral" dot>
                {
                  activeTriggers.filter(
                    (t) => t.priority === "0" || t.priority === "1",
                  ).length
                }{" "}
                info
              </StatusBadge>
            </div>
          </div>

          {/* Criticos */}
          {criticalCount > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="rounded-full"
                  style={{
                    width: 8,
                    height: 8,
                    background: "var(--status-error-text)",
                    boxShadow: "0 0 8px var(--status-error-border)",
                  }}
                />
                <span
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "var(--status-error-text)" }}
                >
                  Críticos
                </span>
                <span
                  className="text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  ({criticalCount})
                </span>
              </div>
              <div className="space-y-1.5">
                {activeTriggers
                  .filter((t) => t.priority === "4" || t.priority === "5")
                  .map((t) => {
                    const hostName = t.hosts?.[0]?.name ?? "N/A";
                    const hostId = t.hosts?.[0]?.hostid;
                    return (
                      <Link
                        key={t.triggerid}
                        href={
                          hostId ? `/dashboard/devices/${hostId}` : "/dashboard"
                        }
                        className="block rounded-lg p-3 transition-all duration-150 no-underline"
                        style={{
                          background: "var(--surface-2)",
                          border: "1px solid var(--status-error-border)",
                          textDecoration: "none",
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className="rounded-full shrink-0"
                            style={{
                              width: 6,
                              height: 6,
                              background: "var(--status-error-text)",
                              boxShadow: "0 0 6px var(--status-error-border)",
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <div
                              className="text-sm font-medium truncate"
                              style={{ color: "var(--text-primary)" }}
                            >
                              {t.description}
                            </div>
                            <div
                              className="text-xs mt-0.5"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {hostName} · há{" "}
                              {timeAgo(t.lastchange, t.lastEvent?.clock)}
                            </div>
                          </div>
                          <StatusBadge variant="error">Crítico</StatusBadge>
                          <ChevronRight
                            size={14}
                            className="shrink-0"
                            style={{ color: "var(--text-muted)" }}
                          />
                        </div>
                      </Link>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Avisos */}
          {activeTriggers.filter(
            (t) => t.priority === "2" || t.priority === "3",
          ).length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="rounded-full"
                  style={{
                    width: 8,
                    height: 8,
                    background: "var(--status-warning-text)",
                    boxShadow: "0 0 8px var(--status-warning-border)",
                  }}
                />
                <span
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "var(--status-warning-text)" }}
                >
                  Avisos
                </span>
                <span
                  className="text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  (
                  {
                    activeTriggers.filter(
                      (t) => t.priority === "2" || t.priority === "3",
                    ).length
                  }
                  )
                </span>
              </div>
              <div className="space-y-1.5">
                {activeTriggers
                  .filter((t) => t.priority === "2" || t.priority === "3")
                  .map((t) => {
                    const hostName = t.hosts?.[0]?.name ?? "N/A";
                    const hostId = t.hosts?.[0]?.hostid;
                    return (
                      <Link
                        key={t.triggerid}
                        href={
                          hostId ? `/dashboard/devices/${hostId}` : "/dashboard"
                        }
                        className="block rounded-lg p-3 transition-all duration-150 no-underline"
                        style={{
                          background: "var(--surface-2)",
                          border: "1px solid var(--status-warning-border)",
                          textDecoration: "none",
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className="rounded-full shrink-0"
                            style={{
                              width: 6,
                              height: 6,
                              background: "var(--status-warning-text)",
                              boxShadow: "0 0 6px var(--status-warning-border)",
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <div
                              className="text-sm font-medium truncate"
                              style={{ color: "var(--text-primary)" }}
                            >
                              {t.description}
                            </div>
                            <div
                              className="text-xs mt-0.5"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {hostName} · há{" "}
                              {timeAgo(t.lastchange, t.lastEvent?.clock)}
                            </div>
                          </div>
                          <StatusBadge variant="warning">Aviso</StatusBadge>
                          <ChevronRight
                            size={14}
                            className="shrink-0"
                            style={{ color: "var(--text-muted)" }}
                          />
                        </div>
                      </Link>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Info */}
          {activeTriggers.filter(
            (t) => t.priority === "0" || t.priority === "1",
          ).length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="rounded-full"
                  style={{
                    width: 8,
                    height: 8,
                    background: "var(--text-muted)",
                  }}
                />
                <span
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "var(--text-muted)" }}
                >
                  Informações
                </span>
                <span
                  className="text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  (
                  {
                    activeTriggers.filter(
                      (t) => t.priority === "0" || t.priority === "1",
                    ).length
                  }
                  )
                </span>
              </div>
              <div className="space-y-1.5">
                {activeTriggers
                  .filter((t) => t.priority === "0" || t.priority === "1")
                  .map((t) => {
                    const hostName = t.hosts?.[0]?.name ?? "N/A";
                    const hostId = t.hosts?.[0]?.hostid;
                    return (
                      <Link
                        key={t.triggerid}
                        href={
                          hostId ? `/dashboard/devices/${hostId}` : "/dashboard"
                        }
                        className="block rounded-lg p-3 transition-all duration-150 no-underline"
                        style={{
                          background: "var(--surface-2)",
                          border: "1px solid var(--border-default)",
                          textDecoration: "none",
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className="rounded-full shrink-0"
                            style={{
                              width: 6,
                              height: 6,
                              background: "var(--text-muted)",
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <div
                              className="text-sm font-medium truncate"
                              style={{ color: "var(--text-primary)" }}
                            >
                              {t.description}
                            </div>
                            <div
                              className="text-xs mt-0.5"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {hostName} · há{" "}
                              {timeAgo(t.lastchange, t.lastEvent?.clock)}
                            </div>
                          </div>
                          <StatusBadge variant="neutral">Info</StatusBadge>
                          <ChevronRight
                            size={14}
                            className="shrink-0"
                            style={{ color: "var(--text-muted)" }}
                          />
                        </div>
                      </Link>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Device cards - abaixo dos alertas */}
      {devicesResult.error ? (
        <StateDisplay
          variant="error"
          title="Erro ao carregar dispositivos"
          message={devicesResult.error.message}
        />
      ) : devices.length === 0 ? (
        <StateDisplay
          variant="empty"
          title="Nenhum dispositivo monitorado"
          message="Verifique a conexão com o Zabbix ou cadastre hosts no servidor."
        />
      ) : (
        <DeviceGrid
          devices={devices}
          triggersByHost={triggersByHost}
          cpuByHost={new Map<string, number>()}
          netInByHost={new Map<string, number>()}
          netOutByHost={new Map<string, number>()}
          netSpeedByHost={new Map<string, number>()}
        />
      )}
    </div>
  );
}
