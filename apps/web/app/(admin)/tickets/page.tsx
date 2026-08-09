// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState } from "react";
import { RefreshCw, ArrowLeft, Plus } from "lucide-react";
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

const STATUSES = [
  "open",
  "in_progress",
  "waiting_customer",
  "resolved",
  "closed",
  "cancelled",
];
const PRIORITIES = ["urgent", "high", "medium", "low"];

const STATUS_COLORS: Record<string, string> = {
  open: COLORS.blue,
  in_progress: COLORS.teal,
  waiting_customer: COLORS.amber,
  resolved: COLORS.green,
  closed: COLORS.muted,
  cancelled: COLORS.muted,
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: COLORS.red,
  high: COLORS.amber,
  medium: COLORS.blue,
  low: COLORS.muted,
};

interface TicketCategory {
  id: string;
  name: string;
  description: string | null;
  color: string;
  sla_response_hours: number;
  sla_resolution_hours: number;
  is_active: boolean;
}

interface Ticket {
  id: string;
  ticket_number: string;
  category_id: string | null;
  category_name: string | null;
  category_color: string | null;
  subject: string;
  description: string;
  status: string;
  priority: string;
  source: string;
  requester_name: string;
  requester_email: string;
  requester_phone: string | null;
  assigned_name: string | null;
  tags: string[];
  sla_response_due: string | null;
  sla_resolution_due: string | null;
  is_overdue: boolean;
  rating: number | null;
  created_at: string;
}

interface Comment {
  id: string;
  author_name: string;
  author_type: string;
  body: string;
  is_internal: boolean;
  created_at: string;
}

interface TicketStats {
  total: string;
  by_status: { status: string; count: string }[];
  by_priority: { priority: string; count: string }[];
  sla: {
    overdue: string;
    open_tickets: string;
    avg_response_mins: string | null;
    avg_resolution_mins: string | null;
    avg_rating: string | null;
  };
  by_category: {
    name: string;
    color: string;
    ticket_count: string;
    open_count: string;
  }[];
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMins(mins: string | null): string {
  if (!mins) return "—";
  const n = parseFloat(mins);
  if (n < 60) return `${n.toFixed(0)}m`;
  if (n < 1440) return `${(n / 60).toFixed(1)}h`;
  return `${(n / 1440).toFixed(1)}d`;
}

export default function TicketsPage() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tab, setTab] = useState<"list" | "categories">("list");
  const [showCreate, setShowCreate] = useState(false);
  const [showCategory, setShowCategory] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [commentInternal, setCommentInternal] = useState(false);

  // Filters
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [search, setSearch] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);

  // Ticket form
  const [tSubject, setTSubject] = useState("");
  const [tDesc, setTDesc] = useState("");
  const [tPriority, setTPriority] = useState("medium");
  const [tCategory, setTCategory] = useState("");
  const [tRequesterName, setTRequesterName] = useState("");
  const [tRequesterEmail, setTRequesterEmail] = useState("");
  const [tRequesterPhone, setTRequesterPhone] = useState("");

  // Category form
  const [cName, setCName] = useState("");
  const [cDesc, setCDesc] = useState("");
  const [cColor, setCColor] = useState("#1BA898");
  const [cSlaResp, setCSlaResp] = useState(4);
  const [cSlaRes, setCSlaRes] = useState(48);

  const ticketParams = new URLSearchParams();
  if (filterStatus) ticketParams.set("status", filterStatus);
  if (filterPriority) ticketParams.set("priority", filterPriority);
  if (search) ticketParams.set("search", search);
  if (overdueOnly) ticketParams.set("overdue", "true");

  const { data: tData, mutate: mutateTickets } = useApi<{ tickets: Ticket[] }>(
    `/api/tickets?${ticketParams.toString()}`,
  );
  const { data: cData, mutate: mutateCategories } = useApi<{
    categories: TicketCategory[];
  }>("/api/tickets/categories");
  const { data: stats, mutate: mutateStats } =
    useApi<TicketStats>("/api/tickets/stats");

  const tickets = tData?.tickets ?? [];
  const categories = cData?.categories ?? [];

  async function handleCreateTicket() {
    setError(null);
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          subject: tSubject,
          description: tDesc,
          priority: tPriority,
          category_id: tCategory || undefined,
          source: "web",
          requester_name: tRequesterName,
          requester_email: tRequesterEmail,
          requester_phone: tRequesterPhone || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Erro ao criar ticket");
        return;
      }
      setSuccess(`Ticket ${data.ticket_number} criado!`);
      setShowCreate(false);
      setTSubject("");
      setTDesc("");
      setTRequesterName("");
      setTRequesterEmail("");
      setTRequesterPhone("");
      mutateTickets();
      mutateStats();
    } catch {
      setError("Erro de conexão");
    }
  }

  async function handleSelectTicket(ticket: Ticket) {
    setSelectedTicket(ticket);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setComments(data.comments ?? []);
      }
    } catch (err) {
      console.error("Operacao falhou:", err);
      setError("Erro ao carregar comentários do ticket");
    }
  }

  async function handleUpdateStatus(ticketId: string, status: string) {
    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        if (selectedTicket?.id === ticketId) {
          setSelectedTicket({ ...selectedTicket, status });
        }
        mutateTickets();
        mutateStats();
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error?.message ?? "Erro ao atualizar status");
      }
    } catch (err) {
      console.error("Operacao falhou:", err);
      setError("Erro de conexão ao atualizar status");
    }
  }

  async function handleAddComment() {
    if (!selectedTicket || !newComment) return;
    try {
      const res = await fetch(`/api/tickets/${selectedTicket.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          body: newComment,
          is_internal: commentInternal,
        }),
      });
      if (res.ok) {
        setNewComment("");
        setCommentInternal(false);
        handleSelectTicket(selectedTicket);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error?.message ?? "Erro ao adicionar comentário");
      }
    } catch (err) {
      console.error("Operacao falhou:", err);
      setError("Erro de conexão ao adicionar comentário");
    }
  }

  async function handleCreateCategory() {
    setError(null);
    try {
      const res = await fetch("/api/tickets/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: cName,
          description: cDesc || undefined,
          color: cColor,
          sla_response_hours: cSlaResp,
          sla_resolution_hours: cSlaRes,
          is_active: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Erro ao criar categoria");
        return;
      }
      setSuccess("Categoria criada!");
      setShowCategory(false);
      setCName("");
      setCDesc("");
      mutateCategories();
    } catch {
      setError("Erro de conexão");
    }
  }

  async function handleDeleteCategory(id: string) {
    try {
      const res = await fetch(`/api/tickets/categories/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        mutateCategories();
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error?.message ?? "Erro ao excluir categoria");
      }
    } catch (err) {
      console.error("Operacao falhou:", err);
      setError("Erro de conexão ao excluir categoria");
    }
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
            Helpdesk — Tickets & SLA
          </h1>
          <p className="text-[12px]" style={{ color: COLORS.muted }}>
            Categorias · Prioridades · SLA · Comentários · Avaliação
          </p>
        </div>
        <div className="flex gap-2">
          {tab === "list" && (
            <button
              onClick={() => setShowCreate(true)}
              className="text-[12px] px-3 py-1.5 rounded font-bold"
              style={{
                background: COLORS.teal,
                color: COLORS.bg,
                cursor: "pointer",
              }}
            >
              <Plus size={12} className="inline" /> Ticket
            </button>
          )}
          {tab === "categories" && (
            <button
              onClick={() => setShowCategory(true)}
              className="text-[12px] px-3 py-1.5 rounded font-bold"
              style={{
                background: COLORS.teal,
                color: COLORS.bg,
                cursor: "pointer",
              }}
            >
              <Plus size={12} className="inline" /> Categoria
            </button>
          )}
          <button
            onClick={() => {
              mutateTickets();
              mutateCategories();
              mutateStats();
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

      {error && (
        <div
          className="rounded-md p-3 text-sm"
          style={{
            background: `var(--status-error-bg)`,
            border: `1px solid var(--status-error-border)`,
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
            background: `var(--status-ok-bg)`,
            border: `1px solid var(--status-ok-border)`,
            color: COLORS.green,
          }}
        >
          {success}
        </div>
      )}

      {/* Stats */}
      {stats && (
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
              Total Tickets
            </div>
            <div className="text-2xl font-bold" style={{ color: COLORS.teal }}>
              {stats.total}
            </div>
            <div className="text-[10px]" style={{ color: COLORS.muted }}>
              {stats.sla.open_tickets} abertos
            </div>
          </div>
          <div
            className="p-4 rounded-xl"
            style={{
              background: COLORS.card,
              border: `1px solid var(--status-error-border)`,
            }}
          >
            <div
              className="text-[10px] uppercase mb-1"
              style={{ color: COLORS.muted }}
            >
              Overdue
            </div>
            <div className="text-2xl font-bold" style={{ color: COLORS.red }}>
              {stats.sla.overdue}
            </div>
          </div>
          <div
            className="p-4 rounded-xl"
            style={{
              background: COLORS.card,
              border: `1px solid var(--status-info-border)`,
            }}
          >
            <div
              className="text-[10px] uppercase mb-1"
              style={{ color: COLORS.muted }}
            >
              Tempo Resposta
            </div>
            <div className="text-2xl font-bold" style={{ color: COLORS.blue }}>
              {formatMins(stats.sla.avg_response_mins)}
            </div>
            <div className="text-[10px]" style={{ color: COLORS.muted }}>
              Resolução: {formatMins(stats.sla.avg_resolution_mins)}
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
              Avaliação
            </div>
            <div className="text-2xl font-bold" style={{ color: COLORS.amber }}>
              {stats.sla.avg_rating
                ? `${parseFloat(stats.sla.avg_rating).toFixed(1)}★`
                : "—"}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1">
        {(
          [
            { key: "list", label: `Tickets (${tickets.length})` },
            { key: "categories", label: `Categorias (${categories.length})` },
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

      {/* Tab: Tickets list */}
      {tab === "list" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1 flex-1 min-w-[200px]">
              <label
                htmlFor="t-search"
                className="text-[11px] font-bold uppercase"
                style={{ color: COLORS.muted }}
              >
                Buscar
              </label>
              <input
                id="t-search"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="número, assunto, solicitante..."
                className="w-full rounded-md px-3 py-1.5 text-[13px]"
                style={{
                  background: COLORS.card,
                  border: `1px solid ${COLORS.border}`,
                  color: COLORS.text,
                }}
              />
            </div>
            <div className="space-y-1">
              <label
                htmlFor="t-fstatus"
                className="text-[11px] font-bold uppercase"
                style={{ color: COLORS.muted }}
              >
                Status
              </label>
              <select
                id="t-fstatus"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="rounded-md px-3 py-1.5 text-[12px]"
                style={{
                  background: COLORS.card,
                  border: `1px solid ${COLORS.border}`,
                  color: COLORS.text,
                }}
              >
                <option value="">Todos</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label
                htmlFor="t-fprio"
                className="text-[11px] font-bold uppercase"
                style={{ color: COLORS.muted }}
              >
                Prioridade
              </label>
              <select
                id="t-fprio"
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                className="rounded-md px-3 py-1.5 text-[12px]"
                style={{
                  background: COLORS.card,
                  border: `1px solid ${COLORS.border}`,
                  color: COLORS.text,
                }}
              >
                <option value="">Todas</option>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <label
              className="flex items-center gap-2 text-[12px] pb-1.5"
              style={{ color: COLORS.text }}
            >
              <input
                type="checkbox"
                checked={overdueOnly}
                onChange={(e) => setOverdueOnly(e.target.checked)}
              />
              Apenas overdue
            </label>
          </div>

          {/* Table */}
          <div
            className="rounded-xl overflow-hidden"
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
            }}
          >
            {tickets.length === 0 ? (
              <div
                className="p-8 text-center text-sm"
                style={{ color: COLORS.muted }}
              >
                Nenhum ticket encontrado
              </div>
            ) : (
              <table className="w-full text-[12px]">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <th
                      className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                      style={{ color: COLORS.muted }}
                    >
                      Nº
                    </th>
                    <th
                      className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                      style={{ color: COLORS.muted }}
                    >
                      Assunto
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
                      Prioridade
                    </th>
                    <th
                      className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                      style={{ color: COLORS.muted }}
                    >
                      Solicitante
                    </th>
                    <th
                      className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                      style={{ color: COLORS.muted }}
                    >
                      Atribuído
                    </th>
                    <th
                      className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                      style={{ color: COLORS.muted }}
                    >
                      SLA
                    </th>
                    <th
                      className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                      style={{ color: COLORS.muted }}
                    >
                      Criado
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((t) => (
                    <tr
                      key={t.id}
                      style={{
                        borderBottom: `1px solid ${COLORS.border}`,
                        cursor: "pointer",
                      }}
                      onClick={() => handleSelectTicket(t)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSelectTicket(t);
                      }}
                    >
                      <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                        {t.ticket_number}
                      </td>
                      <td
                        className="px-3 py-2 max-w-[200px] truncate"
                        style={{ color: COLORS.teal }}
                      >
                        {t.is_overdue && (
                          <span style={{ color: COLORS.red }}>⚠ </span>
                        )}
                        {t.subject}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                          style={{
                            background: `${STATUS_COLORS[t.status] ?? COLORS.muted}15`,
                            color: STATUS_COLORS[t.status] ?? COLORS.muted,
                          }}
                        >
                          {t.status}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                          style={{
                            background: `${PRIORITY_COLORS[t.priority] ?? COLORS.muted}15`,
                            color: PRIORITY_COLORS[t.priority] ?? COLORS.muted,
                          }}
                        >
                          {t.priority}
                        </span>
                      </td>
                      <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                        {t.requester_name}
                      </td>
                      <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                        {t.assigned_name ?? "—"}
                      </td>
                      <td
                        className="px-3 py-2"
                        style={{
                          color: t.is_overdue ? COLORS.red : COLORS.muted,
                        }}
                      >
                        {formatTime(t.sla_resolution_due)}
                      </td>
                      <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                        {formatTime(t.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Tab: Categories */}
      {tab === "categories" && (
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderTop: "none",
          }}
        >
          {categories.length === 0 ? (
            <div
              className="p-8 text-center text-sm"
              style={{ color: COLORS.muted }}
            >
              Nenhuma categoria configurada
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
                    Cor
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    SLA Resposta
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    SLA Resolução
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Ativo
                  </th>
                  <th
                    className="text-right px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  ></th>
                </tr>
              </thead>
              <tbody>
                {categories.map((cat) => (
                  <tr
                    key={cat.id}
                    style={{
                      borderBottom: `1px solid ${COLORS.border}`,
                      opacity: cat.is_active ? 1 : 0.4,
                    }}
                  >
                    <td className="px-3 py-2" style={{ color: COLORS.teal }}>
                      <span
                        className="inline-block w-3 h-3 rounded-full mr-2"
                        style={{ background: cat.color }}
                      />
                      {cat.name}
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                      {cat.color}
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.amber }}>
                      {cat.sla_response_hours}h
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.amber }}>
                      {cat.sla_resolution_hours}h
                    </td>
                    <td
                      className="px-3 py-2"
                      style={{
                        color: cat.is_active ? COLORS.green : COLORS.muted,
                      }}
                    >
                      {cat.is_active ? "✓" : "✕"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => handleDeleteCategory(cat.id)}
                        className="px-2 py-1 rounded text-[10px] font-bold"
                        style={{
                          background: `color-mix(in srgb, var(--status-error-text) 12%, transparent)`,
                          border: `1px solid var(--status-error-border)`,
                          color: COLORS.red,
                          cursor: "pointer",
                        }}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modal: Ticket detail */}
      {selectedTicket && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "var(--overlay-modal)" }}
          onClick={() => {
            setSelectedTicket(null);
            setComments([]);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setSelectedTicket(null);
              setComments([]);
            }
          }}
          role="button"
          tabIndex={0}
        >
          <div
            className="rounded-xl p-6 max-w-2xl w-full max-h-[85vh] overflow-y-auto"
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
            }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="presentation"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2
                  className="text-sm font-bold"
                  style={{ color: COLORS.teal }}
                >
                  {selectedTicket.ticket_number} — {selectedTicket.subject}
                </h2>
                <div className="flex gap-2 mt-1">
                  <span
                    className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                    style={{
                      background: `${STATUS_COLORS[selectedTicket.status] ?? COLORS.muted}15`,
                      color:
                        STATUS_COLORS[selectedTicket.status] ?? COLORS.muted,
                    }}
                  >
                    {selectedTicket.status}
                  </span>
                  <span
                    className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                    style={{
                      background: `${PRIORITY_COLORS[selectedTicket.priority] ?? COLORS.muted}15`,
                      color:
                        PRIORITY_COLORS[selectedTicket.priority] ??
                        COLORS.muted,
                    }}
                  >
                    {selectedTicket.priority}
                  </span>
                  {selectedTicket.is_overdue && (
                    <span
                      className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                      style={{
                        background: `var(--status-error-bg)`,
                        color: COLORS.red,
                      }}
                    >
                      OVERDUE
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedTicket(null);
                  setComments([]);
                }}
                className="text-[16px]"
                style={{ color: COLORS.muted, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            {/* Ticket info */}
            <div className="grid grid-cols-2 gap-3 mb-4 text-[12px]">
              <div className="flex justify-between">
                <span style={{ color: COLORS.muted }}>Solicitante:</span>
                <span style={{ color: COLORS.text }}>
                  {selectedTicket.requester_name}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: COLORS.muted }}>Email:</span>
                <span style={{ color: COLORS.text }}>
                  {selectedTicket.requester_email}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: COLORS.muted }}>Telefone:</span>
                <span style={{ color: COLORS.text }}>
                  {selectedTicket.requester_phone ?? "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: COLORS.muted }}>Atribuído:</span>
                <span style={{ color: COLORS.text }}>
                  {selectedTicket.assigned_name ?? "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: COLORS.muted }}>SLA Resposta:</span>
                <span style={{ color: COLORS.amber }}>
                  {formatTime(selectedTicket.sla_response_due)}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: COLORS.muted }}>SLA Resolução:</span>
                <span
                  style={{
                    color: selectedTicket.is_overdue
                      ? COLORS.red
                      : COLORS.amber,
                  }}
                >
                  {formatTime(selectedTicket.sla_resolution_due)}
                </span>
              </div>
            </div>

            {/* Description */}
            <div
              className="mb-4 p-3 rounded-md"
              style={{
                background: COLORS.bg,
                border: `1px solid ${COLORS.border}`,
              }}
            >
              <div
                className="text-[10px] uppercase mb-1"
                style={{ color: COLORS.muted }}
              >
                Descrição
              </div>
              <div
                className="text-[12px] whitespace-pre-wrap"
                style={{ color: COLORS.text }}
              >
                {selectedTicket.description}
              </div>
            </div>

            {/* Status actions */}
            <div className="mb-4 flex flex-wrap gap-1">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => handleUpdateStatus(selectedTicket.id, s)}
                  className="px-2 py-1 rounded text-[10px] font-bold uppercase"
                  style={{
                    background:
                      selectedTicket.status === s
                        ? `${STATUS_COLORS[s] ?? COLORS.muted}20`
                        : "transparent",

                    border: `1px solid ${STATUS_COLORS[s] ?? COLORS.muted}44`,

                    color: STATUS_COLORS[s] ?? COLORS.muted,
                    cursor: "pointer",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Comments */}
            <div className="mb-4">
              <div
                className="text-[10px] uppercase mb-2"
                style={{ color: COLORS.muted }}
              >
                Comentários ({comments.length})
              </div>
              <div className="space-y-2 mb-3">
                {comments.map((cm) => (
                  <div
                    key={cm.id}
                    className="p-2 rounded-md"
                    style={{
                      background: COLORS.bg,
                      border: `1px solid ${cm.is_internal ? COLORS.amber : COLORS.border}`,
                    }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className="text-[11px] font-bold"
                        style={{
                          color:
                            cm.author_type === "system"
                              ? COLORS.muted
                              : cm.author_type === "requester"
                                ? COLORS.blue
                                : COLORS.teal,
                        }}
                      >
                        {cm.author_name}
                        {cm.is_internal && (
                          <span style={{ color: COLORS.amber }}>
                            {" "}
                            · interno
                          </span>
                        )}
                      </span>
                      <span
                        className="text-[10px]"
                        style={{ color: COLORS.muted }}
                      >
                        {formatTime(cm.created_at)}
                      </span>
                    </div>
                    <div
                      className="text-[12px] whitespace-pre-wrap"
                      style={{ color: COLORS.text }}
                    >
                      {cm.body}
                    </div>
                  </div>
                ))}
                {comments.length === 0 && (
                  <div className="text-[12px]" style={{ color: COLORS.muted }}>
                    Nenhum comentário
                  </div>
                )}
              </div>

              {/* Add comment */}
              <div className="space-y-2">
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  rows={2}
                  placeholder="Adicionar comentário..."
                  className="w-full rounded-md px-3 py-2 text-[12px]"
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text,
                  }}
                />
                <div className="flex items-center justify-between">
                  <label
                    className="flex items-center gap-2 text-[11px]"
                    style={{ color: COLORS.text }}
                  >
                    <input
                      type="checkbox"
                      checked={commentInternal}
                      onChange={(e) => setCommentInternal(e.target.checked)}
                    />
                    Interno
                  </label>
                  <button
                    onClick={handleAddComment}
                    disabled={!newComment}
                    className="px-3 py-1.5 rounded text-[12px] font-bold disabled:opacity-50"
                    style={{
                      background: COLORS.teal,
                      color: COLORS.bg,
                      cursor: !newComment ? "not-allowed" : "pointer",
                    }}
                  >
                    Enviar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Create ticket */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "var(--overlay-modal)" }}
          onClick={() => setShowCreate(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setShowCreate(false);
          }}
          role="button"
          tabIndex={0}
        >
          <div
            className="rounded-xl p-6 max-w-md w-full max-h-[85vh] overflow-y-auto"
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
            }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="presentation"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold" style={{ color: COLORS.teal }}>
                Novo Ticket
              </h2>
              <button
                onClick={() => setShowCreate(false)}
                className="text-[16px]"
                style={{ color: COLORS.muted, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>
            <div className="space-y-4">
              <div className="space-y-1">
                <label
                  htmlFor="tk-sub"
                  className="text-[11px] font-bold uppercase"
                  style={{ color: COLORS.muted }}
                >
                  Assunto
                </label>
                <input
                  id="tk-sub"
                  type="text"
                  value={tSubject}
                  onChange={(e) => setTSubject(e.target.value)}
                  placeholder="Problema com servidor X"
                  className="w-full rounded-md px-3 py-2 text-[13px]"
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text,
                  }}
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="tk-desc"
                  className="text-[11px] font-bold uppercase"
                  style={{ color: COLORS.muted }}
                >
                  Descrição
                </label>
                <textarea
                  id="tk-desc"
                  value={tDesc}
                  onChange={(e) => setTDesc(e.target.value)}
                  rows={4}
                  placeholder="Descreva o problema..."
                  className="w-full rounded-md px-3 py-2 text-[12px]"
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text,
                  }}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label
                    htmlFor="tk-prio"
                    className="text-[11px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    Prioridade
                  </label>
                  <select
                    id="tk-prio"
                    value={tPriority}
                    onChange={(e) => setTPriority(e.target.value)}
                    className="w-full rounded-md px-3 py-2 text-[12px]"
                    style={{
                      background: COLORS.bg,
                      border: `1px solid ${COLORS.border}`,
                      color: COLORS.text,
                    }}
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="tk-cat"
                    className="text-[11px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    Categoria
                  </label>
                  <select
                    id="tk-cat"
                    value={tCategory}
                    onChange={(e) => setTCategory(e.target.value)}
                    className="w-full rounded-md px-3 py-2 text-[12px]"
                    style={{
                      background: COLORS.bg,
                      border: `1px solid ${COLORS.border}`,
                      color: COLORS.text,
                    }}
                  >
                    <option value="">Sem categoria</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="tk-rname"
                  className="text-[11px] font-bold uppercase"
                  style={{ color: COLORS.muted }}
                >
                  Nome do Solicitante
                </label>
                <input
                  id="tk-rname"
                  type="text"
                  value={tRequesterName}
                  onChange={(e) => setTRequesterName(e.target.value)}
                  className="w-full rounded-md px-3 py-2 text-[13px]"
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text,
                  }}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label
                    htmlFor="tk-remail"
                    className="text-[11px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    Email
                  </label>
                  <input
                    id="tk-remail"
                    type="email"
                    value={tRequesterEmail}
                    onChange={(e) => setTRequesterEmail(e.target.value)}
                    className="w-full rounded-md px-3 py-2 text-[13px]"
                    style={{
                      background: COLORS.bg,
                      border: `1px solid ${COLORS.border}`,
                      color: COLORS.text,
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="tk-rphone"
                    className="text-[11px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    Telefone (opcional)
                  </label>
                  <input
                    id="tk-rphone"
                    type="text"
                    value={tRequesterPhone}
                    onChange={(e) => setTRequesterPhone(e.target.value)}
                    className="w-full rounded-md px-3 py-2 text-[13px]"
                    style={{
                      background: COLORS.bg,
                      border: `1px solid ${COLORS.border}`,
                      color: COLORS.text,
                    }}
                  />
                </div>
              </div>
              <button
                onClick={handleCreateTicket}
                disabled={
                  !tSubject || !tDesc || !tRequesterName || !tRequesterEmail
                }
                className="w-full rounded-md py-2.5 text-sm font-bold disabled:opacity-50"
                style={{
                  background: COLORS.teal,
                  color: COLORS.bg,
                  cursor:
                    !tSubject || !tDesc || !tRequesterName || !tRequesterEmail
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                Criar Ticket
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Create category */}
      {showCategory && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "var(--overlay-modal)" }}
          onClick={() => setShowCategory(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setShowCategory(false);
          }}
          role="button"
          tabIndex={0}
        >
          <div
            className="rounded-xl p-6 max-w-md w-full"
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
            }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="presentation"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold" style={{ color: COLORS.teal }}>
                Nova Categoria
              </h2>
              <button
                onClick={() => setShowCategory(false)}
                className="text-[16px]"
                style={{ color: COLORS.muted, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>
            <div className="space-y-4">
              <div className="space-y-1">
                <label
                  htmlFor="c-nm"
                  className="text-[11px] font-bold uppercase"
                  style={{ color: COLORS.muted }}
                >
                  Nome
                </label>
                <input
                  id="c-nm"
                  type="text"
                  value={cName}
                  onChange={(e) => setCName(e.target.value)}
                  placeholder="Rede"
                  className="w-full rounded-md px-3 py-2 text-[13px]"
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text,
                  }}
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="c-dc"
                  className="text-[11px] font-bold uppercase"
                  style={{ color: COLORS.muted }}
                >
                  Descrição (opcional)
                </label>
                <input
                  id="c-dc"
                  type="text"
                  value={cDesc}
                  onChange={(e) => setCDesc(e.target.value)}
                  className="w-full rounded-md px-3 py-2 text-[13px]"
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text,
                  }}
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="c-cl"
                  className="text-[11px] font-bold uppercase"
                  style={{ color: COLORS.muted }}
                >
                  Cor
                </label>
                <input
                  id="c-cl"
                  type="color"
                  value={cColor}
                  onChange={(e) => setCColor(e.target.value)}
                  className="w-full h-10 rounded-md"
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                    cursor: "pointer",
                  }}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label
                    htmlFor="c-sr"
                    className="text-[11px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    SLA Resposta (h)
                  </label>
                  <input
                    id="c-sr"
                    type="number"
                    value={cSlaResp}
                    onChange={(e) =>
                      setCSlaResp(parseInt(e.target.value, 10) || 4)
                    }
                    className="w-full rounded-md px-3 py-2 text-[13px]"
                    style={{
                      background: COLORS.bg,
                      border: `1px solid ${COLORS.border}`,
                      color: COLORS.text,
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="c-sl"
                    className="text-[11px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    SLA Resolução (h)
                  </label>
                  <input
                    id="c-sl"
                    type="number"
                    value={cSlaRes}
                    onChange={(e) =>
                      setCSlaRes(parseInt(e.target.value, 10) || 48)
                    }
                    className="w-full rounded-md px-3 py-2 text-[13px]"
                    style={{
                      background: COLORS.bg,
                      border: `1px solid ${COLORS.border}`,
                      color: COLORS.text,
                    }}
                  />
                </div>
              </div>
              <button
                onClick={handleCreateCategory}
                disabled={!cName}
                className="w-full rounded-md py-2.5 text-sm font-bold disabled:opacity-50"
                style={{
                  background: COLORS.teal,
                  color: COLORS.bg,
                  cursor: !cName ? "not-allowed" : "pointer",
                }}
              >
                Criar Categoria
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
