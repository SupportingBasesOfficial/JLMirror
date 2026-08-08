// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState } from "react";
import {
  RefreshCw,
  ArrowLeft,
  Plus,
  Trash2,
  Edit3,
  X,
  AlertTriangle,
  CheckCircle2,
  Flame,
  ChevronUp,
  ChevronDown,
  Play,
} from "lucide-react";
import { LoadingState } from "@/components/ui/state-display";
import { useApi } from "@/lib/use-api";

const COLORS = {
  bg: "var(--surface-0)",
  card: "var(--surface-2)",
  cardHover: "var(--surface-hover)",
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

const SEVERITY_COLORS: Record<string, string> = {
  all: COLORS.muted,
  info: COLORS.blue,
  warning: COLORS.amber,
  critical: COLORS.red,
};

const INSTANCE_STATUS_COLORS: Record<string, string> = {
  active: COLORS.amber,
  escalated: COLORS.red,
  resolved: COLORS.green,
  expired: COLORS.muted,
};

const EVENT_SOURCES = [
  "monitoring.service_down",
  "monitoring.cpu_high",
  "monitoring.memory_high",
  "monitoring.disk_full",
  "monitoring.network_down",
  "monitoring.host_unreachable",
  "ticket.escalation",
  "security.breach_detected",
  "backup.failed",
  "ssl.expiring",
  "custom",
];

interface EscalationStep {
  id?: string;
  tier: number;
  delay_minutes: number;
  channel_ids: string[];
  template_subject?: string | null;
  template_body?: string | null;
}

interface EscalationPolicy {
  id: string;
  name: string;
  description: string | null;
  event_source: string;
  severity_filter: string;
  repeat_count: number;
  repeat_interval_minutes: number;
  is_active: boolean;
  steps?: EscalationStep[];
  created_at: string;
  updated_at?: string;
}

interface EscalationInstance {
  id: string;
  policy_id: string;
  policy_name?: string;
  alert_subject: string;
  alert_body: string;
  alert_severity: string;
  alert_source: string;
  current_tier: number;
  status: string;
  next_escalation_at: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
}

interface NotificationChannel {
  id: string;
  name: string;
  channel_type: string;
  is_active: boolean;
}

interface OverviewData {
  overview: {
    policies: { total: string; active: string };
  };
  endpoints: string[];
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

function severityBadge(severity: string): React.ReactNode {
  const color = SEVERITY_COLORS[severity] ?? COLORS.muted;
  return (
    <span
      className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
      style={{
        background: `${color}15`,
        color,
      }}
    >
      {severity}
    </span>
  );
}

function statusBadge(status: string): React.ReactNode {
  const color = INSTANCE_STATUS_COLORS[status] ?? COLORS.muted;
  return (
    <span
      className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
      style={{
        background: `${color}15`,
        color,
      }}
    >
      {status}
    </span>
  );
}

const inputStyle: React.CSSProperties = {
  background: COLORS.bg,
  border: `1px solid ${COLORS.border}`,
  color: COLORS.text,
  borderRadius: "6px",
  padding: "8px 12px",
  fontSize: "13px",
  width: "100%",
};

const labelStyle: React.CSSProperties = {
  color: COLORS.muted,
  fontSize: "11px",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: "4px",
  display: "block",
};

export default function EscalationPage() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tab, setTab] = useState<"policies" | "instances">("policies");
  const [showCreate, setShowCreate] = useState(false);
  const [editPolicy, setEditPolicy] = useState<EscalationPolicy | null>(null);
  const [instanceFilter, setInstanceFilter] = useState<string>("active");
  const [showTrigger, setShowTrigger] = useState(false);

  // Forms
  const [fName, setFName] = useState("");
  const [fDescription, setFDescription] = useState("");
  const [fEventSource, setFEventSource] = useState("monitoring.service_down");
  const [fSeverity, setFSeverity] = useState("critical");
  const [fRepeatCount, setFRepeatCount] = useState(3);
  const [fRepeatInterval, setFRepeatInterval] = useState(5);
  const [fActive, setFActive] = useState(true);
  const [fSteps, setFSteps] = useState<EscalationStep[]>([
    { tier: 1, delay_minutes: 0, channel_ids: [] },
  ]);

  // Trigger form
  const [tSubject, setTSubject] = useState("");
  const [tBody, setTBody] = useState("");
  const [tSeverity, setTSeverity] = useState("critical");
  const [tSource, setTSource] = useState("monitoring.service_down");

  const { data: overviewData, mutate: mutateOverview } =
    useApi<OverviewData>("/api/escalation");
  const { data: policiesData, mutate: mutatePolicies } = useApi<{
    policies: EscalationPolicy[];
  }>("/api/escalation/policies");
  const { data: instancesData, mutate: mutateInstances } = useApi<{
    instances: EscalationInstance[];
  }>(`/api/escalation/instances?status=${instanceFilter}`);
  const { data: channelsData } = useApi<{ channels: NotificationChannel[] }>(
    "/api/notifications/channels",
  );

  const policies = policiesData?.policies ?? [];
  const instances = instancesData?.instances ?? [];
  const channels = channelsData?.channels ?? [];
  const overview = overviewData?.overview;

  function resetForm() {
    setFName("");
    setFDescription("");
    setFEventSource("monitoring.service_down");
    setFSeverity("critical");
    setFRepeatCount(3);
    setFRepeatInterval(5);
    setFActive(true);
    setFSteps([{ tier: 1, delay_minutes: 0, channel_ids: [] }]);
  }

  function openCreate() {
    resetForm();
    setEditPolicy(null);
    setShowCreate(true);
  }

  function openEdit(policy: EscalationPolicy) {
    setFName(policy.name);
    setFDescription(policy.description ?? "");
    setFEventSource(policy.event_source);
    setFSeverity(policy.severity_filter);
    setFRepeatCount(policy.repeat_count);
    setFRepeatInterval(policy.repeat_interval_minutes);
    setFActive(policy.is_active);
    setFSteps(
      policy.steps?.length
        ? policy.steps.map((s) => ({
            id: s.id,
            tier: s.tier,
            delay_minutes: s.delay_minutes,
            channel_ids: s.channel_ids ?? [],
            template_subject: s.template_subject,
            template_body: s.template_body,
          }))
        : [{ tier: 1, delay_minutes: 0, channel_ids: [] }],
    );
    setEditPolicy(policy);
    setShowCreate(true);
  }

  function addStep() {
    const nextTier = (fSteps[fSteps.length - 1]?.tier ?? 0) + 1;
    setFSteps([
      ...fSteps,
      { tier: nextTier, delay_minutes: 5, channel_ids: [] },
    ]);
  }

  function removeStep(index: number) {
    if (fSteps.length <= 1) return;
    setFSteps(fSteps.filter((_, i) => i !== index));
  }

  function moveStep(index: number, dir: "up" | "down") {
    const newIndex = dir === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= fSteps.length) return;
    const newSteps = [...fSteps];
    [newSteps[index], newSteps[newIndex]] = [
      newSteps[newIndex],
      newSteps[index],
    ];
    // Reordena tiers
    newSteps.forEach((s, i) => (s.tier = i + 1));
    setFSteps(newSteps);
  }

  function updateStep(
    index: number,
    field: keyof EscalationStep,
    value: unknown,
  ) {
    const newSteps = [...fSteps];
    newSteps[index] = { ...newSteps[index], [field]: value };
    setFSteps(newSteps);
  }

  function toggleChannel(stepIndex: number, channelId: string) {
    const step = fSteps[stepIndex];
    const has = step.channel_ids.includes(channelId);
    updateStep(
      stepIndex,
      "channel_ids",
      has
        ? step.channel_ids.filter((id) => id !== channelId)
        : [...step.channel_ids, channelId],
    );
  }

  async function handleSave() {
    setError(null);
    if (!fName.trim()) {
      setError("Nome é obrigatório");
      return;
    }
    if (fSteps.length === 0) {
      setError("Pelo menos um step é obrigatório");
      return;
    }
    for (const step of fSteps) {
      if (step.channel_ids.length === 0) {
        setError(`Tier ${step.tier} precisa de pelo menos um canal`);
        return;
      }
    }

    const payload = {
      name: fName,
      description: fDescription || undefined,
      event_source: fEventSource,
      severity_filter: fSeverity,
      repeat_count: fRepeatCount,
      repeat_interval_minutes: fRepeatInterval,
      is_active: fActive,
      steps: fSteps.map((s) => ({
        tier: s.tier,
        delay_minutes: s.delay_minutes,
        channel_ids: s.channel_ids,
        template_subject: s.template_subject || undefined,
        template_body: s.template_body || undefined,
      })),
    };

    try {
      const url = editPolicy
        ? `/api/escalation/policies/${editPolicy.id}`
        : "/api/escalation/policies";
      const method = editPolicy ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Erro ao salvar política");
        return;
      }
      setSuccess(editPolicy ? "Política atualizada!" : "Política criada!");
      setShowCreate(false);
      resetForm();
      mutatePolicies();
      mutateOverview();
    } catch {
      setError("Erro de conexão");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir esta política de escalonamento?")) return;
    setError(null);
    try {
      const res = await fetch(`/api/escalation/policies/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? "Erro ao excluir");
        return;
      }
      setSuccess("Política excluída");
      mutatePolicies();
      mutateOverview();
    } catch {
      setError("Erro de conexão");
    }
  }

  async function handleResolve(instanceId: string) {
    setError(null);
    try {
      const res = await fetch(
        `/api/escalation/instances/${instanceId}/resolve`,
        {
          method: "POST",
          credentials: "include",
        },
      );
      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? "Erro ao resolver");
        return;
      }
      setSuccess("Alerta resolvido");
      mutateInstances();
    } catch {
      setError("Erro de conexão");
    }
  }

  async function handleTrigger() {
    setError(null);
    if (!tSubject.trim() || !tBody.trim() || !tSource.trim()) {
      setError("Subject, body e source são obrigatórios");
      return;
    }
    try {
      const res = await fetch("/api/escalation/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          subject: tSubject,
          body: tBody,
          severity: tSeverity,
          source: tSource,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Erro ao disparar escalonamento");
        return;
      }
      setSuccess(`Escalonamento disparado! Tier 1 — ID: ${data.instance_id}`);
      setShowTrigger(false);
      setTSubject("");
      setTBody("");
      mutateInstances();
    } catch {
      setError("Erro de conexão");
    }
  }

  if (!policiesData && !overviewData)
    return <LoadingState label="Carregando escalonamento..." />;

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
            <Flame size={16} className="inline mr-1" /> Escalonamento de Alertas
          </h1>
          <p className="text-[12px]" style={{ color: COLORS.muted }}>
            Políticas · Steps · Instâncias · Disparo manual
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowTrigger(true)}
            className="text-[12px] px-3 py-1.5 rounded font-bold"
            style={{
              background: COLORS.amber,
              color: COLORS.bg,
              cursor: "pointer",
            }}
          >
            <Play size={12} className="inline" /> Disparar
          </button>
          <button
            onClick={openCreate}
            className="text-[12px] px-3 py-1.5 rounded font-bold"
            style={{
              background: COLORS.teal,
              color: COLORS.bg,
              cursor: "pointer",
            }}
          >
            <Plus size={12} className="inline" /> Política
          </button>
          <button
            onClick={() => {
              mutatePolicies();
              mutateInstances();
              mutateOverview();
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

      {/* Alerts */}
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
      {success && (
        <div
          className="rounded-md p-3 text-sm"
          style={{
            background: "var(--status-ok-bg)",
            border: "1px solid var(--status-ok-border)",
            color: COLORS.green,
          }}
        >
          {success}
        </div>
      )}

      {/* Stats */}
      {overview && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div
            className="p-4 rounded-xl"
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
            }}
          >
            <div
              className="text-[10px] uppercase mb-1"
              style={{ color: COLORS.muted }}
            >
              Total de Políticas
            </div>
            <div className="text-2xl font-bold" style={{ color: COLORS.teal }}>
              {overview.policies?.total ?? "0"}
            </div>
          </div>
          <div
            className="p-4 rounded-xl"
            style={{
              background: COLORS.card,
              border: `1px solid var(--status-ok-border)`,
            }}
          >
            <div
              className="text-[10px] uppercase mb-1"
              style={{ color: COLORS.muted }}
            >
              Ativas
            </div>
            <div className="text-2xl font-bold" style={{ color: COLORS.green }}>
              {overview.policies?.active ?? "0"}
            </div>
          </div>
          <div
            className="p-4 rounded-xl"
            style={{
              background: COLORS.card,
              border: `1px solid var(--status-warning-border)`,
            }}
          >
            <div
              className="text-[10px] uppercase mb-1"
              style={{ color: COLORS.muted }}
            >
              Instâncias Ativas
            </div>
            <div className="text-2xl font-bold" style={{ color: COLORS.amber }}>
              {instances.filter((i) => i.status === "active").length}
            </div>
          </div>
          <div
            className="p-4 rounded-xl"
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
            }}
          >
            <div
              className="text-[10px] uppercase mb-1"
              style={{ color: COLORS.muted }}
            >
              Canais Disponíveis
            </div>
            <div className="text-2xl font-bold" style={{ color: COLORS.blue }}>
              {channels.length}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 flex-wrap">
        {(
          [
            { key: "policies", label: `Políticas (${policies.length})` },
            { key: "instances", label: `Instâncias (${instances.length})` },
          ] as const
        ).map((t) => (
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

      {/* Tab: Policies */}
      {tab === "policies" && (
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderTop: "none",
          }}
        >
          {policies.length === 0 ? (
            <div
              className="p-8 text-center text-sm"
              style={{ color: COLORS.muted }}
            >
              Nenhuma política de escalonamento configurada.
              <br />
              Clique em <strong>Política</strong> para criar a primeira.
            </div>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Nome
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Evento
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Severidade
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Steps
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Repetição
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Status
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Criado
                  </th>
                  <th
                    className="text-right px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  ></th>
                </tr>
              </thead>
              <tbody>
                {policies.map((p) => (
                  <tr
                    key={p.id}
                    style={{
                      borderBottom: `1px solid ${COLORS.border}`,
                      opacity: p.is_active ? 1 : 0.5,
                    }}
                  >
                    <td className="px-3 py-2">
                      <div style={{ color: COLORS.teal }}>{p.name}</div>
                      {p.description && (
                        <div
                          className="text-[10px]"
                          style={{ color: COLORS.muted }}
                        >
                          {p.description}
                        </div>
                      )}
                    </td>
                    <td
                      className="px-3 py-2"
                      style={{ color: COLORS.muted, fontSize: "11px" }}
                    >
                      {p.event_source}
                    </td>
                    <td className="px-3 py-2">
                      {severityBadge(p.severity_filter)}
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.text }}>
                      {p.steps?.length ?? 0} tier(s)
                    </td>
                    <td
                      className="px-3 py-2"
                      style={{ color: COLORS.muted, fontSize: "11px" }}
                    >
                      {p.repeat_count}x a cada {p.repeat_interval_minutes}min
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                        style={{
                          background: p.is_active
                            ? `${COLORS.green}15`
                            : `${COLORS.muted}15`,
                          color: p.is_active ? COLORS.green : COLORS.muted,
                        }}
                      >
                        {p.is_active ? "Ativa" : "Inativa"}
                      </span>
                    </td>
                    <td
                      className="px-3 py-2"
                      style={{ color: COLORS.muted, fontSize: "11px" }}
                    >
                      {formatTime(p.created_at)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex gap-1 justify-end">
                        <button
                          onClick={() => openEdit(p)}
                          className="p-1 rounded"
                          style={{
                            background: `${COLORS.blue}15`,
                            color: COLORS.blue,
                            cursor: "pointer",
                          }}
                          title="Editar"
                        >
                          <Edit3 size={12} />
                        </button>
                        <button
                          onClick={() => handleDelete(p.id)}
                          className="p-1 rounded"
                          style={{
                            background: `${COLORS.red}15`,
                            color: COLORS.red,
                            cursor: "pointer",
                          }}
                          title="Excluir"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab: Instances */}
      {tab === "instances" && (
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderTop: "none",
          }}
        >
          {/* Filtro de status */}
          <div
            className="flex gap-2 p-3"
            style={{ borderBottom: `1px solid ${COLORS.border}` }}
          >
            {["active", "escalated", "resolved", "expired"].map((st) => (
              <button
                key={st}
                onClick={() => setInstanceFilter(st)}
                className="px-3 py-1 rounded text-[11px] font-bold uppercase"
                style={{
                  background:
                    instanceFilter === st ? `${COLORS.teal}15` : "transparent",
                  border: `1px solid ${
                    instanceFilter === st ? COLORS.teal : COLORS.border
                  }`,
                  color: instanceFilter === st ? COLORS.teal : COLORS.muted,
                  cursor: "pointer",
                }}
              >
                {st}
              </button>
            ))}
          </div>

          {instances.length === 0 ? (
            <div
              className="p-8 text-center text-sm"
              style={{ color: COLORS.muted }}
            >
              Nenhuma instância {instanceFilter}.
            </div>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Alerta
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Política
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Severidade
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Source
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Tier Atual
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Status
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Próxima Esc.
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Criado
                  </th>
                  <th
                    className="text-right px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  ></th>
                </tr>
              </thead>
              <tbody>
                {instances.map((inst) => (
                  <tr
                    key={inst.id}
                    style={{ borderBottom: `1px solid ${COLORS.border}` }}
                  >
                    <td className="px-3 py-2">
                      <div style={{ color: COLORS.text }}>
                        {inst.alert_subject}
                      </div>
                      <div
                        className="text-[10px] max-w-xs truncate"
                        style={{ color: COLORS.muted }}
                      >
                        {inst.alert_body}
                      </div>
                    </td>
                    <td
                      className="px-3 py-2"
                      style={{ color: COLORS.teal, fontSize: "11px" }}
                    >
                      {inst.policy_name ?? inst.policy_id.slice(0, 8)}
                    </td>
                    <td className="px-3 py-2">
                      {severityBadge(inst.alert_severity)}
                    </td>
                    <td
                      className="px-3 py-2"
                      style={{ color: COLORS.muted, fontSize: "11px" }}
                    >
                      {inst.alert_source}
                    </td>
                    <td
                      className="px-3 py-2"
                      style={{ color: COLORS.amber, fontWeight: "bold" }}
                    >
                      T{inst.current_tier}
                    </td>
                    <td className="px-3 py-2">{statusBadge(inst.status)}</td>
                    <td
                      className="px-3 py-2"
                      style={{ color: COLORS.muted, fontSize: "11px" }}
                    >
                      {formatTime(inst.next_escalation_at)}
                    </td>
                    <td
                      className="px-3 py-2"
                      style={{ color: COLORS.muted, fontSize: "11px" }}
                    >
                      {formatTime(inst.created_at)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {inst.status === "active" ||
                      inst.status === "escalated" ? (
                        <button
                          onClick={() => handleResolve(inst.id)}
                          className="px-2 py-1 rounded text-[10px] font-bold"
                          style={{
                            background: `${COLORS.green}15`,
                            border: `1px solid var(--status-ok-border)`,
                            color: COLORS.green,
                            cursor: "pointer",
                          }}
                        >
                          <CheckCircle2 size={12} className="inline" /> Resolver
                        </button>
                      ) : (
                        <span style={{ color: COLORS.muted, fontSize: "10px" }}>
                          {inst.resolved_by ? "Resolvido" : "—"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modal: Create/Edit Policy */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => setShowCreate(false)}
        >
          <div
            className="rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              className="flex items-center justify-between p-4"
              style={{ borderBottom: `1px solid ${COLORS.border}` }}
            >
              <h2 className="text-sm font-bold" style={{ color: COLORS.teal }}>
                {editPolicy
                  ? "Editar Política"
                  : "Nova Política de Escalonamento"}
              </h2>
              <button
                onClick={() => setShowCreate(false)}
                style={{ color: COLORS.muted, cursor: "pointer" }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 space-y-4">
              {/* Nome */}
              <div>
                <label style={labelStyle}>Nome *</label>
                <input
                  type="text"
                  value={fName}
                  onChange={(e) => setFName(e.target.value)}
                  placeholder="Ex: Escalonamento Critical — Servidor Down"
                  style={inputStyle}
                />
              </div>

              {/* Descricao */}
              <div>
                <label style={labelStyle}>Descrição</label>
                <input
                  type="text"
                  value={fDescription}
                  onChange={(e) => setFDescription(e.target.value)}
                  placeholder="Descrição opcional"
                  style={inputStyle}
                />
              </div>

              {/* Grid: Event Source + Severity */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label style={labelStyle}>Evento (Source) *</label>
                  <select
                    value={fEventSource}
                    onChange={(e) => setFEventSource(e.target.value)}
                    style={inputStyle}
                  >
                    {EVENT_SOURCES.map((src) => (
                      <option key={src} value={src}>
                        {src}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Filtro de Severidade</label>
                  <select
                    value={fSeverity}
                    onChange={(e) => setFSeverity(e.target.value)}
                    style={inputStyle}
                  >
                    <option value="all">Todas</option>
                    <option value="info">Info</option>
                    <option value="warning">Warning</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
              </div>

              {/* Grid: Repeat Count + Interval */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label style={labelStyle}>Repetições</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={fRepeatCount}
                    onChange={(e) =>
                      setFRepeatCount(parseInt(e.target.value, 10) || 1)
                    }
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Intervalo (minutos)</label>
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    value={fRepeatInterval}
                    onChange={(e) =>
                      setFRepeatInterval(parseInt(e.target.value, 10) || 1)
                    }
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Ativo */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={fActive}
                  onChange={(e) => setFActive(e.target.checked)}
                  id="policy-active"
                />
                <label
                  htmlFor="policy-active"
                  className="text-[12px]"
                  style={{ color: COLORS.text }}
                >
                  Política ativa
                </label>
              </div>

              {/* Steps */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label style={{ ...labelStyle, marginBottom: 0 }}>
                    Steps de Escalonamento *
                  </label>
                  <button
                    onClick={addStep}
                    className="text-[11px] px-2 py-1 rounded font-bold"
                    style={{
                      background: `${COLORS.teal}15`,
                      color: COLORS.teal,
                      cursor: "pointer",
                    }}
                  >
                    <Plus size={10} className="inline" /> Step
                  </button>
                </div>

                <div className="space-y-3">
                  {fSteps.map((step, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg p-3 space-y-3"
                      style={{
                        background: COLORS.bg,
                        border: `1px solid ${COLORS.border}`,
                      }}
                    >
                      {/* Step Header */}
                      <div className="flex items-center justify-between">
                        <span
                          className="text-[11px] font-bold"
                          style={{ color: COLORS.amber }}
                        >
                          TIER {step.tier}
                        </span>
                        <div className="flex gap-1">
                          <button
                            onClick={() => moveStep(idx, "up")}
                            disabled={idx === 0}
                            style={{
                              color: idx === 0 ? COLORS.muted : COLORS.teal,
                              cursor: idx === 0 ? "not-allowed" : "pointer",
                              opacity: idx === 0 ? 0.3 : 1,
                            }}
                          >
                            <ChevronUp size={14} />
                          </button>
                          <button
                            onClick={() => moveStep(idx, "down")}
                            disabled={idx === fSteps.length - 1}
                            style={{
                              color:
                                idx === fSteps.length - 1
                                  ? COLORS.muted
                                  : COLORS.teal,
                              cursor:
                                idx === fSteps.length - 1
                                  ? "not-allowed"
                                  : "pointer",
                              opacity: idx === fSteps.length - 1 ? 0.3 : 1,
                            }}
                          >
                            <ChevronDown size={14} />
                          </button>
                          {fSteps.length > 1 && (
                            <button
                              onClick={() => removeStep(idx)}
                              style={{
                                color: COLORS.red,
                                cursor: "pointer",
                              }}
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Step: Delay */}
                      <div>
                        <label style={labelStyle}>
                          Delay antes de escalar (minutos)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={1440}
                          value={step.delay_minutes}
                          onChange={(e) =>
                            updateStep(
                              idx,
                              "delay_minutes",
                              parseInt(e.target.value, 10) || 0,
                            )
                          }
                          style={inputStyle}
                        />
                      </div>

                      {/* Step: Channels */}
                      <div>
                        <label style={labelStyle}>
                          Canais de Notificação *
                        </label>
                        {channels.length === 0 ? (
                          <div
                            className="text-[11px] p-2 rounded"
                            style={{
                              background: `${COLORS.amber}10`,
                              color: COLORS.amber,
                            }}
                          >
                            Nenhum canal cadastrado. Crie canais em Notificações
                            primeiro.
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {channels.map((ch) => {
                              const selected = step.channel_ids.includes(ch.id);
                              return (
                                <button
                                  key={ch.id}
                                  onClick={() => toggleChannel(idx, ch.id)}
                                  className="px-2 py-1 rounded text-[11px] font-bold"
                                  style={{
                                    background: selected
                                      ? `${COLORS.teal}15`
                                      : "transparent",
                                    border: `1px solid ${
                                      selected ? COLORS.teal : COLORS.border
                                    }`,
                                    color: selected
                                      ? COLORS.teal
                                      : COLORS.muted,
                                    cursor: "pointer",
                                    opacity: ch.is_active ? 1 : 0.4,
                                  }}
                                >
                                  {ch.name} ({ch.channel_type})
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Step: Templates */}
                      <div className="grid grid-cols-1 gap-2">
                        <div>
                          <label style={labelStyle}>
                            Template Subject (opcional)
                          </label>
                          <input
                            type="text"
                            value={step.template_subject ?? ""}
                            onChange={(e) =>
                              updateStep(
                                idx,
                                "template_subject",
                                e.target.value || null,
                              )
                            }
                            placeholder="Usa subject do alerta se vazio"
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label style={labelStyle}>
                            Template Body (opcional)
                          </label>
                          <textarea
                            value={step.template_body ?? ""}
                            onChange={(e) =>
                              updateStep(
                                idx,
                                "template_body",
                                e.target.value || null,
                              )
                            }
                            placeholder="Usa body do alerta se vazio"
                            style={{
                              ...inputStyle,
                              minHeight: "60px",
                              resize: "vertical",
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div
              className="flex justify-end gap-2 p-4"
              style={{ borderTop: `1px solid ${COLORS.border}` }}
            >
              <button
                onClick={() => setShowCreate(false)}
                className="text-[12px] px-4 py-2 rounded border"
                style={{
                  background: "transparent",
                  border: `1px solid ${COLORS.border}`,
                  color: COLORS.muted,
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                className="text-[12px] px-4 py-2 rounded font-bold"
                style={{
                  background: COLORS.teal,
                  color: COLORS.bg,
                  cursor: "pointer",
                }}
              >
                {editPolicy ? "Salvar" : "Criar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Trigger Escalation */}
      {showTrigger && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => setShowTrigger(false)}
        >
          <div
            className="rounded-xl max-w-lg w-full"
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between p-4"
              style={{ borderBottom: `1px solid ${COLORS.border}` }}
            >
              <h2 className="text-sm font-bold" style={{ color: COLORS.amber }}>
                <AlertTriangle size={14} className="inline mr-1" /> Disparar
                Escalonamento Manual
              </h2>
              <button
                onClick={() => setShowTrigger(false)}
                style={{ color: COLORS.muted, cursor: "pointer" }}
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label style={labelStyle}>Subject *</label>
                <input
                  type="text"
                  value={tSubject}
                  onChange={(e) => setTSubject(e.target.value)}
                  placeholder="Ex: Servidor SRV-01 indisponível"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Body *</label>
                <textarea
                  value={tBody}
                  onChange={(e) => setTBody(e.target.value)}
                  placeholder="Descrição detalhada do alerta..."
                  style={{
                    ...inputStyle,
                    minHeight: "80px",
                    resize: "vertical",
                  }}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label style={labelStyle}>Severidade</label>
                  <select
                    value={tSeverity}
                    onChange={(e) => setTSeverity(e.target.value)}
                    style={inputStyle}
                  >
                    <option value="info">Info</option>
                    <option value="warning">Warning</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Source</label>
                  <select
                    value={tSource}
                    onChange={(e) => setTSource(e.target.value)}
                    style={inputStyle}
                  >
                    {EVENT_SOURCES.map((src) => (
                      <option key={src} value={src}>
                        {src}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div
                className="text-[11px] p-2 rounded"
                style={{
                  background: `${COLORS.amber}10`,
                  color: COLORS.amber,
                }}
              >
                O sistema busca uma política ativa para o source selecionado e
                dispara o escalonamento a partir do Tier 1.
              </div>
            </div>

            <div
              className="flex justify-end gap-2 p-4"
              style={{ borderTop: `1px solid ${COLORS.border}` }}
            >
              <button
                onClick={() => setShowTrigger(false)}
                className="text-[12px] px-4 py-2 rounded border"
                style={{
                  background: "transparent",
                  border: `1px solid ${COLORS.border}`,
                  color: COLORS.muted,
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleTrigger}
                className="text-[12px] px-4 py-2 rounded font-bold"
                style={{
                  background: COLORS.amber,
                  color: COLORS.bg,
                  cursor: "pointer",
                }}
              >
                <Play size={12} className="inline" /> Disparar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
