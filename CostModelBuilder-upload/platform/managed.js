/* Copilot Managed Runtime adapter.
   tools/build.mjs bundles this file (with the @microsoft/managed-apps SDK) into dist/platform.js, a classic script that
   loads before app.js. It sets window.CMB_PLATFORM, which puts app.js into "managed" mode.

   It speaks the same message vocabulary as the Cowork postMessage bridge (DEPLOYMENT.md §3), so app.js and engine.js
   are unchanged: the page sends the same requests, and results come back through the same validation.
   A capability turns on only when its connector is wired in platform/connectors.js and answers its readiness check;
   until then the page behaves as the standalone preview for that feature (local extraction, local guide search,
   simulated workbook build, autosave in this browser). */
import { getUser } from "@microsoft/managed-apps/auth";
import { getContext } from "@microsoft/managed-apps/app";
import { connectors } from "./connectors.js";

const TIMEOUT_MS = 8000;
const within = (p, ms, what) => { let t; return Promise.race([p, new Promise((_, no) => { t = setTimeout(() => no(new Error(`${what} timed out after ${ms / 1000} s`)), ms); })]).finally(() => clearTimeout(t)); };

const capabilities = {identity:false, store:false, extract:false, coach:false, workbook:false};
const status = {context:null, errors:[]};
let deliver = () => {};
const note = (where, e) => { const msg = `${where}: ${e && e.message || e}`; status.errors.push(msg); if (status.errors.length > 20) status.errors.shift(); console.warn("[managed]", msg); };
const tell = text => deliver({type:"host.notice", data:{text}});

// page → platform. Each handler answers with the matching host → page message, which app.js validates as before.
const handlers = {
  "app.ready": () => {},
  "opportunity.save": d => capabilities.store && connectors.store.save(d).catch(e => { note("store.save", e); tell("Couldn't save to your opportunity records. Use Save opportunity file until it reconnects."); }),
  "opportunity.discard": () => capabilities.store && connectors.store.discard().catch(e => note("store.discard", e)),
  "spec.extract.request": d => capabilities.extract && connectors.extract.request(d)
    .then(spec => spec && deliver({type:"spec.extract.result", data:spec}))
    .catch(e => { note("extract", e); tell("The Spec Extractor didn't answer. The survey sheet shows what this page could read itself."); }),
  "guide.ask": d => capabilities.coach && connectors.coach.ask(d)
    .then(a => a && deliver({type:"guide.answer", data:{id:d.id, text:a.text, refs:a.refs || []}}))
    .catch(e => note("coach", e)),   // the page falls back to its own search after 20 s
  "model.generate.request": d => capabilities.workbook && connectors.workbook.build(d)
    .then(r => r && deliver({type:"model.generate.result", data:r}))
    .catch(e => { note("workbook", e); tell("The workbook wasn't built. Download the payload and send it to the bid desk."); })
};

async function probe(name){
  const c = connectors[name];
  if (!c) return false;
  try { return !!(await within(Promise.resolve(c.ready ? c.ready() : true), TIMEOUT_MS, `${name} check`)); }
  catch (e){ note(`${name}.ready`, e); return false; }
}

window.CMB_PLATFORM = {
  label: "Managed app",
  capabilities,
  status,
  connectors,   // read at start(); tests put fakes here
  async start(receive){
    deliver = receive;
    try { status.context = await within(getContext(), TIMEOUT_MS, "host context"); }
    catch (e){ note("context", e); this.label = "Managed app (host not connected)"; deliver({type:"platform.ready"}); return; }
    try {
      const u = await within(getUser(), TIMEOUT_MS, "signed-in user");
      if (u && typeof u.fullName === "string" && u.fullName.trim()){
        capabilities.identity = true;
        // getUser gives the display name and Entra object ID; the UPN needs the Office 365 Users connector (connectors.identity).
        let upn = "";
        if (connectors.identity) try { upn = String(await within(connectors.identity.upn(), TIMEOUT_MS, "UPN") || ""); } catch (e){ note("identity.upn", e); }
        deliver({type:"session.user", data:{name:u.fullName, upn:upn || u.objectId || ""}});
      }
    } catch (e){ note("identity", e); }
    for (const name of ["store", "extract", "coach", "workbook"]) capabilities[name] = await probe(name);
    if (capabilities.store) try { deliver({type:"opportunity.draft", data:await connectors.store.latest()}); } catch (e){ note("store.latest", e); }
    deliver({type:"platform.ready"});
  },
  send(type, data){
    const h = handlers[type];
    if (!h) return;
    try { const r = h(data); if (r && r.catch) r.catch(e => note(type, e)); } catch (e){ note(type, e); }
  }
};
