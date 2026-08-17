// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import React from "react";
import { useModuleFlags } from "@/lib/use-module-flags.js";

export default function FinopsPage() {
  const { requireModuleGuard, isLoading } = useModuleFlags();

  // Executa o barramento reativo de segurança na borda da renderização
  const isEnabled = requireModuleGuard("module_finops");

  if (isLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </main>
    );
  }

  // Trava a renderização visual caso o cliente não possua o módulo contratado
  if (!isEnabled) return null;

  return (
    <main className="min-h-screen flex flex-col p-6 bg-background">
      <div className="flex flex-col space-y-2 border-b border-border pb-4">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Finops Management
        </h1>
        <p className="text-sm text-muted-foreground">
          Módulo integrado da suite JLMIRROR — Controlado por Feature Flag:
          [module_finops]
        </p>
      </div>

      <div className="flex-1 flex items-center justify-center border border-dashed border-border rounded-xl mt-6 p-12 bg-muted/20">
        <p className="text-sm text-muted-foreground italic">
          Interface core do módulo [finops] pronta para acoplamento de
          componentes de lógica visual.
        </p>
      </div>
    </main>
  );
}
