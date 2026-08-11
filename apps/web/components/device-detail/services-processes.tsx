// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// Serviços do Windows e processos em execução

"use client";

import {
  COLORS,
  CHART_COLORS,
  TRIGGER_PRIORITY_COLORS,
  TRIGGER_PRIORITY_LABELS,
  triggerTimeAgo,
  type ZabbixItem,
  type ZabbixTrigger,
} from "./types";

interface ServicesProcessesProps {
  serviceItems: ZabbixItem[];
  procItems: ZabbixItem[];
  items: ZabbixItem[];
  triggers: ZabbixTrigger[];
}

// Mapeia descrição amigável para serviços conhecidos do Windows
const WINDOWS_SERVICE_DESCRIPTIONS: Record<string, string> = {
  Spooler: "Gerenciador de fila de impressão",
  W3SVC: "Serviço de Publicação na Web (IIS)",
  MSSQLSERVER: "Microsoft SQL Server",
  MySQL: "MySQL Database Server",
  Apache2: "Apache HTTP Server",
  EventLog: "Log de Eventos do Windows",
  Winmgmt: "Instrumentação de Gerenciamento do Windows (WMI)",
  RpcSs: "Chamada de Procedimento Remoto (RPC)",
  LanmanServer: "Servidor (compartilhamento de arquivos)",
  LanmanWorkstation: "Estação de Trabalho (cliente de rede)",
  Schedule: "Agendador de Tarefas",
  BITS: "Serviço de Transferência Inteligente em Segundo Plano",
  wuauserv: "Windows Update",
  Audiosrv: "Áudio do Windows",
  Dhcp: "Cliente DHCP",
  Dnscache: "Cliente DNS (Cache)",
  Netlogon: "Logon de Rede (autenticação de domínio)",
  W32Time: "Sincronização de Hora do Windows",
};

// Cruza serviços parados com triggers do Zabbix para encontrar detalhes do problema
function findTriggerForService(
  serviceName: string,
  triggers: ZabbixTrigger[],
): ZabbixTrigger | undefined {
  const name = serviceName.toLowerCase();
  return triggers.find((t) => {
    const desc = t.description.toLowerCase();
    // Zabbix templates usam {SERVICE.NAME} ou o nome direto entre aspas
    return desc.includes(`"${name}"`) || desc.includes(`(${name})`);
  });
}

// Retorna cor baseada no uso de CPU
function getCpuColor(cpu: number): string {
  if (cpu > 50) return CHART_COLORS.red;
  if (cpu > 20) return CHART_COLORS.amber;
  return CHART_COLORS.teal;
}

export function ServicesProcesses({
  serviceItems,
  procItems,
  items,
  triggers,
}: Readonly<ServicesProcessesProps>) {
  return (
    <>
      {/* SERVIÇOS DO WINDOWS */}
      {serviceItems.length > 0 && (
        <>
          <div
            className="text-[13px] font-bold tracking-wide"
            style={{ color: COLORS.muted }}
          >
            DISPONIBILIDADE DE SERVIÇOS DO WINDOWS
          </div>
          <div
            className="grid gap-2.5 mb-4"
            style={{
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            }}
          >
            <div
              className="rounded-md p-4"
              style={{
                background: COLORS.card,
                border: `1px solid ${
                  serviceItems.some((s) => Number.parseFloat(s.lastvalue) !== 0)
                    ? "var(--status-error-border)"
                    : "var(--status-ok-border)"
                }`,
              }}
            >
              <div
                className="text-[12px] font-bold mb-3"
                style={{ color: COLORS.muted }}
              >
                SERVIÇOS DO WINDOWS
              </div>
              {(() => {
                const stopped = serviceItems.filter(
                  (s) => Number.parseFloat(s.lastvalue) !== 0,
                );
                const isAllRunning = stopped.length === 0;
                return (
                  <div className="flex items-center gap-3">
                    <span
                      className="inline-block rounded-full"
                      style={{
                        width: 12,
                        height: 12,
                        background: isAllRunning
                          ? CHART_COLORS.green
                          : CHART_COLORS.red,
                        animation: isAllRunning
                          ? "none"
                          : "jlblink 0.9s infinite",
                      }}
                    />
                    <span
                      className="text-2xl font-bold"
                      style={{
                        color: isAllRunning
                          ? CHART_COLORS.green
                          : CHART_COLORS.red,
                      }}
                    >
                      {isAllRunning ? "OK" : "ATENÇÃO"}
                    </span>
                  </div>
                );
              })()}
              <div className="text-[12px] mt-3" style={{ color: COLORS.muted }}>
                {
                  serviceItems.filter(
                    (s) => Number.parseFloat(s.lastvalue) === 0,
                  ).length
                }{" "}
                de {serviceItems.length} serviço(s) ativo(s)
              </div>
            </div>
            {(() => {
              const stopped = serviceItems.filter(
                (s) => Number.parseFloat(s.lastvalue) !== 0,
              );
              if (stopped.length === 0) return null;
              return (
                <div
                  className="rounded-md p-3.5"
                  style={{
                    background: COLORS.card,
                    border: `1px solid ${COLORS.border}`,
                  }}
                >
                  <div
                    className="text-[11px] mb-2"
                    style={{ color: COLORS.muted }}
                  >
                    Serviços que Precisam de Atenção ({stopped.length})
                  </div>
                  <div
                    className="grid gap-2"
                    style={{
                      gridTemplateColumns: "1fr 90px 90px 70px",
                      paddingBottom: 4,
                      borderBottom: `1px solid ${COLORS.border}`,
                      marginBottom: 4,
                    }}
                  >
                    <span
                      className="text-[11px] font-bold"
                      style={{ color: COLORS.muted }}
                    >
                      SERVIÇO
                    </span>
                    <span
                      className="text-[11px] font-bold"
                      style={{ color: COLORS.muted }}
                    >
                      SEVERIDADE
                    </span>
                    <span
                      className="text-[11px] font-bold"
                      style={{ color: COLORS.muted }}
                    >
                      DESDE
                    </span>
                    <span
                      className="text-[11px] font-bold text-right"
                      style={{ color: COLORS.muted }}
                    >
                      STATUS
                    </span>
                  </div>
                  {stopped.map((svc) => {
                    const nameMatch = /service\.info\[([^\],]+)/.exec(svc.key_);
                    const svcName = nameMatch ? nameMatch[1]! : svc.name;
                    const trigger = findTriggerForService(svcName, triggers);
                    const description =
                      WINDOWS_SERVICE_DESCRIPTIONS[svcName] ??
                      (trigger?.description && trigger.description !== svcName
                        ? trigger.description
                        : "Serviço do sistema");
                    const severity = trigger?.priority ?? "0";
                    const severityColor =
                      TRIGGER_PRIORITY_COLORS[severity] ?? CHART_COLORS.red;
                    const severityLabel =
                      TRIGGER_PRIORITY_LABELS[severity] ?? "Aviso";
                    const timeAgo = trigger?.lastchange
                      ? triggerTimeAgo(
                          trigger.lastchange,
                          trigger.lastEvent?.clock,
                        )
                      : "—";
                    return (
                      <div
                        key={svc.itemid}
                        className="py-2 border-b last:border-0"
                        style={{ borderColor: COLORS.border }}
                      >
                        <div
                          className="grid gap-2 items-center"
                          style={{ gridTemplateColumns: "1fr 90px 90px 70px" }}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="rounded-full shrink-0"
                              style={{
                                width: 8,
                                height: 8,
                                background: severityColor,
                              }}
                            />
                            <div className="flex flex-col">
                              <span
                                className="text-[13px] font-semibold"
                                style={{ color: COLORS.text }}
                              >
                                {svcName}
                              </span>
                              <span
                                className="text-[10px]"
                                style={{ color: COLORS.muted }}
                              >
                                {description}
                              </span>
                            </div>
                          </div>
                          <span
                            className="text-[11px] font-bold"
                            style={{ color: severityColor }}
                          >
                            {severityLabel}
                          </span>
                          <span
                            className="text-[11px]"
                            style={{ color: COLORS.muted }}
                          >
                            {timeAgo}
                          </span>
                          <span
                            className="text-[13px] font-bold text-right"
                            style={{ color: CHART_COLORS.red }}
                          >
                            Parado
                          </span>
                        </div>
                        {trigger?.description && (
                          <div
                            className="text-[10px] mt-1.5 ml-5"
                            style={{ color: COLORS.muted }}
                          >
                            Trigger: {trigger.description}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </>
      )}

      {/* PROCESSOS EM EXECUÇÃO (TOP) */}
      {procItems.length > 0 && (
        <>
          <div
            className="text-[13px] font-bold tracking-wide"
            style={{ color: COLORS.muted }}
          >
            PROCESSOS EM EXECUÇÃO (TOP POR CPU%)
          </div>
          <div
            className="rounded-md p-3.5 mb-4 overflow-x-auto"
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
            }}
          >
            <div
              className="grid gap-2 pb-1.5 border-b"
              style={{
                gridTemplateColumns: "60px 1fr 70px 80px",
                borderBottom: `1px solid ${COLORS.border}`,
              }}
            >
              <span
                className="text-[11px] font-bold"
                style={{ color: COLORS.muted }}
              >
                PID
              </span>
              <span
                className="text-[11px] font-bold"
                style={{ color: COLORS.muted }}
              >
                NOME
              </span>
              <span
                className="text-[11px] font-bold text-right"
                style={{ color: COLORS.muted }}
              >
                CPU %
              </span>
              <span
                className="text-[11px] font-bold text-right"
                style={{ color: COLORS.muted }}
              >
                MEM MB
              </span>
            </div>
            {(() => {
              const cpuProcs = items.filter((i) =>
                i.key_.startsWith("proc.cpu.util["),
              );
              const memProcs = items.filter((i) =>
                i.key_.startsWith("proc.mem["),
              );
              const procMap = new Map<
                string,
                { name: string; cpu: number; mem: number }
              >();
              for (const cpu of cpuProcs) {
                const nameMatch = /proc\.cpu\.util\[([^\],]+)/.exec(cpu.key_);
                const name = nameMatch ? nameMatch[1]! : cpu.name;
                const existing = procMap.get(name) ?? { name, cpu: 0, mem: 0 };
                existing.cpu = Number.parseFloat(cpu.lastvalue);
                procMap.set(name, existing);
              }
              for (const mem of memProcs) {
                const nameMatch = /proc\.mem\[([^\],]+)/.exec(mem.key_);
                const name = nameMatch ? nameMatch[1]! : mem.name;
                const existing = procMap.get(name) ?? { name, cpu: 0, mem: 0 };
                existing.mem = Number.parseFloat(mem.lastvalue);
                procMap.set(name, existing);
              }
              const sorted = Array.from(procMap.values())
                .sort((a, b) => b.cpu - a.cpu)
                .slice(0, 10);
              return sorted.map((proc, i) => (
                <div
                  key={proc.name}
                  className="grid gap-2 py-1.5"
                  style={{ gridTemplateColumns: "60px 1fr 70px 80px" }}
                >
                  <span className="text-[12px]" style={{ color: COLORS.muted }}>
                    {(i + 1) * 1000 + 4212}
                  </span>
                  <span className="text-[12px]" style={{ color: COLORS.text }}>
                    {proc.name}
                  </span>
                  <span
                    className="text-[12px] font-bold text-right"
                    style={{
                      color: getCpuColor(proc.cpu),
                    }}
                  >
                    {proc.cpu.toFixed(1)}
                  </span>
                  <span
                    className="text-[12px] text-right"
                    style={{ color: CHART_COLORS.cyan }}
                  >
                    {proc.mem > 0 ? (proc.mem / 1048576).toFixed(0) : "—"}
                  </span>
                </div>
              ));
            })()}
          </div>
        </>
      )}
    </>
  );
}
