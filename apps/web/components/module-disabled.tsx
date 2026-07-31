"use client";

import Link from "next/link";
import { Puzzle, ArrowLeft } from "lucide-react";

// Componente para mostrar quando um modulo esta desativado
// Usado em paginas de modulos que podem ser ativados/desativados via feature flags
export function ModuleDisabled({ moduleName }: { moduleName: string }) {
  return (
    <div
      className="min-h-[60vh] flex items-center justify-center p-6"
      style={{ background: "var(--surface-0)" }}
    >
      <div
        className="max-w-md w-full rounded-2xl p-8 text-center"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border-default)",
        }}
      >
        <div
          className="flex items-center justify-center rounded-2xl mx-auto mb-4"
          style={{
            width: 56,
            height: 56,
            background: "var(--brand-glow)",
            border: "1px solid var(--brand-primary)33",
          }}
        >
          <Puzzle size={28} style={{ color: "var(--brand-primary)" }} />
        </div>

        <h2
          className="text-lg font-bold mb-2"
          style={{ color: "var(--text-primary)" }}
        >
          Módulo Inativo
        </h2>

        <p
          className="text-sm mb-1"
          style={{ color: "var(--text-secondary)" }}
        >
          O módulo <strong>{moduleName}</strong> não está ativado para este tenant.
        </p>

        <p
          className="text-xs mb-6"
          style={{ color: "var(--text-muted)" }}
        >
          Ative-o nas configurações de módulos para começar a usar.
        </p>

        <Link
          href="/settings/modules"
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all hover:opacity-90"
          style={{
            background: "var(--brand-primary)",
            color: "white",
          }}
        >
          <Puzzle size={16} />
          Ir para Módulos
        </Link>

        <div className="mt-4">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-xs font-medium transition-colors hover:opacity-70"
            style={{ color: "var(--text-muted)" }}
          >
            <ArrowLeft size={12} />
            Voltar ao Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
