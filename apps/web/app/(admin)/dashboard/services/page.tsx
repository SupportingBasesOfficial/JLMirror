// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { RefreshCw } from "lucide-react";
import { useApi } from "@/lib/use-api";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  ErrorState,
  EmptyState,
  LoadingState,
} from "@/components/ui/state-display";
import type { ZabbixService } from "@repo/zabbix";

type ServiceStatusVariant = "ok" | "warning" | "error";

const STATUS_VARIANTS: Record<string, ServiceStatusVariant> = {
  "0": "ok",
  "1": "warning",
  "2": "error",
};

const STATUS_LABELS: Record<string, string> = {
  "0": "OK",
  "1": "Aviso",
  "2": "Crítico",
};

export default function ServicesPage() {
  const { data, error, isLoading, progress, mutate } = useApi<{
    data: ZabbixService[];
  }>("/api/v1/zabbix/services");
  const services = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1
          className="text-xl font-bold"
          style={{ color: "var(--text-primary)" }}
        >
          Serviços
        </h1>
        <button
          onClick={() => mutate()}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors hover:opacity-80"
          style={{
            background: "var(--brand-glow)",
            border: "1px solid var(--brand-primary)",
            color: "var(--brand-primary)",
          }}
        >
          <RefreshCw size={14} />
          Atualizar
        </button>
      </div>

      {error && <ErrorState title="Erro" message={error} />}

      {isLoading ? (
        <LoadingState label="Carregando..." progress={progress} />
      ) : services.length === 0 ? (
        <EmptyState title="Nenhum serviço configurado" />
      ) : (
        <div className="space-y-2">
          {services.map((s) => {
            const status = s.status ?? "0";
            const statusVariant = STATUS_VARIANTS[status] ?? "ok";
            return (
              <div
                key={s.serviceid}
                className="flex items-center gap-3 rounded-lg p-3"
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border-default)",
                }}
              >
                <div className="flex-1">
                  <span
                    className="text-sm font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {s.name}
                  </span>
                  {s.description && (
                    <p
                      className="text-xs mt-0.5"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {s.description}
                    </p>
                  )}
                </div>
                <StatusBadge
                  variant={statusVariant}
                  dot
                  pulse={Number(status) >= 2}
                >
                  {STATUS_LABELS[status]}
                </StatusBadge>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
