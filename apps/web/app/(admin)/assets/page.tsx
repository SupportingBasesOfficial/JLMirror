// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState } from "react";
import { RefreshCw, ArrowLeft, Plus } from "lucide-react";
import { LoadingState } from "@/components/ui/state-display";
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

const STATUS_COLORS: Record<string, string> = {
  active: COLORS.green,
  inactive: COLORS.muted,
  maintenance: COLORS.amber,
  retired: COLORS.muted,
  lost: COLORS.red,
  stolen: COLORS.red,
  disposed: COLORS.muted,
};

const CRITICALITY_COLORS: Record<string, string> = {
  low: COLORS.muted,
  medium: COLORS.blue,
  high: COLORS.amber,
  critical: COLORS.red,
};

const TYPE_ICONS: Record<string, string> = {
  server: "🖥",
  vm: "▢",
  container: "📦",
  network_switch: "🔀",
  router: "🌐",
  firewall: "🛡",
  load_balancer: "⚖",
  workstation: "💻",
  laptop: "💻",
  mobile: "📱",
  printer: "🖨",
  storage: "💾",
  appliance: "🔌",
  iot: "📡",
  other: "•",
};

const ASSET_TYPES = [
  "server",
  "vm",
  "container",
  "network_switch",
  "router",
  "firewall",
  "load_balancer",
  "workstation",
  "laptop",
  "mobile",
  "printer",
  "storage",
  "appliance",
  "iot",
  "other",
];
const CATEGORIES = [
  "hardware",
  "software",
  "network",
  "virtual",
  "license",
  "service",
];
const STATUSES = [
  "active",
  "inactive",
  "maintenance",
  "retired",
  "lost",
  "stolen",
  "disposed",
];
const CRITICALITIES = ["low", "medium", "high", "critical"];
const LICENSE_TYPES = [
  "perpetual",
  "subscription",
  "oem",
  "volume",
  "concurrent",
  "open_source",
  "trial",
];

interface Asset {
  id: string;
  asset_tag: string;
  name: string;
  asset_type: string;
  category: string;
  status: string;
  criticality: string;
  hostname: string | null;
  ip_address: string | null;
  serial_number: string | null;
  manufacturer: string | null;
  model: string | null;
  location: string | null;
  assigned_to: string | null;
  department: string | null;
  warranty_expiry: string | null;
  tags: string[];
}

interface AssetLicense {
  id: string;
  asset_id: string;
  license_key: string | null;
  software_name: string;
  vendor: string | null;
  license_type: string;
  seats_total: number;
  seats_used: number;
  expiry_date: string | null;
  cost: string | null;
  is_active: boolean;
}

interface AssetStats {
  total: string;
  by_status: { status: string; count: string }[];
  by_type: { asset_type: string; count: string }[];
  by_criticality: { criticality: string; count: string }[];
  warranty: {
    expired: string;
    expiring_soon: string;
    valid: string;
    no_warranty: string;
  };
  licenses: {
    total: string;
    expired: string;
    expiring_soon: string;
    total_cost: string;
  };
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function AssetsPage() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterType, setFilterType] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [licenses, setLicenses] = useState<AssetLicense[]>([]);
  const [showLicense, setShowLicense] = useState(false);

  const assetsQuery = (() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (filterStatus) params.set("status", filterStatus);
    if (filterType) params.set("type", filterType);
    const qs = params.toString();
    return qs ? `/api/assets?${qs}` : "/api/assets";
  })();
  const {
    data: aData,
    isLoading: loading,
    mutate: mutateAssets,
  } = useApi<{ assets: Asset[] }>(assetsQuery);
  const { data: stats, mutate: mutateStats } = useApi<AssetStats>(
    "/api/assets/stats/overview",
  );
  const assets = aData?.assets ?? [];

  // Form
  const [fTag, setFTag] = useState("");
  const [fName, setFName] = useState("");
  const [fType, setFType] = useState("server");
  const [fCategory, setFCategory] = useState("hardware");
  const [fCriticality, setFCriticality] = useState("low");
  const [fHostname, setFHostname] = useState("");
  const [fIp, setFIp] = useState("");
  const [fSerial, setFSerial] = useState("");
  const [fManufacturer, setFManufacturer] = useState("");
  const [fModel, setFModel] = useState("");
  const [fLocation, setFLocation] = useState("");
  const [fAssigned, setFAssigned] = useState("");
  const [fDept, setFDept] = useState("");

  // License form
  const [lSoftware, setLSoftware] = useState("");
  const [lKey, setLKey] = useState("");
  const [lType, setLType] = useState("perpetual");
  const [lSeats, setLSeats] = useState(1);
  const [lExpiry, setLExpiry] = useState("");
  const [lCost, setLCost] = useState(0);

  async function handleCreate() {
    setError(null);
    try {
      const res = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          asset_tag: fTag,
          name: fName,
          asset_type: fType,
          category: fCategory,
          criticality: fCriticality,
          hostname: fHostname || undefined,
          ip_address: fIp || undefined,
          serial_number: fSerial || undefined,
          manufacturer: fManufacturer || undefined,
          model: fModel || undefined,
          location: fLocation || undefined,
          assigned_to: fAssigned || undefined,
          department: fDept || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Erro ao criar ativo");
        return;
      }
      setSuccess("Ativo criado!");
      setShowCreate(false);
      setFTag("");
      setFName("");
      setFHostname("");
      setFIp("");
      setFSerial("");
      setFManufacturer("");
      setFModel("");
      setFLocation("");
      setFAssigned("");
      setFDept("");
      mutateAssets();
      mutateStats();
    } catch {
      setError("Erro de conexão");
    }
  }

  async function handleDelete(assetId: string) {
    try {
      const res = await fetch(`/api/assets/${assetId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        mutateAssets();
        mutateStats();
      }
    } catch {
      // Ignora
    }
  }

  async function handleSelectAsset(asset: Asset) {
    setSelectedAsset(asset);
    try {
      const res = await fetch(`/api/assets/${asset.id}/licenses`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setLicenses(data.licenses ?? []);
      }
    } catch {
      // Ignora
    }
  }

  async function handleAddLicense() {
    if (!selectedAsset) return;
    setError(null);
    try {
      const res = await fetch(`/api/assets/${selectedAsset.id}/licenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          asset_id: selectedAsset.id,
          software_name: lSoftware,
          license_key: lKey || undefined,
          license_type: lType,
          seats_total: lSeats,
          expiry_date: lExpiry || undefined,
          cost: lCost || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Erro ao adicionar licença");
        return;
      }
      setSuccess("Licença adicionada!");
      setShowLicense(false);
      setLSoftware("");
      setLKey("");
      setLType("perpetual");
      setLSeats(1);
      setLExpiry("");
      setLCost(0);
      handleSelectAsset(selectedAsset);
      mutateStats();
    } catch {
      setError("Erro de conexão");
    }
  }

  async function handleDeleteLicense(licenseId: string) {
    if (!selectedAsset) return;
    try {
      const res = await fetch(
        `/api/assets/${selectedAsset.id}/licenses/${licenseId}`,
        {
          method: "DELETE",
          credentials: "include",
        },
      );
      if (res.ok) {
        handleSelectAsset(selectedAsset);
        mutateStats();
      }
    } catch {
      // Ignora
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
            Asset Inventory — Inventário de Ativos
          </h1>
          <p className="text-[12px]" style={{ color: COLORS.muted }}>
            Hardware · Software · Rede · Virtual · Licenças
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCreate(true)}
            className="text-[12px] px-3 py-1.5 rounded font-bold"
            style={{
              background: COLORS.teal,
              color: COLORS.bg,
              cursor: "pointer",
            }}
          >
            <Plus size={12} className="inline" /> Novo Ativo
          </button>
          <button
            onClick={() => {
              mutateAssets();
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
              Total Ativos
            </div>
            <div className="text-2xl font-bold" style={{ color: COLORS.teal }}>
              {stats.total}
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
              Garantia Expirada
            </div>
            <div className="text-2xl font-bold" style={{ color: COLORS.amber }}>
              {stats.warranty.expired}
            </div>
            <div className="text-[10px]" style={{ color: COLORS.muted }}>
              {stats.warranty.expiring_soon} expirando
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
              Licenças Expiradas
            </div>
            <div className="text-2xl font-bold" style={{ color: COLORS.red }}>
              {stats.licenses.expired}
            </div>
            <div className="text-[10px]" style={{ color: COLORS.muted }}>
              {stats.licenses.expiring_soon} expirando
            </div>
          </div>
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
              Custo Licenças
            </div>
            <div className="text-2xl font-bold" style={{ color: COLORS.blue }}>
              R${" "}
              {parseFloat(stats.licenses.total_cost || "0").toLocaleString(
                "pt-BR",
                { minimumFractionDigits: 0 },
              )}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div
        className="rounded-xl p-4 flex flex-wrap items-end gap-4"
        style={{
          background: COLORS.card,
          border: `1px solid ${COLORS.border}`,
        }}
      >
        <div className="space-y-1 flex-1 min-w-[200px]">
          <label
            htmlFor="asset-search"
            className="text-[11px] font-bold uppercase"
            style={{ color: COLORS.muted }}
          >
            Buscar
          </label>
          <input
            id="asset-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="nome, tag, hostname, IP, serial..."
            className="w-full rounded-md px-3 py-1.5 text-[13px]"
            style={{
              background: COLORS.bg,
              border: `1px solid ${COLORS.border}`,
              color: COLORS.text,
            }}
          />
        </div>
        <div className="space-y-1">
          <label
            htmlFor="asset-status"
            className="text-[11px] font-bold uppercase"
            style={{ color: COLORS.muted }}
          >
            Status
          </label>
          <select
            id="asset-status"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-md px-3 py-1.5 text-[13px]"
            style={{
              background: COLORS.bg,
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
            htmlFor="asset-type"
            className="text-[11px] font-bold uppercase"
            style={{ color: COLORS.muted }}
          >
            Tipo
          </label>
          <select
            id="asset-type"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="rounded-md px-3 py-1.5 text-[13px]"
            style={{
              background: COLORS.bg,
              border: `1px solid ${COLORS.border}`,
              color: COLORS.text,
            }}
          >
            <option value="">Todos</option>
            {ASSET_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: COLORS.card,
          border: `1px solid ${COLORS.border}`,
        }}
      >
        {loading ? (
          <LoadingState label="Carregando ativos..." />
        ) : assets.length === 0 ? (
          <div
            className="p-8 text-center text-sm"
            style={{ color: COLORS.muted }}
          >
            Nenhum ativo encontrado
          </div>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                <th
                  className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                  style={{ color: COLORS.muted }}
                >
                  Tag
                </th>
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
                  Tipo
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
                  Criticidade
                </th>
                <th
                  className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                  style={{ color: COLORS.muted }}
                >
                  Hostname
                </th>
                <th
                  className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                  style={{ color: COLORS.muted }}
                >
                  IP
                </th>
                <th
                  className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                  style={{ color: COLORS.muted }}
                >
                  Local
                </th>
                <th
                  className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                  style={{ color: COLORS.muted }}
                >
                  Atribuído
                </th>
                <th
                  className="text-right px-3 py-2 font-bold uppercase text-[10px]"
                  style={{ color: COLORS.muted }}
                ></th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr
                  key={a.id}
                  style={{
                    borderBottom: `1px solid ${COLORS.border}`,
                    cursor: "pointer",
                  }}
                  onClick={() => handleSelectAsset(a)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSelectAsset(a);
                  }}
                >
                  <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                    {a.asset_tag}
                  </td>
                  <td className="px-3 py-2" style={{ color: COLORS.teal }}>
                    {TYPE_ICONS[a.asset_type] ?? "•"} {a.name}
                  </td>
                  <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                    {a.asset_type}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                      style={{
                        background: `${STATUS_COLORS[a.status] ?? COLORS.muted}15`,
                        color: STATUS_COLORS[a.status] ?? COLORS.muted,
                      }}
                    >
                      {a.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                      style={{
                        background: `${CRITICALITY_COLORS[a.criticality] ?? COLORS.muted}15`,
                        color:
                          CRITICALITY_COLORS[a.criticality] ?? COLORS.muted,
                      }}
                    >
                      {a.criticality}
                    </span>
                  </td>
                  <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                    {a.hostname ?? "—"}
                  </td>
                  <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                    {a.ip_address ?? "—"}
                  </td>
                  <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                    {a.location ?? "—"}
                  </td>
                  <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                    {a.assigned_to ?? "—"}
                  </td>
                  <td
                    className="px-3 py-2 text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => handleDelete(a.id)}
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

      {/* Detail modal */}
      {selectedAsset && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "var(--overlay-modal)" }}
          onClick={() => {
            setSelectedAsset(null);
            setLicenses([]);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setSelectedAsset(null);
              setLicenses([]);
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
              <h2 className="text-sm font-bold" style={{ color: COLORS.teal }}>
                {TYPE_ICONS[selectedAsset.asset_type] ?? "•"}{" "}
                {selectedAsset.name}
              </h2>
              <button
                onClick={() => {
                  setSelectedAsset(null);
                  setLicenses([]);
                }}
                className="text-[16px]"
                style={{ color: COLORS.muted, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            {/* Asset info */}
            <div className="grid grid-cols-2 gap-3 mb-6 text-[12px]">
              <div className="flex justify-between">
                <span style={{ color: COLORS.muted }}>Tag:</span>
                <span style={{ color: COLORS.text }}>
                  {selectedAsset.asset_tag}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: COLORS.muted }}>Tipo:</span>
                <span style={{ color: COLORS.text }}>
                  {selectedAsset.asset_type}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: COLORS.muted }}>Status:</span>
                <span
                  style={{
                    color: STATUS_COLORS[selectedAsset.status] ?? COLORS.muted,
                  }}
                >
                  {selectedAsset.status}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: COLORS.muted }}>Criticidade:</span>
                <span
                  style={{
                    color:
                      CRITICALITY_COLORS[selectedAsset.criticality] ??
                      COLORS.muted,
                  }}
                >
                  {selectedAsset.criticality}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: COLORS.muted }}>Hostname:</span>
                <span style={{ color: COLORS.text }}>
                  {selectedAsset.hostname ?? "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: COLORS.muted }}>IP:</span>
                <span style={{ color: COLORS.text }}>
                  {selectedAsset.ip_address ?? "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: COLORS.muted }}>Serial:</span>
                <span style={{ color: COLORS.text }}>
                  {selectedAsset.serial_number ?? "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: COLORS.muted }}>Fabricante:</span>
                <span style={{ color: COLORS.text }}>
                  {selectedAsset.manufacturer ?? "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: COLORS.muted }}>Modelo:</span>
                <span style={{ color: COLORS.text }}>
                  {selectedAsset.model ?? "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: COLORS.muted }}>Local:</span>
                <span style={{ color: COLORS.text }}>
                  {selectedAsset.location ?? "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: COLORS.muted }}>Atribuído:</span>
                <span style={{ color: COLORS.text }}>
                  {selectedAsset.assigned_to ?? "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: COLORS.muted }}>Depto:</span>
                <span style={{ color: COLORS.text }}>
                  {selectedAsset.department ?? "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: COLORS.muted }}>Garantia:</span>
                <span style={{ color: COLORS.text }}>
                  {formatDate(selectedAsset.warranty_expiry)}
                </span>
              </div>
            </div>

            {/* Tags */}
            {selectedAsset.tags && selectedAsset.tags.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-1">
                {selectedAsset.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 rounded text-[10px]"
                    style={{
                      background: `color-mix(in srgb, var(--status-info-text) 8%, transparent)`,
                      color: COLORS.purple,
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Licenses */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span
                  className="text-[12px] font-bold"
                  style={{ color: COLORS.muted }}
                >
                  LICENÇAS ({licenses.length})
                </span>
                <button
                  onClick={() => setShowLicense(true)}
                  className="text-[11px] px-2 py-1 rounded font-bold"
                  style={{
                    background: COLORS.teal,
                    color: COLORS.bg,
                    cursor: "pointer",
                  }}
                >
                  + Licença
                </button>
              </div>
              {licenses.length === 0 ? (
                <div
                  className="text-[12px] p-3 rounded-md"
                  style={{ background: COLORS.bg, color: COLORS.muted }}
                >
                  Nenhuma licença associada
                </div>
              ) : (
                <div className="space-y-2">
                  {licenses.map((l) => (
                    <div
                      key={l.id}
                      className="p-3 rounded-md flex items-center justify-between"
                      style={{
                        background: COLORS.bg,
                        border: `1px solid ${COLORS.border}`,
                      }}
                    >
                      <div className="text-[12px]">
                        <div style={{ color: COLORS.text }}>
                          {l.software_name}
                        </div>
                        <div
                          className="text-[10px]"
                          style={{ color: COLORS.muted }}
                        >
                          {l.license_type} · {l.seats_used}/{l.seats_total}{" "}
                          seats · expira: {formatDate(l.expiry_date)}
                          {l.cost &&
                            ` · R$ ${parseFloat(l.cost).toLocaleString("pt-BR")}`}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteLicense(l.id)}
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
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Create asset */}
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
              <h2 className="text-sm font-bold" style={{ color: COLORS.teal }}>
                Novo Ativo
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
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label
                    htmlFor="a-tag"
                    className="text-[11px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    Asset Tag
                  </label>
                  <input
                    id="a-tag"
                    type="text"
                    value={fTag}
                    onChange={(e) => setFTag(e.target.value)}
                    placeholder="SRV-001"
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
                    htmlFor="a-name"
                    className="text-[11px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    Nome
                  </label>
                  <input
                    id="a-name"
                    type="text"
                    value={fName}
                    onChange={(e) => setFName(e.target.value)}
                    placeholder="web-prod-01"
                    className="w-full rounded-md px-3 py-2 text-[13px]"
                    style={{
                      background: COLORS.bg,
                      border: `1px solid ${COLORS.border}`,
                      color: COLORS.text,
                    }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label
                    htmlFor="a-type"
                    className="text-[11px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    Tipo
                  </label>
                  <select
                    id="a-type"
                    value={fType}
                    onChange={(e) => setFType(e.target.value)}
                    className="w-full rounded-md px-3 py-2 text-[12px]"
                    style={{
                      background: COLORS.bg,
                      border: `1px solid ${COLORS.border}`,
                      color: COLORS.text,
                    }}
                  >
                    {ASSET_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="a-cat"
                    className="text-[11px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    Categoria
                  </label>
                  <select
                    id="a-cat"
                    value={fCategory}
                    onChange={(e) => setFCategory(e.target.value)}
                    className="w-full rounded-md px-3 py-2 text-[12px]"
                    style={{
                      background: COLORS.bg,
                      border: `1px solid ${COLORS.border}`,
                      color: COLORS.text,
                    }}
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="a-crit"
                    className="text-[11px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    Criticidade
                  </label>
                  <select
                    id="a-crit"
                    value={fCriticality}
                    onChange={(e) => setFCriticality(e.target.value)}
                    className="w-full rounded-md px-3 py-2 text-[12px]"
                    style={{
                      background: COLORS.bg,
                      border: `1px solid ${COLORS.border}`,
                      color: COLORS.text,
                    }}
                  >
                    {CRITICALITIES.map((cr) => (
                      <option key={cr} value={cr}>
                        {cr}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label
                    htmlFor="a-host"
                    className="text-[11px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    Hostname
                  </label>
                  <input
                    id="a-host"
                    type="text"
                    value={fHostname}
                    onChange={(e) => setFHostname(e.target.value)}
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
                    htmlFor="a-ip"
                    className="text-[11px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    IP
                  </label>
                  <input
                    id="a-ip"
                    type="text"
                    value={fIp}
                    onChange={(e) => setFIp(e.target.value)}
                    className="w-full rounded-md px-3 py-2 text-[13px]"
                    style={{
                      background: COLORS.bg,
                      border: `1px solid ${COLORS.border}`,
                      color: COLORS.text,
                    }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label
                    htmlFor="a-serial"
                    className="text-[11px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    Serial
                  </label>
                  <input
                    id="a-serial"
                    type="text"
                    value={fSerial}
                    onChange={(e) => setFSerial(e.target.value)}
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
                    htmlFor="a-loc"
                    className="text-[11px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    Local
                  </label>
                  <input
                    id="a-loc"
                    type="text"
                    value={fLocation}
                    onChange={(e) => setFLocation(e.target.value)}
                    placeholder="Datacenter SP - Rack A12"
                    className="w-full rounded-md px-3 py-2 text-[13px]"
                    style={{
                      background: COLORS.bg,
                      border: `1px solid ${COLORS.border}`,
                      color: COLORS.text,
                    }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label
                    htmlFor="a-mfr"
                    className="text-[11px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    Fabricante
                  </label>
                  <input
                    id="a-mfr"
                    type="text"
                    value={fManufacturer}
                    onChange={(e) => setFManufacturer(e.target.value)}
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
                    htmlFor="a-model"
                    className="text-[11px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    Modelo
                  </label>
                  <input
                    id="a-model"
                    type="text"
                    value={fModel}
                    onChange={(e) => setFModel(e.target.value)}
                    className="w-full rounded-md px-3 py-2 text-[13px]"
                    style={{
                      background: COLORS.bg,
                      border: `1px solid ${COLORS.border}`,
                      color: COLORS.text,
                    }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label
                    htmlFor="a-assigned"
                    className="text-[11px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    Atribuído a
                  </label>
                  <input
                    id="a-assigned"
                    type="text"
                    value={fAssigned}
                    onChange={(e) => setFAssigned(e.target.value)}
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
                    htmlFor="a-dept"
                    className="text-[11px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    Departamento
                  </label>
                  <input
                    id="a-dept"
                    type="text"
                    value={fDept}
                    onChange={(e) => setFDept(e.target.value)}
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
                onClick={handleCreate}
                disabled={!fTag || !fName}
                className="w-full rounded-md py-2.5 text-sm font-bold disabled:opacity-50"
                style={{
                  background: COLORS.teal,
                  color: COLORS.bg,
                  cursor: !fTag || !fName ? "not-allowed" : "pointer",
                }}
              >
                Criar Ativo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add license */}
      {showLicense && selectedAsset && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "var(--overlay-modal)" }}
          onClick={() => setShowLicense(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setShowLicense(false);
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
                Nova Licença — {selectedAsset.name}
              </h2>
              <button
                onClick={() => setShowLicense(false)}
                className="text-[16px]"
                style={{ color: COLORS.muted, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>
            <div className="space-y-4">
              <div className="space-y-1">
                <label
                  htmlFor="l-sw"
                  className="text-[11px] font-bold uppercase"
                  style={{ color: COLORS.muted }}
                >
                  Software
                </label>
                <input
                  id="l-sw"
                  type="text"
                  value={lSoftware}
                  onChange={(e) => setLSoftware(e.target.value)}
                  placeholder="Windows Server 2022"
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
                  htmlFor="l-key"
                  className="text-[11px] font-bold uppercase"
                  style={{ color: COLORS.muted }}
                >
                  License Key (opcional)
                </label>
                <input
                  id="l-key"
                  type="text"
                  value={lKey}
                  onChange={(e) => setLKey(e.target.value)}
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
                    htmlFor="l-type"
                    className="text-[11px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    Tipo
                  </label>
                  <select
                    id="l-type"
                    value={lType}
                    onChange={(e) => setLType(e.target.value)}
                    className="w-full rounded-md px-3 py-2 text-[12px]"
                    style={{
                      background: COLORS.bg,
                      border: `1px solid ${COLORS.border}`,
                      color: COLORS.text,
                    }}
                  >
                    {LICENSE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="l-seats"
                    className="text-[11px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    Seats
                  </label>
                  <input
                    id="l-seats"
                    type="number"
                    value={lSeats}
                    onChange={(e) =>
                      setLSeats(parseInt(e.target.value, 10) || 1)
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
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label
                    htmlFor="l-exp"
                    className="text-[11px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    Expira em
                  </label>
                  <input
                    id="l-exp"
                    type="date"
                    value={lExpiry}
                    onChange={(e) => setLExpiry(e.target.value)}
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
                    htmlFor="l-cost"
                    className="text-[11px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    Custo (R$)
                  </label>
                  <input
                    id="l-cost"
                    type="number"
                    step="0.01"
                    value={lCost}
                    onChange={(e) => setLCost(parseFloat(e.target.value) || 0)}
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
                onClick={handleAddLicense}
                disabled={!lSoftware}
                className="w-full rounded-md py-2.5 text-sm font-bold disabled:opacity-50"
                style={{
                  background: COLORS.teal,
                  color: COLORS.bg,
                  cursor: !lSoftware ? "not-allowed" : "pointer",
                }}
              >
                Adicionar Licença
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
