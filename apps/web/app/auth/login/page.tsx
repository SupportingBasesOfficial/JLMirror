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
import { generateDeviceFingerprint, getDeviceLabel } from "@/lib/device-fingerprint";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [, setMfaUser] = useState<{
    id: string;
    email: string;
    full_name: string | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          device_fingerprint: generateDeviceFingerprint(),
          device_label: getDeviceLabel(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error?.message ?? "Erro ao fazer login");
        return;
      }

      if (data.mfa_required) {
        setChallengeToken(data.challenge_token);
        setMfaUser(data.user);
        return;
      }

      if (data.must_change_password) {
        router.push("/auth/change-password");
        router.refresh();
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Erro de conexão com o servidor");
    } finally {
      setLoading(false);
    }
  }

  async function handleMfaVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!challengeToken) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/mfa-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challenge_token: challengeToken, code: mfaCode }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error?.message ?? "Código inválido");
        return;
      }

      if (data.must_change_password) {
        router.push("/auth/change-password");
        router.refresh();
        return;
      }

      router.push("/dashboard");
      router.refresh();
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

  function handleInputFocus(e: React.FocusEvent<HTMLInputElement>) {
    e.target.style.borderColor = "#1BA898";
    e.target.style.boxShadow = "0 0 0 3px rgba(27,168,152,0.1)";
  }

  function handleInputBlur(e: React.FocusEvent<HTMLInputElement>) {
    e.target.style.borderColor = "#1E2530";
    e.target.style.boxShadow = "none";
  }

  /* Tela de MFA (segundo fator) */
  if (challengeToken) {
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
            spotlightSize={300}
            className="w-full max-w-sm mx-4 rounded-xl p-8 relative"
            style={cardStyle}
          >
            {/* Logo */}
            <div className="text-center mb-8">
              <div className="flex items-center justify-center gap-2 mb-3">
                <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
                  <path
                    d="M8 22V10M8 10L14 16M8 10L2 16"
                    stroke="#1BA898"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    transform="translate(4 0)"
                  />
                  <path
                    d="M20 10V22M20 22L26 16M20 22L14 16"
                    stroke="#35D0C4"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    transform="translate(-2 0)"
                  />
                  <circle cx="16" cy="16" r="2" fill="#1BA898" />
                </svg>
              </div>
              <h1 className="text-xl font-bold" style={{ color: "#1BA898" }}>
                Verificação MFA
              </h1>
              <p className="mt-1 text-[11px]" style={{ color: "#6E7F88" }}>
                Digite o código do seu autenticador
              </p>
            </div>

            <form onSubmit={handleMfaVerify} className="space-y-5">
              <div className="space-y-1.5">
                <label
                  htmlFor="mfa-code"
                  className="text-[11px] font-bold uppercase tracking-wide"
                  style={labelStyle}
                >
                  Código TOTP (6 dígitos)
                </label>
                <input
                  id="mfa-code"
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                  required
                  placeholder="000000"
                  className="w-full rounded-md px-3 py-2.5 text-sm text-center tracking-[0.5em] focus:outline-none"
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
                disabled={loading || mfaCode.length !== 6}
                strength={0.2}
                className="w-full rounded-md py-2.5 text-sm font-bold transition-opacity disabled:opacity-50"
                style={{
                  background: "linear-gradient(135deg, #1BA898 0%, #35D0C4 100%)",
                  color: "#0B1015",
                  cursor: loading ? "not-allowed" : "pointer",
                  boxShadow: "0 0 20px rgba(27,168,152,0.25)",
                }}
              >
                {loading ? "Verificando..." : "Verificar"}
              </MagneticButton>

              <button
                type="button"
                onClick={() => {
                  setChallengeToken(null);
                  setMfaUser(null);
                  setMfaCode("");
                  setError(null);
                }}
                className="w-full text-[11px] transition-colors"
                style={{ color: "#6E7F88", cursor: "pointer" }}
              >
                ← Voltar para login
              </button>
            </form>
          </SpotlightCard>
        </div>
      </CursorProvider>
    );
  }

  /* Tela de login normal */
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
        {/* Grid pattern background */}
        <div style={gridBg} />
        {/* Radial glow */}
        <div style={radialGlow} />
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{
            background: "linear-gradient(90deg, transparent 0%, #1BA89844 50%, transparent 100%)",
          }}
        />

        {/* Indicadores de status no canto */}
        <div className="absolute top-6 left-6 flex items-center gap-2" style={{ zIndex: 10 }}>
          <span
            className="rounded-full"
            style={{
              width: 6,
              height: 6,
              background: "#3DD68C",
              boxShadow: "0 0 8px #3DD68C88",
              animation: "pulse 2s infinite",
            }}
          />
          <span className="text-[9px] uppercase tracking-widest" style={{ color: "#6E7F88" }}>
            Sistema Online
          </span>
        </div>

        <div className="absolute top-6 right-6" style={{ zIndex: 10 }}>
          <a
            href="/"
            className="text-[10px] uppercase tracking-widest transition-colors"
            style={{ color: "#6E7F88", textDecoration: "none" }}
            data-cursor="hover"
          >
            ← Voltar
          </a>
        </div>

        <SpotlightCard
          spotlightColor="rgba(27, 168, 152, 0.10)"
          spotlightSize={320}
          className="w-full max-w-sm mx-4 rounded-xl p-8 relative"
          style={cardStyle}
        >
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-3">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <path
                  d="M8 22V10M8 10L14 16M8 10L2 16"
                  stroke="#1BA898"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  transform="translate(4 0)"
                />
                <path
                  d="M20 10V22M20 22L26 16M20 22L14 16"
                  stroke="#35D0C4"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  transform="translate(-2 0)"
                />
                <circle cx="16" cy="16" r="2" fill="#1BA898" />
              </svg>
            </div>
            <h1
              className="text-2xl font-bold"
              style={{
                background: "linear-gradient(135deg, #C9D4DA 0%, #1BA898 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              JLMIRROR
            </h1>
            <p className="mt-1 text-[11px]" style={{ color: "#6E7F88" }}>
              Portal de Monitoramento
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="text-[11px] font-bold uppercase tracking-wide"
                style={labelStyle}
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
                required
                autoComplete="email"
                placeholder="admin@jlmirror.com"
                className="w-full rounded-md px-3 py-2.5 text-sm focus:outline-none"
                style={inputStyle}
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="text-[11px] font-bold uppercase tracking-wide"
                style={labelStyle}
              >
                Senha
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
                required
                autoComplete="current-password"
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
              {loading ? "Entrando..." : "Entrar"}
            </MagneticButton>
          </form>

          {/* Footer do card */}
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
              Conexão Segura • RLS Ativo
            </span>
          </div>
        </SpotlightCard>
      </div>
    </CursorProvider>
  );
}
