/**
 * Lists unique npm package roots referenced by import/from/require in server + client/src.
 * Run: node scripts/list-external-imports.mjs
 */
import fs from "fs";
import path from "path";

const pkgs = new Set();

function norm(spec) {
  if (!spec || spec.startsWith(".") || spec.startsWith("@/")) return null;
  if (spec.startsWith("node:")) return null;
  if (spec.startsWith("@")) {
    const parts = spec.split("/");
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : spec;
  }
  return spec.split("/")[0];
}

function scanFile(text) {
  const patterns = [
    /\bfrom\s+["']([^"']+)["']/g,
    /\bimport\s+["']([^"']+)["']/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text))) {
      const n = norm(m[1]);
      if (n) pkgs.add(n);
    }
  }
}

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) {
      if (f.name === "node_modules" || f.name === "dist" || f.name === "build") continue;
      walk(p);
    } else if (/\.(ts|tsx|mts|cts|js|mjs)$/.test(f.name)) {
      try {
        scanFile(fs.readFileSync(p, "utf8"));
      } catch {
        /* ignore */
      }
    }
  }
}

for (const root of ["server", path.join("client", "src"), "shared"]) {
  walk(root);
}

console.log([...pkgs].sort().join("\n"));
