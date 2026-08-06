// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// KPI cards, gauges, system info, memory/swap details, CPU breakdown

"use client";

import { Gauge } from "@/components/gauge";
import { COLORS, CHART_COLORS, formatBytes, type ZabbixItem } from "./types";

interface KpiCard {
  label: string;
  value: string;
  color: string;
  sub: string;
  show: boolean;
}

interface GaugesProps {
  kpiCards: KpiCard[];
  cpuItem: ZabbixItem | undefined;
  cpuValue: number;
  cpuIdleItem: ZabbixItem | undefined;
  cpuNumItem: ZabbixItem | undefined;
  cpuLoadItem: ZabbixItem | undefined;
  interruptsItem: ZabbixItem | undefined;
  contextSwitchesItem: ZabbixItem | undefined;
  memItem: ZabbixItem | undefined;
  memUtilItem: ZabbixItem | undefined;
  memTotalItem: ZabbixItem | undefined;
  memFreeItem: ZabbixItem | undefined;
  swapFreeItem: ZabbixItem | undefined;
  swapPfreeItem: ZabbixItem | undefined;
  cpuBreakdownItems: ZabbixItem[];
  systemNameItem: ZabbixItem | undefined;
  systemDescrItem: ZabbixItem | undefined;
  systemLocationItem: ZabbixItem | undefined;
  systemContactItem: ZabbixItem | undefined;
  systemObjectIdItem: ZabbixItem | undefined;
}

export function Gauges({
  kpiCards,
  cpuItem,
  cpuValue,
  cpuIdleItem,
  cpuNumItem,
  cpuLoadItem,
  interruptsItem,
  contextSwitchesItem,
  memItem,
  memUtilItem,
  memTotalItem,
  memFreeItem,
  swapFreeItem,
  swapPfreeItem,
  cpuBreakdownItems,
  systemNameItem,
  systemDescrItem,
  systemLocationItem,
  systemContactItem,
  systemObjectIdItem,
}: Readonly<GaugesProps>) {
  return (
    <>
      {/* INFORMAÇÕES DO SISTEMA */}
      {(systemNameItem ||
        systemDescrItem ||
        systemLocationItem ||
        systemContactItem ||
        systemObjectIdItem) && (
        <>
          <div
            className="text-[13px] font-bold tracking-wide"
            style={{ color: COLORS.muted }}
          >
            INFORMAÇÕES DO SISTEMA
          </div>
          <div
            className="rounded-md p-4 mb-4"
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
            }}
          >
            {systemNameItem && (
              <div
                className="pb-3 mb-3"
                style={{ borderBottom: `1px solid ${COLORS.border}` }}
              >
                <div
                  className="text-[11px] font-bold mb-1"
                  style={{ color: COLORS.muted }}
                >
                  NOME DO SISTEMA
                </div>
                <div
                  className="text-[14px] font-bold"
                  style={{ color: CHART_COLORS.teal }}
                >
                  {systemNameItem.lastvalue}
                </div>
              </div>
            )}
            {systemDescrItem && (
              <div
                className="pb-3 mb-3"
                style={{ borderBottom: `1px solid ${COLORS.border}` }}
              >
                <div
                  className="text-[11px] font-bold mb-1.5"
                  style={{ color: COLORS.muted }}
                >
                  SISTEMA OPERACIONAL
                </div>
                {(() => {
                  const descr = systemDescrItem.lastvalue;
                  const osMatch =
                    /^(Linux|Windows|FreeBSD|OpenBSD|SunOS|AIX|HP-UX|Darwin)/i.exec(
                      descr,
                    );
                  const kernelMatch = /(\d+\.\d+\.\d+[\w.-]*)/.exec(descr);
                  const archMatch = /(x86_64|i386|i686|armv\w+|aarch64)/i.exec(
                    descr,
                  );
                  const osName = osMatch ? osMatch[1] : "Desconhecido";
                  const kernel = kernelMatch ? kernelMatch[1] : null;
                  const arch = archMatch ? archMatch[1] : null;
                  return (
                    <div className="flex flex-wrap gap-2">
                      <span
                        className="text-[12px] px-2 py-0.5 rounded"
                        style={{
                          background: "var(--brand-glow)",
                          color: COLORS.teal,
                          fontWeight: "bold",
                        }}
                      >
                        {osName}
                      </span>
                      {kernel && (
                        <span
                          className="text-[12px] px-2 py-0.5 rounded"
                          style={{
                            background: "var(--status-info-bg)",
                            color: COLORS.blue,
                          }}
                        >
                          Kernel {kernel}
                        </span>
                      )}
                      {arch && (
                        <span
                          className="text-[12px] px-2 py-0.5 rounded"
                          style={{
                            background: "rgba(142, 124, 255, 0.15)",
                            color: COLORS.purple,
                          }}
                        >
                          {arch}
                        </span>
                      )}
                      <span
                        className="text-[11px]"
                        style={{
                          color: COLORS.muted,
                          wordBreak: "break-word",
                          flex: "1 1 100%",
                          marginTop: 4,
                        }}
                      >
                        {descr}
                      </span>
                    </div>
                  );
                })()}
              </div>
            )}
            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              }}
            >
              {systemLocationItem && (
                <div className="flex items-center gap-2">
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 2,
                      background: CHART_COLORS.amber,
                      display: "inline-block",
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <div
                      className="text-[10px]"
                      style={{ color: COLORS.muted }}
                    >
                      Localização
                    </div>
                    <div className="text-[12px]" style={{ color: COLORS.text }}>
                      {systemLocationItem.lastvalue}
                    </div>
                  </div>
                </div>
              )}
              {systemContactItem && (
                <div className="flex items-center gap-2">
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 2,
                      background: CHART_COLORS.green,
                      display: "inline-block",
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <div
                      className="text-[10px]"
                      style={{ color: COLORS.muted }}
                    >
                      Contato
                    </div>
                    <div className="text-[12px]" style={{ color: COLORS.text }}>
                      {systemContactItem.lastvalue}
                    </div>
                  </div>
                </div>
              )}
              {systemObjectIdItem && (
                <div className="flex items-center gap-2">
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 2,
                      background: CHART_COLORS.blue,
                      display: "inline-block",
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <div
                      className="text-[10px]"
                      style={{ color: COLORS.muted }}
                    >
                      Object ID (SNMP)
                    </div>
                    <div
                      className="text-[12px]"
                      style={{
                        color: COLORS.text,
                        fontFamily: "'JetBrains Mono','Consolas',monospace",
                      }}
                    >
                      {systemObjectIdItem.lastvalue}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* VISÃO GERAL — KPI CARDS */}
      <div
        className="text-[13px] font-bold tracking-wide"
        style={{ color: COLORS.muted }}
      >
        VISÃO GERAL
      </div>
      <div
        className="grid gap-2.5 mb-4"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}
      >
        {kpiCards.map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-md p-3"
            style={{ background: COLORS.card }}
          >
            <div className="flex items-center gap-1.5 mb-2">
              <span
                className="rounded-sm"
                style={{ width: 8, height: 8, background: kpi.color }}
              />
              <span
                className="text-[12px] font-bold"
                style={{ color: COLORS.muted }}
              >
                {kpi.label}
              </span>
            </div>
            <div className="text-2xl font-bold" style={{ color: kpi.color }}>
              {kpi.value}
            </div>
            <div className="text-[11px] mt-1" style={{ color: COLORS.muted }}>
              {kpi.sub}
            </div>
          </div>
        ))}
      </div>

      {/* DESEMPENHO — GAUGES */}
      <div
        className="text-[13px] font-bold tracking-wide"
        style={{ color: COLORS.muted }}
      >
        DESEMPENHO
      </div>
      <div
        className="grid gap-2.5 mb-2.5"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}
      >
        {cpuItem && (
          <Gauge
            value={cpuValue}
            label="CPU"
            color={CHART_COLORS.teal}
            tooltip={{
              title: "UTILIZAÇÃO DE CPU",
              lines: [
                `Em uso: <b style="color:${CHART_COLORS.teal}">${cpuValue.toFixed(2)}%</b>`,
                cpuIdleItem
                  ? `Ocioso: <b style="color:${CHART_COLORS.green}">${Number.parseFloat(cpuIdleItem.lastvalue).toFixed(2)}%</b>`
                  : "",
                cpuNumItem
                  ? `Núcleos: <b style="color:${CHART_COLORS.teal}">${Number.parseFloat(cpuNumItem.lastvalue).toFixed(0)}</b>`
                  : "",
                cpuLoadItem
                  ? `Load avg (1m): <b style="color:${CHART_COLORS.teal}">${Number.parseFloat(cpuLoadItem.lastvalue).toFixed(2)}</b>`
                  : "",
                interruptsItem
                  ? `Interrupts: <b style="color:${CHART_COLORS.teal}">${Number.parseFloat(interruptsItem.lastvalue).toFixed(0)}/s</b>`
                  : "",
                contextSwitchesItem
                  ? `Context switches: <b style="color:${CHART_COLORS.teal}">${Number.parseFloat(contextSwitchesItem.lastvalue).toFixed(0)}/s</b>`
                  : "",
              ].filter(Boolean),
            }}
          />
        )}
        {memItem && (
          <Gauge
            value={
              memUtilItem
                ? Number.parseFloat(memUtilItem.lastvalue)
                : memTotalItem
                  ? 100 -
                    (Number.parseFloat(memItem.lastvalue) /
                      Number.parseFloat(memTotalItem.lastvalue)) *
                      100
                  : 0
            }
            max={100}
            label="RAM"
            color={CHART_COLORS.cyan}
            unit="%"
            tooltip={{
              title: "UTILIZAÇÃO DE RAM",
              lines: [
                `Disponível: <b style="color:${CHART_COLORS.cyan}">${formatBytes(Number.parseFloat(memItem.lastvalue))}</b>`,
                memTotalItem
                  ? `Total: <b style="color:${CHART_COLORS.cyan}">${formatBytes(Number.parseFloat(memTotalItem.lastvalue))}</b>`
                  : "",
                memUtilItem
                  ? `Em uso: <b style="color:${CHART_COLORS.cyan}">${Number.parseFloat(memUtilItem.lastvalue).toFixed(1)}%</b>`
                  : "",
              ].filter(Boolean),
            }}
          />
        )}
      </div>

      {/* CPU BREAKDOWN — COMPOSIÇÃO DE CPU */}
      {cpuBreakdownItems.length > 0 && (
        <>
          <div
            className="text-[13px] font-bold tracking-wide"
            style={{ color: COLORS.muted }}
          >
            COMPOSIÇÃO DE CPU — DETALHAMENTO POR COMPONENTE
          </div>
          <div
            className="rounded-md p-3.5 mb-4"
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
            }}
          >
            {cpuIdleItem && (
              <div
                className="flex items-center justify-between mb-3 pb-3"
                style={{ borderBottom: `1px solid ${COLORS.border}` }}
              >
                <span
                  className="text-[12px] font-bold"
                  style={{ color: COLORS.muted }}
                >
                  CPU OCIOSA
                </span>
                <span
                  className="text-[14px] font-bold"
                  style={{ color: COLORS.green }}
                >
                  {Number.parseFloat(cpuIdleItem.lastvalue).toFixed(2)}%
                  <span
                    className="text-[11px] font-normal ml-1.5"
                    style={{ color: COLORS.muted }}
                  >
                    (% ocioso do tempo total)
                  </span>
                </span>
              </div>
            )}
            <div className="flex flex-col gap-2.5">
              {cpuBreakdownItems
                .filter((cpu) => !cpu.name.toLowerCase().includes("idle"))
                .sort(
                  (a, b) =>
                    Number.parseFloat(b.lastvalue) -
                    Number.parseFloat(a.lastvalue),
                )
                .map((cpu) => {
                  const labelMatch = /CPU\s+(.+?)\s+time/i.exec(cpu.name);
                  const label = labelMatch
                    ? labelMatch[1]
                    : cpu.name.replace("CPU ", "");
                  const val = Number.parseFloat(cpu.lastvalue);
                  const barColor =
                    val > 50
                      ? CHART_COLORS.red
                      : val > 20
                        ? CHART_COLORS.amber
                        : val > 5
                          ? CHART_COLORS.teal
                          : CHART_COLORS.green;
                  return (
                    <div key={cpu.itemid} className="flex items-center gap-3">
                      <span
                        className="text-[12px] font-medium shrink-0"
                        style={{
                          color: COLORS.text,
                          width: 90,
                          textOverflow: "ellipsis",
                          overflow: "hidden",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {label}
                      </span>
                      <div
                        className="flex-1 h-2 rounded-full overflow-hidden"
                        style={{ background: "var(--border-subtle)" }}
                      >
                        <div
                          className="h-2 rounded-full transition-all duration-300"
                          style={{
                            width: `${Math.min(val, 100)}%`,
                            background: barColor,
                          }}
                        />
                      </div>
                      <span
                        className="text-[12px] font-bold shrink-0"
                        style={{
                          color: barColor,
                          width: 55,
                          textAlign: "right",
                        }}
                      >
                        {val.toFixed(2)}%
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        </>
      )}

      {/* MEMÓRIA E SWAP — DETALHES */}
      {(memItem || swapFreeItem || swapPfreeItem) && (
        <>
          <div
            className="text-[13px] font-bold tracking-wide"
            style={{ color: COLORS.muted }}
          >
            MEMÓRIA E SWAP — DETALHES
          </div>
          <div
            className="grid gap-2.5 mb-4"
            style={{
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            }}
          >
            {memItem && (
              <div
                className="rounded-md p-3.5"
                style={{
                  background: COLORS.card,
                  border: `1px solid ${COLORS.border}`,
                }}
              >
                <div
                  className="text-[11px] font-bold mb-3"
                  style={{ color: COLORS.muted }}
                >
                  MEMÓRIA RAM
                </div>
                <div className="flex flex-col gap-2">
                  {memTotalItem && (
                    <div className="flex justify-between text-[12px]">
                      <span style={{ color: COLORS.muted }}>Total</span>
                      <span style={{ color: COLORS.text, fontWeight: "bold" }}>
                        {formatBytes(Number.parseFloat(memTotalItem.lastvalue))}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-[12px]">
                    <span style={{ color: COLORS.muted }}>Disponível</span>
                    <span
                      style={{ color: CHART_COLORS.cyan, fontWeight: "bold" }}
                    >
                      {formatBytes(Number.parseFloat(memItem.lastvalue))}
                    </span>
                  </div>
                  {memFreeItem && (
                    <div className="flex justify-between text-[12px]">
                      <span style={{ color: COLORS.muted }}>Livre</span>
                      <span
                        style={{
                          color: CHART_COLORS.green,
                          fontWeight: "bold",
                        }}
                      >
                        {formatBytes(Number.parseFloat(memFreeItem.lastvalue))}
                      </span>
                    </div>
                  )}
                  {memTotalItem && (
                    <div className="flex justify-between text-[12px]">
                      <span style={{ color: COLORS.muted }}>Em uso</span>
                      <span
                        style={{
                          color: CHART_COLORS.amber,
                          fontWeight: "bold",
                        }}
                      >
                        {formatBytes(
                          Number.parseFloat(memTotalItem.lastvalue) -
                            Number.parseFloat(memItem.lastvalue),
                        )}
                      </span>
                    </div>
                  )}
                  {memUtilItem && (
                    <div className="mt-1">
                      <div
                        className="h-1.5 rounded-full overflow-hidden"
                        style={{ background: "var(--border-subtle)" }}
                      >
                        <div
                          className="h-1.5 rounded-full"
                          style={{
                            width: `${Number.parseFloat(memUtilItem.lastvalue)}%`,
                            background: CHART_COLORS.cyan,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            {(swapFreeItem || swapPfreeItem) && (
              <div
                className="rounded-md p-3.5"
                style={{
                  background: COLORS.card,
                  border: `1px solid ${COLORS.border}`,
                }}
              >
                <div
                  className="text-[11px] font-bold mb-3"
                  style={{ color: COLORS.muted }}
                >
                  SWAP
                </div>
                <div className="flex flex-col gap-2">
                  {swapPfreeItem && (
                    <>
                      <div className="flex justify-between text-[12px]">
                        <span style={{ color: COLORS.muted }}>Em uso</span>
                        <span
                          style={{
                            color: CHART_COLORS.purple,
                            fontWeight: "bold",
                          }}
                        >
                          {(
                            100 - Number.parseFloat(swapPfreeItem.lastvalue)
                          ).toFixed(1)}
                          %
                        </span>
                      </div>
                      <div className="flex justify-between text-[12px]">
                        <span style={{ color: COLORS.muted }}>Livre</span>
                        <span
                          style={{
                            color: CHART_COLORS.green,
                            fontWeight: "bold",
                          }}
                        >
                          {Number.parseFloat(swapPfreeItem.lastvalue).toFixed(
                            1,
                          )}
                          %
                        </span>
                      </div>
                      <div className="mt-1">
                        <div
                          className="h-1.5 rounded-full overflow-hidden"
                          style={{ background: "var(--border-subtle)" }}
                        >
                          <div
                            className="h-1.5 rounded-full"
                            style={{
                              width: `${100 - Number.parseFloat(swapPfreeItem.lastvalue)}%`,
                              background: CHART_COLORS.purple,
                            }}
                          />
                        </div>
                      </div>
                    </>
                  )}
                  {swapFreeItem && !swapPfreeItem && (
                    <div className="flex justify-between text-[12px]">
                      <span style={{ color: COLORS.muted }}>Livre</span>
                      <span
                        style={{
                          color: CHART_COLORS.green,
                          fontWeight: "bold",
                        }}
                      >
                        {formatBytes(Number.parseFloat(swapFreeItem.lastvalue))}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
