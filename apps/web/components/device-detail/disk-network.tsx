// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// Disco — utilização por volume, sunburst e rede por interface

"use client";

import dynamic from "next/dynamic";
import {
  COLORS,
  CHART_COLORS,
  formatBytes,
  formatMetricValue,
  type ZabbixItem,
} from "./types";

const DiskSunburst = dynamic(
  () => import("@/components/disk-sunburst").then((m) => m.DiskSunburst),
  { ssr: false },
);

interface DiskSectionProps {
  fsItems: ZabbixItem[];
  fsTotalItems: ZabbixItem[];
  fsUsedItems: ZabbixItem[];
  fsFreeItems: ZabbixItem[];
  netInterfaceNames: string[];
  netInterfaceItems: ZabbixItem[];
}

export function DiskSection(props: DiskSectionProps) {
  const { fsItems, fsTotalItems, fsUsedItems, fsFreeItems } = props;

  if (fsItems.length === 0 && fsTotalItems.length === 0) return null;

  return (
    <>
      {/* DISCO — UTILIZAÇÃO POR VOLUME */}
      {fsItems.length > 0 && (
        <>
          <div
            className="text-[13px] font-bold tracking-wide"
            style={{ color: COLORS.muted }}
          >
            DISCO — UTILIZAÇÃO POR VOLUME
          </div>
          <div
            className="rounded-md p-3.5 mb-4"
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
            }}
          >
            <div className="text-[11px] mb-3" style={{ color: COLORS.muted }}>
              Percentual de uso por drive (100% - tempo ocioso)
            </div>
            <div className="flex flex-col gap-3">
              {fsItems.map((fs) => {
                const driveMatch = fs.key_.match(/vfs\.fs\.size\[([^\],]+)/);
                const driveName = driveMatch ? driveMatch[1] : fs.name;
                const pct = parseFloat(fs.lastvalue);
                const barColor =
                  pct > 80
                    ? CHART_COLORS.red
                    : pct > 60
                      ? CHART_COLORS.amber
                      : CHART_COLORS.cyan;
                const totalItem = fsTotalItems.find((t) =>
                  t.key_.includes(driveName),
                );
                const usedItem = fsUsedItems.find((u) =>
                  u.key_.includes(driveName),
                );
                return (
                  <div key={fs.itemid}>
                    <div className="flex justify-between items-center mb-1.5">
                      <span
                        className="text-[12px] font-medium"
                        style={{ color: COLORS.text }}
                      >
                        {driveName}
                      </span>
                      <span
                        className="text-[12px] font-bold"
                        style={{ color: barColor }}
                      >
                        {pct.toFixed(1)}%
                      </span>
                    </div>
                    <div
                      className="h-1.5 rounded-full overflow-hidden"
                      style={{ background: "var(--border-subtle)" }}
                    >
                      <div
                        className="h-1.5 rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.min(pct, 100)}%`,
                          background: barColor,
                        }}
                      />
                    </div>
                    {totalItem && usedItem && (
                      <div
                        className="text-[11px] mt-1"
                        style={{ color: COLORS.muted }}
                      >
                        {formatBytes(parseFloat(usedItem.lastvalue))} de{" "}
                        {formatBytes(parseFloat(totalItem.lastvalue))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* MAPA DE USO DE DISCO POR PASTA — SUNBURST */}
      {fsTotalItems.length > 0 && (
        <>
          <div
            className="text-[13px] font-bold tracking-wide"
            style={{ color: COLORS.muted }}
          >
            MAPA DE USO DE DISCO POR PASTA
          </div>
          <div
            className="rounded-md p-4 mb-4"
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
            }}
          >
            <DiskSunburst
              data={fsTotalItems.map((totalItem) => {
                const driveMatch = totalItem.key_.match(
                  /vfs\.fs\.size\[([^\],]+)/,
                );
                const driveName = driveMatch ? driveMatch[1] : totalItem.name;
                const totalBytes = parseFloat(totalItem.lastvalue);
                const usedItem = fsUsedItems.find((u) =>
                  u.key_.includes(driveName),
                );
                const freeItem = fsFreeItems.find((f) =>
                  f.key_.includes(driveName),
                );
                const usedBytes = usedItem ? parseFloat(usedItem.lastvalue) : 0;
                const freeBytes = freeItem
                  ? parseFloat(freeItem.lastvalue)
                  : totalBytes - usedBytes;
                return {
                  name: driveName,
                  value: totalBytes,
                  children: [
                    { name: "Usado", value: usedBytes },
                    { name: "Livre", value: freeBytes },
                  ],
                };
              })}
            />
            <div className="text-[11px] mt-2" style={{ color: COLORS.muted }}>
              Clique em qualquer setor para ver detalhes. Use o breadcrumb para
              navegar entre níveis.
            </div>
          </div>
        </>
      )}
    </>
  );
}

interface NetworkDetailsProps {
  netInterfaceNames: string[];
  netInterfaceItems: ZabbixItem[];
}

export function NetworkDetails({
  netInterfaceNames,
  netInterfaceItems,
}: NetworkDetailsProps) {
  if (netInterfaceNames.length === 0) return null;

  return (
    <>
      <div
        className="text-[13px] font-bold tracking-wide"
        style={{ color: COLORS.muted }}
      >
        REDE — DETALHES POR INTERFACE
      </div>
      <div
        className="grid gap-2.5 mb-4"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}
      >
        {netInterfaceNames.map((iface) => {
          const isSnmpIf = iface.startsWith("if.");
          const ifSuffix = isSnmpIf ? iface.split(".")[1] : null;
          const matchIf = (keyPart: string) => {
            if (ifSuffix) {
              return netInterfaceItems.find(
                (i) =>
                  i.key_.includes(keyPart) && i.key_.endsWith(`.${ifSuffix}]`),
              );
            }
            return netInterfaceItems.find(
              (i) => i.key_.includes(keyPart) && i.name.includes(iface),
            );
          };
          const inItem = matchIf("ifHCInOctets") ?? matchIf("net.if.in");
          const outItem = matchIf("ifHCOutOctets") ?? matchIf("net.if.out");
          const statusItem =
            matchIf("ifOperStatus") ?? matchIf("net.if.status");
          const speedItem = matchIf("ifHighSpeed") ?? matchIf("net.if.speed");
          const errorsInItem =
            matchIf("ifInErrors") ?? matchIf("net.if.in.errors");
          const errorsOutItem =
            matchIf("ifOutErrors") ?? matchIf("net.if.out.errors");
          const discardsInItem =
            matchIf("ifInDiscards") ?? matchIf("net.if.in.discards");
          const discardsOutItem =
            matchIf("ifOutDiscards") ?? matchIf("net.if.out.discards");
          const displayName = (() => {
            if (!isSnmpIf) return iface;
            const refItem = inItem ?? outItem ?? statusItem;
            if (refItem) {
              const nameMatch = refItem.name.match(/Interface\s+(\S+)\(\)/i);
              if (nameMatch) return nameMatch[1];
            }
            return iface;
          })();
          const isUp = statusItem
            ? parseFloat(statusItem.lastvalue) === 1
            : null;
          if (!inItem && !outItem && !statusItem && !speedItem) return null;
          return (
            <div
              key={iface}
              className="rounded-md p-3.5"
              style={{
                background: COLORS.card,
                border: `1px solid ${COLORS.border}`,
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <span
                  className="text-[12px] font-bold"
                  style={{ color: COLORS.text }}
                >
                  {displayName}
                </span>
                {isUp !== null && (
                  <span
                    className="flex items-center gap-1.5 text-[11px] font-bold"
                    style={{
                      color: isUp ? CHART_COLORS.green : CHART_COLORS.red,
                    }}
                  >
                    <span
                      className="rounded-full"
                      style={{
                        width: 6,
                        height: 6,
                        background: isUp
                          ? CHART_COLORS.green
                          : CHART_COLORS.red,
                      }}
                    />
                    {isUp ? "UP" : "DOWN"}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                {inItem && (
                  <div className="flex justify-between text-[11px]">
                    <span style={{ color: COLORS.muted }}>Recebido</span>
                    <span
                      style={{ color: CHART_COLORS.teal, fontWeight: "bold" }}
                    >
                      {formatMetricValue(inItem.lastvalue, "bps")}
                    </span>
                  </div>
                )}
                {outItem && (
                  <div className="flex justify-between text-[11px]">
                    <span style={{ color: COLORS.muted }}>Enviado</span>
                    <span
                      style={{ color: CHART_COLORS.cyan, fontWeight: "bold" }}
                    >
                      {formatMetricValue(outItem.lastvalue, "bps")}
                    </span>
                  </div>
                )}
                {speedItem && parseFloat(speedItem.lastvalue) > 0 && (
                  <div className="flex justify-between text-[11px]">
                    <span style={{ color: COLORS.muted }}>Velocidade</span>
                    <span style={{ color: COLORS.muted }}>
                      {formatMetricValue(speedItem.lastvalue, "bps")}
                    </span>
                  </div>
                )}
                {errorsInItem && parseFloat(errorsInItem.lastvalue) > 0 && (
                  <div className="flex justify-between text-[11px]">
                    <span style={{ color: COLORS.muted }}>Erros (in)</span>
                    <span
                      style={{ color: CHART_COLORS.red, fontWeight: "bold" }}
                    >
                      {errorsInItem.lastvalue}
                    </span>
                  </div>
                )}
                {errorsOutItem && parseFloat(errorsOutItem.lastvalue) > 0 && (
                  <div className="flex justify-between text-[11px]">
                    <span style={{ color: COLORS.muted }}>Erros (out)</span>
                    <span
                      style={{ color: CHART_COLORS.red, fontWeight: "bold" }}
                    >
                      {errorsOutItem.lastvalue}
                    </span>
                  </div>
                )}
                {discardsInItem && parseFloat(discardsInItem.lastvalue) > 0 && (
                  <div className="flex justify-between text-[11px]">
                    <span style={{ color: COLORS.muted }}>Descartes (in)</span>
                    <span
                      style={{ color: CHART_COLORS.amber, fontWeight: "bold" }}
                    >
                      {discardsInItem.lastvalue}
                    </span>
                  </div>
                )}
                {discardsOutItem &&
                  parseFloat(discardsOutItem.lastvalue) > 0 && (
                    <div className="flex justify-between text-[11px]">
                      <span style={{ color: COLORS.muted }}>
                        Descartes (out)
                      </span>
                      <span
                        style={{
                          color: CHART_COLORS.amber,
                          fontWeight: "bold",
                        }}
                      >
                        {discardsOutItem.lastvalue}
                      </span>
                    </div>
                  )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
