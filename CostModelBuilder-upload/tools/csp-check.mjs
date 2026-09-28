/* Static check of a build folder against the Copilot Managed Runtime default content security policy:
   script-src 'self' (no inline script, no inline handlers, no eval, no CDNs) · connect-src 'self' (connectors go through the SDK)
   worker-src/child-src 'none' · form-action 'none' · font-src 'self' · img-src 'self' data:. Inline styles are allowed.
   Rules named per file in platform/csp-exceptions.json are waived for that file only (the street map's vendored MapLibre).
   Usage: node tools/csp-check.mjs [dist]   (exit 1 on any violation) */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const EXTERNAL = /^(https?:)?\/\//i;
const HTML_RULES = [
  [/<script\b(?![^>]*\bsrc=)[^>]*>\s*\S/gi, "inline <script> (script-src 'self')"],
  [/<script\b[^>]*\bsrc=["']?(https?:)?\/\//gi, "external script (script-src 'self')"],
  [/<[a-z][^>]*\son[a-z]+\s*=/gi, "inline event handler attribute (script-src 'self')"],
  [/\b(href|src|action)\s*=\s*["']?\s*javascript:/gi, "javascript: URL"],
  [/<link\b[^>]*\bhref=["']?(https?:)?\/\//gi, "external stylesheet or font (style-src/font-src 'self')"],
  [/<(iframe|frame|object|embed)\b/gi, "embedded frame or object (child-src 'none')"],
  [/<form\b/gi, "form element (form-action 'none'; handle submit in script)"],
  [/url\(\s*["']?(https?:)?\/\//gi, "external CSS url() (img-src/font-src 'self')"],
  [/@import\s+(url\()?["']?(https?:)?\/\//gi, "external @import"]
];
const JS_RULES = [
  [/\beval\s*\(/g, "eval() (no 'unsafe-eval')"],
  [/\bnew\s+Function\s*\(/g, "new Function() (no 'unsafe-eval')"],
  [/\bset(Timeout|Interval)\s*\(\s*["'`]/g, "string passed to setTimeout/setInterval (no 'unsafe-eval')"],
  [/\bnew\s+(Shared)?Worker\s*\(/g, "web worker (worker-src 'none')"],
  [/serviceWorker\s*\.\s*register\s*\(/g, "service worker (worker-src 'none')"],
  [/\bnew\s+(WebSocket|EventSource)\s*\(/g, "direct socket (connect-src 'self')"],
  [/\bfetch\s*\(\s*["'`](https?:)?\/\//g, "fetch to another origin (connect-src 'self'; use a connector)"],
  [/<[a-z][^<>]*\son(click|dblclick|change|input|submit|load|error|key\w+|mouse\w+|focus|blur|pointer\w+)\s*=\s*["'\\]/gi, "inline handler in generated HTML (script-src 'self')"],
  [/<script\b/gi, "script tag in generated HTML"],
  [/["'`]javascript:/gi, "javascript: URL"]
];

function walk(dir){ return readdirSync(dir).flatMap(n => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; }); }
const lineOf = (text, i) => text.slice(0, i).split("\n").length;
const EXCEPTIONS = join(dirname(fileURLToPath(import.meta.url)), "..", "platform", "csp-exceptions.json");
// The exceptions the app asks the platform for (platform/csp-exceptions.json). A rule is waived only for the file it names.
export function loadExceptions(file = EXCEPTIONS){ try { return JSON.parse(readFileSync(file, "utf8")); } catch { return {directives:{}, files:{}}; } }

export function checkCsp(dir, {exceptions = loadExceptions()} = {}){
  const problems = [], waived = (f, why) => ((exceptions.files || {})[f]?.allow || []).includes(why);
  for (const file of walk(dir)){
    const ext = extname(file).toLowerCase(), rules = ext === ".html" || ext === ".htm" ? HTML_RULES : ext === ".js" || ext === ".mjs" ? JS_RULES : ext === ".css" ? HTML_RULES.slice(-2) : null;
    if (!rules) continue;
    const text = readFileSync(file, "utf8"), rel = relative(dir, file).replace(/\\/g, "/");
    for (const [re, why] of rules){
      if (waived(rel, why)) continue;
      re.lastIndex = 0; let m;
      while ((m = re.exec(text))) problems.push({file:rel, line:lineOf(text, m.index), why, match:m[0].slice(0, 80)});
    }
    if (ext === ".html"){
      for (const m of text.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)){
        const u = m[1]; if (EXTERNAL.test(u) || u.startsWith("data:") || u.startsWith("#")) continue;
        try { statSync(join(dir, u.split(/[?#]/)[0])); } catch { problems.push({file:relative(dir, file).replace(/\\/g, "/"), line:lineOf(text, m.index), why:"referenced file missing from the build", match:u}); }
      }
    }
  }
  return problems;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]){
  const dir = process.argv[2] || "dist", p = checkCsp(dir);
  for (const x of p) console.log(`${x.file}:${x.line}  ${x.why}  ${JSON.stringify(x.match)}`);
  console.log(p.length ? `\n${p.length} CSP problem(s) in ${dir}.` : `CSP check: ${dir} is clean.`);
  process.exit(p.length ? 1 : 0);
}
