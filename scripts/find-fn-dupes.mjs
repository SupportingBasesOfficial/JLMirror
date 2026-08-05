import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";

const dirs = [
  resolve(process.cwd(), "apps/api/src"),
  resolve(process.cwd(), "packages"),
];

const allFns = [];

function walk(dir) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const entry of entries) {
    const full = join(dir, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === "dist" || entry === ".next") continue;
      walk(full);
    } else if (full.endsWith(".ts") && !full.endsWith(".test.ts") && !full.endsWith(".d.ts")) {
      const content = readFileSync(full, "utf-8");
      const fileLines = content.split("\n");
      for (let i = 0; i < fileLines.length; i++) {
        const line = fileLines[i];
        const m = line.match(/^export\s+(?:async\s+)?function\s+(\w+)/);
        if (m) {
          const rel = relative(process.cwd(), full).replace(/\\/g, "/");
          allFns.push(`${m[1]}\t${rel}:${i + 1}`);
        }
      }
    }
  }
}

for (const dir of dirs) walk(dir);

// Find duplicate export function names across files
const byName = new Map();
for (const line of allFns) {
  const [name, location] = line.split("\t");
  if (!byName.has(name)) byName.set(name, []);
  byName.get(name).push(location);
}

const dupes = [];
for (const [name, locations] of byName) {
  if (locations.length > 1) {
    dupes.push(`DUPE: ${name} (${locations.length}x)`);
    for (const loc of locations) dupes.push(`  ${loc}`);
  }
}

if (dupes.length === 0) {
  console.warn("No duplicate exported functions found.");
} else {
  console.warn(dupes.join("\n"));
}
console.warn(`\nTotal exported functions: ${allFns.length}`);
