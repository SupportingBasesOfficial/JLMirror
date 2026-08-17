#!/usr/bin/env node

/**
 * JLMIRROR Enterprise Page Generator — Calibrado para Web
 * Cria uma nova página blindada com guards de Feature Flags no apps/web.
 *
 * Uso: pnpm gen:page -- --name finops --flag=module_finops
 * Cria: apps/web/app/finops/page.tsx
 */

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// Captura argumentos da linha de comandos
const args = process.argv.slice(2);
const name = args.find((arg) => !arg.startsWith("--") && !arg.includes("=")) 
  || args.find((arg) => arg.startsWith("--name="))?.split("=")[1];

const flag = args.find((arg) => arg.startsWith("--flag="))?.split("=")[1];

if (!name || !flag) {
  console.error("\n❌ ERRO DE PROTOCOLO DE AUTOMAÇÃO:");
  console.error("Uso obrigatório: pnpm gen:page -- --name <nome-da-pagina> --flag <chave_do_modulo>");
  console.error("Exemplo: pnpm gen:page -- --name finops --flag=module_finops\n");
  process.exit(1);
}

const dir = join(process.cwd(), "apps", "web", "app", name);

if (existsSync(dir)) {
  console.error(`\n❌ Conflito: A página "${name}" já existe em apps/web/app/${name}/\n`);
  process.exit(1);
}

mkdirSync(dir, { recursive: true });

// Nome do componente em PascalCase
const componentName = name.charAt(0).toUpperCase() + name.slice(1).replace(/[-_]([a-z])/g, (g) => g.toUpperCase());

const template = `// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import React from "react";
import { useModuleFlags } from "@/lib/use-module-flags.js";

export default function ${componentName}Page() {
  const { requireModuleGuard, isLoading } = useModuleFlags();

  // Executa o barramento reativo de segurança na borda da renderização
  const isEnabled = requireModuleGuard("${flag}");

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
        <h1 className="text-3xl font-bold tracking-tight text-foreground">${componentName} Management</h1>
        <p className="text-sm text-muted-foreground">
          Módulo integrado da suite JLMIRROR — Controlado por Feature Flag: [${flag}]
        </p>
      </div>
      
      <div className="flex-1 flex items-center justify-center border border-dashed border-border rounded-xl mt-6 p-12 bg-muted/20">
        <p className="text-sm text-muted-foreground italic">
          Interface core do módulo [${name}] pronta para acoplamento de componentes de lógica visual.
        </p>
      </div>
    </main>
  );
}
`;

writeFileSync(join(dir, "page.tsx"), template);
console.log(`\n🏆 [COMPILADO] Gerador calibrado para Web com sucesso.\n`);
