// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import type { CSSProperties } from "react";

interface MegaLoaderProps {
  fullscreen?: boolean;
  label?: string;
  progress?: number | null;
}

export function MegaLoader({ fullscreen = false, label, progress }: MegaLoaderProps) {
  const hasProgress = progress !== null && progress !== undefined && progress >= 0;
  const pct = hasProgress ? Math.min(100, Math.max(0, progress!)) : null;
  const containerStyle: CSSProperties = fullscreen
    ? {
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--surface-0)",
        animation: "jlFadeIn 0.2s ease-out",
      }
    : {
        minHeight: "60vh",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        animation: "jlFadeIn 0.2s ease-out",
      };

  return (
    <div style={containerStyle}>
      <div
        className="flex flex-col items-center gap-5"
        style={{ fontFamily: "var(--font-mono), 'Consolas', monospace" }}
      >
        {/* Logo — setas que respiram em ciclo alternado */}
        <svg width="64" height="64" viewBox="0 0 32 32" fill="none">
          <path
            d="M8 22V10M8 10L14 16M8 10L2 16"
            stroke="var(--brand-primary)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            transform="translate(4 0)"
            style={{ animation: "jlArrowUp 2s ease-in-out infinite" }}
          />
          <path
            d="M20 10V22M20 22L26 16M20 22L14 16"
            stroke="var(--brand-secondary)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            transform="translate(-2 0)"
            style={{ animation: "jlArrowDown 2s ease-in-out infinite 1s" }}
          />
          <circle cx="16" cy="16" r="1.5" fill="var(--brand-primary)" />
        </svg>

        {/* Brand */}
        <div className="text-center">
          <div
            className="text-sm font-bold tracking-[0.35em]"
            style={{ color: "var(--text-primary)" }}
          >
            JLMIRROR
          </div>
          {label && (
            <div
              className="text-[10px] uppercase tracking-[0.2em] mt-1.5"
              style={{ color: "var(--text-muted)" }}
            >
              {label}
            </div>
          )}
        </div>

        {/* Barra de progresso — determinada quando pct disponivel, indeterminada caso contrario */}
        <div
          className="relative h-[2px] w-48 overflow-hidden rounded-full"
          style={{ background: "var(--surface-2)" }}
        >
          {pct !== null ? (
            <div
              className="absolute top-0 h-full rounded-full transition-[width] duration-150 ease-out"
              style={{
                width: `${pct}%`,
                background: "var(--brand-primary)",
              }}
            />
          ) : (
            <div
              className="absolute top-0 h-full w-[30%] rounded-full"
              style={{
                background: "var(--brand-primary)",
                animation: "jlTravel 1.4s ease-in-out infinite",
              }}
            />
          )}
        </div>

        {/* Percentual numerico quando determinado */}
        {pct !== null && (
          <div
            className="text-[10px] tabular-nums tracking-[0.1em]"
            style={{ color: "var(--text-muted)" }}
          >
            {pct}%
          </div>
        )}
      </div>
    </div>
  );
}
