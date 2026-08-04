// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// Sparklines de CPU, RAM, load average, rede e disco (I/O)

"use client";

import { MultiSparkline } from "@/components/multi-sparkline";
import { COLORS, CHART_COLORS, formatBytes, type ZabbixItem } from "./types";

interface SparklinesProps {
  sparkData: Record<string, number[]>;
  currentRangeSeconds: number;
  nowSec: number;
  cpuItem: ZabbixItem | undefined;
  memItem: ZabbixItem | undefined;
  memUtilItem: ZabbixItem | undefined;
  memBuffersItem: ZabbixItem | undefined;
  memCachedItem: ZabbixItem | undefined;
  cpuLoadItem: ZabbixItem | undefined;
  netInItem: ZabbixItem | undefined;
  netOutItem: ZabbixItem | undefined;
  netInterfacesByIface: {
    ifaceName: string;
    inItem: ZabbixItem | null;
    outItem: ZabbixItem | null;
  }[];
  selectedNetIface: string | null;
  onSelectNetIface: (iface: string) => void;
  onClearNetSparkData: () => void;
  diskReadOpsItem: ZabbixItem | undefined;
  diskWriteOpsItem: ZabbixItem | undefined;
  diskReadLatItem: ZabbixItem | undefined;
  diskWriteLatItem: ZabbixItem | undefined;
  diskReadQueueItem: ZabbixItem | undefined;
  diskWriteQueueItem: ZabbixItem | undefined;
}

export function Sparklines(props: SparklinesProps) {
  const {
    sparkData,
    currentRangeSeconds,
    nowSec,
    cpuItem,
    memItem,
    memBuffersItem,
    memCachedItem,
    cpuLoadItem,
    netInItem,
    netOutItem,
    netInterfacesByIface,
    selectedNetIface,
    onSelectNetIface,
    onClearNetSparkData,
    diskReadOpsItem,
    diskWriteOpsItem,
    diskReadLatItem,
    diskWriteLatItem,
    diskReadQueueItem,
    diskWriteQueueItem,
  } = props;

  return (
    <>
      {/* CPU ao longo do tempo */}
      {cpuItem && (sparkData.cpu ?? []).length > 0 && (
        <div className="mb-2.5">
          <MultiSparkline
            series={[
              {
                data: sparkData.cpu ?? [],
                color: CHART_COLORS.teal,
                label: "CPU (%)",
              },
            ]}
            height={140}
            unit="%"
            timeRangeSeconds={currentRangeSeconds}
            nowSec={nowSec}
            thresholds={[
              { value: 80, color: CHART_COLORS.amber, label: "80%" },
              { value: 95, color: CHART_COLORS.red, label: "95%" },
            ]}
          />
        </div>
      )}

      {/* RAM ao longo do tempo */}
      {memItem && (sparkData.memUtil ?? []).length > 0 && (
        <div className="mb-2.5">
          <MultiSparkline
            series={[
              {
                data: sparkData.memUtil ?? [],
                color: CHART_COLORS.cyan,
                label: "RAM em uso (%)",
              },
              {
                data: sparkData.memAvailable ?? [],
                color: CHART_COLORS.green,
                label: "RAM disponível",
              },
              ...(memBuffersItem
                ? [
                    {
                      data: sparkData.memBuffers ?? [],
                      color: CHART_COLORS.amber,
                      label: "Buffers",
                    },
                  ]
                : []),
              ...(memCachedItem
                ? [
                    {
                      data: sparkData.memCached ?? [],
                      color: CHART_COLORS.purple,
                      label: "Cached",
                    },
                  ]
                : []),
            ]}
            height={140}
            formatValue={(v) =>
              v <= 100 ? `${v.toFixed(1)}%` : formatBytes(v)
            }
            timeRangeSeconds={currentRangeSeconds}
            nowSec={nowSec}
            thresholds={[
              { value: 80, color: CHART_COLORS.amber, label: "80%" },
              { value: 95, color: CHART_COLORS.red, label: "95%" },
            ]}
          />
        </div>
      )}

      {/* Fila de CPU (load average) */}
      {cpuLoadItem && (sparkData.cpuLoad ?? []).length > 0 && (
        <div className="mb-4">
          <MultiSparkline
            series={[
              {
                data: sparkData.cpuLoad ?? [],
                color: CHART_COLORS.purple,
                label: "Fila de CPU (load avg)",
              },
            ]}
            height={100}
            timeRangeSeconds={currentRangeSeconds}
            nowSec={nowSec}
          />
        </div>
      )}

      {/* REDE — TRÁFEGO DE INTERFACE */}
      {(netInItem || netOutItem) && (
        <>
          <div className="flex items-center gap-3 flex-wrap mb-2">
            <div
              className="text-[13px] font-bold tracking-wide"
              style={{ color: COLORS.muted }}
            >
              REDE — TRÁFEGO DE INTERFACE
            </div>
            {netInterfacesByIface.length > 1 && (
              <select
                value={
                  selectedNetIface ?? netInterfacesByIface[0]?.ifaceName ?? ""
                }
                onChange={(e) => {
                  onSelectNetIface(e.target.value);
                  onClearNetSparkData();
                }}
                className="text-[12px] px-2 py-1 rounded border"
                style={{
                  background: COLORS.card,
                  color: COLORS.text,
                  borderColor: COLORS.border,
                  cursor: "pointer",
                }}
              >
                {netInterfacesByIface.map((iface) => (
                  <option key={iface.ifaceName} value={iface.ifaceName}>
                    {iface.ifaceName.startsWith("if.")
                      ? `Interface #${iface.ifaceName.replace("if.", "")}`
                      : iface.ifaceName}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="mb-4">
            <MultiSparkline
              series={[
                {
                  data: sparkData.netIn ?? [],
                  color: CHART_COLORS.purpleRead,
                  label: "Recebido (in)",
                },
                {
                  data: sparkData.netOut ?? [],
                  color: CHART_COLORS.amber,
                  label: "Enviado (out)",
                },
              ]}
              height={140}
              timeRangeSeconds={currentRangeSeconds}
              nowSec={nowSec}
              formatValue={(v) => {
                if (v >= 1000000000)
                  return (v / 1000000000).toFixed(2) + " Gbps";
                if (v >= 1000000) return (v / 1000000).toFixed(1) + " Mbps";
                if (v >= 1000) return (v / 1000).toFixed(1) + " Kbps";
                return v.toFixed(0) + " bps";
              }}
            />
          </div>
        </>
      )}

      {/* DISCO — LEITURA E ESCRITA */}
      {(diskReadOpsItem ||
        diskWriteOpsItem ||
        diskReadLatItem ||
        diskReadQueueItem) && (
        <>
          <div
            className="text-[13px] font-bold tracking-wide"
            style={{ color: COLORS.muted }}
          >
            DISCO — LEITURA E ESCRITA
          </div>
          <div
            className="grid gap-2.5 mb-4"
            style={{
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            }}
          >
            {(diskReadOpsItem || diskWriteOpsItem) && (
              <div
                className="rounded-md p-3"
                style={{
                  background: COLORS.card,
                  border: `1px solid ${COLORS.border}`,
                }}
              >
                <div
                  className="text-[11px] mb-2"
                  style={{ color: COLORS.muted }}
                >
                  IOPS — Leituras e Gravações/s
                </div>
                <MultiSparkline
                  series={[
                    {
                      data: sparkData.diskReadOps ?? [],
                      color: CHART_COLORS.purpleRead,
                      label: "Leitura",
                    },
                    {
                      data: sparkData.diskWriteOps ?? [],
                      color: CHART_COLORS.amber,
                      label: "Gravação",
                    },
                  ]}
                  height={100}
                  unit="op/s"
                  timeRangeSeconds={currentRangeSeconds}
                  nowSec={nowSec}
                />
              </div>
            )}
            {(diskReadLatItem || diskWriteLatItem) && (
              <div
                className="rounded-md p-3"
                style={{
                  background: COLORS.card,
                  border: `1px solid ${COLORS.border}`,
                }}
              >
                <div
                  className="text-[11px] mb-2"
                  style={{ color: COLORS.muted }}
                >
                  Latência de Leitura e Gravação (ms)
                </div>
                <MultiSparkline
                  series={[
                    {
                      data: sparkData.diskReadLat ?? [],
                      color: CHART_COLORS.purpleRead,
                      label: "Leitura",
                    },
                    {
                      data: sparkData.diskWriteLat ?? [],
                      color: CHART_COLORS.amber,
                      label: "Gravação",
                    },
                  ]}
                  height={100}
                  unit="ms"
                  timeRangeSeconds={currentRangeSeconds}
                  nowSec={nowSec}
                />
              </div>
            )}
            {(diskReadQueueItem || diskWriteQueueItem) && (
              <div
                className="rounded-md p-3"
                style={{
                  background: COLORS.card,
                  border: `1px solid ${COLORS.border}`,
                }}
              >
                <div
                  className="text-[11px] mb-2"
                  style={{ color: COLORS.muted }}
                >
                  Fila de Disco (leitura/gravação)
                </div>
                <MultiSparkline
                  series={[
                    {
                      data: sparkData.diskReadQueue ?? [],
                      color: CHART_COLORS.purple,
                      label: "Leitura",
                    },
                    {
                      data: sparkData.diskWriteQueue ?? [],
                      color: CHART_COLORS.blue,
                      label: "Gravação",
                    },
                  ]}
                  height={100}
                  timeRangeSeconds={currentRangeSeconds}
                  nowSec={nowSec}
                />
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
