// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState } from "react";
import {
  Bell,
  BellOff,
  Loader2,
  CheckCircle2,
  XCircle,
  Send,
  Smartphone,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { usePushNotifications } from "@/lib/use-push-notifications";
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
};

interface PushSubscription {
  id: string;
  endpoint: string;
  device_type: string | null;
  user_agent: string | null;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
}

export default function PushSettingsPage() {
  const { isSupported, permission, isSubscribed, loading, error, subscribe, unsubscribe, sendTest } = usePushNotifications();
  const { data: subsData, mutate } = useApi<{ subscriptions: PushSubscription[] }>("/api/push/subscriptions");
  const [testSent, setTestSent] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const subscriptions = subsData?.subscriptions ?? [];

  const handleTest = async () => {
    setTestSent(true);
    setTestResult(null);
    const ok = await sendTest();
    setTestResult(ok ? "Push enviado! Verifique seu dispositivo." : "Erro ao enviar push.");
    if (ok) mutate();
  };

  const handleDelete = async (subId: string) => {
    try {
      await fetch(`/api/push/subscriptions/${subId}`, {
        method: "DELETE",
        credentials: "include",
      });
      mutate();
    } catch {
      // Silencioso
    }
  };

  return (
    <div className="min-h-screen p-6 space-y-6" style={{ background: COLORS.bg, fontFamily: "'JetBrains Mono','Consolas',monospace", color: COLORS.text }}>
      {/* Header */}
      <div>
        <h1 className="text-lg font-bold" style={{ color: COLORS.teal }}>
          <Bell size={18} className="inline mr-1" /> Push Notifications
        </h1>
        <p className="text-[12px]" style={{ color: COLORS.muted }}>
          Receba alertas em tempo real no seu dispositivo · PWA
        </p>
      </div>

      {!isSupported && (
        <div className="rounded-xl p-6" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
          <div className="flex items-center gap-3">
            <AlertTriangle size={20} style={{ color: COLORS.amber }} />
            <div>
              <p className="text-sm font-bold" style={{ color: COLORS.text }}>Push Notifications não suportadas</p>
              <p className="text-[11px]" style={{ color: COLORS.muted }}>Seu navegador não suporta Web Push API ou Service Workers.</p>
            </div>
          </div>
        </div>
      )}

      {isSupported && (
        <>
          {/* Status Card */}
          <div className="rounded-xl p-6" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                {isSubscribed ? (
                  <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: `${COLORS.green}15` }}>
                    <Bell size={18} style={{ color: COLORS.green }} />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: `${COLORS.muted}15` }}>
                    <BellOff size={18} style={{ color: COLORS.muted }} />
                  </div>
                )}
                <div>
                  <p className="text-sm font-bold" style={{ color: COLORS.text }}>
                    {isSubscribed ? "Inscrito" : "Não inscrito"}
                  </p>
                  <p className="text-[11px]" style={{ color: COLORS.muted }}>
                    Permissão: {permission === "granted" ? "Concedida" : permission === "denied" ? "Negada" : "Pendente"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => mutate()}
                className="text-[12px] px-3 py-1.5 rounded font-bold flex items-center gap-2"
                style={{ background: `${COLORS.muted}15`, border: `1px solid ${COLORS.muted}`, color: COLORS.muted, cursor: "pointer" }}
              >
                <RefreshCw size={12} /> Atualizar
              </button>
            </div>

            {error && (
              <div className="rounded-md p-3 text-sm mb-4" style={{ background: "var(--status-error-bg)", border: "1px solid var(--status-error-border)", color: COLORS.red }}>
                {error}
              </div>
            )}

            <div className="flex items-center gap-2">
              {!isSubscribed ? (
                <button
                  onClick={subscribe}
                  disabled={loading || permission === "denied"}
                  className="px-4 py-1.5 rounded text-[12px] font-bold flex items-center gap-2"
                  style={{ background: COLORS.teal, color: "white", cursor: "pointer", opacity: (loading || permission === "denied") ? 0.5 : 1 }}
                >
                  {loading ? <Loader2 size={12} className="animate-spin" /> : <Bell size={12} />}
                  Ativar Push Notifications
                </button>
              ) : (
                <>
                  <button
                    onClick={handleTest}
                    disabled={testSent}
                    className="px-4 py-1.5 rounded text-[12px] font-bold flex items-center gap-2"
                    style={{ background: `${COLORS.blue}15`, border: `1px solid ${COLORS.blue}`, color: COLORS.blue, cursor: "pointer", opacity: testSent ? 0.5 : 1 }}
                  >
                    <Send size={12} /> Enviar Teste
                  </button>
                  <button
                    onClick={unsubscribe}
                    disabled={loading}
                    className="px-4 py-1.5 rounded text-[12px] font-bold flex items-center gap-2"
                    style={{ background: `${COLORS.red}15`, border: `1px solid ${COLORS.red}`, color: COLORS.red, cursor: "pointer", opacity: loading ? 0.5 : 1 }}
                  >
                    {loading ? <Loader2 size={12} className="animate-spin" /> : <BellOff size={12} />}
                    Desativar
                  </button>
                </>
              )}
            </div>

            {testResult && (
              <div className="mt-3 text-[11px]" style={{ color: testResult.includes("Erro") ? COLORS.red : COLORS.green }}>
                {testResult}
              </div>
            )}

            {permission === "denied" && (
              <div className="mt-4 rounded-md p-3 text-[11px]" style={{ background: "var(--status-warning-bg)", color: COLORS.amber }}>
                Permissão de notificações foi negada. Para reativar, ajuste as configurações do navegador para este site.
              </div>
            )}
          </div>

          {/* Dispositivos Inscritos */}
          <div className="rounded-xl overflow-hidden" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
            <div className="p-4 border-b" style={{ borderColor: COLORS.border }}>
              <h3 className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Dispositivos Inscritos ({subscriptions.length})</h3>
            </div>
            <div className="divide-y" style={{ borderColor: COLORS.border }}>
              {subscriptions.map((sub) => (
                <div key={sub.id} className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Smartphone size={14} style={{ color: sub.is_active ? COLORS.green : COLORS.muted }} />
                    <div>
                      <p className="text-[12px] font-bold" style={{ color: COLORS.text }}>
                        {sub.device_type ?? "Dispositivo"}
                        {!sub.is_active && <span className="ml-2 text-[10px] uppercase" style={{ color: COLORS.muted }}>(inativo)</span>}
                      </p>
                      <p className="text-[10px] truncate max-w-md" style={{ color: COLORS.muted }}>
                        {sub.user_agent ?? sub.endpoint.substring(0, 60) + "..."}
                      </p>
                      <p className="text-[10px]" style={{ color: COLORS.muted }}>
                        {sub.last_used_at ? `Último uso: ${new Date(sub.last_used_at).toLocaleString("pt-BR")}` : "Nunca usado"}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(sub.id)}
                    className="px-2 py-1 rounded text-[10px] font-bold"
                    style={{ background: `${COLORS.red}15`, border: `1px solid ${COLORS.red}`, color: COLORS.red, cursor: "pointer" }}
                  >
                    Remover
                  </button>
                </div>
              ))}
              {subscriptions.length === 0 && (
                <div className="p-6 text-center">
                  <p className="text-[12px]" style={{ color: COLORS.muted }}>Nenhum dispositivo inscrito</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
