"use client";

import { useState } from "react";
import {RefreshCw, Plus } from "lucide-react";
import { LoadingState } from "@/components/ui/state-display";
import { apiFetch } from "@/lib/zabbix-fetch";
import type { ZabbixSla } from "@repo/zabbix";
import { useApi } from "@/lib/use-api";

const CSS = {
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

const SERVICE_TYPES = ["business", "network", "infrastructure", "application", "security"];
const SERVICE_STATUS: Record<string, string> = {
  operational: CSS.green, degraded: CSS.amber, partial_outage: CSS.amber,
  major_outage: CSS.red, maintenance: CSS.blue, unknown: CSS.muted,
};
const PRIORITY_COLORS: Record<string, string> = {
  critical: CSS.red, high: CSS.amber, medium: CSS.blue, low: CSS.muted,
};

interface Service {
  id: string;
  name: string;
  description: string | null;
  service_type: string;
  status: string;
  sla_target_percentage: string;
  coverage_hours: string;
  priority: string;
  is_active: boolean;
  created_at: string;
}

interface Incident {
  id: string;
  service_id: string;
  title: string;
  description: string | null;
  severity: string;
  status: string;
  started_at: string;
  resolved_at: string | null;
  duration_minutes: number | null;
}

interface MaintenanceWindow {
  id: string;
  service_id: string | null;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  status: string;
  created_at: string;
}

interface SlaReport {
  service_id: string;
  service_name: string;
  target_percentage: string;
  uptime_percentage: string;
  total_incidents: number;
  total_downtime_minutes: number;
  compliance: boolean;
}

type Tab = "services" | "report" | "incidents" | "maintenance" | "zabbix";

export default function SlasPage() {
  const [tab, setTab] = useState<Tab>("services");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [showCreateService, setShowCreateService] = useState(false);
  const [showCreateIncident, setShowCreateIncident] = useState(false);
  const [showCreateMaintenance, setShowCreateMaintenance] = useState(false);

  const [editServiceId, setEditServiceId] = useState<string | null>(null);

  const [svcName, setSvcName] = useState("");
  const [svcDesc, setSvcDesc] = useState("");
  const [svcType, setSvcType] = useState("business");
  const [svcStatus, setSvcStatus] = useState("operational");
  const [svcSla, setSvcSla] = useState("99.9");
  const [svcPriority, setSvcPriority] = useState("high");
  const [svcCoverage, setSvcCoverage] = useState("24/7");

  const [incServiceId, setIncServiceId] = useState("");
  const [incTitle, setIncTitle] = useState("");
  const [incDesc, setIncDesc] = useState("");
  const [incSeverity, setIncSeverity] = useState("major");

  const [mwServiceId, setMwServiceId] = useState("");
  const [mwTitle, setMwTitle] = useState("");
  const [mwDesc, setMwDesc] = useState("");
  const [mwStart, setMwStart] = useState("");
  const [mwEnd, setMwEnd] = useState("");

  const { data: svcData, isLoading: loading, mutate: mutateServices } = useApi<{ data: Service[] }>("/api/sla/services");
  const { data: incData, mutate: mutateIncidents } = useApi<{ data: Incident[] }>("/api/sla/incidents");
  const { data: maintData, mutate: mutateMaintenance } = useApi<{ data: MaintenanceWindow[] }>("/api/sla/maintenance");
  const { data: rptData, mutate: mutateReport } = useApi<SlaReport[]>("/api/sla/report");
  const { data: zbxData, mutate: mutateZabbixSlas } = useApi<{ data: ZabbixSla[] }>("/api/zabbix/slas");
  const services = svcData?.data ?? [];
  const incidents = incData?.data ?? [];
  const maintenance = maintData?.data ?? [];
  const report = Array.isArray(rptData) ? rptData : [];
  const zabbixSlas = zbxData?.data ?? [];

  function resetServiceForm() {
    setSvcName(""); setSvcDesc(""); setSvcType("business");
    setSvcStatus("operational"); setSvcSla("99.9"); setSvcPriority("high");
    setSvcCoverage("24/7"); setEditServiceId(null);
  }

  async function handleSaveService() {
    setError(null);
    try {
      const payload = {
        name: svcName, description: svcDesc || undefined,
        service_type: svcType, status: svcStatus,
        sla_target_percentage: parseFloat(svcSla),
        priority: svcPriority, coverage_hours: svcCoverage,
      };
      const url = editServiceId ? `/api/sla/services/${editServiceId}` : "/api/sla/services";
      const method = editServiceId ? "PUT" : "POST";
      await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setSuccess(editServiceId ? "Serviço atualizado!" : "Serviço criado!");
      setShowCreateService(false);
      resetServiceForm();
      mutateServices(); mutateReport();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar serviço");
    }
  }

  async function handleDeleteService(id: string) {
    if (!confirm("Confirma excluir este serviço?")) return;
    try {
      await apiFetch(`/api/sla/services/${id}`, { method: "DELETE" });
      setSuccess("Serviço excluído!");
      mutateServices(); mutateReport();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir");
    }
  }

  function startEditService(s: Service) {
    setEditServiceId(s.id);
    setSvcName(s.name); setSvcDesc(s.description ?? "");
    setSvcType(s.service_type); setSvcStatus(s.status);
    setSvcSla(s.sla_target_percentage); setSvcPriority(s.priority);
    setSvcCoverage(s.coverage_hours);
    setShowCreateService(true);
  }

  async function handleCreateIncident() {
    setError(null);
    try {
      await apiFetch("/api/sla/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_id: incServiceId, title: incTitle,
          description: incDesc || undefined, severity: incSeverity,
        }),
      });
      setSuccess("Incidente criado!");
      setShowCreateIncident(false);
      setIncTitle(""); setIncDesc(""); setIncSeverity("major");
      mutateIncidents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar incidente");
    }
  }

  async function handleResolveIncident(id: string) {
    try {
      await apiFetch(`/api/sla/incidents/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "resolved" }),
      });
      setSuccess("Incidente resolvido!");
      mutateIncidents(); mutateReport();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao resolver incidente");
    }
  }

  async function handleCreateMaintenance() {
    setError(null);
    try {
      await apiFetch("/api/sla/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_id: mwServiceId || undefined,
          title: mwTitle, description: mwDesc || undefined,
          start_time: mwStart, end_time: mwEnd,
        }),
      });
      setSuccess("Janela de manutenção criada!");
      setShowCreateMaintenance(false);
      setMwTitle(""); setMwDesc(""); setMwStart(""); setMwEnd("");
      mutateMaintenance();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar manutenção");
    }
  }

  async function handleDeleteMaintenance(id: string) {
    if (!confirm("Confirma excluir esta janela de manutenção?")) return;
    try {
      await apiFetch(`/api/sla/maintenance/${id}`, { method: "DELETE" });
      setSuccess("Manutenção excluída!");
      mutateMaintenance();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir");
    }
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: "services", label: `Serviços (${services.length})` },
    { key: "report", label: "Relatório SLA" },
    { key: "incidents", label: `Incidentes (${incidents.length})` },
    { key: "maintenance", label: `Manutenções (${maintenance.length})` },
    { key: "zabbix", label: "Zabbix SLAs" },
  ];

  return (
    <div className="space-y-4" style={{ fontFamily: "'JetBrains Mono','Consolas',monospace" }}>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold" style={{ color: CSS.text }}>SLA & Services</h1>
        <div className="flex gap-2">
          {tab === "services" && (
            <button
              onClick={() => { resetServiceForm(); setShowCreateService(true); }}
              className="rounded-md px-3 py-1.5 text-sm font-bold"
              style={{ background: CSS.teal, color: CSS.bg }}
            >
              + Serviço
            </button>
          )}
          {tab === "incidents" && (
            <button
              onClick={() => setShowCreateIncident(true)}
              disabled={services.length === 0}
              className="rounded-md px-3 py-1.5 text-sm font-bold disabled:opacity-50"
              style={{ background: CSS.teal, color: CSS.bg }}
            ><Plus size={12} className="inline" /> Incidente</button>
          )}
          {tab === "maintenance" && (
            <button
              onClick={() => setShowCreateMaintenance(true)}
              className="rounded-md px-3 py-1.5 text-sm font-bold"
              style={{ background: CSS.teal, color: CSS.bg }}
            >
              + Manutenção
            </button>
          )}
          <button
            onClick={() => { mutateServices(); mutateIncidents(); mutateMaintenance(); mutateReport(); mutateZabbixSlas(); }}
            className="rounded-md px-3 py-1.5 text-sm"
            style={{ background: CSS.card, border: `1px solid ${CSS.border}`, color: CSS.muted }}
          >
            <RefreshCw size={12} className="inline" /> Atualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md p-3 text-sm" style={{ background: "var(--status-error-bg)", border: "1px solid var(--status-error-border)", color: CSS.red }}>
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md p-3 text-sm" style={{ background: "var(--status-ok-bg)", border: "1px solid var(--status-ok-border)", color: CSS.green }}>
          {success}
        </div>
      )}

      <div className="flex gap-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-4 py-2 rounded-t-md text-[12px] font-bold transition-colors"
            style={{
              background: tab === t.key ? CSS.card : "transparent",
              border: `1px solid ${CSS.border}`,
              borderBottom: tab === t.key ? "none" : `1px solid ${CSS.border}`,
              color: tab === t.key ? CSS.teal : CSS.muted,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingState label="Carregando SLAs..." />
      ) : (
        <>
          {tab === "services" && (
            <div className="rounded-xl overflow-hidden" style={{ background: CSS.card, border: `1px solid ${CSS.border}`, borderTop: "none" }}>
              {services.length === 0 ? (
                <div className="p-8 text-center text-sm" style={{ color: CSS.muted }}>Nenhum serviço cadastrado</div>
              ) : (
                <table className="w-full text-[12px]">
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${CSS.border}` }}>
                      <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: CSS.muted }}>Nome</th>
                      <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: CSS.muted }}>Tipo</th>
                      <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: CSS.muted }}>Status</th>
                      <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: CSS.muted }}>SLA Alvo</th>
                      <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: CSS.muted }}>Prioridade</th>
                      <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: CSS.muted }}>Cobertura</th>
                      <th className="text-right px-3 py-2 font-bold uppercase text-[10px]" style={{ color: CSS.muted }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {services.map((s) => (
                      <tr key={s.id} style={{ borderBottom: `1px solid ${CSS.border}`, opacity: s.is_active ? 1 : 0.4 }}>
                        <td className="px-3 py-2" style={{ color: CSS.teal }}>{s.name}</td>
                        <td className="px-3 py-2" style={{ color: CSS.muted }}>{s.service_type}</td>
                        <td className="px-3 py-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: `color-mix(in srgb, ${SERVICE_STATUS[s.status] ?? CSS.muted} 15%, transparent)`, color: SERVICE_STATUS[s.status] ?? CSS.muted }}>
                            {s.status}
                          </span>
                        </td>
                        <td className="px-3 py-2" style={{ color: CSS.blue }}>{s.sla_target_percentage}%</td>
                        <td className="px-3 py-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: `color-mix(in srgb, ${PRIORITY_COLORS[s.priority] ?? CSS.muted} 15%, transparent)`, color: PRIORITY_COLORS[s.priority] ?? CSS.muted }}>
                            {s.priority}
                          </span>
                        </td>
                        <td className="px-3 py-2" style={{ color: CSS.muted }}>{s.coverage_hours}</td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex gap-1 justify-end">
                            <button onClick={() => startEditService(s)} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: "var(--status-info-bg)", border: "1px solid var(--status-info-border)", color: CSS.blue }}>Editar</button>
                            <button onClick={() => handleDeleteService(s.id)} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: "var(--status-error-bg)", border: "1px solid var(--status-error-border)", color: CSS.red }}>✕</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === "report" && (
            <div className="rounded-xl overflow-hidden" style={{ background: CSS.card, border: `1px solid ${CSS.border}`, borderTop: "none" }}>
              {report.length === 0 ? (
                <div className="p-8 text-center text-sm" style={{ color: CSS.muted }}>Nenhum dado de SLA disponível</div>
              ) : (
                <table className="w-full text-[12px]">
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${CSS.border}` }}>
                      <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: CSS.muted }}>Serviço</th>
                      <th className="text-right px-3 py-2 font-bold uppercase text-[10px]" style={{ color: CSS.muted }}>Alvo</th>
                      <th className="text-right px-3 py-2 font-bold uppercase text-[10px]" style={{ color: CSS.muted }}>Uptime</th>
                      <th className="text-right px-3 py-2 font-bold uppercase text-[10px]" style={{ color: CSS.muted }}>Incidentes</th>
                      <th className="text-right px-3 py-2 font-bold uppercase text-[10px]" style={{ color: CSS.muted }}>Downtime</th>
                      <th className="text-center px-3 py-2 font-bold uppercase text-[10px]" style={{ color: CSS.muted }}>Compliance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.map((r) => (
                      <tr key={r.service_id} style={{ borderBottom: `1px solid ${CSS.border}` }}>
                        <td className="px-3 py-2" style={{ color: CSS.teal }}>{r.service_name}</td>
                        <td className="px-3 py-2 text-right" style={{ color: CSS.blue }}>{r.target_percentage}%</td>
                        <td className="px-3 py-2 text-right font-bold" style={{ color: parseFloat(r.uptime_percentage) >= parseFloat(r.target_percentage) ? CSS.green : CSS.red }}>
                          {r.uptime_percentage}%
                        </td>
                        <td className="px-3 py-2 text-right" style={{ color: CSS.amber }}>{r.total_incidents}</td>
                        <td className="px-3 py-2 text-right" style={{ color: CSS.muted }}>{r.total_downtime_minutes}min</td>
                        <td className="px-3 py-2 text-center">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: r.compliance ? "var(--status-ok-bg)" : "var(--status-error-bg)", color: r.compliance ? CSS.green : CSS.red }}>
                            {r.compliance ? "OK" : "FAIL"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === "incidents" && (
            <div className="rounded-xl overflow-hidden" style={{ background: CSS.card, border: `1px solid ${CSS.border}`, borderTop: "none" }}>
              {incidents.length === 0 ? (
                <div className="p-8 text-center text-sm" style={{ color: CSS.muted }}>Nenhum incidente registrado</div>
              ) : (
                <table className="w-full text-[12px]">
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${CSS.border}` }}>
                      <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: CSS.muted }}>Título</th>
                      <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: CSS.muted }}>Severidade</th>
                      <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: CSS.muted }}>Status</th>
                      <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: CSS.muted }}>Início</th>
                      <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: CSS.muted }}>Duração</th>
                      <th className="text-right px-3 py-2 font-bold uppercase text-[10px]" style={{ color: CSS.muted }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {incidents.map((inc) => (
                      <tr key={inc.id} style={{ borderBottom: `1px solid ${CSS.border}` }}>
                        <td className="px-3 py-2" style={{ color: CSS.text }}>{inc.title}</td>
                        <td className="px-3 py-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: `color-mix(in srgb, ${PRIORITY_COLORS[inc.severity] ?? CSS.muted} 15%, transparent)`, color: PRIORITY_COLORS[inc.severity] ?? CSS.muted }}>
                            {inc.severity}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: inc.status === "resolved" ? "var(--status-ok-bg)" : "var(--status-warning-bg)", color: inc.status === "resolved" ? CSS.green : CSS.amber }}>
                            {inc.status}
                          </span>
                        </td>
                        <td className="px-3 py-2" style={{ color: CSS.muted }}>{new Date(inc.started_at).toLocaleString("pt-BR")}</td>
                        <td className="px-3 py-2" style={{ color: CSS.muted }}>{inc.duration_minutes ? `${inc.duration_minutes}min` : "—"}</td>
                        <td className="px-3 py-2 text-right">
                          {inc.status !== "resolved" && (
                            <button onClick={() => handleResolveIncident(inc.id)} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: "var(--status-ok-bg)", border: "1px solid var(--status-ok-border)", color: CSS.green }}>Resolver</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === "maintenance" && (
            <div className="rounded-xl overflow-hidden" style={{ background: CSS.card, border: `1px solid ${CSS.border}`, borderTop: "none" }}>
              {maintenance.length === 0 ? (
                <div className="p-8 text-center text-sm" style={{ color: CSS.muted }}>Nenhuma janela de manutenção</div>
              ) : (
                <table className="w-full text-[12px]">
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${CSS.border}` }}>
                      <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: CSS.muted }}>Título</th>
                      <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: CSS.muted }}>Início</th>
                      <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: CSS.muted }}>Fim</th>
                      <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: CSS.muted }}>Status</th>
                      <th className="text-right px-3 py-2 font-bold uppercase text-[10px]" style={{ color: CSS.muted }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {maintenance.map((mw) => (
                      <tr key={mw.id} style={{ borderBottom: `1px solid ${CSS.border}` }}>
                        <td className="px-3 py-2" style={{ color: CSS.teal }}>{mw.title}</td>
                        <td className="px-3 py-2" style={{ color: CSS.muted }}>{new Date(mw.start_time).toLocaleString("pt-BR")}</td>
                        <td className="px-3 py-2" style={{ color: CSS.muted }}>{new Date(mw.end_time).toLocaleString("pt-BR")}</td>
                        <td className="px-3 py-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: mw.status === "active" ? "var(--status-ok-bg)" : "var(--status-info-bg)", color: mw.status === "active" ? CSS.green : CSS.blue }}>
                            {mw.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button onClick={() => handleDeleteMaintenance(mw.id)} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: "var(--status-error-bg)", border: "1px solid var(--status-error-border)", color: CSS.red }}>✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === "zabbix" && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {zabbixSlas.length === 0 ? (
                <div className="col-span-full text-center py-8" style={{ color: CSS.muted }}>Nenhum SLA no Zabbix</div>
              ) : (
                zabbixSlas.map((s) => (
                  <div key={s.slaid} className="rounded-md p-4" style={{ background: CSS.card, border: `1px solid ${CSS.border}` }}>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-medium" style={{ color: CSS.text }}>{s.name}</h3>
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: s.state === "0" ? "var(--status-ok-bg)" : "color-mix(in srgb, var(--text-muted) 20%, transparent)", color: s.state === "0" ? CSS.green : CSS.muted }}>
                        {s.state === "0" ? "Ativo" : "Inativo"}
                      </span>
                    </div>
                    {s.slo && <div className="text-2xl font-bold" style={{ color: CSS.teal }}>{s.slo}%</div>}
                    {s.period && (
                      <p className="text-xs mt-1" style={{ color: CSS.muted }}>
                        Período: {s.period}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}

      {showCreateService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "var(--overlay-modal)" }} onClick={() => { setShowCreateService(false); resetServiceForm(); }}>
          <div className="rounded-xl p-6 max-w-md w-full max-h-[85vh] overflow-y-auto" style={{ background: CSS.card, border: `1px solid ${CSS.border}` }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold" style={{ color: CSS.teal }}>{editServiceId ? "Editar Serviço" : "Novo Serviço"}</h2>
              <button onClick={() => { setShowCreateService(false); resetServiceForm(); }} className="text-[16px]" style={{ color: CSS.muted }}>✕</button>
            </div>
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase" style={{ color: CSS.muted }}>Nome</label>
                <input type="text" value={svcName} onChange={(e) => setSvcName(e.target.value)} placeholder="Email Corporate" className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: CSS.bg, border: `1px solid ${CSS.border}`, color: CSS.text }} />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase" style={{ color: CSS.muted }}>Descrição</label>
                <input type="text" value={svcDesc} onChange={(e) => setSvcDesc(e.target.value)} className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: CSS.bg, border: `1px solid ${CSS.border}`, color: CSS.text }} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase" style={{ color: CSS.muted }}>Tipo</label>
                  <select value={svcType} onChange={(e) => setSvcType(e.target.value)} className="w-full rounded-md px-3 py-2 text-[12px]" style={{ background: CSS.bg, border: `1px solid ${CSS.border}`, color: CSS.text }}>
                    {SERVICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase" style={{ color: CSS.muted }}>Status</label>
                  <select value={svcStatus} onChange={(e) => setSvcStatus(e.target.value)} className="w-full rounded-md px-3 py-2 text-[12px]" style={{ background: CSS.bg, border: `1px solid ${CSS.border}`, color: CSS.text }}>
                    <option value="operational">operational</option>
                    <option value="degraded">degraded</option>
                    <option value="partial_outage">partial_outage</option>
                    <option value="major_outage">major_outage</option>
                    <option value="maintenance">maintenance</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase" style={{ color: CSS.muted }}>SLA Alvo (%)</label>
                  <input type="number" step="0.01" value={svcSla} onChange={(e) => setSvcSla(e.target.value)} className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: CSS.bg, border: `1px solid ${CSS.border}`, color: CSS.text }} />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase" style={{ color: CSS.muted }}>Prioridade</label>
                  <select value={svcPriority} onChange={(e) => setSvcPriority(e.target.value)} className="w-full rounded-md px-3 py-2 text-[12px]" style={{ background: CSS.bg, border: `1px solid ${CSS.border}`, color: CSS.text }}>
                    <option value="critical">critical</option>
                    <option value="high">high</option>
                    <option value="medium">medium</option>
                    <option value="low">low</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase" style={{ color: CSS.muted }}>Cobertura</label>
                <input type="text" value={svcCoverage} onChange={(e) => setSvcCoverage(e.target.value)} placeholder="24/7" className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: CSS.bg, border: `1px solid ${CSS.border}`, color: CSS.text }} />
              </div>
              <button onClick={handleSaveService} disabled={!svcName} className="w-full rounded-md py-2.5 text-sm font-bold disabled:opacity-50" style={{ background: CSS.teal, color: CSS.bg }}>
                {editServiceId ? "Salvar Alterações" : "Criar Serviço"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreateIncident && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "var(--overlay-modal)" }} onClick={() => setShowCreateIncident(false)}>
          <div className="rounded-xl p-6 max-w-md w-full" style={{ background: CSS.card, border: `1px solid ${CSS.border}` }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold" style={{ color: CSS.teal }}>Novo Incidente</h2>
              <button onClick={() => setShowCreateIncident(false)} className="text-[16px]" style={{ color: CSS.muted }}>✕</button>
            </div>
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase" style={{ color: CSS.muted }}>Serviço</label>
                <select value={incServiceId} onChange={(e) => setIncServiceId(e.target.value)} className="w-full rounded-md px-3 py-2 text-[12px]" style={{ background: CSS.bg, border: `1px solid ${CSS.border}`, color: CSS.text }}>
                  <option value="">Selecione...</option>
                  {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase" style={{ color: CSS.muted }}>Título</label>
                <input type="text" value={incTitle} onChange={(e) => setIncTitle(e.target.value)} placeholder="Indisponibilidade email" className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: CSS.bg, border: `1px solid ${CSS.border}`, color: CSS.text }} />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase" style={{ color: CSS.muted }}>Descrição</label>
                <textarea value={incDesc} onChange={(e) => setIncDesc(e.target.value)} rows={3} className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: CSS.bg, border: `1px solid ${CSS.border}`, color: CSS.text }} />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase" style={{ color: CSS.muted }}>Severidade</label>
                <select value={incSeverity} onChange={(e) => setIncSeverity(e.target.value)} className="w-full rounded-md px-3 py-2 text-[12px]" style={{ background: CSS.bg, border: `1px solid ${CSS.border}`, color: CSS.text }}>
                  <option value="minor">minor</option>
                  <option value="moderate">moderate</option>
                  <option value="major">major</option>
                  <option value="critical">critical</option>
                </select>
              </div>
              <button onClick={handleCreateIncident} disabled={!incServiceId || !incTitle} className="w-full rounded-md py-2.5 text-sm font-bold disabled:opacity-50" style={{ background: CSS.teal, color: CSS.bg }}>
                Criar Incidente
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreateMaintenance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "var(--overlay-modal)" }} onClick={() => setShowCreateMaintenance(false)}>
          <div className="rounded-xl p-6 max-w-md w-full" style={{ background: CSS.card, border: `1px solid ${CSS.border}` }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold" style={{ color: CSS.teal }}>Nova Janela de Manutenção</h2>
              <button onClick={() => setShowCreateMaintenance(false)} className="text-[16px]" style={{ color: CSS.muted }}>✕</button>
            </div>
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase" style={{ color: CSS.muted }}>Serviço (opcional)</label>
                <select value={mwServiceId} onChange={(e) => setMwServiceId(e.target.value)} className="w-full rounded-md px-3 py-2 text-[12px]" style={{ background: CSS.bg, border: `1px solid ${CSS.border}`, color: CSS.text }}>
                  <option value="">Todos</option>
                  {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase" style={{ color: CSS.muted }}>Título</label>
                <input type="text" value={mwTitle} onChange={(e) => setMwTitle(e.target.value)} placeholder="Manutenção programada servidor" className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: CSS.bg, border: `1px solid ${CSS.border}`, color: CSS.text }} />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase" style={{ color: CSS.muted }}>Descrição</label>
                <input type="text" value={mwDesc} onChange={(e) => setMwDesc(e.target.value)} className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: CSS.bg, border: `1px solid ${CSS.border}`, color: CSS.text }} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase" style={{ color: CSS.muted }}>Início</label>
                  <input type="datetime-local" value={mwStart} onChange={(e) => setMwStart(e.target.value)} className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: CSS.bg, border: `1px solid ${CSS.border}`, color: CSS.text }} />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase" style={{ color: CSS.muted }}>Fim</label>
                  <input type="datetime-local" value={mwEnd} onChange={(e) => setMwEnd(e.target.value)} className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: CSS.bg, border: `1px solid ${CSS.border}`, color: CSS.text }} />
                </div>
              </div>
              <button onClick={handleCreateMaintenance} disabled={!mwTitle || !mwStart || !mwEnd} className="w-full rounded-md py-2.5 text-sm font-bold disabled:opacity-50" style={{ background: CSS.teal, color: CSS.bg }}>
                Criar Manutenção
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
