// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState } from "react";
import {
  RefreshCw,
  Plus,
  Pencil,
  Trash2,
  Save,
  X,
  Loader2,
  Check,
  AlertCircle,
} from "lucide-react";
import { useApi } from "@/lib/use-api";
import { useZabbixWrite } from "@/lib/use-zabbix-write";
import {
  ErrorState,
  EmptyState,
  LoadingState,
} from "@/components/ui/state-display";
import type { ZabbixHostGroup } from "@repo/zabbix";

export default function HostGroupsPage() {
  const { data, error, isLoading, progress, mutate } = useApi<{
    data: ZabbixHostGroup[];
  }>("/api/zabbix/host-groups");
  const groups = data?.data ?? [];
  const [actionError, setActionError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const { write, status: writeStatus } = useZabbixWrite({
    onSuccess: () => {
      setPendingAction(null);
      setNewName("");
      setShowCreate(false);
      setEditingId(null);
      // Revalida a lista apos write concluido
      void mutate();
    },
    onError: (err) => {
      setActionError(err);
      setPendingAction(null);
    },
  });

  async function handleCreate() {
    if (!newName.trim()) return;
    setPendingAction("create");
    setActionError(null);
    await write("/api/zabbix/host-groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName }),
    });
  }

  async function handleUpdate(id: string) {
    if (!editName.trim()) return;
    setPendingAction(`update-${id}`);
    setActionError(null);
    await write(`/api/zabbix/host-groups/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName }),
    });
  }

  async function handleDelete(id: string) {
    if (!confirm("Confirma remover este grupo?")) return;
    setPendingAction(`delete-${id}`);
    setActionError(null);
    await write(`/api/zabbix/host-groups/${id}`, { method: "DELETE" });
  }

  const isPending = writeStatus === "pending";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1
          className="text-xl font-bold"
          style={{ color: "var(--text-primary)" }}
        >
          Grupos de Hosts
        </h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCreate((v) => !v)}
            disabled={isPending}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors hover:opacity-80 disabled:opacity-50"
            style={{
              background: "var(--brand-glow)",
              border: "1px solid var(--brand-primary)",
              color: "var(--brand-primary)",
            }}
          >
            <Plus size={14} />
            Novo Grupo
          </button>
          <button
            onClick={() => mutate()}
            disabled={isPending}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors hover:opacity-80 disabled:opacity-50"
            style={{
              background: "var(--brand-glow)",
              border: "1px solid var(--brand-primary)",
              color: "var(--brand-primary)",
            }}
          >
            <RefreshCw size={14} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Feedback visual de write assincrono */}
      {writeStatus === "pending" && (
        <div
          className="flex items-center gap-2 rounded-lg p-3"
          style={{
            background: "var(--brand-glow)",
            border: "1px solid var(--brand-primary)",
          }}
        >
          <Loader2
            size={16}
            className="animate-spin"
            style={{ color: "var(--brand-primary)" }}
          />
          <span className="text-sm" style={{ color: "var(--brand-primary)" }}>
            Operação em processamento... Você será notificado quando concluído.
          </span>
        </div>
      )}
      {writeStatus === "success" && (
        <div
          className="flex items-center gap-2 rounded-lg p-3"
          style={{
            background: "var(--status-success-bg)",
            border: "1px solid var(--status-success-border)",
          }}
        >
          <Check size={16} style={{ color: "var(--status-success-text)" }} />
          <span
            className="text-sm"
            style={{ color: "var(--status-success-text)" }}
          >
            Operação concluída com sucesso!
          </span>
        </div>
      )}
      {writeStatus === "error" && (
        <div
          className="flex items-center gap-2 rounded-lg p-3"
          style={{
            background: "var(--status-error-bg)",
            border: "1px solid var(--status-error-border)",
          }}
        >
          <AlertCircle
            size={16}
            style={{ color: "var(--status-error-text)" }}
          />
          <span
            className="text-sm"
            style={{ color: "var(--status-error-text)" }}
          >
            Falha na operação. Tente novamente.
          </span>
        </div>
      )}

      {showCreate && (
        <div
          className="flex items-center gap-3 rounded-lg p-3"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border-default)",
          }}
        >
          <input
            type="text"
            placeholder="Nome do grupo..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            disabled={isPending}
            className="flex-1 rounded-lg px-3 py-1.5 text-sm outline-none disabled:opacity-50"
            style={{
              background: "var(--surface-0)",
              border: "1px solid var(--border-default)",
              color: "var(--text-primary)",
            }}
          />
          <button
            onClick={handleCreate}
            disabled={isPending || !newName.trim()}
            className="flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium disabled:opacity-50"
            style={{
              background: "var(--brand-primary)",
              color: "var(--surface-0)",
            }}
          >
            {pendingAction === "create" && isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Plus size={14} />
            )}
            Criar
          </button>
        </div>
      )}

      {(error || actionError) && (
        <ErrorState
          title="Erro"
          message={error ?? actionError ?? "Erro desconhecido"}
        />
      )}

      {isLoading ? (
        <LoadingState label="Carregando..." progress={progress} />
      ) : groups.length === 0 ? (
        <EmptyState title="Nenhum grupo encontrado" />
      ) : (
        <div className="space-y-2">
          {groups.map((g) => (
            <div
              key={g.groupid}
              className="rounded-lg p-3"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border-default)",
              }}
            >
              <div className="flex items-center justify-between">
                {editingId === g.groupid ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      disabled={isPending}
                      className="flex-1 rounded-lg px-3 py-1 text-sm outline-none disabled:opacity-50"
                      style={{
                        background: "var(--surface-0)",
                        border: "1px solid var(--brand-primary)",
                        color: "var(--text-primary)",
                      }}
                    />
                    <button
                      onClick={() => handleUpdate(g.groupid)}
                      disabled={isPending || !editName.trim()}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg disabled:opacity-50"
                      style={{
                        background: "var(--brand-primary)",
                        color: "var(--surface-0)",
                      }}
                    >
                      {pendingAction === `update-${g.groupid}` && isPending ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Save size={12} />
                      )}
                      Salvar
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      disabled={isPending}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg disabled:opacity-50"
                      style={{
                        background: "var(--surface-3)",
                        color: "var(--text-primary)",
                      }}
                    >
                      <X size={12} /> Cancelar
                    </button>
                  </div>
                ) : (
                  <>
                    <div>
                      <span
                        className="text-sm font-medium"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {g.name}
                      </span>
                      {g.hosts && g.hosts.length > 0 && (
                        <span
                          className="text-xs ml-2"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {g.hosts.length} host(s)
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setEditingId(g.groupid);
                          setEditName(g.name);
                        }}
                        disabled={isPending}
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
                        style={{
                          background: "var(--brand-glow)",
                          border: "1px solid var(--brand-primary)",
                          color: "var(--brand-primary)",
                        }}
                      >
                        <Pencil size={12} />
                        Editar
                      </button>
                      <button
                        onClick={() => handleDelete(g.groupid)}
                        disabled={isPending}
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
                        style={{
                          background: "var(--status-error-bg)",
                          border: "1px solid var(--status-error-border)",
                          color: "var(--status-error-text)",
                        }}
                      >
                        {pendingAction === `delete-${g.groupid}` &&
                        isPending ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Trash2 size={12} />
                        )}
                        Remover
                      </button>
                    </div>
                  </>
                )}
              </div>
              {g.hosts && g.hosts.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {g.hosts.map((h) => (
                    <span
                      key={h.hostid}
                      className="text-[10px] px-1.5 py-0.5 rounded"
                      style={{
                        background: "var(--brand-glow)",
                        color: "var(--brand-primary)",
                      }}
                    >
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
