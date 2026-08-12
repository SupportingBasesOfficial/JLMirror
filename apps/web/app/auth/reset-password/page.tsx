// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CursorProvider,
  ParticleTrail,
  MagneticButton,
  SpotlightCard,
} from "@/components/cursor-effects";
import { apiRoutes } from "@/lib/api-routes";
import type { ResetPasswordInput } from "@repo/shared-validation";

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Link de recuperação inválido — solicite um novo");
    }
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("As senhas não coincidem");
      return;
    }

    if (newPassword.length < 8) {
      setError("A senha deve ter no mínimo 8 caracteres");
      return;
    }

    if (!token) {
      setError("Link de recuperação inválido — solicite um novo");
      return;
    }

    setLoading(true);

    try {
      // Payload type-safe: ResetPasswordInput (Zod schema) garante que
      // token (min 32 chars) + new_password (min 8 chars) match o schema.
      const payload: ResetPasswordInput = {
        token,
        new_password: newPassword,
      };

      const res = await fetch(apiRoutes.auth.resetPassword, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error?.message ?? "Erro ao redefinir senha");
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        router.push("/auth/login");
        router.refresh();
      }, 2500);
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
    background:
      "radial-gradient(circle, rgba(27,168,152,0.08) 0%, transparent 70%)",
    pointerEvents: "none",
  };

  const cardStyle: React.CSSProperties = {
    background: "rgba(13, 18, 24, 0.85)",
    backdropFilter: "blur(12px)",
    border: "1px solid #1E2530",
    boxShadow:
      "0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(27, 168, 152, 0.05)",
  };

  const inputStyle: React.CSSProperties = {
    background: "#10171C",
    border: "1px solid #1E2530",
    color: "#C9D4DA",
    transition: "border-color 0.2s, box-shadow 0.2s",
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
            background:
              "linear-gradient(90deg, transparent 0%, #1BA89844 50%, transparent 100%)",
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
              Nova Senha
            </h1>
            <p className="mt-1 text-[11px]" style={{ color: "#6E7F88" }}>
              Defina sua nova senha de acesso
            </p>
          </div>

          {success ? (
            <div
              className="rounded-md p-4 text-sm text-center"
              style={successBoxStyle}
              role="status"
            >
              Senha redefinida com sucesso! Redirecionando para login...
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label
                  htmlFor="reset-new-password"
                  className="text-[11px] font-bold uppercase tracking-wide"
                  style={{ color: "#6E7F88" }}
                >
                  Nova Senha
                </label>
                <input
                  id="reset-new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                  required
                  autoComplete="new-password"
                  placeholder="Mínimo 8 caracteres"
                  className="w-full rounded-md px-3 py-2.5 text-sm focus:outline-none"
                  style={inputStyle}
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="reset-confirm-password"
                  className="text-[11px] font-bold uppercase tracking-wide"
                  style={{ color: "#6E7F88" }}
                >
                  Confirmar Nova Senha
                </label>
                <input
                  id="reset-confirm-password"
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
                disabled={loading || !token}
                strength={0.2}
                className="w-full rounded-md py-2.5 text-sm font-bold transition-opacity disabled:opacity-50"
                style={{
                  background:
                    "linear-gradient(135deg, #1BA898 0%, #35D0C4 100%)",
                  color: "#0B1015",
                  cursor: loading || !token ? "not-allowed" : "pointer",
                  boxShadow: "0 0 20px rgba(27,168,152,0.25)",
                }}
              >
                {loading ? "Redefinindo..." : "Redefinir Senha"}
              </MagneticButton>
            </form>
          )}

          <div
            className="mt-6 pt-5 border-t flex items-center justify-center gap-2"
            style={{ borderColor: "#1E2530" }}
          >
            <span
              className="rounded-full"
              style={{
                width: 5,
                height: 5,
                background: "#1BA898",
                animation: "pulse 2s infinite",
              }}
            />
            <span
              className="text-[9px] uppercase tracking-widest"
              style={{ color: "#6E7F88" }}
            >
              Todas as sessões serão revogadas
            </span>
          </div>
        </SpotlightCard>
      </div>
    </CursorProvider>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div
          className="flex min-h-screen items-center justify-center"
          style={{ background: "#0B1015" }}
        >
          <div
            className="animate-spin rounded-full h-8 w-8"
            style={{ borderTop: "2px solid #1BA898" }}
          />
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
