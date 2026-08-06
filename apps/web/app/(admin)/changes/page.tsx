// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState, type ReactElement } from "react";
import { RefreshCw, ArrowLeft, Plus } from "lucide-react";
import { LoadingState } from "@/components/ui/state-display";
import { useApi } from "@/lib/use-api";

const COLORS = {
  bg: "var(--surface-0)",
  card: "var(--surface-2)",
  border: "var(--border-default)",
  text: "var(--text-primary)",
  muted: "var(--text-muted)",
  teal: "var(--brand-primary)",
  green: "var(--status-ok-text)",
  red: "var(--status-error-text)",
  amber: "var(--status-warning-text)",
  blue: "var(--status-info-text)",
  purple: "var(--status-info-text)",
};

const CHANGE_TYPES = ["standard", "normal", "emergency"];
const PRIORITIES = ["low", "medium", "high", "critical"];
const RISK_LEVELS = ["low", "medium", "high", "critical"];

const STATUS_COLORS: Record<string, string> = {
  draft: COLORS.muted,
  submitted: COLORS.blue,
  under_review: COLORS.amber,
  approved: COLORS.green,
  rejected: COLORS.red,
  scheduled: COLORS.blue,
  in_progress: COLORS.amber,
  implemented: COLORS.green,
  failed: COLORS.red,
  rolled_back: COLORS.purple,
  cancelled: COLORS.muted,
};

const PRIORITY_COLORS: Record<string, string> = {
  low: COLORS.muted,
  medium: COLORS.blue,
  high: COLORS.amber,
  critical: COLORS.red,
};

interface ChangeRequest {
  id: string;
  rfc_number: string;
  title: string;
  description: string | null;
  change_type: string;
  priority: string;
  risk_level: string;
  status: string;
  requested_by: string;
  requester_name?: string;
  assigned_to: string | null;
  assignee_name?: string;
  planned_start_at: string | null;
  planned_end_at: string | null;
  actual_start_at: string | null;
  actual_end_at: string | null;
  affected_systems: string[];
  affected_services: string[];
  impact_assessment: string | null;
  rollback_plan: string | null;
  rollback_status: string | null;
  approval_required: boolean;
  approved_by: string | null;
  approver_name?: string;
  approved_at: string | null;
  approval_comment: string | null;
  implementation_notes: string | null;
  post_implementation_review: string | null;
  created_at: string;
}

interface ChangeTask {
  id: string;
  title: string;
  description: string | null;
  task_order: number;
  task_type: string;
  status: string;
  assigned_to: string | null;
  assignee_name?: string;
  notes: string | null;
}

interface Approval {
  id: string;
  approver_id: string;
  approver_name?: string;
  approver_role: string | null;
  status: string;
  comment: string | null;
  approved_at: string | null;
}

interface Stats {
  total: number;
  pending_approval: number;
  approved: number;
  in_progress: number;
  implemented: number;
  failed: number;
  emergency: number;
  success_rate: number;
  recent: Array<Record<string, unknown>>;
  upcoming: Array<Record<string, unknown>>;
  by_type: Array<Record<string, unknown>>;
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function KpiCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color: string;
}) {
  return (
    <div
      className="p-4 rounded-xl"
      style={{ background: COLORS.card, border: `1px solid ${color}33` }}
    >
      <div
        className="text-[10px] uppercase font-bold mb-1"
        style={{ color: COLORS.muted }}
      >
        {label}
      </div>
      <div className="text-2xl font-bold" style={{ color }}>
        {value}
      </div>
      {sub && (
        <div className="text-[10px] mt-1" style={{ color: COLORS.muted }}>
          {sub}
        </div>
      )}
    </div>
  );
}

export default function ChangesPage() {
  const [selectedChange, setSelectedChange] = useState<ChangeRequest | null>(
    null,
  );
  const [tasks, setTasks] = useState<ChangeTask[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tab, setTab] = useState<"pipeline" | "calendar" | "details">(
    "pipeline",
  );
  const [showCreate, setShowCreate] = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  // Create form
  const [crTitle, setCrTitle] = useState("");
  const [crDescription, setCrDescription] = useState("");
  const [crType, setCrType] = useState("normal");
  const [crPriority, setCrPriority] = useState("medium");
  const [crRisk, setCrRisk] = useState("low");
  const [crStart, setCrStart] = useState("");
  const [crEnd, setCrEnd] = useState("");
  const [crSystems, setCrSystems] = useState("");
  const [crServices, setCrServices] = useState("");
  const [crImpact, setCrImpact] = useState("");
  const [crRollback, setCrRollback] = useState("");

  // Action comment
  const [actionComment, setActionComment] = useState("");

  const changesQuery = filterStatus
    ? `/api/changes?status=${filterStatus}`
    : "/api/changes";
  const { data: chData, mutate: mutateChanges } = useApi<{
    changes: ChangeRequest[];
  }>(changesQuery);
  const { data: stats, mutate: mutateStats } =
    useApi<Stats>("/api/changes/stats");
  const changes = chData?.changes ?? [];
  const calendarQuery =
    tab === "calendar"
      ? `/api/changes/calendar?month=${calendarMonth.year}-${String(calendarMonth.month + 1).padStart(2, "0")}`
      : null;
  const { data: calData } = useApi<{
    events: Array<{
      id: string;
      rfc_number: string;
      title: string;
      priority: string;
      status: string;
      planned_start_at: string;
      change_type: string;
    }>;
  }>(calendarQuery);
  const calendarEvents = calData?.events ?? [];

  async function fetchDetail(changeId: string) {
    try {
      const res = await fetch(`/api/changes/${changeId}`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedChange(data.change);
        setTasks(data.tasks ?? []);
        setApprovals(data.approvals ?? []);
        setTab("details");
      }
    } catch (err) {
      console.error("Operacao falhou:", err);
    }
  }

  async function handleCreate() {
    setError(null);
    if (!crTitle) {
      setError("Título obrigatório");
      return;
    }
    try {
      const res = await fetch("/api/changes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: crTitle,
          description: crDescription || undefined,
          change_type: crType,
          priority: crPriority,
          risk_level: crRisk,
          planned_start_at: crStart
            ? new Date(crStart).toISOString()
            : undefined,
          planned_end_at: crEnd ? new Date(crEnd).toISOString() : undefined,
          affected_systems: crSystems
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          affected_services: crServices
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          impact_assessment: crImpact || undefined,
          rollback_plan: crRollback || undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSuccess(`RFC criada: ${data.rfc_number}`);
        setShowCreate(false);
        setCrTitle("");
        setCrDescription("");
        setCrSystems("");
        setCrServices("");
        setCrImpact("");
        setCrRollback("");
        setCrStart("");
        setCrEnd("");
        mutateChanges();
        mutateStats();
      }
    } catch {
      setError("Erro de conexão");
    }
  }

  async function handleAction(changeId: string, action: string) {
    setError(null);
    try {
      const res = await fetch(
        `/api/changes/${changeId}/action?action=${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ comment: actionComment || undefined }),
        },
      );
      if (res.ok) {
        setSuccess(`Ação "${action}" executada`);
        setActionComment("");
        mutateChanges();
        mutateStats();
        fetchDetail(changeId);
      }
    } catch {
      setError("Erro de conexão");
    }
  }

  async function handleTaskStatus(
    changeId: string,
    taskId: string,
    newStatus: string,
  ) {
    try {
      await fetch(`/api/changes/${changeId}/tasks`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: newStatus }),
      });
      fetchDetail(changeId);
    } catch (err) {
      console.error("Operacao falhou:", err);
    }
  }

  const TABS = [
    { key: "pipeline", label: "Pipeline" },
    { key: "calendar", label: "Calendário" },
    { key: "details", label: "Detalhes" },
  ] as const;

  const STATUS_FILTERS = [
    "",
    "submitted",
    "under_review",
    "approved",
    "in_progress",
    "implemented",
    "failed",
    "rolled_back",
  ];

  // Pipeline columns
  const PIPELINE_STAGES = [
    { key: "submitted", label: "Aguardando Aprovação", color: COLORS.blue },
    { key: "approved", label: "Aprovado", color: COLORS.green },
    { key: "in_progress", label: "Em Execução", color: COLORS.amber },
    { key: "implemented", label: "Implementado", color: COLORS.green },
    { key: "failed", label: "Falhou / Rollback", color: COLORS.red },
  ];

  if (!chData && !stats) return <LoadingState label="Carregando mudancas..." />;

  return (
    <div
      className="min-h-screen p-6 space-y-6"
      style={{
        background: COLORS.bg,
        fontFamily: "'JetBrains Mono','Consolas',monospace",
        color: COLORS.text,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold" style={{ color: COLORS.teal }}>
            Change Management
          </h1>
          <p className="text-[12px]" style={{ color: COLORS.muted }}>
            RFC · Approvals · Impact Assessment · Rollback · Calendar
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              mutateChanges();
              mutateStats();
            }}
            className="text-[12px] px-3 py-1.5 rounded border"
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
              color: COLORS.muted,
              cursor: "pointer",
            }}
          >
            <RefreshCw size={12} className="inline" /> Atualizar
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="text-[12px] px-3 py-1.5 rounded font-bold"
            style={{
              background: COLORS.teal,
              color: COLORS.bg,
              cursor: "pointer",
            }}
          >
            <Plus size={12} className="inline" /> Nova RFC
          </button>
          <a
            href="/dashboard"
            className="text-[12px] px-3 py-1.5 rounded border"
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
              color: COLORS.muted,
            }}
          >
            <ArrowLeft size={12} className="inline" /> Dashboard
          </a>
        </div>
      </div>

      {error && (
        <div
          className="rounded-md p-3 text-sm"
          style={{
            background: `var(--status-error-bg)`,
            border: `1px solid var(--status-error-border)`,
            color: COLORS.red,
          }}
        >
          {error}
        </div>
      )}
      {success && (
        <div
          className="rounded-md p-3 text-sm"
          style={{
            background: `var(--status-ok-bg)`,
            border: `1px solid var(--status-ok-border)`,
            color: COLORS.green,
          }}
        >
          {success}
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
          <KpiCard label="Total" value={stats.total} color={COLORS.teal} />
          <KpiCard
            label="Pend. Aprov."
            value={stats.pending_approval}
            color={COLORS.amber}
          />
          <KpiCard
            label="Aprovados"
            value={stats.approved}
            color={COLORS.green}
          />
          <KpiCard
            label="Em Exec."
            value={stats.in_progress}
            color={COLORS.blue}
          />
          <KpiCard
            label="Implement."
            value={stats.implemented}
            color={COLORS.green}
          />
          <KpiCard label="Falhas" value={stats.failed} color={COLORS.red} />
          <KpiCard
            label="Emergência"
            value={stats.emergency}
            color={COLORS.red}
          />
          <KpiCard
            label="Taxa Sucesso"
            value={`${stats.success_rate}%`}
            color={stats.success_rate >= 80 ? COLORS.green : COLORS.amber}
          />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-4 py-2 rounded-t-md text-[12px] font-bold transition-colors"
            style={{
              background: tab === t.key ? COLORS.card : "transparent",
              border: `1px solid ${COLORS.border}`,
              borderBottom:
                tab === t.key ? "none" : `1px solid ${COLORS.border}`,
              color: tab === t.key ? COLORS.teal : COLORS.muted,
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Pipeline */}
      {tab === "pipeline" && (
        <div
          className="rounded-xl p-6"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderTop: "none",
          }}
        >
          {/* Filters */}
          <div className="flex gap-2 mb-4">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s || "all"}
                onClick={() => setFilterStatus(s)}
                className="px-3 py-1 rounded text-[10px] font-bold uppercase"
                style={{
                  background:
                    filterStatus === s ? `var(--brand-glow)` : COLORS.bg,
                  border: `1px solid ${filterStatus === s ? COLORS.teal : COLORS.border}`,
                  color: filterStatus === s ? COLORS.teal : COLORS.muted,
                  cursor: "pointer",
                }}
              >
                {s || "Todos"}
              </button>
            ))}
          </div>

          {/* Kanban Board */}
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
            {PIPELINE_STAGES.map((stage) => {
              const stageChanges = changes.filter((ch) => {
                if (stage.key === "failed")
                  return ch.status === "failed" || ch.status === "rolled_back";
                return ch.status === stage.key;
              });
              return (
                <div key={stage.key} className="space-y-2">
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className="text-[10px] font-bold uppercase"
                      style={{ color: stage.color }}
                    >
                      {stage.label}
                    </span>
                    <span
                      className="px-2 py-0.5 rounded text-[10px] font-bold"
                      style={{
                        background: `${stage.color}15`,
                        color: stage.color,
                      }}
                    >
                      {stageChanges.length}
                    </span>
                  </div>
                  {stageChanges.map((ch) => (
                    <button
                      key={ch.id}
                      onClick={() => fetchDetail(ch.id)}
                      className="w-full text-left p-3 rounded-md"
                      style={{
                        background: COLORS.bg,
                        border: `1px solid ${COLORS.border}`,
                        cursor: "pointer",
                      }}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className="text-[10px] font-bold"
                          style={{ color: COLORS.teal }}
                        >
                          {ch.rfc_number}
                        </span>
                        <span
                          className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase"
                          style={{
                            background: `${PRIORITY_COLORS[ch.priority] ?? COLORS.muted}15`,
                            color: PRIORITY_COLORS[ch.priority] ?? COLORS.muted,
                          }}
                        >
                          {ch.priority}
                        </span>
                      </div>
                      <div
                        className="text-[12px] mb-1"
                        style={{ color: COLORS.text }}
                      >
                        {ch.title}
                      </div>
                      <div
                        className="flex items-center gap-2 text-[10px]"
                        style={{ color: COLORS.muted }}
                      >
                        <span
                          style={{
                            color:
                              ch.change_type === "emergency"
                                ? COLORS.red
                                : COLORS.muted,
                          }}
                        >
                          {ch.change_type}
                        </span>
                        <span>·</span>
                        <span>{ch.requester_name ?? "—"}</span>
                      </div>
                      {ch.planned_start_at && (
                        <div
                          className="text-[10px] mt-1"
                          style={{ color: COLORS.blue }}
                        >
                          📅 {formatTime(ch.planned_start_at)}
                        </div>
                      )}
                    </button>
                  ))}
                  {stageChanges.length === 0 && (
                    <div
                      className="text-[10px] text-center py-4"
                      style={{ color: COLORS.muted }}
                    >
                      —
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab: Calendar */}
      {tab === "calendar" && (
        <div
          className="rounded-xl p-6"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderTop: "none",
          }}
        >
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() =>
                setCalendarMonth((prev) => {
                  const d = new Date(prev.year, prev.month - 1, 1);
                  return { year: d.getFullYear(), month: d.getMonth() };
                })
              }
              className="text-[14px] px-3 py-1 rounded"
              style={{
                background: COLORS.bg,
                border: `1px solid ${COLORS.border}`,
                color: COLORS.muted,
                cursor: "pointer",
              }}
            >
              ←
            </button>
            <h3 className="text-sm font-bold" style={{ color: COLORS.text }}>
              {new Date(
                calendarMonth.year,
                calendarMonth.month,
                1,
              ).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
            </h3>
            <button
              onClick={() =>
                setCalendarMonth((prev) => {
                  const d = new Date(prev.year, prev.month + 1, 1);
                  return { year: d.getFullYear(), month: d.getMonth() };
                })
              }
              className="text-[14px] px-3 py-1 rounded"
              style={{
                background: COLORS.bg,
                border: `1px solid ${COLORS.border}`,
                color: COLORS.muted,
                cursor: "pointer",
              }}
            >
              →
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
              <div
                key={d}
                className="text-center text-[10px] font-bold uppercase py-1"
                style={{ color: COLORS.muted }}
              >
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {(() => {
              const firstDay = new Date(
                calendarMonth.year,
                calendarMonth.month,
                1,
              );
              const lastDay = new Date(
                calendarMonth.year,
                calendarMonth.month + 1,
                0,
              );
              const startOffset = firstDay.getDay();
              const daysInMonth = lastDay.getDate();
              const today = new Date();
              const isCurrentMonth =
                today.getFullYear() === calendarMonth.year &&
                today.getMonth() === calendarMonth.month;

              const cells: ReactElement[] = [];
              for (let i = 0; i < startOffset; i++) {
                cells.push(
                  <div
                    key={`empty-${i}`}
                    className="min-h-[70px] rounded"
                    style={{ background: COLORS.bg, opacity: 0.3 }}
                  />,
                );
              }
              for (let day = 1; day <= daysInMonth; day++) {
                const dayEvents = calendarEvents.filter((e) => {
                  const eventDate = new Date(e.planned_start_at);
                  return (
                    eventDate.getFullYear() === calendarMonth.year &&
                    eventDate.getMonth() === calendarMonth.month &&
                    eventDate.getDate() === day
                  );
                });
                const isToday = isCurrentMonth && day === today.getDate();
                cells.push(
                  <div
                    key={day}
                    className="min-h-[70px] rounded p-1"
                    style={{
                      background: isToday ? `var(--brand-glow)` : COLORS.bg,
                      border: isToday
                        ? `1px solid color-mix(in srgb, var(--brand-primary) 27%, transparent)`
                        : `1px solid ${COLORS.border}`,
                    }}
                  >
                    <div
                      className="text-[10px] font-bold mb-1"
                      style={{ color: isToday ? COLORS.teal : COLORS.muted }}
                    >
                      {day}
                    </div>
                    <div className="space-y-0.5">
                      {dayEvents.slice(0, 3).map((ev) => (
                        <button
                          key={ev.id}
                          onClick={() => fetchDetail(ev.id)}
                          className="block w-full text-left text-[9px] px-1 py-0.5 rounded truncate"
                          style={{
                            background: `${PRIORITY_COLORS[ev.priority] ?? COLORS.muted}15`,
                            color: PRIORITY_COLORS[ev.priority] ?? COLORS.muted,
                            cursor: "pointer",
                            border: "none",
                          }}
                        >
                          {ev.change_type === "emergency" ? "🚨 " : ""}
                          {ev.rfc_number}
                        </button>
                      ))}
                      {dayEvents.length > 3 && (
                        <div
                          className="text-[9px]"
                          style={{ color: COLORS.muted }}
                        >
                          +{dayEvents.length - 3} mais
                        </div>
                      )}
                    </div>
                  </div>,
                );
              }
              return cells;
            })()}
          </div>

          {/* Legend */}
          <div
            className="flex items-center gap-4 mt-4 pt-3"
            style={{ borderTop: `1px solid ${COLORS.border}` }}
          >
            <span
              className="text-[10px] font-bold uppercase"
              style={{ color: COLORS.muted }}
            >
              Legenda:
            </span>
            {Object.entries(PRIORITY_COLORS).map(([p, c]) => (
              <div key={p} className="flex items-center gap-1">
                <span
                  className="rounded"
                  style={{ width: 8, height: 8, background: c }}
                />
                <span className="text-[10px]" style={{ color: COLORS.muted }}>
                  {p}
                </span>
              </div>
            ))}
            <div className="flex items-center gap-1">
              <span className="text-[10px]" style={{ color: COLORS.muted }}>
                🚨 = Emergency
              </span>
            </div>
          </div>

          {/* Upcoming list */}
          <h3
            className="text-[12px] font-bold mt-6 mb-3"
            style={{ color: COLORS.muted }}
          >
            PRÓXIMAS MUDANÇAS AGENDADAS
          </h3>
          <div className="space-y-2">
            {stats?.upcoming.length === 0 && (
              <div className="text-[12px]" style={{ color: COLORS.muted }}>
                Nenhuma mudança agendada
              </div>
            )}
            {stats?.upcoming.map((event, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-3 rounded-md"
                style={{
                  background: COLORS.bg,
                  border: `1px solid ${COLORS.border}`,
                }}
              >
                <div>
                  <span
                    className="text-[10px] font-bold"
                    style={{ color: COLORS.teal }}
                  >
                    {event.rfc_number as string}
                  </span>
                  <span
                    className="ml-2 text-[13px]"
                    style={{ color: COLORS.text }}
                  >
                    {event.title as string}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                    style={{
                      background: `${PRIORITY_COLORS[event.priority as string] ?? COLORS.muted}15`,
                      color:
                        PRIORITY_COLORS[event.priority as string] ??
                        COLORS.muted,
                    }}
                  >
                    {event.priority as string}
                  </span>
                  <span className="text-[11px]" style={{ color: COLORS.blue }}>
                    📅 {formatTime(event.planned_start_at as string)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab: Details */}
      {tab === "details" && selectedChange && (
        <div
          className="rounded-xl p-6 space-y-6"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderTop: "none",
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <span
                  className="text-sm font-bold"
                  style={{ color: COLORS.teal }}
                >
                  {selectedChange.rfc_number}
                </span>
                <span
                  className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                  style={{
                    background: `${STATUS_COLORS[selectedChange.status] ?? COLORS.muted}15`,
                    color: STATUS_COLORS[selectedChange.status] ?? COLORS.muted,
                  }}
                >
                  {selectedChange.status}
                </span>
                <span
                  className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                  style={{
                    background: `${PRIORITY_COLORS[selectedChange.priority] ?? COLORS.muted}15`,
                    color:
                      PRIORITY_COLORS[selectedChange.priority] ?? COLORS.muted,
                  }}
                >
                  {selectedChange.priority}
                </span>
              </div>
              <h2 className="text-base mt-1" style={{ color: COLORS.text }}>
                {selectedChange.title}
              </h2>
              <div className="text-[11px] mt-1" style={{ color: COLORS.muted }}>
                Tipo: {selectedChange.change_type} · Risco:{" "}
                {selectedChange.risk_level} · Solicitante:{" "}
                {selectedChange.requester_name ?? "—"}
              </div>
            </div>
            <button
              onClick={() => setTab("pipeline")}
              className="text-[12px] px-3 py-1.5 rounded border"
              style={{
                background: COLORS.bg,
                border: `1px solid ${COLORS.border}`,
                color: COLORS.muted,
                cursor: "pointer",
              }}
            >
              ← Voltar
            </button>
          </div>

          {/* Description & Impact */}
          <div className="grid grid-cols-2 gap-4">
            <div
              className="p-4 rounded-md"
              style={{
                background: COLORS.bg,
                border: `1px solid ${COLORS.border}`,
              }}
            >
              <h4
                className="text-[10px] font-bold uppercase mb-2"
                style={{ color: COLORS.muted }}
              >
                Descrição
              </h4>
              <div className="text-[12px]" style={{ color: COLORS.text }}>
                {selectedChange.description ?? "—"}
              </div>
            </div>
            <div
              className="p-4 rounded-md"
              style={{
                background: COLORS.bg,
                border: `1px solid ${COLORS.border}`,
              }}
            >
              <h4
                className="text-[10px] font-bold uppercase mb-2"
                style={{ color: COLORS.muted }}
              >
                Avaliação de Impacto
              </h4>
              <div className="text-[12px]" style={{ color: COLORS.text }}>
                {selectedChange.impact_assessment ?? "—"}
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {selectedChange.affected_systems.map((s, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 rounded text-[10px]"
                    style={{
                      background: `var(--status-info-bg)`,
                      color: COLORS.blue,
                    }}
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Rollback Plan */}
          <div
            className="p-4 rounded-md"
            style={{
              background: COLORS.bg,
              border: `1px solid ${COLORS.border}`,
            }}
          >
            <h4
              className="text-[10px] font-bold uppercase mb-2"
              style={{ color: COLORS.muted }}
            >
              Plano de Rollback
            </h4>
            <div className="text-[12px]" style={{ color: COLORS.text }}>
              {selectedChange.rollback_plan ?? "—"}
            </div>
            {selectedChange.rollback_status && (
              <span
                className="mt-2 inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                style={{
                  background: `color-mix(in srgb, var(--status-info-text) 8%, transparent)`,
                  color: COLORS.purple,
                }}
              >
                {selectedChange.rollback_status}
              </span>
            )}
          </div>

          {/* Timeline */}
          <div className="grid grid-cols-4 gap-3 text-[11px]">
            <div className="p-2 rounded" style={{ background: COLORS.bg }}>
              <div style={{ color: COLORS.muted }}>Planejado Início</div>
              <div style={{ color: COLORS.blue }}>
                {formatTime(selectedChange.planned_start_at)}
              </div>
            </div>
            <div className="p-2 rounded" style={{ background: COLORS.bg }}>
              <div style={{ color: COLORS.muted }}>Planejado Fim</div>
              <div style={{ color: COLORS.blue }}>
                {formatTime(selectedChange.planned_end_at)}
              </div>
            </div>
            <div className="p-2 rounded" style={{ background: COLORS.bg }}>
              <div style={{ color: COLORS.muted }}>Início Real</div>
              <div style={{ color: COLORS.green }}>
                {formatTime(selectedChange.actual_start_at)}
              </div>
            </div>
            <div className="p-2 rounded" style={{ background: COLORS.bg }}>
              <div style={{ color: COLORS.muted }}>Fim Real</div>
              <div style={{ color: COLORS.green }}>
                {formatTime(selectedChange.actual_end_at)}
              </div>
            </div>
          </div>

          {/* Tasks */}
          <div>
            <h4
              className="text-[10px] font-bold uppercase mb-2"
              style={{ color: COLORS.muted }}
            >
              TAREFAS DA MUDANÇA
            </h4>
            <div className="space-y-1">
              {tasks.length === 0 && (
                <div className="text-[12px]" style={{ color: COLORS.muted }}>
                  Nenhuma tarefa
                </div>
              )}
              {tasks.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between p-2 rounded text-[12px]"
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[10px]"
                      style={{ color: COLORS.muted }}
                    >
                      #{t.task_order}
                    </span>
                    <span style={{ color: COLORS.text }}>{t.title}</span>
                    <span
                      className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase"
                      style={{
                        background: `color-mix(in srgb, var(--status-info-text) 8%, transparent)`,
                        color: COLORS.purple,
                      }}
                    >
                      {t.task_type}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                      style={{
                        background: `${STATUS_COLORS[t.status] ?? COLORS.muted}15`,
                        color: STATUS_COLORS[t.status] ?? COLORS.muted,
                      }}
                    >
                      {t.status}
                    </span>
                    {t.status === "pending" && (
                      <button
                        onClick={() =>
                          handleTaskStatus(
                            selectedChange.id,
                            t.id,
                            "in_progress",
                          )
                        }
                        className="text-[10px] px-2 py-0.5 rounded"
                        style={{
                          background: `color-mix(in srgb, var(--status-warning-text) 12%, transparent)`,
                          color: COLORS.amber,
                          cursor: "pointer",
                        }}
                      >
                        Start
                      </button>
                    )}
                    {t.status === "in_progress" && (
                      <button
                        onClick={() =>
                          handleTaskStatus(selectedChange.id, t.id, "completed")
                        }
                        className="text-[10px] px-2 py-0.5 rounded"
                        style={{
                          background: `color-mix(in srgb, var(--status-ok-text) 12%, transparent)`,
                          color: COLORS.green,
                          cursor: "pointer",
                        }}
                      >
                        Done
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Approvals */}
          <div>
            <h4
              className="text-[10px] font-bold uppercase mb-2"
              style={{ color: COLORS.muted }}
            >
              APROVAÇÕES
            </h4>
            <div className="space-y-1">
              {approvals.length === 0 && (
                <div className="text-[12px]" style={{ color: COLORS.muted }}>
                  Nenhuma aprovação registrada
                </div>
              )}
              {approvals.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between p-2 text-[12px]"
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                  }}
                >
                  <div>
                    <span style={{ color: COLORS.text }}>
                      {a.approver_name ?? a.approver_id}
                    </span>
                    {a.approver_role && (
                      <span
                        className="ml-2 text-[10px]"
                        style={{ color: COLORS.muted }}
                      >
                        {a.approver_role}
                      </span>
                    )}
                    {a.comment && (
                      <div
                        className="text-[11px]"
                        style={{ color: COLORS.muted }}
                      >
                        {a.comment}
                      </div>
                    )}
                  </div>
                  <span
                    className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                    style={{
                      background: `${STATUS_COLORS[a.status] ?? COLORS.muted}15`,
                      color: STATUS_COLORS[a.status] ?? COLORS.muted,
                    }}
                  >
                    {a.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div
            className="flex items-center gap-2 pt-4 border-t"
            style={{ borderColor: COLORS.border }}
          >
            <input
              type="text"
              value={actionComment}
              onChange={(e) => setActionComment(e.target.value)}
              placeholder="Comentário (opcional)"
              className="flex-1 rounded-md px-3 py-2 text-[12px]"
              style={{
                background: COLORS.bg,
                border: `1px solid ${COLORS.border}`,
                color: COLORS.text,
              }}
            />
            {(selectedChange.status === "submitted" ||
              selectedChange.status === "under_review") && (
              <>
                <button
                  onClick={() => handleAction(selectedChange.id, "approve")}
                  className="px-3 py-2 rounded-md text-[12px] font-bold"
                  style={{
                    background: `color-mix(in srgb, var(--status-ok-text) 12%, transparent)`,
                    border: `1px solid var(--status-ok-border)`,
                    color: COLORS.green,
                    cursor: "pointer",
                  }}
                >
                  ✓ Aprovar
                </button>
                <button
                  onClick={() => handleAction(selectedChange.id, "reject")}
                  className="px-3 py-2 rounded-md text-[12px] font-bold"
                  style={{
                    background: `color-mix(in srgb, var(--status-error-text) 12%, transparent)`,
                    border: `1px solid var(--status-error-border)`,
                    color: COLORS.red,
                    cursor: "pointer",
                  }}
                >
                  ✕ Rejeitar
                </button>
              </>
            )}
            {(selectedChange.status === "approved" ||
              selectedChange.status === "scheduled") && (
              <button
                onClick={() => handleAction(selectedChange.id, "implement")}
                className="px-3 py-2 rounded-md text-[12px] font-bold"
                style={{
                  background: `color-mix(in srgb, var(--status-warning-text) 12%, transparent)`,
                  border: `1px solid var(--status-warning-border)`,
                  color: COLORS.amber,
                  cursor: "pointer",
                }}
              >
                ▶ Iniciar
              </button>
            )}
            {selectedChange.status === "in_progress" && (
              <>
                <button
                  onClick={() => handleAction(selectedChange.id, "complete")}
                  className="px-3 py-2 rounded-md text-[12px] font-bold"
                  style={{
                    background: `color-mix(in srgb, var(--status-ok-text) 12%, transparent)`,
                    border: `1px solid var(--status-ok-border)`,
                    color: COLORS.green,
                    cursor: "pointer",
                  }}
                >
                  ✓ Concluir
                </button>
                <button
                  onClick={() => handleAction(selectedChange.id, "rollback")}
                  className="px-3 py-2 rounded-md text-[12px] font-bold"
                  style={{
                    background: `color-mix(in srgb, var(--status-error-text) 12%, transparent)`,
                    border: `1px solid var(--status-error-border)`,
                    color: COLORS.red,
                    cursor: "pointer",
                  }}
                >
                  ↩ Rollback
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal: Create */}
      {showCreate && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: "var(--overlay-modal)" }}
          onClick={() => setShowCreate(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setShowCreate(false);
          }}
          role="button"
          tabIndex={0}
        >
          <div
            className="rounded-xl p-6 w-full max-w-2xl space-y-4 max-h-[90vh] overflow-y-auto"
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
            }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="button"
            tabIndex={0}
          >
            <h2 className="text-sm font-bold" style={{ color: COLORS.teal }}>
              Nova Request for Change (RFC)
            </h2>

            <div className="space-y-1">
              <label
                htmlFor="cr-t"
                className="text-[10px] font-bold uppercase"
                style={{ color: COLORS.muted }}
              >
                Título
              </label>
              <input
                id="cr-t"
                type="text"
                value={crTitle}
                onChange={(e) => setCrTitle(e.target.value)}
                placeholder="Atualizar firewall rules"
                className="w-full rounded-md px-3 py-2 text-[13px]"
                style={{
                  background: COLORS.bg,
                  border: `1px solid ${COLORS.border}`,
                  color: COLORS.text,
                }}
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="cr-d"
                className="text-[10px] font-bold uppercase"
                style={{ color: COLORS.muted }}
              >
                Descrição
              </label>
              <textarea
                id="cr-d"
                value={crDescription}
                onChange={(e) => setCrDescription(e.target.value)}
                rows={3}
                className="w-full rounded-md px-3 py-2 text-[12px]"
                style={{
                  background: COLORS.bg,
                  border: `1px solid ${COLORS.border}`,
                  color: COLORS.text,
                }}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <label
                  htmlFor="cr-ty"
                  className="text-[10px] font-bold uppercase"
                  style={{ color: COLORS.muted }}
                >
                  Tipo
                </label>
                <select
                  id="cr-ty"
                  value={crType}
                  onChange={(e) => setCrType(e.target.value)}
                  className="w-full rounded-md px-3 py-2 text-[12px]"
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text,
                  }}
                >
                  {CHANGE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="cr-pr"
                  className="text-[10px] font-bold uppercase"
                  style={{ color: COLORS.muted }}
                >
                  Prioridade
                </label>
                <select
                  id="cr-pr"
                  value={crPriority}
                  onChange={(e) => setCrPriority(e.target.value)}
                  className="w-full rounded-md px-3 py-2 text-[12px]"
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text,
                  }}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="cr-rk"
                  className="text-[10px] font-bold uppercase"
                  style={{ color: COLORS.muted }}
                >
                  Risco
                </label>
                <select
                  id="cr-rk"
                  value={crRisk}
                  onChange={(e) => setCrRisk(e.target.value)}
                  className="w-full rounded-md px-3 py-2 text-[12px]"
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text,
                  }}
                >
                  {RISK_LEVELS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label
                  htmlFor="cr-s"
                  className="text-[10px] font-bold uppercase"
                  style={{ color: COLORS.muted }}
                >
                  Início Planejado
                </label>
                <input
                  id="cr-s"
                  type="datetime-local"
                  value={crStart}
                  onChange={(e) => setCrStart(e.target.value)}
                  className="w-full rounded-md px-3 py-2 text-[12px]"
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text,
                  }}
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="cr-e"
                  className="text-[10px] font-bold uppercase"
                  style={{ color: COLORS.muted }}
                >
                  Fim Planejado
                </label>
                <input
                  id="cr-e"
                  type="datetime-local"
                  value={crEnd}
                  onChange={(e) => setCrEnd(e.target.value)}
                  className="w-full rounded-md px-3 py-2 text-[12px]"
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text,
                  }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label
                  htmlFor="cr-sy"
                  className="text-[10px] font-bold uppercase"
                  style={{ color: COLORS.muted }}
                >
                  Sistemas Afetados (vírgula)
                </label>
                <input
                  id="cr-sy"
                  type="text"
                  value={crSystems}
                  onChange={(e) => setCrSystems(e.target.value)}
                  placeholder="firewall, DNS"
                  className="w-full rounded-md px-3 py-2 text-[12px]"
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text,
                  }}
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="cr-sv"
                  className="text-[10px] font-bold uppercase"
                  style={{ color: COLORS.muted }}
                >
                  Serviços Afetados (vírgula)
                </label>
                <input
                  id="cr-sv"
                  type="text"
                  value={crServices}
                  onChange={(e) => setCrServices(e.target.value)}
                  placeholder="VPN, email"
                  className="w-full rounded-md px-3 py-2 text-[12px]"
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text,
                  }}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="cr-im"
                className="text-[10px] font-bold uppercase"
                style={{ color: COLORS.muted }}
              >
                Avaliação de Impacto
              </label>
              <textarea
                id="cr-im"
                value={crImpact}
                onChange={(e) => setCrImpact(e.target.value)}
                rows={2}
                className="w-full rounded-md px-3 py-2 text-[12px]"
                style={{
                  background: COLORS.bg,
                  border: `1px solid ${COLORS.border}`,
                  color: COLORS.text,
                }}
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="cr-rb"
                className="text-[10px] font-bold uppercase"
                style={{ color: COLORS.muted }}
              >
                Plano de Rollback
              </label>
              <textarea
                id="cr-rb"
                value={crRollback}
                onChange={(e) => setCrRollback(e.target.value)}
                rows={2}
                className="w-full rounded-md px-3 py-2 text-[12px]"
                style={{
                  background: COLORS.bg,
                  border: `1px solid ${COLORS.border}`,
                  color: COLORS.text,
                }}
              />
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 rounded-md text-[12px]"
                style={{
                  background: COLORS.bg,
                  border: `1px solid ${COLORS.border}`,
                  color: COLORS.muted,
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleCreate}
                className="px-4 py-2 rounded-md text-[12px] font-bold"
                style={{
                  background: COLORS.teal,
                  color: COLORS.bg,
                  cursor: "pointer",
                }}
              >
                Criar RFC
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
