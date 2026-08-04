// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState } from "react";
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ScanLine,
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

interface AuditSummary {
  findings: {
    open: string;
    critical_open: string;
    high_open: string;
    medium_open: string;
    low_open: string;
    remediated: string;
    false_positive: string;
    total: string;
  };
  rules: { total: string; active: string };
  last_scan: {
    id: string;
    status: string;
    total_findings: number;
    critical_findings: number;
    duration_ms: number;
    completed_at: string;
  } | null;
}

interface Finding {
  id: string;
  rule_id: string;
  rule_name: string;
  rule_category: string;
  rule_remediation: string | null;
  status: string;
  severity: string;
  finding_data: Record<string, unknown>;
  affected_resource: string | null;
  remediation_notes: string | null;
  detected_at: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: COLORS.red,
  high: COLORS.amber,
  medium: COLORS.blue,
  low: COLORS.muted,
  info: COLORS.muted,
};

const CATEGORY_LABELS: Record<string, string> = {
  access_control: "Controle de Acesso",
  encryption: "Criptografia",
  compliance: "Compliance",
  vulnerability: "Vulnerabilidade",
  configuration: "Configuração",
  network: "Rede",
  data_protection: "Proteção de Dados",
};

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const num = (v: string | undefined): number => parseInt(v ?? "0", 10);

export default function SecurityAuditPage() {
  const { data: summaryData, mutate: mutateSummary } = useApi<AuditSummary>(
    "/api/v1/security-audit/summary",
  );
  const { data: findingsData, mutate: mutateFindings } = useApi<{
    findings: Finding[];
  }>("/api/v1/security-audit/findings?status=open&limit=200");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const summary = summaryData;
  const findings = findingsData?.findings ?? [];

  const handleScan = async () => {
    setScanning(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/v1/security-audit/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(
          `Scan concluído: ${data.total_findings} findings detectados (${data.critical} críticos) em ${data.duration_ms}ms`,
        );
        mutateSummary();
        mutateFindings();
      } else {
        setError(data?.error?.message ?? "Erro ao executar scan");
      }
    } catch {
      setError("Erro de conexão");
    } finally {
      setScanning(false);
    }
  };

  const handleAction = async (
    findingId: string,
    action: "remediate" | "false-positive",
  ) => {
    setActionLoading(`${findingId}-${action}`);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/security-audit/findings/${findingId}/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        },
      );
      if (res.ok) {
        mutateFindings();
        mutateSummary();
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
            <ShieldCheck size={18} className="inline mr-1" /> Security Auditing
          </h1>
          <p className="text-[12px]" style={{ color: COLORS.muted }}>
            Auditoria automatizada de segurança e conformidade
          </p>
        </div>
        <button
          onClick={handleScan}
          disabled={scanning}
          className="text-[12px] px-3 py-1.5 rounded font-bold flex items-center gap-2"
          style={{
            background: `${COLORS.teal}15`,
            border: `1px solid ${COLORS.teal}`,
            color: COLORS.teal,
            cursor: scanning ? "not-allowed" : "pointer",
            opacity: scanning ? 0.5 : 1,
          }}
        >
          {scanning ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <ScanLine size={12} />
          )}{" "}
          Executar Scan
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

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <div
          className="rounded-xl p-4"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
          }}
        >
          <div
            className="text-[10px] font-bold uppercase mb-1"
            style={{ color: COLORS.muted }}
          >
            Findings Abertos
          </div>
          <div className="text-2xl font-bold" style={{ color: COLORS.red }}>
            {num(summary?.findings.open)}
          </div>
        </div>
        <div
          className="rounded-xl p-4"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.red}33`,
          }}
        >
          <div
            className="text-[10px] font-bold uppercase mb-1"
            style={{ color: COLORS.muted }}
          >
            Críticos
          </div>
          <div className="text-2xl font-bold" style={{ color: COLORS.red }}>
            {num(summary?.findings.critical_open)}
          </div>
        </div>
        <div
          className="rounded-xl p-4"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.amber}33`,
          }}
        >
          <div
            className="text-[10px] font-bold uppercase mb-1"
            style={{ color: COLORS.muted }}
          >
            Altos
          </div>
          <div className="text-2xl font-bold" style={{ color: COLORS.amber }}>
            {num(summary?.findings.high_open)}
          </div>
        </div>
        <div
          className="rounded-xl p-4"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.green}33`,
          }}
        >
          <div
            className="text-[10px] font-bold uppercase mb-1"
            style={{ color: COLORS.muted }}
          >
            Remediados
          </div>
          <div className="text-2xl font-bold" style={{ color: COLORS.green }}>
            {num(summary?.findings.remediated)}
          </div>
        </div>
        <div
          className="rounded-xl p-4"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
          }}
        >
          <div
            className="text-[10px] font-bold uppercase mb-1"
            style={{ color: COLORS.muted }}
          >
            Regras Ativas
          </div>
          <div className="text-2xl font-bold" style={{ color: COLORS.teal }}>
            {num(summary?.rules.active)}
          </div>
        </div>
        <div
          className="rounded-xl p-4"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
          }}
        >
          <div
            className="text-[10px] font-bold uppercase mb-1"
            style={{ color: COLORS.muted }}
          >
            Último Scan
          </div>
          <div
            className="text-[12px] font-bold"
            style={{
              color:
                summary?.last_scan?.status === "completed"
                  ? COLORS.green
                  : COLORS.muted,
            }}
          >
            {summary?.last_scan
              ? formatTime(summary.last_scan.completed_at)
              : "—"}
          </div>
        </div>
      </div>

      {/* Findings Table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: COLORS.card,
          border: `1px solid ${COLORS.border}`,
        }}
      >
        <div
          className="p-4 border-b flex items-center justify-between"
          style={{ borderColor: COLORS.border }}
        >
          <h3
            className="text-[10px] font-bold uppercase"
            style={{ color: COLORS.muted }}
          >
            FINDINGS ABERTOS ({findings.length})
          </h3>
          <button
            onClick={() => mutateFindings()}
            className="text-[10px]"
            style={{ color: COLORS.muted, cursor: "pointer" }}
          >
            <RefreshCw size={10} className="inline" /> Atualizar
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr
                style={{
                  background: "var(--surface-1)",
                  borderBottom: `1px solid ${COLORS.border}`,
                }}
              >
                <th
                  className="text-left p-3 font-bold uppercase text-[10px]"
                  style={{ color: COLORS.muted }}
                >
                  Regra
                </th>
                <th
                  className="text-left p-3 font-bold uppercase text-[10px]"
                  style={{ color: COLORS.muted }}
                >
                  Categoria
                </th>
                <th
                  className="text-left p-3 font-bold uppercase text-[10px]"
                  style={{ color: COLORS.muted }}
                >
                  Severidade
                </th>
                <th
                  className="text-left p-3 font-bold uppercase text-[10px]"
                  style={{ color: COLORS.muted }}
                >
                  Recurso
                </th>
                <th
                  className="text-left p-3 font-bold uppercase text-[10px]"
                  style={{ color: COLORS.muted }}
                >
                  Detectado
                </th>
                <th
                  className="text-right p-3 font-bold uppercase text-[10px]"
                  style={{ color: COLORS.muted }}
                >
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {findings.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="p-8 text-center"
                    style={{ color: COLORS.muted }}
                  >
                    <CheckCircle2
                      size={24}
                      className="mx-auto mb-2"
                      style={{ color: COLORS.green }}
                    />
                    Nenhum finding aberto. Sistema seguro!
                  </td>
                </tr>
              )}
              {findings.map((f) => (
                <tr
                  key={f.id}
                  style={{ borderBottom: `1px solid ${COLORS.border}` }}
                >
                  <td className="p-3">
                    <div className="font-bold" style={{ color: COLORS.text }}>
                      {f.rule_name}
                    </div>
                    {f.rule_remediation && (
                      <div
                        className="text-[10px] mt-1 flex items-start gap-1"
                        style={{ color: COLORS.muted }}
                      >
                        <AlertTriangle
                          size={10}
                          className="mt-0.5 flex-shrink-0"
                          style={{ color: COLORS.amber }}
                        />
                        <span>{f.rule_remediation}</span>
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    <span
                      className="text-[10px]"
                      style={{ color: COLORS.muted }}
                    >
                      {CATEGORY_LABELS[f.rule_category] ?? f.rule_category}
                    </span>
                  </td>
                  <td className="p-3">
                    <span
                      className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                      style={{
                        background: `${SEVERITY_COLORS[f.severity] ?? COLORS.muted}15`,
                        color: SEVERITY_COLORS[f.severity] ?? COLORS.muted,
                      }}
                    >
                      {f.severity}
                    </span>
                  </td>
                  <td className="p-3" style={{ color: COLORS.muted }}>
                    {f.affected_resource ?? "—"}
                  </td>
                  <td className="p-3" style={{ color: COLORS.muted }}>
                    {formatTime(f.detected_at)}
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleAction(f.id, "remediate")}
                        disabled={actionLoading === `${f.id}-remediate`}
                        className="px-2 py-1 rounded text-[10px] font-bold"
                        style={{
                          background: `${COLORS.green}15`,
                          border: `1px solid ${COLORS.green}`,
                          color: COLORS.green,
                          cursor: "pointer",
                          opacity:
                            actionLoading === `${f.id}-remediate` ? 0.5 : 1,
                        }}
                      >
                        {actionLoading === `${f.id}-remediate` ? (
                          <Loader2 size={10} className="animate-spin" />
                        ) : (
                          "Remediar"
                        )}
                      </button>
                      <button
                        onClick={() => handleAction(f.id, "false-positive")}
                        disabled={actionLoading === `${f.id}-false-positive`}
                        className="px-2 py-1 rounded text-[10px] font-bold"
                        style={{
                          background: `${COLORS.muted}15`,
                          border: `1px solid ${COLORS.muted}`,
                          color: COLORS.muted,
                          cursor: "pointer",
                          opacity:
                            actionLoading === `${f.id}-false-positive`
                              ? 0.5
                              : 1,
                        }}
                      >
                        Falso positivo
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
