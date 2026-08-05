import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

// 1. Extrair permissões do código (requirePermission)
const routesDir = resolve(process.cwd(), "apps/api/src/routes");
const codePerms = new Set();

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
      for (const m of matches) codePerms.add(m[1]);
    }
  }
}

// Também verificar index.ts e middleware
walk(routesDir);
const indexContent = readFileSync(resolve(process.cwd(), "apps/api/src/index.ts"), "utf-8");
const indexMatches = indexContent.matchAll(/requirePermission\(["'`]([^"'`]+)["'`]\)/g);
for (const m of indexMatches) codePerms.add(m[1]);

// 2. Extrair permissões seedadas nas migrations
const migDir = resolve(process.cwd(), "migrations");
const seededPerms = new Set();

const migFiles = readdirSync(migDir).filter(f => f.endsWith(".sql"));
for (const f of migFiles) {
  const content = readFileSync(join(migDir, f), "utf-8");
  // Match INSERT INTO public.permissions ... VALUES ('key', ...
  const matches = content.matchAll(/INSERT\s+INTO\s+public\.permissions[^;]*?VALUES\s*([\s\S]*?);/gi);
  for (const m of matches) {
    const block = m[1];
    // Extract 'key' from each ('key', 'desc', 'cat') tuple
    const tuples = block.matchAll(/'([^']+)'/g);
    let first = true;
    for (const t of tuples) {
      if (first) {
        seededPerms.add(t[1]);
        first = false;
      }
      // Reset first=true after each tuple — need to count commas
    }
    // Better: match full tuples
    const fullTuples = block.matchAll(/\(\s*'([^']+)'[^)]*\)/g);
    for (const t of fullTuples) {
      seededPerms.add(t[1]);
    }
  }
}

// 3. Comparar
const codeSorted = [...codePerms].sort();
const seededSorted = [...seededPerms].sort();

const missingInDB = codeSorted.filter(p => !seededPerms.has(p));
const inDBNotInCode = seededSorted.filter(p => !codePerms.has(p));

console.warn(`Permissões no código: ${codeSorted.length}`);
console.warn(`Permissões seedadas: ${seededSorted.length}`);
console.warn("");

if (missingInDB.length > 0) {
  console.warn(`MISSING IN DB (${missingInDB.length}):`);
  for (const p of missingInDB) console.warn(`  ${p}`);
} else {
  console.warn("MISSING IN DB: 0");
}

console.warn("");

if (inDBNotInCode.length > 0) {
  console.warn(`IN DB BUT NOT IN CODE (${inDBNotInCode.length}):`);
  for (const p of inDBNotInCode) console.warn(`  ${p}`);
} else {
  console.warn("IN DB BUT NOT IN CODE: 0");
}
