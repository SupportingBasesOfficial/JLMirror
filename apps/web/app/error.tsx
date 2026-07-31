"use client";

import { useEffect } from "react";
import { logger } from "@repo/logger";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error(
      "Error boundary capturou erro de runtime",
      { err: error, digest: error.digest },
    );
  }, [error]);

  return (
    <main
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{
        background: "#0B1015",
        fontFamily: "'JetBrains Mono','Consolas',monospace",
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(229, 72, 77, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(229, 72, 77, 0.03) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{
          width: 500,
          height: 500,
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          background: "radial-gradient(circle, rgba(229, 72, 77, 0.08) 0%, transparent 70%)",
        }}
      />
      <div className="relative z-10 w-full max-w-md text-center space-y-6" style={{ animation: "fadeIn 0.3s ease-out" }}>
        <div className="flex justify-center">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#E5484D" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold" style={{ color: "#E5484D" }}>
            Algo deu errado
          </h2>
          <p className="text-sm" style={{ color: "#6E7F88" }}>
            Ocorreu um erro inesperado. Tente novamente.
          </p>
        </div>
        <button
          onClick={reset}
          className="px-4 py-2 rounded-md text-sm font-bold transition-all hover:scale-105"
          style={{
            background: "#E5484D15",
            border: "1px solid #E5484D55",
            color: "#E5484D",
            cursor: "pointer",
          }}
        >
          Tentar novamente
        </button>
      </div>
    </main>
  );
}
