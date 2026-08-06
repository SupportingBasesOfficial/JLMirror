// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  COLORS,
  CHART_COLORS,
  TIME_RANGES,
  AUTO_REFRESH_INTERVAL,
  detectDeviceType,
  categorizeMetrics,
  findItem,
  formatBytes,
  formatUptime,
  useMounted,
  type ZabbixItem,
  type HistoryEntry,
  type ZabbixTrigger,
  type DeviceDetailClientProps,
} from "./device-detail/types";
import { DeviceHeader } from "./device-detail/header";
import { AlertsTab } from "./device-detail/alerts-tab";
import { Gauges } from "./device-detail/gauges";
import { Sparklines } from "./device-detail/sparklines";
import { DiskSection, NetworkDetails } from "./device-detail/disk-network";
import { ServicesProcesses } from "./device-detail/services-processes";
import { ItemsTable } from "./device-detail/items-table";
import { ChartSection } from "./device-detail/chart-section";

export function DeviceDetailClient({
  items,
  hostId,
  hostName,
  hostIp,
  triggers = [],
}: DeviceDetailClientProps) {
  const [timeRange, setTimeRange] = useState<string>("1h");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sparkData, setSparkData] = useState<Record<string, number[]>>({});
  const [nowSec, setNowSec] = useState(0);

  const deviceType = detectDeviceType(items);
  const metricCategories = categorizeMetrics(items);

  const [collapsedCategories, setCollapsedCategories] = useState<string[]>(
    metricCategories.map((c) => c.key),
  );
  const [hiddenMetrics, setHiddenMetrics] = useState<string[]>([]);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  const categoryKeys = metricCategories.map((c) => c.key).join(",");
  useEffect(() => {
    setCollapsedCategories((prev) => {
      const keys = categoryKeys.split(",").filter(Boolean);
      const knownKeys = new Set(prev);
      const newCollapsed = keys.filter((key) => !knownKeys.has(key));
      if (newCollapsed.length === 0) return prev;
      return [...prev, ...newCollapsed];
    });
  }, [categoryKeys]);

  const triggerCount = triggers.length;
  useEffect(() => {
    if (triggerCount === 0) return;
    setCollapsedCategories((prev) => {
      const alertKeys = ["alert_critical", "alert_warning", "alert_info"];
      const knownKeys = new Set(prev);
      const newCollapsed = alertKeys.filter((key) => !knownKeys.has(key));
      if (newCollapsed.length === 0) return prev;
      return [...prev, ...newCollapsed];
    });
  }, [triggerCount]);

  useEffect(() => {
    let cancelled = false;
    async function loadPrefs() {
      try {
        const res = await fetch(`/api/zabbix/devices/${hostId}/prefs`, {
          credentials: "include",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (data.prefs) {
          if (
            data.prefs.collapsed_categories !== undefined &&
            data.prefs.collapsed_categories !== null
          ) {
            const alertKeys = ["alert_critical", "alert_warning", "alert_info"];
            const prefKeys = data.prefs.collapsed_categories as string[];
            const merged = [...new Set([...prefKeys, ...alertKeys])];
            setCollapsedCategories(merged);
          }
          if (
            data.prefs.hidden_metrics !== undefined &&
            data.prefs.hidden_metrics !== null
          ) {
            setHiddenMetrics(data.prefs.hidden_metrics);
          }
        }
      } catch {
        // Silencioso
      } finally {
        if (!cancelled) setPrefsLoaded(true);
      }
    }
    loadPrefs();
    return () => {
      cancelled = true;
    };
  }, [hostId]);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savePrefs = useCallback(
    (collapsed: string[], hidden: string[]) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(async () => {
        try {
          await fetch(`/api/zabbix/devices/${hostId}/prefs`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              device_type: deviceType,
              collapsed_categories: collapsed,
              hidden_metrics: hidden,
            }),
          });
        } catch {
          // Silencioso
        }
      }, 800);
    },
    [hostId, deviceType],
  );

  const toggleCategoryCollapse = useCallback(
    (catKey: string) => {
      setCollapsedCategories((prev) => {
        const next = prev.includes(catKey)
          ? prev.filter((c) => c !== catKey)
          : [...prev, catKey];
        savePrefs(next, hiddenMetrics);
        return next;
      });
    },
    [hiddenMetrics, savePrefs],
  );

  const toggleMetricVisibility = useCallback(
    (itemId: string) => {
      setHiddenMetrics((prev) => {
        const next = prev.includes(itemId)
          ? prev.filter((id) => id !== itemId)
          : [...prev, itemId];
        savePrefs(collapsedCategories, next);
        return next;
      });
    },
    [collapsedCategories, savePrefs],
  );

  // Derived items
  const cpuItem = findItem(items, "system.cpu.util");
  const memItem =
    findItem(items, "vm.memory.available") ?? findItem(items, "vm.memory.free");
  const memTotalItem = findItem(items, "vm.memory.total");
  const memUtilItem = findItem(items, "vm.memory.util");
  const memBuffersItem = findItem(items, "vm.memory.buffers");
  const memCachedItem = findItem(items, "vm.memory.cached");
  const uptimeItem =
    findItem(items, "system.uptime") ?? findItem(items, "uptime");
  const hwUptimeItem = items.find((i) => i.key_.startsWith("system.hw.uptime"));
  const netUptimeItem = items.find((i) =>
    i.key_.startsWith("system.net.uptime"),
  );
  const icmpPingItem = items.find((i) => i.key_ === "icmpping");
  const icmpLossItem = items.find((i) => i.key_ === "icmppingloss");
  const icmpSecItem = items.find((i) => i.key_ === "icmppingsec");
  const cpuNumItem = findItem(items, "system.cpu.num");
  const interruptsItem = findItem(items, "system.cpu.intr");
  const snmpAvailItem = items.find(
    (i) => i.key_ === "zabbix[host,snmp,available]",
  );
  const systemNameItem = items.find((i) => i.key_.startsWith("system.name"));
  const systemDescrItem = items.find((i) => i.key_.startsWith("system.descr"));
  const systemLocationItem = items.find((i) =>
    i.key_.startsWith("system.location"),
  );
  const systemContactItem = items.find((i) =>
    i.key_.startsWith("system.contact"),
  );
  const systemObjectIdItem = items.find((i) =>
    i.key_.startsWith("system.objectid"),
  );
  const tempItems = items.filter(
    (i) =>
      i.key_.startsWith("sensor.temp") || i.key_.startsWith("system.hw.temp"),
  );
  const tcpPortItems = items.filter(
    (i) =>
      i.key_.startsWith("net.tcp.listen[") ||
      i.key_.startsWith("net.tcp.port["),
  );
  const udpPortItems = items.filter(
    (i) =>
      i.key_.startsWith("net.udp.listen[") ||
      i.key_.startsWith("net.udp.port["),
  );
  const sslCertItems = items.filter(
    (i) => i.key_.startsWith("cert.") || i.key_.startsWith("web.test."),
  );

  const currentRangeSeconds = TIME_RANGES[timeRange] ?? 3600;
  const netInItem =
    findItem(items, "ifHCInOctets") ?? findItem(items, "net.if.in");
  const netOutItem =
    findItem(items, "ifHCOutOctets") ?? findItem(items, "net.if.out");

  const fsItems = items.filter(
    (i) => i.key_.startsWith("vfs.fs.size[") && i.key_.endsWith(",pused]"),
  );
  const fsTotalItems = items.filter(
    (i) => i.key_.startsWith("vfs.fs.size[") && i.key_.endsWith(",total]"),
  );
  const fsUsedItems = items.filter(
    (i) => i.key_.startsWith("vfs.fs.size[") && i.key_.endsWith(",used]"),
  );
  const fsFreeItems = items.filter(
    (i) => i.key_.startsWith("vfs.fs.size[") && i.key_.endsWith(",free]"),
  );

  const diskReadOpsItem = findItem(items, "vfs.dev.read.ops");
  const diskWriteOpsItem = findItem(items, "vfs.dev.write.ops");
  const diskReadLatItem = findItem(items, "vfs.dev.read.lat");
  const diskWriteLatItem = findItem(items, "vfs.dev.write.lat");
  const diskReadQueueItem = findItem(items, "vfs.dev.read.queue");
  const diskWriteQueueItem = findItem(items, "vfs.dev.write.queue");

  const cpuLoadItem = items.find(
    (i) => i.key_.startsWith("system.cpu.load[") && i.key_.includes("avg1"),
  );

  const cpuBreakdownItems = items.filter(
    (i) =>
      i.key_.startsWith("system.cpu.") &&
      !i.key_.includes("util") &&
      !i.key_.includes("load") &&
      !i.key_.includes("switches") &&
      !i.key_.includes("intr") &&
      !i.key_.includes("num") &&
      i.name.toLowerCase().includes("time") &&
      parseFloat(i.lastvalue) >= 0 &&
      parseFloat(i.lastvalue) <= 100,
  );
  const cpuIdleItem = cpuBreakdownItems.find((i) =>
    i.name.toLowerCase().includes("idle"),
  );

  const swapFreeItem = items.find(
    (i) =>
      (i.key_.startsWith("system.swap.size[") &&
        (i.key_.endsWith(",free]") || i.key_.endsWith(",pfree]"))) ||
      i.key_.startsWith("system.swap.free["),
  );
  const swapPfreeItem = items.find(
    (i) => i.key_.startsWith("system.swap.") && i.key_.includes("pfree"),
  );

  const memFreeItem = findItem(items, "vm.memory.free");

  const netInterfaceItems = useMemo(
    () => items.filter((i) => i.key_.startsWith("net.if.")),
    [items],
  );
  const netInterfaceNames = useMemo(
    () =>
      Array.from(
        new Set(
          netInterfaceItems
            .map((i) => {
              const nameMatch = i.name.match(/Interface\s+(\S+)\(\)/i);
              if (nameMatch) return nameMatch[1];
              const keyMatch = i.key_.match(/net\.if\.\w+\[([^\]]+)\]/);
              if (keyMatch) {
                const raw = keyMatch[1];
                const parts = raw.split(".");
                if (parts.length > 1) return `if.${parts[parts.length - 1]}`;
                return raw;
              }
              return null;
            })
            .filter((n): n is string => n !== null),
        ),
      ),
    [netInterfaceItems],
  );

  const netInterfacesByIface = netInterfaceNames
    .map((ifaceName) => {
      const inItem = netInterfaceItems.find((i) => {
        const nameMatch = i.name.match(/Interface\s+(\S+)\(\)/i);
        const extracted = nameMatch
          ? nameMatch[1]
          : (() => {
              const keyMatch = i.key_.match(/net\.if\.\w+\[([^\]]+)\]/);
              if (!keyMatch) return null;
              const raw = keyMatch[1];
              const parts = raw.split(".");
              return parts.length > 1 ? `if.${parts[parts.length - 1]}` : raw;
            })();
        return (
          extracted === ifaceName &&
          (i.key_.includes("InOctets") || i.key_.startsWith("net.if.in"))
        );
      });
      const outItem = netInterfaceItems.find((i) => {
        const nameMatch = i.name.match(/Interface\s+(\S+)\(\)/i);
        const extracted = nameMatch
          ? nameMatch[1]
          : (() => {
              const keyMatch = i.key_.match(/net\.if\.\w+\[([^\]]+)\]/);
              if (!keyMatch) return null;
              const raw = keyMatch[1];
              const parts = raw.split(".");
              return parts.length > 1 ? `if.${parts[parts.length - 1]}` : raw;
            })();
        return (
          extracted === ifaceName &&
          (i.key_.includes("OutOctets") || i.key_.startsWith("net.if.out"))
        );
      });
      return { ifaceName, inItem: inItem ?? null, outItem: outItem ?? null };
    })
    .filter((iface) => iface.inItem || iface.outItem);

  const contextSwitchesItem = findItem(items, "system.cpu.switches");

  const updatesPendingItem = items.find(
    (i) =>
      (i.key_.includes("wmi.get") && i.name.toLowerCase().includes("update")) ||
      i.key_.includes("apt.update") ||
      i.key_.includes("pkg.update"),
  );
  const rebootPendingItem = items.find(
    (i) =>
      i.key_.includes("system.hw.reboot") ||
      (i.key_.includes("wmi.get") && i.name.toLowerCase().includes("reboot")) ||
      (i.key_.includes("system.run") &&
        i.name.toLowerCase().includes("reboot")),
  );

  const serviceItems = items.filter(
    (i) =>
      (i.key_.startsWith("service.info[") && i.key_.endsWith(",state]")) ||
      (i.key_.startsWith("proc.num[") && !i.key_.includes("zabbix")),
  );

  const procItems = items.filter(
    (i) =>
      i.key_.startsWith("proc.cpu.util[") || i.key_.startsWith("proc.mem["),
  );

  const cpuValue = cpuItem ? parseFloat(cpuItem.lastvalue) : 0;
  const icmpPing = icmpPingItem
    ? parseFloat(icmpPingItem.lastvalue) === 1
    : false;
  const icmpLoss = icmpLossItem ? parseFloat(icmpLossItem.lastvalue) : 0;
  const icmpSec = icmpSecItem ? parseFloat(icmpSecItem.lastvalue) : 0;
  const uptimeValue = uptimeItem ? parseFloat(uptimeItem.lastvalue) : 0;

  const [selectedItem, setSelectedItem] = useState<ZabbixItem | null>(
    cpuItem ??
      items.find(
        (i) => String(i.value_type) === "0" || String(i.value_type) === "3",
      ) ??
      null,
  );
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [metricSearch, setMetricSearch] = useState("");
  const [selectedNetIface, setSelectedNetIface] = useState<string | null>(null);
  const mounted = useMounted();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchHistory = useCallback(
    async (item: ZabbixItem, range: string, silent = false) => {
      if (!silent) setLoading(true);
      setError(null);
      const now = Math.floor(Date.now() / 1000);
      const seconds = TIME_RANGES[range as keyof typeof TIME_RANGES] ?? 3600;
      const from = now - seconds;

      try {
        let res = await fetch(
          `/api/zabbix/history?item_id=${item.itemid}&from=${from}&to=${now}&value_type=${item.value_type}`,
          { credentials: "include" },
        );
        if (res.status === 401) {
          await new Promise((r) => setTimeout(r, 500));
          res = await fetch(
            `/api/zabbix/history?item_id=${item.itemid}&from=${from}&to=${now}&value_type=${item.value_type}`,
            { credentials: "include" },
          );
        }
        const data = await res.json();
        if (!res.ok) {
          setError(data.error?.message ?? "Erro ao buscar histórico");
          setHistory([]);
        } else {
          setHistory(data.data ?? []);
        }
      } catch {
        setError("Erro de conexão");
        setHistory([]);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [],
  );

  const fetchSparklines = useCallback(
    async (range: string) => {
      const now = Math.floor(Date.now() / 1000);
      setNowSec(now);
      const seconds = TIME_RANGES[range as keyof typeof TIME_RANGES] ?? 3600;
      const from = now - seconds;

      const allNetIfaces = netInterfaceNames
        .map((ifaceName) => {
          const inItem = netInterfaceItems.find((i) => {
            const nameMatch = i.name.match(/Interface\s+(\S+)\(\)/i);
            const extracted = nameMatch
              ? nameMatch[1]
              : (() => {
                  const keyMatch = i.key_.match(/net\.if\.\w+\[([^\]]+)\]/);
                  if (!keyMatch) return null;
                  const raw = keyMatch[1];
                  const parts = raw.split(".");
                  return parts.length > 1
                    ? `if.${parts[parts.length - 1]}`
                    : raw;
                })();
            return (
              extracted === ifaceName &&
              (i.key_.includes("InOctets") || i.key_.startsWith("net.if.in"))
            );
          });
          const outItem = netInterfaceItems.find((i) => {
            const nameMatch = i.name.match(/Interface\s+(\S+)\(\)/i);
            const extracted = nameMatch
              ? nameMatch[1]
              : (() => {
                  const keyMatch = i.key_.match(/net\.if\.\w+\[([^\]]+)\]/);
                  if (!keyMatch) return null;
                  const raw = keyMatch[1];
                  const parts = raw.split(".");
                  return parts.length > 1
                    ? `if.${parts[parts.length - 1]}`
                    : raw;
                })();
            return (
              extracted === ifaceName &&
              (i.key_.includes("OutOctets") || i.key_.startsWith("net.if.out"))
            );
          });
          return {
            ifaceName,
            inItem: inItem ?? null,
            outItem: outItem ?? null,
          };
        })
        .filter((iface) => iface.inItem || iface.outItem);

      const selectedIface =
        allNetIfaces.find((iface) => iface.ifaceName === selectedNetIface) ??
        allNetIfaces[0];

      const sparkItems = [
        { key: "cpu", item: cpuItem },
        { key: "cpuLoad", item: cpuLoadItem },
        { key: "memUtil", item: memUtilItem },
        { key: "memAvailable", item: memItem },
        { key: "memBuffers", item: memBuffersItem },
        { key: "memCached", item: memCachedItem },
        { key: "netIn", item: selectedIface?.inItem ?? netInItem },
        { key: "netOut", item: selectedIface?.outItem ?? netOutItem },
        { key: "diskReadOps", item: diskReadOpsItem },
        { key: "diskWriteOps", item: diskWriteOpsItem },
        { key: "diskReadLat", item: diskReadLatItem },
        { key: "diskWriteLat", item: diskWriteLatItem },
        { key: "diskReadQueue", item: diskReadQueueItem },
        { key: "diskWriteQueue", item: diskWriteQueueItem },
      ].filter((s) => s.item);

      for (const s of sparkItems) {
        if (!s.item) continue;
        try {
          let res = await fetch(
            `/api/zabbix/history?item_id=${s.item.itemid}&from=${from}&to=${now}&value_type=${s.item.value_type}`,
            { credentials: "include" },
          );
          if (res.status === 401) {
            await new Promise((r) => setTimeout(r, 500));
            res = await fetch(
              `/api/zabbix/history?item_id=${s.item.itemid}&from=${from}&to=${now}&value_type=${s.item.value_type}`,
              { credentials: "include" },
            );
          }
          const data = await res.json();
          if (res.ok && data.data) {
            setSparkData((prev) => ({
              ...prev,
              [s.key]: data.data.map((h: HistoryEntry) => parseFloat(h.value)),
            }));
          }
        } catch {
          // Ignora erros individuais
        }
      }
    },
    [
      cpuItem,
      cpuLoadItem,
      memUtilItem,
      memItem,
      memBuffersItem,
      memCachedItem,
      netInItem,
      netOutItem,
      selectedNetIface,
      netInterfaceNames,
      netInterfaceItems,
      diskReadOpsItem,
      diskWriteOpsItem,
      diskReadLatItem,
      diskWriteLatItem,
      diskReadQueueItem,
      diskWriteQueueItem,
    ],
  );

  const handleItemChange = (itemid: string) => {
    const item = items.find((i) => i.itemid === itemid);
    if (item) {
      setSelectedItem(item);
      fetchHistory(item, timeRange);
    }
  };

  const handleRangeChange = (range: string) => {
    setTimeRange(range);
    if (selectedItem) {
      fetchHistory(selectedItem, range);
    }
    fetchSparklines(range);
  };

  const handleRefresh = useCallback(
    (silent = false) => {
      if (selectedItem) {
        fetchHistory(selectedItem, timeRange, silent);
      }
      fetchSparklines(timeRange);
      setLastUpdate(new Date().toLocaleTimeString("pt-BR"));
    },
    [selectedItem, timeRange, fetchHistory, fetchSparklines],
  );

  useEffect(() => {
    if (selectedItem) {
      fetchHistory(selectedItem, timeRange);
    }
    fetchSparklines(timeRange);
  }, [selectedItem, timeRange, fetchHistory, fetchSparklines]);

  useEffect(() => {
    if (!autoRefresh) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      handleRefresh(true);
    }, AUTO_REFRESH_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoRefresh, handleRefresh]);

  const numericItems = items.filter(
    (i) => String(i.value_type) === "0" || String(i.value_type) === "3",
  );

  const kpiCards = [
    {
      label: "ICMP PING",
      value: icmpPing ? "OK" : "FALHA",
      color: icmpPing ? CHART_COLORS.green : CHART_COLORS.red,
      sub: icmpLoss > 0 ? `Perda: ${icmpLoss.toFixed(1)}%` : "Sem perda",
      show: !!icmpPingItem,
    },
    {
      label: "SNMP AGENT",
      value: snmpAvailItem
        ? parseFloat(snmpAvailItem.lastvalue) === 1
          ? "OK"
          : "INDISPONÍVEL"
        : "N/A",
      color: snmpAvailItem
        ? parseFloat(snmpAvailItem.lastvalue) === 1
          ? CHART_COLORS.green
          : CHART_COLORS.red
        : COLORS.muted,
      sub: "Disponibilidade do agente",
      show: !!snmpAvailItem,
    },
    {
      label: "LATÊNCIA",
      value: icmpSec > 0 ? icmpSec.toFixed(3) + "s" : "N/A",
      color: CHART_COLORS.blue,
      sub: "Tempo de resposta ICMP",
      show: !!icmpSecItem,
    },
    {
      label: "UPTIME",
      value:
        uptimeValue > 0
          ? formatUptime(uptimeValue)
          : hwUptimeItem
            ? formatUptime(parseFloat(hwUptimeItem.lastvalue))
            : netUptimeItem
              ? formatUptime(parseFloat(netUptimeItem.lastvalue))
              : "N/A",
      color: CHART_COLORS.blue,
      sub: hwUptimeItem
        ? "Uptime de hardware"
        : netUptimeItem
          ? "Uptime de rede"
          : "Tempo de atividade",
      show: !!(uptimeItem || hwUptimeItem || netUptimeItem),
    },
    {
      label: "CPU",
      value: cpuValue.toFixed(1) + "%",
      color: CHART_COLORS.teal,
      sub: cpuNumItem
        ? `${parseFloat(cpuNumItem.lastvalue).toFixed(0)} núcleo(s)`
        : "Utilização atual",
      show: !!cpuItem,
    },
    {
      label: "SWAP",
      value: swapPfreeItem
        ? (100 - parseFloat(swapPfreeItem.lastvalue)).toFixed(1) + "%"
        : swapFreeItem
          ? formatBytes(parseFloat(swapFreeItem.lastvalue))
          : "N/A",
      color: CHART_COLORS.purple,
      sub: swapPfreeItem ? "Swap em uso" : "Swap livre",
      show: !!(swapPfreeItem || swapFreeItem),
    },
    {
      label: "INTERRUPTS",
      value: interruptsItem
        ? parseFloat(interruptsItem.lastvalue).toFixed(0) + "/s"
        : "N/A",
      color: CHART_COLORS.teal,
      sub: "Interrupções por segundo",
      show: !!interruptsItem,
    },
    {
      label: "CONTEXT SWITCHES",
      value: contextSwitchesItem
        ? parseFloat(contextSwitchesItem.lastvalue).toFixed(0) + "/s"
        : "N/A",
      color: CHART_COLORS.blue,
      sub: "Trocas de contexto/s",
      show: !!contextSwitchesItem,
    },
    ...(tempItems.length > 0
      ? [
          {
            label: "TEMPERATURA",
            value: (() => {
              const t = tempItems[0];
              const v = parseFloat(t.lastvalue);
              if (Number.isNaN(v)) return "N/A";
              const unit = t.units || "°C";
              return `${v.toFixed(1)}${unit}`;
            })(),
            color: (() => {
              const v = parseFloat(tempItems[0].lastvalue);
              if (!Number.isNaN(v) && v >= 70) return CHART_COLORS.red;
              if (!Number.isNaN(v) && v >= 55) return CHART_COLORS.amber;
              return CHART_COLORS.green;
            })(),
            sub:
              tempItems.length > 1
                ? `${tempItems.length} sensores`
                : tempItems[0].name.replace(/.*temperature/i, "").trim() ||
                  "Sensor de temperatura",
            show: true,
          },
        ]
      : []),
    ...(tcpPortItems.length > 0 || udpPortItems.length > 0
      ? [
          {
            label: "PORTAS TCP/UDP",
            value: `${tcpPortItems.length}/${udpPortItems.length}`,
            color: CHART_COLORS.teal,
            sub: `TCP ${tcpPortItems.filter((p) => parseFloat(p.lastvalue) === 1).length} ativas · UDP ${udpPortItems.filter((p) => parseFloat(p.lastvalue) === 1).length} ativas`,
            show: true,
          },
        ]
      : []),
    ...(sslCertItems.length > 0
      ? [
          {
            label: "CERTIFICADOS SSL",
            value: (() => {
              const valid = sslCertItems.filter((c) => {
                const v = parseFloat(c.lastvalue);
                return !Number.isNaN(v) && v > 0;
              }).length;
              return `${valid}/${sslCertItems.length}`;
            })(),
            color: (() => {
              const invalid = sslCertItems.filter((c) => {
                const v = parseFloat(c.lastvalue);
                return Number.isNaN(v) || v <= 0;
              }).length;
              return invalid > 0 ? CHART_COLORS.red : CHART_COLORS.green;
            })(),
            sub:
              sslCertItems.length > 1
                ? `${sslCertItems.length} certificados monitorados`
                : sslCertItems[0].name,
            show: true,
          },
        ]
      : []),
    {
      label: "MÉTRICAS",
      value: items.length.toString(),
      color: CHART_COLORS.amber,
      sub: "Total coletadas",
      show: true,
    },
    {
      label: "UPDATES PEND.",
      value: updatesPendingItem ? updatesPendingItem.lastvalue : "N/A",
      color: CHART_COLORS.amber,
      sub: "Atualizações do Windows",
      show: !!updatesPendingItem,
    },
    {
      label: "REINICIALIZAÇÃO",
      value: rebootPendingItem
        ? parseFloat(rebootPendingItem.lastvalue) > 0
          ? "SIM"
          : "NÃO"
        : "N/A",
      color:
        rebootPendingItem && parseFloat(rebootPendingItem.lastvalue) > 0
          ? CHART_COLORS.red
          : CHART_COLORS.green,
      sub: "Pendente?",
      show: !!rebootPendingItem,
    },
  ].filter((k) => k.show);

  return (
    <div
      className="rounded-xl p-4 sm:p-6 space-y-4"
      style={{
        background: COLORS.bg,
        fontFamily: "'JetBrains Mono','Consolas',monospace",
      }}
    >
      <style>{`@keyframes jlblink { 0%{opacity:1} 50%{opacity:0.2} 100%{opacity:1} }`}</style>

      <DeviceHeader
        hostName={hostName}
        hostIp={hostIp}
        hostId={hostId}
        deviceType={deviceType}
        autoRefresh={autoRefresh}
        onToggleAutoRefresh={() => setAutoRefresh((v) => !v)}
        mounted={mounted}
        lastUpdate={lastUpdate}
        timeRange={timeRange}
        onRangeChange={handleRangeChange}
      />

      <AlertsTab
        triggers={triggers as ZabbixTrigger[]}
        collapsedCategories={collapsedCategories}
        onToggleCollapse={toggleCategoryCollapse}
      />

      <ChartSection
        selectedItem={selectedItem}
        numericItems={numericItems}
        loading={loading}
        error={error}
        history={history}
        onItemChange={handleItemChange}
        onRefresh={() => handleRefresh()}
      />

      <Gauges
        kpiCards={kpiCards}
        cpuItem={cpuItem}
        cpuValue={cpuValue}
        cpuIdleItem={cpuIdleItem}
        cpuNumItem={cpuNumItem}
        cpuLoadItem={cpuLoadItem}
        interruptsItem={interruptsItem}
        contextSwitchesItem={contextSwitchesItem}
        memItem={memItem}
        memUtilItem={memUtilItem}
        memTotalItem={memTotalItem}
        memFreeItem={memFreeItem}
        swapFreeItem={swapFreeItem}
        swapPfreeItem={swapPfreeItem}
        cpuBreakdownItems={cpuBreakdownItems}
        systemNameItem={systemNameItem}
        systemDescrItem={systemDescrItem}
        systemLocationItem={systemLocationItem}
        systemContactItem={systemContactItem}
        systemObjectIdItem={systemObjectIdItem}
      />

      <Sparklines
        sparkData={sparkData}
        currentRangeSeconds={currentRangeSeconds}
        nowSec={nowSec}
        cpuItem={cpuItem}
        memItem={memItem}
        memUtilItem={memUtilItem}
        memBuffersItem={memBuffersItem}
        memCachedItem={memCachedItem}
        cpuLoadItem={cpuLoadItem}
        netInItem={netInItem}
        netOutItem={netOutItem}
        netInterfacesByIface={netInterfacesByIface}
        selectedNetIface={selectedNetIface}
        onSelectNetIface={setSelectedNetIface}
        onClearNetSparkData={() =>
          setSparkData((prev) => ({ ...prev, netIn: [], netOut: [] }))
        }
        diskReadOpsItem={diskReadOpsItem}
        diskWriteOpsItem={diskWriteOpsItem}
        diskReadLatItem={diskReadLatItem}
        diskWriteLatItem={diskWriteLatItem}
        diskReadQueueItem={diskReadQueueItem}
        diskWriteQueueItem={diskWriteQueueItem}
      />

      <DiskSection
        fsItems={fsItems}
        fsTotalItems={fsTotalItems}
        fsUsedItems={fsUsedItems}
        fsFreeItems={fsFreeItems}
        netInterfaceNames={netInterfaceNames}
        netInterfaceItems={netInterfaceItems}
      />

      <NetworkDetails
        netInterfaceNames={netInterfaceNames}
        netInterfaceItems={netInterfaceItems}
      />

      <ServicesProcesses
        serviceItems={serviceItems}
        procItems={procItems}
        items={items}
        triggers={triggers}
      />

      <ItemsTable
        items={items}
        metricCategories={metricCategories}
        metricSearch={metricSearch}
        onSearchChange={setMetricSearch}
        collapsedCategories={collapsedCategories}
        onToggleCollapse={toggleCategoryCollapse}
        hiddenMetrics={hiddenMetrics}
        onToggleMetricVisibility={toggleMetricVisibility}
        onItemSelect={handleItemChange}
        prefsLoaded={prefsLoaded}
      />
    </div>
  );
}
