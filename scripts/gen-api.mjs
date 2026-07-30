#!/usr/bin/env node

/**
 * Generator de API routes — cria um novo route handler no apps/web.
 *
 * Uso: pnpm gen:api -- --name users
 * Cria: apps/web/app/api/users/route.ts
 */

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const name = process.argv
  .slice(2)
  .find((arg) => !arg.startsWith("--"))
  ?.replace(/^--name=/, "");

if (!name) {
  console.error("Uso: pnpm gen:api -- --name <nome-da-rota>");
  process.exit(1);
}

const dir = join(process.cwd(), "apps", "web", "app", "api", name);

if (existsSync(dir)) {
  console.error(`Rota "${name}" já existe em apps/web/app/api/${name}/`);
  process.exit(1);
}

mkdirSync(dir, { recursive: true });

const template = `import { NextResponse } from "next/server";

/**
 * Route handler — /api/${name}
 *
 * Substitua este template pela sua lógica de negócio.
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    route: "/api/${name}",
    timestamp: new Date().toISOString(),
  });
}
`;

writeFileSync(join(dir, "route.ts"), template);
console.log(`✓ Rota criada: apps/web/app/api/${name}/route.ts`);
