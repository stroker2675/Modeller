/* Cost Model Builder UI: rendering, events, file readers and the Cowork bridge. The pricing rules are in engine.js. */
"use strict";
/* ---------- Deterministic pseudo-random so sample packs are stable ---------- */
function rng(seed){ let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const REGIONS = ["London","South East","Midlands","North West","North East","Yorkshire","Scotland","Wales","South West","East"];

function makeSites(n, seed, cfg){
  const r = rng(seed), out = [];
  for (let i = 0; i < n; i++){
    const u = r(), fmt = u < cfg.mix[0] ? "Small" : u < cfg.mix[0] + cfg.mix[1] ? "Medium" : "Large";
    const drawn = REGIONS[Math.floor(r() * REGIONS.length)], place = cfg.towns[i % cfg.towns.length], region = TOWN_REGION[place] || drawn;
    const base = cfg.sqft[fmt], sqft = Math.round(base * (0.75 + r() * 0.5) / 100) * 100;
    const town = place + (i >= cfg.towns.length ? " " + (Math.floor(i / cfg.towns.length) + 1) : "");
    const s = {id: cfg.prefix + String(i + 1).padStart(4, "0"), name: town, format: fmt, region, sqft,
      clientHours: cfg.clientHours ? Math.max(cfg.minHours || 0, Math.round(sqft / cfg.clientHours[fmt] * (0.9 + r() * 0.2) * 2) / 2) : null,
      grade: cfg.grades ? cfg.grades[Math.floor(r() * cfg.grades.length)] : null};
    out.push(s);
  }
  return out;
}
const TOWNS = ["Aberdeen","Basildon","Bath","Belfast","Birmingham","Bolton","Bradford","Brighton","Bristol","Cambridge","Cardiff","Carlisle","Chelmsford","Chester","Coventry","Croydon","Derby","Doncaster","Dundee","Edinburgh","Exeter","Glasgow","Gloucester","Guildford","Hull","Ipswich","Kingston","Leeds","Leicester","Lincoln","Liverpool","Luton","Manchester","Milton Keynes","Newcastle","Northampton","Norwich","Nottingham","Oxford","Peterborough","Plymouth","Portsmouth","Preston","Reading","Sheffield","Southampton","Stockport","Stoke","Sunderland","Swansea","Swindon","Telford","Watford","Wigan","Wolverhampton","York"];
// Sample regions follow the town, the way a client's own site list would
const TOWN_REGION = Object.fromEntries([["Scotland", "Aberdeen Dundee Edinburgh Glasgow"], ["Wales", "Cardiff Swansea"], ["Northern Ireland", "Belfast"], ["London", "Croydon Kingston"],
  ["North East", "Newcastle Sunderland"], ["North West", "Bolton Carlisle Chester Liverpool Manchester Preston Stockport Wigan"], ["Yorkshire", "Bradford Doncaster Hull Leeds Sheffield York"],
  ["Midlands", "Birmingham Coventry Derby Leicester Lincoln Northampton Nottingham Stoke Telford Wolverhampton"], ["East", "Basildon Cambridge Chelmsford Ipswich Luton Norwich Peterborough Watford"],
  ["South East", "Brighton Guildford Milton_Keynes Oxford Portsmouth Reading Southampton"], ["South West", "Bath Bristol Exeter Gloucester Plymouth Swindon"]]
  .flatMap(([rg, t]) => t.split(" ").map(x => [x.replace("_", " "), rg])));

/* Sample packs: illustrative extractions modelled on the example tenders in C:\CModels.
   Excerpts are paraphrased for the demo. In production, citations come from the Spec Extractor agent. */
const PACKS = {
  electricals: {
    title: "Electricals retail and offices", note: "Modelled on the Currys pack · DOCX spec · 280 sites",
    files: [{name:"Store Cleaning Specification.docx", size:"1.2 MB", pages: 18}, {name:"Site list.xlsx", size:"86 KB", pages: 1}],
    spec: () => ({
      client:{name:"National electricals retailer (sample)", sector:"Retail + offices", cite:{doc:"Store Cleaning Specification.docx", page:1, text:"Cleaning services for all UK retail stores and support offices."}},
      term:{years:3, start:"2026-07-01", ext:2, cite:{doc:"Store Cleaning Specification.docx", page:2, text:"Initial term of three years with an option to extend by up to two years."}, startCite:{doc:"Store Cleaning Specification.docx", page:2, text:"Services are expected to commence on 1 July 2026."}},
      sites: makeSites(277, 11, {prefix:"CR", towns:TOWNS, mix:[.35,.45], sqft:{Small:9000, Medium:18000, Large:32000}, minHours:10})
               .concat([{id:"CR-HO1", name:"Support Centre", format:"Office", region:"London", sqft:60000, clientHours:null},
                        {id:"CR-HO2", name:"Sheffield office", format:"Office", region:"Yorkshire", sqft:22000, clientHours:null},
                        {id:"CR-HO3", name:"Newark office", format:"Office", region:"Midlands", sqft:14000, clientHours:null}]),
      sitesCite:{doc:"Site list.xlsx", page:1, text:"277 stores and 3 offices with gross internal area (sq ft)."},
      service:{minHours:10, minHoursCite:{doc:"Store Cleaning Specification.docx", page:6, text:"A minimum of 10 hours per store per week must be delivered."},
               auditPass:85, auditCite:{doc:"Store Cleaning Specification.docx", page:11, text:"Where the audit score falls below 85% the supplier shall provide an action plan within 5 working days."},
               tradingShare:null},
      commercial:{paymentDays:60, payCite:{doc:"Store Cleaning Specification.docx", page:14, text:"Payment terms are 60 days from receipt of a valid invoice."},
                  credits:true, credCite:{doc:"Store Cleaning Specification.docx", page:14, text:"Hours not delivered will be credited against the following month's invoice."},
                  indexation:null, rebate:null, tupe:true},
      equipment:{clientSupplied:false, cobots:false},
      incumbentHours:null, livingWage:null
    })
  },
  fashion: {
    title: "Value fashion stores", note: "Modelled on the Primark pack · PDF spec · 194 stores, client hours given",
    files: [{name:"Input Specification.pdf", size:"640 KB", pages: 9}, {name:"Store hours schedule.xlsx", size:"54 KB", pages: 1}],
    spec: () => ({
      client:{name:"Value fashion retailer (sample)", sector:"Retail", cite:{doc:"Input Specification.pdf", page:1, text:"Store cleaning across 194 UK stores."}},
      term:{years:3, start:"2026-09-01", ext:1, cite:{doc:"Input Specification.pdf", page:2, text:"Three-year agreement with a one-year extension option."}, startCite:{doc:"Input Specification.pdf", page:2, text:"Target mobilisation date: September 2026."}},
      sites: makeSites(194, 23, {prefix:"PK", towns:TOWNS, mix:[.2,.45], sqft:{Small:25000, Medium:50000, Large:90000},
               clientHours:{Small:380, Medium:440, Large:520}, grades:["A","B","C"]}),
      sitesCite:{doc:"Store hours schedule.xlsx", page:1, text:"Weekly cleaning hours per store by grade A/B/C."},
      service:{minHours:null, auditPass:null, tradingShare:[20,40], tradeCite:{doc:"Input Specification.pdf", page:4, text:"Between 20% and 40% of hours should be delivered during trading hours."}},
      commercial:{paymentDays:30, payCite:{doc:"Input Specification.pdf", page:7, text:"Standard payment terms of 30 days."}, credits:false,
                  indexation:"Annual review", rebate:420000, rebCite:{doc:"Input Specification.pdf", page:8, text:"Suppliers may propose an upfront rebate."}, tupe:true, rateCard:true},
      equipment:{clientSupplied:false, cobots:false},
      incumbentHours: 37440, livingWage:null
    })
  },
  grocery: {
    title: "Grocery estate with cobots", note: "Modelled on the Asda pack · 65-page PDF · 607 stores",
    files: [{name:"Appendix 4 - Retail cleaning Specification.pdf", size:"4.8 MB", pages: 65}, {name:"Store attributes.xlsx", size:"2.1 MB", pages: 1}],
    spec: () => ({
      client:{name:"National grocer (sample)", sector:"Grocery retail", cite:{doc:"Appendix 4 - Retail cleaning Specification.pdf", page:1, text:"Retail cleaning specification covering 27 defined store areas."}},
      term:{years:5, start:"2026-04-01", ext:2, cite:{doc:"Appendix 4 - Retail cleaning Specification.pdf", page:3, text:"Five-year term with extension by mutual agreement."}, startCite:{doc:"Appendix 4 - Retail cleaning Specification.pdf", page:3, text:"The contract is to start in April 2026."}},
      sites: makeSites(607, 37, {prefix:"GR", towns:TOWNS, mix:[.3,.4], sqft:{Small:12000, Medium:38000, Large:75000},
               clientHours:{Small:280, Medium:330, Large:380}}),
      sitesCite:{doc:"Store attributes.xlsx", page:1, text:"Store list with sales area, car park and current cleaning hours."},
      service:{minHours:null, auditPass:null, tradingShare:null},
      commercial:{paymentDays:45, payCite:{doc:"Appendix 4 - Retail cleaning Specification.pdf", page:58, text:"Invoices payable within 45 days."}, credits:false,
                  indexation:"2% fixed", idxCite:{doc:"Appendix 4 - Retail cleaning Specification.pdf", page:59, text:"Annual indexation fixed at 2%."}, rebate:null, tupe:true},
      equipment:{clientSupplied:null, cobots:true, cobotCite:{doc:"Appendix 4 - Retail cleaning Specification.pdf", page:22, text:"Suppliers are encouraged to propose autonomous floor-cleaning technology."}},
      incumbentHours:null, livingWage:null
    })
  }
};
/* ---------- State ---------- */
const STEPS = [
  {id:"docs", label:"Documents", sub:"Load the tender pack"},
  {id:"spec", label:"Extracted spec", sub:"Check what was found"},
  {id:"questions", label:"Questions", sub:"Answer the red marks"},
  {id:"sites", label:"Sites & hours", sub:"Weekly hours per site"},
  {id:"price", label:"Price build", sub:"Adjust, run, compare"},
  {id:"board", label:"Board summary", sub:"Client and internal view"},
  {id:"insights", label:"What it tells us", sub:"The model, explained"},
  {id:"generate", label:"Generate model", sub:"Populate the template"}
];
let SESSION_USER = null;   // the signed-in person, from the Cowork host (session.user); survives Start over and Resume
const fresh = () => ({user:SESSION_USER, step:"docs", pack:null, files:[], spec:null, extracted:false, answers:{}, qi:0, importReport:null,
  runs:[], view:"client", internal:{wageMult:0.985, uniformsPct:40}, overrides:{}, generated:false, visited:{docs:true}});
let S = fresh();

/* ---------- Render helpers ---------- */
const $ = s => document.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const gbp = (v, d = 0) => "£" + Number(v).toLocaleString("en-GB", {minimumFractionDigits:d, maximumFractionDigits:d});
const gbpK = v => Math.abs(v) >= 1e6 ? "£" + (v / 1e6).toFixed(2) + "m" : Math.abs(v) >= 1e3 ? "£" + (v / 1e3).toFixed(1) + "k" : gbp(v);
const STAMP = {doc:["doc","DOC"], ans:["ans","ANS"], bm:["bm","BM"], def:["def","DEF"], gap:["gap","GAP"], est:["est","EST"]};
const stamp = (k, title) => { const [c, l] = STAMP[k] || STAMP.def; return `<span class="stamp ${c}"${title ? ` title="${esc(title)}"` : ""}>${l}</span>`; };
const loc = c => c.page ? ", p." + c.page : c.para ? ", ¶" + c.para : "";
const cite = c => c ? `<p class="cite">“${esc(c.text)}” · ${esc(c.doc)}${loc(c)}</p>` : "";
function toast(msg){ const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 2600); }
function stepDone(id){
  switch (id){
    case "docs": return S.extracted; case "spec": return S.extracted && !!S.visited.spec;
    case "questions": return S.extracted && openReds() === 0; case "sites": return S.extracted && S.spec.sites.length > 0 && !!S.visited.sites;
    case "price": return S.runs.length > 0; case "board": return !!S.visited.board; case "insights": return !!S.visited.insights; case "generate": return S.generated;
  }
}
function go(id){
  if (id !== "docs" && !S.extracted){ toast("Load a tender pack first."); id = "docs"; }
  S.step = id; S.visited[id] = true;
  if (Spot.active) Spot.end(false, true);
  if (!G.pinned){ G.cur = null; G.hist = []; }
  render(); $("#main").scrollTop = 0;
  const cur = document.querySelector('.rail [aria-current="step"]'); if (cur && matchMedia("(max-width:760px)").matches) cur.scrollIntoView({inline:"center", block:"nearest"});
  const h = document.getElementById("h-" + id); if (h){ h.setAttribute("tabindex", "-1"); h.focus({preventScroll:true}); }
}
function renderRail(){
  $("#steps").innerHTML = STEPS.map((s, i) => {
    const done = stepDone(s.id), reds = s.id === "questions" && S.extracted ? openReds() : 0;
    return `<li class="${done ? "done" : ""}"><button type="button" data-go="${s.id}" ${S.step === s.id ? 'aria-current="step"' : ""}>
      <span class="box" aria-hidden="true">${done ? "" : i + 1}</span>
      <span class="lbl">${s.label}<small>${s.sub}</small></span>
      ${reds ? `<span class="reds" aria-label="${reds} open">${reds}</span>` : "<span></span>"}
      <span class="sr">${done ? "(complete)" : ""}</span></button></li>`;
  }).join("");
}
let lastCharge = null;
function renderTrace(){
  if (typeof Guide !== "undefined") Guide.tick();
  const R = compute();
  if (!R){ $("#trace").innerHTML = `<div><h2 class="small" style="font-size:var(--fs-s)">Price trace</h2><p class="small muted">The price builds here as you work: weekly charge, annual value, margin stack and open questions.</p><p class="small muted">${S.spec ? "Add the site list to see the price." : "Load a tender pack to start."}</p></div>`; return; }
  const T = R.T, m = T.margin, reds = openReds(), F = flags(R);
  const parts = [["Labour", T.labour, "#1c1e21"], ["Materials", T.materials, "#6a6c70"], ["Kit & other", T.machinery + T.uniforms + T.other, "#9a9aa0"],
    ["Management", T.mgmt + T.rebate, "#1f5a9e"], ["PL & factoring", T.pl + T.fact, "#7c5300"], ["Overheads", T.oh, "#b69a5a"], ["Profit", T.profit, "#2c6a39"]];
  const changed = lastCharge != null && Math.abs(lastCharge - T.charge) > 0.5; lastCharge = T.charge;
  $("#trace").innerHTML = `
    <div><div class="xs muted">Weekly charge, all sites</div><div class="big pulse ${changed ? "hit" : ""}" id="tCharge">${gbp(T.charge)}</div>
      <div class="small muted">${gbpK(T.annual)} a year · ${gbpK(T.contract)} over ${S.spec.term.years} yrs${num(S.spec.term.ext) ? ` (${gbpK(T.contractExt)} with the ${S.spec.term.ext}-yr extension)` : ""}</div></div>
    <div><div class="row"><span>Hours / wk</span><b>${Math.round(T.hours).toLocaleString("en-GB")}</b></div>
      <div class="row"><span>Headcount</span><b>${T.hc.toLocaleString("en-GB")}</b></div>
      <div class="row"><span>Revenue / labour hr</span><b>${gbp(T.revPerHr, 2)}</b></div>
      <div class="row"><span>Labour % revenue (priced)</span><b>${T.labourPct.toFixed(1)}%</b></div>
      <div class="row"><span>Contribution (client / internal)</span><b>${T.contrib.toFixed(1)}% / ${T.intContrib.toFixed(1)}%</b></div></div>
    <div><div class="xs muted">Where the charge goes</div>
      <div class="stack" role="img" aria-label="Charge breakdown">${parts.map(p => `<i style="width:${(p[1] / T.charge * 100).toFixed(2)}%;background:${p[2]}" title="${p[0]} ${(p[1] / T.charge * 100).toFixed(1)}%"></i>`).join("")}</div>
      <div class="legend">${parts.map(p => `<span style="--c:${p[2]}">${p[0]} ${(p[1] / T.charge * 100).toFixed(1)}%</span>`).join("")}</div></div>
    <div><div class="row"><span>Open red marks</span><b class="${reds ? "redcount" : ""}">${reds}</b></div>
      <div class="row"><span>Warnings</span><b>${F.filter(x => x.lvl === "warn").length}</b></div>
      <div class="row"><span>Runs launched</span><b>${S.runs.length}</b></div>
      ${reds ? `<button class="btn" type="button" data-go="questions" style="margin-top:.5rem">Answer ${reds} open question${reds > 1 ? "s" : ""}</button>` : ""}</div>`;
  if (changed) requestAnimationFrame(() => setTimeout(() => { const e = $("#tCharge"); if (e) e.classList.remove("hit"); }, 60));
}

/* ---------- Step 1: Documents ---------- */
function renderDocs(){
  const busy = S.extracting;
  const saved = !S.extracted && !S.files.length && !busy ? Store.read() : null;
  $("#s-docs").innerHTML = `
    ${saved ? `<div class="resume" role="region" aria-label="Saved work" data-guide="el:resume"><div><b>Resume ${esc(saved.client || "the saved opportunity")}</b><span class="small muted">${plural(saved.sites || 0, "site")}${saved.weeklyCharge != null ? ` · ${gbp(saved.weeklyCharge)} a week` : ""} · saved ${esc(new Date(saved.savedAt).toLocaleString("en-GB", {dateStyle:"medium", timeStyle:"short"}))} ${Store.where()}</span></div>
      <div class="actions"><button class="btn primary" type="button" id="resumeBtn">Resume</button><button class="btn ghost" type="button" id="discardBtn">${S.confirmDiscard ? "Confirm: delete the saved copy" : "Discard"}</button></div></div>` : ""}
    <header><div><h2 id="h-docs">Load the tender pack</h2><p class="muted">Add the client's specification, site list and any pricing schedules. The Spec Extractor agent reads them and records where it found each fact.</p></div></header>
    <div class="drop" id="drop" tabindex="0" role="button" aria-describedby="dropHint" data-guide="el:drop">
      <b>Drop PDF, DOCX, XLSX or CSV files here</b>
      <span class="small muted" id="dropHint">or <u>browse your files</u>. In Cowork the files go to the opportunity folder in SharePoint. This preview reads DOCX specs and XLSX, CSV or TSV site lists in the browser; PDFs are read by the Cowork agent. A saved opportunity file (.json) opens where you left off.</span>
    </div>
    <input type="file" id="fileIn" multiple accept=".pdf,.docx,.xlsx,.xls,.doc,.csv,.tsv,.txt,.json" class="sr" tabindex="-1" aria-label="Choose tender files">
    <h3>Or try a sample pack</h3>
    <p class="small muted">These are illustrative packs modelled on the example tenders in this folder. Site lists are synthetic and the excerpts are paraphrased.</p>
    <div class="packs" data-guide="el:packs">${Object.entries(PACKS).map(([k, p]) => `<button type="button" data-pack="${k}" aria-pressed="${S.pack === k}"><b>${esc(p.title)}</b><span>${esc(p.note)}</span></button>`).join("")}</div>
    ${S.files.length ? `<h3>Files in this opportunity</h3><ul class="files">${S.files.map(f => `<li><span>${esc(f.name)}</span><span class="xs muted">${esc(f.size)}${f.pages ? " · " + f.pages + " pp" : ""}</span>${S.extracted ? stamp("doc", "Read") : '<span class="xs muted">Queued</span>'}</li>`).join("")}</ul>` : ""}
    ${busy ? `<div aria-live="polite"><div class="progress" aria-hidden="true"><i id="prog"></i></div><p class="small" id="progText">Reading documents…</p><div class="skel" style="width:70%"></div><div class="skel" style="width:52%"></div><div class="skel" style="width:61%"></div></div>` : ""}
    <div class="actions" style="margin-top:1rem">
      <button class="btn primary" type="button" id="extractBtn" data-guide="el:extract" ${!S.files.length || busy ? "disabled" : ""} ${busy ? 'aria-busy="true"' : ""}>${S.extracted ? "Re-run extraction" : busy ? "Extracting…" : "Extract specification"}</button>
      ${S.extracted ? `<button class="btn" type="button" data-go="spec">Review extracted spec</button>` : ""}
      ${!S.files.length ? '<span class="small muted">Add files or pick a sample pack to continue.</span>' : ""}
    </div>`;
}
/* ---------- File readers (standalone preview; in Cowork the Spec Extractor agent does this) ---------- */
const FILES = new Map();   // file name → File, kept outside state because File objects don't serialise
async function unzip(buf, want){
  const dv = new DataView(buf), u8 = new Uint8Array(buf), out = {};
  let e = buf.byteLength - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error("not a zip container");
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
  for (let i = 0; i < n; i++){
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nl)); p += 46 + nl + xl + cl;
    if (!want(name)) continue;
    const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true), data = u8.subarray(start, start + csize);
    out[name] = method === 0 ? data : new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
  }
  return out;
}
const xml = bytes => new DOMParser().parseFromString(new TextDecoder().decode(bytes), "application/xml");
async function readDocx(file){
  const z = await unzip(await file.arrayBuffer(), n => n === "word/document.xml");
  if (!z["word/document.xml"]) throw new Error("no document body");
  return [...xml(z["word/document.xml"]).getElementsByTagNameNS("*", "p")].map(p => [...p.getElementsByTagNameNS("*", "t")].map(t => t.textContent).join("")).filter(t => t.trim());
}
async function readXlsx(file){
  const z = await unzip(await file.arrayBuffer(), n => n === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  const ss = z["xl/sharedStrings.xml"] ? [...xml(z["xl/sharedStrings.xml"]).getElementsByTagNameNS("*", "si")].map(si => [...si.getElementsByTagNameNS("*", "t")].map(t => t.textContent).join("")) : [];
  const col = r => { let c = 0; for (const ch of r.replace(/\d+/g, "")) c = c * 26 + ch.charCodeAt(0) - 64; return c - 1; };
  return Object.keys(z).filter(k => k.includes("worksheets")).sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/))).map(k => {
    return [...xml(z[k]).getElementsByTagNameNS("*", "row")].map(row => {
      const cells = [];
      [...row.getElementsByTagNameNS("*", "c")].forEach(c => { const t = c.getAttribute("t"), v = c.getElementsByTagNameNS("*", "v")[0];
        let x = t === "s" ? ss[+(v && v.textContent)] : t === "inlineStr" ? [...c.getElementsByTagNameNS("*", "t")].map(n => n.textContent).join("") : v ? v.textContent : "";
        cells[col(c.getAttribute("r") || "A")] = x ?? ""; });
      return [...cells].map(x => x ?? "");
    });
  });
}

const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
function reportText(rep){
  if (!rep) return "";
  const parts = [`Loaded ${plural(rep.loaded, "site")} from ${esc(rep.source)} (${rep.delim}${rep.header ? ", columns matched by header" : ", columns in the standard order"}${rep.sqm ? ", sq m converted to sq ft" : ""}).`];
  if (rep.skipped.length) parts.push(`Skipped ${rep.skipped.length}: ${[...new Set(rep.skipped.map(s => s.reason))].join(", ")}.`);
  if (rep.areaSum) parts.push(`Floor area is the sum of ${rep.areaSum.map(esc).join(" + ")}.`);
  if (rep.formatMap) parts.push(`The client's own formats were mapped to size bands by floor area: ${Object.entries(rep.formatMap).map(([k, v]) => `${esc(k)} → ${v}`).join(", ")}. Check them; the band sets the productivity rate.`);
  if (rep.inferred) parts.push(`${plural(rep.inferred, "site")} had no format; inferred from floor area.`);
  const withHeads = (S.spec.sites || []).filter(s => s.heads > 0).length;
  if (withHeads) parts.push(`${plural(withHeads, "site")} ${withHeads === 1 ? "has" : "have"} a client headcount (TUPE). It is used as given for NI and uniforms.`);
  if (rep.dupIds.length) parts.push(`<b>Duplicate IDs:</b> ${rep.dupIds.slice(0, 6).map(esc).join(", ")}. Both rows kept.`);
  return parts.join(" ");
}

async function readUploads(sp){
  const order = f => /\.json$/i.test(f.name) ? 1 : 0;   // an extractor's OpportunitySpec is applied after the app has read the documents itself
  for (const f of S.files.slice().sort((a, b) => order(a) - order(b))){
    const file = FILES.get(f.name), ext = (f.name.split(".").pop() || "").toLowerCase();
    if (!file) continue;
    try {
      if (ext === "docx"){
        applyDocFacts(sp, docFacts(await readDocx(file), f.name), f.name);
      } else if (ext === "xlsx" || ext === "csv" || ext === "tsv" || ext === "txt"){
        applySiteFile(sp, ext === "xlsx" ? {sheets: await readXlsx(file)} : {text: await file.text()}, f.name);
      } else if (ext === "json"){
        let X; try { X = JSON.parse(await file.text()); } catch (e){ throw new Error("not valid JSON"); }
        applyOpportunitySpec(sp, X);
      } else if (ext === "pdf" || ext === "doc"){
        sp.notes.push(`${f.name}: ${ext.toUpperCase()} text is read by the Spec Extractor agent in Cowork. Enter the key terms on the survey sheet below.`);
      }
    } catch (e){ sp.notes.push(`${f.name}: could not be read (${e.message}).`); }
  }
  return sp;
}
async function extract(){
  S.extracting = true; S.extracted = false; render();
  const stages = ["Reading documents…", "Finding the site schedule…", "Extracting scope, frequencies and SLAs…", "Reading commercial terms…", "Checking gaps against required inputs…"];
  if (Bridge.can("extract")){ Bridge.send("spec.extract.request", {files:S.files.map(f => f.name)}); }
  for (let i = 0; i < stages.length; i++){
    const p = $("#prog"), t = $("#progText"); if (p) p.style.transform = `scaleX(${(i + 1) / stages.length})`; if (t) t.textContent = stages[i];
    await new Promise(r => setTimeout(r, 380));
  }
  S.answers = {}; S.runs = []; S.overrides = {}; S.qi = 0; S.importReport = null;
  S.spec = S.pack ? normaliseSpec(PACKS[S.pack].spec()) : normaliseSpec(await readUploads(blankSpec(S.files)));
  if (S.pendingAgentSpec){ agentSpec(S.pendingAgentSpec); S.pendingAgentSpec = null; }
  S.extracting = false; S.extracted = true;
  toast(S.spec.custom ? `Documents read: ${S.spec.sites.length ? S.spec.sites.length + " sites found" : "no site list yet"}. Fill in the gaps on the survey sheet.` : `Spec extracted: ${S.spec.sites.length} sites, ${openReds()} critical questions to answer.`);
  go("spec");
}

/* ---------- Step 2: Extracted spec (an editable survey sheet) ---------- */
function specInput(sp, F){
  const v = getPath(sp, F.p), id = "sp-" + F.p.replace(/\./g, "-");
  if (F.type === "bool") return `<select id="${id}" data-spec="${F.p}" data-kind="bool"><option value="false" ${!v ? "selected" : ""}>No</option><option value="true" ${v ? "selected" : ""}>Yes</option></select>`;
  if (F.type === "range") return `<input id="${id}" data-spec="${F.p}" data-kind="range" type="text" inputmode="decimal" value="${esc(Array.isArray(v) ? v.join("–") : "")}" placeholder="${esc(F.ph)}">`;
  if (F.type === "select") return `<select id="${id}" data-spec="${F.p}" data-kind="${F.p === "equipment.clientSupplied" ? "tri" : "text"}">${F.opts.map(([k, l]) => `<option value="${k}" ${String(v ?? "") === k ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
  return `<input id="${id}" data-spec="${F.p}" data-kind="${F.type}" type="${F.type}" value="${esc(v ?? "")}" ${F.ph ? `placeholder="${esc(typeof F.ph === "function" ? F.ph(S.spec) : F.ph)}"` : ""} ${F.type === "number" ? `min="${F.min}" max="${F.max}" step="${F.step}"` : ""}>`;
}
function renderSpec(){
  const sp = S.spec; if (!sp) return;
  syncRateCard();
  const fm = sp.sites.reduce((a, s) => (a[s.format] = (a[s.format] || 0) + 1, a), {});
  const gaps = qs().filter(q => q.critical && !S.answers[q.id]);
  const cellHtml = F => { const src = specCellSrc(sp, F), c = F.cite(sp), id = "sp-" + F.p.replace(/\./g, "-");
    return `<div class="${src === "gap" ? "gap" : ""}" data-cell="${F.p}" data-guide="field:${F.p}"><dt><label for="${id}">${F.l}</label> ${stamp(src)}</dt><dd>${specInput(sp, F)}${c ? `<span class="xs muted src" title="“${esc(c.text)}”">${esc(c.doc)}${loc(c).replace(/^, /, " ")}</span>` : F.hint ? `<span class="xs muted src" data-hint="${F.p}">${esc(F.hint())}</span>` : ""}</dd></div>`; };
  const ro = (label, value, src, c, key) => `<div class="${src === "gap" ? "gap" : ""}" data-guide="field:${key}"><dt>${label} ${stamp(src)}</dt><dd>${value}${c ? `<span class="xs muted src" title="“${esc(c.text)}”">${esc(c.doc)}${loc(c).replace(/^, /, " ")}</span>` : ""}</dd></div>`;
  const hasCH = sp.sites.some(s => s.clientHours != null);
  $("#s-spec").innerHTML = `
    <header><div><h2 id="h-spec">What the documents say</h2><p class="muted">This is the survey sheet. Check each fact against its source and fill in anything stamped <span class="stamp gap">GAP</span>. Your entries are stamped <span class="stamp ans">ANS</span> and drive the questions and the price.</p></div>
      <div class="actions"><button class="btn primary" type="button" data-go="questions">${gaps.length ? `Answer ${gaps.length} open question${gaps.length === 1 ? "" : "s"}` : "Review answers"}</button></div></header>
    ${sp.notes && sp.notes.length ? `<ul class="flags" style="margin-bottom:1rem" data-guide="el:notes">${sp.notes.map(n => `<li><span class="lvl info">READ</span><span>${termify(esc(n))}</span></li>`).join("")}</ul>` : ""}
    <dl class="mosaic form" style="margin:0">
      ${SPEC_FIELDS.map(cellHtml).join("")}
      ${ro("Sites", sp.sites.length ? `${sp.sites.length.toLocaleString("en-GB")} <button class="btn ghost xs" type="button" data-go="sites">view</button>` : `None yet <button class="btn ghost xs" type="button" data-go="sites">add sites</button>`, sp.sites.length ? "doc" : "gap", sp.sitesCite, "sites")}
      ${ro("Formats", Object.entries(fm).map(([k, v]) => `${k} ${v}`).join(" · ") || "–", sp.sites.length ? "doc" : "gap", sp.sitesCite, "formats")}
      ${ro("Client hours", hasCH ? `Given for ${sp.sites.filter(s => s.clientHours != null).length} of ${sp.sites.length}` : "Not given", hasCH ? "doc" : "gap", hasCH ? sp.sitesCite : null, "clientHours")}
    </dl>
    <div data-guide="el:excerpts"><h3>Source excerpts</h3>
    ${[sp.client.cite, sp.term.cite, sp.term.extCite, sp.term.startCite, sp.sitesCite, sp.service.minHoursCite, sp.service.tradeCite, sp.service.auditCite, sp.commercial.payCite, sp.commercial.credCite, sp.lwCite, sp.equipment.eqCite, sp.commercial.idxCite, sp.commercial.rebCite, sp.equipment.cobotCite, sp.commercial.tupeCite, sp.commercial.tupeAppliesCite, sp.commercial.rcCite, sp.client.hintCite]
        .filter((c, i, a) => c && a.findIndex(x => x && x.text === c.text) === i).map(cite).join("") || '<p class="small muted">No excerpts yet. In Cowork, the Spec Extractor returns a citation for every fact.</p>'}</div>`;
}
function specChanged(t){
  const p = t.dataset.spec, k = t.dataset.kind; let v = t.value;
  if (k === "number") v = t.value === "" ? null : Number(t.value);
  else if (k === "bool") v = t.value === "true";
  else if (k === "tri") v = t.value === "" ? null : t.value === "true";
  else if (k === "text") v = t.value.trim() || null;
  else if (k === "range"){ const r = parseRange(t.value.trim()); if (r.error){ t.setAttribute("aria-invalid", "true"); toast(`Hours in trading time ${r.error}.`); return; } v = r.value; }
  if (k === "number" && v != null && (!Number.isFinite(v) || v < +t.min || v > +t.max)){ t.setAttribute("aria-invalid", "true"); toast(`Enter a number from ${t.min} to ${t.max}.`); return; }
  t.removeAttribute("aria-invalid");
  setSpecField(p, v);
  const cell = t.closest("[data-cell]"); if (cell){ cell.classList.remove("gap"); const st = cell.querySelector(".stamp"); if (st) st.outerHTML = stamp("ans"); }
  syncRateCard(); const h = document.querySelector('[data-hint="term.start"]'); if (h) h.textContent = `${RATECARD.label} · ${RATECARD.why}`;
  renderRail(); renderTrace(); $("#oppName").textContent = clientLabel(); $("#oppMeta").textContent = `${S.spec.sites.length.toLocaleString("en-GB")} sites · ${S.spec.term.years}-yr term`;
}
/* ---------- Step 3: Guided questions ---------- */
function renderQuestions(){
  const list = qs(); if (!list.length) return;
  S.qi = Math.min(S.qi, list.length - 1);
  const q = list[S.qi], a = S.answers[q.id], cur = a ? a.value : q.def;
  const status = x => S.answers[x.id] ? "a" : x.critical ? "" : "d";
  const answered = list.filter(x => S.answers[x.id]).length;
  const input = q.type === "choice"
    ? `<fieldset class="opts" style="border:0;padding:0;margin:.6rem 0"><legend class="sr">${esc(q.text)}</legend>${q.options.map(o => `<label><input type="radio" name="qv" value="${esc(o.v)}" ${String(cur) === String(o.v) ? "checked" : ""}><span>${esc(o.l)}${String(o.v) === String(q.def) ? ` <span class="xs muted">suggested</span> ${stamp(q.defSrc)}` : ""}</span></label>`).join("")}</fieldset>`
    : `<label class="f" style="max-width:260px;margin:.6rem 0">Value (${esc(q.unit)})<input type="number" id="qv" value="${esc(cur)}" min="${q.min}" max="${q.max}" step="${q.step}" aria-describedby="qerr qsug"><span class="hint" id="qsug">Suggested ${esc(q.def)} ${esc(q.unit)} ${stamp(q.defSrc)} · range ${q.min}–${q.max}</span><span class="err" id="qerr" aria-live="polite"></span></label>`;
  $("#s-questions").innerHTML = `
    <header><div><h2 id="h-questions">Answer what the documents didn't</h2><p class="muted">${answered} of ${list.length} answered. Critical questions come first, then the rest in order of price impact. Anything you don't answer uses the suggested value, stamped with its source.</p></div>
      <div class="actions"><button class="btn" type="button" id="acceptAll" data-guide="el:acceptAll">Accept suggestions for non-critical</button></div></header>
    <div class="iv">
      <div class="qcard" data-guide="q:${q.id}">
        <div class="qmeta"><span>${esc(q.group)}</span><span aria-hidden="true">·</span><span>Question ${S.qi + 1} of ${list.length}</span>${q.critical ? '<span class="stamp gap">CRITICAL</span>' : ""}${a ? stamp(a.source) : ""}</div>
        <p class="qtext" id="qtext">${esc(q.text)}</p>
        ${input}
        <div class="why"><b>Why this suggestion:</b> ${termify(esc(q.why))}</div>
        ${q.cite ? cite(q.cite) : ""}
        <div class="actions" style="margin-top:1rem">
          <button class="btn primary" type="button" id="qSave">Save answer and next</button>
          <button class="btn" type="button" id="qAccept">Use suggested value</button>
          <button class="btn ghost" type="button" id="qPrev" ${S.qi === 0 ? "disabled" : ""}>Previous</button>
        </div>
        ${feedbackBox(q)}
      </div>
      <div data-guide="el:qlist"><h3 style="margin-top:0">All questions</h3><ol class="qlist">${list.map((x, i) => `<li><button type="button" data-q="${i}" ${i === S.qi ? 'aria-current="true"' : ""}><span class="dot ${status(x)}" aria-hidden="true"></span><span>${esc(x.text)}<span class="sr"> (${S.answers[x.id] ? "answered" : x.critical ? "critical, open" : "using suggestion"})</span></span></button></li>`).join("")}</ol>
        ${openReds() === 0 ? `<button class="btn primary" type="button" data-go="sites" style="margin-top:.8rem">Continue to sites &amp; hours</button>` : `<p class="small redcount" style="margin-top:.6rem">${openReds()} critical still open</p>`}</div>
    </div>`;
}
// Pilot feedback: one verdict per question, with an optional note. It is saved with the opportunity and goes into the payload.
function feedbackBox(q){
  const fb = (S.feedback || []).find(x => x.q === q.id);
  return `<div class="fb" role="group" aria-label="Feedback on this question" data-guide="el:qfeedback"><span class="xs muted" id="fbLbl">Was this question clear?</span>
    <button class="btn" type="button" data-fb="yes" aria-pressed="${!!fb && fb.clear}" aria-describedby="fbLbl">Yes</button><button class="btn" type="button" data-fb="no" aria-pressed="${!!fb && !fb.clear}" aria-describedby="fbLbl">No</button>
    ${fb && !fb.clear ? `<label class="f"><span class="xs">What was unclear? (optional)</span><input type="text" id="fbNote" maxlength="300" value="${esc(fb.note || "")}"></label>` : fb ? '<span class="xs muted">Thanks, noted.</span>' : ""}</div>`;
}
function setFeedback(qid, patch){
  S.feedback = S.feedback || [];
  let fb = S.feedback.find(x => x.q === qid);
  if (!fb){ fb = {q:qid}; S.feedback.push(fb); }
  Object.assign(fb, patch, {at:new Date().toISOString(), by:(S.user && S.user.name) || "standalone user", engine:ENGINE_VERSION});
  if (fb.clear) delete fb.note;
  logEvent("feedback", {q:qid, clear:fb.clear, note:fb.note || null});
}
function saveAnswer(useDefault){
  const list = qs(), q = list[S.qi];
  let v;
  if (useDefault) v = q.def;
  else if (q.type === "choice"){ const c = document.querySelector('input[name="qv"]:checked'); v = c ? c.value : q.def; }
  else {
    const el = $("#qv"), n = Number(el.value);
    if (el.value === "" || !Number.isFinite(n) || n < q.min || n > q.max){ el.setAttribute("aria-invalid", "true"); $("#qerr").textContent = `Enter a number from ${q.min} to ${q.max}.`; el.focus(); return; }
    v = n;
  }
  recordAnswer(q, v, useDefault);
  const next = list.findIndex((x, i) => i > S.qi && !S.answers[x.id]);
  S.qi = next >= 0 ? next : Math.min(S.qi + 1, list.length - 1);
  render(); const t = $("#qtext"); if (t){ t.setAttribute("tabindex", "-1"); t.focus(); }
}

/* ---------- Step 4: Sites & hours ---------- */
function renderSites(){
  const sp = S.spec, R = compute(), m = val("hoursMethod"), cx = sp.sites.length ? hoursContext() : null;
  const pageSize = 60; S.sitePage = S.sitePage || 0; const filt = (S.siteFilter || "").toLowerCase();
  const rows = R ? R.rows.filter(r => !filt || (r.s.name + r.s.region + r.s.format + r.s.id).toLowerCase().includes(filt)) : [];
  const pages = Math.max(1, Math.ceil(rows.length / pageSize)); S.sitePage = Math.min(S.sitePage, pages - 1);
  const shown = rows.slice(S.sitePage * pageSize, (S.sitePage + 1) * pageSize);
  const flat = S.overrides.flat || FLAT, hasCH = sp.sites.some(s => s.clientHours != null), hasSq = sp.sites.some(s => s.sqft);
  const bySrc = R ? R.rows.reduce((a, r) => (a[r.src] = (a[r.src] || 0) + 1, a), {}) : {};
  const dups = new Set(dupIds());
  const methodQ = qs().find(x => x.id === "hoursMethod"), methodOpen = methodQ && !S.answers.hoursMethod;
  $("#s-sites").innerHTML = `
    <header><div><h2 id="h-sites">Sites and weekly hours</h2><p class="muted">Hours drive about 80% of the price. Edit any site's hours to override it (stamped ANS). Overrides are kept when you switch method.</p></div>
      ${sp.sites.length ? `<div class="actions" data-guide="el:method"><span class="small">Method ${methodOpen ? '<span class="stamp gap">CONFIRM</span>' : stamp(srcOf("hoursMethod"))}</span><div class="seg" role="group" aria-label="Hours method">
        ${[["client", "Client hours"], ["productivity", "Size curve"], ["flat", "Flat by format"]].map(([k, l]) => `<button type="button" data-method="${k}" aria-pressed="${m === k && !methodOpen}" ${(k === "client" && !hasCH) || (k === "productivity" && !hasSq) ? `disabled title="${k === "client" ? "No client hours in the site list" : "No floor areas in the site list"}"` : ""}>${l}${m === k && methodOpen ? " · suggested" : ""}</button>`).join("")}
      </div></div>` : ""}</header>
    ${methodOpen ? `<p class="small redcount" style="margin:0 0 .8rem">Confirm the hours method: ${esc(methodQ.text)} The suggestion is shown; click a method to confirm it.</p>` : ""}
    ${R ? `<p class="small muted" style="margin:0 0 .8rem">${[["doc", "client hours"], ["est", "filled at the client's density"], ["bm", "size curve"], ["ans", "your figures"], ["def", "flat defaults"]].filter(([k]) => bySrc[k]).map(([k, l]) => `${stamp(k)} ${bySrc[k]} ${l}`).join(" · ")}</p>` : ""}
    ${m === "productivity" || (m === "client" && bySrc.bm) ? `<div class="levers" style="margin-bottom:1rem">
      <div class="lever" data-guide="el:intensity"><label for="c-int">Service intensity × size curve ${stamp(cx.curveSrc)}</label><input type="number" id="c-int" data-curve="intensity" value="${cx.intensity}" min="0.3" max="3" step="0.05"></div>
      <div class="lever" data-guide="el:officeRate"><label for="c-off">Offices: sq ft per hour ${stamp(S.overrides.curve && S.overrides.curve.office ? "ans" : "bm")}</label><input type="number" id="c-off" data-curve="office" value="${cx.office}" min="100" max="3000" step="25"></div>
      <p class="xs muted" style="grid-column:1/-1;margin:.3rem 0 0">Stores: hours = ${CURVE.a} × sq ft<sup>${CURVE.b}</sup> × intensity. About ${Math.round(5000 / (CURVE.a * Math.pow(5000, CURVE.b)))} sq ft/hr at 5,000 sq ft, ${Math.round(50000 / (CURVE.a * Math.pow(50000, CURVE.b)))} at 50,000, before intensity.</p></div>` : ""}
    ${m === "flat" ? `<div class="levers" style="margin-bottom:1rem" data-guide="el:flat">${Object.keys(flat).map(k => `<div class="lever"><label for="f-${k}">${k}: hrs/wk ${stamp(S.overrides.flat ? "ans" : "def")}</label><input type="number" id="f-${k}" data-flat="${k}" value="${flat[k]}" min="0" max="400" step="0.5"></div>`).join("")}</div>` : ""}
    ${S.importReport ? `<p class="small" id="importReport" style="border-left:2px solid var(--doc);padding-left:.6rem">${reportText(S.importReport)}${S.importReport.bad.length ? `<br><span class="err">${plural(S.importReport.bad.length, "line")} not loaded: ${S.importReport.bad.slice(0, 8).map(b => `line ${b.line} (${esc(b.reason)})`).join("; ")}${S.importReport.bad.length > 8 ? "…" : ""}. Fix them in the source and load again, or add those sites by hand.</span>` : ""}</p>` : ""}
    ${sp.sites.length ? `<div class="actions" style="margin-bottom:.6rem">
      <label class="f" style="grid-auto-flow:column;align-items:center;gap:.5rem" data-guide="el:filter">Filter <input type="text" id="siteFilter" value="${esc(S.siteFilter || "")}" placeholder="Town, region, format or ID" style="width:220px"></label>
      <span class="small muted">${rows.length.toLocaleString("en-GB")} sites · page ${S.sitePage + 1} of ${pages}</span>
      <button class="btn" type="button" id="pgPrev" ${S.sitePage === 0 ? "disabled" : ""}>Previous page</button>
      <button class="btn" type="button" id="pgNext" ${S.sitePage >= pages - 1 ? "disabled" : ""}>Next page</button>
      <button class="btn ghost" type="button" data-map="" data-guide="el:sitesMap">Open the estate map</button>
    </div>
    <div class="scroll" data-guide="el:siteTable"><table class="tbl sites"><thead><tr><th>ID</th><th>Site</th><th class="opt opt2">Region</th><th>Format</th><th class="num opt">Sq ft</th><th class="num opt">Client hrs</th><th class="num" style="width:104px">Hours / wk</th><th>Src</th><th class="num">Heads</th><th class="num opt opt2">£/hr</th><th class="num">Charge / wk</th></tr></thead>
      <tbody>${shown.map(r => `<tr><td class="xs">${esc(r.s.id)}${dups.has(r.s.id) ? ' <span class="stamp gap" title="This ID appears more than once">DUP</span>' : ""}</td><td>${esc(r.s.name)}${r.s.grade ? ` <span class="xs muted">Grade ${r.s.grade}</span>` : ""}${r.cobot ? ' <span class="xs muted">cobot</span>' : ""}</td><td class="opt opt2">${esc(r.s.region || "–")}</td><td>${esc(r.s.format)}${r.s.formatInferred ? ' <span class="xs muted" title="Inferred from floor area">inferred</span>' : ""}</td>
        <td class="num opt">${r.s.sqft ? r.s.sqft.toLocaleString("en-GB") : "–"}</td><td class="num opt">${r.s.clientHours ?? "–"}</td>
        <td class="num"><input type="number" aria-label="Hours for ${esc(r.s.name)}" data-site="${esc(r.s.uid)}" value="${r.h}" min="0" max="2000" step="0.5"></td>
        <td>${stamp(r.src)}${r.lifted ? ' <span class="xs" title="Raised to spec minimum">min</span>' : ""}</td><td class="num">${r.hc}</td><td class="num opt opt2">${r.rate.toFixed(2)}</td><td class="num">${gbp(r.charge)}</td></tr>`).join("")}</tbody>
      <tfoot><tr><td colspan="2">All ${sp.sites.length.toLocaleString("en-GB")} sites</td><td class="opt opt2"></td><td></td><td class="opt"></td><td class="opt"></td><td class="num">${Math.round(R.T.hours).toLocaleString("en-GB")}</td><td></td><td class="num">${R.T.hc.toLocaleString("en-GB")}</td><td class="num opt opt2">${R.T.avgPay.toFixed(2)}</td><td class="num">${gbp(R.T.charge)}</td></tr></tfoot></table></div>`
    : `<p class="muted">No site list yet. Upload the client's site schedule (XLSX, CSV or TSV) or paste the rows below.</p>`}
    <div class="actions" style="margin-top:1rem" data-guide="el:siteUpload"><label class="btn" for="siteFile">Upload site list (XLSX, CSV, TSV)</label><input type="file" id="siteFile" accept=".xlsx,.csv,.tsv,.txt" class="sr"></div>
    <details style="margin-top:.8rem" data-guide="el:sitePaste" ${sp.sites.length ? "" : "open"}><summary class="small" style="cursor:pointer">Paste or replace the site list</summary>
      <label class="f" style="margin-top:.5rem">Site rows<textarea id="csvIn" rows="5" placeholder="Site name, Region, Format, Sq ft, Weekly hours, Site ID&#10;Leeds Kirkstall, Yorkshire, Medium, 18000, 16, LDS01"></textarea><span class="hint">Paste straight from Excel (tab-separated) or CSV. Columns are matched by their headings (name, region, format or store type, sq ft or sq m, weekly hours, ID); without headings the order above is used. Format accepts Small, Medium, Large, Office and common names such as Superstore, Supermarket, Express or Kiosk. Total and blank rows are skipped. Good rows load even when some lines need fixing.</span><span class="err" id="csvErr" aria-live="polite"></span></label>
      <button class="btn" type="button" id="csvLoad" style="margin-top:.5rem">Load site rows</button></details>
    <div class="actions" style="margin-top:1rem"><button class="btn primary" type="button" data-go="price" ${sp.sites.length ? "" : "disabled"}>Continue to price build</button></div>`;
}
/* ---------- Step 5: Price build (trim → launch → trace) ---------- */
function mgmtTable(R){
  const T = R.T, roles = T.margin.roles, custom = !!S.overrides.mgmt;
  return `<h3>Management structure ${stamp(custom ? "ans" : "bm")}</h3>
    <p class="small muted" style="margin-top:0">${custom ? "Your roles." : `Suggested from ${Math.round(T.hours).toLocaleString("en-GB")} hours and ${R.rows.length} sites at ${num(val("mgmtRatio")).toLocaleString("en-GB")} hours per area manager. Edit any cell to take ownership.`} Cost = FTE × salary × (1 + on-cost) ÷ ${RATECARD.weeksPerYear} weeks, spread across sites by hours.</p>
    <div class="scroll" style="max-height:none"><table class="tbl mgmt" style="max-width:720px"><thead><tr><th>Role</th><th class="num" style="width:90px">FTE</th><th class="num" style="width:120px">Salary £</th><th class="num">£ / wk</th><th><span class="sr">Remove</span></th></tr></thead>
      <tbody>${roles.map((r, i) => `<tr><td><input type="text" aria-label="Role ${i + 1}" data-mgmt="${i}.role" value="${esc(r.role)}"></td>
        <td class="num"><input type="number" aria-label="${esc(r.role)} FTE" data-mgmt="${i}.fte" value="${r.fte}" min="0" max="200" step="0.1"></td>
        <td class="num"><input type="number" aria-label="${esc(r.role)} salary" data-mgmt="${i}.salary" value="${r.salary}" min="0" max="500000" step="500"></td>
        <td class="num">${gbp(num(r.fte) * num(r.salary) * (1 + T.margin.onCost / 100) / RATECARD.weeksPerYear)}</td>
        <td><button class="btn ghost" type="button" data-mgdel="${i}" aria-label="Remove ${esc(r.role)}">Remove</button></td></tr>`).join("")}</tbody>
      <tfoot><tr><td>${T.margin.mgmtFte.toFixed(1)} FTE${T.hoursPerAM ? ` · ${Math.round(T.hoursPerAM).toLocaleString("en-GB")} hrs per area manager` : ""}</td><td></td><td class="num"><label class="xs" for="mgOn">On-cost %</label> <input type="number" id="mgOn" value="${T.margin.onCost}" min="0" max="120" step="0.5" style="width:70px"> ${stamp(S.overrides.mgmtOnCost != null ? "ans" : "bm")}</td><td class="num">${gbp(T.mgmt)}</td><td></td></tr></tfoot></table></div>
    <div class="actions" style="margin-top:.5rem"><button class="btn" type="button" id="mgAdd">Add role</button>${custom ? '<button class="btn ghost" type="button" id="mgReset">Back to suggested</button>' : ""}</div>`;
}
function renderPrice(){
  const R = compute(); if (!R) { $("#s-price").innerHTML = `<header><div><h2 id="h-price">Price build</h2><p class="muted">Add sites first.</p></div></header>`; return; }
  const T = R.T, F = flags(R), base = S.runs[0];
  const lines = [["Wages", T.wages], ["Holiday, SSP, pension, training, levy, NI", T.labour - T.wages - R.rows.reduce((a, r) => a + r.creditAllow, 0)], ["Delivery-risk allowance", R.rows.reduce((a, r) => a + r.creditAllow, 0)],
    ["Materials", T.materials], ["Uniforms", T.uniforms], ["T&A and audit", T.other], ["Machinery" + (T.capex ? " incl. cobots" : "") + ` (£${T.machRate.toFixed(2)}/hr)`, T.machinery], [`Management (${T.margin.mgmtFte.toFixed(1)} FTE)`, T.mgmt], ["Rebate recovery", T.rebate],
    ["Direct and management cost", T.direct + T.mgmt, true], [`Public liability ${T.margin.pl}%`, T.pl], [`Factoring / working capital ${T.margin.fact}%`, T.fact], [`Overheads ${T.margin.oh}%`, T.oh], [`Profit ${T.margin.prof}%`, T.profit], ["Weekly charge", T.charge, true]];
  $("#s-price").innerHTML = `
    <header><div><h2 id="h-price">Adjust, run and compare</h2><p class="muted">Adjust the levers and the trace updates live. <b>Launch run</b> saves a snapshot so you can compare scenarios, such as a compliant bid and an alternative.</p></div>
      <div class="actions" data-guide="el:launch"><label class="f" style="grid-auto-flow:column;align-items:center;gap:.4rem">Run name<input type="text" id="runName" value="Run ${S.runs.length + 1}" style="width:150px"></label><button class="btn primary" type="button" id="launch">Launch run</button></div></header>
    <div class="levers" data-guide="el:levers">${LEVERS.map((L, i) => { if (L.when && !L.when()) return ""; const v = leverVal(L); return `<div class="lever" data-guide="lever:${L.id || L.oc || L.ov}"><label for="lv${i}">${L.l} <span class="xs muted">${L.u}</span> ${stamp(leverSrc(L))}</label>
      <input type="number" id="lv${i}n" data-lever="${i}" value="${v}" min="${L.min}" max="${L.max}" step="${L.step}" aria-label="${L.l} (${L.u})">
      <input type="range" id="lv${i}" data-lever="${i}" value="${v}" min="${L.min}" max="${L.max}" step="${L.step}" aria-label="${L.l} slider"></div>`; }).join("")}</div>
    <div data-guide="el:buildup"><h3>Weekly build-up, all sites</h3>
    <table class="tbl" style="max-width:640px"><tbody>${lines.filter(l => l[1] || l[2]).map(l => `<tr ${l[2] ? 'style="font-weight:600;border-top:1px solid var(--ink)"' : ""}><td>${l[0]}</td><td class="num">${gbp(l[1])}</td><td class="num xs muted">${(l[1] / T.charge * 100).toFixed(1)}%</td></tr>`).join("")}</tbody></table>
    <p class="xs muted">Formula: charge = (direct + management) ÷ (1 − PL − factoring − overheads − profit) = ÷ ${T.margin.den.toFixed(4)}. Annualised at ${RATECARD.weeksPerYear} weeks. ${esc(RATECARD.label)}.</p></div>
    <div data-guide="el:mgmt">${mgmtTable(R)}</div>
    <div data-guide="el:runs"><h3>Runs</h3>
    ${S.runs.length ? `<div class="runs scroll" style="max-height:none"><table class="tbl"><thead><tr><th>Run</th><th class="num">Hours/wk</th><th class="num">Weekly</th><th class="num">Annual</th><th class="num">£/labour hr</th><th class="num">Labour %</th><th class="num">Profit %</th><th class="num">vs ${esc(base.name)}</th><th><span class="sr">Actions</span></th></tr></thead><tbody>
      ${S.runs.map((r, i) => { const d = (r.annual - base.annual) / base.annual * 100; return `<tr><td>${esc(r.name)}</td><td class="num">${Math.round(r.hours).toLocaleString("en-GB")}</td><td class="num">${gbp(r.charge)}</td><td class="num">${gbpK(r.annual)}</td><td class="num">${gbp(r.revPerHr, 2)}</td><td class="num">${r.labourPct.toFixed(1)}%</td><td class="num">${r.profit}%</td><td class="num ${d > 0.05 ? "delta-up" : d < -0.05 ? "delta-down" : ""}">${i ? (d > 0 ? "+" : "") + d.toFixed(1) + "%" : "base"}</td><td><button class="btn ghost" type="button" data-restore="${i}">Restore</button></td></tr>`; }).join("")}</tbody></table></div>`
    : `<p class="small muted">No runs yet. Launch one to save the current levers as your base case. Later runs show the change against it.</p>`}</div>
    <div data-guide="el:checks"><h3>Checks</h3>
    <ul class="flags">${F.map(x => `<li><span class="lvl ${x.lvl}">${x.lvl.toUpperCase()}</span><span>${termify(esc(x.t))}${x.go ? ` <button class="btn ghost" type="button" data-go="${x.go}">Review</button>` : ""}</span></li>`).join("")}</ul></div>
    <div class="actions" style="margin-top:1rem"><button class="btn primary" type="button" data-go="board">Continue to board summary</button></div>`;
}
function snapshot(name){
  const R = compute(), T = R.T;
  return {name: name || `Run ${S.runs.length + 1}`, at:new Date().toISOString(), hours:T.hours, charge:T.charge, annual:T.annual, revPerHr:T.revPerHr, labourPct:T.labourPct, profit:T.margin.prof,
    state: JSON.parse(JSON.stringify({answers:S.answers, overrides:S.overrides}))};
}

/* ---------- Step 6: Board summary ---------- */
function renderBoard(){
  const R = compute(); if (!R) return; const T = R.T, internal = S.view === "internal";
  const iw = S.internal.wageMult, iu = S.internal.uniformsPct / 100;
  const cost = internal ? {Labour:T.labour * iw, Materials:T.materials, Uniforms:T.uniforms * iu, "Machinery & other":T.machinery + T.other, Management:T.mgmt + T.rebate, "PL & factoring":T.pl + T.fact, Overheads:T.oh}
                        : {Labour:T.labour, Materials:T.materials, Uniforms:T.uniforms, "Machinery & other":T.machinery + T.other, Management:T.mgmt + T.rebate, "PL & factoring":T.pl + T.fact, Overheads:T.oh};
  const totalCost = Object.values(cost).reduce((a, b) => a + b, 0), contrib = T.charge - totalCost, A = RATECARD.weeksPerYear;
  const bar = (label, v, lo, hi, max, fmt) => `<div class="bar"><span>${label}</span><span class="track" role="img" aria-label="${label} ${fmt(v)}, past bids ${fmt(lo)} to ${fmt(hi)}"><span class="band" style="left:${lo / max * 100}%;width:${(hi - lo) / max * 100}%"></span><span class="fill" style="width:${Math.min(100, v / max * 100)}%;height:4px;top:3px"></span></span><b class="num">${fmt(v)}</b></div>`;
  $("#s-board").innerHTML = `
    <header><div><h2 id="h-board">Board summary</h2><p class="muted">This follows the template's Board Summary layout. The client view is what the client would see if costs are shared. The internal view applies expected actuals, set below.</p></div>
      <div class="seg viewtog" role="group" aria-label="View" data-guide="el:viewToggle"><button type="button" data-view="client" aria-pressed="${!internal}">Client view</button><button type="button" data-view="internal" aria-pressed="${internal}">Internal view</button></div></header>
    <div class="board"><div>
      <table class="tbl" data-guide="el:boardTable"><thead><tr><th>${esc(clientLabel())}</th><th class="num">Weekly</th><th class="num">Annual</th><th class="num">%</th></tr></thead><tbody>
        <tr style="font-weight:600"><td>Revenue</td><td class="num">${gbp(T.charge)}</td><td class="num">${gbp(T.annual)}</td><td class="num">100.0%</td></tr>
        ${Object.entries(cost).map(([k, v]) => `<tr><td>${k}</td><td class="num">${gbp(v)}</td><td class="num">${gbp(v * A)}</td><td class="num">${(v / T.charge * 100).toFixed(1)}%</td></tr>`).join("")}</tbody>
        <tfoot><tr><td>Contribution</td><td class="num">${gbp(contrib)}</td><td class="num">${gbp(contrib * A)}</td><td class="num">${(contrib / T.charge * 100).toFixed(1)}%</td></tr></tfoot></table>
      <dl class="mosaic" style="margin-top:1rem">
        <div><dt>Contract value (${S.spec.term.years} yrs${num(S.spec.term.ext) ? ` + ${S.spec.term.ext} ext` : ""})</dt><dd>${gbpK(T.contract)}${num(S.spec.term.ext) ? ` <span class="xs muted">${gbpK(T.contractExt)} with extension</span>` : ""}</dd></div><div><dt>Sites</dt><dd>${S.spec.sites.length.toLocaleString("en-GB")}</dd></div>
        <div><dt>Hours / wk</dt><dd>${Math.round(T.hours).toLocaleString("en-GB")}</dd></div><div><dt>Headcount</dt><dd>${T.hc.toLocaleString("en-GB")}</dd></div>
        <div><dt>Capex</dt><dd>${gbpK(T.capex)}</dd></div><div><dt>Average pay</dt><dd>${gbp(T.avgPay, 2)}/hr</dd></div></dl>
      ${internal ? `<div data-guide="el:internal"><h3>Internal view assumptions</h3><div class="levers"><div class="lever"><label for="iw">Wage actuals vs priced (×)</label><input type="number" id="iw" value="${iw}" min="0.9" max="1" step="0.005"></div><div class="lever"><label for="iu">Uniform spend vs priced (%)</label><input type="number" id="iu" value="${S.internal.uniformsPct}" min="0" max="100" step="5"></div></div><p class="xs muted">Past models hard-coded these values at ×0.97–0.995 and 33–50%. Here they are explicit, and they go to the assumptions log.</p></div>` : ""}
    </div><div data-guide="el:boardBars">
      <h3 style="margin-top:0">Against past bids (as priced)</h3><p class="xs muted">Dashed band: the range across the Inditex, Asda, Currys and Primark models. Bars use priced values, so they match the trace in both views.</p>
      <div class="bars">
        ${bar("Revenue / labour hr", T.revPerHr, BENCH.revPerHr.lo, BENCH.revPerHr.hi, 26, v => gbp(v, 2))}
        ${bar("Labour % revenue", T.labourPct, BENCH.labourPct.lo, BENCH.labourPct.hi, 100, v => v.toFixed(1) + "%")}
        ${bar("Average pay £/hr", T.avgPay, BENCH.payRate.lo, BENCH.payRate.hi, 16, v => gbp(v, 2))}
        ${bar("Client contribution", T.contrib, BENCH.contrib.lo, BENCH.contrib.hi, 12, v => v.toFixed(1) + "%")}
      </div>
      <h3>Checks</h3><ul class="flags" data-guide="el:checks">${flags(R).filter(x => x.lvl !== "pass").map(x => `<li><span class="lvl ${x.lvl}">${x.lvl.toUpperCase()}</span><span>${termify(esc(x.t))}</span></li>`).join("") || '<li><span class="lvl pass">PASS</span><span>No warnings.</span></li>'}</ul>
    </div></div>
    <div class="actions" style="margin-top:1rem"><button class="btn primary" type="button" data-go="insights">See what the model tells us</button><button class="btn ghost" type="button" data-go="generate">Skip to generate model</button></div>`;
}
/* ---------- Step 7: What the model tells us (one price, read at five scales) ---------- */
const PART_C = {labour:"#1c1e21", materials:"#6a6c70", kit:"#9a9aa0", mgmt:"#1f5a9e", plf:"#7c5300", oh:"#b69a5a", profit:"#2c6a39"};
const ZOOM = [["pound", "£1", "Every £1 the client pays"], ["hour", "One hour", "One billed hour"], ["site", "One site", "One site's week"], ["estate", "The estate", "Every site, every week"], ["contract", "The contract", "The whole contract"]];
const SRC_NAME = {doc:"Client's hours", ans:"Your figures", est:"Filled at the client's density", bm:"Size curve from past bids", def:"Flat default"};
let INS = null, insIO = null, insRO = null;
const fmtN = v => Math.round(v).toLocaleString("en-GB");
const signK = v => (v > 0.5 ? "+" : "") + (Math.abs(v) < 0.5 ? "£0" : MONEY(v));
function niceStep(max, want = 5){ const raw = max / want, p = Math.pow(10, Math.floor(Math.log10(raw || 1))); return [1, 2, 2.5, 5, 10].map(m => m * p).find(s => s >= raw) || p * 10; }
function shape(src, x, y, r = 3.2){
  x = +x; y = +y;
  const c = {doc:"var(--doc)", est:"var(--doc)", ans:"var(--ans)", bm:"var(--bm)", def:"var(--def)"}[src] || "var(--def)";
  if (src === "doc") return `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`;
  if (src === "est") return `<circle cx="${x}" cy="${y}" r="${r}" fill="var(--sheet)" stroke="${c}" stroke-width="1.3"/>`;
  if (src === "ans") return `<rect x="${x - r}" y="${y - r}" width="${r * 2}" height="${r * 2}" fill="${c}"/>`;
  if (src === "bm") return `<path d="M${x} ${y - r - .8}L${x + r + .8} ${y}L${x} ${y + r + .8}L${x - r - .8} ${y}Z" fill="var(--sheet)" stroke="${c}" stroke-width="1.3"/>`;
  return `<path d="M${x - r} ${y - r}L${x + r} ${y + r}M${x + r} ${y - r}L${x - r} ${y + r}" stroke="${c}" stroke-width="1.4"/>`;
}
const shapeKey = src => `<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">${shape(src, 6, 6, 3.6)}</svg>`;
function insSite(){
  const I = INS.I, sel = S.insSite ?? "typical";
  return typeof sel === "number" ? I.site.points.find(p => p.i === sel) || I.site.pick.typical : I.site.pick[sel] || I.site.pick.typical;
}
function renderInsSite(){
  const box = $("#insSiteCard"); if (!box || !INS) return;
  const {I, R} = INS, p = insSite(); if (!p){ box.innerHTML = '<p class="small muted">No site has any hours yet.</p>'; return; }
  const r = R.rows[p.i], m = R.T.margin, W = RATECARD.weeksPerYear;
  const parts = [["labour w", "Cleaners' pay", r.wages], ["labour on", "NI, holiday, pension and levy", r.labour + r.creditAllow - r.wages], ["materials", "Materials", r.materials], ["kit", "Kit & other", r.machinery + r.uniforms + r.other], ["mgmt", "Management", r.mgmt],
    ["plf", "PL & factoring", r.charge * (m.pl + m.fact) / 100], ["oh", "Overheads", r.charge * m.oh / 100], ["profit", "Profit", r.charge * m.prof / 100]];
  const rank = [...I.site.points].sort((a, b) => b.charge - a.charge || a.i - b.i).findIndex(x => x.i === p.i) + 1;
  const vsAvg = (p.perHr / I.perHour.rev - 1) * 100;
  const pb = BENCH.wagePer1k, sb = BENCH.sqftPerHr, band = (v, b, f) => v == null || !b ? "" : `<span class="src xs ${v < b.lo || v > b.hi ? "off" : "muted"}">${v < b.lo ? "below" : v > b.hi ? "above" : "inside"} past bids ${f(b.lo)}–${f(b.hi)}</span>`;
  box.innerHTML = `
    <h4>${esc(p.name)} <span class="xs muted">${esc(p.id)}</span> <button class="btn ghost" type="button" data-map="${esc(r.s.uid)}" style="min-height:28px;padding:.15rem .55rem;margin-left:.3rem;font-size:var(--fs-xs)">Show on map</button></h4>
    <p class="small muted">${esc(p.format)}${p.clientFormat ? ` (the client calls it ${esc(p.clientFormat)})` : ""}${p.region ? " · " + esc(p.region) : ""}${p.sqft ? ` · ${fmtN(p.sqft)} sq ft` : ""} · hours ${stamp(p.src, SRC_NAME[p.src])}${p.lifted ? " · raised to the spec minimum" : ""}${p.cobot ? " · priced with a cobot" : ""}</p>
    <dl class="mosaic">
      <div><dt>Hours a week</dt><dd>${(+p.h.toFixed(1)).toLocaleString("en-GB")}</dd></div><div><dt>Operatives</dt><dd>${p.hc}</dd></div>
      <div><dt>Pay</dt><dd>${gbp(p.rate, 2)}/hr</dd></div><div><dt>Billed</dt><dd>${gbp(p.perHr, 2)}/hr</dd></div>
      <div><dt>A week</dt><dd>${gbp(p.charge)}</dd></div><div><dt>A year</dt><dd>${gbpK(p.annual)}</dd></div>
      <div><dt>Pay a week</dt><dd>${gbp(p.wages)}<span class="src xs muted">${(p.wagePct * 100).toFixed(1)}% of the charge</span></dd></div>
      <div><dt>Sq ft per hour</dt><dd>${p.sqftPerHr != null ? fmtN(p.sqftPerHr) : "–"}${p.sqftPerHr != null ? band(p.sqftPerHr, sb, fmtN) : `<span class="src xs muted">no floor area</span>`}</dd></div>
      <div><dt>Pay per 1,000 sq ft</dt><dd>${p.wagePer1k != null ? gbp(p.wagePer1k, 2) : "–"}${band(p.wagePer1k, pb, v => "£" + v.toFixed(0))}</dd></div></dl>
    <div class="stack" role="img" aria-label="${esc(p.name)} weekly charge: ${parts.map(x => `${x[1]} ${gbp(x[2])}`).join(", ")}">${parts.map(x => { const [k, sub] = x[0].split(" "), w = (Math.max(0, x[2]) / r.charge * 100).toFixed(2); return sub === "on" ? `<i class="on" style="width:${w}%"></i>` : `<i style="width:${w}%;background:${PART_C[k]}"></i>`; }).join("")}</div>
    <p class="small">Ranked ${fmtN(rank)} of ${fmtN(I.site.points.length)} by charge. Each hour here is billed ${Math.abs(vsAvg) < 0.5 ? "the same as" : `${Math.abs(vsAvg).toFixed(1)}% ${vsAvg > 0 ? "more than" : "less than"}`} the estate's ${gbp(I.perHour.rev, 2)}${Math.abs(vsAvg) >= 0.5 ? (p.lifted ? ", because it was raised to the minimum hours" : p.cobot ? ", because it carries a cobot" : r.hc && p.h / r.hc < 12 ? ", mostly because its operatives work short weeks" : "") : ""}.</p>`;
  drawScatter();
}
function drawScatter(){
  const box = $("#insScatter"); if (!box || !INS) return;
  const {I} = INS, pts = I.site.points, sel = insSite(), w = Math.max(260, box.clientWidth), h = w < 420 ? 220 : 250;
  const useArea = I.site.withArea >= 3, L = 52, Rm = 14, Tm = 10, B = 38;
  const xs = useArea ? pts.filter(p => p.sqft) : pts.slice().sort((a, b) => a.h - b.h).map((p, k) => Object.assign({}, p, {rank:k + 1}));
  const xv = p => useArea ? p.sqft : p.rank, xMax = Math.max(...xs.map(xv)) * 1.04 || 1, yMax = Math.max(...pts.map(p => p.h)) * 1.08 || 1;
  const X = v => L + v / xMax * (w - L - Rm), Y = v => h - B - v / yMax * (h - B - Tm);
  const xs1 = niceStep(xMax, w < 420 ? 3 : 5), ys1 = niceStep(yMax, 4), xt = [], yt = [];
  for (let v = 0; v <= xMax; v += xs1) xt.push(v); for (let v = 0; v <= yMax; v += ys1) yt.push(v);
  const s = sel && xs.find(p => p.i === sel.i), fit = useArea && I.site.fit;
  const fitLine = fit && fit.per1k > 0 ? (() => { const xe = Math.min(xMax, yMax / fit.per1k * 1000); return `<path d="M${X(0)} ${Y(0)}L${X(xe).toFixed(1)} ${Y(fit.per1k * xe / 1000).toFixed(1)}" stroke="var(--ink)" stroke-width="1.2" stroke-dasharray="5 4" fill="none"/>
    <text x="${Math.min(X(xe), w - Rm) - 4}" y="${Y(fit.per1k * xe / 1000) + 14}" text-anchor="end" class="lab">${fit.per1k >= 10 ? fmtN(fit.per1k) : fit.per1k.toFixed(1)} hrs per 1,000 sq ft</text>`; })() : "";
  box.innerHTML = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${xs.length} sites: weekly hours against ${useArea ? "floor area" : "rank by hours"}. ${sel ? `Selected: ${esc(sel.name)}, ${fmtN(sel.h)} hours.` : ""}">
    ${yt.map(v => `<line x1="${L}" x2="${w - Rm}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--rule)"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${fmtN(v)}</text>`).join("")}
    ${xt.map(v => `<text x="${X(v)}" y="${h - B + 16}" text-anchor="middle">${useArea ? (v >= 1000 ? fmtN(v / 1000) + "k" : fmtN(v)) : fmtN(v)}</text>`).join("")}
    <line x1="${L}" x2="${w - Rm}" y1="${h - B}" y2="${h - B}" stroke="var(--ink)"/>
    <text x="${L + (w - L - Rm) / 2}" y="${h - 4}" text-anchor="middle" class="ax">${useArea ? "Floor area, sq ft" : "Sites, ranked by hours"}</text>
    <text x="12" y="${Tm + (h - B - Tm) / 2}" text-anchor="middle" class="ax" transform="rotate(-90 12 ${Tm + (h - B - Tm) / 2})">Hours a week</text>
    <g class="pts">${xs.map(p => shape(p.src, X(xv(p)).toFixed(1), Y(p.h).toFixed(1))).join("")}</g>${fitLine}
    ${s ? `<circle cx="${X(xv(s))}" cy="${Y(s.h)}" r="8" fill="none" stroke="var(--ink)" stroke-width="1.5"/><text x="${Math.min(w - Rm - 4, X(xv(s)) + 12)}" y="${Math.max(Tm + 12, Y(s.h) - 10)}" text-anchor="${X(xv(s)) > w - 160 ? "end" : "start"}" class="lab">${esc(s.name)}</text>` : ""}
  </svg>`;
  box.dataset.map = JSON.stringify({L, Rm, Tm, B, w, h, xMax, yMax, useArea});
  INS.scatterPts = xs.map(p => [p.i, X(xv(p)), Y(p.h)]);
}
function drawPareto(){
  const box = $("#insPareto"); if (!box || !INS) return;
  const E = INS.I.estate, w = Math.max(260, box.clientWidth), h = w < 420 ? 210 : 240, L = 44, Rm = 14, Tm = 12, B = 36;
  const X = v => L + v * (w - L - Rm), Y = v => h - B - v * (h - B - Tm);
  const line = E.curve.map((p, k) => `${k ? "L" : "M"}${X(p.x).toFixed(1)} ${Y(p.y).toFixed(1)}`).join("");
  const mark = (n, f) => { const x = X(n / E.count), end = x > w - 150; return `<path d="M${L} ${Y(f)}H${x}V${h - B}" fill="none" stroke="var(--ink-2)" stroke-dasharray="2 3"/><circle cx="${x}" cy="${Y(f)}" r="3.5" fill="var(--ink)"/>
    <text x="${end ? x - 7 : x + 7}" y="${Y(f) + 15}" text-anchor="${end ? "end" : "start"}" class="lab">${fmtN(n)} site${n === 1 ? "" : "s"} carry ${Math.round(f * 100)}%</text>`; };
  box.innerHTML = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Concentration: the largest ${fmtN(E.n50)} sites carry half the charge and ${fmtN(E.n80)} of ${fmtN(E.count)} carry 80%.">
    ${[0, .25, .5, .75, 1].map(v => `<line x1="${L}" x2="${w - Rm}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--rule)"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${v * 100}%</text>`).join("")}
    ${[0, .25, .5, .75, 1].map(v => `<text x="${X(v)}" y="${h - B + 16}" text-anchor="middle">${v * 100}%</text>`).join("")}
    <line x1="${L}" x2="${w - Rm}" y1="${h - B}" y2="${h - B}" stroke="var(--ink)"/>
    <path d="${line}L${X(1)} ${Y(0)}L${X(0)} ${Y(0)}Z" fill="#f0ede4"/>
    <path d="M${X(0)} ${Y(0)}L${X(1)} ${Y(1)}" stroke="var(--ink-3)" stroke-dasharray="4 4"/>
    <text x="${X(.66)}" y="${Y(.66) + 15}" class="ax halo" transform="rotate(${-Math.atan((h - B - Tm) / (w - L - Rm)) * 180 / Math.PI} ${X(.66)} ${Y(.66) + 15})">if every site cost the same</text>
    <path d="${line}" fill="none" stroke="var(--ink)" stroke-width="1.8"/>
    ${mark(E.n50, .5)}${mark(E.n80, .8)}
    <text x="${L + (w - L - Rm) / 2}" y="${h - 4}" text-anchor="middle" class="ax">Share of sites, largest charge first</text>
  </svg>`;
}
const hbars = (rows, total, cls) => `<ul class="hbars ${cls || ""}">${rows.map(x => `<li><span>${esc(x.k)} <span class="xs muted">${fmtN(x.n)}</span></span><span class="tr" aria-hidden="true"><i style="width:${(x.charge / total * 100).toFixed(2)}%"></i></span><b class="num">${Math.round(x.share * 100)}%</b><span class="num xs muted">${gbpK(x.charge)}/wk</span></li>`).join("")}</ul>`;
const offBand = (v, b) => v != null && b && (v < b.lo || v > b.hi) ? " off" : "";
function gauge(label, v, b, f, note){
  const lo = Math.min(v, b ? b.lo : v) * 0.8, hi = Math.max(v, b ? b.hi : v) * 1.15 || 1, at = x => ((x - lo) / (hi - lo) * 100).toFixed(2) + "%";
  const pos = !b ? "" : v < b.lo ? "below" : v > b.hi ? "above" : "inside";
  return `<div class="gauge${pos && pos !== "inside" ? " off" : ""}" role="img" aria-label="${esc(label)}: ${esc(f(v))}${b ? `, ${pos} past bids of ${esc(f(b.lo))} to ${esc(f(b.hi))}` : ""}.">
    <span class="g-l">${esc(label)}<b>${esc(f(v))}</b></span>
    <span class="g-t" aria-hidden="true">${b ? `<span class="g-band" style="left:${at(b.lo)};width:${((b.hi - b.lo) / (hi - lo) * 100).toFixed(2)}%"></span>` : ""}<span class="g-pin" style="left:${at(v)}"></span></span>
    <span class="g-s xs muted">${b ? `${pos === "inside" ? "Inside" : pos === "below" ? "Below" : "Above"} past bids, ${esc(f(b.lo))} to ${esc(f(b.hi))}. ` : ""}${esc(note)}</span></div>`;
}
function renderInsights(){
  const el = $("#s-insights"), R = compute();
  if (insIO){ insIO.disconnect(); insIO = null; } if (insRO){ insRO.disconnect(); insRO = null; }
  if (!R){ el.innerHTML = `<header><div><h2 id="h-insights">What the model tells us</h2><p class="muted">Add sites first. The model is read here once it has a price.</p></div></header>`; return; }
  const I = insights(R), T = R.T, W = RATECARD.weeksPerYear, c = I.contract, ph = I.perHour, tp = I.site.pick.typical, E = I.estate;
  INS = {I, R}; S.insRead = S.insRead || {};
  const H = I.site.points.reduce((a, p) => a + p.h, 0);
  const mark = {pound:["£1", "every £1 the client pays"], hour:[PENNY(ph.rev), `£1 × ${ph.rev.toFixed(2)}, one billed hour`], site:[tp ? MONEY(tp.charge) : "£0", tp ? `${PENNY(tp.perHr)} × ${fmtN(tp.h)} hrs, one site's week` : "one site's week"],
    estate:[MONEY(T.charge), `${PENNY(ph.rev)} × ${fmtN(H)} hrs, every site's week`], contract:[MONEY(T.contract), `× ${W.toFixed(2)} weeks × ${c.years} yr${c.years === 1 ? "" : "s"}, the whole term`]};
  const grid = []; I.pound.forEach(p => { if (p.split){ for (let k = 0; k < p.split.wage; k++) grid.push("labour w"); for (let k = 0; k < p.split.on; k++) grid.push("labour on"); } else for (let k = 0; k < p.p; k++) grid.push(p.k); });
  const WG = I.wage, wb = WG.bench, pct1 = v => (v * 100).toFixed(1) + "%";
  const inBandTxt = (v, b, f) => !b ? "" : v < b.lo ? `below past bids (${f(b.lo)}–${f(b.hi)})` : v > b.hi ? `above past bids (${f(b.lo)}–${f(b.hi)})` : `inside past bids (${f(b.lo)}–${f(b.hi)})`;
  const hMax = Math.max(ph.band.hi, ph.rev) * 1.1, at = v => (v / hMax * 100).toFixed(2) + "%";
  const hTicks = []; for (let v = 0; v <= hMax; v += niceStep(hMax, 5)) hTicks.push(v);
  const labourLines = ph.parts.filter(p => p.g === "labour"), otherLines = ph.parts.filter(p => p.g !== "labour");
  const labourHr = labourLines.reduce((a, p) => a + p.perHr, 0), onHr = labourLines.filter(p => p.k !== "pay").reduce((a, p) => a + p.perHr, 0);
  const pr = WG.prod, fmtRows = E.byFormat.filter(x => x.sqftPerHr != null);
  const tAll = c.tornado, tLead = tAll.length > 2 && tAll[0].span > 2.5 * tAll[1].span ? tAll[0] : null, tRest = tLead ? tAll.slice(1) : tAll;
  const tMax = Math.max(1, ...tRest.map(x => Math.max(Math.abs(x.lo.d), Math.abs(x.hi.d))));
  const tbar = d => Math.abs(d) < 0.5 ? "" : `<i class="${d > 0 ? "up" : "down"}" style="${d > 0 ? "left" : "right"}:50%;width:${(Math.abs(d) / tMax * 50).toFixed(2)}%"></i>`;
  const evTotal = E.evidence.reduce((a, x) => a + x.charge, 0) || 1;
  const yrs = Array.from({length:c.years}, (_, k) => k + 1), exts = Array.from({length:Math.max(0, Math.round(c.ext))}, (_, k) => c.years + k + 1);
  const siteOpts = [...I.site.points].sort((a, b) => a.name.localeCompare(b.name, "en-GB")).map(p => `<option value="${p.i}">${esc(p.name)}${p.id ? " · " + esc(p.id) : ""}</option>`).join("");
  const sel = S.insSite ?? "typical";
  const lv = (k, body) => `<section class="zl" id="ins-${k}" data-lv="${k}" data-guide="el:ins-${k}" aria-labelledby="hi-${k}">
    <h3 id="hi-${k}" class="take" tabindex="-1">${esc(I.takeaways[k])}</h3><p class="zl-mark"><b>${mark[k][0]}</b><span>${mark[k][1]}</span></p>
    <div class="zl-body">${body}</div></section>`;
  const tick = k => `<span class="box" aria-hidden="true"></span>`;
  el.innerHTML = `
    <header><div><h2 id="h-insights">What the model tells us</h2><p class="muted">The same price read at five scales: a pound, an hour, one site, the estate and the contract. Each scale ends in one sentence. The sentences collect in the summary as you read, ready for the bid email or the approval call.</p></div></header>
    <div class="ins"><div class="ins-body">
    <nav class="ticks" aria-label="Scales read so far">${ZOOM.map(([k, short]) => `<a href="#ins-${k}" data-jump="${k}" data-lv="${k}" class="${S.insRead[k] ? "done" : ""}">${tick(k)}${(t => t[0].toUpperCase() + t.slice(1))(short.replace(/^(One|The) /, ""))}<span class="sr">${S.insRead[k] ? " (read)" : ""}</span></a>`).join("")}</nav>
    ${lv("pound", `<div class="pound">
      <div class="pgrid" role="img" aria-label="Of every £1: ${I.pound.map(p => p.split ? `${p.split.wage}p cleaners' pay, ${p.split.on}p employment on-costs` : `${p.p}p ${p.l.toLowerCase()}`).join(", ")}">${grid.map(c => { const [k, sub] = c.split(" "); return sub === "on" ? `<i data-k="${k}" class="on"></i>` : `<i data-k="${k}"${sub ? ` class="${sub}"` : ""} style="background:${PART_C[k]}"></i>`; }).join("")}</div>
      <table class="tbl plist"><thead><tr><th>Where it goes</th><th class="num">Of £1</th><th class="num">A week</th><th class="num">A year</th></tr></thead>
        <tbody>${I.pound.map(p => `<tr data-k="${p.k}" tabindex="0"><td><span class="sw" style="--c:${PART_C[p.k]}" aria-hidden="true"></span>${p.l}</td><td class="num"><b>${p.p}p</b></td><td class="num">${gbp(p.weekly)}</td><td class="num">${gbpK(p.weekly * W)}</td></tr>${p.split ? `
          <tr class="sub" data-k="wage" tabindex="0" data-guide="el:ins-wage"><td><span class="sw" style="--c:${PART_C.labour}" aria-hidden="true"></span>Cleaners' pay</td><td class="num">${p.split.wage}p</td><td class="num">${gbp(WG.weekly)}</td><td class="num">${gbpK(WG.weekly * W)}</td></tr>
          <tr class="sub" data-k="oncost" tabindex="0" data-guide="el:ins-oncost"><td><span class="sw on" aria-hidden="true"></span>NI, holiday, pension, levy${WG.credit > 0.005 ? " and risk allowance" : ""}</td><td class="num">${p.split.on}p</td><td class="num">${gbp(WG.onCosts + WG.credit)}</td><td class="num">${gbpK((WG.onCosts + WG.credit) * W)}</td></tr>` : ""}`).join("")}</tbody>
        <tfoot><tr><td>The client pays</td><td class="num">£1</td><td class="num">${gbp(T.charge)}</td><td class="num">${gbpK(T.annual)}</td></tr></tfoot></table></div>`)}
    ${lv("hour", `<div class="haxis" role="img" aria-label="Billed ${gbp(ph.rev, 2)} an hour. The operative is paid ${gbp(ph.pay, 2)}. Past bids billed ${gbp(ph.band.lo, 2)} to ${gbp(ph.band.hi, 2)}.">
        <span class="hband" style="left:${at(ph.band.lo)};width:${((ph.band.hi - ph.band.lo) / hMax * 100).toFixed(2)}%"><span>${stamp("bm", "Past-bid benchmark")} Past bids ${gbp(ph.band.lo, 2)}–${gbp(ph.band.hi, 2)}</span></span>
        <span class="hbar">${ph.parts.map(p => p.g === "labour" && p.k !== "pay" ? `<i class="on" style="width:${at(p.perHr)}"></i>` : `<i style="width:${at(p.perHr)};background:${PART_C[p.g]}"></i>`).join("")}</span>
        <span class="hpin" style="left:${at(ph.rev)}"><b>${gbp(ph.rev, 2)}</b> billed</span>
        <span class="hpin pay" style="left:${at(ph.pay)}"><b>${gbp(ph.pay, 2)}</b> pay</span>
        <span class="hscale">${hTicks.map(v => `<span style="left:${at(v)}">£${fmtN(v)}</span>`).join("")}</span></div>
      <dl class="mosaic paykpi" data-guide="el:ins-paykpi">
        <div class="lead"><dt>Pay's share of the hour</dt><dd>${pct1(WG.share)}${wb ? `<span class="src xs muted">${esc(inBandTxt(WG.share * 100, wb, v => v + "%"))}</span>` : ""}</dd></div>
        <div class="lead"><dt>Billed for every £1 of pay</dt><dd>£${WG.multiple.toFixed(2)}<span class="src xs muted">the price ÷ the pay</span></dd></div>
        <div class="lead"><dt>On-costs on top of pay</dt><dd>+${pct1(WG.uplift)}<span class="src xs muted">NI, holiday, SSP, pension, training and levy</span></dd></div></dl>
      <table class="tbl receipt"><caption class="sr">One billed hour, line by line</caption><thead><tr><th>Line</th><th class="num">Per hour</th><th class="num">Share</th></tr></thead><tbody>
        ${labourLines.map(p => `<tr class="sub${p.k === "pay" ? " pay" : ""}"><td><span class="sw${p.k === "pay" ? "" : " on"}" style="--c:${PART_C.labour}" aria-hidden="true"></span>${esc(p.l)}</td><td class="num">${PENNY(p.perHr)}</td><td class="num xs muted">${(p.share * 100).toFixed(1)}%</td></tr>`).join("")}
        ${onHr > 0.0005 ? `<tr class="sub onsub"><td>${labourLines.some(p => p.k === "credit") ? "On-costs and risk allowance" : "On-costs"} on top of pay</td><td class="num">${PENNY(onHr)}</td><td class="num xs muted">${(onHr / ph.rev * 100).toFixed(1)}%</td></tr>` : ""}
        <tr class="subt"><td>Labour</td><td class="num">${PENNY(labourHr)}</td><td class="num xs muted">${(labourHr / ph.rev * 100).toFixed(1)}%</td></tr>
        ${otherLines.map(p => `<tr><td><span class="sw" style="--c:${PART_C[p.g]}" aria-hidden="true"></span>${esc(p.l)}</td><td class="num">${PENNY(p.perHr)}</td><td class="num xs muted">${(p.share * 100).toFixed(1)}%</td></tr>`).join("")}</tbody>
        <tfoot><tr><td>Billed per hour</td><td class="num">${gbp(ph.rev, 2)}</td><td class="num">100%</td></tr></tfoot></table>
      <p class="xs muted">Pay is the priced ${val("payBasis") === "RLW" ? "Real Living Wage" : "National Living Wage"} of ${gbp(RATECARD[val("payBasis") === "RLW" ? "RLW" : "NLW"], 2)}${num(val("payPremium")) ? ` plus ${num(val("payPremium"))}p` : ""}, averaged over every hour. ${esc(RATECARD.label)}.</p>`)}
    ${lv("site", `<div class="site-ctl"><div class="seg" role="group" aria-label="Show a site">${["typical", "largest", "smallest"].map(k => `<button type="button" data-inssite="${k}" aria-pressed="${sel === k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join("")}</div>
        <label class="f pick">Or any site<select id="insSitePick"><option value="">Choose a site</option>${siteOpts}</select></label></div>
      <div class="site-grid"><div id="insSiteCard" class="site-card" aria-live="polite"></div>
        <figure class="chart"><div id="insScatter" class="svgbox"></div>
          <figcaption class="legend2">${["doc", "ans", "est", "bm", "def"].filter(k => I.site.points.some(p => p.src === k)).map(k => `<span>${shapeKey(k)} ${SRC_NAME[k]} <span class="muted">${fmtN(I.site.points.filter(p => p.src === k).length)}</span></span>`).join("")}<span class="muted">Select a point to open that site.</span></figcaption></figure></div>`)}
    ${lv("estate", `<button class="mapthumb" type="button" data-map="" data-guide="el:ins-map"><span class="mt-art" id="insMapThumb"></span><span class="mt-copy"><b>See the estate on a map</b><span data-mthumb>Every site placed from its postcode, town or council.</span><span class="mt-go">Open the estate map</span></span></button>
      <figure class="chart"><div id="insPareto" class="svgbox"></div><figcaption class="xs muted">${E.concentrated ? `The further the curve bows above the diagonal, the more a few large sites decide the price. Here it bows hard: the largest ${fmtN(E.n50)} sites are the ones to survey first.` : `The curve stays close to the diagonal, so the charge is spread across the estate and every site's hours matter about equally.`}</figcaption></figure>
      <div class="split"><div><h4>By format</h4>${hbars(E.byFormat, T.charge)}</div><div><h4>By region</h4>${hbars(E.byRegion, T.charge, "soft")}</div></div>
      <h4>Pay and productivity against past bids</h4>
      <div class="gauges" data-guide="el:ins-prod">${gauge("Pay as a share of the price", WG.share * 100, wb, v => v.toFixed(1) + "%", "The pure hourly pay, before NI, holiday and pension.")}
        ${pr ? gauge("Floor cleaned per labour hour", pr.sqftPerHr, pr.bench.sqftPerHr, v => fmtN(v) + " sq ft", "Higher means each hour covers more floor.") + gauge("Pay per 1,000 sq ft a week", pr.wagePer1k, pr.bench.wagePer1k, v => "£" + v.toFixed(2), "What the floor costs in pay alone.") : ""}</div>
      ${pr ? `<p class="xs muted">Productivity uses the ${fmtN(pr.n)} of ${fmtN(pr.of)} sites with a floor area.</p>` : `<p class="small muted">No site has a floor area, so productivity cannot be measured. Add sq ft on the Sites step to see it.</p>`}
      ${fmtRows.length ? `<table class="tbl prodt"><caption class="sr">Pay and productivity by format</caption><thead><tr><th>Format</th><th class="num">Sites</th><th class="num">Pay % of price</th><th class="num">Sq ft per hr</th><th class="num">Pay per 1k sq ft</th></tr></thead><tbody>
        ${fmtRows.map(x => `<tr><td>${esc(x.k)}</td><td class="num">${fmtN(x.n)}</td><td class="num">${(x.wagePct * 100).toFixed(1)}%</td><td class="num${offBand(x.sqftPerHr, BENCH.sqftPerHr)}">${fmtN(x.sqftPerHr)}</td><td class="num${offBand(x.wagePer1k, BENCH.wagePer1k)}">${gbp(x.wagePer1k, 2)}</td></tr>`).join("")}</tbody></table>` : ""}
      <h4>What the hours rest on</h4>
      <div class="evbar" role="img" aria-label="${E.evidence.map(x => `${Math.round(x.share * 100)}% ${SRC_NAME[x.src] || x.src}`).join(", ")}">${E.evidence.map(x => `<i class="ev-${x.src}" style="width:${(x.charge / evTotal * 100).toFixed(2)}%"></i>`).join("")}</div>
      <table class="tbl"><thead><tr><th>Hours source</th><th class="num">Sites</th><th class="num">Hours/wk</th><th class="num">Charge/wk</th><th class="num">Share</th></tr></thead><tbody>
        ${E.evidence.map(x => `<tr><td>${stamp(x.src)} ${esc(SRC_NAME[x.src] || x.src)}</td><td class="num">${fmtN(x.n)}</td><td class="num">${fmtN(x.hours)}</td><td class="num">${gbp(x.charge)}</td><td class="num"><b>${Math.round(x.share * 100)}%</b></td></tr>`).join("")}</tbody></table>
      ${E.firm < 0.995 ? `<p class="small">Estimated hours are the weakest part of the price. <button class="btn ghost" type="button" data-go="sites">Review sites and hours</button></p>` : ""}`)}
    ${lv("contract", `<ol class="term" aria-label="Contract value by year: ${c.years} year${c.years === 1 ? "" : "s"} at ${gbpK(T.annual)} a year${exts.length ? `, then ${exts.length} optional extension year${exts.length === 1 ? "" : "s"}` : ""}">${yrs.concat(exts).map(y => `<li class="${y > c.years ? "ext" : ""}${y === c.years || y === c.years + exts.length ? " key" : ""}"><span class="yr">${y > c.years ? "Ext " : "Yr "}${y}</span><i aria-hidden="true"></i><b class="cum">${MONEY(T.annual * y)}</b></li>`).join("")}</ol>
      <p class="xs muted term-note">Running total at the end of each year${exts.length ? "; dashed years are the optional extension" : ""}.</p>
      <dl class="mosaic">
        <div class="lead"><dt>Profit over the term</dt><dd>${gbpK(c.profitTerm)}</dd></div>
        <div class="lead" data-guide="el:ins-payterm"><dt>Cleaners' pay over the term</dt><dd>${gbpK(c.wagesTerm)}<span class="src xs muted">${Math.round(WG.share * 100)}% of the contract value</span></dd></div>
        <div class="lead"><dt>Cash out before the client pays</dt><dd>${gbpK(c.workingCapital)}<span class="src xs muted">${c.payDays}-day terms, at steady state</span></dd></div>
        <div><dt>Over ${c.years} year${c.years === 1 ? "" : "s"}</dt><dd>${gbpK(c.term)}</dd></div>${exts.length ? `<div><dt>With the extension</dt><dd>${gbpK(c.termExt)}</dd></div>` : ""}
        ${c.capex ? `<div><dt>Capex</dt><dd>${gbpK(c.capex)}</dd></div>` : ""}</dl>
      <h4>What moves the price most</h4>
      ${tLead ? `<div class="torn-lead"><p><b>${esc(tLead.l)}</b> outweighs every other lever: ${esc(tLead.lo.lab)} ${signK(tLead.lo.d)}, ${esc(tLead.hi.lab)} ${signK(tLead.hi.d)} a year.${tLead.id === "hours" ? " The hours are the price." : ""} The levers below are drawn on their own scale.</p><button class="btn ghost" type="button" data-go="${tLead.go}">Adjust</button></div>` : ""}
      <p class="xs muted">Each lever moved one realistic step either way and the whole model re-priced. Bars show the change to the annual value; red is dearer for the client.</p>
      <table class="tbl torn"><thead><tr><th>Lever</th><th class="num">Lower</th><th><span class="sr">Change in annual value</span></th><th>Higher</th><th><span class="sr">Adjust</span></th></tr></thead><tbody>
        ${tRest.map(x => `<tr><th scope="row">${esc(x.l)}</th><td class="num"><span class="tl">${esc(x.lo.lab)}</span>${signK(x.lo.d)}</td>
          <td class="tb"><span class="tb-track" aria-hidden="true">${tbar(x.lo.d)}${tbar(x.hi.d)}</span></td><td><span class="tl">${esc(x.hi.lab)}</span>${signK(x.hi.d)}</td>
          <td><button class="btn ghost" type="button" data-go="${x.go}">Adjust</button></td></tr>`).join("")}</tbody></table>
      <h4>Before sign-off</h4>
      <ol class="route">${c.route.approvers.map(a => `<li class="${a.exception ? "x" : ""}"><b>${esc(a.role)}</b><span>${esc(a.why)}</span></li>`).join("")}</ol>
      ${c.raise.length ? `<ul class="flags">${c.raise.map(f => `<li><span class="lvl ${f.lvl}">${f.lvl === "block" ? "MUST FIX" : "RAISE"}</span><span>${esc(f.t)}${f.go ? ` <button class="btn ghost" type="button" data-go="${f.go}">Review</button>` : ""}</span></li>`).join("")}</ul>` : `<p class="small">No warnings to raise. The price sits inside every check.</p>`}`)}
    </div>
    <section class="spine" aria-labelledby="spineH" data-guide="el:insSummary"><h3 id="spineH">Summary</h3>
      <ol>${ZOOM.map(([k, short]) => `<li data-lv="${k}" class="${S.insRead[k] ? "done" : ""}"><a href="#ins-${k}" data-jump="${k}"><span class="box" aria-hidden="true"></span><span><b>${short}</b>${esc(I.takeaways[k])}</span><span class="sr">${S.insRead[k] ? "(read)" : ""}</span></a></li>`).join("")}</ol>
      <p class="xs muted">Each line is ticked once its scale has been on screen.</p>
      <div class="actions"><button class="btn primary" type="button" id="insCopy2">Copy the summary</button><button class="btn ghost" type="button" id="insDl">Download as text</button></div></section></div>
    <div class="actions" style="margin-top:1.25rem"><button class="btn primary" type="button" data-go="generate">Continue to generate model</button></div>`;
  if (typeof sel === "number") $("#insSitePick").value = String(sel);
  renderInsSite(); drawPareto();
  if (typeof EMap !== "undefined") EMap.thumb($("#insMapThumb"));
  let last = 0; insRO = new ResizeObserver(() => { const w = $("#insScatter") ? $("#insScatter").clientWidth : 0; if (Math.abs(w - last) > 4){ last = w; requestAnimationFrame(() => { drawScatter(); drawPareto(); }); } });
  insRO.observe($(".ins-body"));
  insIO = new IntersectionObserver(ents => ents.forEach(en => { if (!en.isIntersecting) return; const k = en.target.dataset.lv; if (S.insRead[k]) return;
    S.insRead[k] = true; document.querySelectorAll(`.spine li[data-lv="${k}"], .ticks a[data-lv="${k}"]`).forEach(n => { n.classList.add("done"); const s = n.querySelector(".sr"); if (s) s.textContent = " (read)"; }); }), {threshold:0.35});
  document.querySelectorAll(".zl").forEach(z => insIO.observe(z));
}
function copySummary(){
  const txt = insightsText(INS && INS.I);
  const fallback = () => { download(`${fileSafe(clientLabel())} - what the model tells us.txt`, txt, "text/plain"); toast("Clipboard blocked here, so the summary was downloaded."); };
  logEvent("insights.copy", {}); S.visited.insCopy = true; if (typeof Guide !== "undefined") Guide.tick();
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(txt).then(() => toast("Summary copied. Paste it into the bid email or the approval note."), fallback);
  else fallback();
}
/* ---------- Step 8: Generate model ---------- */
function download(name, text, type){ const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], {type})); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0); }
const csv = rows => rows.map(r => r.map(c => { const s = String(c ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(",")).join("\n");
function renderGenerate(){
  const R = compute(); if (!R) return; const blocks = flags(R).filter(f => f.lvl === "block"), P = payload();
  const steps = [["Copy master template to the opportunity folder", "SharePoint"], ["Write Instructions, Site Input and Summary input cells", "Office Script"], ["Extend total ranges to the last site row and remove external links", "Office Script"], ["Recalculate and read back control totals (±0.5%)", "Office Script"], ["Send for commercial approval", "Approvals · Teams"]];
  const st = S.genStage ?? -1, route = approvalRoute(R), so = signoffState(R), F = flags(R);
  const warns = F.filter(f => f.lvl === "warn").length, low = (S.spec.lowConfidence || []).filter(p => !S.spec.fieldSrc[p]).length;
  const when = t => new Date(t).toLocaleString("en-GB", {dateStyle:"medium", timeStyle:"short"});
  $("#s-generate").innerHTML = `
    <header><div><h2 id="h-generate">Generate the populated model</h2><p class="muted">The <b>Build Workbook</b> agent flow writes this payload into a copy of the pinned master template, then checks the workbook's totals against the price shown here.</p></div></header>
    ${blocks.length ? `<ul class="flags" style="margin-bottom:1rem">${blocks.map(x => `<li><span class="lvl block">BLOCK</span><span>${termify(esc(x.t))}${x.go ? ` <button class="btn ghost" type="button" data-go="${x.go}">Fix</button>` : ""}</span></li>`).join("")}</ul>` : ""}
    <h3 style="margin-top:0">Approval route</h3>
    <ol class="route" data-level="${route.level}" data-guide="el:route">${route.approvers.map(a => `<li${a.exception ? ' class="x"' : ""}><b>${esc(a.role)}</b><span class="muted">${esc(a.why)}</span></li>`).join("")}</ol>
    <div class="signoff" aria-labelledby="soHead" data-guide="el:signoff"><h3 id="soHead" style="margin:0">Your sign-off</h3>
    ${so.valid ? `<p class="small" style="margin:0"><span class="stamp ans">SIGNED</span> ${esc(so.by)} signed off ${gbp(so.weeklyCharge, 2)} a week on ${esc(when(so.at))}. It goes with the payload to the approvers above.</p>
      <div><button class="btn ghost" type="button" id="soUndo">Withdraw sign-off</button></div>`
    : `${so.stale ? `<p class="small redcount" style="margin:0">The price changed after ${esc(so.by)} signed off (${gbp(so.weeklyCharge, 2)} then, ${gbp(R.T.charge, 2)} now). Sign off again.</p>` : ""}
      <label class="chk"><input type="checkbox" id="soChk" ${blocks.length ? "disabled" : ""}><span>I have checked the ${plural(warns, "warning")}${low ? ` and ${plural(low, "low-confidence value")}` : ""} against the tender documents. This first pass is ready for approval.</span></label>
      <div class="row2"><label class="f">Your name<input type="text" id="soName" autocomplete="name" maxlength="120" value="${esc((S.user && S.user.name) || (S.signoff && S.signoff.by) || "")}" ${blocks.length ? "disabled" : ""}></label>
        <button class="btn" type="button" id="soBtn" ${blocks.length ? "disabled" : ""}>Sign off this price</button></div>
      <span class="err" id="soErr" aria-live="polite">${blocks.length ? "Clear the blocking checks above first." : ""}</span>`}
    </div>
    <h3>Build the workbook</h3>
    <ol class="flow" data-guide="el:flow">${steps.map((s, i) => { const sim = !Bridge.can("workbook"), last = i === steps.length - 1;
      const tail = st > i ? (sim ? (last ? " · not sent (preview)" : " · simulated") : " · done") : st === i ? " · running" : "";
      return `<li class="${st > i ? (sim ? "done sim" : "done") : ""}"><span class="box${st === i ? " run" : ""}" aria-hidden="true"></span><span>${s[0]}</span><span class="xs muted">${s[1]}${tail}</span></li>`; }).join("")}</ol>
    ${S.generated ? (Bridge.can("workbook")
      ? `<p class="small"><b>Model ready:</b> ${esc(clientLabel())} Cost Model v0.1 (first pass).xlsx. Control totals matched (${gbp(P.controlTotals.weeklyCharge)} per week). The link was posted to the conversation.</p>`
      : `<p class="small"><b>Simulated run complete.</b> This preview didn't create a workbook. In Cowork, the flow creates <i>${esc(clientLabel())} Cost Model v0.1 (first pass).xlsx</i> and checks it against ${gbp(P.controlTotals.weeklyCharge)} per week. Download the payload to test the flow.</p>`) : ""}
    <div class="actions" style="margin:1rem 0" data-guide="el:downloads">
      <button class="btn primary" type="button" id="genBtn" data-guide="el:genBtn" ${blocks.length || !so.valid || st >= 0 && !S.generated ? "disabled" : ""} ${!so.valid && !blocks.length ? 'aria-describedby="soHead"' : ""}>${S.generated ? "Generate again" : "Generate workbook"}</button>
      <button class="btn" type="button" id="dlJson">Download payload (JSON)</button>
      <button class="btn" type="button" id="dlOpp">Save opportunity file</button>
      <button class="btn" type="button" id="dlSites">Download site pricing (CSV)</button>
      <button class="btn" type="button" id="dlLog">Download assumptions log (CSV)</button>
    </div>
    <details><summary class="small" style="cursor:pointer">Preview the payload (${P.sites.length.toLocaleString("en-GB")} sites)</summary><pre class="code">${esc(JSON.stringify({...P, sites:P.sites.slice(0, 3).concat(P.sites.length > 3 ? [`… ${P.sites.length - 3} more`] : [])}, null, 2))}</pre></details>`;
}
async function generate(){
  if (!signoffState().valid){ toast("Sign off the price first."); return; }
  logEvent("generate", {route:approvalRoute().level});
  S.genStage = 0; S.generated = false; render();
  if (Bridge.can("workbook")) Bridge.send("model.generate.request", payload());
  for (let i = 1; i <= 5; i++){ await new Promise(r => setTimeout(r, 450)); S.genStage = i; renderGenerate(); }
  S.generated = true; render(); toast(Bridge.can("workbook") ? "First-pass model generated and sent for approval." : "Simulated generation complete.");
}

/* ---------- Autosave and resume ---------- */
// Standalone: this browser's localStorage. Hosted (Cowork, or a managed app with a store connector): the host keeps the opportunity
// in Dataverse from "opportunity.save" messages and offers the latest draft back as "opportunity.draft".
const STORE_KEY = "cmb.opportunity.v1";
const Store = {
  t:null, last:null, draft:null,
  remote(){ return Bridge.can("store"); },
  enabled(){ return (Bridge.mode === "standalone" || Bridge.mode === "managed" && !this.remote()) && (CMB_DATA.hosting || {}).localAutosave !== false; },
  where(){ return this.remote() ? "in your opportunity records" : "in this browser"; },
  read(){ if (this.remote()) return this.draft; if (!this.enabled()) return null; try { const O = JSON.parse(localStorage.getItem(STORE_KEY) || "null"); return O && /^CostModelOpportunity\/1\./.test(O.schema || "") ? O : null; } catch (e){ return null; } },
  clear(){
    if (this.remote()){ Bridge.send("opportunity.discard", {}); this.draft = null; this.last = null; return; }
    try { localStorage.removeItem(STORE_KEY); } catch (e){ /* storage blocked */ } this.last = null;
  },
  // Every connector call is metered in a managed app, so saves there are batched (hosting.managedSaveMs) and flushed when the tab hides.
  queue(){ if (!S.extracted || S.extracting) return; clearTimeout(this.t); this.t = setTimeout(() => this.save(), Bridge.mode === "managed" ? Math.max(700, (CMB_DATA.hosting || {}).managedSaveMs || 15000) : 700); },
  save(){
    if (!S.extracted || S.extracting) return;
    const O = saveOpportunity(), key = JSON.stringify(O.state);
    if (key === this.last) return;
    const el = $("#saveState");
    clearTimeout(this.t);
    if (this.remote()) Bridge.send("opportunity.save", O);
    else if (this.enabled()){ try { localStorage.setItem(STORE_KEY, JSON.stringify(O)); } catch (e){ el.textContent = "Not saved in this browser (storage full or blocked). Use Save file."; return; } }
    else return;
    this.last = key; el.textContent = `Saved ${new Date().toLocaleTimeString("en-GB", {hour:"2-digit", minute:"2-digit"})}`;
  }
};
function resumeFrom(O, how){
  let N; try { N = restoreOpportunity(O, fresh()); } catch (e){ toast(`Could not open the saved opportunity (${e.message}).`); return false; }
  N.user = SESSION_USER || N.user; S = N; lastCharge = null; FILES.clear(); Store.last = JSON.stringify(saveOpportunity().state);
  const notes = reconcileRestored(O);
  render(); if (S.step !== "docs") go(S.step);
  toast(`${how}: ${O.client || "opportunity"}, ${plural(O.sites || 0, "site")}.${notes.some(n => n.lvl === "warn") ? " The price has moved since it was saved; see the checks." : ""}`);
  return true;
}
async function intake(list){
  const rest = [];
  for (const f of [...list]){
    if (/\.json$/i.test(f.name)){
      let O = null; try { O = JSON.parse(await f.text()); } catch (e){ /* not JSON: read as a spec later, which reports it */ }
      if (O && /^CostModelOpportunity\//.test(O.schema || "")){ resumeFrom(O, `Opened ${f.name}`); continue; }
    }
    rest.push(f);
  }
  if (rest.length) addFiles(rest);
}
const fileSafe = s => String(s).replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Opportunity";

/* ---------- Host bridge (Cowork hosted app ↔ Copilot Studio agent) ---------- */
// Messages go only to a host origin on the allow-list (CMB_DATA.hosting), and only that origin's frame may drive the app.
// The Spec Extractor's OpportunitySpec is validated field by field (engine.js applyOpportunitySpec); it never replaces the state wholesale.
function agentSpec(X){
  try {
    const r = applyOpportunitySpec(S.spec, X); normaliseSpec(S.spec); logEvent("spec.extract", {applied:r.applied.length, rejected:r.rejected.length, low:r.low.length, sites:r.sites});
    toast(`Spec Extractor: ${plural(r.applied.length, "fact")}${r.sites ? `, ${plural(r.sites, "site")}` : ""}${r.low.length ? `; ${r.low.length} low confidence${r.low.includes("client.name") ? " (client name kept as a suggestion)" : ""}` : ""}${r.rejected.length ? `; ${r.rejected.length} rejected` : ""}. Check them on the survey sheet.`);
    return true;
  } catch (e){ toast(`The Spec Extractor's result was not used (${e.message}).`); logEvent("spec.extract.rejected", {reason:e.message}); return false; }
}
const Bridge = {
  // "managed": a Copilot Managed Runtime build (dist/platform.js set window.CMB_PLATFORM before this script ran).
  // "cowork": framed by a host page that speaks the postMessage protocol. "standalone": this browser only.
  mode: window.CMB_PLATFORM ? "managed" : window.parent !== window ? "cowork" : "standalone", origin:null, platform:null,
  can(cap){ return this.mode === "cowork" || this.mode === "managed" && !!this.platform && !!(this.platform.capabilities || {})[cap]; },
  trusted(o){
    if (!o || o === "null") return false;
    if (o === location.origin) return true;
    return ((CMB_DATA.hosting || {}).allowedHostOrigins || []).some(p => p === o || p.startsWith("https://*.") && /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(o) && o.toLowerCase().endsWith(p.slice(9).toLowerCase()));
  },
  hostOrigin(){ const a = location.ancestorOrigins && location.ancestorOrigins[0]; if (a) return a; try { return document.referrer ? new URL(document.referrer).origin : null; } catch (e){ return null; } },
  send(type, data){
    if (this.mode === "managed"){ if (this.platform) try { this.platform.send(type, JSON.parse(JSON.stringify(data === undefined ? null : data))); } catch (e){ /* adapter failed; it reports its own errors */ } return; }
    if (this.mode !== "cowork" || !this.origin) return; try { window.parent.postMessage({source:"cost-model-builder", type, data}, this.origin); } catch (e){ /* host gone */ }
  },
  // One inbound path for both transports. Everything that arrives is validated here or in the function it calls.
  receive(m){
    if (!m || typeof m.type !== "string") return;
    if (m.type === "session.user" && m.data && typeof m.data.name === "string"){ SESSION_USER = {name:m.data.name.slice(0, 120), upn:String(m.data.upn || "").slice(0, 200)}; S.user = SESSION_USER; return void render(); }
    if (m.type === "opportunity.load" && m.data) return void resumeFrom(m.data, "Opened from the opportunity record");
    if (m.type === "opportunity.draft"){ const O = m.data; Store.draft = O && /^CostModelOpportunity\/1\./.test(O.schema || "") ? O : null; return void (S.step === "docs" && render()); }
    if (m.type === "spec.extract.result" && m.data){
      if (S.extracting){ S.pendingAgentSpec = m.data; return; }
      if (!S.spec) S.spec = normaliseSpec(blankSpec(S.files));
      if (agentSpec(m.data)){ S.extracted = true; go("spec"); }
      return;
    }
    if (m.type === "model.generate.result"){ S.generated = true; render(); return void toast("Workbook ready: " + (m.data && typeof m.data.name === "string" ? m.data.name.slice(0, 200) : "")); }
    if (m.type === "guide.answer" && m.data) return void Guide.answer(m.data);
    if (m.type === "platform.ready" && this.mode === "managed"){ this.label(); return void render(); }
    if (m.type === "host.notice" && m.data && typeof m.data.text === "string") toast(m.data.text.slice(0, 300));
  },
  label(){
    const h = $("#hostMode"); h.dataset.mode = this.mode;
    const name = this.platform && typeof this.platform.label === "string" ? this.platform.label.slice(0, 60) : "Managed app";
    h.textContent = {cowork:"Connected to Cowork", untrusted:"Host not recognised", standalone:"Standalone preview", managed:name}[this.mode];
    h.title = this.mode === "untrusted" ? "This page is framed by a site that is not on the allow-list, so it sends nothing to it."
      : this.mode === "managed" ? `Running as a Microsoft managed app. Connected: ${["identity", "store", "extract", "coach", "workbook"].filter(c => this.can(c)).join(", ") || "nothing yet"}.` : "Where this app is running";
  },
  init(){
    if (this.mode === "managed"){
      this.platform = window.CMB_PLATFORM;
      try { Promise.resolve(this.platform.start(m => this.receive(m))).catch(() => { /* adapter reports; the app carries on with what it has */ }); }
      catch (e){ this.platform = null; }
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") Store.save(); });
    }
    else if (this.mode === "cowork"){ const o = this.hostOrigin(); if (this.trusted(o)) this.origin = o; else this.mode = "untrusted"; }
    window.addEventListener("message", e => {
      const m = e.data; if (!this.origin || e.source !== window.parent || e.origin !== this.origin || !m || m.target !== "cost-model-builder") return;
      this.receive(m);
    });
    this.label();
    if (this.mode === "cowork" || this.mode === "managed") this.send("app.ready", {version:"0.1"});
  }
};

/* ---------- Guide: a docked panel that explains whatever the seller points at, plus "Show me" spotlights ---------- */
// Content and the pure logic live in guide.js. Only {open, tourDone} is kept in this browser; helpful votes go with the opportunity.
const GUIDE_KEY = "cmb.guide";
const G = {open:false, tourDone:false, stored:false, cur:null, pinned:false, hist:[], pane:"guide", pending:null, answer:null, hoverT:null, tickT:null};
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const narrow = () => matchMedia("(max-width:760px)").matches;
// On a phone the guide is a sheet that hides while spotlighting, so nothing inside it can be pointed at there.
const onScreen = el => { if (!el || el.closest("[hidden]") || narrow() && el.closest("#guide")) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
const anchorOf = key => document.querySelector(`[data-guide="${key}"]`);
const G_KIND = {step:"This step", q:"Question", field:"Survey sheet", lever:"Price lever", el:"On screen", term:"Word"};
const Guide = {
  init(){
    try { const o = JSON.parse(localStorage.getItem(GUIDE_KEY) || "null"); if (o && typeof o === "object"){ G.stored = true; G.open = !!o.open; G.tourDone = !!o.tourDone; } } catch (e){ /* storage blocked */ }
    if (!G.stored) G.open = !narrow();   // first visit: open beside the sheet; on a phone, the tour points at the Guide button instead
    // Below 1180px the trace is a sticky strip along the bottom; the guide column stops above it.
    const fit = () => {
      const g = $("#guide"), t = $("#trace"), app = $(".app"); if (g.hidden) return;
      if (innerWidth <= 760) return app.style.setProperty("--trace-h", Math.max(0, innerHeight - t.getBoundingClientRect().top) + "px");   // the sheet sits on the trace strip, never over it
      app.style.setProperty("--guide-max", Math.max(240, innerHeight - t.offsetHeight - Math.max(0, g.getBoundingClientRect().top) - 8) + "px");
    };
    this.fit = fit;
    if (window.ResizeObserver) new ResizeObserver(fit).observe($("#trace"));
    addEventListener("scroll", fit, { passive: true }); addEventListener("resize", fit);
    this.apply();
  },
  save(){ try { localStorage.setItem(GUIDE_KEY, JSON.stringify({open:G.open, tourDone:G.tourDone})); } catch (e){ /* storage blocked */ } },
  firstRun(){ if (!G.tourDone) setTimeout(() => { if (!Spot.active && S.step === "docs") Spot.start(GUIDE_TOURS.first, "first"); }, 400); },
  apply(){
    $(".app").classList.toggle("g-open", G.open); $("#guide").hidden = !G.open; $(".side").dataset.pane = G.pane;
    $("#guideBtn").setAttribute("aria-expanded", String(G.open));
    document.querySelectorAll(".sidetog [data-pane]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.pane === G.pane)));
    if (this.fit) requestAnimationFrame(this.fit);
  },
  toggle(on = !G.open, focus = true){
    G.open = on; if (on) G.pane = "guide"; this.apply(); this.save(); logEvent("guide.open", {open:on, step:S.step});
    if (on){ this.render(); if (focus) $("#gTitle").focus(); } else if (focus) $("#guideBtn").focus();
  },
  show(key, push = true, announce = false){
    const e = guideEntry(key); if (!e) return;
    if (push && G.cur && G.cur !== key){ G.hist.push(G.cur); if (G.hist.length > 20) G.hist.shift(); }
    G.cur = key; this.render();
    if (announce) $("#gLive").textContent = `Guide: ${e.t}`;
  },
  follow(target){
    if (!G.open || G.pinned || Spot.active || !target || !target.closest) return;
    const a = target.closest("[data-guide]"); if (!a || a.closest("#guide, #spotPop")) return;
    const k = a.dataset.guide; if (k === G.cur || !guideEntry(k)) return;
    G.cur = k; const n = $("#gAbout"); if (n) n.innerHTML = this.aboutHtml();
  },
  nextHtml(){
    const n = guideNext(); if (!n) return "";
    const showable = n.show && onScreen(anchorOf(n.show)), goes = n.go && (n.go !== S.step || n.q != null);
    const lbl = !goes ? "" : n.q != null ? "Open this question" : `Go to ${((STEPS.find(s => s.id === n.go) || {}).label || n.go).toLowerCase()}`;
    return `<p><b>Next:</b> ${termify(esc(n.t))}</p>${showable || goes ? `<div class="row">${showable ? `<button class="btn" type="button" data-gshow="${n.show}">Show me</button>` : ""}${goes ? `<button class="btn primary" type="button" data-go="${n.go}"${n.q != null ? ` data-gq="${n.q}"` : ""}>${esc(lbl)}</button>` : ""}</div>` : ""}`;
  },
  aboutHtml(){
    const e = guideEntry(G.cur); if (!e) return "";
    const showable = !/^(step|term):/.test(e.key) && onScreen(anchorOf(e.key));
    const rows = [[e.kind === "term" ? "What it means" : "What this is", e.what], ["What to put", e.put], ["Why it matters", e.why], ["Not sure?", e.unsure]].filter(r => r[1]);
    const vote = (S.guideFeedback || []).find(f => f.item === e.src);
    return `<h3 id="gAboutT" tabindex="-1">${esc(e.t)} <span class="g-kind">${G_KIND[e.key.split(":")[0]] || ""}</span></h3>
      <dl>${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${guideHtml(v)}</dd></div>`).join("")}</dl>
      ${e.live ? `<p class="g-live"><b>On this bid:</b> ${guideHtml(e.live)}</p>` : ""}
      <div class="g-tools">${showable ? `<button class="btn" type="button" data-gshow="${e.key}">Show me</button>` : ""}${G.hist.length ? '<button class="btn ghost" type="button" id="gBack">Back</button>' : ""}<button class="btn ghost" type="button" id="gPin" aria-pressed="${G.pinned}" title="Keep this explanation while you click elsewhere">Pin</button></div>
      <div class="g-vote" role="group" aria-label="Did this explanation help?"><span aria-hidden="true">Did this help?</span><button class="btn" type="button" data-ghelp="yes" aria-pressed="${!!vote && vote.helpful}">Yes</button><button class="btn" type="button" data-ghelp="no" aria-pressed="${!!vote && !vote.helpful}">No</button></div>`;
  },
  checkHtml(){
    const L = guideChecklist(S.step);
    return L.length ? L.map(c => `<li class="${c.done ? "done" : ""}"><span class="box" aria-hidden="true"></span><span>${esc(c.t)}<span class="sr">${c.done ? " (done)" : " (to do)"}</span></span></li>`).join("") : '<li><span></span><span class="muted">Nothing to check on this step.</span></li>';
  },
  answerHtml(){
    const A = G.answer; if (!A) return "";
    if (A.busy) return '<p class="g-from">Asking the Bid Coach…</p>';
    const refs = (A.refs || []).filter(k => guideEntry(k)).slice(0, 5), top = A.from === "guide" && refs.length ? guideEntry(refs[0]) : null;
    const body = A.from === "coach" ? A.text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean).map(p => `<p>${esc(p)}</p>`).join("")
      : top ? `<p><b>${esc(top.t)}:</b> ${guideHtml(top.what)}</p>` : '<p>Nothing in the guide matches that. Try one or two plain words, such as "holiday" or "payment terms".</p>';
    const more = refs;
    return `<p class="g-from">${A.from === "coach" ? "From the Bid Coach agent. It explains the model; it doesn't set the price." : `From this guide${A.note ? `. ${esc(A.note)}` : ""}`}</p>${body}
      ${more.length ? `<div class="refs" role="group" aria-label="Open in the guide">${more.map(k => `<button class="btn" type="button" data-gopen="${k}">${esc(guideEntry(k).t)}</button>`).join("")}</div>` : ""}`;
  },
  render(){
    if (!G.open) return;
    const g = $("#guide"), a = document.activeElement, inside = g.contains(a);
    const ask = $("#gAsk"), askV = ask ? ask.value : "", gl = g.querySelector(".g-gloss"), glOpen = gl ? gl.open : false, top = g.scrollTop;
    const fsel = inside && a !== g ? (a.id ? "#" + a.id : ["ghelp", "gshow", "gopen", "term"].map(k => a.dataset[k] != null ? `[data-${k}="${a.dataset[k]}"]` : "").find(Boolean) || null) : null;
    if (!G.pinned && (!G.cur || !guideEntry(G.cur) || /^step:/.test(G.cur) && G.cur !== "step:" + S.step)) G.cur = "step:" + S.step;
    const st = STEPS.find(s => s.id === S.step), idx = STEPS.indexOf(st);
    const terms = Object.keys(GUIDE_T).map(k => [k, GUIDE_T[k].t]).sort((x, y) => x[1].localeCompare(y[1]));
    g.innerHTML = `
      <div class="g-head"><h2 id="gTitle" tabindex="-1">Guide</h2><span class="g-step">Step ${idx + 1} of ${STEPS.length}, ${esc(st.label)}</span><button class="btn ghost" type="button" id="guideClose" aria-label="Close guide">Close</button></div>
      <div class="g-next" id="gNext">${this.nextHtml()}</div>
      <section class="g-about" id="gAbout" aria-labelledby="gAboutT">${this.aboutHtml()}</section>
      <section aria-labelledby="gCheckT"><h3 id="gCheckT" style="margin-bottom:.4rem">On this step</h3><ul class="g-check" id="gCheck">${this.checkHtml()}</ul>
        <div class="g-tools" style="margin-top:.6rem"><button class="btn" type="button" id="gTour">Walk me through this step</button></div></section>
      <details class="g-gloss"${glOpen ? " open" : ""}><summary>Glossary, ${terms.length} words</summary><ul>${terms.map(([k, t]) => `<li><button type="button" class="gterm" data-term="${k}">${esc(t)}</button></li>`).join("")}</ul></details>
      <section class="g-ask" aria-labelledby="gAskL"><label id="gAskL" for="gAsk">Ask a question</label>
        <div class="row"><input type="text" id="gAsk" maxlength="500" autocomplete="off" placeholder="For example, what is factoring?"><button class="btn" type="button" id="gAskBtn">Ask</button></div>
        <span class="xs muted">${Bridge.can("coach") && (Bridge.mode === "managed" || Bridge.origin) ? "The Bid Coach agent answers. Nothing from the documents is sent." : "Answers come from this guide. Once the Bid Coach agent is connected, it answers."}</span>
        <div class="g-answer" id="gAnswer" aria-live="polite">${this.answerHtml()}</div></section>`;
    $("#gAsk").value = askV; g.scrollTop = top;
    if (inside){ const f = fsel && g.querySelector(fsel); (f || $("#gTitle")).focus({preventScroll:true}); }
  },
  tick(){
    clearTimeout(G.tickT);
    G.tickT = setTimeout(() => {
      if (!G.open || !$("#gNext")) return; const a = document.activeElement;
      [["gNext", "nextHtml"], ["gCheck", "checkHtml"], ["gAbout", "aboutHtml"]].forEach(([id, fn]) => { const n = document.getElementById(id); if (n && !n.contains(a)) n.innerHTML = this[fn](); });
    }, 150);
  },
  vote(yes){
    const e = guideEntry(G.cur); if (!e) return;
    S.guideFeedback = (S.guideFeedback || []).filter(f => f.item !== e.src);
    S.guideFeedback.push({item:e.src, helpful:yes, at:new Date().toISOString(), by:(S.user && S.user.name) || "standalone user"});
    logEvent("guide.help", {item:e.src, helpful:yes}); this.render(); Store.queue();
    toast(yes ? "Thanks. Noted." : "Thanks. That tells us which explanations to rewrite.");
  },
  ask(){
    const inp = $("#gAsk"), q = inp.value.trim().slice(0, 500); if (!q){ inp.focus(); return; }
    const coach = Bridge.can("coach") && (Bridge.mode === "managed" || !!Bridge.origin);
    logEvent("guide.ask", {q:q.slice(0, 300), step:S.step, mode:coach ? "coach" : "local"});
    if (!coach) return this.local(q);
    const id = "g" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), sp = S.spec;
    if (G.pending) clearTimeout(G.pending.t);
    G.pending = {id, t:setTimeout(() => { if (G.pending && G.pending.id === id){ G.pending = null; this.local(q, "The Bid Coach didn't reply in time"); } }, 20000)};
    G.answer = {busy:true}; this.renderAnswer();
    Bridge.send("guide.ask", {id, question:q, step:S.step, item:G.cur, context:{sector:sp ? sp.client.sector || null : null, sites:sp ? sp.sites.length : 0, openCritical:sp ? openReds() : 0, hoursMethod:S.answers.hoursMethod ? S.answers.hoursMethod.value : null}});
  },
  local(q, note){ G.answer = {from:"guide", refs:searchGuide(q, 4), note}; this.renderAnswer(); },
  answer(m){   // guide.answer from the host: must match the open request, and only known guide keys become links
    if (!G.pending || !m || m.id !== G.pending.id || typeof m.text !== "string" || !m.text.trim() || m.text.length > 4000) return;
    clearTimeout(G.pending.t); G.pending = null;
    G.answer = {from:"coach", text:m.text, refs:Array.isArray(m.refs) ? m.refs.filter(k => typeof k === "string" && GUIDE.items[k]).slice(0, 5) : []};
    this.renderAnswer();
  },
  renderAnswer(){ const n = $("#gAnswer"); if (n) n.innerHTML = this.answerHtml(); },
  click(e){
    const t = e.target.closest && e.target.closest("button"); if (!t || t.disabled) return false;
    const d = t.dataset;
    if (d.term){ e.preventDefault(); if (!G.open) this.toggle(true, false); if (G.pane !== "guide"){ G.pane = "guide"; this.apply(); } this.show("term:" + d.term, true, true); return true; }
    if (d.gshow){ const en = guideEntry(d.gshow); Spot.start([{sel:`[data-guide="${d.gshow}"]`, t:en ? en.t : "Here", b:en ? en.what : ""}], "show"); logEvent("guide.show", {item:d.gshow}); return true; }
    if (d.gopen){ this.show(d.gopen); const h = $("#gAboutT"); if (h){ h.scrollIntoView({block:"nearest"}); h.focus({preventScroll:true}); } return true; }
    if (d.gq != null){ S.qi = +d.gq; go("questions"); return true; }
    if (d.pane && t.closest(".sidetog")){ G.pane = d.pane; this.apply(); if (d.pane === "guide") this.render(); return true; }
    if (d.ghelp){ this.vote(d.ghelp === "yes"); return true; }
    switch (t.id){
      case "guideBtn": this.toggle(); return true;
      case "guideClose": this.toggle(false); return true;
      case "gTour": Spot.start(GUIDE_TOURS[S.step] || [], S.step); return true;
      case "gBack": if (G.hist.length){ G.cur = G.hist.pop(); this.render(); $("#gAboutT").focus(); } return true;
      case "gPin": G.pinned = !G.pinned; this.render(); return true;
      case "gAskBtn": this.ask(); return true;
      case "spotNext": Spot.next(); return true;
      case "spotBack": Spot.back(); return true;
      case "spotSkip": Spot.end(false); return true;
    }
    return false;
  }
};
// Spotlight: dims the page around one element and explains it. Non-modal: the page stays usable, Esc ends it.
const Spot = {
  active:false, stops:[], i:0, name:"", prev:null, raf:0,
  start(stops, name){
    const ok = stops.map(s => { const sel = [narrow() && s.sm, s.sel, s.alt].filter(Boolean).find(q => onScreen(document.querySelector(q))); return sel ? {...s, sel} : null; }).filter(Boolean);
    if (!ok.length){ toast("There's nothing to point at on this screen yet."); return; }
    const prev = this.active ? this.prev : document.activeElement;
    if (this.active) this.end(false, true);
    Object.assign(this, {stops:ok, i:0, name, active:true, prev});
    $(".app").classList.add("spotting"); $("#spot").hidden = false; $("#spotPop").hidden = false;
    if (name !== "show") logEvent("guide.tour", {tour:name, action:"start"});
    this.step(0);
  },
  step(i){
    const s = this.stops[i], el = s && document.querySelector(s.sel); if (!el) return this.end(false);
    this.i = i; const n = this.stops.length, last = i === n - 1;
    el.scrollIntoView({block:"nearest", inline:"nearest", behavior:reduceMotion() ? "auto" : "smooth"});
    $("#spotPop").innerHTML = `<h2 id="spotT" tabindex="-1">${esc(s.t)}</h2><p>${guideHtml(s.b)}</p>
      <div class="row"><span class="n">${n > 1 ? `${i + 1} of ${n}` : ""}</span>${i > 0 ? '<button class="btn ghost" type="button" id="spotBack">Back</button>' : ""}${n > 1 && !last ? '<button class="btn ghost" type="button" id="spotSkip">Skip tour</button>' : ""}<button class="btn primary" type="button" id="spotNext">${n === 1 ? "Got it" : last ? "Finish" : "Next"}</button></div>`;
    this.place(); setTimeout(() => this.place(), reduceMotion() ? 0 : 380);
    $("#spotT").focus({preventScroll:true});
  },
  place(){
    if (!this.active) return; const s = this.stops[this.i], el = s && document.querySelector(s.sel); if (!el) return;
    const r = el.getBoundingClientRect(), pad = 6, vw = document.documentElement.clientWidth, vh = innerHeight, cl = (v, a, b) => Math.min(Math.max(v, a), b);
    const x = cl(r.left - pad, 2, vw - 6), y = cl(r.top - pad, 2, vh - 6), w = cl(r.right + pad, x + 4, vw - 2) - x, h = cl(r.bottom + pad, y + 4, vh - 2) - y;
    const hole = $("#spotHole"); hole.style.transform = `translate(${x}px,${y}px)`; hole.style.width = w + "px"; hole.style.height = h + "px";
    const pop = $("#spotPop"), pw = pop.offsetWidth, ph = pop.offsetHeight, m = 8;
    if (h > vh * 0.6){   // tall target: sit beside it rather than over it
      const px = x + w + 12 + pw <= vw - m ? x + w + 12 : x - pw - 12 >= m ? x - pw - 12 : null;
      if (px != null){ pop.style.transform = `translate(${px}px,${cl(y + 12, m, vh - ph - m)}px)`; return; }
    }
    let py = y + h + 10; if (py + ph > vh - m) py = y - ph - 10; if (py < m) py = vh - ph - m;
    pop.style.transform = `translate(${cl(r.left, m, vw - pw - m)}px,${Math.max(m, py)}px)`;
  },
  queue(){ if (!this.active) return; cancelAnimationFrame(this.raf); this.raf = requestAnimationFrame(() => this.place()); },
  next(){ if (this.i < this.stops.length - 1) this.step(this.i + 1); else this.end(true); },
  back(){ if (this.i > 0) this.step(this.i - 1); },
  end(finished = false, silent = false){
    if (!this.active) return; this.active = false;
    $(".app").classList.remove("spotting"); $("#spot").hidden = true; const pop = $("#spotPop"); pop.hidden = true; pop.innerHTML = "";
    if (this.name !== "show") logEvent("guide.tour", {tour:this.name, action:finished ? "finish" : "skip"});
    if (this.name === "first"){ G.tourDone = true; Guide.save(); }
    if (!silent && this.prev && document.contains(this.prev)) this.prev.focus({preventScroll:true});
    this.prev = null;
  }
};
window.addEventListener("scroll", () => Spot.queue(), true);
window.addEventListener("resize", () => Spot.queue());

/* ---------- Render + events ---------- */
function render(){
  renderRail();
  STEPS.forEach(s => { document.getElementById("s-" + s.id).hidden = S.step !== s.id; });
  ({docs:renderDocs, spec:renderSpec, questions:renderQuestions, sites:renderSites, price:renderPrice, board:renderBoard, insights:renderInsights, generate:renderGenerate})[S.step]();
  renderTrace();
  $("#oppName").textContent = S.spec ? clientLabel() : "No opportunity loaded";
  $("#oppMeta").textContent = S.spec ? `${S.spec.sites.length.toLocaleString("en-GB")} sites · ${S.spec.term.years}-yr term` : "";
  $("#saveBtn").hidden = !S.extracted; if (!S.extracted) $("#saveState").textContent = "";
  Guide.render(); if (Guide.fit) Guide.fit(); if (Spot.active) requestAnimationFrame(() => Spot.place());
  Store.queue();
}
function addFiles(list){
  S.pack = null; [...list].forEach(f => FILES.set(f.name, f));
  S.files = S.files.filter(f => !f.sample && ![...list].some(x => x.name === f.name)).concat([...list].map(f => ({name:f.name, size:(f.size / 1024 / 1024).toFixed(2) + " MB"})));
  S.extracted = false; render();
}
let rt; const soon = fn => { clearTimeout(rt); rt = setTimeout(fn, 120); };
document.addEventListener("click", e => {
  if (e.target.closest && e.target.closest("#mapDlg")) return;
  if (e.target.id === "fileIn") return;
  const mb = e.target.closest && e.target.closest("[data-map]");
  if (mb && typeof EMap !== "undefined"){ e.preventDefault(); EMap.open(mb.dataset.map || undefined); return; }
  if (e.target.closest("#drop")) return $("#fileIn").click();
  const jump = e.target.closest("[data-jump]");
  if (jump){ e.preventDefault(); const sec = document.getElementById("ins-" + jump.dataset.jump), h = document.getElementById("hi-" + jump.dataset.jump);
    if (sec) sec.scrollIntoView({block:"start", behavior:matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"}); if (h) h.focus({preventScroll:true}); return; }
  const svg = e.target.closest("#insScatter svg");
  if (svg && INS && INS.scatterPts){ const bb = svg.getBoundingClientRect(), x = e.clientX - bb.left, y = e.clientY - bb.top;
    let best = null, bd = 144; INS.scatterPts.forEach(([i, px, py]) => { const d = (px - x) ** 2 + (py - y) ** 2; if (d < bd){ bd = d; best = i; } });
    if (best != null){ S.insSite = best; const p = $("#insSitePick"); if (p) p.value = String(best); document.querySelectorAll("[data-inssite]").forEach(b => b.setAttribute("aria-pressed", "false")); renderInsSite(); }
    return; }
  if (Guide.click(e)) return;
  const b = e.target.closest("button, [data-go]"); if (!b || b.disabled) return;
  if (b.dataset.go) return go(b.dataset.go);
  if (b.dataset.pack){ S = Object.assign(fresh(), {pack:b.dataset.pack, files:PACKS[b.dataset.pack].files.map(f => ({...f, sample:true}))}); return render(); }
  if (b.id === "extractBtn") return extract();
  if (b.id === "resetBtn"){ Store.save(); S = fresh(); lastCharge = null; FILES.clear(); return render(); }   // the saved copy stays, so Start over can be undone with Resume
  if (b.id === "resumeBtn"){ const O = Store.read(); return O ? void resumeFrom(O, "Resumed") : render(); }
  if (b.id === "discardBtn"){ if (!S.confirmDiscard){ S.confirmDiscard = true; return render(); } S.confirmDiscard = false; const where = Store.where(); Store.clear(); toast(`Saved copy deleted ${where.replace(/^in /, "from ")}.`); return render(); }
  if (b.id === "saveBtn" || b.id === "dlOpp"){ const O = saveOpportunity(); logEvent("opportunity.export", {sites:O.sites}); return download(`${fileSafe(clientLabel())} - opportunity.json`, JSON.stringify(O, null, 1), "application/json"); }
  if (b.id === "soBtn"){
    const chk = $("#soChk"), nm = $("#soName"), err = $("#soErr"), name = nm.value.trim();
    if (!chk.checked){ err.textContent = "Tick the box to confirm you have checked the warnings."; chk.focus(); return; }
    if (!name){ err.textContent = "Add your name for the approval record."; nm.setAttribute("aria-invalid", "true"); nm.focus(); return; }
    try { signOff(name); } catch (x){ err.textContent = x.message; return; }
    toast(`Signed off at ${gbp(S.signoff.weeklyCharge, 2)} a week.`); return render();
  }
  if (b.id === "soUndo"){ logEvent("signoff.withdrawn", {by:S.signoff && S.signoff.by}); S.signoff = null; return render(); }
  if (b.dataset.fb){ setFeedback(qs()[S.qi].id, {clear:b.dataset.fb === "yes"}); renderQuestions(); const n = $("#fbNote"); return void (n ? n.focus() : document.querySelector(`[data-fb="${b.dataset.fb}"]`).focus()); }
  if (b.dataset.q != null){ S.qi = +b.dataset.q; return render(); }
  if (b.id === "qSave") return saveAnswer(false);
  if (b.id === "qAccept") return saveAnswer(true);
  if (b.id === "qPrev"){ S.qi = Math.max(0, S.qi - 1); return render(); }
  if (b.id === "acceptAll"){ qs().forEach(q => { if (!q.critical && !S.answers[q.id]) S.answers[q.id] = {value:q.def, source:q.defSrc}; }); toast("Suggested values recorded for non-critical questions."); return render(); }
  if (b.dataset.method){ S.answers.hoursMethod = {value:b.dataset.method, source:"ans"}; return render(); }
  if (b.id === "mgAdd"){ const R = compute(); S.overrides.mgmt = JSON.parse(JSON.stringify(R.T.margin.roles)).concat([{role:"New role", fte:1, salary:30000}]); return render(); }
  if (b.id === "mgReset"){ delete S.overrides.mgmt; return render(); }
  if (b.dataset.mgdel != null){ const R = compute(); S.overrides.mgmt = JSON.parse(JSON.stringify(R.T.margin.roles)); S.overrides.mgmt.splice(+b.dataset.mgdel, 1); return render(); }
  if (b.id === "pgPrev"){ S.sitePage--; return render(); } if (b.id === "pgNext"){ S.sitePage++; return render(); }
  if (b.id === "csvLoad") return loadCsv();
  if (b.id === "launch"){ const n = $("#runName").value.trim(); S.runs.push(snapshot(n)); toast(`${S.runs.at(-1).name} launched: ${gbpK(S.runs.at(-1).annual)} a year.`); return render(); }
  if (b.dataset.restore != null){ const r = S.runs[+b.dataset.restore]; S.answers = JSON.parse(JSON.stringify(r.state.answers)); S.overrides = JSON.parse(JSON.stringify(r.state.overrides)); toast(`Restored ${r.name}.`); return render(); }
  if (b.dataset.view){ S.view = b.dataset.view; if (S.view === "internal") S.visited.internalView = true; return render(); }
  if (b.dataset.inssite){ S.insSite = b.dataset.inssite; document.querySelectorAll("[data-inssite]").forEach(x => x.setAttribute("aria-pressed", String(x === b))); const p = $("#insSitePick"); if (p) p.value = ""; return renderInsSite(); }
  if (b.id === "insCopy2") return copySummary();
  if (b.id === "insDl"){ logEvent("insights.download", {}); S.visited.insCopy = true; Guide.tick(); return download(`${fileSafe(clientLabel())} - what the model tells us.txt`, insightsText(INS && INS.I), "text/plain"); }
  if (b.id === "genBtn") return generate();
  if (b.id === "dlJson") return download("model-payload.json", JSON.stringify(payload(), null, 2), "application/json");
  if (b.id === "dlSites"){ const P = payload(); return download("site-pricing.csv", csv([["ID","Site","Region","Format","Sq ft","Hours/wk","Source","Pay £/hr","Headcount","Weekly charge £"]].concat(P.sites.map(s => [s.id, s.name, s.region, s.format, s.sqft, s.hoursPerWeek, s.hoursSource, s.payRate, s.headcount, s.expectedWeeklyCharge]))), "text/csv"); }
  if (b.id === "dlLog"){ const P = payload(); return download("assumptions-log.csv", csv([["Input","Question","Value","Source","Citation"]].concat(P.assumptionsLog.map(l => [l.input, l.question || "", l.value, l.source, l.citation ? `${l.citation.doc}${loc(l.citation)}` : ""]))), "text/csv"); }
  });
document.addEventListener("input", e => {
  const t = e.target; if (t.closest && t.closest("#mapDlg")) return;
  if (t.dataset.lever != null){
    const L = LEVERS[+t.dataset.lever], v = Number(t.value); if (t.value === "" || !Number.isFinite(v)) return;
    leverSet(L, v);
    const i = t.dataset.lever; [$("#lv" + i), $("#lv" + i + "n")].forEach(x => { if (x !== t) x.value = v; });
    renderTrace(); soon(() => { const f = document.activeElement && document.activeElement.id; renderPrice(); renderRail(); const el = f && document.getElementById(f); if (el) el.focus(); });
  }
  if (t.dataset.site){ S.overrides.siteHours = S.overrides.siteHours || {}; S.overrides.siteHours[t.dataset.site] = Number(t.value); renderTrace(); }
  if (t.dataset.curve){ const v = Number(t.value); if (t.value !== "" && Number.isFinite(v) && v > 0){ S.overrides.curve = Object.assign({}, S.overrides.curve || {}, {[t.dataset.curve]: v}); renderTrace(); } }
  if (t.dataset.flat){ S.overrides.flat = Object.assign({}, FLAT, S.overrides.flat || {}, {[t.dataset.flat]: Number(t.value) || 0}); renderTrace(); }
  if (t.dataset.mgmt){ const [i, k] = t.dataset.mgmt.split("."), R = compute(); S.overrides.mgmt = JSON.parse(JSON.stringify(R.T.margin.roles)); S.overrides.mgmt[+i][k] = k === "role" ? t.value : Number(t.value) || 0; renderTrace(); }
  if (t.id === "mgOn"){ const v = Number(t.value); if (t.value !== "" && Number.isFinite(v)){ S.overrides.mgmtOnCost = v; renderTrace(); } }
  if (t.id === "siteFilter"){ S.siteFilter = t.value; S.sitePage = 0; soon(() => { renderSites(); const f = $("#siteFilter"); f.focus(); f.setSelectionRange(f.value.length, f.value.length); }); }
  if (t.id === "iw"){ S.internal.wageMult = Number(t.value) || 1; soon(() => { renderBoard(); renderTrace(); $("#iw").focus(); }); }
  if (t.id === "iu"){ S.internal.uniformsPct = Number(t.value) || 0; soon(() => { renderBoard(); renderTrace(); $("#iu").focus(); }); }
  if (t.id === "qv"){ t.removeAttribute("aria-invalid"); $("#qerr").textContent = ""; }
  if (t.id === "soName"){ t.removeAttribute("aria-invalid"); $("#soErr").textContent = ""; }
});
document.addEventListener("change", e => {
  const t = e.target; if (t.closest && t.closest("#mapDlg")) return;
  if (t.id === "fileIn" && t.files.length) intake(t.files);
  if (t.id === "insSitePick" && t.value !== ""){ S.insSite = +t.value; document.querySelectorAll("[data-inssite]").forEach(x => x.setAttribute("aria-pressed", "false")); renderInsSite(); }
  if (t.id === "fbNote") setFeedback(qs()[S.qi].id, {clear:false, note:t.value.trim().slice(0, 300)});
  if (t.id === "siteFile" && t.files.length) loadSiteFile(t.files[0]);
  if (t.dataset.spec) specChanged(t);
  if (t.dataset.site || t.dataset.curve || t.dataset.flat) renderSites();
  if (t.dataset.mgmt || t.id === "mgOn") renderPrice();
});
document.addEventListener("keydown", e => {
  if (e.target.closest && e.target.closest("#mapDlg")) return;
  if (e.target.id === "drop" && (e.key === "Enter" || e.key === " ")){ e.preventDefault(); $("#fileIn").click(); }
  if (e.target.id === "qv" && e.key === "Enter"){ e.preventDefault(); saveAnswer(false); }
  if (e.target.id === "gAsk" && e.key === "Enter"){ e.preventDefault(); Guide.ask(); }
  if (e.key === "Escape" && Spot.active){ e.preventDefault(); Spot.end(false); return; }
  if (e.key === "Escape" && G.open && narrow() && e.target.closest && e.target.closest("#guide")){ e.preventDefault(); Guide.toggle(false); return; }
  if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && !e.target.isContentEditable){ e.preventDefault(); Guide.toggle(); }
});
const pgHi = k => { const g = document.querySelector(".pgrid"); if (!g) return; if (k) g.dataset.hi = k; else delete g.dataset.hi; };
document.addEventListener("pointerover", e => { if (e.pointerType !== "mouse") return; const tr = e.target.closest && e.target.closest(".plist tbody tr[data-k]"); pgHi(tr && tr.dataset.k);
  // Chrome replays pointer events when the page changes under a still cursor; only a real move should take over from keyboard focus.
  if (e.clientX === G.px && e.clientY === G.py) return; G.px = e.clientX; G.py = e.clientY;
  clearTimeout(G.hoverT); const t = e.target; if (G.open && !G.pinned) G.hoverT = setTimeout(() => Guide.follow(t), 450); });
document.addEventListener("focusin", e => { const tr = e.target.closest && e.target.closest(".plist tbody tr[data-k]"); if (tr) pgHi(tr.dataset.k); Guide.follow(e.target); });
document.addEventListener("focusout", e => { if (e.target.closest && e.target.closest(".plist tbody tr[data-k]")) pgHi(null); });
["dragenter", "dragover"].forEach(ev => document.addEventListener(ev, e => { const d = e.target.closest && e.target.closest("#drop"); if (d){ e.preventDefault(); d.classList.add("over"); } }));
["dragleave", "drop"].forEach(ev => document.addEventListener(ev, e => { const d = e.target.closest && e.target.closest("#drop"); if (d){ e.preventDefault(); d.classList.remove("over"); if (ev === "drop" && e.dataTransfer.files.length) intake(e.dataTransfer.files); } }));
function loadCsv(){
  const txt = $("#csvIn").value, err = $("#csvErr");
  if (!txt.trim()){ err.textContent = "Paste at least one site row."; $("#csvIn").setAttribute("aria-invalid", "true"); return; }
  const {rows, delim} = splitDelimited(txt), {sites, rep} = importRows(rows, "Pasted site list", delim);
  if (!sites.length){ err.textContent = `No sites loaded. ${rep.bad.slice(0, 6).map(b => `Line ${b.line}: ${b.reason}.`).join(" ")} Each row needs a site name and a floor area or weekly hours.`; $("#csvIn").setAttribute("aria-invalid", "true"); S.importReport = rep; return; }
  $("#csvIn").removeAttribute("aria-invalid"); err.textContent = "";
  applySites(sites, rep, `${sites.length} sites pasted by the sales lead.`);
  toast(`${plural(sites.length, "site")} loaded${rep.bad.length ? `; ${plural(rep.bad.length, "line")} need fixing` : ""}.`); render();
}
async function loadSiteFile(file){
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  try {
    let best = null;
    if (ext === "xlsx"){ for (const rows of await readXlsx(file)){ const r = importRows(rows, file.name, null); if (r.sites.length && (!best || r.sites.length > best.sites.length)) best = r; } }
    else { const {rows, delim} = splitDelimited(await file.text()); best = importRows(rows, file.name, delim); }
    if (!best || !best.sites.length){ toast(`No site rows found in ${file.name}.`); if (best) { S.importReport = best.rep; renderSites(); } return; }
    applySites(best.sites, best.rep, `${best.sites.length} sites read from ${file.name}.`);
    toast(`${plural(best.sites.length, "site")} loaded from ${file.name}.`); render();
  } catch (e){ toast(`${file.name} could not be read (${e.message}).`); }
}Bridge.init(); Guide.init(); render(); Guide.firstRun();
