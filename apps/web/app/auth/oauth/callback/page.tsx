// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function OAuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const calledRef = useRef(false);

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const returnUrl = state ? decodeURIComponent(state) : "/dashboard";

    if (!code) {
      setError("Código de autorização não recebido");
      return;
    }

    async function exchangeCode(authCode: string) {
      try {
        const res = await fetch("/api/auth/oauth/callback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: "google",
            code: authCode,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data?.error?.message ?? "Falha na autenticação");
          return;
        }

        if (data.must_change_password) {
          router.push("/auth/change-password");
          router.refresh();
          return;
        }

        const targetRoute = data.scope === "global" ? "/admin" : returnUrl;
        router.push(targetRoute);
        router.refresh();
      } catch {
        setError("Erro de conexão com o servidor");
      }
    }

    exchangeCode(code);
  }, [searchParams, router]);

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{
        background: "#0B1015",
        fontFamily: "'JetBrains Mono','Consolas',monospace",
      }}
    >
      <div className="text-center space-y-4">
        {error ? (
          <>
            <div className="text-sm" style={{ color: "#E5484D" }}>
              {error}
            </div>
            <button
              onClick={() => router.push("/auth/login")}
              className="text-[12px] px-4 py-2 rounded-md"
              style={{
                background: "#1E2530",
                border: "1px solid #1E2530",
                color: "#C9D4DA",
                cursor: "pointer",
              }}
            >
              ← Voltar para login
            </button>
          </>
        ) : (
          <>
            <Loader2
              size={32}
              className="animate-spin mx-auto"
              style={{ color: "#1BA898" }}
            />
            <div className="text-sm" style={{ color: "#6E7F88" }}>
              Autenticando com Google...
            </div>
          </>
        )}
      </div>
    </div>
  );
}
