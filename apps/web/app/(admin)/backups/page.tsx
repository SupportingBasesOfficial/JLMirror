// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState } from "react";
import {RefreshCw, ArrowLeft, Plus } from "lucide-react";
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

const STATUS_COLORS: Record<string, string> = {
  completed: COLORS.green,
  verified: COLORS.teal,
  running: COLORS.blue,
  pending: COLORS.amber,
  failed: COLORS.red,
  corrupted: COLORS.red,
  expired: COLORS.muted,
  verifying: COLORS.amber,
};

const TYPE_COLORS: Record<string, string> = {
  full: COLORS.blue,
  incremental: COLORS.teal,
  differential: COLORS.purple,
  snapshot: COLORS.amber,
};

const DEST_COLORS: Record<string, string> = {
  local: COLORS.muted,
  s3: COLORS.amber,
  sftp: COLORS.blue,
  nfs: COLORS.green,
  azure_blob: COLORS.blue,
  gcs: COLORS.red,
};

interface BackupJob {
  id: string;
  name: string;
  description: string | null;
  target_host: string;
  backup_type: string;
  source_path: string;
  destination_type: string;
  destination_path: string;
  retention_count: number;
  retention_days: number;
  compression: string;
  encryption: boolean;
  is_scheduled: boolean;
  cron_expression: string | null;
  is_active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
}

interface BackupSnapshot {
  id: string;
  job_id: string;
  job_name: string;
  target_host: string;
  snapshot_type: string;
  status: string;
  file_path: string | null;
  file_size_bytes: string;
  compressed_size_bytes: string;
  checksum_sha256: string | null;
  checksum_verified: boolean;
  duration_ms: number | null;
  created_at: string;
}

interface BackupStats {
  jobs: { total: string; active: string; scheduled: string; due_soon: string };
  snapshots: { total: string; completed: string; failed: string; verified: string; corrupted: string; total_size: string; total_compressed: string };
  recent: { id: string; status: string; created_at: string; file_size_bytes: string; compressed_size_bytes: string; duration_ms: number | null; job_name: string }[];
}

function formatBytes(bytes: string | number | null): string {
  if (bytes == null) return "—";
  const n = typeof bytes === "string" ? parseInt(bytes, 10) : bytes;
  if (n === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(n) / Math.log(1024));
   
  return `${(n / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function BackupPage() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tab, setTab] = useState<"jobs" | "snapshots" | "restores">("jobs");
  const [showCreate, setShowCreate] = useState(false);
  const [showRestore, setShowRestore] = useState<BackupSnapshot | null>(null);

  // Form
  const [formName, setFormName] = useState("");
  const [formHost, setFormHost] = useState("");
  const [formType, setFormType] = useState("full");
  const [formSrcPath, setFormSrcPath] = useState("");
  const [formDestType, setFormDestType] = useState("local");
  const [formDestPath, setFormDestPath] = useState("");
  const [formCompression, setFormCompression] = useState("gzip");
  const [formEncryption, setFormEncryption] = useState(true);
  const [formRetention, setFormRetention] = useState(7);
  const [formRetentionDays, setFormRetentionDays] = useState(30);
  const [formScheduled, setFormScheduled] = useState(false);
  const [formCron, setFormCron] = useState("");

  // Restore form
  const [restoreHost, setRestoreHost] = useState("");
  const [restorePath, setRestorePath] = useState("");
  const [restoreOverwrite, setRestoreOverwrite] = useState(false);

  const { data: jData, mutate: mutateJobs } = useApi<{ jobs: BackupJob[] }>("/api/backups/jobs");
  const { data: sData, mutate: mutateSnapshots } = useApi<{ snapshots: BackupSnapshot[] }>("/api/backups/snapshots?limit=50");
  const { data: stats, mutate: mutateStats } = useApi<BackupStats>("/api/backups/stats");

  const jobs = jData?.jobs ?? [];
  const snapshots = sData?.snapshots ?? [];
  const loading = false;

  async function handleCreate() {
    setError(null);
    try {
      const res = await fetch("/api/backups/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: formName,
          target_host: formHost,
          backup_type: formType,
          source_path: formSrcPath,
          destination_type: formDestType,
          destination_path: formDestPath,
          compression: formCompression,
          encryption: formEncryption,
          retention_count: formRetention,
          retention_days: formRetentionDays,
          is_scheduled: formScheduled,
          cron_expression: formCron || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Erro ao criar job");
        return;
      }
      setSuccess("Job de backup criado!");
      setShowCreate(false);
      setFormName(""); setFormHost(""); setFormSrcPath(""); setFormDestPath(""); setFormCron("");
      mutateJobs(); mutateSnapshots(); mutateStats();
    } catch {
      setError("Erro de conexão");
    }
  }

  async function handleRun(jobId: string) {
    try {
      const res = await fetch(`/api/backups/jobs/${jobId}/run`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        setSuccess("Backup executado!");
        mutateJobs(); mutateSnapshots(); mutateStats();
      }
    } catch {
      // Ignora
    }
  }

  async function handleDelete(jobId: string) {
    try {
      const res = await fetch(`/api/backups/jobs/${jobId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        mutateJobs(); mutateSnapshots(); mutateStats();
      }
    } catch {
      // Ignora
    }
  }

  async function handleVerify(snapshotId: string) {
    try {
      const res = await fetch(`/api/backups/snapshots/${snapshotId}/verify`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        setSuccess("Verificação concluída");
        mutateSnapshots();
      }
    } catch {
      // Ignora
    }
  }

  async function handleRestore() {
    if (!showRestore) return;
    setError(null);
    try {
      const res = await fetch("/api/backups/restores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          snapshot_id: showRestore.id,
          target_host: restoreHost,
          target_path: restorePath,
          overwrite_existing: restoreOverwrite,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Erro ao restaurar");
        return;
      }
      setSuccess("Restauração concluída!");
      setShowRestore(null);
      setRestoreHost(""); setRestorePath(""); setRestoreOverwrite(false);
    } catch {
      setError("Erro de conexão");
    }
  }

  return (
    <div
      className="min-h-screen p-6 space-y-6"
      style={{ background: COLORS.bg, fontFamily: "'JetBrains Mono','Consolas',monospace", color: COLORS.text }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold" style={{ color: COLORS.teal }}>
            Backup & Restore — Gerenciamento
          </h1>
          <p className="text-[12px]" style={{ color: COLORS.muted }}>
            Agendamento · Snapshots · Verificação de integridade · Restauração
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCreate(true)}
            className="text-[12px] px-3 py-1.5 rounded font-bold"
            style={{ background: COLORS.teal, color: COLORS.bg, cursor: "pointer" }}
          ><Plus size={12} className="inline" /> Novo Job</button>
          <button
            onClick={() => { mutateJobs(); mutateSnapshots(); mutateStats(); }}
            className="text-[12px] px-3 py-1.5 rounded border"
            style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.muted, cursor: "pointer" }}
          >
            <RefreshCw size={12} className="inline" /> Atualizar
          </button>
          <a
            href="/dashboard"
            className="text-[12px] px-3 py-1.5 rounded border"
            style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.muted }}
          >
            <ArrowLeft size={12} className="inline" /> Dashboard
          </a>
        </div>
      </div>

      {error && (
        <div className="rounded-md p-3 text-sm" style={{ background: `var(--status-error-bg)`, border: `1px solid var(--status-error-border)`, color: COLORS.red }}>
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md p-3 text-sm" style={{ background: `var(--status-ok-bg)`, border: `1px solid var(--status-ok-border)`, color: COLORS.green }}>
          {success}
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
            <div className="text-[10px] uppercase mb-1" style={{ color: COLORS.muted }}>Jobs Ativos</div>
            <div className="text-2xl font-bold" style={{ color: COLORS.teal }}>{stats.jobs.active}</div>
            <div className="text-[10px]" style={{ color: COLORS.muted }}>{stats.jobs.scheduled} agendados</div>
          </div>
          <div className="p-4 rounded-xl" style={{ background: COLORS.card, border: `1px solid var(--status-ok-border)` }}>
            <div className="text-[10px] uppercase mb-1" style={{ color: COLORS.muted }}>Snapshots OK</div>
            <div className="text-2xl font-bold" style={{ color: COLORS.green }}>{stats.snapshots.completed}</div>
            <div className="text-[10px]" style={{ color: COLORS.muted }}>{stats.snapshots.verified} verificados</div>
          </div>
          <div className="p-4 rounded-xl" style={{ background: COLORS.card, border: `1px solid var(--status-warning-border)` }}>
            <div className="text-[10px] uppercase mb-1" style={{ color: COLORS.muted }}>Armazenamento</div>
            <div className="text-2xl font-bold" style={{ color: COLORS.amber }}>{formatBytes(stats.snapshots.total_compressed)}</div>
            <div className="text-[10px]" style={{ color: COLORS.muted }}>original: {formatBytes(stats.snapshots.total_size)}</div>
          </div>
          <div className="p-4 rounded-xl" style={{ background: COLORS.card, border: `1px solid ${stats.snapshots.failed !== "0" || stats.snapshots.corrupted !== "0" ? COLORS.red : COLORS.border}44` }}>
            <div className="text-[10px] uppercase mb-1" style={{ color: COLORS.muted }}>Falhas</div>
            <div className="text-2xl font-bold" style={{ color: stats.snapshots.failed !== "0" || stats.snapshots.corrupted !== "0" ? COLORS.red : COLORS.muted }}>
              {parseInt(stats.snapshots.failed, 10) + parseInt(stats.snapshots.corrupted, 10)}
            </div>
            <div className="text-[10px]" style={{ color: COLORS.muted }}>{stats.snapshots.corrupted} corrompidos</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1">
        {([
          { key: "jobs", label: `Jobs (${jobs.length})` },
          { key: "snapshots", label: `Snapshots (${snapshots.length})` },
          { key: "restores", label: "Restores" },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-4 py-2 rounded-t-md text-[12px] font-bold transition-colors"
            style={{
              background: tab === t.key ? COLORS.card : "transparent",
              border: `1px solid ${COLORS.border}`,
              borderBottom: tab === t.key ? "none" : `1px solid ${COLORS.border}`,
              color: tab === t.key ? COLORS.teal : COLORS.muted,
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Jobs */}
      {tab === "jobs" && (
        <div className="rounded-xl overflow-hidden" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderTop: "none" }}>
          {loading ? (
            <LoadingState label="Carregando backups..." />
          ) : jobs.length === 0 ? (
            <div className="p-8 text-center text-sm" style={{ color: COLORS.muted }}>Nenhum job de backup</div>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Nome</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Host</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Tipo</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Destino</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Compressão</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Cript</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Agendado</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Último run</th>
                  <th className="text-right px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}></th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id} style={{ borderBottom: `1px solid ${COLORS.border}`, opacity: j.is_active ? 1 : 0.4 }}>
                    <td className="px-3 py-2" style={{ color: COLORS.teal }}>{j.name}</td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>{j.target_host}</td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: `${TYPE_COLORS[j.backup_type] ?? COLORS.muted}15`, color: TYPE_COLORS[j.backup_type] ?? COLORS.muted }}>
                        {j.backup_type}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: `${DEST_COLORS[j.destination_type] ?? COLORS.muted}15`, color: DEST_COLORS[j.destination_type] ?? COLORS.muted }}>
                        {j.destination_type}
                      </span>
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>{j.compression}</td>
                    <td className="px-3 py-2" style={{ color: j.encryption ? COLORS.green : COLORS.muted }}>{j.encryption ? "🔒" : "—"}</td>
                    <td className="px-3 py-2" style={{ color: j.is_scheduled ? COLORS.blue : COLORS.muted }}>
                      {j.is_scheduled ? `⏰ ${j.cron_expression ?? ""}` : "manual"}
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>{formatTime(j.last_run_at)}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => handleRun(j.id)} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: `color-mix(in srgb, var(--status-info-text) 12%, transparent)`, border: `1px solid var(--status-info-border)`, color: COLORS.blue, cursor: "pointer" }}>▶</button>
                        <button onClick={() => handleDelete(j.id)} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: `color-mix(in srgb, var(--status-error-text) 12%, transparent)`, border: `1px solid var(--status-error-border)`, color: COLORS.red, cursor: "pointer" }}>✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab: Snapshots */}
      {tab === "snapshots" && (
        <div className="rounded-xl overflow-hidden" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderTop: "none" }}>
          {snapshots.length === 0 ? (
            <div className="p-8 text-center text-sm" style={{ color: COLORS.muted }}>Nenhum snapshot</div>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Job</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Tipo</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Status</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Tamanho</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Comprimido</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Checksum</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Duração</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Quando</th>
                  <th className="text-right px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}></th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((s) => (
                  <tr key={s.id} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <td className="px-3 py-2" style={{ color: COLORS.teal }}>{s.job_name}</td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: `${TYPE_COLORS[s.snapshot_type] ?? COLORS.muted}15`, color: TYPE_COLORS[s.snapshot_type] ?? COLORS.muted }}>
                        {s.snapshot_type}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: `${STATUS_COLORS[s.status] ?? COLORS.muted}15`, color: STATUS_COLORS[s.status] ?? COLORS.muted }}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>{formatBytes(s.file_size_bytes)}</td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>{formatBytes(s.compressed_size_bytes)}</td>
                    <td className="px-3 py-2" style={{ color: s.checksum_verified ? COLORS.green : COLORS.amber }}>
                      {s.checksum_sha256 ? (s.checksum_verified ? "✓ verified" : "⚠ pending") : "—"}
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>{s.duration_ms ? `${s.duration_ms}ms` : "—"}</td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>{formatTime(s.created_at)}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => handleVerify(s.id)} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: `color-mix(in srgb, var(--status-warning-text) 12%, transparent)`, border: `1px solid var(--status-warning-border)`, color: COLORS.amber, cursor: "pointer" }}>✓</button>
                        <button onClick={() => setShowRestore(s)} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: `color-mix(in srgb, var(--status-info-text) 12%, transparent)`, border: `1px solid color-mix(in srgb, var(--status-info-text) 27%, transparent)`, color: COLORS.purple, cursor: "pointer" }}>↩</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab: Restores */}
      {tab === "restores" && (
        <div className="rounded-xl p-8" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderTop: "none" }}>
          <div className="text-center text-sm" style={{ color: COLORS.muted }}>
            Restaurações são listadas no detalhe do job. Use a aba Snapshots para iniciar uma restauração.
          </div>
        </div>
      )}

      {/* Modal: Create job */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "var(--overlay-modal)" }}
          onClick={() => setShowCreate(false)}
          onKeyDown={(e) => { if (e.key === "Escape") setShowCreate(false); }}
          role="button"
          tabIndex={0}
        >
          <div
            className="rounded-xl p-6 max-w-2xl w-full max-h-[85vh] overflow-y-auto"
            style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="presentation"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold" style={{ color: COLORS.teal }}>Novo Job de Backup</h2>
              <button onClick={() => setShowCreate(false)} className="text-[16px]" style={{ color: COLORS.muted, cursor: "pointer" }}>✕</button>
            </div>
            <div className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="bk-name" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Nome</label>
                <input id="bk-name" type="text" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="backup-db-diario" className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label htmlFor="bk-host" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Host</label>
                  <input id="bk-host" type="text" value={formHost} onChange={(e) => setFormHost(e.target.value)} placeholder="server01.local" className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
                </div>
                <div className="space-y-1">
                  <label htmlFor="bk-type" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Tipo</label>
                  <select id="bk-type" value={formType} onChange={(e) => setFormType(e.target.value)} className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}>
                    <option value="full">Full</option>
                    <option value="incremental">Incremental</option>
                    <option value="differential">Differential</option>
                    <option value="snapshot">Snapshot</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label htmlFor="bk-src" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Caminho de Origem</label>
                <input id="bk-src" type="text" value={formSrcPath} onChange={(e) => setFormSrcPath(e.target.value)} placeholder="/var/lib/postgresql/data" className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label htmlFor="bk-dest-type" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Destino</label>
                  <select id="bk-dest-type" value={formDestType} onChange={(e) => setFormDestType(e.target.value)} className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}>
                    <option value="local">Local</option>
                    <option value="s3">S3</option>
                    <option value="sftp">SFTP</option>
                    <option value="nfs">NFS</option>
                    <option value="azure_blob">Azure Blob</option>
                    <option value="gcs">GCS</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="bk-dest-path" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Caminho de Destino</label>
                  <input id="bk-dest-path" type="text" value={formDestPath} onChange={(e) => setFormDestPath(e.target.value)} placeholder="/backups/db" className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label htmlFor="bk-comp" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Compressão</label>
                  <select id="bk-comp" value={formCompression} onChange={(e) => setFormCompression(e.target.value)} className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}>
                    <option value="gzip">gzip</option>
                    <option value="zstd">zstd</option>
                    <option value="bzip2">bzip2</option>
                    <option value="lz4">lz4</option>
                    <option value="none">none</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="bk-ret" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Retenção (count)</label>
                  <input id="bk-ret" type="number" value={formRetention} onChange={(e) => setFormRetention(parseInt(e.target.value, 10) || 7)} className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
                </div>
                <div className="space-y-1">
                  <label htmlFor="bk-ret-days" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Retenção (dias)</label>
                  <input id="bk-ret-days" type="number" value={formRetentionDays} onChange={(e) => setFormRetentionDays(parseInt(e.target.value, 10) || 30)} className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-[12px]" style={{ color: COLORS.text }}>
                <input type="checkbox" checked={formEncryption} onChange={(e) => setFormEncryption(e.target.checked)} />
                Criptografia
              </label>
              <label className="flex items-center gap-2 text-[12px]" style={{ color: COLORS.text }}>
                <input type="checkbox" checked={formScheduled} onChange={(e) => setFormScheduled(e.target.checked)} />
                Agendado (cron)
              </label>
              {formScheduled && (
                <div className="space-y-1">
                  <label htmlFor="bk-cron" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Cron Expression</label>
                  <input id="bk-cron" type="text" value={formCron} onChange={(e) => setFormCron(e.target.value)} placeholder="0 2 * * *" className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
                </div>
              )}
              <button
                onClick={handleCreate}
                disabled={!formName || !formHost || !formSrcPath || !formDestPath}
                className="w-full rounded-md py-2.5 text-sm font-bold disabled:opacity-50"
                style={{ background: COLORS.teal, color: COLORS.bg, cursor: !formName || !formHost || !formSrcPath || !formDestPath ? "not-allowed" : "pointer" }}
              >
                Criar Job
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Restore */}
      {showRestore && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "var(--overlay-modal)" }}
          onClick={() => setShowRestore(null)}
          onKeyDown={(e) => { if (e.key === "Escape") setShowRestore(null); }}
          role="button"
          tabIndex={0}
        >
          <div
            className="rounded-xl p-6 max-w-md w-full"
            style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="presentation"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold" style={{ color: COLORS.purple }}>Restaurar Snapshot</h2>
              <button onClick={() => setShowRestore(null)} className="text-[16px]" style={{ color: COLORS.muted, cursor: "pointer" }}>✕</button>
            </div>
            <div className="space-y-3 text-[12px] mb-4">
              <div className="flex justify-between">
                <span style={{ color: COLORS.muted }}>Job:</span>
                <span style={{ color: COLORS.text }}>{showRestore.job_name}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: COLORS.muted }}>Tamanho:</span>
                <span style={{ color: COLORS.text }}>{formatBytes(showRestore.file_size_bytes)}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: COLORS.muted }}>Checksum:</span>
                <span style={{ color: showRestore.checksum_verified ? COLORS.green : COLORS.amber }}>
                  {showRestore.checksum_verified ? "✓ verificado" : "⚠ não verificado"}
                </span>
              </div>
            </div>
            <div className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="rs-host" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Host de Destino</label>
                <input id="rs-host" type="text" value={restoreHost} onChange={(e) => setRestoreHost(e.target.value)} placeholder="server02.local" className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
              </div>
              <div className="space-y-1">
                <label htmlFor="rs-path" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Caminho de Destino</label>
                <input id="rs-path" type="text" value={restorePath} onChange={(e) => setRestorePath(e.target.value)} placeholder="/var/lib/postgresql/data" className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
              </div>
              <label className="flex items-center gap-2 text-[12px]" style={{ color: COLORS.text }}>
                <input type="checkbox" checked={restoreOverwrite} onChange={(e) => setRestoreOverwrite(e.target.checked)} />
                Sobrescrever existente
              </label>
              <button
                onClick={handleRestore}
                disabled={!restoreHost || !restorePath}
                className="w-full rounded-md py-2.5 text-sm font-bold disabled:opacity-50"
                style={{ background: COLORS.purple, color: "#fff", cursor: !restoreHost || !restorePath ? "not-allowed" : "pointer" }}
              >
                Restaurar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
