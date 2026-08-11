// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useEffect, useState, useCallback } from "react";

// Severidades classicas do Zabbix
export type IncidentSeverity =
  "disaster" | "critical" | "high" | "average" | "warning" | "information";

export interface SidebarBadges {
  incidents: {
    total: number;
    bySeverity: Record<IncidentSeverity, number>;
  };
  tickets: number;
  tasks: number;
}

const EMPTY_BADGES: SidebarBadges = {
  incidents: {
    total: 0,
    bySeverity: {
      disaster: 0,
      critical: 0,
      high: 0,
      average: 0,
      warning: 0,
      information: 0,
    },
  },
  tickets: 0,
  tasks: 0,
};

const POLL_INTERVAL = 30_000; // 30 segundos

// Hook para contadores de badges da sidebar (incidentes, tickets, tarefas)
// Polla os endpoints de stats da API a cada 30s
export function useSidebarBadges() {
  const [badges, setBadges] = useState<SidebarBadges>(EMPTY_BADGES);
  const [isLoading, setIsLoading] = useState(true);

  const fetchBadges = useCallback(async () => {
    try {
      const [incidentsRes, ticketsRes, tasksRes] = await Promise.allSettled([
        fetch("/api/v1/system-health/stats", { credentials: "include" }),
        fetch("/api/v1/tickets/stats", { credentials: "include" }),
        fetch("/api/v1/tasks/stats", { credentials: "include" }),
      ]);

      const next: SidebarBadges = { ...EMPTY_BADGES };

      // Incidentes por severidade (do system-health stats)
      if (incidentsRes.status === "fulfilled" && incidentsRes.value.ok) {
        const data = await incidentsRes.value.json();
        const incidents = data.incidents ?? [];
        const bySeverity = { ...EMPTY_BADGES.incidents.bySeverity };
        let total = 0;
        for (const inc of incidents as Array<{
          severity: string;
          count: string | number;
        }>) {
          const sev = inc.severity?.toLowerCase() as IncidentSeverity;
          if (sev in bySeverity) {
            const count = Number(inc.count);
            bySeverity[sev] = count;
            total += count;
          }
        }
        next.incidents = { total, bySeverity };
      }

      // Tickets abertos
      if (ticketsRes.status === "fulfilled" && ticketsRes.value.ok) {
        const data = await ticketsRes.value.json();
        next.tickets = data.open ?? data.total ?? data.summary?.open ?? 0;
      }

      // Tarefas pendentes
      if (tasksRes.status === "fulfilled" && tasksRes.value.ok) {
        const data = await tasksRes.value.json();
        next.tasks = data.pending ?? data.total ?? data.summary?.pending ?? 0;
      }

      setBadges(next);
    } catch {
      // Mantem valores anteriores em caso de erro de rede
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBadges();
    const interval = setInterval(fetchBadges, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchBadges]);

  return { badges, isLoading, refresh: fetchBadges };
}
