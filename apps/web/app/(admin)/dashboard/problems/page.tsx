"use client";

import { useState } from "react";
import { RefreshCw, CheckCheck } from "lucide-react";
import { apiFetch } from "@/lib/zabbix-fetch";
import { useApi } from "@/lib/use-api";
import { StatusBadge } from "@/components/ui/status-badge";
import { StateDisplay, ErrorState, EmptyState, LoadingState } from "@/components/ui/state-display";
import type { ZabbixProblem } from "@repo/zabbix";

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

export default function ProblemsPage() {
  const [filterAck, setFilterAck] = useState<string>("all");
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [ackMessage, setAckMessage] = useState("");
  const [ackLoading, setAckLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const params = new URLSearchParams();
  if (filterAck === "acknowledged") params.set("acknowledged", "true");
  if (filterAck === "unacknowledged") params.set("acknowledged", "false");
  if (filterSeverity !== "all") params.set("severity_from", filterSeverity);
  const { data, error, isLoading, progress, mutate } = useApi<{ data: ZabbixProblem[] }>(`/api/zabbix/problems?${params.toString()}`);
  const problems = data?.data ?? [];

  async function handleAcknowledge() {
    if (selectedIds.size === 0 || !ackMessage.trim()) return;
    setAckLoading(true);
    try {
      await apiFetch("/api/zabbix/acknowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventids: Array.from(selectedIds),
          message: ackMessage,
          action: 1,
        }),
      });
      setSelectedIds(new Set());
      setAckMessage("");
      await mutate();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Erro ao acknowledge");
    } finally {
      setAckLoading(false);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Problemas Ativos</h1>
        <button
          onClick={() => mutate()}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors hover:opacity-80"
          style={{ background: "var(--brand-glow)", border: "1px solid var(--brand-primary)", color: "var(--brand-primary)" }}
        >
          <RefreshCw size={14} />
          Atualizar
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <select
          value={filterAck}
          onChange={(e) => setFilterAck(e.target.value)}
          className="rounded-lg px-3 py-1.5 text-sm outline-none"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
        >
          <option value="all">Todos</option>
          <option value="unacknowledged">Não reconhecidos</option>
          <option value="acknowledged">Reconhecidos</option>
        </select>
        <select
          value={filterSeverity}
          onChange={(e) => setFilterSeverity(e.target.value)}
          className="rounded-lg px-3 py-1.5 text-sm outline-none"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
        >
          <option value="all">Todas severidades</option>
          <option value="3">Aviso+</option>
          <option value="4">Crítico+</option>
        </select>
      </div>

      {/* Acknowledge bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg p-3" style={{ background: "var(--brand-glow)", border: "1px solid var(--brand-primary)" }}>
          <span className="text-sm font-medium" style={{ color: "var(--brand-primary)" }}>{selectedIds.size} selecionado(s)</span>
          <input
            type="text"
            placeholder="Mensagem de acknowledge..."
            value={ackMessage}
            onChange={(e) => setAckMessage(e.target.value)}
            className="flex-1 rounded-lg px-3 py-1.5 text-sm outline-none"
            style={{ background: "var(--surface-1)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
          />
          <button
            onClick={handleAcknowledge}
            disabled={ackLoading || !ackMessage.trim()}
            className="flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors disabled:opacity-50"
            style={{ background: "var(--brand-primary)", color: "var(--surface-0)" }}
          >
            <CheckCheck size={14} />
            {ackLoading ? "Enviando..." : "Acknowledge"}
          </button>
        </div>
      )}

      {(error || actionError) && (
        <ErrorState title="Erro" message={error ?? actionError ?? "Erro desconhecido"} />
      )}

      {isLoading ? (
        <LoadingState label="Carregando problemas..." progress={progress} />
      ) : problems.length === 0 ? (
        <EmptyState title="Nenhum problema ativo" message="Não há problemas ativos no momento." />
      ) : (
        <div className="space-y-2">
          {problems.map((p) => {
            const sev = p.severity ?? "0";
            const sevVariant = SEVERITY_VARIANTS[sev] ?? "info";
            const hostName = p.hosts?.[0]?.name ?? "—";
            const isSelected = selectedIds.has(p.eventid);
            return (
              <div
                key={p.eventid}
                className="flex items-start gap-3 rounded-lg p-3 transition-colors cursor-pointer"
                style={{
                  background: isSelected ? "var(--brand-glow)" : "var(--surface-2)",
                  border: `1px solid ${isSelected ? "var(--brand-primary)" : "var(--border-default)"}`,
                }}
                onClick={() => toggleSelect(p.eventid)}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelect(p.eventid)}
                  className="mt-1 shrink-0"
                  style={{ accentColor: "var(--brand-primary)" }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{p.name}</span>
                    <StatusBadge variant={sevVariant} dot pulse={Number(sev) >= 4}>
                      {SEVERITY_LABELS[sev]}
                    </StatusBadge>
                    {String(p.acknowledged) === "1" && (
                      <StatusBadge variant="ok">
                        <CheckCheck size={10} />
                        Reconhecido
                      </StatusBadge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                    <span>{hostName}</span>
                    <span>{new Date(Number(p.clock) * 1000).toLocaleString("pt-BR")}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
