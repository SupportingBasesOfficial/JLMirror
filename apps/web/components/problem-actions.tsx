// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Monitor,
  LineChart,
  History,
  Ticket,
  Wrench,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { apiFetch } from "@/lib/zabbix-fetch";
import type { ZabbixProblem } from "@repo/zabbix";

interface ProblemActionsProps {
  problem: ZabbixProblem;
  hostId?: string;
  hostName: string;
  onMutate: () => void;
}

// Tempo padrao de manutencao: 1 hora
const DEFAULT_MAINTENANCE_DURATION = 3600;

export function ProblemActions({
  problem,
  hostId,
  hostName,
  onMutate,
}: ProblemActionsProps) {
  const [showTicketForm, setShowTicketForm] = useState(false);
  const [showMaintenanceForm, setShowMaintenanceForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Form state — ticket
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketDescription, setTicketDescription] = useState("");
  const [ticketPriority, setTicketPriority] = useState(2);

  // Form state — maintenance
  const [maintenanceName, setMaintenanceName] = useState("");
  const [maintenanceDuration, setMaintenanceDuration] = useState(
    DEFAULT_MAINTENANCE_DURATION,
  );

  async function handleCreateTicket() {
    if (!ticketSubject.trim() || !ticketDescription.trim()) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      await apiFetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: ticketSubject,
          description: ticketDescription,
          priority: ticketPriority,
          source: "problem",
          metadata: {
            eventid: problem.eventid,
            objectid: problem.objectid,
            severity: problem.severity,
            host: hostName,
            host_id: hostId,
            clock: problem.clock,
          },
        }),
      });
      setFeedback({ type: "success", message: "Ticket criado com sucesso" });
      setShowTicketForm(false);
      setTicketSubject("");
      setTicketDescription("");
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Erro ao criar ticket",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateMaintenance() {
    if (!hostId || !maintenanceName.trim()) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const now = Math.floor(Date.now() / 1000);
      await apiFetch("/api/zabbix/maintenances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: maintenanceName,
          description: `Manutenção criada a partir do problema: ${problem.name}`,
          maintenance_type: 0,
          active_since: now,
          active_till: now + maintenanceDuration,
          hostids: [hostId],
          timeperiods: [
            {
              timeperiod_type: 0,
              start_date: now,
              period: maintenanceDuration,
            },
          ],
        }),
      });
      setFeedback({
        type: "success",
        message: "Host colocado em manutenção",
      });
      setShowMaintenanceForm(false);
      setMaintenanceName("");
      onMutate();
    } catch (err) {
      setFeedback({
        type: "error",
        message:
          err instanceof Error ? err.message : "Erro ao criar manutenção",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const iconSize = 14;
  const linkBaseClass =
    "flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors hover:opacity-80";

  return (
    <div className="space-y-3">
      {/* Feedback */}
      {feedback && (
        <div
          className="flex items-center gap-2 rounded-lg p-2 text-xs"
          style={{
            background:
              feedback.type === "success"
                ? "var(--status-ok-bg)"
                : "var(--status-error-bg)",
            border: `1px solid ${
              feedback.type === "success"
                ? "var(--status-ok-border)"
                : "var(--status-error-border)"
            }`,
            color:
              feedback.type === "success"
                ? "var(--status-ok-text)"
                : "var(--status-error-text)",
          }}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 size={14} />
          ) : (
            <XCircle size={14} />
          )}
          {feedback.message}
          <button
            onClick={() => setFeedback(null)}
            className="ml-auto opacity-60 hover:opacity-100"
          >
            <XCircle size={12} />
          </button>
        </div>
      )}

      {/* Quick links */}
      <div className="flex flex-wrap gap-2">
        {hostId && (
          <Link
            href={`/dashboard/devices/${hostId}`}
            className={linkBaseClass}
            style={{
              background: "var(--surface-3)",
              border: "1px solid var(--border-default)",
              color: "var(--text-primary)",
            }}
          >
            <Monitor size={iconSize} />
            Ver Dispositivo
          </Link>
        )}
        {hostId && (
          <Link
            href={`/dashboard/graphs?host_id=${hostId}`}
            className={linkBaseClass}
            style={{
              background: "var(--surface-3)",
              border: "1px solid var(--border-default)",
              color: "var(--text-primary)",
            }}
          >
            <LineChart size={iconSize} />
            Gráficos
          </Link>
        )}
        {hostId && (
          <Link
            href={`/dashboard/events?host_id=${hostId}`}
            className={linkBaseClass}
            style={{
              background: "var(--surface-3)",
              border: "1px solid var(--border-default)",
              color: "var(--text-primary)",
            }}
          >
            <History size={iconSize} />
            Histórico de Eventos
          </Link>
        )}
        <button
          onClick={() => {
            setShowTicketForm(!showTicketForm);
            setShowMaintenanceForm(false);
            setFeedback(null);
          }}
          className={linkBaseClass}
          style={{
            background: "var(--brand-glow)",
            border: "1px solid var(--brand-primary)",
            color: "var(--brand-primary)",
          }}
        >
          <Ticket size={iconSize} />
          Criar Ticket
        </button>
        {hostId && (
          <button
            onClick={() => {
              setShowMaintenanceForm(!showMaintenanceForm);
              setShowTicketForm(false);
              setFeedback(null);
            }}
            className={linkBaseClass}
            style={{
              background: "var(--status-warning-bg)",
              border: "1px solid var(--status-warning-border)",
              color: "var(--status-warning-text)",
            }}
          >
            <Wrench size={iconSize} />
            Manutenção
          </button>
        )}
      </div>

      {/* Form — Criar Ticket */}
      {showTicketForm && (
        <div
          className="rounded-lg p-3 space-y-2"
          style={{
            background: "var(--surface-3)",
            border: "1px solid var(--border-default)",
          }}
        >
          <input
            type="text"
            placeholder="Assunto do ticket..."
            value={ticketSubject}
            onChange={(e) => setTicketSubject(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-default)",
              color: "var(--text-primary)",
            }}
          />
          <textarea
            placeholder="Descrição do problema..."
            value={ticketDescription}
            onChange={(e) => setTicketDescription(e.target.value)}
            rows={3}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-default)",
              color: "var(--text-primary)",
            }}
          />
          <div className="flex items-center gap-2">
            <select
              value={ticketPriority}
              onChange={(e) => setTicketPriority(Number(e.target.value))}
              className="rounded-lg px-3 py-2 text-sm outline-none"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border-default)",
                color: "var(--text-primary)",
              }}
            >
              <option value={0}>Baixa</option>
              <option value={1}>Normal</option>
              <option value={2}>Média</option>
              <option value={3}>Alta</option>
              <option value={4}>Urgente</option>
            </select>
            <button
              onClick={handleCreateTicket}
              disabled={
                submitting || !ticketSubject.trim() || !ticketDescription.trim()
              }
              className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
              style={{
                background: "var(--brand-primary)",
                color: "var(--surface-0)",
              }}
            >
              {submitting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Ticket size={14} />
              )}
              {submitting ? "Criando..." : "Criar Ticket"}
            </button>
            <button
              onClick={() => setShowTicketForm(false)}
              className="rounded-lg px-3 py-2 text-sm transition-colors hover:opacity-80"
              style={{ color: "var(--text-muted)" }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Form — Manutenção */}
      {showMaintenanceForm && hostId && (
        <div
          className="rounded-lg p-3 space-y-2"
          style={{
            background: "var(--surface-3)",
            border: "1px solid var(--border-default)",
          }}
        >
          <input
            type="text"
            placeholder="Nome da manutenção..."
            value={maintenanceName}
            onChange={(e) => setMaintenanceName(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-default)",
              color: "var(--text-primary)",
            }}
          />
          <div className="flex items-center gap-2">
            <select
              value={maintenanceDuration}
              onChange={(e) => setMaintenanceDuration(Number(e.target.value))}
              className="rounded-lg px-3 py-2 text-sm outline-none"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border-default)",
                color: "var(--text-primary)",
              }}
            >
              <option value={1800}>30 minutos</option>
              <option value={3600}>1 hora</option>
              <option value={7200}>2 horas</option>
              <option value={14400}>4 horas</option>
              <option value={28800}>8 horas</option>
              <option value={86400}>24 horas</option>
            </select>
            <button
              onClick={handleCreateMaintenance}
              disabled={submitting || !maintenanceName.trim()}
              className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
              style={{
                background: "var(--status-warning-text)",
                color: "var(--surface-0)",
              }}
            >
              {submitting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Wrench size={14} />
              )}
              {submitting ? "Criando..." : "Ativar Manutenção"}
            </button>
            <button
              onClick={() => setShowMaintenanceForm(false)}
              className="rounded-lg px-3 py-2 text-sm transition-colors hover:opacity-80"
              style={{ color: "var(--text-muted)" }}
            >
              Cancelar
            </button>
          </div>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            O host <strong>{hostName}</strong> será silenciado durante a
            manutenção. Problemas existentes não serão removidos.
          </p>
        </div>
      )}
    </div>
  );
}
