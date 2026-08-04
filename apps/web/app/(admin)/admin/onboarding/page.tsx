// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Server,
  UserPlus,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  Loader2,
  Eye,
  EyeOff,
  Plug,
  Search,
  Monitor,
} from "lucide-react";

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

const STEPS = [
  { id: 1, label: "Cliente", icon: Building2 },
  { id: 2, label: "Infraestrutura", icon: Server },
  { id: 3, label: "Usuário Admin", icon: UserPlus },
  { id: 4, label: "Revisão", icon: CheckCircle2 },
];

interface WizardData {
  // Step 1: Cliente
  name: string;
  cnpj: string;
  contractEndDate: string;
  legalName: string;
  planTier: string;
  billingCycle: string;
  // Step 2: Infra
  clusterId: string;
  clusterHost: string;
  clusterDbName: string;
  clusterPort: string;
  zabbixHostGroupId: string;
  zabbixApiUrl: string;
  zabbixApiToken: string;
  // Step 3: User
  userEmail: string;
  userFullName: string;
  userPhone: string;
  userRole: string;
  userPassword: string;
  userMustChange: boolean;
}

const INITIAL_DATA: WizardData = {
  name: "",
  cnpj: "",
  contractEndDate: "",
  legalName: "",
  planTier: "basic",
  billingCycle: "monthly",
  clusterId: "cluster-0",
  clusterHost: "localhost",
  clusterDbName: "jlmirror",
  clusterPort: "5432",
  zabbixHostGroupId: "",
  zabbixApiUrl: "https://zabbix.jlinformatica.com.br/api_jsonrpc.php",
  zabbixApiToken: "",
  userEmail: "",
  userFullName: "",
  userPhone: "",
  userRole: "tenant:admin",
  userPassword: "",
  userMustChange: true,
};

function formatCnpj(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8)
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12)
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

export default function OnboardingWizardPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [data, setData] = useState<WizardData>(INITIAL_DATA);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [createdTenantId, setCreatedTenantId] = useState<string | null>(null);

  // Onboarding v2 — teste de conexao, host groups e preview
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState<{
    success: boolean;
    message: string;
    version?: string;
  } | null>(null);
  const [hostGroups, setHostGroups] = useState<
    Array<{ groupid: string; name: string }>
  >([]);
  const [loadingHostGroups, setLoadingHostGroups] = useState(false);
  const [hostGroupSearch, setHostGroupSearch] = useState("");
  const [previewHosts, setPreviewHosts] = useState<
    Array<{ hostid: string; host: string; name: string; status: string }>
  >([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  function update<K extends keyof WizardData>(key: K, value: WizardData[K]) {
    setData((prev) => ({ ...prev, [key]: value }));
    // Reset connection result e preview quando dados do Zabbix mudam
    if (key === "zabbixApiUrl" || key === "zabbixApiToken") {
      setConnectionResult(null);
      setHostGroups([]);
      setPreviewHosts([]);
      setShowPreview(false);
    }
    if (key === "zabbixHostGroupId") {
      setPreviewHosts([]);
      setShowPreview(false);
    }
  }

  async function testConnection() {
    if (!data.zabbixApiUrl.trim() || !data.zabbixApiToken.trim()) {
      setConnectionResult({
        success: false,
        message: "URL e Token são obrigatórios",
      });
      return;
    }
    setTestingConnection(true);
    setConnectionResult(null);
    try {
      const res = await fetch("/api/admin/zabbix/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          zabbix_api_url: data.zabbixApiUrl,
          zabbix_api_token: data.zabbixApiToken,
        }),
      });
      const result = await res.json();
      if (res.ok && result.success) {
        setConnectionResult({
          success: true,
          message: result.message,
          version: result.api_version,
        });
      } else {
        setConnectionResult({
          success: false,
          message: result?.error?.message ?? "Falha na conexão",
        });
      }
    } catch {
      setConnectionResult({
        success: false,
        message: "Erro de conexão com o servidor",
      });
    }
    setTestingConnection(false);
  }

  async function fetchHostGroups() {
    if (!data.zabbixApiUrl.trim() || !data.zabbixApiToken.trim()) return;
    setLoadingHostGroups(true);
    try {
      const res = await fetch("/api/admin/zabbix/host-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          zabbix_api_url: data.zabbixApiUrl,
          zabbix_api_token: data.zabbixApiToken,
        }),
      });
      const result = await res.json();
      if (res.ok) {
        setHostGroups(result.host_groups ?? []);
      }
    } catch {
      // Silencioso — usuario pode digitar manualmente
    }
    setLoadingHostGroups(false);
  }

  async function previewHostGroup() {
    if (!data.zabbixHostGroupId.trim()) return;
    setLoadingPreview(true);
    setShowPreview(true);
    setPreviewHosts([]);
    try {
      const res = await fetch("/api/admin/zabbix/preview-hosts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          zabbix_api_url: data.zabbixApiUrl,
          zabbix_api_token: data.zabbixApiToken,
          host_group_id: data.zabbixHostGroupId,
        }),
      });
      const result = await res.json();
      if (res.ok) {
        setPreviewHosts(result.hosts ?? []);
      }
    } catch {
      // Silencioso
    }
    setLoadingPreview(false);
  }

  function validateStep(s: number): string | null {
    if (s === 1) {
      if (!data.name.trim()) return "Nome do cliente é obrigatório";
      if (data.cnpj && !/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(data.cnpj))
        return "CNPJ inválido";
    }
    if (s === 2) {
      if (!data.clusterId.trim()) return "Cluster ID é obrigatório";
      if (!data.clusterHost.trim()) return "Cluster Host é obrigatório";
      if (!data.clusterDbName.trim()) return "Database é obrigatório";
      const port = parseInt(data.clusterPort, 10);
      if (isNaN(port) || port < 1 || port > 65535) return "Porta inválida";
      if (!data.zabbixHostGroupId.trim())
        return "Zabbix Host Group ID é obrigatório";
      if (!data.zabbixApiUrl.trim()) return "Zabbix API URL é obrigatório";
      if (!data.zabbixApiToken.trim()) return "Zabbix API Token é obrigatório";
    }
    if (s === 3) {
      if (!data.userEmail.trim()) return "Email do usuário é obrigatório";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.userEmail))
        return "Email inválido";
      if (!data.userFullName.trim()) return "Nome completo é obrigatório";
      if (data.userPassword.length < 8)
        return "Senha deve ter no mínimo 8 caracteres";
    }
    return null;
  }

  function nextStep() {
    const err = validateStep(step);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setStep((s) => Math.min(s + 1, 4));
  }

  function prevStep() {
    setError(null);
    setStep((s) => Math.max(s - 1, 1));
  }

  async function handleSubmit() {
    const err = validateStep(2);
    if (err) {
      setError(err);
      setStep(2);
      return;
    }
    const err3 = validateStep(3);
    if (err3) {
      setError(err3);
      setStep(3);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // 1. Criar tenant
      const tenantRes = await fetch("/api/admin/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: data.name,
          cnpj: data.cnpj || undefined,
          contract_end_date: data.contractEndDate || undefined,
          cluster_id: data.clusterId,
          cluster_host: data.clusterHost,
          cluster_database_name: data.clusterDbName,
          cluster_port: parseInt(data.clusterPort, 10),
          zabbix_host_group_id: data.zabbixHostGroupId,
          zabbix_api_url: data.zabbixApiUrl,
          zabbix_api_token: data.zabbixApiToken,
        }),
      });

      const tenantData = await tenantRes.json();

      if (!tenantRes.ok) {
        setError(tenantData?.error?.message ?? "Erro ao criar tenant");
        setSubmitting(false);
        return;
      }

      const tenantId = tenantData.id as string;
      setCreatedTenantId(tenantId);

      // 2. Criar usuário admin do tenant
      const userRes = await fetch(
        `/api/admin/tenants/${tenantId}/users/create`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            email: data.userEmail,
            full_name: data.userFullName,
            phone: data.userPhone || undefined,
            role: data.userRole,
            provisional_password: data.userPassword,
            must_change_password: data.userMustChange,
          }),
        },
      );

      if (!userRes.ok) {
        const userData = await userRes.json().catch(() => ({}));
        setError(
          `Tenant criado, mas erro ao criar usuário: ${userData?.error?.message ?? "erro desconhecido"}`,
        );
        setSubmitting(false);
        return;
      }

      // 3. Salvar dados comerciais (opcional)
      if (
        data.legalName ||
        data.planTier !== "basic" ||
        data.billingCycle !== "monthly"
      ) {
        await fetch(`/api/admin/tenants/${tenantId}/company`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            legal_name: data.legalName || undefined,
            cnpj: data.cnpj || undefined,
            plan_tier: data.planTier,
            billing_cycle: data.billingCycle,
          }),
        }).catch(() => {
          /* Dados comerciais são opcionais */
        });
      }

      setSuccess(
        "Cliente criado com sucesso! Tenant, usuário admin e dados comerciais configurados.",
      );
      setSubmitting(false);
    } catch {
      setError("Erro de conexão com o servidor");
      setSubmitting(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    background: COLORS.bg,
    border: `1px solid ${COLORS.border}`,
    color: COLORS.text,
  };

  const labelStyle: React.CSSProperties = {
    color: COLORS.muted,
  };

  if (success && createdTenantId) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-6"
        style={{
          background: COLORS.bg,
          fontFamily: "'JetBrains Mono','Consolas',monospace",
        }}
      >
        <div
          className="rounded-xl p-8 max-w-md w-full text-center space-y-6"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.green}33`,
          }}
        >
          <div className="flex justify-center">
            <div
              className="flex items-center justify-center rounded-full"
              style={{
                width: 64,
                height: 64,
                background: `${COLORS.green}15`,
                border: `2px solid ${COLORS.green}`,
              }}
            >
              <CheckCircle2 size={32} style={{ color: COLORS.green }} />
            </div>
          </div>
          <div>
            <h2 className="text-lg font-bold" style={{ color: COLORS.green }}>
              Onboarding Concluído!
            </h2>
            <p className="text-[12px] mt-2" style={{ color: COLORS.muted }}>
              {success}
            </p>
          </div>
          <div
            className="rounded-md p-4 text-left"
            style={{
              background: COLORS.bg,
              border: `1px solid ${COLORS.border}`,
            }}
          >
            <div
              className="text-[10px] font-bold uppercase mb-2"
              style={{ color: COLORS.muted }}
            >
              Resumo
            </div>
            <div
              className="space-y-1 text-[12px]"
              style={{ color: COLORS.text }}
            >
              <div>
                <span style={{ color: COLORS.muted }}>Cliente:</span>{" "}
                {data.name}
              </div>
              <div>
                <span style={{ color: COLORS.muted }}>Tenant ID:</span>{" "}
                <code style={{ color: COLORS.teal }}>{createdTenantId}</code>
              </div>
              <div>
                <span style={{ color: COLORS.muted }}>Admin:</span>{" "}
                {data.userEmail}
              </div>
              <div>
                <span style={{ color: COLORS.muted }}>Role:</span>{" "}
                {data.userRole}
              </div>
              <div>
                <span style={{ color: COLORS.muted }}>Troca de senha:</span>{" "}
                {data.userMustChange ? "Sim" : "Não"}
              </div>
            </div>
          </div>
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => router.push("/admin")}
              className="px-4 py-2 rounded-md text-[12px] font-bold"
              style={{
                background: COLORS.teal,
                color: COLORS.bg,
                cursor: "pointer",
              }}
            >
              Ver Clientes
            </button>
            <button
              onClick={() => {
                setData(INITIAL_DATA);
                setStep(1);
                setSuccess(null);
                setCreatedTenantId(null);
              }}
              className="px-4 py-2 rounded-md text-[12px]"
              style={{
                background: COLORS.bg,
                border: `1px solid ${COLORS.border}`,
                color: COLORS.muted,
                cursor: "pointer",
              }}
            >
              Novo Onboarding
            </button>
          </div>
        </div>
      </div>
    );
  }

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
            Onboarding de Cliente
          </h1>
          <p className="text-[12px]" style={{ color: COLORS.muted }}>
            Wizard multi-step · Criação completa de tenant + usuário + CRM
          </p>
        </div>
        <button
          onClick={() => router.push("/admin")}
          className="text-[12px] px-3 py-1.5 rounded border"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            color: COLORS.muted,
            cursor: "pointer",
          }}
        >
          <ArrowLeft size={12} className="inline" /> Voltar
        </button>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center justify-center">
        <div className="flex items-center gap-2">
          {STEPS.map((s, idx) => {
            const Icon = s.icon;
            const isActive = step === s.id;
            const isDone = step > s.id;
            return (
              <div key={s.id} className="flex items-center">
                <div className="flex items-center gap-2">
                  <div
                    className="flex items-center justify-center rounded-full transition-all"
                    style={{
                      width: 36,
                      height: 36,
                      background: isDone
                        ? `${COLORS.green}15`
                        : isActive
                          ? `${COLORS.teal}15`
                          : COLORS.card,
                      border: `2px solid ${isDone ? COLORS.green : isActive ? COLORS.teal : COLORS.border}`,
                    }}
                  >
                    {isDone ? (
                      <CheckCircle2 size={16} style={{ color: COLORS.green }} />
                    ) : (
                      <Icon
                        size={16}
                        style={{ color: isActive ? COLORS.teal : COLORS.muted }}
                      />
                    )}
                  </div>
                  <span
                    className="text-[11px] font-bold uppercase"
                    style={{
                      color: isActive
                        ? COLORS.teal
                        : isDone
                          ? COLORS.green
                          : COLORS.muted,
                    }}
                  >
                    {s.label}
                  </span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div
                    className="mx-3"
                    style={{
                      width: 40,
                      height: 2,
                      background: isDone ? COLORS.green : COLORS.border,
                    }}
                  />
                )}
              </div>
            );
          })}
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

      {/* Step Content */}
      <div
        className="rounded-xl p-6 max-w-2xl mx-auto"
        style={{
          background: COLORS.card,
          border: `1px solid ${COLORS.border}`,
        }}
      >
        {/* Step 1: Cliente */}
        {step === 1 && (
          <div className="space-y-4">
            <h2
              className="text-sm font-bold mb-4"
              style={{ color: COLORS.teal }}
            >
              <Building2 size={14} className="inline mr-1" /> Dados do Cliente
            </h2>

            <div className="space-y-1">
              <label
                htmlFor="ob-name"
                className="text-[10px] font-bold uppercase"
                style={labelStyle}
              >
                Nome do Cliente *
              </label>
              <input
                id="ob-name"
                type="text"
                value={data.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="Empresa XYZ Ltda"
                className="w-full rounded-md px-3 py-2 text-[13px]"
                style={inputStyle}
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="ob-legal"
                className="text-[10px] font-bold uppercase"
                style={labelStyle}
              >
                Razão Social (opcional)
              </label>
              <input
                id="ob-legal"
                type="text"
                value={data.legalName}
                onChange={(e) => update("legalName", e.target.value)}
                placeholder="Empresa XYZ Ltda - ME"
                className="w-full rounded-md px-3 py-2 text-[12px]"
                style={inputStyle}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label
                  htmlFor="ob-cnpj"
                  className="text-[10px] font-bold uppercase"
                  style={labelStyle}
                >
                  CNPJ (opcional)
                </label>
                <input
                  id="ob-cnpj"
                  type="text"
                  value={data.cnpj}
                  onChange={(e) => update("cnpj", formatCnpj(e.target.value))}
                  placeholder="12.345.678/0001-90"
                  className="w-full rounded-md px-3 py-2 text-[12px]"
                  style={inputStyle}
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="ob-contract"
                  className="text-[10px] font-bold uppercase"
                  style={labelStyle}
                >
                  Fim do Contrato (opcional)
                </label>
                <input
                  id="ob-contract"
                  type="date"
                  value={data.contractEndDate}
                  onChange={(e) => update("contractEndDate", e.target.value)}
                  className="w-full rounded-md px-3 py-2 text-[12px]"
                  style={inputStyle}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label
                  htmlFor="ob-plan"
                  className="text-[10px] font-bold uppercase"
                  style={labelStyle}
                >
                  Plano
                </label>
                <select
                  id="ob-plan"
                  value={data.planTier}
                  onChange={(e) => update("planTier", e.target.value)}
                  className="w-full rounded-md px-3 py-2 text-[12px]"
                  style={inputStyle}
                >
                  <option value="basic">Basic</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="ob-cycle"
                  className="text-[10px] font-bold uppercase"
                  style={labelStyle}
                >
                  Ciclo de Cobrança
                </label>
                <select
                  id="ob-cycle"
                  value={data.billingCycle}
                  onChange={(e) => update("billingCycle", e.target.value)}
                  className="w-full rounded-md px-3 py-2 text-[12px]"
                  style={inputStyle}
                >
                  <option value="monthly">Mensal</option>
                  <option value="quarterly">Trimestral</option>
                  <option value="yearly">Anual</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Infraestrutura */}
        {step === 2 && (
          <div className="space-y-4">
            <h2
              className="text-sm font-bold mb-4"
              style={{ color: COLORS.teal }}
            >
              <Server size={14} className="inline mr-1" /> Infraestrutura &
              Zabbix
            </h2>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label
                  htmlFor="ob-ci"
                  className="text-[10px] font-bold uppercase"
                  style={labelStyle}
                >
                  Cluster ID *
                </label>
                <input
                  id="ob-ci"
                  type="text"
                  value={data.clusterId}
                  onChange={(e) => update("clusterId", e.target.value)}
                  className="w-full rounded-md px-3 py-2 text-[12px]"
                  style={inputStyle}
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="ob-ch"
                  className="text-[10px] font-bold uppercase"
                  style={labelStyle}
                >
                  Cluster Host *
                </label>
                <input
                  id="ob-ch"
                  type="text"
                  value={data.clusterHost}
                  onChange={(e) => update("clusterHost", e.target.value)}
                  className="w-full rounded-md px-3 py-2 text-[12px]"
                  style={inputStyle}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label
                  htmlFor="ob-db"
                  className="text-[10px] font-bold uppercase"
                  style={labelStyle}
                >
                  Database *
                </label>
                <input
                  id="ob-db"
                  type="text"
                  value={data.clusterDbName}
                  onChange={(e) => update("clusterDbName", e.target.value)}
                  className="w-full rounded-md px-3 py-2 text-[12px]"
                  style={inputStyle}
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="ob-port"
                  className="text-[10px] font-bold uppercase"
                  style={labelStyle}
                >
                  Porta *
                </label>
                <input
                  id="ob-port"
                  type="text"
                  value={data.clusterPort}
                  onChange={(e) => update("clusterPort", e.target.value)}
                  className="w-full rounded-md px-3 py-2 text-[12px]"
                  style={inputStyle}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="ob-zu"
                className="text-[10px] font-bold uppercase"
                style={labelStyle}
              >
                Zabbix API URL *
              </label>
              <input
                id="ob-zu"
                type="text"
                value={data.zabbixApiUrl}
                onChange={(e) => update("zabbixApiUrl", e.target.value)}
                className="w-full rounded-md px-3 py-2 text-[12px]"
                style={inputStyle}
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="ob-zt"
                className="text-[10px] font-bold uppercase"
                style={labelStyle}
              >
                Zabbix API Token *
              </label>
              <div className="relative">
                <input
                  id="ob-zt"
                  type={showToken ? "text" : "password"}
                  value={data.zabbixApiToken}
                  onChange={(e) => update("zabbixApiToken", e.target.value)}
                  placeholder="Token de API do Zabbix"
                  className="w-full rounded-md px-3 py-2 pr-10 text-[12px]"
                  style={inputStyle}
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                  style={{ color: COLORS.muted, cursor: "pointer" }}
                >
                  {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <p className="text-[10px]" style={{ color: COLORS.muted }}>
                O token é criptografado (AES-256-GCM) antes de armazenar.
              </p>
            </div>

            {/* Teste de Conexao */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={testConnection}
                disabled={testingConnection}
                className="px-3 py-1.5 rounded-md text-[11px] font-bold flex items-center gap-1.5"
                style={{
                  background: connectionResult?.success
                    ? `${COLORS.green}15`
                    : `${COLORS.teal}15`,
                  border: `1px solid ${connectionResult?.success ? COLORS.green : COLORS.teal}`,
                  color: connectionResult?.success ? COLORS.green : COLORS.teal,
                  cursor: testingConnection ? "not-allowed" : "pointer",
                }}
              >
                {testingConnection ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Plug size={12} />
                )}
                {testingConnection ? "Testando..." : "Testar Conexão"}
              </button>
              {connectionResult && (
                <div
                  className="rounded-md p-2 text-[11px]"
                  style={{
                    background: connectionResult.success
                      ? `${COLORS.green}10`
                      : `${COLORS.red}10`,
                    border: `1px solid ${connectionResult.success ? COLORS.green : COLORS.red}33`,
                    color: connectionResult.success ? COLORS.green : COLORS.red,
                  }}
                >
                  {connectionResult.message}
                </div>
              )}
            </div>

            {/* Host Group Selector */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="ob-zg"
                  className="text-[10px] font-bold uppercase"
                  style={labelStyle}
                >
                  Zabbix Host Group ID *
                </label>
                <button
                  type="button"
                  onClick={fetchHostGroups}
                  disabled={
                    loadingHostGroups ||
                    !data.zabbixApiUrl.trim() ||
                    !data.zabbixApiToken.trim()
                  }
                  className="text-[10px] flex items-center gap-1"
                  style={{
                    color: COLORS.teal,
                    cursor:
                      loadingHostGroups ||
                      !data.zabbixApiUrl.trim() ||
                      !data.zabbixApiToken.trim()
                        ? "not-allowed"
                        : "pointer",
                  }}
                >
                  {loadingHostGroups ? (
                    <Loader2 size={10} className="animate-spin" />
                  ) : (
                    <Search size={10} />
                  )}
                  Buscar Groups
                </button>
              </div>
              <input
                id="ob-zg"
                type="text"
                value={data.zabbixHostGroupId}
                onChange={(e) => update("zabbixHostGroupId", e.target.value)}
                placeholder="15"
                className="w-full rounded-md px-3 py-2 text-[12px]"
                style={inputStyle}
              />

              {/* Lista visual de host groups */}
              {hostGroups.length > 0 && (
                <div
                  className="mt-2 space-y-1 max-h-40 overflow-y-auto rounded-md p-2"
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                  }}
                >
                  <div className="flex items-center gap-1 mb-1">
                    <input
                      type="text"
                      value={hostGroupSearch}
                      onChange={(e) => setHostGroupSearch(e.target.value)}
                      placeholder="Filtrar host groups..."
                      className="flex-1 rounded px-2 py-1 text-[11px]"
                      style={inputStyle}
                    />
                  </div>
                  {hostGroups
                    .filter(
                      (g) =>
                        g.name
                          .toLowerCase()
                          .includes(hostGroupSearch.toLowerCase()) ||
                        g.groupid.includes(hostGroupSearch),
                    )
                    .map((g) => (
                      <button
                        key={g.groupid}
                        type="button"
                        onClick={() => update("zabbixHostGroupId", g.groupid)}
                        className="w-full text-left rounded px-2 py-1 text-[11px] flex items-center gap-2"
                        style={{
                          background:
                            data.zabbixHostGroupId === g.groupid
                              ? `${COLORS.teal}15`
                              : "transparent",
                          border: `1px solid ${data.zabbixHostGroupId === g.groupid ? COLORS.teal : "transparent"}`,
                          color:
                            data.zabbixHostGroupId === g.groupid
                              ? COLORS.teal
                              : COLORS.text,
                          cursor: "pointer",
                        }}
                      >
                        <Monitor size={10} style={{ color: COLORS.muted }} />
                        <span className="font-bold">{g.name}</span>
                        <span style={{ color: COLORS.muted }}>
                          #{g.groupid}
                        </span>
                      </button>
                    ))}
                </div>
              )}
            </div>

            {/* Preview de Hosts */}
            {data.zabbixHostGroupId.trim() && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={previewHostGroup}
                  disabled={loadingPreview}
                  className="text-[11px] flex items-center gap-1"
                  style={{
                    color: COLORS.blue,
                    cursor: loadingPreview ? "not-allowed" : "pointer",
                  }}
                >
                  {loadingPreview ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Search size={12} />
                  )}
                  {showPreview ? "Atualizar Preview" : "Preview de Hosts"}
                </button>
                {showPreview && (
                  <div
                    className="rounded-md p-2 max-h-48 overflow-y-auto"
                    style={{
                      background: COLORS.bg,
                      border: `1px solid ${COLORS.border}`,
                    }}
                  >
                    {loadingPreview ? (
                      <div
                        className="text-[11px] text-center py-2"
                        style={{ color: COLORS.muted }}
                      >
                        Carregando hosts...
                      </div>
                    ) : previewHosts.length === 0 ? (
                      <div
                        className="text-[11px] text-center py-2"
                        style={{ color: COLORS.muted }}
                      >
                        Nenhum host encontrado neste group
                      </div>
                    ) : (
                      <>
                        <div
                          className="text-[10px] font-bold uppercase mb-1"
                          style={{ color: COLORS.muted }}
                        >
                          {previewHosts.length} host(s) encontrado(s)
                        </div>
                        {previewHosts.map((h) => (
                          <div
                            key={h.hostid}
                            className="flex items-center gap-2 py-0.5 text-[11px]"
                            style={{ color: COLORS.text }}
                          >
                            <span
                              className={`inline-block w-2 h-2 rounded-full ${h.status === "0" ? "" : "opacity-30"}`}
                              style={{
                                background:
                                  h.status === "0" ? COLORS.green : COLORS.red,
                              }}
                            />
                            <span className="font-bold">{h.name}</span>
                            <span style={{ color: COLORS.muted }}>
                              {h.host}
                            </span>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Usuário Admin */}
        {step === 3 && (
          <div className="space-y-4">
            <h2
              className="text-sm font-bold mb-4"
              style={{ color: COLORS.teal }}
            >
              <UserPlus size={14} className="inline mr-1" /> Usuário
              Administrador do Cliente
            </h2>

            <div className="space-y-1">
              <label
                htmlFor="ob-ue"
                className="text-[10px] font-bold uppercase"
                style={labelStyle}
              >
                Email *
              </label>
              <input
                id="ob-ue"
                type="email"
                value={data.userEmail}
                onChange={(e) => update("userEmail", e.target.value)}
                placeholder="admin@cliente.com"
                className="w-full rounded-md px-3 py-2 text-[13px]"
                style={inputStyle}
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="ob-un"
                className="text-[10px] font-bold uppercase"
                style={labelStyle}
              >
                Nome Completo *
              </label>
              <input
                id="ob-un"
                type="text"
                value={data.userFullName}
                onChange={(e) => update("userFullName", e.target.value)}
                placeholder="João Silva"
                className="w-full rounded-md px-3 py-2 text-[13px]"
                style={inputStyle}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label
                  htmlFor="ob-up"
                  className="text-[10px] font-bold uppercase"
                  style={labelStyle}
                >
                  Telefone (opcional)
                </label>
                <input
                  id="ob-up"
                  type="tel"
                  value={data.userPhone}
                  onChange={(e) => update("userPhone", e.target.value)}
                  placeholder="(11) 99999-9999"
                  className="w-full rounded-md px-3 py-2 text-[12px]"
                  style={inputStyle}
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="ob-ur"
                  className="text-[10px] font-bold uppercase"
                  style={labelStyle}
                >
                  Role
                </label>
                <select
                  id="ob-ur"
                  value={data.userRole}
                  onChange={(e) => update("userRole", e.target.value)}
                  className="w-full rounded-md px-3 py-2 text-[12px]"
                  style={inputStyle}
                >
                  <option value="tenant:admin">Admin do Tenant</option>
                  <option value="tenant:operator">Operador</option>
                  <option value="tenant:viewer">Visualizador</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="ob-upw"
                className="text-[10px] font-bold uppercase"
                style={labelStyle}
              >
                Senha Provisória *
              </label>
              <div className="relative">
                <input
                  id="ob-upw"
                  type={showPassword ? "text" : "password"}
                  value={data.userPassword}
                  onChange={(e) => update("userPassword", e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className="w-full rounded-md px-3 py-2 pr-10 text-[12px]"
                  style={inputStyle}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                  style={{ color: COLORS.muted, cursor: "pointer" }}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={data.userMustChange}
                onChange={(e) => update("userMustChange", e.target.checked)}
                style={{ accentColor: COLORS.teal }}
              />
              <span className="text-[11px]" style={{ color: COLORS.muted }}>
                Forçar troca de senha no primeiro acesso
              </span>
            </label>
          </div>
        )}

        {/* Step 4: Revisão */}
        {step === 4 && (
          <div className="space-y-4">
            <h2
              className="text-sm font-bold mb-4"
              style={{ color: COLORS.teal }}
            >
              <CheckCircle2 size={14} className="inline mr-1" /> Revisão —
              Confirme os Dados
            </h2>

            <div
              className="rounded-md p-4 space-y-3"
              style={{
                background: COLORS.bg,
                border: `1px solid ${COLORS.border}`,
              }}
            >
              <div>
                <div
                  className="text-[10px] font-bold uppercase mb-1"
                  style={{ color: COLORS.muted }}
                >
                  Cliente
                </div>
                <div
                  className="text-[12px] space-y-0.5"
                  style={{ color: COLORS.text }}
                >
                  <div>
                    <span style={{ color: COLORS.muted }}>Nome:</span>{" "}
                    {data.name}
                  </div>
                  {data.legalName && (
                    <div>
                      <span style={{ color: COLORS.muted }}>Razão:</span>{" "}
                      {data.legalName}
                    </div>
                  )}
                  {data.cnpj && (
                    <div>
                      <span style={{ color: COLORS.muted }}>CNPJ:</span>{" "}
                      {data.cnpj}
                    </div>
                  )}
                  <div>
                    <span style={{ color: COLORS.muted }}>Plano:</span>{" "}
                    {data.planTier} · {data.billingCycle}
                  </div>
                  {data.contractEndDate && (
                    <div>
                      <span style={{ color: COLORS.muted }}>Contrato até:</span>{" "}
                      {data.contractEndDate}
                    </div>
                  )}
                </div>
              </div>

              <div
                className="border-t pt-3"
                style={{ borderColor: COLORS.border }}
              >
                <div
                  className="text-[10px] font-bold uppercase mb-1"
                  style={{ color: COLORS.muted }}
                >
                  Infraestrutura
                </div>
                <div
                  className="text-[12px] space-y-0.5"
                  style={{ color: COLORS.text }}
                >
                  <div>
                    <span style={{ color: COLORS.muted }}>Cluster:</span>{" "}
                    {data.clusterId} @ {data.clusterHost}:{data.clusterPort}
                  </div>
                  <div>
                    <span style={{ color: COLORS.muted }}>Database:</span>{" "}
                    {data.clusterDbName}
                  </div>
                  <div>
                    <span style={{ color: COLORS.muted }}>Zabbix:</span>{" "}
                    {data.zabbixApiUrl}
                  </div>
                  <div>
                    <span style={{ color: COLORS.muted }}>Host Group:</span>{" "}
                    {data.zabbixHostGroupId}
                  </div>
                  <div>
                    <span style={{ color: COLORS.muted }}>Token:</span>{" "}
                    {"•".repeat(8)} (criptografado)
                  </div>
                </div>
              </div>

              <div
                className="border-t pt-3"
                style={{ borderColor: COLORS.border }}
              >
                <div
                  className="text-[10px] font-bold uppercase mb-1"
                  style={{ color: COLORS.muted }}
                >
                  Usuário Admin
                </div>
                <div
                  className="text-[12px] space-y-0.5"
                  style={{ color: COLORS.text }}
                >
                  <div>
                    <span style={{ color: COLORS.muted }}>Email:</span>{" "}
                    {data.userEmail}
                  </div>
                  <div>
                    <span style={{ color: COLORS.muted }}>Nome:</span>{" "}
                    {data.userFullName}
                  </div>
                  {data.userPhone && (
                    <div>
                      <span style={{ color: COLORS.muted }}>Telefone:</span>{" "}
                      {data.userPhone}
                    </div>
                  )}
                  <div>
                    <span style={{ color: COLORS.muted }}>Role:</span>{" "}
                    {data.userRole}
                  </div>
                  <div>
                    <span style={{ color: COLORS.muted }}>Troca de senha:</span>{" "}
                    {data.userMustChange ? "Sim" : "Não"}
                  </div>
                </div>
              </div>
            </div>

            <p
              className="text-[11px] text-center"
              style={{ color: COLORS.muted }}
            >
              Ao confirmar, o sistema criará: tenant + schema PostgreSQL + rota
              de cluster + usuário admin + dados comerciais.
            </p>
          </div>
        )}

        {/* Navigation */}
        <div
          className="flex justify-between mt-6 pt-4 border-t"
          style={{ borderColor: COLORS.border }}
        >
          <button
            onClick={prevStep}
            disabled={step === 1 || submitting}
            className="px-4 py-2 rounded-md text-[12px] flex items-center gap-1"
            style={{
              background: COLORS.bg,
              border: `1px solid ${COLORS.border}`,
              color: COLORS.muted,
              cursor: step === 1 || submitting ? "not-allowed" : "pointer",
              opacity: step === 1 || submitting ? 0.5 : 1,
            }}
          >
            <ArrowLeft size={12} /> Anterior
          </button>

          {step < 4 ? (
            <button
              onClick={nextStep}
              className="px-4 py-2 rounded-md text-[12px] font-bold flex items-center gap-1"
              style={{
                background: COLORS.teal,
                color: COLORS.bg,
                cursor: "pointer",
              }}
            >
              Próximo <ArrowRight size={12} />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-4 py-2 rounded-md text-[12px] font-bold flex items-center gap-2"
              style={{
                background: COLORS.green,
                color: COLORS.bg,
                cursor: submitting ? "not-allowed" : "pointer",
                opacity: submitting ? 0.5 : 1,
              }}
            >
              {submitting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <CheckCircle2 size={14} />
              )}
              {submitting ? "Criando..." : "Confirmar & Criar"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
