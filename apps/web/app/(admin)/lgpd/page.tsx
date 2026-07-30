"use client";

import { useState, useCallback } from "react";
import {
  Shield,
  Download,
  Trash2,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Eye,
  X,
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

interface LgpdRequest {
  id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  requester_email: string;
  request_type: string;
  status: string;
  reason: string | null;
  created_at: string;
  completed_at: string | null;
  error_message: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  pending: COLORS.muted,
  processing: COLORS.blue,
  completed: COLORS.green,
  failed: COLORS.red,
  cancelled: COLORS.muted,
};

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function LgpdPage() {
  const { data, mutate } = useApi<{ requests: LgpdRequest[] }>("/api/v1/lgpd/requests");
  const requests = data?.requests ?? [];
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [exportUserId, setExportUserId] = useState("");
  const [exportReason, setExportReason] = useState("");
  const [deleteUserId, setDeleteUserId] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteMode, setDeleteMode] = useState<"anonymize" | "delete">("anonymize");
  const [exportedData, setExportedData] = useState<Record<string, unknown> | null>(null);

  const handleExport = useCallback(async () => {
    if (!exportUserId.trim()) {
      setError("ID do usuário é obrigatório");
      return;
    }
    setLoading("export");
    setError(null);
    try {
      const res = await fetch("/api/v1/lgpd/requests/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ user_id: exportUserId, reason: exportReason || undefined }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess("Dados exportados com sucesso");
        setShowExport(false);
        setExportedData(data.data);
        setExportUserId("");
        setExportReason("");
        mutate();
      } else {
        setError(data?.error?.message ?? "Erro ao exportar dados");
      }
    } catch {
      setError("Erro de conexão");
    } finally {
      setLoading(null);
    }
  }, [exportUserId, exportReason, mutate]);

  const handleDelete = useCallback(async () => {
    if (!deleteUserId.trim()) {
      setError("ID do usuário é obrigatório");
      return;
    }
    setLoading("delete");
    setError(null);
    try {
      const res = await fetch("/api/v1/lgpd/requests/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ user_id: deleteUserId, reason: deleteReason || undefined, mode: deleteMode }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(data.message ?? "Operação concluída");
        setShowDelete(false);
        setDeleteUserId("");
        setDeleteReason("");
        mutate();
      } else {
        setError(data?.error?.message ?? "Erro ao processar solicitação");
      }
    } catch {
      setError("Erro de conexão");
    } finally {
      setLoading(null);
    }
  }, [deleteUserId, deleteReason, deleteMode, mutate]);

  return (
    <div className="min-h-screen p-6 space-y-6" style={{ background: COLORS.bg, fontFamily: "'JetBrains Mono','Consolas',monospace", color: COLORS.text }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold" style={{ color: COLORS.teal }}><Shield size={18} className="inline mr-1" /> LGPD — Proteção de Dados</h1>
          <p className="text-[12px]" style={{ color: COLORS.muted }}>Exportação e anonimização/deleção de dados pessoais · Lei nº 13.709/2018</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowExport(true)} className="text-[12px] px-3 py-1.5 rounded font-bold" style={{ background: `${COLORS.blue}15`, border: `1px solid ${COLORS.blue}`, color: COLORS.blue, cursor: "pointer" }}><Download size={12} className="inline" /> Exportar Dados</button>
          <button onClick={() => setShowDelete(true)} className="text-[12px] px-3 py-1.5 rounded font-bold" style={{ background: `${COLORS.red}15`, border: `1px solid ${COLORS.red}`, color: COLORS.red, cursor: "pointer" }}><Trash2 size={12} className="inline" /> Deletar/Anonimizar</button>
        </div>
      </div>

      {error && <div className="rounded-md p-3 text-sm" style={{ background: "var(--status-error-bg)", border: "1px solid var(--status-error-border)", color: COLORS.red }}>{error}</div>}
      {success && <div className="rounded-md p-3 text-sm" style={{ background: "var(--status-ok-bg)", border: "1px solid var(--status-ok-border)", color: COLORS.green }}>{success}</div>}

      {/* Aviso LGPD */}
      <div className="rounded-xl p-4 flex items-start gap-3" style={{ background: `${COLORS.amber}08`, border: `1px solid ${COLORS.amber}33` }}>
        <AlertTriangle size={18} style={{ color: COLORS.amber, flexShrink: 0, marginTop: 2 }} />
        <div className="text-[12px] space-y-1" style={{ color: COLORS.muted }}>
          <div style={{ color: COLORS.amber }}><strong>Atenção:</strong> As solicitações LGPD são registradas com log de auditoria imutável.</div>
          <div><strong>Exportação:</strong> Coleta todos os dados pessoais de um usuário (sessões, dispositivos, perfil, logs, contatos).</div>
          <div><strong>Anonimização:</strong> Substitui dados identificáveis por placeholders, mantém registros para fins legais.</div>
          <div><strong>Deleção:</strong> Remove permanentemente todos os dados do usuário. <strong>Irreversível.</strong></div>
        </div>
      </div>

      {/* Histórico de Solicitações */}
      <div className="rounded-xl p-6" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
        <h3 className="text-[10px] font-bold uppercase mb-4" style={{ color: COLORS.muted }}>HISTÓRICO DE SOLICITAÇÕES ({requests.length})</h3>
        <div className="space-y-2">
          {requests.length === 0 && <div className="text-[12px]" style={{ color: COLORS.muted }}>Nenhuma solicitação LGPD registrada</div>}
          {requests.map((r) => (
            <div key={r.id} className="flex items-center justify-between p-3 rounded-md" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center rounded-full" style={{ width: 32, height: 32, background: `${STATUS_COLORS[r.status] ?? COLORS.muted}15`, border: `1px solid ${STATUS_COLORS[r.status] ?? COLORS.muted}33` }}>
                  {r.request_type === "export" ? <Download size={14} style={{ color: STATUS_COLORS[r.status] ?? COLORS.muted }} /> : <Trash2 size={14} style={{ color: STATUS_COLORS[r.status] ?? COLORS.muted }} />}
                </div>
                <div>
                  <div className="text-[13px] font-bold" style={{ color: COLORS.text }}>{r.user_email}</div>
                  <div className="text-[10px] flex items-center gap-3" style={{ color: COLORS.muted }}>
                    <span>Tipo: <strong style={{ color: r.request_type === "export" ? COLORS.blue : COLORS.red }}>{r.request_type}</strong></span>
                    <span>Solicitado por: {r.requester_email}</span>
                    <span><Clock size={9} className="inline" /> {formatTime(r.created_at)}</span>
                  </div>
                  {r.reason && <div className="text-[10px] mt-0.5" style={{ color: COLORS.muted }}>Motivo: {r.reason}</div>}
                  {r.error_message && <div className="text-[10px] mt-0.5" style={{ color: COLORS.red }}>Erro: {r.error_message}</div>}
                </div>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: `${STATUS_COLORS[r.status] ?? COLORS.muted}15`, color: STATUS_COLORS[r.status] ?? COLORS.muted }}>
                {r.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Modal: Exportar Dados */}
      {showExport && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "var(--overlay-modal)" }} onClick={() => setShowExport(false)} onKeyDown={(e) => { if (e.key === "Escape") setShowExport(false); }} role="button" tabIndex={0}>
          <div className="rounded-xl p-6 w-full max-w-md space-y-4" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} role="button" tabIndex={0}>
            <h2 className="text-sm font-bold" style={{ color: COLORS.blue }}><Download size={14} className="inline mr-1" /> Exportar Dados Pessoais</h2>

            <div className="space-y-1">
              <label htmlFor="exp-uid" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>ID do Usuário (UUID) *</label>
              <input id="exp-uid" type="text" value={exportUserId} onChange={(e) => setExportUserId(e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" className="w-full rounded-md px-3 py-2 text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
            </div>

            <div className="space-y-1">
              <label htmlFor="exp-reason" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Motivo (opcional)</label>
              <input id="exp-reason" type="text" value={exportReason} onChange={(e) => setExportReason(e.target.value)} placeholder="Solicitação do titular" className="w-full rounded-md px-3 py-2 text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
            </div>

            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowExport(false)} className="px-4 py-2 rounded-md text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.muted, cursor: "pointer" }}>Cancelar</button>
              <button onClick={handleExport} disabled={loading === "export"} className="px-4 py-2 rounded-md text-[12px] font-bold flex items-center gap-2" style={{ background: COLORS.blue, color: COLORS.bg, cursor: loading === "export" ? "not-allowed" : "pointer", opacity: loading === "export" ? 0.5 : 1 }}>
                {loading === "export" ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                {loading === "export" ? "Exportando..." : "Exportar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Deletar/Anonimizar */}
      {showDelete && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "var(--overlay-modal)" }} onClick={() => setShowDelete(false)} onKeyDown={(e) => { if (e.key === "Escape") setShowDelete(false); }} role="button" tabIndex={0}>
          <div className="rounded-xl p-6 w-full max-w-md space-y-4" style={{ background: COLORS.card, border: `1px solid ${COLORS.red}33` }} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} role="button" tabIndex={0}>
            <h2 className="text-sm font-bold" style={{ color: COLORS.red }}><Trash2 size={14} className="inline mr-1" /> Deletar/Anonimizar Dados</h2>

            <div className="rounded-md p-3 flex items-start gap-2" style={{ background: `${COLORS.red}08`, border: `1px solid ${COLORS.red}22` }}>
              <AlertTriangle size={14} style={{ color: COLORS.red, flexShrink: 0, marginTop: 2 }} />
              <div className="text-[11px]" style={{ color: COLORS.muted }}>
                <strong style={{ color: COLORS.red }}>Deleção</strong> remove permanentemente todos os dados. <strong style={{ color: COLORS.amber }}>Anonimização</strong> substitui dados identificáveis mantendo registros legais.
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="del-uid" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>ID do Usuário (UUID) *</label>
              <input id="del-uid" type="text" value={deleteUserId} onChange={(e) => setDeleteUserId(e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" className="w-full rounded-md px-3 py-2 text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
            </div>

            <div className="space-y-1">
              <label htmlFor="del-mode" className="text-[10px] font-bold uppercase" style={labelStyle}>Modo</label>
              <select id="del-mode" value={deleteMode} onChange={(e) => setDeleteMode(e.target.value as "anonymize" | "delete")} className="w-full rounded-md px-3 py-2 text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}>
                <option value="anonymize">Anonimizar (recomendado)</option>
                <option value="delete">Deletar permanentemente</option>
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="del-reason" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Motivo *</label>
              <input id="del-reason" type="text" value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} placeholder="Solicitação do titular / Aviso de exclusão" className="w-full rounded-md px-3 py-2 text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
            </div>

            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowDelete(false)} className="px-4 py-2 rounded-md text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.muted, cursor: "pointer" }}>Cancelar</button>
              <button onClick={handleDelete} disabled={loading === "delete" || !deleteReason.trim()} className="px-4 py-2 rounded-md text-[12px] font-bold flex items-center gap-2" style={{ background: COLORS.red, color: "#fff", cursor: (loading === "delete" || !deleteReason.trim()) ? "not-allowed" : "pointer", opacity: (loading === "delete" || !deleteReason.trim()) ? 0.5 : 1 }}>
                {loading === "delete" ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {loading === "delete" ? "Processando..." : deleteMode === "delete" ? "Deletar" : "Anonimizar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Dados Exportados */}
      {exportedData && (
        <div className="fixed inset-0 flex items-center justify-center z-[60]" style={{ background: "var(--overlay-modal)" }} onClick={() => setExportedData(null)} onKeyDown={(e) => { if (e.key === "Escape") setExportedData(null); }} role="button" tabIndex={0}>
          <div className="rounded-xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto space-y-4" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} role="button" tabIndex={0}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold" style={{ color: COLORS.green }}><CheckCircle2 size={14} className="inline mr-1" /> Dados Exportados</h2>
              <button onClick={() => setExportedData(null)} className="text-[12px]" style={{ color: COLORS.muted, cursor: "pointer" }}><X size={16} /></button>
            </div>

            <div className="rounded-md p-4 max-h-[60vh] overflow-y-auto" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
              <pre className="text-[10px] whitespace-pre-wrap" style={{ color: COLORS.text }}>
                {JSON.stringify(exportedData, null, 2)}
              </pre>
            </div>

            <div className="flex gap-2 justify-end">
              <button onClick={() => {
                const blob = new Blob([JSON.stringify(exportedData, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `lgpd_export_${Date.now()}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }} className="px-4 py-2 rounded-md text-[12px] font-bold" style={{ background: COLORS.teal, color: COLORS.bg, cursor: "pointer" }}>
                <Download size={12} className="inline" /> Baixar JSON
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  color: "var(--text-muted)",
};
