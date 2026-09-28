// The managed-app build: dist layout, CSP compliance, and the adapter's handshake with a simulated Managed Runtime host.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import vm from "node:vm";
import { build } from "../tools/build.mjs";
import { checkCsp } from "../tools/csp-check.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const sha = b => createHash("sha256").update(b).digest("hex");
const tmp = () => mkdtempSync(join(tmpdir(), "cmb-build-"));

test("managed build: runtime files copied byte for byte, adapter loads before app.js, CSP clean", async () => {
  const out = tmp();
  try {
    const m = await build({out, quiet:true});
    assert.equal(m.kind, "managed");
    for (const f of ["app.js", "engine.js", "guide.js", "data/reference-data.js"]) assert.equal(sha(readFileSync(join(out, f))), sha(readFileSync(join(ROOT, f))), f);
    const html = readFileSync(join(out, "index.html"), "utf8"), at = s => html.indexOf(`<script src="${s}"></script>`);
    assert.ok(at("platform.js") > 0 && at("platform.js") < at("data/reference-data.js") && at("data/reference-data.js") < at("app.js"));
    assert.match(html, /<meta name="cmb-build" content="managed /);
    assert.equal(/http-equiv="Content-Security-Policy"/i.test(html), false, "the platform owns the CSP header");
    assert.deepEqual(checkCsp(out), []);
  } finally { rmSync(out, {recursive:true, force:true}); }
});

test("standalone build has no adapter", async () => {
  const out = tmp();
  try {
    await build({out, standalone:true, quiet:true});
    assert.equal(existsSync(join(out, "platform.js")), false);
    assert.equal(readFileSync(join(out, "index.html"), "utf8").includes("platform.js"), false);
    assert.match(readFileSync(join(out, "index.html"), "utf8"), /http-equiv="Content-Security-Policy"/i, "a plain static host keeps the meta policy");
  } finally { rmSync(out, {recursive:true, force:true}); }
});

test("CSP check catches what the platform's default policy blocks", () => {
  const d = tmp();
  try {
    mkdirSync(join(d, "data"));
    writeFileSync(join(d, "index.html"), `<html><head><script>alert(1)</script><script src="https://cdn.example.com/x.js"></script><link rel="stylesheet" href="https://fonts.example.com/f.css"></head>
<body><button onclick="go()">Go</button><form action="/x"></form><iframe src="a.html"></iframe><script src="missing.js"></script><img src="data:image/png;base64,AA"></body></html>`);
    writeFileSync(join(d, "a.js"), `eval("1"); new Function("x"); setTimeout("go()", 1); new Worker("w.js"); fetch("https://api.example.com"); el.innerHTML = '<b onclick="x()">';`);
    const why = checkCsp(d).map(p => p.why);
    for (const w of ["inline <script>", "external script", "external stylesheet", "inline event handler attribute", "form element", "embedded frame", "referenced file missing",
      "eval()", "new Function()", "string passed to setTimeout", "web worker", "fetch to another origin", "inline handler in generated HTML"]) assert.ok(why.some(x => x.startsWith(w)), `expected: ${w}`);
    assert.equal(why.filter(x => x.startsWith("referenced file missing")).length, 2, "a.html and missing.js; the data: image is fine");
    mkdirSync(join(d, "vendor", "maplibre"), {recursive:true}); writeFileSync(join(d, "vendor", "maplibre", "maplibre-gl-csp.js"), `new Worker(u); new Function("x");`);
    const v = checkCsp(d).filter(p => p.file.startsWith("vendor/")).map(p => p.why);
    assert.deepEqual(v, ["new Function() (no 'unsafe-eval')"], "an exception waives only the rule it names, only for the file it names");
    assert.ok(checkCsp(d).some(p => p.file === "a.js" && p.why.startsWith("web worker")), "other files still may not start workers");
  } finally { rmSync(d, {recursive:true, force:true}); }
});

test("the street map's CSP exceptions are narrow and in the build manifest", async () => {
  const x = JSON.parse(readFileSync(join(ROOT, "platform", "csp-exceptions.json"), "utf8")), out = tmp();
  assert.deepEqual(Object.keys(x.directives).sort(), ["connect-src", "img-src", "worker-src"]);
  assert.deepEqual(x.directives["connect-src"], ["https://tiles.openfreemap.org"]);
  assert.ok(Object.keys(x.files).every(f => f.startsWith("vendor/maplibre/")), "only vendored MapLibre is waived");
  try {
    const m = await build({out, quiet:true});
    assert.deepEqual(m.cspExceptions, x.directives);
    for (const f of ["map.js", "map-street.js", "vendor/maplibre/maplibre-gl-csp.js", "vendor/maplibre/maplibre-gl-csp-worker.js", "vendor/maplibre/LICENSE.txt"]) assert.ok(m.files[f], f);
    assert.equal(sha(readFileSync(join(out, "engine.js"))), sha(readFileSync(join(ROOT, "engine.js"))));
  } finally { rmSync(out, {recursive:true, force:true}); }
});

function hostSim({user = {fullName:"Alex Example", objectId:"11111111-1111-4111-8111-111111111111", tenantId:"t"}, hang = false} = {}){
  const calls = [];
  const channel = {send:async (def, params) => {
    calls.push(def.method);
    if (def.method === "app/getContext") return {app:{appId:"app-1", environmentId:"env-1"}, host:{sessionId:"s-1"}};
    if (def.method === "auth/getUser") return user;
    return undefined;
  }, notify(){}, on(){}, dispose(){}};
  const window = {__platformBridge:{connect:() => hang ? new Promise(() => {}) : Promise.resolve(channel)}, parent:null};
  window.parent = window;
  const ctx = vm.createContext({window, console:{log(){}, warn(){}, error(){}, info(){}, debug(){}}, setTimeout, clearTimeout, Promise, MessageChannel, navigator:{userAgent:"node"}, location:{href:"https://app.example/", origin:"https://app.example"}, performance, crypto:globalThis.crypto, URL, TextEncoder, TextDecoder});
  ctx.self = ctx.globalThis = window;
  return {ctx, window, calls};
}

test("adapter handshake with a simulated host: identity only until connectors are wired", async () => {
  const out = tmp();
  try {
    await build({out, quiet:true});
    const {ctx, window, calls} = hostSim();
    vm.runInContext(readFileSync(join(out, "platform.js"), "utf8"), ctx);
    const P = window.CMB_PLATFORM;
    assert.ok(P && typeof P.start === "function" && typeof P.send === "function");
    const got = [];
    await P.start(m => got.push(m));
    assert.deepEqual(calls.slice(0, 2), ["app/getContext", "auth/getUser"]);
    const plain = x => JSON.parse(JSON.stringify(x));   // values from the vm realm
    assert.deepEqual(got.map(m => m.type), ["session.user", "platform.ready"]);
    assert.deepEqual(plain(got[0].data), {name:"Alex Example", upn:"11111111-1111-4111-8111-111111111111"});
    assert.deepEqual(plain(P.capabilities), {identity:true, store:false, extract:false, coach:false, workbook:false});
    for (const t of ["opportunity.save", "spec.extract.request", "guide.ask", "model.generate.request", "unknown.type"]) P.send(t, {id:"x"});   // no connector: ignored, never throws
    assert.equal(got.length, 2);
    assert.deepEqual(plain(P.status.errors), []);
  } finally { rmSync(out, {recursive:true, force:true}); }
});

test("adapter with wired connectors: capabilities turn on, replies use the bridge vocabulary, failures become notices", async () => {
  const out = tmp();
  try {
    await build({out, quiet:true});
    const {ctx, window} = hostSim();
    vm.runInContext(readFileSync(join(out, "platform.js"), "utf8"), ctx);
    const P = window.CMB_PLATFORM, got = [], saved = [];
    const draft = {schema:"CostModelOpportunity/1.0", client:"Test Co", sites:3};
    P.connectors.store = {ready:async () => true, latest:async () => draft, save:async O => { saved.push(O); if (O.fail) throw new Error("503"); }, discard:async () => {}};
    P.connectors.coach = {ready:async () => true, ask:async q => ({text:`About ${q.question}`, refs:["lever:pension"]})};
    P.connectors.extract = {ready:async () => false, request:async () => ({})};   // not ready: stays off
    await P.start(m => got.push(m));
    const plain = x => JSON.parse(JSON.stringify(x));
    assert.deepEqual(plain(P.capabilities), {identity:true, store:true, extract:false, coach:true, workbook:false});
    assert.deepEqual(got.map(m => m.type), ["session.user", "opportunity.draft", "platform.ready"]);
    assert.equal(got[1].data.client, "Test Co");
    P.send("guide.ask", {id:"g1", question:"factoring"});
    P.send("opportunity.save", {schema:"CostModelOpportunity/1.0", fail:true});
    P.send("spec.extract.request", {files:[]});
    await new Promise(r => setTimeout(r, 20));
    assert.deepEqual(plain(got.slice(3)).map(m => m.type).sort(), ["guide.answer", "host.notice"]);
    assert.deepEqual(plain(got.find(m => m.type === "guide.answer").data), {id:"g1", text:"About factoring", refs:["lever:pension"]});
    assert.equal(saved.length, 1);
    assert.ok(P.status.errors.some(e => e.startsWith("store.save")));
  } finally { rmSync(out, {recursive:true, force:true}); }
});
