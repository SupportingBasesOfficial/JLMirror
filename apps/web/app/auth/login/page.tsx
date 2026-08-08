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
import {
  generateDeviceFingerprint,
  getDeviceLabel,
} from "@/lib/device-fingerprint";
import { useTenantBranding } from "@/lib/use-tenant-branding";

export default function LoginPage() {
  const router = useRouter();
  const { branding } = useTenantBranding();
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

      // Redirect por scope: global (JL staff) -> /admin, tenant (cliente) -> /dashboard
      const userScope = data.scope ?? "tenant";
      const targetRoute = userScope === "global" ? "/admin" : "/dashboard";
      router.push(targetRoute);
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
        body: JSON.stringify({
          challenge_token: challengeToken,
          code: mfaCode,
        }),
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

      // Redirect por scope: global (JL staff) -> /admin, tenant (cliente) -> /dashboard
      const userScope = data.scope ?? "tenant";
      const targetRoute = userScope === "global" ? "/admin" : "/dashboard";
      router.push(targetRoute);
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
    backgroundImage: `linear-gradient(${branding.primary_color}0A 1px, transparent 1px), linear-gradient(90deg, ${branding.primary_color}0A 1px, transparent 1px)`,
    backgroundSize: "40px 40px",
  };

  const radialGlow: React.CSSProperties = {
    position: "absolute",
    width: 600,
    height: 600,
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    background: `radial-gradient(circle, ${branding.primary_color}14 0%, transparent 70%)`,
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

  const labelStyle: React.CSSProperties = {
    color: "#6E7F88",
  };

  const errorBoxStyle: React.CSSProperties = {
    background: "#E5484D10",
    border: "1px solid #E5484D55",
    color: "#E5484D",
  };

  function handleInputFocus(e: React.FocusEvent<HTMLInputElement>) {
    e.target.style.borderColor = branding.primary_color;
    e.target.style.boxShadow = `0 0 0 3px ${branding.primary_color}1A`;
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
              background: `linear-gradient(90deg, transparent 0%, ${branding.primary_color}44 50%, transparent 100%)`,
            }}
          />

          <SpotlightCard
            spotlightColor={`${branding.primary_color}1A`}
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
                    stroke={branding.primary_color}
                  />
                  <path
                    d="M20 10V22M20 22L26 16M20 22L14 16"
                    stroke={branding.secondary_color}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    transform="translate(-2 0)"
                  />
                  <circle cx="16" cy="16" r="2" fill={branding.primary_color} />
                </svg>
              </div>
              <h1
                className="text-xl font-bold"
                style={{ color: branding.primary_color }}
              >
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
                  onChange={(e) =>
                    setMfaCode(e.target.value.replace(/\D/g, ""))
                  }
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
                  background: `linear-gradient(135deg, ${branding.primary_color} 0%, ${branding.secondary_color} 100%)`,
                  color: "#0B1015",
                  cursor: loading ? "not-allowed" : "pointer",
                  boxShadow: `0 0 20px ${branding.primary_color}40`,
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
            background: `linear-gradient(90deg, transparent 0%, ${branding.primary_color}44 50%, transparent 100%)`,
          }}
        />

        {/* Indicadores de status no canto */}
        <div
          className="absolute top-6 left-6 flex items-center gap-2"
          style={{ zIndex: 10 }}
        >
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
          <span
            className="text-[9px] uppercase tracking-widest"
            style={{ color: "#6E7F88" }}
          >
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
          spotlightColor={`${branding.primary_color}1A`}
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
                  stroke={branding.primary_color}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  transform="translate(4 0)"
                />
                <path
                  d="M20 10V22M20 22L26 16M20 22L14 16"
                  stroke={branding.secondary_color}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  transform="translate(-2 0)"
                />
                <circle cx="16" cy="16" r="2" fill={branding.primary_color} />
              </svg>
            </div>
            <h1
              className="text-2xl font-bold"
              style={{
                background: `linear-gradient(135deg, #C9D4DA 0%, ${branding.primary_color} 100%)`,
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
                background: `linear-gradient(135deg, ${branding.primary_color} 0%, ${branding.secondary_color} 100%)`,
                color: "#0B1015",
                cursor: loading ? "not-allowed" : "pointer",
                boxShadow: `0 0 20px ${branding.primary_color}40`,
              }}
            >
              {loading ? "Entrando..." : "Entrar"}
            </MagneticButton>
          </form>

          {/* Link para recuperação de senha */}
          <div className="mt-3 text-center">
            <a
              href="/auth/forgot-password"
              className="text-[11px] hover:opacity-80 transition-opacity"
              style={{ color: branding.primary_color }}
            >
              Esqueci minha senha
            </a>
          </div>

          {/* Divider */}
          <div className="mt-5 flex items-center gap-3">
            <div className="flex-1 h-px" style={{ background: "#1E2530" }} />
            <span
              className="text-[10px] uppercase tracking-widest"
              style={{ color: "#6E7F88" }}
            >
              ou
            </span>
            <div className="flex-1 h-px" style={{ background: "#1E2530" }} />
          </div>

          {/* Google OAuth */}
          <a
            href="/api/auth/oauth/google?return_url=/dashboard"
            className="mt-4 w-full flex items-center justify-center gap-2 rounded-md py-2.5 text-sm font-bold transition-opacity hover:opacity-80"
            style={{
              background: "#10171C",
              border: "1px solid #1E2530",
              color: "#C9D4DA",
              cursor: "pointer",
              textDecoration: "none",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Entrar com Google
          </a>

          {/* Footer do card */}
          <div
            className="mt-6 pt-5 border-t flex items-center justify-center gap-2"
            style={{ borderColor: "#1E2530" }}
          >
            <span
              className="rounded-full"
              style={{
                width: 5,
                height: 5,
                background: branding.primary_color,
                animation: "pulse 2s infinite",
              }}
            />
            <span
              className="text-[9px] uppercase tracking-widest"
              style={{ color: "#6E7F88" }}
            >
              Conexão Segura • RLS Ativo
            </span>
          </div>
        </SpotlightCard>
      </div>
    </CursorProvider>
  );
}
