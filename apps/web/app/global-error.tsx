// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useEffect } from "react";
import { logger } from "@repo/logger";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error(
      "Global error boundary capturou erro no root layout",
      { err: error, digest: error.digest },
    );
  }, [error]);

  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          padding: "2rem",
          fontFamily: "'JetBrains Mono','Consolas',monospace",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0B1015",
          color: "#C9D4DA",
        }}
      >
        <div style={{ maxWidth: "28rem", textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "1.5rem" }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#E5484D" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.5rem", color: "#E5484D" }}>
            Erro crítico
          </h2>
          <p style={{ fontSize: "0.875rem", color: "#6E7F88", marginBottom: "1.5rem" }}>
            Ocorreu um erro inesperado no nível raiz da aplicação.
          </p>
          <button
            onClick={reset}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.375rem",
              border: "1px solid #E5484D55",
              backgroundColor: "#E5484D15",
              color: "#E5484D",
              cursor: "pointer",
              fontSize: "0.875rem",
              fontWeight: 700,
            }}
          >
            Tentar novamente
          </button>
        </div>
      </body>
    </html>
  );
}
