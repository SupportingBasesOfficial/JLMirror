import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";

const dirs = [
  resolve(process.cwd(), "apps/api/src"),
  resolve(process.cwd(), "packages"),
];

const allExports = [];

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
        // export const foo = ... (arrow functions and const exports)
        const m = line.match(/^export\s+const\s+(\w+)/);
        if (m) {
          const rel = relative(process.cwd(), full).replace(/\\/g, "/");
          allExports.push(`${m[1]}\t${rel}:${i + 1}`);
        }
      }
    }
  }
}

for (const dir of dirs) walk(dir);

const byName = new Map();
for (const line of allExports) {
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
  console.warn("No duplicate exported consts found.");
} else {
  console.warn(dupes.join("\n"));
}
console.warn(`\nTotal exported consts: ${allExports.length}`);
