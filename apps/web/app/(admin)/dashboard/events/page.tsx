"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useApi } from "@/lib/use-api";
import { StatusBadge } from "@/components/ui/status-badge";
import { ErrorState, EmptyState, LoadingState } from "@/components/ui/state-display";
import type { ZabbixEvent } from "@repo/zabbix";

type SeverityVariant = "ok" | "info" | "warning" | "error" | "critical";

const SEVERITY_VARIANTS: Record<string, SeverityVariant> = {
  "0": "info",
  "1": "info",
  "2": "warning",
  "3": "warning",
  "4": "error",
  "5": "critical",
};

const SEVERITY_LABELS: Record<string, string> = {
  "0": "Info",
  "1": "Info",
  "2": "Aviso",
  "3": "Aviso",
  "4": "Crítico",
  "5": "Crítico",
};

const VALUE_LABELS: Record<string, string> = {
  "0": "Resolvido",
  "1": "Problema",
};

export default function EventsPage() {
  const [filterValue, setFilterValue] = useState<string>("all");
  const [filterAck, setFilterAck] = useState<string>("all");
  const params = new URLSearchParams();
  if (filterValue === "problem") params.set("value", "1");
  if (filterValue === "resolved") params.set("value", "0");
  if (filterAck === "acknowledged") params.set("acknowledged", "true");
  if (filterAck === "unacknowledged") params.set("acknowledged", "false");
  params.set("limit", "200");
  const { data, error, isLoading, progress, mutate } = useApi<{ data: ZabbixEvent[] }>(`/api/zabbix/events?${params.toString()}`);
  const events = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Eventos</h1>
        <button
          onClick={() => mutate()}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors hover:opacity-80"
          style={{ background: "var(--brand-glow)", border: "1px solid var(--brand-primary)", color: "var(--brand-primary)" }}
        >
          <RefreshCw size={14} />
          Atualizar
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <select
          value={filterValue}
          onChange={(e) => setFilterValue(e.target.value)}
          className="rounded-lg px-3 py-1.5 text-sm outline-none"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
        >
          <option value="all">Todos estados</option>
          <option value="problem">Problemas</option>
          <option value="resolved">Resolvidos</option>
        </select>
        <select
          value={filterAck}
          onChange={(e) => setFilterAck(e.target.value)}
          className="rounded-lg px-3 py-1.5 text-sm outline-none"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
        >
          <option value="all">Todos (ack)</option>
          <option value="unacknowledged">Não reconhecidos</option>
          <option value="acknowledged">Reconhecidos</option>
        </select>
      </div>

      {error && (
        <ErrorState title="Erro ao carregar eventos" message={error} />
      )}

      {isLoading ? (
        <LoadingState label="Carregando eventos..." progress={progress} />
      ) : events.length === 0 ? (
        <EmptyState title="Nenhum evento encontrado" message="Não há eventos para os filtros selecionados." />
      ) : (
        <div className="overflow-x-auto rounded-lg" style={{ border: "1px solid var(--border-default)", background: "var(--surface-2)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-default)" }}>
                <th className="text-left py-2 px-3 font-medium" style={{ color: "var(--text-muted)" }}>Severidade</th>
                <th className="text-left py-2 px-3 font-medium" style={{ color: "var(--text-muted)" }}>Estado</th>
                <th className="text-left py-2 px-3 font-medium" style={{ color: "var(--text-muted)" }}>Descrição</th>
                <th className="text-left py-2 px-3 font-medium" style={{ color: "var(--text-muted)" }}>Host</th>
                <th className="text-left py-2 px-3 font-medium" style={{ color: "var(--text-muted)" }}>Horário</th>
                <th className="text-left py-2 px-3 font-medium" style={{ color: "var(--text-muted)" }}>Ack</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const sev = e.severity ?? "0";
                const sevVariant = SEVERITY_VARIANTS[sev] ?? "info";
                const hostName = e.hosts?.[0]?.name ?? "—";
                return (
                  <tr key={e.eventid} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <td className="py-2 px-3">
                      <StatusBadge variant={sevVariant} dot>
                        {SEVERITY_LABELS[sev]}
                      </StatusBadge>
                    </td>
                    <td className="py-2 px-3">
                      <StatusBadge variant={e.value === "1" ? "error" : "ok"}>
                        {VALUE_LABELS[e.value] ?? "—"}
                      </StatusBadge>
                    </td>
                    <td className="py-2 px-3" style={{ color: "var(--text-primary)" }}>{e.name}</td>
                    <td className="py-2 px-3" style={{ color: "var(--text-muted)" }}>{hostName}</td>
                    <td className="py-2 px-3 text-xs" style={{ color: "var(--text-muted)" }}>
                      {new Date(Number(e.clock) * 1000).toLocaleString("pt-BR")}
                    </td>
                    <td className="py-2 px-3">
                      {e.acknowledged === "1" ? (
                        <StatusBadge variant="ok">Sim</StatusBadge>
                      ) : (
                        <StatusBadge variant="neutral">Não</StatusBadge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
