import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

// 1. Extrair chaves requireModule() do código
const apiSrc = resolve(process.cwd(), "apps/api/src");
const codeModules = new Set();

function walk(dir) {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === "dist") continue;
      walk(full);
    } else if (full.endsWith(".ts") && !full.endsWith(".test.ts")) {
      const content = readFileSync(full, "utf-8");
      const matches = content.matchAll(/requireModule\(["'`]([^"'`]+)["'`]\)/g);
      for (const m of matches) codeModules.add(m[1]);
    }
  }
}

walk(apiSrc);

// 2. Extrair feature_flags seedados nas migrations
const migDir = resolve(process.cwd(), "migrations");
const seededFlags = new Set();

const migFiles = readdirSync(migDir).filter(f => f.endsWith(".sql"));
for (const f of migFiles) {
  const content = readFileSync(join(migDir, f), "utf-8");
  // Match feature_flags INSERT with key column
  const matches = content.matchAll(/INSERT\s+INTO\s+public\.feature_flags[^;]*?VALUES\s*([\s\S]*?);/gi);
  for (const m of matches) {
    const block = m[1];
    // Each tuple: ('tenant_id', 'key', 'name', ...)
    // Extract the second quoted string (key) from each tuple
    const tuples = block.matchAll(/\(\s*(?:NULL|'[^']*'|\$\d+)\s*,\s*'([^']+)'/g);
    for (const t of tuples) {
      seededFlags.add(t[1]);
    }
  }
}

// 3. Comparar
const codeSorted = [...codeModules].sort();
const seededSorted = [...seededFlags].sort();

const missingInDB = codeSorted.filter(p => !seededFlags.has(p));
const inDBNotInCode = seededSorted.filter(p => !codeModules.has(p));

console.warn(`Módulos no código (requireModule): ${codeSorted.length}`);
console.warn(`Feature flags seedados: ${seededSorted.length}`);
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
