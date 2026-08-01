// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState, useMemo } from "react";
import {
  Shield,
  Download,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Server,
  Loader2,
  RefreshCw,
  Upload,
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

interface Patch {
  id: string;
  device_hostname: string | null;
  patch_name: string;
  vendor: string;
  product: string;
  version: string | null;
  severity: string;
  category: string;
  status: string;
  requires_reboot: boolean;
  kb_article: string | null;
  release_date: string | null;
  installed_date: string | null;
  created_at: string;
}

interface PatchSummary {
  total: string;
  critical: string;
  high: string;
  medium: string;
  low: string;
  available: string;
  approved: string;
  installed: string;
  failed: string;
  rejected: string;
  requires_reboot: string;
}

interface Deployment {
  id: string;
  name: string;
  description: string | null;
  status: string;
  total_patches: number;
  total_devices: number;
  successful_installs: number;
  failed_installs: number;
  requires_reboot: boolean;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: COLORS.red,
  high: COLORS.amber,
  medium: COLORS.blue,
  low: COLORS.muted,
};

const STATUS_COLORS: Record<string, string> = {
  available: COLORS.blue,
  approved: COLORS.teal,
  installing: COLORS.amber,
  installed: COLORS.green,
  failed: COLORS.red,
  rejected: COLORS.muted,
  superseded: COLORS.muted,
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  available: <Clock size={12} />,
  approved: <CheckCircle2 size={12} />,
  installing: <Loader2 size={12} className="animate-spin" />,
  installed: <CheckCircle2 size={12} />,
  failed: <XCircle size={12} />,
  rejected: <XCircle size={12} />,
};

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function PatchesPage() {
  const { data: summaryData, mutate: mutateSummary } = useApi<{ summary: PatchSummary; recent_scans: unknown[] }>("/api/v1/patches/summary");
  const { data: patchesData, mutate: mutatePatches } = useApi<{ patches: Patch[] }>("/api/v1/patches?limit=200");
  const { data: deploymentsData, mutate: mutateDeployments } = useApi<{ deployments: Deployment[] }>("/api/v1/patches/deployments");

  const [filterSeverity, setFilterSeverity] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const summary = summaryData?.summary;
  const patches = patchesData?.patches ?? [];
  const deployments = deploymentsData?.deployments ?? [];

  const filteredPatches = useMemo(() => {
    return patches.filter((p) => {
      if (filterSeverity && p.severity !== filterSeverity) return false;
      if (filterStatus && p.status !== filterStatus) return false;
      return true;
    });
  }, [patches, filterSeverity, filterStatus]);

  const handleAction = async (patchId: string, action: "approve" | "reject" | "install") => {
    setActionLoading(`${patchId}-${action}`);
    setError(null);
    try {
      const res = await fetch(`/api/v1/patches/${patchId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data?.error?.message ?? "Erro ao processar ação");
      } else {
        mutatePatches();
        mutateSummary();
      }
    } catch {
      setError("Erro de conexão");
    } finally {
      setActionLoading(null);
    }
  };

  const num = (v: string | undefined): number => parseInt(v ?? "0", 10);

  return (
    <div className="min-h-screen p-6 space-y-6" style={{ background: COLORS.bg, fontFamily: "'JetBrains Mono','Consolas',monospace", color: COLORS.text }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold" style={{ color: COLORS.teal }}><Shield size={18} className="inline mr-1" /> Patch Management</h1>
          <p className="text-[12px]" style={{ color: COLORS.muted }}>Gestão de patches e atualizações de segurança</p>
        </div>
        <button onClick={() => { mutatePatches(); mutateSummary(); mutateDeployments(); }} className="text-[12px] px-3 py-1.5 rounded font-bold flex items-center gap-2" style={{ background: `${COLORS.teal}15`, border: `1px solid ${COLORS.teal}`, color: COLORS.teal, cursor: "pointer" }}>
          <RefreshCw size={12} /> Atualizar
        </button>
      </div>

      {error && <div className="rounded-md p-3 text-sm" style={{ background: "var(--status-error-bg)", border: "1px solid var(--status-error-border)", color: COLORS.red }}>{error}</div>}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className="rounded-xl p-4" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
          <div className="text-[10px] font-bold uppercase mb-1" style={{ color: COLORS.muted }}>Total</div>
          <div className="text-2xl font-bold" style={{ color: COLORS.text }}>{num(summary?.total)}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: COLORS.card, border: `1px solid ${COLORS.red}33` }}>
          <div className="text-[10px] font-bold uppercase mb-1" style={{ color: COLORS.muted }}>Críticos</div>
          <div className="text-2xl font-bold" style={{ color: COLORS.red }}>{num(summary?.critical)}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: COLORS.card, border: `1px solid ${COLORS.amber}33` }}>
          <div className="text-[10px] font-bold uppercase mb-1" style={{ color: COLORS.muted }}>Altos</div>
          <div className="text-2xl font-bold" style={{ color: COLORS.amber }}>{num(summary?.high)}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: COLORS.card, border: `1px solid ${COLORS.blue}33` }}>
          <div className="text-[10px] font-bold uppercase mb-1" style={{ color: COLORS.muted }}>Disponíveis</div>
          <div className="text-2xl font-bold" style={{ color: COLORS.blue }}>{num(summary?.available)}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: COLORS.card, border: `1px solid ${COLORS.green}33` }}>
          <div className="text-[10px] font-bold uppercase mb-1" style={{ color: COLORS.muted }}>Instalados</div>
          <div className="text-2xl font-bold" style={{ color: COLORS.green }}>{num(summary?.installed)}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: COLORS.card, border: `1px solid ${COLORS.red}33` }}>
          <div className="text-[10px] font-bold uppercase mb-1" style={{ color: COLORS.muted }}>Falharam</div>
          <div className="text-2xl font-bold" style={{ color: COLORS.red }}>{num(summary?.failed)}</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Filtros:</span>
        <select value={filterSeverity} onChange={(e) => setFilterSeverity(e.target.value)} className="rounded-md px-3 py-1.5 text-[12px]" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.text }}>
          <option value="">Todas severidades</option>
          <option value="critical">Crítica</option>
          <option value="high">Alta</option>
          <option value="medium">Média</option>
          <option value="low">Baixa</option>
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="rounded-md px-3 py-1.5 text-[12px]" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.text }}>
          <option value="">Todos status</option>
          <option value="available">Disponível</option>
          <option value="approved">Aprovado</option>
          <option value="installing">Instalando</option>
          <option value="installed">Instalado</option>
          <option value="failed">Falhou</option>
          <option value="rejected">Rejeitado</option>
        </select>
        <span className="text-[10px]" style={{ color: COLORS.muted }}>{filteredPatches.length} patches</span>
      </div>

      {/* Patches Table */}
      <div className="rounded-xl overflow-hidden" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr style={{ background: "var(--surface-1)", borderBottom: `1px solid ${COLORS.border}` }}>
                <th className="text-left p-3 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Patch</th>
                <th className="text-left p-3 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Dispositivo</th>
                <th className="text-left p-3 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Severidade</th>
                <th className="text-left p-3 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Status</th>
                <th className="text-left p-3 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Reboot</th>
                <th className="text-right p-3 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredPatches.length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center" style={{ color: COLORS.muted }}>Nenhum patch encontrado</td></tr>
              )}
              {filteredPatches.map((p) => (
                <tr key={p.id} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <td className="p-3">
                    <div className="font-bold" style={{ color: COLORS.text }}>{p.patch_name}</div>
                    <div className="text-[10px]" style={{ color: COLORS.muted }}>{p.vendor} · {p.product}{p.version ? ` v${p.version}` : ""}</div>
                    {p.kb_article && <div className="text-[10px]" style={{ color: COLORS.blue }}>KB: {p.kb_article}</div>}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-1" style={{ color: COLORS.muted }}>
                      <Server size={12} /> {p.device_hostname ?? "—"}
                    </div>
                  </td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: `${SEVERITY_COLORS[p.severity] ?? COLORS.muted}15`, color: SEVERITY_COLORS[p.severity] ?? COLORS.muted }}>
                      {p.severity}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase flex items-center gap-1 w-fit" style={{ background: `${STATUS_COLORS[p.status] ?? COLORS.muted}15`, color: STATUS_COLORS[p.status] ?? COLORS.muted }}>
                      {STATUS_ICONS[p.status]} {p.status}
                    </span>
                  </td>
                  <td className="p-3">
                    {p.requires_reboot ? <AlertTriangle size={14} style={{ color: COLORS.amber }} /> : <span style={{ color: COLORS.muted }}>—</span>}
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {p.status === "available" && (
                        <>
                          <button onClick={() => handleAction(p.id, "approve")} disabled={actionLoading === `${p.id}-approve`} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: `${COLORS.green}15`, border: `1px solid ${COLORS.green}`, color: COLORS.green, cursor: "pointer", opacity: actionLoading === `${p.id}-approve` ? 0.5 : 1 }}>
                            {actionLoading === `${p.id}-approve` ? <Loader2 size={10} className="animate-spin" /> : "Aprovar"}
                          </button>
                          <button onClick={() => handleAction(p.id, "reject")} disabled={actionLoading === `${p.id}-reject`} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: `${COLORS.red}15`, border: `1px solid ${COLORS.red}`, color: COLORS.red, cursor: "pointer", opacity: actionLoading === `${p.id}-reject` ? 0.5 : 1 }}>
                            {actionLoading === `${p.id}-reject` ? <Loader2 size={10} className="animate-spin" /> : "Rejeitar"}
                          </button>
                        </>
                      )}
                      {(p.status === "approved" || p.status === "failed") && (
                        <button onClick={() => handleAction(p.id, "install")} disabled={actionLoading === `${p.id}-install`} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: `${COLORS.teal}15`, border: `1px solid ${COLORS.teal}`, color: COLORS.teal, cursor: "pointer", opacity: actionLoading === `${p.id}-install` ? 0.5 : 1 }}>
                          {actionLoading === `${p.id}-install` ? <Loader2 size={10} className="animate-spin" /> : <Upload size={10} className="inline" />} Instalar
                        </button>
                      )}
                      {p.status === "installed" && <CheckCircle2 size={14} style={{ color: COLORS.green }} />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Deployments */}
      <div className="rounded-xl p-6" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
        <h3 className="text-[10px] font-bold uppercase mb-4" style={{ color: COLORS.muted }}>Deployments ({deployments.length})</h3>
        <div className="space-y-2">
          {deployments.length === 0 && <div className="text-[12px]" style={{ color: COLORS.muted }}>Nenhum deployment criado</div>}
          {deployments.map((d) => (
            <div key={d.id} className="flex items-center justify-between p-3 rounded-md" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
              <div>
                <div className="text-[13px] font-bold" style={{ color: COLORS.text }}>{d.name}</div>
                <div className="text-[10px] flex items-center gap-3" style={{ color: COLORS.muted }}>
                  <span>{d.total_patches} patches · {d.total_devices} dispositivos</span>
                  {d.requires_reboot && <span style={{ color: COLORS.amber }}><AlertTriangle size={9} className="inline" /> Requer reboot</span>}
                  <span><Clock size={9} className="inline" /> {formatTime(d.scheduled_at ?? d.created_at)}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {d.status === "completed" && (
                  <div className="flex items-center gap-2 text-[10px]">
                    <span style={{ color: COLORS.green }}><CheckCircle2 size={12} className="inline" /> {d.successful_installs}</span>
                    {d.failed_installs > 0 && <span style={{ color: COLORS.red }}><XCircle size={12} className="inline" /> {d.failed_installs}</span>}
                  </div>
                )}
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: `${STATUS_COLORS[d.status] ?? COLORS.muted}15`, color: STATUS_COLORS[d.status] ?? COLORS.muted }}>
                  {d.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
