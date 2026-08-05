import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";

const routesDir = resolve(process.cwd(), "apps/api/src/routes");
const lines = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full);
    } else if (full.endsWith(".ts") && !full.endsWith(".test.ts")) {
      const content = readFileSync(full, "utf-8");
      const fileLines = content.split("\n");
      for (let i = 0; i < fileLines.length; i++) {
        const line = fileLines[i];
        // Match .get("/path"), .post("/path", etc. — capture method and path
        const m = line.match(/(\w+)\.(get|post|put|delete|patch)\(\s*["'`]([^"'`]+)["'`]/);
        if (m) {
          const varName = m[1];
          // Skip c.get("user") — Hono context getter, not a route
          if (varName === "c" || varName === "ctx" || varName === "context") continue;
          const method = m[2].toUpperCase();
          const path = m[3];
          const rel = relative(process.cwd(), full).replace(/\\/g, "/");
          lines.push(`${method}\t${path}\t${rel}:${i + 1}`);
        }
      }
    }
  }
}

walk(routesDir);
lines.sort();

// Find duplicates by method+path within the same file
const byKey = new Map();
for (const line of lines) {
  const parts = line.split("\t");
  const method = parts[0];
  const path = parts[1];
  const location = parts[2];
  const file = location.split(":")[0];
  const key = `${method} ${path} @ ${file}`;
  if (!byKey.has(key)) byKey.set(key, []);
  byKey.get(key).push(location);
}

const dupes = [];
for (const [key, locations] of byKey) {
  if (locations.length > 1) {
    dupes.push(`DUPE: ${key} (${locations.length}x)`);
    for (const loc of locations) dupes.push(`  ${loc}`);
  }
}

if (dupes.length === 0) {
  console.warn("No duplicate routes found.");
} else {
  console.warn(dupes.join("\n"));
}
console.warn(`\nTotal route definitions: ${lines.length}`);
