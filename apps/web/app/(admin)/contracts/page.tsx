// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Plus,
  RefreshCw,
  Clock,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Calendar,
  FileClock,
  X,
  Play,
  Pause,
  Square,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Timer,
} from "lucide-react";
import { useApi } from "@/lib/use-api";
import { LoadingState } from "@/components/ui/state-display";
import { apiFetchWithProgress } from "@/lib/zabbix-fetch";

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

interface Contract {
  id: string;
  name: string;
  contract_number: string | null;
  contract_type: string;
  contracted_hours: number;
  period_type: string;
  billing_day: number;
  carry_over_rule: string;
  carry_over_limit_hours: number | null;
  carry_over_expire_days: number | null;
  overtime_enabled: boolean;
  overtime_rate: number | null;
  rate_diagnosis: number | null;
  rate_fix: number | null;
  rate_monitoring: number | null;
  rate_meeting: number | null;
  rate_research: number | null;
  rate_default: number | null;
  is_active: boolean;
  start_date: string;
  end_date: string | null;
  auto_close_tickets_on_expire: boolean;
  notes: string | null;
  used_hours_current_month: string | null;
  total_work_logs: string | null;
}

interface HourBankSummary {
  contract_id: string;
  contract_name: string;
  contracted_hours: number;
  used_hours: string;
  remaining_hours: string;
  carried_over_hours: string;
  overtime_hours: string;
  period_start: string;
  period_end: string;
  next_billing_date: string;
  used_by_type: Record<string, number>;
}

interface WorkLog {
  id: string;
  ticket_id: string;
  contract_id: string | null;
  user_name: string;
  started_at: string;
  ended_at: string | null;
  minutes_worked: number;
  pause_minutes: number;
  description: string;
  work_type: string;
  billable: boolean;
  status: string;
  total_seconds: number;
  rate_applied: number | null;
  amount: number;
  ticket_number?: string;
  ticket_subject?: string;
}

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  monthly_support: "Suporte Mensal",
  project_fixed: "Projeto (Horas Fixas)",
  project_lump_sum: "Projeto (Preço Fixo)",
  hour_bank: "Banco de Horas",
  on_demand: "Sob Demanda",
};

const CARRY_OVER_LABELS: Record<string, string> = {
  none: "Não acumula",
  unlimited: "Acúmulo ilimitado",
  limited: "Acúmulo limitado",
  expire: "Acúmulo com expiração",
};

const WORK_TYPE_LABELS: Record<string, string> = {
  diagnosis: "Diagnóstico",
  fix: "Correção",
  monitoring: "Monitoramento",
  meeting: "Reunião",
  research: "Pesquisa",
  travel: "Deslocamento",
  other: "Outro",
};

const PERIOD_LABELS: Record<string, string> = {
  monthly: "Mensal",
  quarterly: "Trimestral",
  yearly: "Anual",
  total: "Total",
};

function formatSeconds(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function ContractsPage() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedContractId, setSelectedContractId] = useState<string | null>(
    null,
  );
  const [actionLoading, setActionLoading] = useState(false);

  const {
    data: contractsData,
    error,
    isLoading,
    mutate,
  } = useApi<{ contracts: Contract[] }>("/api/v1/contracts");

  const { data: summaryData } = useApi<{ summary: HourBankSummary }>(
    selectedContractId
      ? `/api/v1/contracts/${selectedContractId}/hour-bank`
      : null,
  );

  const { data: workLogsData, mutate: mutateWorkLogs } = useApi<{
    work_logs: WorkLog[];
  }>(
    selectedContractId
      ? `/api/v1/contracts/${selectedContractId}/work-logs?limit=50`
      : null,
  );

  const contracts = contractsData?.contracts ?? [];
  const workLogs = workLogsData?.work_logs ?? [];

  const handleCreate = useCallback(
    async (formData: Record<string, string>) => {
      setActionLoading(true);
      try {
        await apiFetchWithProgress(
          "/api/v1/contracts",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: formData.name,
              contract_number: formData.contract_number || undefined,
              contract_type: formData.contract_type,
              contracted_hours: Number(formData.contracted_hours) || 0,
              period_type: formData.period_type || "monthly",
              billing_day: Number(formData.billing_day) || 1,
              carry_over_rule: formData.carry_over_rule || "none",
              carry_over_limit_hours: formData.carry_over_limit_hours
                ? Number(formData.carry_over_limit_hours)
                : undefined,
              carry_over_expire_days: formData.carry_over_expire_days
                ? Number(formData.carry_over_expire_days)
                : undefined,
              overtime_enabled: formData.overtime_enabled === "true",
              overtime_rate: formData.overtime_rate
                ? Number(formData.overtime_rate)
                : undefined,
              rate_diagnosis: formData.rate_diagnosis
                ? Number(formData.rate_diagnosis)
                : undefined,
              rate_fix: formData.rate_fix
                ? Number(formData.rate_fix)
                : undefined,
              rate_monitoring: formData.rate_monitoring
                ? Number(formData.rate_monitoring)
                : undefined,
              rate_meeting: formData.rate_meeting
                ? Number(formData.rate_meeting)
                : undefined,
              rate_research: formData.rate_research
                ? Number(formData.rate_research)
                : undefined,
              rate_default: formData.rate_default
                ? Number(formData.rate_default)
                : undefined,
              start_date: formData.start_date,
              end_date: formData.end_date || undefined,
              auto_close_tickets_on_expire:
                formData.auto_close_tickets_on_expire === "true",
              notes: formData.notes || undefined,
            }),
          },
          () => {},
        );
        await mutate();
        setShowCreateModal(false);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Erro ao criar contrato");
      } finally {
        setActionLoading(false);
      }
    },
    [mutate],
  );

  if (isLoading) {
    return <LoadingState label="Carregando contratos..." />;
  }

  if (error) {
    return (
      <div className="p-6" style={{ color: COLORS.red }}>
        Erro ao carregar contratos: {error}
      </div>
    );
  }

  return (
    <div
      className="p-6 space-y-6"
      style={{ background: COLORS.bg, minHeight: "100vh" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-2xl font-bold flex items-center gap-2"
            style={{ color: COLORS.text }}
          >
            <FileClock size={28} style={{ color: COLORS.teal }} />
            Contratos & Banco de Horas
          </h1>
          <p className="text-sm mt-1" style={{ color: COLORS.muted }}>
            Gestão de contratos de suporte, horas trabalhadas e faturamento
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => mutate()}
            className="p-2 rounded-lg border transition-colors"
            style={{ borderColor: COLORS.border, color: COLORS.muted }}
            title="Atualizar"
          >
            <RefreshCw size={18} />
          </button>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-white font-medium transition-opacity hover:opacity-90"
            style={{ background: COLORS.teal }}
          >
            <Plus size={18} />
            Novo Contrato
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KpiCard
          icon={<FileClock size={20} />}
          label="Contratos Ativos"
          value={contracts.filter((c) => c.is_active).length}
          color={COLORS.teal}
        />
        <KpiCard
          icon={<Clock size={20} />}
          label="Horas Contratadas/mês"
          value={contracts.reduce((sum, c) => sum + c.contracted_hours, 0)}
          color={COLORS.blue}
        />
        <KpiCard
          icon={<TrendingUp size={20} />}
          label="Horas Usadas (mês atual)"
          value={contracts
            .reduce(
              (sum, c) => sum + Number(c.used_hours_current_month ?? 0),
              0,
            )
            .toFixed(1)}
          color={COLORS.amber}
        />
        <KpiCard
          icon={<DollarSign size={20} />}
          label="Work Logs Total"
          value={contracts.reduce(
            (sum, c) => sum + Number(c.total_work_logs ?? 0),
            0,
          )}
          color={COLORS.green}
        />
      </div>

      {/* Contracts List */}
      <div className="space-y-3">
        {contracts.length === 0 ? (
          <div
            className="text-center py-12 rounded-xl border"
            style={{ borderColor: COLORS.border, color: COLORS.muted }}
          >
            Nenhum contrato cadastrado. Clique em &quot;Novo Contrato&quot; para
            começar.
          </div>
        ) : (
          contracts.map((contract) => (
            <ContractCard
              key={contract.id}
              contract={contract}
              isSelected={selectedContractId === contract.id}
              onSelect={() =>
                setSelectedContractId(
                  selectedContractId === contract.id ? null : contract.id,
                )
              }
              summary={
                selectedContractId === contract.id
                  ? summaryData?.summary
                  : undefined
              }
              workLogs={selectedContractId === contract.id ? workLogs : []}
              onWorkLogsChange={mutateWorkLogs}
            />
          ))
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <CreateContractModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreate}
          loading={actionLoading}
        />
      )}
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div
      className="rounded-xl p-4 border"
      style={{ background: COLORS.card, borderColor: COLORS.border }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span style={{ color }}>{icon}</span>
        <span className="text-xs font-medium" style={{ color: COLORS.muted }}>
          {label}
        </span>
      </div>
      <p className="text-2xl font-bold" style={{ color: COLORS.text }}>
        {value}
      </p>
    </div>
  );
}

function ContractCard({
  contract,
  isSelected,
  onSelect,
  summary,
  workLogs,
  onWorkLogsChange,
}: {
  contract: Contract;
  isSelected: boolean;
  onSelect: () => void;
  summary?: HourBankSummary;
  workLogs: WorkLog[];
  onWorkLogsChange: () => void;
}) {
  const usedHours = Number(contract.used_hours_current_month ?? 0);
  const remainingHours = Math.max(contract.contracted_hours - usedHours, 0);
  const overtimeHours = Math.max(usedHours - contract.contracted_hours, 0);
  const usagePercent =
    contract.contracted_hours > 0
      ? Math.min((usedHours / contract.contracted_hours) * 100, 100)
      : 0;

  return (
    <div
      className="rounded-xl border transition-all"
      style={{
        background: COLORS.card,
        borderColor: isSelected ? COLORS.teal : COLORS.border,
        borderWidth: isSelected ? 2 : 1,
      }}
    >
      {/* Header — clicavel para expandir */}
      <button
        type="button"
        onClick={onSelect}
        className="w-full text-left p-4 flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          {isSelected ? (
            <ChevronDown size={20} style={{ color: COLORS.muted }} />
          ) : (
            <ChevronRight size={20} style={{ color: COLORS.muted }} />
          )}
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ background: `${COLORS.teal}20` }}
          >
            <FileClock size={20} style={{ color: COLORS.teal }} />
          </div>
          <div>
            <h3 className="font-semibold" style={{ color: COLORS.text }}>
              {contract.name}
            </h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span
                className="text-xs px-2 py-0.5 rounded-full"
                style={{ background: `${COLORS.blue}20`, color: COLORS.blue }}
              >
                {CONTRACT_TYPE_LABELS[contract.contract_type] ??
                  contract.contract_type}
              </span>
              <span className="text-xs" style={{ color: COLORS.muted }}>
                {CARRY_OVER_LABELS[contract.carry_over_rule] ??
                  contract.carry_over_rule}
              </span>
              {contract.contract_number && (
                <span className="text-xs" style={{ color: COLORS.muted }}>
                  · #{contract.contract_number}
                </span>
              )}
              {!contract.is_active && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: `${COLORS.red}20`, color: COLORS.red }}
                >
                  Inativo
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs" style={{ color: COLORS.muted }}>
            Fechamento dia {contract.billing_day}
          </p>
          <p className="text-xs" style={{ color: COLORS.muted }}>
            {contract.contracted_hours}h/
            {PERIOD_LABELS[contract.period_type] ?? contract.period_type}
          </p>
        </div>
      </button>

      {/* Usage Bar — sempre visivel */}
      <div className="px-4 pb-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs" style={{ color: COLORS.muted }}>
            Uso do mês: {usedHours.toFixed(1)}h / {contract.contracted_hours}h
          </span>
          <span
            className="text-xs font-medium"
            style={{
              color:
                overtimeHours > 0
                  ? COLORS.red
                  : remainingHours < contract.contracted_hours * 0.2
                    ? COLORS.amber
                    : COLORS.green,
            }}
          >
            {overtimeHours > 0
              ? `+${overtimeHours.toFixed(1)}h excedente`
              : `${remainingHours.toFixed(1)}h restantes`}
          </span>
        </div>
        <div
          className="h-2 rounded-full overflow-hidden"
          style={{ background: `${COLORS.border}40` }}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${usagePercent}%`,
              background: overtimeHours > 0 ? COLORS.red : COLORS.teal,
            }}
          />
        </div>
      </div>

      {/* Detalhes completos — quando expandido */}
      {isSelected && (
        <div
          className="border-t p-4 space-y-4"
          style={{ borderColor: COLORS.border }}
        >
          {/* Dados completos do contrato */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <DetailItem
              label="Tipo"
              value={
                CONTRACT_TYPE_LABELS[contract.contract_type] ??
                contract.contract_type
              }
            />
            <DetailItem
              label="Período"
              value={
                PERIOD_LABELS[contract.period_type] ?? contract.period_type
              }
            />
            <DetailItem
              label="Horas Contratadas"
              value={`${contract.contracted_hours}h`}
            />
            <DetailItem
              label="Dia de Fechamento"
              value={`Dia ${contract.billing_day}`}
            />
            <DetailItem
              label="Início"
              value={new Date(contract.start_date).toLocaleDateString("pt-BR")}
            />
            <DetailItem
              label="Fim"
              value={
                contract.end_date
                  ? new Date(contract.end_date).toLocaleDateString("pt-BR")
                  : "Indeterminado"
              }
            />
            <DetailItem
              label="Carry Over"
              value={
                CARRY_OVER_LABELS[contract.carry_over_rule] ??
                contract.carry_over_rule
              }
            />
            {contract.carry_over_limit_hours !== null && (
              <DetailItem
                label="Limite Carry Over"
                value={`${contract.carry_over_limit_hours}h`}
              />
            )}
            {contract.carry_over_expire_days !== null && (
              <DetailItem
                label="Expira em"
                value={`${contract.carry_over_expire_days} dias`}
              />
            )}
            <DetailItem
              label="Overtime"
              value={contract.overtime_enabled ? "Habilitado" : "Desabilitado"}
            />
            {contract.overtime_rate && (
              <DetailItem
                label="Taxa Overtime"
                value={`R$ ${contract.overtime_rate.toFixed(2)}/h`}
              />
            )}
            <DetailItem
              label="Auto-fechar tickets"
              value={contract.auto_close_tickets_on_expire ? "Sim" : "Não"}
            />
          </div>

          {/* Rates */}
          {(contract.rate_default ||
            contract.rate_diagnosis ||
            contract.rate_fix) && (
            <div>
              <p
                className="text-xs font-medium mb-2"
                style={{ color: COLORS.muted }}
              >
                Taxas por tipo de trabalho:
              </p>
              <div className="flex flex-wrap gap-2">
                {contract.rate_default && (
                  <RateBadge label="Padrão" value={contract.rate_default} />
                )}
                {contract.rate_diagnosis && (
                  <RateBadge
                    label="Diagnóstico"
                    value={contract.rate_diagnosis}
                  />
                )}
                {contract.rate_fix && (
                  <RateBadge label="Correção" value={contract.rate_fix} />
                )}
                {contract.rate_monitoring && (
                  <RateBadge
                    label="Monitoramento"
                    value={contract.rate_monitoring}
                  />
                )}
                {contract.rate_meeting && (
                  <RateBadge label="Reunião" value={contract.rate_meeting} />
                )}
                {contract.rate_research && (
                  <RateBadge label="Pesquisa" value={contract.rate_research} />
                )}
              </div>
            </div>
          )}

          {/* Notes */}
          {contract.notes && (
            <div>
              <p
                className="text-xs font-medium mb-1"
                style={{ color: COLORS.muted }}
              >
                Observações:
              </p>
              <p
                className="text-sm p-3 rounded-lg"
                style={{
                  background: COLORS.bg,
                  border: `1px solid ${COLORS.border}`,
                  color: COLORS.text,
                }}
              >
                {contract.notes}
              </p>
            </div>
          )}

          {/* Hour Bank Summary */}
          {summary && (
            <div
              className="grid grid-cols-2 md:grid-cols-4 gap-4 p-3 rounded-lg"
              style={{ background: COLORS.bg }}
            >
              <SummaryItem
                label="Horas Contratadas"
                value={`${summary.contracted_hours}h`}
                icon={<Calendar size={16} />}
                color={COLORS.blue}
              />
              <SummaryItem
                label="Horas Usadas"
                value={`${Number(summary.used_hours).toFixed(1)}h`}
                icon={<Clock size={16} />}
                color={COLORS.amber}
              />
              <SummaryItem
                label="Saldo Atual"
                value={`${Number(summary.remaining_hours).toFixed(1)}h`}
                icon={<TrendingUp size={16} />}
                color={
                  Number(summary.remaining_hours) > 0
                    ? COLORS.green
                    : COLORS.red
                }
              />
              <SummaryItem
                label="Excedente"
                value={`${Number(summary.overtime_hours).toFixed(1)}h`}
                icon={<TrendingDown size={16} />}
                color={
                  Number(summary.overtime_hours) > 0 ? COLORS.red : COLORS.muted
                }
              />
              {Number(summary.carried_over_hours) > 0 && (
                <SummaryItem
                  label="Carry Over"
                  value={`${Number(summary.carried_over_hours).toFixed(1)}h`}
                  icon={<TrendingUp size={16} />}
                  color={COLORS.blue}
                />
              )}
              <SummaryItem
                label="Próximo Fechamento"
                value={new Date(summary.next_billing_date).toLocaleDateString(
                  "pt-BR",
                )}
                icon={<Calendar size={16} />}
                color={COLORS.teal}
              />
              {Object.keys(summary.used_by_type).length > 0 && (
                <div className="col-span-2 md:col-span-4">
                  <p
                    className="text-xs font-medium mb-2"
                    style={{ color: COLORS.muted }}
                  >
                    Uso por tipo:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(summary.used_by_type).map(
                      ([type, minutes]) => (
                        <span
                          key={type}
                          className="text-xs px-2 py-1 rounded-md"
                          style={{
                            background: `${COLORS.border}30`,
                            color: COLORS.text,
                          }}
                        >
                          {WORK_TYPE_LABELS[type] ?? type}:{" "}
                          {(Number(minutes) / 60).toFixed(1)}h
                        </span>
                      ),
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Work Logs Section */}
          <WorkLogsSection
            contractId={contract.id}
            workLogs={workLogs}
            onRefresh={onWorkLogsChange}
          />
        </div>
      )}
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs" style={{ color: COLORS.muted }}>
        {label}
      </p>
      <p className="text-sm font-medium" style={{ color: COLORS.text }}>
        {value}
      </p>
    </div>
  );
}

function RateBadge({ label, value }: { label: string; value: number }) {
  return (
    <span
      className="text-xs px-2 py-1 rounded-md"
      style={{ background: `${COLORS.green}20`, color: COLORS.green }}
    >
      {label}: R$ {value.toFixed(2)}/h
    </span>
  );
}

function SummaryItem({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1 mb-1">
        <span style={{ color }}>{icon}</span>
        <span className="text-xs" style={{ color: COLORS.muted }}>
          {label}
        </span>
      </div>
      <p className="font-semibold" style={{ color: COLORS.text }}>
        {value}
      </p>
    </div>
  );
}

// ===================================================================
// WORK LOGS SECTION — lista + timer com iniciar/pausar/finalizar
// ===================================================================

function WorkLogsSection({
  contractId,
  workLogs,
  onRefresh,
}: {
  contractId: string;
  workLogs: WorkLog[];
  onRefresh: () => void;
}) {
  const [showStartForm, setShowStartForm] = useState(false);
  const [reviewModal, setReviewModal] = useState<{
    logId: string;
    action: "pause" | "finish";
    elapsedSeconds: number;
    totalSeconds: number;
    totalMinutes: number;
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const handleStart = useCallback(
    async (data: {
      ticket_id: string;
      description: string;
      work_type: string;
      billable: boolean;
    }) => {
      setActionLoading(true);
      try {
        await apiFetchWithProgress(
          "/api/v1/contracts/work-logs/start",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ticket_id: data.ticket_id,
              contract_id: contractId,
              description: data.description,
              work_type: data.work_type,
              billable: data.billable,
            }),
          },
          () => {},
        );
        await onRefresh();
        setShowStartForm(false);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Erro ao iniciar timer");
      } finally {
        setActionLoading(false);
      }
    },
    [contractId, onRefresh],
  );

  const handlePause = useCallback(async (logId: string) => {
    setActionLoading(true);
    try {
      const res = await apiFetchWithProgress<{
        id: string;
        elapsed_seconds: number;
        total_seconds: number;
        total_minutes: number;
      }>(
        `/api/v1/contracts/work-logs/${logId}/pause`,
        { method: "POST" },
        () => {},
      );
      setReviewModal({
        logId: res.id,
        action: "pause",
        elapsedSeconds: res.elapsed_seconds,
        totalSeconds: res.total_seconds,
        totalMinutes: res.total_minutes,
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao pausar");
    } finally {
      setActionLoading(false);
    }
  }, []);

  const handleResume = useCallback(
    async (logId: string) => {
      setActionLoading(true);
      try {
        await apiFetchWithProgress(
          `/api/v1/contracts/work-logs/${logId}/resume`,
          { method: "POST" },
          () => {},
        );
        await onRefresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Erro ao retomar");
      } finally {
        setActionLoading(false);
      }
    },
    [onRefresh],
  );

  const handleFinish = useCallback(async (logId: string) => {
    setActionLoading(true);
    try {
      const res = await apiFetchWithProgress<{
        id: string;
        elapsed_seconds: number;
        total_seconds: number;
        total_minutes: number;
      }>(
        `/api/v1/contracts/work-logs/${logId}/finish`,
        { method: "POST", body: JSON.stringify({}) },
        () => {},
      );
      setReviewModal({
        logId: res.id,
        action: "finish",
        elapsedSeconds: res.elapsed_seconds,
        totalSeconds: res.total_seconds,
        totalMinutes: res.total_minutes,
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao finalizar");
    } finally {
      setActionLoading(false);
    }
  }, []);

  const handleConfirmReview = useCallback(
    async (
      adjustedMinutes: number | null,
      description?: string,
      billable?: boolean,
    ) => {
      if (!reviewModal) return;
      setActionLoading(true);
      try {
        if (reviewModal.action === "finish") {
          await apiFetchWithProgress(
            `/api/v1/contracts/work-logs/${reviewModal.logId}/finish`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                adjusted_minutes: adjustedMinutes,
                description: description ?? undefined,
                billable: billable ?? undefined,
              }),
            },
            () => {},
          );
        }
        // Para pause: se ajustou minutos, atualiza via PUT
        if (reviewModal.action === "pause" && adjustedMinutes !== null) {
          await apiFetchWithProgress(
            `/api/v1/contracts/work-logs/${reviewModal.logId}`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                minutes_worked: adjustedMinutes,
                ...(description ? { description } : {}),
                ...(billable !== undefined ? { billable } : {}),
              }),
            },
            () => {},
          );
        }
        await onRefresh();
        setReviewModal(null);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Erro ao confirmar");
      } finally {
        setActionLoading(false);
      }
    },
    [reviewModal, onRefresh],
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4
          className="text-sm font-bold flex items-center gap-2"
          style={{ color: COLORS.text }}
        >
          <Timer size={16} style={{ color: COLORS.teal }} />
          Work Logs ({workLogs.length})
        </h4>
        <button
          type="button"
          onClick={() => setShowStartForm(true)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
          style={{ background: COLORS.teal }}
        >
          <Play size={14} />
          Iniciar Trabalho
        </button>
      </div>

      {workLogs.length === 0 ? (
        <p className="text-xs py-4 text-center" style={{ color: COLORS.muted }}>
          Nenhum work log registrado para este contrato.
        </p>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {workLogs.map((log) => (
            <WorkLogRow
              key={log.id}
              log={log}
              onPause={() => handlePause(log.id)}
              onResume={() => handleResume(log.id)}
              onFinish={() => handleFinish(log.id)}
              disabled={actionLoading}
            />
          ))}
        </div>
      )}

      {/* Start Form Modal */}
      {showStartForm && (
        <StartWorkLogModal
          onClose={() => setShowStartForm(false)}
          onStart={handleStart}
          loading={actionLoading}
        />
      )}

      {/* Review Modal — pausa ou finaliza */}
      {reviewModal && (
        <ReviewTimeModal
          action={reviewModal.action}
          elapsedSeconds={reviewModal.elapsedSeconds}
          totalSeconds={reviewModal.totalSeconds}
          totalMinutes={reviewModal.totalMinutes}
          loading={actionLoading}
          onConfirm={handleConfirmReview}
          onCancel={() => {
            setReviewModal(null);
            onRefresh();
          }}
        />
      )}
    </div>
  );
}

function WorkLogRow({
  log,
  onPause,
  onResume,
  onFinish,
  disabled,
}: {
  log: WorkLog;
  onPause: () => void;
  onResume: () => void;
  onFinish: () => void;
  disabled: boolean;
}) {
  const [liveSeconds, setLiveSeconds] = useState(log.total_seconds ?? 0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (log.status === "running") {
      const baseSeconds = log.total_seconds ?? 0;
      const startTime = Date.now();
      intervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        setLiveSeconds(baseSeconds + elapsed);
      }, 1000);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    } else {
      setLiveSeconds(log.total_seconds ?? 0);
    }
  }, [log.status, log.total_seconds]);

  const statusConfig: Record<
    string,
    { color: string; label: string; icon: React.ReactNode }
  > = {
    running: {
      color: COLORS.green,
      label: "Em execução",
      icon: <Play size={12} />,
    },
    paused: {
      color: COLORS.amber,
      label: "Pausado",
      icon: <Pause size={12} />,
    },
    finished: {
      color: COLORS.muted,
      label: "Finalizado",
      icon: <CheckCircle2 size={12} />,
    },
  };
  const st = statusConfig[log.status] ?? statusConfig.finished;

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-lg border"
      style={{ background: COLORS.bg, borderColor: COLORS.border }}
    >
      {/* Status indicator */}
      <div className="flex items-center gap-1.5" style={{ color: st.color }}>
        {st.icon}
        <span className="text-xs font-medium">{st.label}</span>
      </div>

      {/* Timer display */}
      {log.status !== "finished" ? (
        <span
          className="text-sm font-mono font-bold tabular-nums"
          style={{ color: st.color, minWidth: "80px" }}
        >
          {formatSeconds(liveSeconds)}
        </span>
      ) : (
        <span
          className="text-sm font-mono"
          style={{ color: COLORS.muted, minWidth: "80px" }}
        >
          {log.minutes_worked}min
        </span>
      )}

      {/* Description */}
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate" style={{ color: COLORS.text }}>
          {log.description}
        </p>
        <div
          className="flex items-center gap-2 text-xs"
          style={{ color: COLORS.muted }}
        >
          <span>{WORK_TYPE_LABELS[log.work_type] ?? log.work_type}</span>
          {log.ticket_number && <span>· {log.ticket_number}</span>}
          <span>· {new Date(log.started_at).toLocaleDateString("pt-BR")}</span>
          {log.billable && (
            <span style={{ color: COLORS.green }}>· Faturável</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-1">
        {log.status === "running" && (
          <button
            type="button"
            onClick={onPause}
            disabled={disabled}
            className="p-2 rounded-lg border transition-colors disabled:opacity-50"
            style={{ borderColor: COLORS.amber, color: COLORS.amber }}
            title="Pausar"
          >
            <Pause size={16} />
          </button>
        )}
        {log.status === "paused" && (
          <button
            type="button"
            onClick={onResume}
            disabled={disabled}
            className="p-2 rounded-lg border transition-colors disabled:opacity-50"
            style={{ borderColor: COLORS.green, color: COLORS.green }}
            title="Retomar"
          >
            <Play size={16} />
          </button>
        )}
        {(log.status === "running" || log.status === "paused") && (
          <button
            type="button"
            onClick={onFinish}
            disabled={disabled}
            className="p-2 rounded-lg border transition-colors disabled:opacity-50"
            style={{ borderColor: COLORS.red, color: COLORS.red }}
            title="Finalizar"
          >
            <Square size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

// ===================================================================
// START WORK LOG MODAL — form para iniciar timer
// ===================================================================

function StartWorkLogModal({
  onClose,
  onStart,
  loading,
}: {
  onClose: () => void;
  onStart: (data: {
    ticket_id: string;
    description: string;
    work_type: string;
    billable: boolean;
  }) => void;
  loading: boolean;
}) {
  const [formData, setFormData] = useState({
    ticket_id: "",
    description: "",
    work_type: "diagnosis",
    billable: "true",
  });

  const update = (key: string, value: string) =>
    setFormData((prev) => ({ ...prev, [key]: value }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)" }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6"
        style={{
          background: COLORS.card,
          border: `1px solid ${COLORS.border}`,
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2
            className="text-lg font-bold flex items-center gap-2"
            style={{ color: COLORS.text }}
          >
            <Play size={20} style={{ color: COLORS.green }} />
            Iniciar Trabalho
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{ color: COLORS.muted }}
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <Field label="Ticket ID" required>
            <input
              type="text"
              value={formData.ticket_id}
              onChange={(e) => update("ticket_id", e.target.value)}
              className="w-full px-3 py-2 rounded-lg border"
              style={{
                background: COLORS.bg,
                borderColor: COLORS.border,
                color: COLORS.text,
              }}
              placeholder="UUID do ticket"
            />
          </Field>

          <Field label="Descrição do trabalho" required>
            <textarea
              value={formData.description}
              onChange={(e) => update("description", e.target.value)}
              className="w-full px-3 py-2 rounded-lg border resize-none"
              style={{
                background: COLORS.bg,
                borderColor: COLORS.border,
                color: COLORS.text,
              }}
              rows={3}
              placeholder="Ex: Análise de logs do servidor..."
            />
          </Field>

          <Field label="Tipo de trabalho">
            <select
              value={formData.work_type}
              onChange={(e) => update("work_type", e.target.value)}
              className="w-full px-3 py-2 rounded-lg border"
              style={{
                background: COLORS.bg,
                borderColor: COLORS.border,
                color: COLORS.text,
              }}
            >
              {Object.entries(WORK_TYPE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Faturável">
            <select
              value={formData.billable}
              onChange={(e) => update("billable", e.target.value)}
              className="w-full px-3 py-2 rounded-lg border"
              style={{
                background: COLORS.bg,
                borderColor: COLORS.border,
                color: COLORS.text,
              }}
            >
              <option value="true">Sim — conta no contrato</option>
              <option value="false">Não — cortesia</option>
            </select>
          </Field>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border font-medium"
              style={{ borderColor: COLORS.border, color: COLORS.muted }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() =>
                onStart({
                  ticket_id: formData.ticket_id,
                  description: formData.description,
                  work_type: formData.work_type,
                  billable: formData.billable === "true",
                })
              }
              disabled={loading || !formData.ticket_id || !formData.description}
              className="flex-1 px-4 py-2 rounded-lg text-white font-medium disabled:opacity-50"
              style={{ background: COLORS.green }}
            >
              {loading ? "Iniciando..." : "Iniciar Timer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===================================================================
// REVIEW TIME MODAL — revisar e ajustar tempo antes de confirmar
// ===================================================================

function ReviewTimeModal({
  action,
  elapsedSeconds,
  totalSeconds,
  totalMinutes,
  loading,
  onConfirm,
  onCancel,
}: {
  action: "pause" | "finish";
  elapsedSeconds: number;
  totalSeconds: number;
  totalMinutes: number;
  loading: boolean;
  onConfirm: (
    adjustedMinutes: number | null,
    description?: string,
    billable?: boolean,
  ) => void;
  onCancel: () => void;
}) {
  const [adjustMode, setAdjustMode] = useState(false);
  const [adjustedMinutes, setAdjustedMinutes] = useState(totalMinutes);
  const [adjustedSeconds, setAdjustedSeconds] = useState(0);
  const [description, setDescription] = useState("");
  const [billable, setBillable] = useState(true);

  const isFinish = action === "finish";
  const title = isFinish ? "Finalizar Trabalho" : "Pausar Trabalho";
  const confirmLabel = isFinish ? "Confirmar e Finalizar" : "Confirmar Pausa";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)" }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6"
        style={{
          background: COLORS.card,
          border: `1px solid ${COLORS.border}`,
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2
            className="text-lg font-bold flex items-center gap-2"
            style={{ color: COLORS.text }}
          >
            {isFinish ? (
              <Square size={20} style={{ color: COLORS.red }} />
            ) : (
              <Pause size={20} style={{ color: COLORS.amber }} />
            )}
            {title}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            style={{ color: COLORS.muted }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Tempo calculado */}
        <div className="space-y-3 mb-4">
          <div
            className="p-4 rounded-lg text-center"
            style={{
              background: COLORS.bg,
              border: `1px solid ${COLORS.border}`,
            }}
          >
            <p className="text-xs mb-1" style={{ color: COLORS.muted }}>
              Tempo decorrido nesta sessão:
            </p>
            <p
              className="text-2xl font-mono font-bold"
              style={{ color: COLORS.teal }}
            >
              {formatSeconds(elapsedSeconds)}
            </p>
          </div>

          <div
            className="p-4 rounded-lg text-center"
            style={{
              background: COLORS.bg,
              border: `1px solid ${COLORS.border}`,
            }}
          >
            <p className="text-xs mb-1" style={{ color: COLORS.muted }}>
              Tempo total acumulado:
            </p>
            <p
              className="text-3xl font-mono font-bold"
              style={{ color: COLORS.text }}
            >
              {formatSeconds(totalSeconds)}
            </p>
            <p className="text-sm mt-1" style={{ color: COLORS.muted }}>
              ({totalMinutes} minutos)
            </p>
          </div>
        </div>

        {/* Toggle adjust mode */}
        <div className="mb-4">
          <button
            type="button"
            onClick={() => setAdjustMode(!adjustMode)}
            className="w-full text-left text-xs font-medium flex items-center gap-1"
            style={{ color: COLORS.blue }}
          >
            <ChevronRight
              size={14}
              style={{
                transform: adjustMode ? "rotate(90deg)" : "none",
                transition: "transform 0.2s",
              }}
            />
            Ajustar tempo manualmente
          </button>

          {adjustMode && (
            <div
              className="mt-3 p-3 rounded-lg space-y-3"
              style={{
                background: COLORS.bg,
                border: `1px solid ${COLORS.border}`,
              }}
            >
              <p className="text-xs" style={{ color: COLORS.muted }}>
                Confira o tempo. Se necessário, ajuste os minutos antes de
                confirmar.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Minutos">
                  <input
                    type="number"
                    min="0"
                    value={adjustedMinutes}
                    onChange={(e) =>
                      setAdjustedMinutes(Number(e.target.value) || 0)
                    }
                    className="w-full px-3 py-2 rounded-lg border"
                    style={{
                      background: COLORS.card,
                      borderColor: COLORS.border,
                      color: COLORS.text,
                    }}
                  />
                </Field>
                <Field label="Segundos (opcional)">
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={adjustedSeconds}
                    onChange={(e) =>
                      setAdjustedSeconds(Number(e.target.value) || 0)
                    }
                    className="w-full px-3 py-2 rounded-lg border"
                    style={{
                      background: COLORS.card,
                      borderColor: COLORS.border,
                      color: COLORS.text,
                    }}
                  />
                </Field>
              </div>
              {isFinish && (
                <>
                  <Field label="Descrição (opcional)">
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border resize-none"
                      style={{
                        background: COLORS.card,
                        borderColor: COLORS.border,
                        color: COLORS.text,
                      }}
                      rows={2}
                      placeholder="Atualizar descrição..."
                    />
                  </Field>
                  <Field label="Faturável">
                    <select
                      value={billable ? "true" : "false"}
                      onChange={(e) => setBillable(e.target.value === "true")}
                      className="w-full px-3 py-2 rounded-lg border"
                      style={{
                        background: COLORS.card,
                        borderColor: COLORS.border,
                        color: COLORS.text,
                      }}
                    >
                      <option value="true">Sim</option>
                      <option value="false">Não</option>
                    </select>
                  </Field>
                </>
              )}
            </div>
          )}
        </div>

        {/* Confirm buttons */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 px-4 py-2 rounded-lg border font-medium disabled:opacity-50"
            style={{ borderColor: COLORS.border, color: COLORS.muted }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              if (adjustMode) {
                const totalMin =
                  adjustedMinutes + (adjustedSeconds > 30 ? 1 : 0);
                onConfirm(totalMin, description || undefined, billable);
              } else {
                onConfirm(null);
              }
            }}
            disabled={loading}
            className="flex-1 px-4 py-2 rounded-lg text-white font-medium disabled:opacity-50"
            style={{ background: isFinish ? COLORS.red : COLORS.amber }}
          >
            {loading ? "Confirmando..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ===================================================================
// CREATE CONTRACT MODAL — form para criar contrato
// ===================================================================

function CreateContractModal({
  onClose,
  onCreate,
  loading,
}: {
  onClose: () => void;
  onCreate: (formData: Record<string, string>) => void;
  loading: boolean;
}) {
  const [formData, setFormData] = useState<Record<string, string>>({
    name: "",
    contract_number: "",
    contract_type: "monthly_support",
    contracted_hours: "0",
    period_type: "monthly",
    billing_day: "1",
    carry_over_rule: "none",
    carry_over_limit_hours: "",
    carry_over_expire_days: "",
    overtime_enabled: "false",
    overtime_rate: "",
    rate_diagnosis: "",
    rate_fix: "",
    rate_monitoring: "",
    rate_meeting: "",
    rate_research: "",
    rate_default: "",
    start_date: new Date().toISOString().split("T")[0],
    end_date: "",
    auto_close_tickets_on_expire: "false",
    notes: "",
  });

  const update = (key: string, value: string) =>
    setFormData((prev) => ({ ...prev, [key]: value }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)" }}
    >
      <div
        className="w-full max-w-lg rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
        style={{
          background: COLORS.card,
          border: `1px solid ${COLORS.border}`,
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold" style={{ color: COLORS.text }}>
            Novo Contrato
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{ color: COLORS.muted }}
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-5">
          {/* --- Dados Gerais --- */}
          <div className="space-y-3">
            <h3
              className="text-xs font-bold uppercase tracking-wide"
              style={{ color: COLORS.muted }}
            >
              Dados Gerais
            </h3>
            <Field label="Nome do contrato" required>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => update("name", e.target.value)}
                className="w-full px-3 py-2 rounded-lg border"
                style={{
                  background: COLORS.bg,
                  borderColor: COLORS.border,
                  color: COLORS.text,
                }}
                placeholder="Ex: Suporte Mensal Infra"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Número do contrato">
                <input
                  type="text"
                  value={formData.contract_number}
                  onChange={(e) => update("contract_number", e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border"
                  style={{
                    background: COLORS.bg,
                    borderColor: COLORS.border,
                    color: COLORS.text,
                  }}
                  placeholder="Ex: 2026-001"
                />
              </Field>
              <Field label="Tipo de contrato">
                <select
                  value={formData.contract_type}
                  onChange={(e) => update("contract_type", e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border"
                  style={{
                    background: COLORS.bg,
                    borderColor: COLORS.border,
                    color: COLORS.text,
                  }}
                >
                  {Object.entries(CONTRACT_TYPE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>

          {/* --- Período e Horas --- */}
          <div className="space-y-3">
            <h3
              className="text-xs font-bold uppercase tracking-wide"
              style={{ color: COLORS.muted }}
            >
              Período e Horas
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Horas contratadas">
                <input
                  type="number"
                  min="0"
                  value={formData.contracted_hours}
                  onChange={(e) => update("contracted_hours", e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border"
                  style={{
                    background: COLORS.bg,
                    borderColor: COLORS.border,
                    color: COLORS.text,
                  }}
                />
              </Field>
              <Field label="Tipo de período">
                <select
                  value={formData.period_type}
                  onChange={(e) => update("period_type", e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border"
                  style={{
                    background: COLORS.bg,
                    borderColor: COLORS.border,
                    color: COLORS.text,
                  }}
                >
                  {Object.entries(PERIOD_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Dia de fechamento">
                <input
                  type="number"
                  min="1"
                  max="28"
                  value={formData.billing_day}
                  onChange={(e) => update("billing_day", e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border"
                  style={{
                    background: COLORS.bg,
                    borderColor: COLORS.border,
                    color: COLORS.text,
                  }}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Data de início" required>
                <input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => update("start_date", e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border"
                  style={{
                    background: COLORS.bg,
                    borderColor: COLORS.border,
                    color: COLORS.text,
                  }}
                />
              </Field>
              <Field label="Data de término">
                <input
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => update("end_date", e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border"
                  style={{
                    background: COLORS.bg,
                    borderColor: COLORS.border,
                    color: COLORS.text,
                  }}
                />
              </Field>
            </div>
          </div>

          {/* --- Carry Over --- */}
          <div className="space-y-3">
            <h3
              className="text-xs font-bold uppercase tracking-wide"
              style={{ color: COLORS.muted }}
            >
              Acúmulo de Horas (Carry Over)
            </h3>
            <Field label="Regra de acúmulo">
              <select
                value={formData.carry_over_rule}
                onChange={(e) => update("carry_over_rule", e.target.value)}
                className="w-full px-3 py-2 rounded-lg border"
                style={{
                  background: COLORS.bg,
                  borderColor: COLORS.border,
                  color: COLORS.text,
                }}
              >
                {Object.entries(CARRY_OVER_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            {formData.carry_over_rule === "limited" && (
              <Field label="Limite de acúmulo (horas)">
                <input
                  type="number"
                  min="0"
                  value={formData.carry_over_limit_hours}
                  onChange={(e) =>
                    update("carry_over_limit_hours", e.target.value)
                  }
                  className="w-full px-3 py-2 rounded-lg border"
                  style={{
                    background: COLORS.bg,
                    borderColor: COLORS.border,
                    color: COLORS.text,
                  }}
                  placeholder="Ex: 10"
                />
              </Field>
            )}
            {formData.carry_over_rule === "expire" && (
              <Field label="Expira em (dias)">
                <input
                  type="number"
                  min="1"
                  value={formData.carry_over_expire_days}
                  onChange={(e) =>
                    update("carry_over_expire_days", e.target.value)
                  }
                  className="w-full px-3 py-2 rounded-lg border"
                  style={{
                    background: COLORS.bg,
                    borderColor: COLORS.border,
                    color: COLORS.text,
                  }}
                  placeholder="Ex: 90"
                />
              </Field>
            )}
          </div>

          {/* --- Overtime --- */}
          <div className="space-y-3">
            <h3
              className="text-xs font-bold uppercase tracking-wide"
              style={{ color: COLORS.muted }}
            >
              Horas Excedentes (Overtime)
            </h3>
            <Field label="Permitir horas excedentes">
              <select
                value={formData.overtime_enabled}
                onChange={(e) => update("overtime_enabled", e.target.value)}
                className="w-full px-3 py-2 rounded-lg border"
                style={{
                  background: COLORS.bg,
                  borderColor: COLORS.border,
                  color: COLORS.text,
                }}
              >
                <option value="false">Não</option>
                <option value="true">Sim</option>
              </select>
            </Field>
            {formData.overtime_enabled === "true" && (
              <Field label="Taxa de overtime (R$/h)">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.overtime_rate}
                  onChange={(e) => update("overtime_rate", e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border"
                  style={{
                    background: COLORS.bg,
                    borderColor: COLORS.border,
                    color: COLORS.text,
                  }}
                  placeholder="Ex: 150.00"
                />
              </Field>
            )}
          </div>

          {/* --- Taxas por Tipo --- */}
          <div className="space-y-3">
            <h3
              className="text-xs font-bold uppercase tracking-wide"
              style={{ color: COLORS.muted }}
            >
              Taxas por Tipo de Trabalho (R$/h)
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Taxa padrão">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.rate_default}
                  onChange={(e) => update("rate_default", e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border"
                  style={{
                    background: COLORS.bg,
                    borderColor: COLORS.border,
                    color: COLORS.text,
                  }}
                  placeholder="Ex: 120.00"
                />
              </Field>
              <Field label="Diagnóstico">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.rate_diagnosis}
                  onChange={(e) => update("rate_diagnosis", e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border"
                  style={{
                    background: COLORS.bg,
                    borderColor: COLORS.border,
                    color: COLORS.text,
                  }}
                  placeholder="Ex: 100.00"
                />
              </Field>
              <Field label="Correção">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.rate_fix}
                  onChange={(e) => update("rate_fix", e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border"
                  style={{
                    background: COLORS.bg,
                    borderColor: COLORS.border,
                    color: COLORS.text,
                  }}
                  placeholder="Ex: 150.00"
                />
              </Field>
              <Field label="Monitoramento">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.rate_monitoring}
                  onChange={(e) => update("rate_monitoring", e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border"
                  style={{
                    background: COLORS.bg,
                    borderColor: COLORS.border,
                    color: COLORS.text,
                  }}
                  placeholder="Ex: 80.00"
                />
              </Field>
              <Field label="Reunião">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.rate_meeting}
                  onChange={(e) => update("rate_meeting", e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border"
                  style={{
                    background: COLORS.bg,
                    borderColor: COLORS.border,
                    color: COLORS.text,
                  }}
                  placeholder="Ex: 90.00"
                />
              </Field>
              <Field label="Pesquisa">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.rate_research}
                  onChange={(e) => update("rate_research", e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border"
                  style={{
                    background: COLORS.bg,
                    borderColor: COLORS.border,
                    color: COLORS.text,
                  }}
                  placeholder="Ex: 80.00"
                />
              </Field>
            </div>
          </div>

          {/* --- Configurações Adicionais --- */}
          <div className="space-y-3">
            <h3
              className="text-xs font-bold uppercase tracking-wide"
              style={{ color: COLORS.muted }}
            >
              Configurações Adicionais
            </h3>
            <Field label="Auto-fechar tickets ao expirar">
              <select
                value={formData.auto_close_tickets_on_expire}
                onChange={(e) =>
                  update("auto_close_tickets_on_expire", e.target.value)
                }
                className="w-full px-3 py-2 rounded-lg border"
                style={{
                  background: COLORS.bg,
                  borderColor: COLORS.border,
                  color: COLORS.text,
                }}
              >
                <option value="false">Não</option>
                <option value="true">Sim</option>
              </select>
            </Field>
            <Field label="Observações">
              <textarea
                value={formData.notes}
                onChange={(e) => update("notes", e.target.value)}
                className="w-full px-3 py-2 rounded-lg border resize-none"
                style={{
                  background: COLORS.bg,
                  borderColor: COLORS.border,
                  color: COLORS.text,
                }}
                rows={3}
                placeholder="Notas internas sobre o contrato..."
              />
            </Field>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border font-medium"
              style={{ borderColor: COLORS.border, color: COLORS.muted }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => onCreate(formData)}
              disabled={loading || !formData.name}
              className="flex-1 px-4 py-2 rounded-lg text-white font-medium disabled:opacity-50"
              style={{ background: COLORS.teal }}
            >
              {loading ? "Criando..." : "Criar Contrato"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        className="text-xs font-medium mb-1 block"
        style={{ color: COLORS.muted }}
      >
        {label} {required && <span style={{ color: COLORS.red }}>*</span>}
      </label>
      {children}
    </div>
  );
}
