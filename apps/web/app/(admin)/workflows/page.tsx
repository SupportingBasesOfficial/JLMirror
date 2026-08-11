// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState, useCallback } from "react";
import {
  Workflow,
  Play,
  Plus,
  Trash2,
  Copy,
  ChevronDown,
  ChevronRight,
  Server,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Shield,
  GitBranch,
  FileCode,
  Terminal,
  AlertTriangle,
  Eye,
  StopCircle,
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

interface WorkflowItem {
  id: string;
  device_hostname: string;
  name: string;
  description: string | null;
  category: string;
  tags: string[];
  is_template: boolean;
  is_active: boolean;
  version: number;
  step_count: string;
  running_executions: string;
  completed_executions: string;
  failed_executions: string;
  created_at: string;
  updated_at: string;
}

interface WorkflowStep {
  id: string;
  step_order: number;
  name: string;
  description: string | null;
  step_type: string;
  content: string;
  language: string;
  condition_expression: string | null;
  on_failure: string;
  retry_count: number;
  timeout_seconds: number;
  requires_approval: boolean;
  output_variables: string[];
}

interface WorkflowExecution {
  id: string;
  workflow_id: string;
  triggered_by: string;
  triggered_by_name: string;
  status: string;
  current_step: number;
  total_steps: number;
  trigger_reason: string;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  created_at: string;
}

interface StepExecution {
  id: string;
  step_id: string;
  step_order: number;
  step_name: string;
  step_type: string;
  status: string;
  output: string | null;
  exit_code: number | null;
  error_message: string | null;
  attempt: number;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  approved_by: string | null;
}

interface Device {
  id: string;
  hostname: string;
  ip: string;
  status: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  general: "Geral",
  remediation: "Remediação",
  diagnostic: "Diagnóstico",
  maintenance: "Manutenção",
  deployment: "Deploy",
  security: "Segurança",
  backup: "Backup",
  custom: "Custom",
};

const STEP_TYPE_ICONS: Record<string, React.ReactNode> = {
  script: <FileCode size={12} />,
  command: <Terminal size={12} />,
  ssh_command: <Terminal size={12} />,
  http_request: <GitBranch size={12} />,
  condition: <GitBranch size={12} />,
  approval: <Shield size={12} />,
  delay: <Clock size={12} />,
  notification: <AlertTriangle size={12} />,
};

const STATUS_COLORS: Record<string, string> = {
  pending: COLORS.muted,
  running: COLORS.teal,
  completed: COLORS.green,
  failed: COLORS.red,
  cancelled: COLORS.muted,
  timeout: COLORS.amber,
  awaiting_approval: COLORS.amber,
  approved: COLORS.green,
  rejected: COLORS.red,
  skipped: COLORS.muted,
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
  return `${Math.floor(hours / 24)}d atrás`;
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  return `${mins}m ${secs % 60}s`;
}

const num = (v: string | undefined): number => parseInt(v ?? "0", 10);

type Tab = "list" | "create" | "detail" | "executions";

export default function WorkflowsPage() {
  const [tab, setTab] = useState<Tab>("list");
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedExec, setExpandedExec] = useState<string | null>(null);
  const [stepExecs, setStepExecs] = useState<Record<string, StepExecution[]>>(
    {},
  );

  const { data: workflowsData, mutate: mutateWorkflows } = useApi<{
    workflows: WorkflowItem[];
  }>("/api/v1/workflows?active=false");
  const { data: devicesData } = useApi<{ devices: Device[] }>(
    "/api/v1/workflows/devices/list",
  );

  const workflows = workflowsData?.workflows ?? [];
  const devices = devicesData?.devices ?? [];

  const handleExecute = async (workflowId: string, name: string) => {
    const reason = window.prompt(
      `Disparar workflow "${name}".\nMotivo da execução:`,
    );
    if (reason === null) return;

    setActionLoading(`${workflowId}-exec`);
    setError(null);
    try {
      const res = await fetch(`/api/v1/workflows/${workflowId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason: reason || "Execução manual" }),
      });
      if (res.ok) {
        const data = await res.json();
        mutateWorkflows();
        setSelectedWorkflowId(workflowId);
        setTab("executions");
        setExpandedExec(data.execution_id);
        void loadStepExecs(data.execution_id);
      } else {
        const data = await res.json();
        setError(data?.error?.message ?? "Erro ao executar workflow");
      }
    } catch {
      setError("Erro de conexão");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (workflowId: string) => {
    if (!window.confirm("Excluir este workflow?")) return;
    setActionLoading(`${workflowId}-delete`);
    try {
      const res = await fetch(`/api/v1/workflows/${workflowId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        mutateWorkflows();
        if (selectedWorkflowId === workflowId) {
          setTab("list");
          setSelectedWorkflowId(null);
        }
      }
    } catch {
      // Silencioso
    } finally {
      setActionLoading(null);
    }
  };

  const handleClone = async (workflowId: string) => {
    const hostname = window.prompt("Hostname do servidor de destino:");
    if (!hostname) return;
    setActionLoading(`${workflowId}-clone`);
    try {
      const res = await fetch(`/api/v1/workflows/${workflowId}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ device_hostname: hostname }),
      });
      if (res.ok) {
        mutateWorkflows();
      }
    } catch {
      // Silencioso
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelExec = async (executionId: string) => {
    setActionLoading(`${executionId}-cancel`);
    try {
      const res = await fetch(
        `/api/v1/workflows/executions/${executionId}/cancel`,
        {
          method: "POST",
          credentials: "include",
        },
      );
      if (res.ok) {
        setExpandedExec(null);
      }
    } catch {
      // Silencioso
    } finally {
      setActionLoading(null);
    }
  };

  const loadStepExecs = useCallback(async (executionId: string) => {
    try {
      const res = await fetch(`/api/v1/workflows/executions/${executionId}`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setStepExecs((prev) => ({
          ...prev,
          [executionId]: data.step_executions ?? [],
        }));
      }
    } catch {
      // Silencioso
    }
  }, []);

  const toggleExec = (executionId: string) => {
    if (expandedExec === executionId) {
      setExpandedExec(null);
      return;
    }
    setExpandedExec(executionId);
    if (!stepExecs[executionId]) {
      void loadStepExecs(executionId);
    }
  };

  const openDetail = (workflowId: string) => {
    setSelectedWorkflowId(workflowId);
    setTab("detail");
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
            <Workflow size={18} className="inline mr-1" /> Workflow Builder
          </h1>
          <p className="text-[12px]" style={{ color: COLORS.muted }}>
            Workflows por servidor · Disparo manual · Auditoria completa
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              mutateWorkflows();
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
          <button
            onClick={() => setTab("create")}
            className="text-[12px] px-3 py-1.5 rounded font-bold flex items-center gap-2"
            style={{
              background: COLORS.teal,
              color: "white",
              cursor: "pointer",
            }}
          >
            <Plus size={12} /> Novo Workflow
          </button>
        </div>
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

      {/* Tab: List */}
      {tab === "list" && (
        <div className="space-y-3">
          {workflows.length === 0 && (
            <div
              className="rounded-xl p-8 text-center"
              style={{
                background: COLORS.card,
                border: `1px solid ${COLORS.border}`,
              }}
            >
              <Workflow
                size={24}
                className="mx-auto mb-2"
                style={{ color: COLORS.muted }}
              />
              <p className="text-sm" style={{ color: COLORS.muted }}>
                Nenhum workflow criado
              </p>
              <p className="text-[10px] mt-1" style={{ color: COLORS.muted }}>
                Clique em "Novo Workflow" para começar
              </p>
            </div>
          )}
          {workflows.map((w) => (
            <div
              key={w.id}
              className="rounded-xl p-4"
              style={{
                background: COLORS.card,
                border: `1px solid ${COLORS.border}`,
              }}
            >
              <div className="flex items-center justify-between">
                <div
                  className="flex-1 cursor-pointer"
                  onClick={() => openDetail(w.id)}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="text-[13px] font-bold"
                      style={{ color: COLORS.text }}
                    >
                      {w.name}
                    </span>
                    <span
                      className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                      style={{
                        background: `${COLORS.teal}15`,
                        color: COLORS.teal,
                      }}
                    >
                      {CATEGORY_LABELS[w.category] ?? w.category}
                    </span>
                    {w.is_template && (
                      <span
                        className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                        style={{
                          background: `${COLORS.blue}15`,
                          color: COLORS.blue,
                        }}
                      >
                        Template
                      </span>
                    )}
                    {!w.is_active && (
                      <span
                        className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                        style={{
                          background: `${COLORS.muted}15`,
                          color: COLORS.muted,
                        }}
                      >
                        Inativo
                      </span>
                    )}
                    {num(w.running_executions) > 0 && (
                      <span
                        className="px-2 py-0.5 rounded text-[10px] font-bold uppercase flex items-center gap-1"
                        style={{
                          background: `${COLORS.teal}15`,
                          color: COLORS.teal,
                        }}
                      >
                        <Loader2 size={9} className="animate-spin" />{" "}
                        {num(w.running_executions)} rodando
                      </span>
                    )}
                  </div>
                  {w.description && (
                    <p
                      className="text-[11px] mt-1"
                      style={{ color: COLORS.muted }}
                    >
                      {w.description}
                    </p>
                  )}
                  <div
                    className="flex items-center gap-3 mt-2 text-[10px] flex-wrap"
                    style={{ color: COLORS.muted }}
                  >
                    <span className="flex items-center gap-1">
                      <Server size={10} /> {w.device_hostname}
                    </span>
                    <span className="flex items-center gap-1">
                      <GitBranch size={10} /> {num(w.step_count)} steps
                    </span>
                    <span className="flex items-center gap-1">
                      <CheckCircle2 size={10} style={{ color: COLORS.green }} />{" "}
                      {num(w.completed_executions)} ok
                    </span>
                    {num(w.failed_executions) > 0 && (
                      <span className="flex items-center gap-1">
                        <XCircle size={10} style={{ color: COLORS.red }} />{" "}
                        {num(w.failed_executions)} falhas
                      </span>
                    )}
                    <span>v{w.version}</span>
                    <span>{timeAgo(w.updated_at)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleExecute(w.id, w.name)}
                    disabled={!w.is_active || actionLoading === `${w.id}-exec`}
                    className="px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1"
                    style={{
                      background: `${COLORS.green}15`,
                      border: `1px solid ${COLORS.green}`,
                      color: COLORS.green,
                      cursor: w.is_active ? "pointer" : "not-allowed",
                      opacity:
                        !w.is_active || actionLoading === `${w.id}-exec`
                          ? 0.4
                          : 1,
                    }}
                  >
                    {actionLoading === `${w.id}-exec` ? (
                      <Loader2 size={10} className="animate-spin" />
                    ) : (
                      <Play size={10} />
                    )}
                    Executar
                  </button>
                  <button
                    onClick={() => handleClone(w.id)}
                    disabled={actionLoading === `${w.id}-clone`}
                    className="px-2 py-1 rounded text-[10px] font-bold"
                    style={{
                      background: `${COLORS.blue}15`,
                      border: `1px solid ${COLORS.blue}`,
                      color: COLORS.blue,
                      cursor: "pointer",
                      opacity: actionLoading === `${w.id}-clone` ? 0.5 : 1,
                    }}
                  >
                    <Copy size={10} />
                  </button>
                  <button
                    onClick={() => openDetail(w.id)}
                    className="px-2 py-1 rounded text-[10px] font-bold"
                    style={{
                      background: `${COLORS.muted}15`,
                      border: `1px solid ${COLORS.muted}`,
                      color: COLORS.muted,
                      cursor: "pointer",
                    }}
                  >
                    <Eye size={10} />
                  </button>
                  <button
                    onClick={() => handleDelete(w.id)}
                    disabled={actionLoading === `${w.id}-delete`}
                    className="px-2 py-1 rounded text-[10px] font-bold"
                    style={{
                      background: `${COLORS.red}15`,
                      border: `1px solid ${COLORS.red}`,
                      color: COLORS.red,
                      cursor: "pointer",
                      opacity: actionLoading === `${w.id}-delete` ? 0.5 : 1,
                    }}
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab: Create */}
      {tab === "create" && (
        <CreateWorkflowForm
          devices={devices}
          onCancel={() => setTab("list")}
          onCreated={() => {
            mutateWorkflows();
            setTab("list");
          }}
        />
      )}

      {/* Tab: Detail */}
      {tab === "detail" && selectedWorkflowId && (
        <WorkflowDetail
          workflowId={selectedWorkflowId}
          onBack={() => {
            setTab("list");
            setSelectedWorkflowId(null);
          }}
          onExecute={(id, name) => handleExecute(id, name)}
          onShowExecutions={(id) => {
            setSelectedWorkflowId(id);
            setTab("executions");
          }}
        />
      )}

      {/* Tab: Executions */}
      {tab === "executions" && selectedWorkflowId && (
        <WorkflowExecutions
          workflowId={selectedWorkflowId}
          onBack={() => setTab("list")}
          expandedExec={expandedExec}
          stepExecs={stepExecs}
          onToggleExec={toggleExec}
          onCancelExec={handleCancelExec}
          actionLoading={actionLoading}
        />
      )}
    </div>
  );
}

function CreateWorkflowForm({
  devices,
  onCancel,
  onCreated,
}: {
  devices: Device[];
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    device_hostname: "",
    name: "",
    description: "",
    category: "general",
    is_template: false,
  });
  const [steps, setSteps] = useState<
    Array<{
      step_order: number;
      name: string;
      description: string;
      step_type: string;
      content: string;
      language: string;
      on_failure: string;
      timeout_seconds: number;
      requires_approval: boolean;
      condition_expression: string;
    }>
  >([]);

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

  const addStep = () => {
    setSteps([
      ...steps,
      {
        step_order: steps.length,
        name: `Step ${steps.length + 1}`,
        description: "",
        step_type: "command",
        content: "",
        language: "bash",
        on_failure: "stop",
        timeout_seconds: 300,
        requires_approval: false,
        condition_expression: "",
      },
    ]);
  };

  const updateStep = (idx: number, field: string, value: unknown) => {
    setSteps(steps.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));
  };

  const removeStep = (idx: number) => {
    setSteps(
      steps
        .filter((_, i) => i !== idx)
        .map((s, i) => ({ ...s, step_order: i })),
    );
  };

  const moveStep = (idx: number, dir: "up" | "down") => {
    if (dir === "up" && idx > 0) {
      const newSteps = [...steps];
      [newSteps[idx - 1], newSteps[idx]] = [newSteps[idx]!, newSteps[idx - 1]!];
      setSteps(newSteps.map((s, i) => ({ ...s, step_order: i })));
    } else if (dir === "down" && idx < steps.length - 1) {
      const newSteps = [...steps];
      [newSteps[idx + 1], newSteps[idx]] = [newSteps[idx]!, newSteps[idx + 1]!];
      setSteps(newSteps.map((s, i) => ({ ...s, step_order: i })));
    }
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.device_hostname) {
      setError("Nome e hostname são obrigatórios");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...formData, steps }),
      });
      if (res.ok) {
        onCreated();
      } else {
        const data = await res.json();
        setError(data?.error?.message ?? "Erro ao criar workflow");
      }
    } catch {
      setError("Erro de conexão");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold" style={{ color: COLORS.teal }}>
          Novo Workflow
        </h2>
        <button
          onClick={onCancel}
          className="text-[12px] px-3 py-1.5 rounded font-bold"
          style={{
            background: "var(--surface-1)",
            border: `1px solid ${COLORS.border}`,
            color: COLORS.muted,
            cursor: "pointer",
          }}
        >
          Voltar
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

      <div
        className="rounded-xl p-6 space-y-4"
        style={{
          background: COLORS.card,
          border: `1px solid ${COLORS.border}`,
        }}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label style={labelStyle}>Nome *</label>
            <input
              style={inputStyle}
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder="Ex: Restart serviço Apache"
            />
          </div>
          <div>
            <label style={labelStyle}>Servidor (Hostname) *</label>
            <input
              style={inputStyle}
              list="device-list"
              value={formData.device_hostname}
              onChange={(e) =>
                setFormData({ ...formData, device_hostname: e.target.value })
              }
              placeholder="Ex: srv-web-01"
            />
            <datalist id="device-list">
              {devices.map((d) => (
                <option key={d.id} value={d.hostname} />
              ))}
            </datalist>
          </div>
          <div>
            <label style={labelStyle}>Categoria</label>
            <select
              style={inputStyle}
              value={formData.category}
              onChange={(e) =>
                setFormData({ ...formData, category: e.target.value })
              }
            >
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Descrição</label>
            <input
              style={inputStyle}
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              placeholder="Descreva o objetivo do workflow"
            />
          </div>
        </div>
        <label
          className="flex items-center gap-2 text-[12px]"
          style={{ color: COLORS.text }}
        >
          <input
            type="checkbox"
            checked={formData.is_template}
            onChange={(e) =>
              setFormData({ ...formData, is_template: e.target.checked })
            }
          />
          Salvar como template (pode ser clonado para outros servidores)
        </label>
      </div>

      {/* Steps */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3
            className="text-[10px] font-bold uppercase"
            style={{ color: COLORS.muted }}
          >
            Steps ({steps.length})
          </h3>
          <button
            onClick={addStep}
            className="text-[12px] px-3 py-1.5 rounded font-bold flex items-center gap-2"
            style={{
              background: `${COLORS.teal}15`,
              border: `1px solid ${COLORS.teal}`,
              color: COLORS.teal,
              cursor: "pointer",
            }}
          >
            <Plus size={12} /> Adicionar Step
          </button>
        </div>

        {steps.map((step, idx) => (
          <div
            key={idx}
            className="rounded-xl p-4 space-y-3"
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="px-2 py-0.5 rounded text-[10px] font-bold"
                  style={{ background: COLORS.teal, color: "white" }}
                >
                  {idx + 1}
                </span>
                <input
                  style={{ ...inputStyle, width: "auto", minWidth: "200px" }}
                  value={step.name}
                  onChange={(e) => updateStep(idx, "name", e.target.value)}
                />
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => moveStep(idx, "up")}
                  disabled={idx === 0}
                  className="px-1.5 py-1 rounded text-[10px]"
                  style={{
                    background: "var(--surface-1)",
                    border: `1px solid ${COLORS.border}`,
                    cursor: idx === 0 ? "not-allowed" : "pointer",
                    opacity: idx === 0 ? 0.3 : 1,
                  }}
                >
                  ↑
                </button>
                <button
                  onClick={() => moveStep(idx, "down")}
                  disabled={idx === steps.length - 1}
                  className="px-1.5 py-1 rounded text-[10px]"
                  style={{
                    background: "var(--surface-1)",
                    border: `1px solid ${COLORS.border}`,
                    cursor:
                      idx === steps.length - 1 ? "not-allowed" : "pointer",
                    opacity: idx === steps.length - 1 ? 0.3 : 1,
                  }}
                >
                  ↓
                </button>
                <button
                  onClick={() => removeStep(idx)}
                  className="px-1.5 py-1 rounded text-[10px]"
                  style={{
                    background: `${COLORS.red}15`,
                    border: `1px solid ${COLORS.red}`,
                    color: COLORS.red,
                    cursor: "pointer",
                  }}
                >
                  <Trash2 size={10} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label style={labelStyle}>Tipo</label>
                <select
                  style={inputStyle}
                  value={step.step_type}
                  onChange={(e) => updateStep(idx, "step_type", e.target.value)}
                >
                  <option value="command">Comando</option>
                  <option value="script">Script</option>
                  <option value="ssh_command">SSH Command</option>
                  <option value="http_request">HTTP Request</option>
                  <option value="condition">Condição</option>
                  <option value="approval">Aprovação</option>
                  <option value="delay">Delay</option>
                  <option value="notification">Notificação</option>
                </select>
              </div>
              {(step.step_type === "script" ||
                step.step_type === "command" ||
                step.step_type === "ssh_command") && (
                <div>
                  <label style={labelStyle}>Linguagem</label>
                  <select
                    style={inputStyle}
                    value={step.language}
                    onChange={(e) =>
                      updateStep(idx, "language", e.target.value)
                    }
                  >
                    <option value="bash">Bash</option>
                    <option value="powershell">PowerShell</option>
                    <option value="python">Python</option>
                  </select>
                </div>
              )}
              <div>
                <label style={labelStyle}>Se falhar</label>
                <select
                  style={inputStyle}
                  value={step.on_failure}
                  onChange={(e) =>
                    updateStep(idx, "on_failure", e.target.value)
                  }
                >
                  <option value="stop">Parar</option>
                  <option value="continue">Continuar</option>
                  <option value="retry">Retentar</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Timeout (s)</label>
                <input
                  type="number"
                  style={inputStyle}
                  value={step.timeout_seconds}
                  onChange={(e) =>
                    updateStep(
                      idx,
                      "timeout_seconds",
                      parseInt(e.target.value, 10) || 300,
                    )
                  }
                />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Conteúdo</label>
              <textarea
                style={{
                  ...inputStyle,
                  minHeight: "80px",
                  fontFamily: "monospace",
                  resize: "vertical",
                }}
                value={step.content}
                onChange={(e) => updateStep(idx, "content", e.target.value)}
                placeholder={
                  step.step_type === "script"
                    ? "#!/bin/bash\nsystemctl restart apache2"
                    : step.step_type === "command"
                      ? "systemctl status apache2"
                      : "Conteúdo do step..."
                }
              />
            </div>

            <div>
              <label style={labelStyle}>
                Condição (opcional — só executa se verdadeira)
              </label>
              <input
                style={inputStyle}
                value={step.condition_expression}
                onChange={(e) =>
                  updateStep(idx, "condition_expression", e.target.value)
                }
                placeholder="Ex: $prev_exit_code == 0"
              />
            </div>

            <label
              className="flex items-center gap-2 text-[11px]"
              style={{ color: COLORS.text }}
            >
              <input
                type="checkbox"
                checked={step.requires_approval}
                onChange={(e) =>
                  updateStep(idx, "requires_approval", e.target.checked)
                }
              />
              <Shield size={11} /> Requer aprovação humana antes de executar
            </label>
          </div>
        ))}

        {steps.length === 0 && (
          <div
            className="rounded-xl p-6 text-center"
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
            }}
          >
            <p className="text-[12px]" style={{ color: COLORS.muted }}>
              Nenhum step adicionado. Clique em "Adicionar Step" para começar.
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="px-4 py-1.5 rounded text-[12px] font-bold flex items-center gap-2"
          style={{
            background: COLORS.teal,
            color: "white",
            cursor: "pointer",
            opacity: saving ? 0.5 : 1,
          }}
        >
          {saving ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <CheckCircle2 size={12} />
          )}
          Criar Workflow
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-1.5 rounded text-[12px] font-bold"
          style={{
            background: "var(--surface-1)",
            border: `1px solid ${COLORS.border}`,
            color: COLORS.muted,
            cursor: "pointer",
          }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

function WorkflowDetail({
  workflowId,
  onBack,
  onExecute,
  onShowExecutions,
}: {
  workflowId: string;
  onBack: () => void;
  onExecute: (id: string, name: string) => void;
  onShowExecutions: (id: string) => void;
}) {
  const { data } = useApi<{
    workflow: WorkflowItem & { step_count?: string };
    steps: WorkflowStep[];
  }>(`/api/v1/workflows/${workflowId}`);
  const [actionLoading, setActionLoading] = useState(false);

  if (!data) {
    return (
      <div className="text-center py-8">
        <Loader2
          size={20}
          className="animate-spin inline"
          style={{ color: COLORS.muted }}
        />
      </div>
    );
  }

  const { workflow, steps } = data;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="text-[12px] px-3 py-1.5 rounded font-bold"
          style={{
            background: "var(--surface-1)",
            border: `1px solid ${COLORS.border}`,
            color: COLORS.muted,
            cursor: "pointer",
          }}
        >
          ← Voltar
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onShowExecutions(workflowId)}
            className="text-[12px] px-3 py-1.5 rounded font-bold flex items-center gap-2"
            style={{
              background: `${COLORS.blue}15`,
              border: `1px solid ${COLORS.blue}`,
              color: COLORS.blue,
              cursor: "pointer",
            }}
          >
            <Clock size={12} /> Histórico
          </button>
          <button
            onClick={() => {
              setActionLoading(true);
              onExecute(workflowId, workflow.name);
              setActionLoading(false);
            }}
            disabled={!workflow.is_active || actionLoading}
            className="text-[12px] px-3 py-1.5 rounded font-bold flex items-center gap-2"
            style={{
              background: `${COLORS.green}15`,
              border: `1px solid ${COLORS.green}`,
              color: COLORS.green,
              cursor: workflow.is_active ? "pointer" : "not-allowed",
              opacity: !workflow.is_active || actionLoading ? 0.4 : 1,
            }}
          >
            <Play size={12} /> Executar
          </button>
        </div>
      </div>

      <div
        className="rounded-xl p-6"
        style={{
          background: COLORS.card,
          border: `1px solid ${COLORS.border}`,
        }}
      >
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <h2 className="text-sm font-bold" style={{ color: COLORS.text }}>
            {workflow.name}
          </h2>
          <span
            className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
            style={{ background: `${COLORS.teal}15`, color: COLORS.teal }}
          >
            {CATEGORY_LABELS[workflow.category] ?? workflow.category}
          </span>
          {workflow.is_template && (
            <span
              className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
              style={{ background: `${COLORS.blue}15`, color: COLORS.blue }}
            >
              Template
            </span>
          )}
        </div>
        {workflow.description && (
          <p className="text-[11px] mb-3" style={{ color: COLORS.muted }}>
            {workflow.description}
          </p>
        )}
        <div
          className="flex items-center gap-3 text-[10px] flex-wrap"
          style={{ color: COLORS.muted }}
        >
          <span className="flex items-center gap-1">
            <Server size={10} /> {workflow.device_hostname}
          </span>
          <span>v{workflow.version}</span>
          <span>{formatTime(workflow.updated_at)}</span>
        </div>
      </div>

      <div className="space-y-2">
        <h3
          className="text-[10px] font-bold uppercase"
          style={{ color: COLORS.muted }}
        >
          Steps ({steps.length})
        </h3>
        {steps.map((step, idx) => (
          <div
            key={step.id}
            className="rounded-xl p-4"
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span
                className="px-2 py-0.5 rounded text-[10px] font-bold"
                style={{ background: COLORS.teal, color: "white" }}
              >
                {idx + 1}
              </span>
              <span
                className="text-[12px] font-bold"
                style={{ color: COLORS.text }}
              >
                {step.name}
              </span>
              <span
                className="px-2 py-0.5 rounded text-[10px] flex items-center gap-1"
                style={{ background: "var(--surface-1)", color: COLORS.muted }}
              >
                {STEP_TYPE_ICONS[step.step_type]} {step.step_type}
              </span>
              {step.requires_approval && (
                <span
                  className="px-2 py-0.5 rounded text-[10px] font-bold uppercase flex items-center gap-1"
                  style={{
                    background: `${COLORS.amber}15`,
                    color: COLORS.amber,
                  }}
                >
                  <Shield size={9} /> Aprovação
                </span>
              )}
            </div>
            {step.description && (
              <p className="text-[11px] mb-2" style={{ color: COLORS.muted }}>
                {step.description}
              </p>
            )}
            <pre
              className="rounded-md p-3 text-[11px] overflow-x-auto"
              style={{
                background: "var(--surface-1)",
                color: COLORS.text,
                border: `1px solid ${COLORS.border}`,
              }}
            >
              {step.content}
            </pre>
            <div
              className="flex items-center gap-3 mt-2 text-[10px] flex-wrap"
              style={{ color: COLORS.muted }}
            >
              <span>Linguagem: {step.language}</span>
              <span>Se falhar: {step.on_failure}</span>
              <span>Timeout: {step.timeout_seconds}s</span>
              {step.condition_expression && (
                <span style={{ color: COLORS.amber }}>
                  Condição: {step.condition_expression}
                </span>
              )}
              {step.retry_count > 0 && <span>Retries: {step.retry_count}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WorkflowExecutions({
  workflowId,
  onBack,
  expandedExec,
  stepExecs,
  onToggleExec,
  onCancelExec,
  actionLoading,
}: {
  workflowId: string;
  onBack: () => void;
  expandedExec: string | null;
  stepExecs: Record<string, StepExecution[]>;
  onToggleExec: (id: string) => void;
  onCancelExec: (id: string) => void;
  actionLoading: string | null;
}) {
  const { data } = useApi<{ executions: WorkflowExecution[] }>(
    `/api/v1/workflows/${workflowId}/executions?limit=50`,
  );
  const executions = data?.executions ?? [];

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="text-[12px] px-3 py-1.5 rounded font-bold"
        style={{
          background: "var(--surface-1)",
          border: `1px solid ${COLORS.border}`,
          color: COLORS.muted,
          cursor: "pointer",
        }}
      >
        ← Voltar
      </button>

      <h3
        className="text-[10px] font-bold uppercase"
        style={{ color: COLORS.muted }}
      >
        Histórico de Execuções ({executions.length})
      </h3>

      {executions.length === 0 && (
        <div
          className="rounded-xl p-8 text-center"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
          }}
        >
          <p className="text-sm" style={{ color: COLORS.muted }}>
            Nenhuma execução registrada
          </p>
        </div>
      )}

      {executions.map((exec) => (
        <div
          key={exec.id}
          className="rounded-xl overflow-hidden"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
          }}
        >
          <div
            className="p-4 flex items-center justify-between cursor-pointer"
            onClick={() => onToggleExec(exec.id)}
          >
            <div className="flex items-center gap-3 flex-1">
              {expandedExec === exec.id ? (
                <ChevronDown size={14} style={{ color: COLORS.muted }} />
              ) : (
                <ChevronRight size={14} style={{ color: COLORS.muted }} />
              )}
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                    style={{
                      background: `${STATUS_COLORS[exec.status] ?? COLORS.muted}15`,
                      color: STATUS_COLORS[exec.status] ?? COLORS.muted,
                    }}
                  >
                    {exec.status === "running" && (
                      <Loader2 size={9} className="animate-spin inline mr-1" />
                    )}
                    {exec.status}
                  </span>
                  <span className="text-[12px]" style={{ color: COLORS.text }}>
                    {exec.trigger_reason}
                  </span>
                </div>
                <div
                  className="flex items-center gap-3 mt-1 text-[10px] flex-wrap"
                  style={{ color: COLORS.muted }}
                >
                  <span>Por: {exec.triggered_by_name}</span>
                  <span>
                    Step: {exec.current_step}/{exec.total_steps}
                  </span>
                  <span>{formatTime(exec.started_at)}</span>
                  <span>Duração: {formatDuration(exec.duration_ms)}</span>
                </div>
              </div>
            </div>
            {(exec.status === "running" ||
              exec.status === "awaiting_approval") && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCancelExec(exec.id);
                }}
                disabled={actionLoading === `${exec.id}-cancel`}
                className="px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1"
                style={{
                  background: `${COLORS.red}15`,
                  border: `1px solid ${COLORS.red}`,
                  color: COLORS.red,
                  cursor: "pointer",
                  opacity: actionLoading === `${exec.id}-cancel` ? 0.5 : 1,
                }}
              >
                <StopCircle size={10} /> Cancelar
              </button>
            )}
          </div>

          {expandedExec === exec.id && (
            <div className="border-t" style={{ borderColor: COLORS.border }}>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr style={{ background: "var(--surface-1)" }}>
                      <th
                        className="text-left p-2 font-bold uppercase text-[10px]"
                        style={{ color: COLORS.muted }}
                      >
                        #
                      </th>
                      <th
                        className="text-left p-2 font-bold uppercase text-[10px]"
                        style={{ color: COLORS.muted }}
                      >
                        Step
                      </th>
                      <th
                        className="text-left p-2 font-bold uppercase text-[10px]"
                        style={{ color: COLORS.muted }}
                      >
                        Tipo
                      </th>
                      <th
                        className="text-left p-2 font-bold uppercase text-[10px]"
                        style={{ color: COLORS.muted }}
                      >
                        Status
                      </th>
                      <th
                        className="text-left p-2 font-bold uppercase text-[10px]"
                        style={{ color: COLORS.muted }}
                      >
                        Exit
                      </th>
                      <th
                        className="text-left p-2 font-bold uppercase text-[10px]"
                        style={{ color: COLORS.muted }}
                      >
                        Duração
                      </th>
                      <th
                        className="text-left p-2 font-bold uppercase text-[10px]"
                        style={{ color: COLORS.muted }}
                      >
                        Output
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(stepExecs[exec.id] ?? []).map((se) => (
                      <tr
                        key={se.id}
                        style={{ borderBottom: `1px solid ${COLORS.border}` }}
                      >
                        <td className="p-2" style={{ color: COLORS.muted }}>
                          {se.step_order + 1}
                        </td>
                        <td className="p-2" style={{ color: COLORS.text }}>
                          {se.step_name}
                        </td>
                        <td className="p-2" style={{ color: COLORS.muted }}>
                          {se.step_type}
                        </td>
                        <td className="p-2">
                          <span
                            className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase"
                            style={{
                              background: `${STATUS_COLORS[se.status] ?? COLORS.muted}15`,
                              color: STATUS_COLORS[se.status] ?? COLORS.muted,
                            }}
                          >
                            {se.status}
                          </span>
                        </td>
                        <td
                          className="p-2"
                          style={{
                            color:
                              se.exit_code === 0
                                ? COLORS.green
                                : se.exit_code !== null
                                  ? COLORS.red
                                  : COLORS.muted,
                          }}
                        >
                          {se.exit_code !== null ? se.exit_code : "—"}
                        </td>
                        <td className="p-2" style={{ color: COLORS.muted }}>
                          {formatDuration(se.duration_ms)}
                        </td>
                        <td
                          className="p-2 max-w-xs truncate"
                          style={{ color: COLORS.muted }}
                        >
                          {se.error_message ?? se.output ?? "—"}
                        </td>
                      </tr>
                    ))}
                    {!stepExecs[exec.id] && (
                      <tr>
                        <td
                          colSpan={7}
                          className="p-4 text-center"
                          style={{ color: COLORS.muted }}
                        >
                          <Loader2 size={14} className="animate-spin inline" />{" "}
                          Carregando...
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {exec.error_message && (
                <div
                  className="p-3 text-[11px]"
                  style={{
                    background: "var(--status-error-bg)",
                    color: COLORS.red,
                  }}
                >
                  {exec.error_message}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
