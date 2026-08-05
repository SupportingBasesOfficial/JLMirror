import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const routesDir = resolve(process.cwd(), "apps/api/src/routes");
const perms = new Set();

function walk(dir) {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full);
    } else if (full.endsWith(".ts") && !full.endsWith(".test.ts")) {
      const content = readFileSync(full, "utf-8");
      const matches = content.matchAll(/requirePermission\(["'`]([^"'`]+)["'`]\)/g);
      for (const m of matches) {
        perms.add(m[1]);
      }
    }
  }
}

walk(routesDir);

const sorted = [...perms].sort();
console.warn(`Total unique permission keys: ${sorted.length}`);
for (const p of sorted) {
  console.warn(p);
}
