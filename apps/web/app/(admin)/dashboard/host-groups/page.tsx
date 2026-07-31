"use client";

import { useState } from "react";
import { RefreshCw, Plus, Pencil, Trash2, Save, X } from "lucide-react";
import { apiFetch } from "@/lib/zabbix-fetch";
import { useApi } from "@/lib/use-api";
import { ErrorState, EmptyState, LoadingState } from "@/components/ui/state-display";
import type { ZabbixHostGroup } from "@repo/zabbix";

export default function HostGroupsPage() {
  const { data, error, isLoading, progress, mutate } = useApi<{ data: ZabbixHostGroup[] }>("/api/zabbix/host-groups");
  const groups = data?.data ?? [];
  const [actionError, setActionError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  async function handleCreate() {
    if (!newName.trim()) return;
    try {
      await apiFetch("/api/zabbix/host-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      setNewName("");
      setShowCreate(false);
      await mutate();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Erro ao criar");
    }
  }

  async function handleUpdate(id: string) {
    if (!editName.trim()) return;
    try {
      await apiFetch(`/api/zabbix/host-groups/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName }),
      });
      setEditingId(null);
      await mutate();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Erro ao atualizar");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Confirma remover este grupo?")) return;
    try {
      await apiFetch(`/api/zabbix/host-groups/${id}`, { method: "DELETE" });
      await mutate();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Erro ao remover");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Grupos de Hosts</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors hover:opacity-80"
            style={{ background: "var(--brand-glow)", border: "1px solid var(--brand-primary)", color: "var(--brand-primary)" }}
          >
            <Plus size={14} />
            Novo Grupo
          </button>
          <button
            onClick={() => mutate()}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors hover:opacity-80"
            style={{ background: "var(--brand-glow)", border: "1px solid var(--brand-primary)", color: "var(--brand-primary)" }}
          >
            <RefreshCw size={14} />
            Atualizar
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="flex items-center gap-3 rounded-lg p-3" style={{ background: "var(--surface-2)", border: "1px solid var(--border-default)" }}>
          <input
            type="text"
            placeholder="Nome do grupo..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="flex-1 rounded-lg px-3 py-1.5 text-sm outline-none"
            style={{ background: "var(--surface-0)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
          />
          <button
            onClick={handleCreate}
            className="flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium"
            style={{ background: "var(--brand-primary)", color: "var(--surface-0)" }}
          >
            <Plus size={14} />
            Criar
          </button>
        </div>
      )}

      {(error || actionError) && (
        <ErrorState title="Erro" message={error ?? actionError ?? "Erro desconhecido"} />
      )}

      {isLoading ? (
        <LoadingState label="Carregando..." progress={progress} />
      ) : groups.length === 0 ? (
        <EmptyState title="Nenhum grupo encontrado" />
      ) : (
        <div className="space-y-2">
          {groups.map((g) => (
            <div key={g.groupid} className="rounded-lg p-3" style={{ background: "var(--surface-2)", border: "1px solid var(--border-default)" }}>
              <div className="flex items-center justify-between">
                {editingId === g.groupid ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1 rounded-lg px-3 py-1 text-sm outline-none"
                      style={{ background: "var(--surface-0)", border: "1px solid var(--brand-primary)", color: "var(--text-primary)" }}
                    />
                    <button onClick={() => handleUpdate(g.groupid)} className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg" style={{ background: "var(--brand-primary)", color: "var(--surface-0)" }}><Save size={12} /> Salvar</button>
                    <button onClick={() => setEditingId(null)} className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg" style={{ background: "var(--surface-3)", color: "var(--text-primary)" }}><X size={12} /> Cancelar</button>
                  </div>
                ) : (
                  <>
                    <div>
                      <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{g.name}</span>
                      {g.hosts && g.hosts.length > 0 && (
                        <span className="text-xs ml-2" style={{ color: "var(--text-muted)" }}>{g.hosts.length} host(s)</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setEditingId(g.groupid); setEditName(g.name); }}
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors"
                        style={{ background: "var(--brand-glow)", border: "1px solid var(--brand-primary)", color: "var(--brand-primary)" }}
                      >
                        <Pencil size={12} />
                        Editar
                      </button>
                      <button
                        onClick={() => handleDelete(g.groupid)}
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors"
                        style={{ background: "var(--status-error-bg)", border: "1px solid var(--status-error-border)", color: "var(--status-error-text)" }}
                      >
                        <Trash2 size={12} />
                        Remover
                      </button>
                    </div>
                  </>
                )}
              </div>
              {g.hosts && g.hosts.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {g.hosts.map((h) => (
                    <span key={h.hostid} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "var(--brand-glow)", color: "var(--brand-primary)" }}>
                      {h.name}
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
