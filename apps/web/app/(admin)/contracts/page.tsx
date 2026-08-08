// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState, useCallback } from "react";
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
  overtime_enabled: boolean;
  is_active: boolean;
  start_date: string;
  end_date: string | null;
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

  const contracts = contractsData?.contracts ?? [];

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
              contract_type: formData.contract_type,
              contracted_hours: Number(formData.contracted_hours) || 0,
              period_type: formData.period_type || "monthly",
              billing_day: Number(formData.billing_day) || 1,
              carry_over_rule: formData.carry_over_rule || "none",
              overtime_enabled: formData.overtime_enabled === "true",
              start_date: formData.start_date,
              end_date: formData.end_date || undefined,
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
            Nenhum contrato cadastrado. Clique em "Novo Contrato" para começar.
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
}: {
  contract: Contract;
  isSelected: boolean;
  onSelect: () => void;
  summary?: HourBankSummary;
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
      className="rounded-xl border transition-all cursor-pointer"
      style={{
        background: COLORS.card,
        borderColor: isSelected ? COLORS.teal : COLORS.border,
        borderWidth: isSelected ? 2 : 1,
      }}
      onClick={onSelect}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
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
            </div>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs" style={{ color: COLORS.muted }}>
            Fechamento dia {contract.billing_day}
          </p>
          <p className="text-xs" style={{ color: COLORS.muted }}>
            {contract.contracted_hours}h/
            {contract.period_type === "monthly" ? "mês" : contract.period_type}
          </p>
        </div>
      </div>

      {/* Usage Bar */}
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

      {/* Summary Details (quando selecionado) */}
      {isSelected && summary && (
        <div
          className="border-t p-4 grid grid-cols-2 md:grid-cols-4 gap-4"
          style={{ borderColor: COLORS.border }}
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
              Number(summary.remaining_hours) > 0 ? COLORS.green : COLORS.red
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
          {Object.keys(summary.used_by_type).length > 0 && (
            <div className="col-span-2 md:col-span-4">
              <p
                className="text-xs font-medium mb-2"
                style={{ color: COLORS.muted }}
              >
                Uso por tipo:
              </p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(summary.used_by_type).map(([type, minutes]) => (
                  <span
                    key={type}
                    className="text-xs px-2 py-1 rounded-md"
                    style={{
                      background: `${COLORS.border}30`,
                      color: COLORS.text,
                    }}
                  >
                    {type}: {(Number(minutes) / 60).toFixed(1)}h
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
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
    contract_type: "monthly_support",
    contracted_hours: "0",
    period_type: "monthly",
    billing_day: "1",
    carry_over_rule: "none",
    overtime_enabled: "false",
    start_date: new Date().toISOString().split("T")[0],
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

        <div className="space-y-4">
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

          <div className="grid grid-cols-2 gap-4">
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

          <Field label="Regra de acúmulo de horas">
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
