// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  RefreshCw,
  CheckCheck,
  Search,
  ChevronDown,
  ChevronRight,
  Monitor,
  Clock,
  Zap,
} from "lucide-react";
import { apiFetch } from "@/lib/zabbix-fetch";
import { useApi } from "@/lib/use-api";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  ErrorState,
  EmptyState,
  LoadingState,
} from "@/components/ui/state-display";
import { ProblemActions } from "@/components/problem-actions";
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

const SEVERITY_GROUPS = [
  {
    key: "critical",
    label: "Críticos",
    severities: ["4", "5"],
    variant: "error" as const,
  },
  {
    key: "warning",
    label: "Avisos",
    severities: ["2", "3"],
    variant: "warning" as const,
  },
  {
    key: "info",
    label: "Informativos",
    severities: ["0", "1"],
    variant: "info" as const,
  },
];

// Intervalo de auto-refresh
const AUTO_REFRESH_INTERVAL = 30_000;

// Converte timestamp UNIX para tempo relativo em portugues
function timeAgo(clock: number): string {
  const diff = Math.floor(Date.now() / 1000) - clock;
  if (diff < 0) return "agora";
  if (diff < 60) return "agora";
  if (diff < 3600) return `há ${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
  return `há ${Math.floor(diff / 86400)}d`;
}

// Converte timestamp UNIX para data completa
function fullDate(clock: number): string {
  return new Date(clock * 1000).toLocaleString("pt-BR");
}

export default function ProblemsPage() {
  const [filterAck, setFilterAck] = useState<string>("all");
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [ackMessage, setAckMessage] = useState("");
  const [ackLoading, setAckLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const params = new URLSearchParams();
  if (filterAck === "acknowledged") params.set("acknowledged", "true");
  if (filterAck === "unacknowledged") params.set("acknowledged", "false");
  if (filterSeverity !== "all") params.set("severity_from", filterSeverity);
  const { data, error, isLoading, progress, mutate } = useApi<{
    data: ZabbixProblem[];
  }>(`/api/v1/zabbix/problems?${params.toString()}`);

  // Auto-refresh a cada 30s quando ativado
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      mutate();
    }, AUTO_REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [autoRefresh, mutate]);

  // Atualiza timestamps relativos a cada minuto
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(interval);
  }, []);

  // Filtra por busca textual (nome do problema ou nome do host)
  const problems = useMemo(() => {
    const allProblems = data?.data ?? [];
    if (!searchQuery.trim()) return allProblems;
    const q = searchQuery.toLowerCase();
    return allProblems.filter((p) => {
      const name = p.name.toLowerCase();
      const hostName = p.hosts?.[0]?.name?.toLowerCase() ?? "";
      return name.includes(q) || hostName.includes(q);
    });
  }, [data, searchQuery]);

  // Agrupa por severidade
  const groupedProblems = useMemo(() => {
    const groups: Record<string, ZabbixProblem[]> = {
      critical: [],
      warning: [],
      info: [],
    };
    for (const p of problems) {
      const sev = String(p.severity ?? "0");
      for (const g of SEVERITY_GROUPS) {
        if (g.severities.includes(sev)) {
          groups[g.key]!.push(p);
          break;
        }
      }
    }
    return groups;
  }, [problems]);

  // Contadores para o header
  const counts = useMemo(
    () => ({
      critical: groupedProblems.critical!.length,
      warning: groupedProblems.warning!.length,
      info: groupedProblems.info!.length,
      unack: problems.filter((p) => String(p.acknowledged) !== "1").length,
      total: problems.length,
    }),
    [groupedProblems, problems],
  );

  const handleAcknowledge = useCallback(async () => {
    if (selectedIds.size === 0 || !ackMessage.trim()) return;
    setAckLoading(true);
    setActionError(null);
    try {
      await apiFetch("/api/v1/zabbix/acknowledge", {
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
      setActionError(
        err instanceof Error ? err.message : "Erro ao acknowledge",
      );
    } finally {
      setAckLoading(false);
    }
  }, [selectedIds, ackMessage, mutate]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const selectAllInGroup = useCallback((groupProblems: ZabbixProblem[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = groupProblems.every((p) => next.has(p.eventid));
      if (allSelected) {
        for (const p of groupProblems) next.delete(p.eventid);
      } else {
        for (const p of groupProblems) next.add(p.eventid);
      }
      return next;
    });
  }, []);

  // Renderiza um card de problema
  function renderProblemCard(p: ZabbixProblem) {
    const sev = String(p.severity ?? "0");
    const sevVariant = SEVERITY_VARIANTS[sev] ?? "info";
    const hostName = p.hosts?.[0]?.name ?? "—";
    const hostId = p.hosts?.[0]?.hostid;
    const isSelected = selectedIds.has(p.eventid);
    const isExpanded = expandedId === p.eventid;
    const isAck = String(p.acknowledged) === "1";

    return (
      <div
        key={p.eventid}
        className="rounded-lg transition-all"
        style={{
          background: isSelected ? "var(--brand-glow)" : "var(--surface-2)",
          border: `1px solid ${
            isSelected
              ? "var(--brand-primary)"
              : isExpanded
                ? "var(--border-strong)"
                : "var(--border-default)"
          }`,
        }}
      >
        {/* Linha principal — click expande */}
        <div
          className="flex items-start gap-3 p-3 cursor-pointer"
          onClick={(e) => {
            // Nao expande se clicou no checkbox
            if ((e.target as HTMLElement).tagName === "INPUT") return;
            toggleExpand(p.eventid);
          }}
        >
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => toggleSelect(p.eventid)}
            onClick={(e) => e.stopPropagation()}
            className="mt-1 shrink-0"
            style={{ accentColor: "var(--brand-primary)" }}
          />
          {/* Indicador de severidade */}
          <span
            className="rounded-full shrink-0 mt-0.5"
            style={{
              width: 8,
              height: 8,
              background: `var(--status-${sevVariant === "critical" ? "error" : sevVariant}-text)`,
              boxShadow:
                Number(sev) >= 4
                  ? `0 0 6px color-mix(in srgb, var(--status-error-text) 40%, transparent)`
                  : undefined,
              animation: Number(sev) >= 4 ? "pulse 2s infinite" : undefined,
            }}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="text-sm font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                {p.name}
              </span>
              <StatusBadge variant={sevVariant} dot pulse={Number(sev) >= 4}>
                {SEVERITY_LABELS[sev]}
              </StatusBadge>
              {isAck && (
                <StatusBadge variant="ok">
                  <CheckCheck size={10} />
                  Reconhecido
                </StatusBadge>
              )}
              {p.suppressed && (
                <StatusBadge variant="neutral">Suprimido</StatusBadge>
              )}
            </div>
            <div
              className="flex items-center gap-3 mt-1 text-xs flex-wrap"
              style={{ color: "var(--text-muted)" }}
            >
              {hostId ? (
                <Link
                  href={`/dashboard/devices/${hostId}`}
                  className="flex items-center gap-1 hover:opacity-80"
                  style={{ color: "var(--text-muted)" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Monitor size={11} />
                  {hostName}
                </Link>
              ) : (
                <span className="flex items-center gap-1">
                  <Monitor size={11} />
                  {hostName}
                </span>
              )}
              <span
                className="flex items-center gap-1"
                title={fullDate(Number(p.clock))}
              >
                <Clock size={11} />
                {timeAgo(Number(p.clock))}
              </span>
              {/* Tags */}
              {p.tags && p.tags.length > 0 && (
                <span className="flex items-center gap-1">
                  {p.tags.slice(0, 3).map((tag, i) => (
                    <span
                      key={i}
                      className="rounded px-1.5 py-0.5 text-[10px]"
                      style={{
                        background: "var(--surface-3)",
                        border: "1px solid var(--border-default)",
                      }}
                    >
                      {tag.value ? `${tag.tag}: ${tag.value}` : tag.tag}
                    </span>
                  ))}
                  {p.tags.length > 3 && (
                    <span className="text-[10px]">+{p.tags.length - 3}</span>
                  )}
                </span>
              )}
            </div>
          </div>
          {/* Indicador de expansao */}
          {isExpanded ? (
            <ChevronDown
              size={16}
              className="shrink-0 mt-1"
              style={{ color: "var(--text-muted)" }}
            />
          ) : (
            <ChevronRight
              size={16}
              className="shrink-0 mt-1"
              style={{ color: "var(--text-muted)" }}
            />
          )}
        </div>

        {/* Detalhes expandidos — action menu */}
        {isExpanded && (
          <div
            className="px-3 pb-3 pt-1 border-t"
            style={{ borderColor: "var(--border-default)" }}
          >
            <ProblemActions
              problem={p}
              hostId={hostId}
              hostName={hostName}
              onMutate={mutate}
            />
          </div>
        )}
      </div>
    );
  }

  // Renderiza um grupo de severidade
  function renderGroup(
    groupKey: string,
    groupLabel: string,
    groupVariant: "error" | "warning" | "info",
    groupProblems: ZabbixProblem[],
  ) {
    if (groupProblems.length === 0) return null;

    const allSelected = groupProblems.every((p) => selectedIds.has(p.eventid));

    return (
      <div key={groupKey}>
        {/* Header do grupo */}
        <div className="flex items-center gap-2 mb-2">
          <span
            className="rounded-full"
            style={{
              width: 8,
              height: 8,
              background: `var(--status-${groupVariant === "error" ? "error" : groupVariant === "warning" ? "warning" : "info"}-text)`,
              boxShadow:
                groupVariant === "error"
                  ? "0 0 8px color-mix(in srgb, var(--status-error-text) 40%, transparent)"
                  : undefined,
            }}
          />
          <span
            className="text-xs font-bold uppercase tracking-wider"
            style={{
              color: `var(--status-${groupVariant === "error" ? "error" : groupVariant === "warning" ? "warning" : "info"}-text)`,
            }}
          >
            {groupLabel}
          </span>
          <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
            ({groupProblems.length})
          </span>
          {/* Selecionar todos do grupo */}
          <button
            onClick={() => selectAllInGroup(groupProblems)}
            className="ml-auto text-[10px] transition-colors hover:opacity-80"
            style={{ color: "var(--text-muted)" }}
          >
            {allSelected ? "Desmarcar todos" : "Selecionar todos"}
          </button>
        </div>
        {/* Cards do grupo */}
        <div className="space-y-1.5">
          {groupProblems.map(renderProblemCard)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" style={{ animation: "fadeIn 0.3s ease-out" }}>
      {/* Header com contadores */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1
            className="text-xl font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            Problemas Ativos
          </h1>
          <div
            className="flex items-center gap-3 text-[10px]"
            style={{ color: "var(--text-muted)" }}
          >
            <span className="flex items-center gap-1">
              <span
                className="rounded-full"
                style={{
                  width: 6,
                  height: 6,
                  background: "var(--status-error-text)",
                }}
              />
              {counts.critical} crítico{counts.critical !== 1 ? "s" : ""}
            </span>
            <span className="flex items-center gap-1">
              <span
                className="rounded-full"
                style={{
                  width: 6,
                  height: 6,
                  background: "var(--status-warning-text)",
                }}
              />
              {counts.warning} aviso{counts.warning !== 1 ? "s" : ""}
            </span>
            <span className="flex items-center gap-1">
              <span
                className="rounded-full"
                style={{
                  width: 6,
                  height: 6,
                  background: "var(--text-muted)",
                }}
              />
              {counts.info} info
            </span>
            {counts.unack > 0 && (
              <span
                className="flex items-center gap-1 rounded-full px-2 py-0.5"
                style={{
                  background: "var(--status-error-bg)",
                  color: "var(--status-error-text)",
                  border: "1px solid var(--status-error-border)",
                }}
              >
                <Zap size={9} />
                {counts.unack} não reconhecido{counts.unack !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Auto-refresh toggle */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              background: autoRefresh
                ? "var(--brand-glow)"
                : "var(--surface-2)",
              border: `1px solid ${
                autoRefresh ? "var(--brand-primary)" : "var(--border-default)"
              }`,
              color: autoRefresh ? "var(--brand-primary)" : "var(--text-muted)",
            }}
          >
            <RefreshCw
              size={12}
              className={autoRefresh ? "animate-spin" : ""}
              style={{ animationDuration: "3s" }}
            />
            Auto
          </button>
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
      </div>

      {/* Filtros + busca */}
      <div className="flex flex-wrap items-center gap-3">
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-1.5 flex-1 min-w-[200px]"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border-default)",
          }}
        >
          <Search size={14} style={{ color: "var(--text-muted)" }} />
          <input
            type="text"
            placeholder="Buscar por problema ou host..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: "var(--text-primary)" }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="text-xs hover:opacity-80"
              style={{ color: "var(--text-muted)" }}
            >
              limpar
            </button>
          )}
        </div>
        <select
          value={filterAck}
          onChange={(e) => setFilterAck(e.target.value)}
          className="rounded-lg px-3 py-1.5 text-sm outline-none"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border-default)",
            color: "var(--text-primary)",
          }}
        >
          <option value="all">Todos</option>
          <option value="unacknowledged">Não reconhecidos</option>
          <option value="acknowledged">Reconhecidos</option>
        </select>
        <select
          value={filterSeverity}
          onChange={(e) => setFilterSeverity(e.target.value)}
          className="rounded-lg px-3 py-1.5 text-sm outline-none"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border-default)",
            color: "var(--text-primary)",
          }}
        >
          <option value="all">Todas severidades</option>
          <option value="3">Aviso+</option>
          <option value="4">Crítico+</option>
        </select>
      </div>

      {/* Acknowledge bar */}
      {selectedIds.size > 0 && (
        <div
          className="flex items-center gap-3 rounded-lg p-3"
          style={{
            background: "var(--brand-glow)",
            border: "1px solid var(--brand-primary)",
          }}
        >
          <span
            className="text-sm font-medium"
            style={{ color: "var(--brand-primary)" }}
          >
            {selectedIds.size} selecionado(s)
          </span>
          <input
            type="text"
            placeholder="Mensagem de acknowledge..."
            value={ackMessage}
            onChange={(e) => setAckMessage(e.target.value)}
            className="flex-1 rounded-lg px-3 py-1.5 text-sm outline-none"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-default)",
              color: "var(--text-primary)",
            }}
          />
          <button
            onClick={handleAcknowledge}
            disabled={ackLoading || !ackMessage.trim()}
            className="flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors disabled:opacity-50"
            style={{
              background: "var(--brand-primary)",
              color: "var(--surface-0)",
            }}
          >
            <CheckCheck size={14} />
            {ackLoading ? "Enviando..." : "Acknowledge"}
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs transition-colors hover:opacity-80"
            style={{ color: "var(--text-muted)" }}
          >
            limpar
          </button>
        </div>
      )}

      {(error || actionError) && (
        <ErrorState
          title="Erro"
          message={error ?? actionError ?? "Erro desconhecido"}
        />
      )}

      {isLoading ? (
        <LoadingState label="Carregando problemas..." progress={progress} />
      ) : problems.length === 0 ? (
        <EmptyState
          title={searchQuery ? "Nenhum resultado" : "Nenhum problema ativo"}
          message={
            searchQuery
              ? "Tente buscar por outro termo."
              : "Não há problemas ativos no momento."
          }
        />
      ) : (
        <div className="space-y-5">
          {SEVERITY_GROUPS.map((g) =>
            renderGroup(
              g.key,
              g.label,
              g.variant as "error" | "warning" | "info",
              groupedProblems[g.key] ?? [],
            ),
          )}
        </div>
      )}
    </div>
  );
}
