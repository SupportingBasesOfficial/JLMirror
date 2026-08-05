import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const webRoot = resolve(process.cwd(), "apps/web");
const appDir = join(webRoot, "app");

const navItemsContent = readFileSync(join(webRoot, "components/sidebar-nav-items.tsx"), "utf-8");
const adminHrefs = [...navItemsContent.matchAll(/href:\s*["'`]([^"'`]+)["'`]/g)].map(m => m[1]);

const clientSidebarContent = readFileSync(join(webRoot, "components/client-sidebar.tsx"), "utf-8");
const clientHrefs = [...clientSidebarContent.matchAll(/href:\s*["'`]([^"'`]+)["'`]/g)].map(m => m[1]);

const allHrefs = [...new Set([...adminHrefs, ...clientHrefs])].filter(h => h.startsWith("/"));

const results = [];
for (const href of allHrefs) {
  const pathSegments = href.split("/").filter(Boolean);
  const candidates = [
    join(appDir, ...pathSegments, "page.tsx"),
    join(appDir, ...pathSegments, "page.ts"),
    join(appDir, "(admin)", ...pathSegments, "page.tsx"),
    join(appDir, "(client)", ...pathSegments, "page.tsx"),
  ];
  const exists = candidates.some(p => existsSync(p));
  results.push({ href, exists });
}

const dead = results.filter(r => !r.exists);
const alive = results.filter(r => r.exists);

if (dead.length === 0) {
  console.warn("All sidebar links have corresponding page files!");
} else {
  console.warn(`DEAD LINKS (${dead.length}):`);
  for (const r of dead) {
    console.warn(`  ${r.href}`);
  }
}
console.warn(`\nTotal: ${results.length} links, ${alive.length} alive, ${dead.length} dead`);
