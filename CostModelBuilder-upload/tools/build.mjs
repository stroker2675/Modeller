/* Build the deployable app into dist/ (the Copilot Managed Runtime default: ms app init --build-path ./dist, --build-command "npm run build").
   node tools/build.mjs               managed build: runtime files + dist/platform.js (the adapter and SDK, bundled)
   node tools/build.mjs --standalone  the same files without the adapter, for a plain static host
   Runtime files are copied byte for byte, so engine.js in dist is the one the tests and parity harness ran.
   The build fails if dist breaks the platform's default content security policy (tools/csp-check.mjs). */
import { mkdirSync, rmSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { checkCsp, loadExceptions } from "./csp-check.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RUNTIME = ["app.js", "engine.js", "guide.js", "map.js", "map-street.js", "data/reference-data.js", "data/geo/uk-areas.js", "data/geo/uk-postcodes.js", "data/geo/uk-places.js",
  "vendor/maplibre/maplibre-gl-csp.js", "vendor/maplibre/maplibre-gl-csp-worker.js", "vendor/maplibre/maplibre-gl.css", "vendor/maplibre/LICENSE.txt"];
const sha = b => createHash("sha256").update(b).digest("hex");

export async function build({standalone = false, out = join(ROOT, "dist"), quiet = false} = {}){
  const log = (...a) => quiet || console.log(...a);
  rmSync(out, {recursive:true, force:true}); for (const d of ["data/geo", "vendor/maplibre"]) mkdirSync(join(out, d), {recursive:true});
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  const files = {};
  for (const f of RUNTIME){ copyFileSync(join(ROOT, f), join(out, f)); files[f] = sha(readFileSync(join(out, f))); }

  let html = readFileSync(join(ROOT, "index.html"), "utf8");
  const tag = '<script src="data/reference-data.js"></script>';
  if (!html.includes(tag)) throw new Error("index.html no longer loads data/reference-data.js; update tools/build.mjs");
  if (!standalone){
    const esbuild = await import("esbuild");
    await esbuild.build({entryPoints:[join(ROOT, "platform", "managed.js")], bundle:true, format:"iife", target:"es2020", platform:"browser",
      minify:true, legalComments:"eof", outfile:join(out, "platform.js"), logLevel:quiet ? "silent" : "warning"});
    files["platform.js"] = sha(readFileSync(join(out, "platform.js")));
    html = html.replace(tag, `<script src="platform.js"></script>\r\n${tag}`);
    // The platform sets the CSP header (script-src 'self' <platform>). A meta policy would intersect with it and could block the
    // gateway's injected bridge script, so the managed build drops it; csp-check.mjs keeps the files inside the platform policy.
    const meta = /<meta http-equiv="Content-Security-Policy"[^>]*>\r?\n/i;
    if (!meta.test(html)) throw new Error("index.html CSP meta tag not found; update tools/build.mjs");
    html = html.replace(meta, "");
  }
  const kind = standalone ? "standalone" : "managed";
  html = html.replace(/<head>(\r?\n)/, `<head>$1<meta name="cmb-build" content="${kind} ${pkg.version}">$1`);
  writeFileSync(join(out, "index.html"), html); files["index.html"] = sha(html);

  const problems = checkCsp(out);
  if (problems.length){
    for (const p of problems) console.error(`${p.file}:${p.line}  ${p.why}  ${JSON.stringify(p.match)}`);
    throw new Error(`${problems.length} CSP problem(s) in the build`);
  }
  const manifest = {app:pkg.name, version:pkg.version, kind, builtAt:new Date().toISOString(), node:process.version,
    cspExceptions:loadExceptions().directives || {}, files};
  writeFileSync(join(out, "build.json"), JSON.stringify(manifest, null, 1));
  log(`Built ${kind} app ${pkg.version} into ${out} (${Object.keys(files).length} files). CSP check clean.`);
  return manifest;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]){
  const a = process.argv.slice(2), o = a.indexOf("--out");
  build({standalone:a.includes("--standalone"), out:o >= 0 ? a[o + 1] : undefined}).catch(e => { console.error(e.message); process.exit(1); });
}
