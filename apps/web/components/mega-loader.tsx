// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import type { CSSProperties } from "react";

interface MegaLoaderProps {
  fullscreen?: boolean;
  label?: string;
  progress?: number | null;
}

export function MegaLoader({
  fullscreen = false,
  label,
  progress,
}: MegaLoaderProps) {
  const hasProgress =
    progress !== null && progress !== undefined && progress >= 0;
  const pct = hasProgress ? Math.min(100, Math.max(0, progress!)) : null;
  const containerStyle: CSSProperties = fullscreen
    ? {
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--surface-0)",
        animation: "jlFadeIn 0.3s ease-out",
      }
    : {
        minHeight: "60vh",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        animation: "jlFadeIn 0.3s ease-out",
      };

  return (
    <div style={containerStyle}>
      <div
        className="flex flex-col items-center gap-8"
        style={{ fontFamily: "var(--font-mono), 'Consolas', monospace" }}
      >
        {/* Logo — setas que respiram em ciclo alternado */}
        <svg width="40" height="40" viewBox="0 0 32 32" fill="none">
          <path
            d="M8 22V10M8 10L14 16M8 10L2 16"
            stroke="var(--brand-primary)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            transform="translate(4 0)"
            style={{ animation: "jlArrowUp 2.4s ease-in-out infinite" }}
          />
          <path
            d="M20 10V22M20 22L26 16M20 22L14 16"
            stroke="var(--brand-secondary)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            transform="translate(-2 0)"
            style={{ animation: "jlArrowDown 2.4s ease-in-out infinite 1.2s" }}
          />
          <circle cx="16" cy="16" r="1.5" fill="var(--brand-primary)" />
        </svg>

        {/* Brand */}
        <div className="text-center">
          <div
            className="text-sm font-bold tracking-[0.35em]"
            style={{ color: "var(--text-secondary)" }}
          >
            JLMIRROR
          </div>
          {label && (
            <div
              className="text-[10px] uppercase tracking-[0.2em] mt-2"
              style={{ color: "var(--text-muted)" }}
            >
              {label}
            </div>
          )}
        </div>

        {/* Indicador de progresso */}
        {pct !== null ? (
          <div className="flex flex-col items-center gap-2">
            <div
              className="relative h-[2px] w-40 overflow-hidden rounded-full"
              style={{ background: "var(--surface-2)" }}
            >
              <div
                className="absolute top-0 h-full rounded-full transition-[width] duration-150 ease-out"
                style={{
                  width: `${pct}%`,
                  background: "var(--brand-primary)",
                }}
              />
            </div>
            <div
              className="text-[10px] tabular-nums tracking-[0.1em]"
              style={{ color: "var(--text-muted)" }}
            >
              {pct}%
            </div>
          </div>
        ) : (
          <div className="flex items-end gap-[3px]" style={{ height: 16 }}>
            {[0, 0.12, 0.24, 0.36, 0.48].map((delay, i) => (
              <div
                key={i}
                className="w-[2px] rounded-full"
                style={{
                  height: "100%",
                  background: "var(--brand-primary)",
                  opacity: 0.5,
                  transformOrigin: "bottom",
                  animation: `jlSignalBar 1.2s ease-in-out infinite ${delay}s`,
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
