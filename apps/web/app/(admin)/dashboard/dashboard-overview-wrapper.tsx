// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { cookies } from "next/headers";
import { serverApiGetWithToken } from "@/lib/api-client";
import { apiRoutes, type DashboardOverviewResponse } from "@/lib/api-routes";
import { LoadingState } from "@/components/ui/state-display";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardHeader } from "@/components/ui/card";
import { DynamicKpiGrid } from "./dynamic-kpi-grid";

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_VARIANT: Record<
  string,
  "ok" | "info" | "warning" | "error" | "neutral"
> = {
  open: "info",
  in_progress: "warning",
  resolved: "ok",
  closed: "neutral",
  pending: "neutral",
  approved: "ok",
  critical: "error",
  high: "warning",
};

export default async function DashboardOverviewWrapper() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("access_token")?.value;
  const refreshToken = cookieStore.get("refresh_token")?.value;

  if (!accessToken) {
    return <LoadingState label="Carregando KPIs..." />;
  }

  // Usa rota centralizada + tipo type-safe DashboardOverviewResponse
  const result = await serverApiGetWithToken<DashboardOverviewResponse>(
    apiRoutes.dashboard.overview,
    accessToken,
    refreshToken,
  );

  if (result.error || !result.data) {
    const errorCode = result.error?.code ?? "UNKNOWN";
    const errorMsg = result.error?.message ?? "Sem dados disponíveis";
    const isDbError = errorCode === "DASHBOARD_OVERVIEW_ERROR";
    const isNetworkError = errorCode === "NETWORK_ERROR";
    return (
      <div
        className="rounded-lg p-4"
        style={{
          background: "var(--status-error-bg)",
          border: "1px solid var(--status-error-border)",
        }}
      >
        <div
          className="text-sm font-medium"
          style={{ color: "var(--status-error-text)" }}
        >
          {isDbError
            ? "Falha ao carregar dashboard"
            : isNetworkError
              ? "Erro de conexão"
              : "Dados indisponíveis"}
        </div>
        <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
          {errorMsg}
        </div>
        <div className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
          Tente recarregar a página. Se o problema persistir, contate o suporte.
        </div>
      </div>
    );
  }

  const data = result.data;
  const k = data.kpis;

  return (
    <div className="space-y-4">
      {/* KPI Grid dinâmico — filtra KPIs por módulos ativados */}
      <DynamicKpiGrid kpis={k} />

      {/* Two columns: Activity + Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Activity */}
        <Card>
          <CardHeader title="Atividade Recente" />
          <div className="space-y-1">
            {data.recent_activity.length === 0 && (
              <div className="text-sm" style={{ color: "var(--text-muted)" }}>
                Sem atividade
              </div>
            )}
            {data.recent_activity.map((act, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-sm py-1.5"
                style={{ borderBottom: "1px solid var(--border-subtle)" }}
              >
                <span style={{ color: "var(--text-secondary)" }}>
                  {act.action}
                </span>
                <span
                  className="text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  {formatTime(act.created_at)}
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* Upcoming Changes + SSL Expiring */}
        <div className="space-y-4">
          {/* Upcoming Changes */}
          <Card>
            <CardHeader title="Próximas Mudanças" />
            <div className="space-y-1">
              {data.upcoming_changes.length === 0 && (
                <div className="text-sm" style={{ color: "var(--text-muted)" }}>
                  Nenhuma mudança agendada
                </div>
              )}
              {data.upcoming_changes.map((ch) => (
                <a
                  key={ch.id}
                  href="/changes"
                  className="flex items-center justify-between text-sm py-1.5 no-underline"
                  style={{
                    textDecoration: "none",
                    borderBottom: "1px solid var(--border-subtle)",
                  }}
                >
                  <div className="min-w-0">
                    <span
                      className="font-semibold"
                      style={{ color: "var(--brand-primary)" }}
                    >
                      {ch.rfc_number}
                    </span>
                    <span
                      className="ml-2 truncate"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {ch.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge
                      variant={STATUS_VARIANT[ch.priority] ?? "neutral"}
                    >
                      {ch.priority}
                    </StatusBadge>
                    <span
                      className="text-xs"
                      style={{ color: "var(--status-info-text)" }}
                    >
                      {formatTime(ch.planned_start_at)}
                    </span>
                  </div>
                </a>
              ))}
            </div>
          </Card>

          {/* SSL Expiring */}
          {data.ssl_expiring_soon.length > 0 && (
            <Card>
              <CardHeader title="SSL Expirando" />
              <div className="space-y-1">
                {data.ssl_expiring_soon.map((ssl) => (
                  <a
                    key={ssl.id}
                    href="/ssl"
                    className="flex items-center justify-between text-sm py-1.5 no-underline"
                    style={{
                      textDecoration: "none",
                      borderBottom: "1px solid var(--border-subtle)",
                    }}
                  >
                    <span style={{ color: "var(--text-secondary)" }}>
                      {ssl.hostname}
                    </span>
                    <span
                      className="text-xs font-semibold"
                      style={{ color: "var(--status-error-text)" }}
                    >
                      {formatTime(ssl.valid_to)}
                    </span>
                  </a>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Recent Tickets */}
      <Card>
        <CardHeader title="Tickets Recentes" />
        <div className="space-y-1">
          {data.recent_tickets.length === 0 && (
            <div className="text-sm" style={{ color: "var(--text-muted)" }}>
              Nenhum ticket
            </div>
          )}
          {data.recent_tickets.map((t) => (
            <a
              key={t.id}
              href="/tickets"
              className="flex items-center justify-between text-sm py-1.5 no-underline"
              style={{
                textDecoration: "none",
                borderBottom: "1px solid var(--border-subtle)",
              }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <StatusBadge variant={STATUS_VARIANT[t.status] ?? "neutral"}>
                  {t.status}
                </StatusBadge>
                <span
                  className="truncate"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {t.subject}
                </span>
              </div>
              <span
                className="text-xs shrink-0"
                style={{ color: "var(--text-muted)" }}
              >
                {formatTime(t.created_at)}
              </span>
            </a>
          ))}
        </div>
      </Card>
    </div>
  );
}
