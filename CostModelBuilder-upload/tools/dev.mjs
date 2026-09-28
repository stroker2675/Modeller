/* Local loop for the managed build (what `ms app dev` starts via `npm run dev`): build dist/, serve it, rebuild on change.
   node tools/dev.mjs [--port 5173] [--standalone] [--strict]
   With no Managed Runtime host around it, the adapter waits 8 s for one, then labels itself "host not connected" and the
   page carries on as the standalone preview (local autosave, local guide search, simulated workbook). */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { watch } from "node:fs";
import { join, normalize, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "./build.mjs";
import { loadExceptions } from "./csp-check.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), ".."), OUT = join(ROOT, "dist");
const a = process.argv.slice(2), p = a.indexOf("--port"), PORT = Number(p >= 0 ? a[p + 1] : process.env.PORT || 5173), standalone = a.includes("--standalone"), strict = a.includes("--strict");
const TYPES = {".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".json":"application/json", ".svg":"image/svg+xml", ".png":"image/png", ".css":"text/css; charset=utf-8", ".txt":"text/plain; charset=utf-8"};
// Roughly the platform's default policy, so a local run shows the same CSP errors the hosted app would. The exceptions the app
// asks for (platform/csp-exceptions.json, the street map) are added unless --strict, which shows the app as it runs without them.
const BASE = {"default-src":["'self'"], "script-src":["'self'"], "style-src":["'self'", "'unsafe-inline'"], "img-src":["'self'", "data:"], "font-src":["'self'"],
  "connect-src":["'self'"], "worker-src":["'none'"], "child-src":["'none'"], "form-action":["'none'"], "frame-ancestors":["'self'"]};
if (!strict) for (const [k, v] of Object.entries(loadExceptions().directives || {})) BASE[k] = [...BASE[k].filter(x => x !== "'none'"), ...v];
const CSP = Object.entries(BASE).map(([k, v]) => `${k} ${v.join(" ")}`).join("; ");

await build({standalone});
let t = null;
for (const d of ["", "data", "platform"]) watch(join(ROOT, d), (ev, f) => {
  if (!f || !/\.(js|html|ts)$/.test(f) || d === "" && !["index.html", "app.js", "engine.js", "guide.js", "map.js", "map-street.js"].includes(f)) return;
  clearTimeout(t); t = setTimeout(() => build({standalone}).catch(e => console.error(e.message)), 150);
});
createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, "http://x").pathname); if (path.endsWith("/")) path += "index.html";
  const file = normalize(join(OUT, path));
  if (!file.startsWith(OUT)) { res.writeHead(403).end(); return; }
  try { await stat(file); res.writeHead(200, {"content-type":TYPES[extname(file)] || "application/octet-stream", "content-security-policy":CSP, "cache-control":"no-store"}); res.end(await readFile(file)); }
  catch { res.writeHead(404).end("Not found"); }
}).listen(PORT, "127.0.0.1", () => console.log(`Cost Model Builder (${standalone ? "standalone" : "managed"} build): http://127.0.0.1:${PORT}/`));
