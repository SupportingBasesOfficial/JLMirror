// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState, useMemo } from "react";
import {
  Activity,
  Layers,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Server,
  Tag,
  Loader2,
  RefreshCw,
  Plus,
  ChevronDown,
  ChevronRight,
  Shield,
  TrendingDown,
} from "lucide-react";
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
};

interface EventGroup {
  id: string;
  rule_id: string;
  rule_name: string | null;
  grouping_strategy: string | null;
  severity: string;
  status: string;
  title: string;
  event_count: number;
  affected_devices: string[];
  common_tags: { tag: string; value: string }[];
  first_event_at: string;
  last_event_at: string;
  incident_id: string | null;
  notification_sent: boolean;
  acknowledged_by: string | null;
  resolved_by: string | null;
  created_at: string;
  member_count: string;
}

interface GroupMember {
  id: string;
  zabbix_event_id: string;
  device_hostname: string | null;
  problem_name: string;
  severity: string;
  tags: { tag: string; value: string }[];
  event_at: string;
  acknowledged: boolean;
  notification_suppressed: boolean;
}

interface CorrelationStats {
  stats: {
    total_groups: string;
    open_groups: string;
    acknowledged: string;
    resolved: string;
    suppressed: string;
    critical_open: string;
    warning_open: string;
    incidents_created: string;
    total_events_correlated: string;
    notifications_sent: string;
  };
  rules: { total: string; active: string };
  alert_reduction_pct: number;
  events_last_7d: number;
  group_notifications_last_7d: number;
}

interface CorrelationRule {
  id: string;
  name: string;
  description: string | null;
  time_window_seconds: number;
  grouping_strategy: string;
  tag_key: string | null;
  min_severity: string;
  escalation_threshold: number;
  escalated_severity: string;
  suppress_individual: boolean;
  auto_create_incident: boolean;
  send_group_notification: boolean;
  group_channel_ids: string[];
  is_active: boolean;
  created_at: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: COLORS.red,
  warning: COLORS.amber,
  info: COLORS.blue,
};

const STATUS_COLORS: Record<string, string> = {
  open: COLORS.red,
  acknowledged: COLORS.amber,
  resolved: COLORS.green,
  suppressed: COLORS.muted,
};

const STRATEGY_LABELS: Record<string, string> = {
  same_device: "Mesmo Dispositivo",
  same_host_group: "Mesmo Host Group",
  same_tag: "Mesma Tag",
  same_severity: "Mesma Severidade",
  cross_device: "Cross-Device",
};

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}min atrás`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h atrás`;
  const days = Math.floor(hours / 24);
  return `${days}d atrás`;
}

const num = (v: string | undefined): number => parseInt(v ?? "0", 10);

type Tab = "groups" | "rules" | "stats";

export default function CorrelationPage() {
  const [tab, setTab] = useState<Tab>("groups");
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreateRule, setShowCreateRule] = useState(false);

  const { data: statsData, mutate: mutateStats } = useApi<CorrelationStats>(
    "/api/v1/correlation/stats",
  );
  const { data: groupsData, mutate: mutateGroups } = useApi<{
    groups: EventGroup[];
  }>("/api/v1/correlation/groups?limit=100");
  const { data: rulesData, mutate: mutateRules } = useApi<{
    rules: CorrelationRule[];
  }>("/api/v1/correlation/rules");

  const [groupMembers, setGroupMembers] = useState<
    Record<string, GroupMember[]>
  >({});

  const groups = groupsData?.groups ?? [];
  const rules = rulesData?.rules ?? [];
  const stats = statsData;

  const openGroups = useMemo(
    () => (groupsData?.groups ?? []).filter((g) => g.status === "open"),
    [groupsData],
  );

  const toggleGroup = async (groupId: string) => {
    if (expandedGroup === groupId) {
      setExpandedGroup(null);
      return;
    }
    setExpandedGroup(groupId);

    if (!groupMembers[groupId]) {
      try {
        const res = await fetch(`/api/v1/correlation/groups/${groupId}`, {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          setGroupMembers((prev) => ({
            ...prev,
            [groupId]: data.members ?? [],
          }));
        }
      } catch {
        // Silencioso
      }
    }
  };

  const handleGroupAction = async (
    groupId: string,
    action: "acknowledge" | "resolve" | "suppress",
  ) => {
    setActionLoading(`${groupId}-${action}`);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/correlation/groups/${groupId}/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        },
      );
      if (res.ok) {
        mutateGroups();
        mutateStats();
      } else {
        const data = await res.json();
        setError(data?.error?.message ?? "Erro ao processar ação");
      }
    } catch {
      setError("Erro de conexão");
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateRule = async (formData: Record<string, unknown>) => {
    setError(null);
    try {
      const res = await fetch("/api/v1/correlation/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        setShowCreateRule(false);
        mutateRules();
        mutateStats();
      } else {
        const data = await res.json();
        setError(data?.error?.message ?? "Erro ao criar regra");
      }
    } catch {
      setError("Erro de conexão");
    }
  };

  const handleToggleRule = async (ruleId: string, currentActive: boolean) => {
    setActionLoading(`${ruleId}-toggle`);
    try {
      const res = await fetch(`/api/v1/correlation/rules/${ruleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ is_active: !currentActive }),
      });
      if (res.ok) {
        mutateRules();
      }
    } catch {
      // Silencioso
    } finally {
      setActionLoading(null);
    }
  };

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
            <Layers size={18} className="inline mr-1" /> Correlação de Eventos
          </h1>
          <p className="text-[12px]" style={{ color: COLORS.muted }}>
            Agrupamento inteligente de alertas · Redução de noise · Incidentes
            correlacionados
          </p>
        </div>
        <button
          onClick={() => {
            mutateGroups();
            mutateStats();
            mutateRules();
          }}
          className="text-[12px] px-3 py-1.5 rounded font-bold flex items-center gap-2"
          style={{
            background: `${COLORS.teal}15`,
            border: `1px solid ${COLORS.teal}`,
            color: COLORS.teal,
            cursor: "pointer",
          }}
        >
          <RefreshCw size={12} /> Atualizar
        </button>
      </div>

      {error && (
        <div
          className="rounded-md p-3 text-sm"
          style={{
            background: "var(--status-error-bg)",
            border: "1px solid var(--status-error-border)",
            color: COLORS.red,
          }}
        >
          {error}
        </div>
      )}

      {/* Alert Reduction Banner */}
      {stats && stats.alert_reduction_pct > 0 && (
        <div
          className="rounded-xl p-4 flex items-center justify-between"
          style={{
            background: `${COLORS.green}10`,
            border: `1px solid ${COLORS.green}33`,
          }}
        >
          <div className="flex items-center gap-3">
            <TrendingDown size={20} style={{ color: COLORS.green }} />
            <div>
              <div
                className="text-sm font-bold"
                style={{ color: COLORS.green }}
              >
                Redução de Alertas: {stats.alert_reduction_pct}%
              </div>
              <div className="text-[10px]" style={{ color: COLORS.muted }}>
                {stats.events_last_7d} eventos agrupados em{" "}
                {stats.group_notifications_last_7d} notificações consolidadas
                (últimos 7 dias)
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div
        className="flex items-center gap-1 border-b"
        style={{ borderColor: COLORS.border }}
      >
        {(
          [
            {
              key: "groups",
              label: "Grupos de Eventos",
              icon: <Layers size={14} />,
              count: openGroups.length,
            },
            {
              key: "rules",
              label: "Regras",
              icon: <Shield size={14} />,
              count: rules.length,
            },
            {
              key: "stats",
              label: "Estatísticas",
              icon: <Activity size={14} />,
            },
          ] as {
            key: Tab;
            label: string;
            icon: React.ReactNode;
            count?: number;
          }[]
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-4 py-2 text-[12px] font-bold flex items-center gap-2 border-b-2"
            style={{
              borderColor: tab === t.key ? COLORS.teal : "transparent",
              color: tab === t.key ? COLORS.teal : COLORS.muted,
              cursor: "pointer",
            }}
          >
            {t.icon} {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span
                className="px-1.5 py-0.5 rounded text-[10px]"
                style={{ background: COLORS.red, color: "white" }}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab: Groups */}
      {tab === "groups" && (
        <div className="space-y-3">
          {groups.length === 0 && (
            <div
              className="rounded-xl p-8 text-center"
              style={{
                background: COLORS.card,
                border: `1px solid ${COLORS.border}`,
              }}
            >
              <CheckCircle2
                size={24}
                className="mx-auto mb-2"
                style={{ color: COLORS.green }}
              />
              <p className="text-sm" style={{ color: COLORS.muted }}>
                Nenhum grupo de eventos correlacionados
              </p>
            </div>
          )}
          {groups.map((g) => (
            <div
              key={g.id}
              className="rounded-xl overflow-hidden"
              style={{
                background: COLORS.card,
                border: `1px solid ${COLORS.border}`,
              }}
            >
              {/* Group Header */}
              <div
                className="p-4 flex items-center justify-between cursor-pointer"
                onClick={() => toggleGroup(g.id)}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {expandedGroup === g.id ? (
                    <ChevronDown size={16} style={{ color: COLORS.muted }} />
                  ) : (
                    <ChevronRight size={16} style={{ color: COLORS.muted }} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                        style={{
                          background: `${SEVERITY_COLORS[g.severity] ?? COLORS.muted}15`,
                          color: SEVERITY_COLORS[g.severity] ?? COLORS.muted,
                        }}
                      >
                        {g.severity}
                      </span>
                      <span
                        className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                        style={{
                          background: `${STATUS_COLORS[g.status] ?? COLORS.muted}15`,
                          color: STATUS_COLORS[g.status] ?? COLORS.muted,
                        }}
                      >
                        {g.status}
                      </span>
                      <span
                        className="text-[13px] font-bold truncate"
                        style={{ color: COLORS.text }}
                      >
                        {g.title}
                      </span>
                    </div>
                    <div
                      className="flex items-center gap-3 mt-1 text-[10px] flex-wrap"
                      style={{ color: COLORS.muted }}
                    >
                      <span className="flex items-center gap-1">
                        <Server size={10} /> {g.affected_devices.length}{" "}
                        dispositivos
                      </span>
                      <span className="flex items-center gap-1">
                        <Layers size={10} /> {num(g.member_count)} eventos
                      </span>
                      {g.rule_name && (
                        <span className="flex items-center gap-1">
                          <Shield size={10} /> {g.rule_name}
                        </span>
                      )}
                      {g.incident_id && (
                        <span
                          className="flex items-center gap-1"
                          style={{ color: COLORS.amber }}
                        >
                          <AlertTriangle size={10} /> Incidente criado
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock size={10} /> {timeAgo(g.last_event_at)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                {g.status === "open" && (
                  <div
                    className="flex items-center gap-1 flex-shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => handleGroupAction(g.id, "acknowledge")}
                      disabled={actionLoading === `${g.id}-acknowledge`}
                      className="px-2 py-1 rounded text-[10px] font-bold"
                      style={{
                        background: `${COLORS.amber}15`,
                        border: `1px solid ${COLORS.amber}`,
                        color: COLORS.amber,
                        cursor: "pointer",
                        opacity:
                          actionLoading === `${g.id}-acknowledge` ? 0.5 : 1,
                      }}
                    >
                      {actionLoading === `${g.id}-acknowledge` ? (
                        <Loader2 size={10} className="animate-spin" />
                      ) : (
                        "Ack"
                      )}
                    </button>
                    <button
                      onClick={() => handleGroupAction(g.id, "resolve")}
                      disabled={actionLoading === `${g.id}-resolve`}
                      className="px-2 py-1 rounded text-[10px] font-bold"
                      style={{
                        background: `${COLORS.green}15`,
                        border: `1px solid ${COLORS.green}`,
                        color: COLORS.green,
                        cursor: "pointer",
                        opacity: actionLoading === `${g.id}-resolve` ? 0.5 : 1,
                      }}
                    >
                      {actionLoading === `${g.id}-resolve` ? (
                        <Loader2 size={10} className="animate-spin" />
                      ) : (
                        "Resolver"
                      )}
                    </button>
                    <button
                      onClick={() => handleGroupAction(g.id, "suppress")}
                      disabled={actionLoading === `${g.id}-suppress`}
                      className="px-2 py-1 rounded text-[10px] font-bold"
                      style={{
                        background: `${COLORS.muted}15`,
                        border: `1px solid ${COLORS.muted}`,
                        color: COLORS.muted,
                        cursor: "pointer",
                        opacity: actionLoading === `${g.id}-suppress` ? 0.5 : 1,
                      }}
                    >
                      Suprimir
                    </button>
                  </div>
                )}
              </div>

              {/* Expanded Members */}
              {expandedGroup === g.id && (
                <div
                  className="border-t"
                  style={{ borderColor: COLORS.border }}
                >
                  {g.common_tags.length > 0 && (
                    <div
                      className="p-3 flex items-center gap-2 flex-wrap border-b"
                      style={{ borderColor: COLORS.border }}
                    >
                      <span
                        className="text-[10px] font-bold uppercase"
                        style={{ color: COLORS.muted }}
                      >
                        Tags comuns:
                      </span>
                      {g.common_tags.map((t, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded text-[10px] flex items-center gap-1"
                          style={{
                            background: "var(--surface-1)",
                            color: COLORS.blue,
                          }}
                        >
                          <Tag size={9} /> {t.tag}: {t.value}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr style={{ background: "var(--surface-1)" }}>
                          <th
                            className="text-left p-2 font-bold uppercase text-[10px]"
                            style={{ color: COLORS.muted }}
                          >
                            Evento
                          </th>
                          <th
                            className="text-left p-2 font-bold uppercase text-[10px]"
                            style={{ color: COLORS.muted }}
                          >
                            Dispositivo
                          </th>
                          <th
                            className="text-left p-2 font-bold uppercase text-[10px]"
                            style={{ color: COLORS.muted }}
                          >
                            Severidade
                          </th>
                          <th
                            className="text-left p-2 font-bold uppercase text-[10px]"
                            style={{ color: COLORS.muted }}
                          >
                            Suprimido
                          </th>
                          <th
                            className="text-left p-2 font-bold uppercase text-[10px]"
                            style={{ color: COLORS.muted }}
                          >
                            Quando
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {(groupMembers[g.id] ?? []).map((m) => (
                          <tr
                            key={m.id}
                            style={{
                              borderBottom: `1px solid ${COLORS.border}`,
                            }}
                          >
                            <td className="p-2" style={{ color: COLORS.text }}>
                              {m.problem_name}
                            </td>
                            <td
                              className="p-2 flex items-center gap-1"
                              style={{ color: COLORS.muted }}
                            >
                              <Server size={10} /> {m.device_hostname ?? "—"}
                            </td>
                            <td className="p-2">
                              <span
                                className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase"
                                style={{
                                  background: `${SEVERITY_COLORS[m.severity] ?? COLORS.muted}15`,
                                  color:
                                    SEVERITY_COLORS[m.severity] ?? COLORS.muted,
                                }}
                              >
                                {m.severity}
                              </span>
                            </td>
                            <td className="p-2">
                              {m.notification_suppressed ? (
                                <XCircle
                                  size={12}
                                  style={{ color: COLORS.muted }}
                                />
                              ) : (
                                <CheckCircle2
                                  size={12}
                                  style={{ color: COLORS.green }}
                                />
                              )}
                            </td>
                            <td className="p-2" style={{ color: COLORS.muted }}>
                              {formatTime(m.event_at)}
                            </td>
                          </tr>
                        ))}
                        {!groupMembers[g.id] && (
                          <tr>
                            <td
                              colSpan={5}
                              className="p-4 text-center"
                              style={{ color: COLORS.muted }}
                            >
                              <Loader2
                                size={14}
                                className="animate-spin inline"
                              />{" "}
                              Carregando membros...
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Tab: Rules */}
      {tab === "rules" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span
              className="text-[10px] font-bold uppercase"
              style={{ color: COLORS.muted }}
            >
              {rules.length} regras configuradas
            </span>
            <button
              onClick={() => setShowCreateRule(!showCreateRule)}
              className="text-[12px] px-3 py-1.5 rounded font-bold flex items-center gap-2"
              style={{
                background: `${COLORS.teal}15`,
                border: `1px solid ${COLORS.teal}`,
                color: COLORS.teal,
                cursor: "pointer",
              }}
            >
              <Plus size={12} /> Nova Regra
            </button>
          </div>

          {showCreateRule && (
            <CreateRuleForm
              onSubmit={handleCreateRule}
              onCancel={() => setShowCreateRule(false)}
            />
          )}

          {rules.map((r) => (
            <div
              key={r.id}
              className="rounded-xl p-4"
              style={{
                background: COLORS.card,
                border: `1px solid ${COLORS.border}`,
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[13px] font-bold"
                      style={{ color: COLORS.text }}
                    >
                      {r.name}
                    </span>
                    <span
                      className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                      style={{
                        background: r.is_active
                          ? `${COLORS.green}15`
                          : `${COLORS.muted}15`,
                        color: r.is_active ? COLORS.green : COLORS.muted,
                      }}
                    >
                      {r.is_active ? "Ativa" : "Inativa"}
                    </span>
                  </div>
                  {r.description && (
                    <p
                      className="text-[11px] mt-1"
                      style={{ color: COLORS.muted }}
                    >
                      {r.description}
                    </p>
                  )}
                  <div
                    className="flex items-center gap-3 mt-2 text-[10px] flex-wrap"
                    style={{ color: COLORS.muted }}
                  >
                    <span>
                      Estratégia:{" "}
                      <strong style={{ color: COLORS.text }}>
                        {STRATEGY_LABELS[r.grouping_strategy] ??
                          r.grouping_strategy}
                      </strong>
                    </span>
                    <span>
                      Janela:{" "}
                      <strong style={{ color: COLORS.text }}>
                        {r.time_window_seconds}s
                      </strong>
                    </span>
                    <span>
                      Sev. mínima:{" "}
                      <strong
                        style={{
                          color: SEVERITY_COLORS[r.min_severity] ?? COLORS.text,
                        }}
                      >
                        {r.min_severity}
                      </strong>
                    </span>
                    <span>
                      Escalation:{" "}
                      <strong style={{ color: COLORS.text }}>
                        {r.escalation_threshold} eventos →{" "}
                        {r.escalated_severity}
                      </strong>
                    </span>
                    {r.suppress_individual && (
                      <span style={{ color: COLORS.amber }}>
                        Suprime individuais
                      </span>
                    )}
                    {r.auto_create_incident && (
                      <span style={{ color: COLORS.red }}>Auto-incidente</span>
                    )}
                    {r.send_group_notification && (
                      <span style={{ color: COLORS.teal }}>
                        Notificação consolidada
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleToggleRule(r.id, r.is_active)}
                  disabled={actionLoading === `${r.id}-toggle`}
                  className="px-2 py-1 rounded text-[10px] font-bold"
                  style={{
                    background: r.is_active
                      ? `${COLORS.muted}15`
                      : `${COLORS.green}15`,
                    border: `1px solid ${r.is_active ? COLORS.muted : COLORS.green}`,
                    color: r.is_active ? COLORS.muted : COLORS.green,
                    cursor: "pointer",
                    opacity: actionLoading === `${r.id}-toggle` ? 0.5 : 1,
                  }}
                >
                  {actionLoading === `${r.id}-toggle` ? (
                    <Loader2 size={10} className="animate-spin" />
                  ) : r.is_active ? (
                    "Desativar"
                  ) : (
                    "Ativar"
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab: Stats */}
      {tab === "stats" && stats && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <StatCard
              label="Total de Grupos"
              value={num(stats.stats.total_groups)}
              color={COLORS.text}
            />
            <StatCard
              label="Grupos Abertos"
              value={num(stats.stats.open_groups)}
              color={COLORS.red}
            />
            <StatCard
              label="Críticos Abertos"
              value={num(stats.stats.critical_open)}
              color={COLORS.red}
            />
            <StatCard
              label="Acknowledged"
              value={num(stats.stats.acknowledged)}
              color={COLORS.amber}
            />
            <StatCard
              label="Resolvidos"
              value={num(stats.stats.resolved)}
              color={COLORS.green}
            />
            <StatCard
              label="Incidentes Criados"
              value={num(stats.stats.incidents_created)}
              color={COLORS.amber}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <StatCard
              label="Eventos Correlacionados (Total)"
              value={num(stats.stats.total_events_correlated)}
              color={COLORS.teal}
            />
            <StatCard
              label="Notificações Consolidadas Enviadas"
              value={num(stats.stats.notifications_sent)}
              color={COLORS.blue}
            />
            <StatCard
              label="Regras Ativas"
              value={num(stats.rules.active)}
              color={COLORS.teal}
            />
          </div>

          <div
            className="rounded-xl p-6"
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
            }}
          >
            <h3
              className="text-[10px] font-bold uppercase mb-4"
              style={{ color: COLORS.muted }}
            >
              Redução de Alertas (Últimos 7 dias)
            </h3>
            <div className="flex items-center gap-6">
              <div className="flex flex-col items-center">
                <div
                  className="text-3xl font-bold"
                  style={{ color: COLORS.green }}
                >
                  {stats.alert_reduction_pct}%
                </div>
                <div className="text-[10px]" style={{ color: COLORS.muted }}>
                  Redução
                </div>
              </div>
              <div className="flex flex-col items-center">
                <div
                  className="text-3xl font-bold"
                  style={{ color: COLORS.text }}
                >
                  {stats.events_last_7d}
                </div>
                <div className="text-[10px]" style={{ color: COLORS.muted }}>
                  Eventos agrupados
                </div>
              </div>
              <div className="flex flex-col items-center">
                <div
                  className="text-3xl font-bold"
                  style={{ color: COLORS.teal }}
                >
                  {stats.group_notifications_last_7d}
                </div>
                <div className="text-[10px]" style={{ color: COLORS.muted }}>
                  Notificações enviadas
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border-default)",
      }}
    >
      <div
        className="text-[10px] font-bold uppercase mb-1"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </div>
      <div className="text-2xl font-bold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

function CreateRuleForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (data: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    time_window_seconds: 300,
    grouping_strategy: "same_host_group",
    tag_key: "",
    min_severity: "warning",
    escalation_threshold: 3,
    escalated_severity: "critical",
    suppress_individual: true,
    auto_create_incident: false,
    send_group_notification: true,
    is_active: true,
  });

  const inputStyle = {
    background: "var(--surface-1)",
    border: "1px solid var(--border-default)",
    color: "var(--text-primary)",
    borderRadius: "6px",
    padding: "6px 10px",
    fontSize: "12px",
    width: "100%",
  } as const;

  const labelStyle = {
    fontSize: "10px",
    fontWeight: "bold",
    textTransform: "uppercase" as const,
    color: "var(--text-muted)",
    marginBottom: "4px",
    display: "block",
  };

  return (
    <div
      className="rounded-xl p-6 space-y-4"
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--brand-primary)",
      }}
    >
      <h3
        className="text-sm font-bold"
        style={{ color: "var(--brand-primary)" }}
      >
        Nova Regra de Correlação
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label style={labelStyle}>Nome *</label>
          <input
            style={inputStyle}
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Ex: Correlação de queda de hosts"
          />
        </div>
        <div>
          <label style={labelStyle}>Estratégia de Agrupamento</label>
          <select
            style={inputStyle}
            value={formData.grouping_strategy}
            onChange={(e) =>
              setFormData({ ...formData, grouping_strategy: e.target.value })
            }
          >
            <option value="same_host_group">Mesmo Host Group</option>
            <option value="same_device">Mesmo Dispositivo</option>
            <option value="same_tag">Mesma Tag</option>
            <option value="same_severity">Mesma Severidade</option>
            <option value="cross_device">Cross-Device (temporal)</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Janela Temporal (segundos)</label>
          <input
            type="number"
            style={inputStyle}
            value={formData.time_window_seconds}
            onChange={(e) =>
              setFormData({
                ...formData,
                time_window_seconds: parseInt(e.target.value, 10) || 300,
              })
            }
            min={60}
            max={86400}
          />
        </div>
        <div>
          <label style={labelStyle}>Severidade Mínima</label>
          <select
            style={inputStyle}
            value={formData.min_severity}
            onChange={(e) =>
              setFormData({ ...formData, min_severity: e.target.value })
            }
          >
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>
            Threshold de Escalation (nº de eventos)
          </label>
          <input
            type="number"
            style={inputStyle}
            value={formData.escalation_threshold}
            onChange={(e) =>
              setFormData({
                ...formData,
                escalation_threshold: parseInt(e.target.value, 10) || 3,
              })
            }
            min={2}
            max={100}
          />
        </div>
        <div>
          <label style={labelStyle}>Severidade Escalada</label>
          <select
            style={inputStyle}
            value={formData.escalated_severity}
            onChange={(e) =>
              setFormData({ ...formData, escalated_severity: e.target.value })
            }
          >
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Tag Key (se estratégia = same_tag)</label>
          <input
            style={inputStyle}
            value={formData.tag_key}
            onChange={(e) =>
              setFormData({ ...formData, tag_key: e.target.value })
            }
            placeholder="Ex: service, environment"
          />
        </div>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <label
          className="flex items-center gap-2 text-[12px]"
          style={{ color: "var(--text-primary)" }}
        >
          <input
            type="checkbox"
            checked={formData.suppress_individual}
            onChange={(e) =>
              setFormData({
                ...formData,
                suppress_individual: e.target.checked,
              })
            }
          />
          Suprimir notificações individuais
        </label>
        <label
          className="flex items-center gap-2 text-[12px]"
          style={{ color: "var(--text-primary)" }}
        >
          <input
            type="checkbox"
            checked={formData.auto_create_incident}
            onChange={(e) =>
              setFormData({
                ...formData,
                auto_create_incident: e.target.checked,
              })
            }
          />
          Criar incidente automaticamente
        </label>
        <label
          className="flex items-center gap-2 text-[12px]"
          style={{ color: "var(--text-primary)" }}
        >
          <input
            type="checkbox"
            checked={formData.send_group_notification}
            onChange={(e) =>
              setFormData({
                ...formData,
                send_group_notification: e.target.checked,
              })
            }
          />
          Enviar notificação consolidada
        </label>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => onSubmit(formData)}
          className="px-4 py-1.5 rounded text-[12px] font-bold"
          style={{
            background: "var(--brand-primary)",
            color: "white",
            cursor: "pointer",
          }}
        >
          Criar Regra
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-1.5 rounded text-[12px] font-bold"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-default)",
            color: "var(--text-muted)",
            cursor: "pointer",
          }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
