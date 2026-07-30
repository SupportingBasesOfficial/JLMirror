#!/usr/bin/env node

/**
 * Generator de páginas — cria uma nova página no apps/web.
 *
 * Uso: pnpm gen:page -- --name users
 * Cria: apps/web/app/users/page.tsx
 */

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const name = process.argv
  .slice(2)
  .find((arg) => !arg.startsWith("--"))
  ?.replace(/^--name=/, "");

if (!name) {
  console.error("Uso: pnpm gen:page -- --name <nome-da-pagina>");
  process.exit(1);
}

const dir = join(process.cwd(), "apps", "web", "app", name);

if (existsSync(dir)) {
  console.error(`Página "${name}" já existe em apps/web/app/${name}/`);
  process.exit(1);
}

mkdirSync(dir, { recursive: true });

const template = `export default function ${name.charAt(0).toUpperCase() + name.slice(1)}Page() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-4">
      <h1 className="text-2xl font-bold text-foreground">${name}</h1>
    </main>
  );
}
`;

writeFileSync(join(dir, "page.tsx"), template);
console.log(`✓ Página criada: apps/web/app/${name}/page.tsx`);
