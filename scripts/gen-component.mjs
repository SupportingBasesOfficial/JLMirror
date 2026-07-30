#!/usr/bin/env node

/**
 * Generator de componentes — cria um novo componente no @repo/ui.
 *
 * Uso: pnpm gen:component -- --name badge
 * Cria: packages/ui/src/badge.tsx
 */

import { writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const name = process.argv
  .slice(2)
  .find((arg) => !arg.startsWith("--"))
  ?.replace(/^--name=/, "");

if (!name) {
  console.error("Uso: pnpm gen:component -- --name <nome-do-componente>");
  process.exit(1);
}

const filePath = join(process.cwd(), "packages", "ui", "src", `${name}.tsx`);

if (existsSync(filePath)) {
  console.error(`Componente "${name}" já existe em packages/ui/src/${name}.tsx`);
  process.exit(1);
}

const componentName = name
  .split("-")
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join("");

const template = `import * as React from "react";

import { cn } from "./lib/utils";

const ${componentName} = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors",
      className,
    )}
    {...props}
  />
));
${componentName}.displayName = "${componentName}";

export { ${componentName} };
`;

writeFileSync(filePath, template);
console.log(`✓ Componente criado: packages/ui/src/${name}.tsx`);
console.log(`  Lembre de adicionar o export em packages/ui/src/index.ts`);
