"use client";

import { RefreshCw } from "lucide-react";
import { useApi } from "@/lib/use-api";
import { StatusBadge } from "@/components/ui/status-badge";
import { ErrorState, EmptyState, LoadingState } from "@/components/ui/state-display";
import type { ZabbixDiscoveryRule } from "@repo/zabbix";

const CHECK_TYPE_LABELS: Record<string, string> = {
  "0": "SSH",
  "1": "LDAP",
  "2": "SMTP",
  "3": "FTP",
  "4": "HTTP",
  "5": "POP",
  "6": "IMAP",
  "7": "TCP",
  "8": "Agent",
  "9": "SNMPv1",
  "10": "SNMPv2",
  "11": "ICMP Ping",
  "12": "SNMPv3",
  "13": "HTTPS",
};

export default function DiscoveryPage() {
  const { data, error, isLoading, mutate } = useApi<{ data: ZabbixDiscoveryRule[] }>("/api/zabbix/discovery-rules");
  const rules = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Regras de Discovery</h1>
        <button
          onClick={() => mutate()}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors hover:opacity-80"
          style={{ background: "var(--brand-glow)", border: "1px solid var(--brand-primary)", color: "var(--brand-primary)" }}
        >
          <RefreshCw size={14} />
          Atualizar
        </button>
      </div>

      {error && (
        <ErrorState title="Erro" message={error} />
      )}

      {isLoading ? (
        <LoadingState label="Carregando..." />
      ) : rules.length === 0 ? (
        <EmptyState title="Nenhuma regra de discovery configurada" />
      ) : (
        <div className="space-y-2">
          {rules.map((r) => (
            <div key={r.druleid} className="rounded-lg p-3" style={{ background: "var(--surface-2)", border: "1px solid var(--border-default)" }}>
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{r.name}</span>
                  <span className="text-xs ml-2" style={{ color: "var(--text-muted)" }}>{r.iprange}</span>
                </div>
                <StatusBadge variant={r.status === "0" ? "ok" : "neutral"}>
                  {r.status === "0" ? "Ativa" : "Desativada"}
                </StatusBadge>
              </div>
              {r.dchecks && r.dchecks.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {r.dchecks.map((c) => (
                    <span key={c.dcheckid} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "var(--brand-glow)", color: "var(--brand-primary)" }}>
                      {CHECK_TYPE_LABELS[c.type] ?? `Tipo ${c.type}`} :{c.ports}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
