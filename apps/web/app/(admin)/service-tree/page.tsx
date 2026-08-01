// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState, useMemo, useCallback } from "react";
import {
  GitBranch,
  ChevronRight,
  ChevronDown,
  Server,
  Loader2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Activity,
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

interface ZabbixService {
  serviceid: string;
  name: string;
  description: string;
  status: string;
  sortorder: string;
  parentid?: string;
  children?: ZabbixService[];
  algorithm?: string;
  triggerid?: string;
  goodsla?: string;
}

type ServiceMap = Map<string, ZabbixService & { children: ZabbixService[] }>;

const STATUS_ICONS: Record<string, React.ReactNode> = {
  "0": <CheckCircle2 size={12} style={{ color: COLORS.green }} />,
  "1": <AlertTriangle size={12} style={{ color: COLORS.amber }} />,
  "2": <XCircle size={12} style={{ color: COLORS.red }} />,
  "3": <XCircle size={12} style={{ color: COLORS.red }} />,
  "-1": <Activity size={12} style={{ color: COLORS.muted }} />,
};

const STATUS_LABELS: Record<string, string> = {
  "0": "OK",
  "1": "Degradado",
  "2": "Crítico",
  "3": "Down",
  "-1": "Desconhecido",
};

export default function ServiceTreePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [services, setServices] = useState<ZabbixService[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fetchServices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/zabbix/services", { credentials: "include" });
      if (!res.ok) {
        const data = await res.json();
        setError(data?.error?.message ?? "Erro ao carregar serviços");
        setLoading(false);
        return;
      }
      const data = await res.json();
      const roots = (data.data ?? []) as ZabbixService[];
      setServices(roots);
      // Expande root por padrao
      setExpanded(new Set(roots.map((r) => r.serviceid)));
    } catch {
      setError("Erro de conexão");
    } finally {
      setLoading(false);
    }
  }, []);

  // Carrega filhos de um no sob demanda
  const loadChildren = useCallback(async (parentId: string): Promise<ZabbixService[]> => {
    try {
      const res = await fetch(`/api/v1/zabbix/services?parent_id=${parentId}`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.data ?? []) as ZabbixService[];
    } catch {
      return [];
    }
  }, []);

  const toggleNode = useCallback(async (nodeId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  // Constroi a arvore a partir da lista flat
  const tree = useMemo(() => {
    const buildTree = (nodes: ZabbixService[], depth: number = 0): Array<ZabbixService & { _depth: number }> => {
      const result: Array<ZabbixService & { _depth: number }> = [];
      for (const node of nodes) {
        result.push({ ...node, _depth: depth });
        if (node.children && node.children.length > 0 && expanded.has(node.serviceid)) {
          result.push(...buildTree(node.children, depth + 1));
        }
      }
      return result;
    };
    return buildTree(services);
  }, [services, expanded]);

  // Stats
  const stats = useMemo(() => {
    let ok = 0, degraded = 0, critical = 0, unknown = 0;
    const countStatus = (nodes: ZabbixService[]) => {
      for (const node of nodes) {
        const status = String(node.status ?? "-1");
        if (status === "0") ok++;
        else if (status === "1") degraded++;
        else if (status === "2" || status === "3") critical++;
        else unknown++;
        if (node.children) countStatus(node.children);
      }
    };
    countStatus(services);
    return { ok, degraded, critical, unknown, total: ok + degraded + critical + unknown };
  }, [services]);

  return (
    <div className="min-h-screen p-6 space-y-6" style={{ background: COLORS.bg, fontFamily: "'JetBrains Mono','Consolas',monospace", color: COLORS.text }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold" style={{ color: COLORS.teal }}>
            <GitBranch size={18} className="inline mr-1" /> Service Tree
          </h1>
          <p className="text-[12px]" style={{ color: COLORS.muted }}>
            Árvore hierárquica de serviços de negócio · Zabbix IT Services
          </p>
        </div>
        <button
          onClick={fetchServices}
          disabled={loading}
          className="text-[12px] px-3 py-1.5 rounded font-bold flex items-center gap-2"
          style={{ background: `${COLORS.teal}15`, border: `1px solid ${COLORS.teal}`, color: COLORS.teal, cursor: "pointer", opacity: loading ? 0.5 : 1 }}
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Atualizar
        </button>
      </div>

      {/* Stats */}
      {services.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="Total" value={stats.total} color={COLORS.text} />
          <StatCard label="OK" value={stats.ok} color={COLORS.green} icon={<CheckCircle2 size={14} />} />
          <StatCard label="Degradados" value={stats.degraded} color={COLORS.amber} icon={<AlertTriangle size={14} />} />
          <StatCard label="Críticos" value={stats.critical} color={COLORS.red} icon={<XCircle size={14} />} />
          <StatCard label="Desconhecidos" value={stats.unknown} color={COLORS.muted} />
        </div>
      )}

      {loading && (
        <div className="text-center py-12">
          <Loader2 size={24} className="animate-spin inline" style={{ color: COLORS.teal }} />
          <p className="text-[12px] mt-2" style={{ color: COLORS.muted }}>Carregando árvore de serviços...</p>
        </div>
      )}

      {error && (
        <div className="rounded-xl p-6" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
          <div className="flex items-center gap-3">
            <AlertTriangle size={20} style={{ color: COLORS.amber }} />
            <div>
              <p className="text-sm font-bold" style={{ color: COLORS.text }}>Erro ao carregar</p>
              <p className="text-[11px]" style={{ color: COLORS.muted }}>{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Tree */}
      {!loading && !error && services.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
          <div className="p-4 border-b" style={{ borderColor: COLORS.border }}>
            <h3 className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Hierarquia de Serviços</h3>
          </div>
          <div className="p-2">
            {tree.map((node) => {
              const hasChildren = (node.children?.length ?? 0) > 0;
              const isExpanded = expanded.has(node.serviceid);
              const status = String(node.status ?? "-1");
              return (
                <div
                  key={node.serviceid}
                  className="flex items-center gap-2 py-1.5 px-2 rounded transition-colors hover:bg-[var(--surface-1)]"
                  style={{ paddingLeft: `${8 + node._depth * 24}px` }}
                >
                  {/* Expand/Collapse */}
                  <button
                    onClick={() => hasChildren && toggleNode(node.serviceid)}
                    className="flex items-center justify-center w-5 h-5 rounded flex-shrink-0"
                    style={{ cursor: hasChildren ? "pointer" : "default", opacity: hasChildren ? 1 : 0.3 }}
                  >
                    {hasChildren ? (
                      isExpanded ? <ChevronDown size={14} style={{ color: COLORS.muted }} /> : <ChevronRight size={14} style={{ color: COLORS.muted }} />
                    ) : (
                      <span style={{ width: 14, display: "inline-block" }} />
                    )}
                  </button>

                  {/* Status Icon */}
                  {STATUS_ICONS[status] ?? STATUS_ICONS["-1"]}

                  {/* Name */}
                  <span className="text-[12px] flex-1" style={{ color: COLORS.text, fontWeight: node._depth === 0 ? "bold" : "normal" }}>
                    {node.name}
                  </span>

                  {/* Description */}
                  {node.description && (
                    <span className="text-[10px] truncate max-w-xs hidden md:inline" style={{ color: COLORS.muted }}>
                      {node.description}
                    </span>
                  )}

                  {/* Status Badge */}
                  <span
                    className="px-2 py-0.5 rounded text-[10px] font-bold uppercase flex-shrink-0"
                    style={{
                      background: `${STATUS_ICONS[status] ? (status === "0" ? COLORS.green : status === "1" ? COLORS.amber : status === "2" || status === "3" ? COLORS.red : COLORS.muted) : COLORS.muted}15`,
                      color: status === "0" ? COLORS.green : status === "1" ? COLORS.amber : status === "2" || status === "3" ? COLORS.red : COLORS.muted,
                    }}
                  >
                    {STATUS_LABELS[status] ?? "Desconhecido"}
                  </span>

                  {/* SLA */}
                  {node.goodsla && (
                    <span className="text-[10px] flex-shrink-0" style={{ color: COLORS.muted }}>
                      SLA: {node.goodsla}%
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!loading && !error && services.length === 0 && (
        <div className="rounded-xl p-8 text-center" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
          <Server size={24} className="mx-auto mb-2" style={{ color: COLORS.muted }} />
          <p className="text-sm" style={{ color: COLORS.muted }}>Nenhum serviço configurado no Zabbix</p>
          <p className="text-[10px] mt-1" style={{ color: COLORS.muted }}>Configure IT Services no Zabbix para visualizar a árvore</p>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color, icon }: { label: string; value: number; color: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--surface-2)", border: "1px solid var(--border-default)" }}>
      <div className="text-[10px] font-bold uppercase mb-1 flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
        {icon} {label}
      </div>
      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
    </div>
  );
}
