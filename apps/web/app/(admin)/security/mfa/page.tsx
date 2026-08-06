// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState } from "react";
import { useApi } from "@/lib/use-api";
import { sanitizeUrl } from "@/lib/sanitize-url";

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
};

interface MfaStatus {
  totp_enabled: boolean;
  webauthn_enabled: boolean;
  webauthn_credentials: number;
}

interface MfaSetup {
  secret: string;
  qr_code_uri: string;
  recovery_codes: string[];
}

export default function MfaSettingsPage() {
  const { data: status, mutate: mutateStatus } =
    useApi<MfaStatus>("/api/mfa/status");
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showRecoveryCodes, setShowRecoveryCodes] = useState(false);

  async function handleSetup() {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/mfa/setup", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Erro ao iniciar setup MFA");
        return;
      }
      setSetup(data);
    } catch {
      setError("Erro de conexão");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifySetup() {
    if (!setup) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/mfa/setup/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ secret: setup.secret, code: verifyCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Código inválido");
        return;
      }
      setSuccess(
        "MFA habilitado com sucesso! Guarde seus códigos de recuperação.",
      );
      setSetup(null);
      setVerifyCode("");
      mutateStatus();
    } catch {
      setError("Erro de conexão");
    } finally {
      setLoading(false);
    }
  }

  async function handleDisable() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/mfa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: disableCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Código inválido");
        return;
      }
      setSuccess("MFA desabilitado.");
      setDisableCode("");
      mutateStatus();
    } catch {
      setError("Erro de conexão");
    } finally {
      setLoading(false);
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold" style={{ color: COLORS.teal }}>
            Segurança — MFA
          </h1>
          <p className="text-[12px]" style={{ color: COLORS.muted }}>
            Autenticação de dois fatores (TOTP)
          </p>
        </div>
        <a
          href="/dashboard"
          className="text-[12px] px-3 py-1.5 rounded border transition-colors"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            color: COLORS.muted,
          }}
        >
          ← Voltar
        </a>
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

      {/* Status atual */}
      <div
        className="rounded-xl p-5"
        style={{
          background: COLORS.card,
          border: `1px solid ${COLORS.border}`,
        }}
      >
        <div
          className="text-[13px] font-bold mb-4"
          style={{ color: COLORS.muted }}
        >
          STATUS ATUAL
        </div>
        <div className="flex gap-6">
          <div className="flex items-center gap-2">
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{
                background: status?.totp_enabled ? COLORS.green : COLORS.border,
              }}
            />
            <span className="text-sm">
              TOTP {status?.totp_enabled ? "Habilitado" : "Desabilitado"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{
                background: status?.webauthn_enabled
                  ? COLORS.green
                  : COLORS.border,
              }}
            />
            <span className="text-sm">
              WebAuthn{" "}
              {status?.webauthn_enabled
                ? `${status.webauthn_credentials} dispositivo(s)`
                : "Desabilitado"}
            </span>
          </div>
        </div>
      </div>

      {/* Setup TOTP */}
      {!status?.totp_enabled && !setup && (
        <div
          className="rounded-xl p-5"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
          }}
        >
          <div
            className="text-[13px] font-bold mb-2"
            style={{ color: COLORS.muted }}
          >
            HABILITAR MFA TOTP
          </div>
          <p className="text-sm mb-4" style={{ color: COLORS.muted }}>
            Use Google Authenticator, Authy ou 1Password para escanear o QR
            code.
          </p>
          <button
            onClick={handleSetup}
            disabled={loading}
            className="px-4 py-2 rounded-md text-sm font-bold transition-opacity disabled:opacity-50"
            style={{
              background: COLORS.teal,
              color: COLORS.bg,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Iniciando..." : "Iniciar configuração"}
          </button>
        </div>
      )}

      {/* QR Code + verificação */}
      {setup && (
        <div
          className="rounded-xl p-5 space-y-4"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
          }}
        >
          <div
            className="text-[13px] font-bold"
            style={{ color: COLORS.muted }}
          >
            ESCANEIE O QR CODE
          </div>
          <div className="flex flex-col sm:flex-row gap-5">
            <div className="flex-shrink-0">
              <a href={sanitizeUrl(setup.qr_code_uri)} className="block">
                {}
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(setup.qr_code_uri)}`}
                  alt="QR Code TOTP"
                  width={200}
                  height={200}
                  className="rounded-md"
                  style={{ border: `1px solid ${COLORS.border}` }}
                />
              </a>
            </div>
            <div className="flex-1 space-y-3">
              <div>
                <div
                  className="text-[11px] font-bold uppercase mb-1"
                  style={{ color: COLORS.muted }}
                >
                  Secret manual
                </div>
                <code
                  className="block p-2 rounded text-[12px] break-all"
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.teal,
                  }}
                >
                  {setup.secret}
                </code>
              </div>
              <div>
                <div
                  className="text-[11px] font-bold uppercase mb-1"
                  style={{ color: COLORS.muted }}
                >
                  Códigos de recuperação
                </div>
                <button
                  onClick={() => setShowRecoveryCodes(!showRecoveryCodes)}
                  className="text-[12px]"
                  style={{ color: COLORS.amber, cursor: "pointer" }}
                >
                  {showRecoveryCodes ? "Ocultar" : "Mostrar"} códigos
                </button>
                {showRecoveryCodes && (
                  <div
                    className="mt-2 p-3 rounded grid grid-cols-2 gap-1"
                    style={{
                      background: COLORS.bg,
                      border: `1px solid ${COLORS.border}`,
                    }}
                  >
                    {setup.recovery_codes.map((code, i) => (
                      <code
                        key={i}
                        className="text-[12px]"
                        style={{ color: COLORS.amber }}
                      >
                        {code}
                      </code>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-3">
            <label
              htmlFor="verify-setup-code"
              className="text-[11px] font-bold uppercase"
              style={{ color: COLORS.muted }}
            >
              Digite o código de 6 dígitos do seu autenticador
            </label>
            <div className="flex gap-3">
              <input
                id="verify-setup-code"
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={verifyCode}
                onChange={(e) =>
                  setVerifyCode(e.target.value.replace(/\D/g, ""))
                }
                placeholder="000000"
                className="rounded-md px-3 py-2 text-sm text-center tracking-[0.5em]"
                style={{
                  background: COLORS.bg,
                  border: `1px solid ${COLORS.border}`,
                  color: COLORS.text,
                  width: 200,
                }}
              />
              <button
                onClick={handleVerifySetup}
                disabled={loading || verifyCode.length !== 6}
                className="px-4 py-2 rounded-md text-sm font-bold disabled:opacity-50"
                style={{
                  background: COLORS.green,
                  color: COLORS.bg,
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                {loading ? "Verificando..." : "Confirmar"}
              </button>
              <button
                onClick={() => {
                  setSetup(null);
                  setVerifyCode("");
                }}
                className="px-4 py-2 rounded-md text-sm"
                style={{
                  background: COLORS.border,
                  color: COLORS.muted,
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Desabilitar MFA */}
      {status?.totp_enabled && (
        <div
          className="rounded-xl p-5 space-y-3"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
          }}
        >
          <div className="text-[13px] font-bold" style={{ color: COLORS.red }}>
            DESABILITAR MFA
          </div>
          <p className="text-sm" style={{ color: COLORS.muted }}>
            Digite um código TOTP válido para confirmar a desabilitação.
          </p>
          <div className="flex gap-3">
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              value={disableCode}
              onChange={(e) =>
                setDisableCode(e.target.value.replace(/\D/g, ""))
              }
              placeholder="000000"
              className="rounded-md px-3 py-2 text-sm text-center tracking-[0.5em]"
              style={{
                background: COLORS.bg,
                border: `1px solid ${COLORS.border}`,
                color: COLORS.text,
                width: 200,
              }}
            />
            <button
              onClick={handleDisable}
              disabled={loading || disableCode.length !== 6}
              className="px-4 py-2 rounded-md text-sm font-bold disabled:opacity-50"
              style={{
                background: COLORS.red,
                color: "#fff",
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Desabilitando..." : "Desabilitar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
