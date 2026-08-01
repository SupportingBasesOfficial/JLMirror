// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CursorProvider,
  ParticleTrail,
  MagneticButton,
  SpotlightCard,
} from "@/components/cursor-effects";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("As senhas não coincidem");
      return;
    }

    if (newPassword.length < 8) {
      setError("A nova senha deve ter no mínimo 8 caracteres");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/v1/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error?.message ?? "Erro ao trocar senha");
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        router.push("/auth/login");
        router.refresh();
      }, 2000);
    } catch {
      setError("Erro de conexão com o servidor");
    } finally {
      setLoading(false);
    }
  }

  const gridBg: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    backgroundImage: `linear-gradient(rgba(27,168,152,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(27,168,152,0.04) 1px, transparent 1px)`,
    backgroundSize: "40px 40px",
  };

  const radialGlow: React.CSSProperties = {
    position: "absolute",
    width: 600,
    height: 600,
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    background: "radial-gradient(circle, rgba(27,168,152,0.08) 0%, transparent 70%)",
    pointerEvents: "none",
  };

  const cardStyle: React.CSSProperties = {
    background: "rgba(13, 18, 24, 0.85)",
    backdropFilter: "blur(12px)",
    border: "1px solid #1E2530",
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(27, 168, 152, 0.05)",
  };

  const inputStyle: React.CSSProperties = {
    background: "#10171C",
    border: "1px solid #1E2530",
    color: "#C9D4DA",
    transition: "border-color 0.2s, box-shadow 0.2s",
  };

  const labelStyle: React.CSSProperties = {
    color: "#6E7F88",
  };

  const errorBoxStyle: React.CSSProperties = {
    background: "#E5484D10",
    border: "1px solid #E5484D55",
    color: "#E5484D",
  };

  const successBoxStyle: React.CSSProperties = {
    background: "#3DD68C10",
    border: "1px solid #3DD68C55",
    color: "#3DD68C",
  };

  function handleInputFocus(e: React.FocusEvent<HTMLInputElement>) {
    e.target.style.borderColor = "#1BA898";
    e.target.style.boxShadow = "0 0 0 3px rgba(27,168,152,0.1)";
  }

  function handleInputBlur(e: React.FocusEvent<HTMLInputElement>) {
    e.target.style.borderColor = "#1E2530";
    e.target.style.boxShadow = "none";
  }

  return (
    <CursorProvider>
      <ParticleTrail maxParticles={60} />
      <div
        className="flex min-h-screen items-center justify-center relative overflow-hidden"
        style={{
          background: "#0B1015",
          fontFamily: "'JetBrains Mono','Consolas',monospace",
        }}
      >
        <div style={gridBg} />
        <div style={radialGlow} />
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{
            background: "linear-gradient(90deg, transparent 0%, #1BA89844 50%, transparent 100%)",
          }}
        />

        <SpotlightCard
          spotlightColor="rgba(27, 168, 152, 0.10)"
          spotlightSize={320}
          className="w-full max-w-sm mx-4 rounded-xl p-8 relative"
          style={cardStyle}
        >
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-3">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <path
                  d="M16 2L28 8V16C28 22 22 28 16 30C10 28 4 22 4 16V8L16 2Z"
                  stroke="#1BA898"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M11 16L15 20L21 13"
                  stroke="#35D0C4"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h1 className="text-xl font-bold" style={{ color: "#1BA898" }}>
              Troca de Senha Obrigatória
            </h1>
            <p className="mt-1 text-[11px]" style={{ color: "#6E7F88" }}>
              Por segurança, defina uma nova senha para continuar
            </p>
          </div>

          {success ? (
            <div
              className="rounded-md p-4 text-sm text-center"
              style={successBoxStyle}
              role="status"
            >
              Senha alterada com sucesso! Redirecionando para login...
            </div>
          ) : (
            <form onSubmit={handleChangePassword} className="space-y-5">
              <div className="space-y-1.5">
                <label
                  htmlFor="current-password"
                  className="text-[11px] font-bold uppercase tracking-wide"
                  style={labelStyle}
                >
                  Senha Atual
                </label>
                <input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full rounded-md px-3 py-2.5 text-sm focus:outline-none"
                  style={inputStyle}
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="new-password"
                  className="text-[11px] font-bold uppercase tracking-wide"
                  style={labelStyle}
                >
                  Nova Senha
                </label>
                <input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                  required
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className="w-full rounded-md px-3 py-2.5 text-sm focus:outline-none"
                  style={inputStyle}
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="confirm-password"
                  className="text-[11px] font-bold uppercase tracking-wide"
                  style={labelStyle}
                >
                  Confirmar Nova Senha
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                  required
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className="w-full rounded-md px-3 py-2.5 text-sm focus:outline-none"
                  style={inputStyle}
                />
              </div>

              {error && (
                <div
                  className="rounded-md p-3 text-sm"
                  style={errorBoxStyle}
                  role="alert"
                >
                  {error}
                </div>
              )}

              <MagneticButton
                type="submit"
                disabled={loading}
                strength={0.2}
                className="w-full rounded-md py-2.5 text-sm font-bold transition-opacity disabled:opacity-50"
                style={{
                  background: "linear-gradient(135deg, #1BA898 0%, #35D0C4 100%)",
                  color: "#0B1015",
                  cursor: loading ? "not-allowed" : "pointer",
                  boxShadow: "0 0 20px rgba(27,168,152,0.25)",
                }}
              >
                {loading ? "Alterando..." : "Alterar Senha"}
              </MagneticButton>
            </form>
          )}

          <div className="mt-6 pt-5 border-t flex items-center justify-center gap-2" style={{ borderColor: "#1E2530" }}>
            <span
              className="rounded-full"
              style={{
                width: 5,
                height: 5,
                background: "#1BA898",
                animation: "pulse 2s infinite",
              }}
            />
            <span className="text-[9px] uppercase tracking-widest" style={{ color: "#6E7F88" }}>
              Sua senha será revogada em todas as sessões
            </span>
          </div>
        </SpotlightCard>
      </div>
    </CursorProvider>
  );
}
