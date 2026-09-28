/* Cost Model Builder engine: questions, pricing, checks, site importer and payload. No DOM access.
   Loaded after data/reference-data.js and before the UI script. It reads the shared state S at call time,
   so the same file runs in the browser, in the Cowork iframe and in the node harness (tools/harness.mjs). */
"use strict";
const ENGINE_VERSION = "3.0.0";
/* ---------- Reference data (from data/reference-data.js). Verify the rate card before live use. ---------- */
const RATECARDS = CMB_DATA.rateCards;
const RATECARD = Object.assign({label:"", future:false, why:""}, CMB_DATA.rateCardCommon, RATECARDS[RATECARDS.length - 1]);
// ISO dates are parsed as local midnight; new Date("YYYY-MM-DD") is UTC and shifts a month boundary in BST.
function localDate(v){
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ""));
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : (v ? new Date(v) : null);
}
function pickRateCard(start){
  const last = RATECARDS[RATECARDS.length - 1];
  const d = start ? localDate(start) : null;
  if (!d || isNaN(d)) return {card:last, future:false, why:"no start date, so the latest card is used"};
  const counts = RATECARDS.map(() => 0); let unpublished = 0;
  const lastEnd = localDate(last.from); lastEnd.setFullYear(lastEnd.getFullYear() + 1);
  for (let k = 0; k < 12; k++){
    const m = new Date(d.getFullYear(), d.getMonth() + k, 1);
    if (m >= lastEnd){ unpublished++; continue; }
    let idx = -1; RATECARDS.forEach((c, i) => { if (localDate(c.from) <= m) idx = i; });
    if (idx < 0) idx = 0; counts[idx]++;
  }
  let best = 0; counts.forEach((c, i) => { if (c > counts[best]) best = i; });
  if (unpublished > counts[best]) return {card:last, future:true, why:`start ${d.toLocaleDateString("en-GB", {month:"short", year:"numeric"})} is after the latest published card`};
  return {card:RATECARDS[best], future:false, why:`in force for ${counts[best]} of the first 12 months`};
}
function syncRateCard(){
  const r = pickRateCard(S && S.spec ? S.spec.term.start : null);
  Object.assign(RATECARD, CMB_DATA.rateCardCommon, r.card, {future:r.future, why:r.why}, (S && S.overrides && S.overrides.rc) || {});
  RATECARD.label = `Rate card ${RATECARD.id}`;
}
// Benchmarks from the four prior BB models in C:\CModels (Inditex, Asda, Currys, Primark)
const BENCH = CMB_DATA.bench;
// Size curve: hours = a × sq ft^b × service intensity. Leave-one-model-out results are in STRESS-TEST-REVIEW.md.
const CURVE = CMB_DATA.curve;
const FLAT = CMB_DATA.flat;
const MACH_RATE = CMB_DATA.machRate;
const COBOT = CMB_DATA.cobot;
const APPROVAL = CMB_DATA.approval, QDEF = CMB_DATA.questionDefaults;
const hphCurve = h => { const c = CMB_DATA.headcount.curve; return Math.min(c.max, Math.max(c.min, c.a * Math.pow(Math.max(1, h), c.b))); };
const flatHead = sp => isGrocery(sp) ? CMB_DATA.headcount.grocery : CMB_DATA.headcount.standard;
const cobotWk = () => COBOT.cost / COBOT.lifeWks + COBOT.serviceWk + COBOT.cost * 0.05 / 52;
const MGMT = CMB_DATA.management;
const WORDNUM = {a:1, an:1, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10};
const ORDNUM = {first:1, second:2, third:3, fourth:4, fifth:5, sixth:6, seventh:7};
const isGrocery = sp => /grocer|supermarket|food/i.test((sp && sp.client.sector) || "");
const isLondon = s => /london/i.test(s.region || "");
let uidSeq = 0; const nextUid = () => "u" + (++uidSeq);

/* ---------- Gap analysis → question set (rules, not the LLM) ---------- */
function buildQuestions(sp){
  if (!sp) return [];
  syncRateCard();
  const n = sp.sites.length, hasClientHours = sp.sites.some(s => s.clientHours != null), hasSqft = sp.sites.some(s => s.sqft);
  const missing = sp.sites.filter(s => s.clientHours == null).length, fs = sp.fieldSrc || {};
  const src = (path, found) => fs[path] === "ans" ? "ans" : found ? "doc" : "def";
  const q = [];
  if (n){
    q.push({id:"hoursMethod", group:"Hours", critical:true, impact:5,
      text: hasClientHours ? (missing ? `The client gave hours for ${n - missing} of ${n} sites. Price on those hours?` : "The client gave weekly hours for every site. Price on those hours?")
                           : "The site list has floor areas but no weekly hours. How should we set hours?",
      why: hasClientHours ? `Pricing on the client's hours keeps the bid compliant.${missing ? ` The ${missing} sites without hours are filled at the client's own sq ft per hour for that format (stamped EST).` : ""} Recalculating is a separate, costed alternative (Currys ran COMPLIANT and ALT scenarios).`
                          : "The size curve turns floor area into hours using the priced hours of past bids. It held within ±7% for grocery, value fashion and health & beauty, but fashion flagships ran about 1.8× the curve. Set the service intensity next.",
      type:"choice", options: hasClientHours
        ? [{v:"client", l: missing ? "Use client hours; fill the gaps at the client's density" : "Use client hours as given"}, {v:"productivity", l:"Recalculate every site from floor area (alternative bid)"}, {v:"flat", l:"Flat hours per format"}]
        : (hasSqft ? [{v:"productivity", l:"Size curve from past bids (sq ft → hours)"}, {v:"flat", l:"Flat hours per format (enter on Sites & hours)"}] : [{v:"flat", l:"Flat hours per format (enter on Sites & hours)"}]),
      def: hasClientHours ? "client" : hasSqft ? "productivity" : "flat", defSrc: hasClientHours ? "doc" : "bm"});
    const m = S.answers.hoursMethod && S.answers.hoursMethod.value;
    if (hasSqft && (!hasClientHours || m === "productivity")) q.push({id:"intensity", group:"Hours", critical:!hasClientHours, impact:5,
      text:"What service intensity does this spec ask for, compared with past bids?",
      why:"This multiplies the size curve. Value fashion and grocery priced on the curve (1.0). Health & beauty and pharmacy ran a little above it. Fashion flagships with high presentation standards ran about 1.8×. Check the frequency schedule in the spec.",
      type:"choice", options:[{v:"0.8", l:"Light · 0.8× (offices, low footfall)"}, {v:"1", l:"Standard · 1.0× (value retail, grocery)"}, {v:"1.35", l:"Enhanced · 1.35× (health & beauty, pharmacy)"}, {v:"1.75", l:"Premium · 1.75× (fashion flagship)"}],
      def:"1", defSrc:"bm"});
    if (hasClientHours && (m || "client") === "client") q.push({id:"hoursChallenge", group:"Hours", impact:4,
      text:"Price below the client's hours? Enter the hours challenge as a %.",
      why:`Leave 0 for a compliant bid on the client's hours. Past bid teams priced under them as an alternative: Currys −12% (the ALT scenario) and Asda −15% (ELI-engineered hours). The cut is applied to client and gap-filled hours before any minimum-hours lift. Above ${APPROVAL.maxHoursChallengePct}% needs commercial director approval.`,
      type:"number", unit:"%", min:0, max:30, step:0.5, def:0, defSrc:"def"});
  }
  const lw = sp.livingWage;
  q.push({id:"payBasis", group:"Pay", critical:true, impact:5, text:"What pay floor applies to cleaning operatives?",
    why: lw ? `The spec says: ${lw === "RLW" ? "the Real Living Wage (London Living Wage in London)" : "the National Living Wage"}. ${RATECARD.label}: NLW £${RATECARD.NLW}, RLW £${RATECARD.RLW}, LLW £${RATECARD.LLW}.`
            : `The spec doesn't mention the Real Living Wage. Past bids paid an average of £${BENCH.payRate.lo}–£${BENCH.payRate.hi}/hr. ${RATECARD.label}: NLW £${RATECARD.NLW}, RLW £${RATECARD.RLW}, or £${RATECARD.LLW} in London.`,
    cite: sp.lwCite, type:"choice", options:[{v:"NLW", l:`National Living Wage £${RATECARD.NLW}`}, {v:"RLW", l:`Real Living Wage £${RATECARD.RLW} (London £${RATECARD.LLW})`}],
    def: lw === "RLW" ? "RLW" : "NLW", defSrc: lw ? src("livingWage", !!sp.lwCite) : "def"});
  q.push({id:"payPremium", group:"Pay", impact:4, text:"Pay above the floor, in pence per hour?",
    why:"Use this for supervisor blend, retention or a regional market premium. It is applied to every hour. Past bids ran 0–68p (Asda paid £13.10 / £14.10 against the NLW).", type:"number", unit:"p/hr", min:0, max:200, step:0.1, def:0, defSrc:"def"});
  const grocer = isGrocery(sp);
  const tupeN = num(sp.commercial.tupeHeads), hbDef = tupeN ? "tupe" : CMB_DATA.headcount.defaultBasis[grocer ? "grocery" : "standard"];
  const hb = S.answers.headBasis ? S.answers.headBasis.value : hbDef, HCV = CMB_DATA.headcount.curve;
  q.push({id:"headBasis", group:"Pay", impact:3, text:"How should headcount be set at each site?",
    why:`Headcount drives NI (each operative has their own threshold), uniforms and vetting. A TUPE list is the best evidence. Otherwise past bids ran ${BENCH.hoursPerHead.lo}–${BENCH.hoursPerHead.hi} hrs per operative, longer at bigger sites: the past-bid curve gives about ${hphCurve(10).toFixed(0)} hrs each at a 10-hr site and ${hphCurve(100).toFixed(0)} at a 100-hr site.`,
    cite: sp.commercial.tupeCite, type:"choice", options:[...(tupeN ? [{v:"tupe", l:`Match the TUPE list (${tupeN.toLocaleString("en-GB")} operatives)`}] : []), {v:"curve", l:"Scale with site hours (past-bid curve)"}, {v:"flat", l:"One figure for every site"}],
    def: hbDef, defSrc: tupeN ? src("commercial.tupeHeads", !!sp.commercial.tupeCite) : "bm"});
  if (hb === "flat") q.push({id:"hoursPerHead", group:"Pay", impact:3, text:"Average contracted hours per operative per week?",
    why:`This sets headcount, which drives NI, uniforms and vetting. Past bids ranged from ${BENCH.hoursPerHead.lo} (small-store estates) to ${BENCH.hoursPerHead.hi} (large grocery). ${grocer ? "Grocery estates run long shifts, so the suggestion is 24." : ""}`,
    type:"number", unit:"hrs", min:4, max:40, step:0.1, def: grocer ? CMB_DATA.headcount.grocery : CMB_DATA.headcount.standard, defSrc:"bm"});
  q.push({id:"headRounding", group:"Pay", impact:2, text:"How should each site's headcount be rounded?",
    why:"Headcount is worked out per site, and it moves NI because each operative gets their own NI threshold. The four completed models match rounding to the nearest operative. Some bid teams round up, so a site gets another operative as soon as its hours go past a whole contract.",
    type:"choice", options:[{v:"nearest", l:"To the nearest operative"}, {v:"up", l:"Up to a whole operative"}], def:"nearest", defSrc:"bm"});
  q.push({id:"holiday", group:"On-costs", impact:3, text:"Holiday cover as a % of wages and NI?",
    why:`Past bids ranged from ${BENCH.holiday.lo}% to ${BENCH.holiday.hi}%. SSP ${BENCH.ssp.lo}–${BENCH.ssp.hi}%, pension ${BENCH.pension.lo}–${BENCH.pension.hi}% and training ${BENCH.training.lo}–${BENCH.training.hi}% use benchmark mid-points. You can change them on Price build.`,
    type:"number", unit:"%", min:0, max:15, step:0.01, def:QDEF.holiday, defSrc:"bm"});
  if (sp.commercial.paymentDays > 30) q.push({id:"factoring", group:"Commercial", critical:true, impact:4,
    text:`Payment terms are ${sp.commercial.paymentDays} days. How do we fund the working capital?`,
    why:"Asda priced invoice factoring at 1.3% of revenue on long terms. A cost-of-capital allowance of about 0.6% suits 45-day terms. Absorbing long terms with no allowance erodes margin.", cite: sp.commercial.payCite,
    type:"choice", options:[{v:"1.3", l:"Invoice factoring at 1.3%"}, {v:"0.6", l:"Cost of capital allowance 0.6%"}, {v:"0", l:"Absorb (no allowance)"}],
    def: sp.commercial.paymentDays >= 60 ? "1.3" : "0.6", defSrc:"bm"});
  if (sp.commercial.credits) q.push({id:"credits", group:"Commercial", impact:3, text:"The client credits undelivered hours. What delivery-risk allowance should we add?",
    why:"Absence and vacancy that aren't backfilled become credits. Internal views of past bids assumed 0.5–3% wage under-spend. This allowance keeps that risk out of the margin.",
    cite: sp.commercial.credCite, type:"number", unit:"% of labour", min:0, max:5, step:0.1, def:1.0, defSrc:"def"});
  q.push({id:"materials", group:"Consumables", impact:2, text:"Materials and consumables, in £ per labour hour?",
    why:`Past bids ranged from £${BENCH.materials.lo} to £${BENCH.materials.hi}/hr. Use the top of the range where the spec asks for washroom consumables.`, type:"number", unit:"£/hr", min:0, max:1, step:0.01, def:QDEF.materials, defSrc:"bm"});
  const eqDoc = sp.equipment.clientSupplied != null;
  q.push({id:"machinery", group:"Equipment", critical:true, impact:4, text:"Who supplies cleaning machinery, and how heavy is the kit?",
    why:`Machinery is priced per labour hour: standard retail kit £${MACH_RATE.standard}/hr (Currys £0.27, Inditex £0.31, Primark £0.39), a scrubber-dryer and ride-on fleet £${MACH_RATE.fleet}/hr (grocery), or £${MACH_RATE.client}/hr for repairs and small kit where the client supplies equipment. You can set the exact rate on Price build.`,
    cite: sp.equipment.eqCite, type:"choice",
    options:[{v:"standard", l:`We supply standard kit (£${MACH_RATE.standard}/hr)`}, {v:"fleet", l:`We supply a scrubber-dryer and ride-on fleet (£${MACH_RATE.fleet}/hr)`}, {v:"client", l:`Client supplies equipment (£${MACH_RATE.client}/hr)`}],
    def: sp.equipment.clientSupplied ? "client" : grocer ? "fleet" : "standard", defSrc: eqDoc ? src("equipment", !!sp.equipment.eqCite) : grocer ? "bm" : "def"});
  if (sp.equipment.cobots) q.push({id:"cobots", group:"Equipment", impact:4, text:"The spec invites autonomous cleaning. Add cobots at large stores?",
    why:`Asda-style cobots cost about £${(COBOT.cost / 1000).toFixed(1)}k per unit over 5 years (£${cobotWk().toFixed(0)}/wk with service and finance) and are assumed to save 12% of hours at large stores.`,
    cite: sp.equipment.cobotCite, type:"choice", options:[{v:"1", l:"Yes, one cobot per large store"}, {v:"0", l:"No cobots"}], def:"1", defSrc: src("cobots", !!sp.equipment.cobotCite)});
  q.push({id:"mgmtRatio", group:"Management", impact:3, text:"How many weekly labour hours per area manager?",
    why:"This sets the suggested area-manager FTE (at least one per 85 sites). Past bids ran 1,400 (Currys, many small stores) to 4,600 (Primark). You can edit the full management structure on Price build.",
    type:"number", unit:"hrs/manager", min:300, max:8000, step:50, def:MGMT.hoursPerAreaManager, defSrc:"bm"});
  if (sp.service.tradingShare) q.push({id:"unsocial", group:"Pay", impact:2,
    text:`${sp.service.tradingShare[0]}–${sp.service.tradingShare[1]}% of hours must fall in trading time. What premium applies to the out-of-hours share?`,
    why:"Early and late shifts often carry a premium. Enter 0 if your contracts don't pay one.", cite: sp.service.tradeCite, type:"number", unit:"%", min:0, max:25, step:0.5, def:0, defSrc:"def"});
  if (sp.commercial.rebate) q.push({id:"rebate", group:"Commercial", critical:true, impact:4, text:"The client invites an upfront rebate. Include one?",
    why:"A rebate is recovered evenly over the initial term, so it raises the weekly charge.", cite: sp.commercial.rebCite, type:"choice",
    options:[{v:"0", l:"No rebate"}, {v:String(sp.commercial.rebate), l:`£${(sp.commercial.rebate/1000).toFixed(0)}k, recovered over the term`}], def:"0", defSrc:"def"});
  q.push({id:"overheads", group:"Margin", impact:4, text:"Central overhead recovery (%)?",
    why:`Past bids ranged from ${BENCH.overheads.lo}% to ${BENCH.overheads.hi}%. Public liability defaults to ${BENCH.pl}% and can be changed on Price build.`, type:"number", unit:"%", min:0, max:6, step:0.005, def:QDEF.overheads, defSrc:"bm"});
  q.push({id:"profit", group:"Margin", critical:true, impact:5, text:"Target profit (%) for this bid?",
    why:`Past bids ranged from ${BENCH.profit.lo}% (Inditex) to ${BENCH.profit.hi}% (Asda). This should be the commercial lead's call, not a default.`, type:"number", unit:"%", min:0, max:12, step:0.01, def:3.0, defSrc:"bm"});
  return q.sort((a,b) => (b.critical - a.critical) || (b.impact - a.impact));
}
const qs = () => buildQuestions(S.spec);
function val(id){ const a = S.answers[id]; if (a) return a.value; const q = qs().find(x => x.id === id); return q ? q.def : undefined; }
function srcOf(id){ const a = S.answers[id]; if (a) return a.source; const q = qs().find(x => x.id === id); return q ? q.defSrc : "def"; }
function openReds(){ return qs().filter(q => q.critical && !S.answers[q.id]).length; }
/* ---------- Deterministic pricing engine (mirrors the BB template) ---------- */
const OC_DEFAULT = CMB_DATA.onCostDefaults;
function num(v){ const n = Number(v); return Number.isFinite(n) ? n : 0; }
const half = h => Math.round(h * 2) / 2;
function hoursContext(){
  const sp = S.spec, dens = {}, all = [0, 0];
  sp.sites.forEach(s => { if (s.clientHours != null && s.clientHours > 0 && s.sqft){ const d = dens[s.format] = dens[s.format] || [0, 0, 0]; d[0] += s.sqft; d[1] += s.clientHours; d[2]++; all[0] += s.sqft; all[1] += s.clientHours; } });
  const cv = S.overrides.curve || {};
  const m = val("hoursMethod");
  return {m, challenge: m === "client" ? num(val("hoursChallenge")) / 100 : 0, minH: sp.service.minHours || 0, flat: S.overrides.flat || FLAT, intensity: cv.intensity != null ? cv.intensity : (num(val("intensity")) || 1),
    office: cv.office || CURVE.officeSqftPerHr, curveSrc: cv.intensity != null ? "ans" : S.answers.intensity ? S.answers.intensity.source : "bm",
    fill: s => { const d = dens[s.format]; if (d && d[2] >= 3) return d[0] / d[1]; return all[1] ? all[0] / all[1] : null; }};
}
function curveHours(s, cx){ return s.format === "Office" ? s.sqft / cx.office : CURVE.a * Math.pow(s.sqft, CURVE.b) * cx.intensity; }
function siteHours(s, cx){
  cx = cx || hoursContext();
  const ov = S.overrides.siteHours && S.overrides.siteHours[s.uid];
  if (ov != null) return {h:num(ov), src:"ans", lifted:false};
  let h, src;
  if (cx.m === "flat"){ h = cx.flat[s.format]; src = S.overrides.flat ? "ans" : "def"; }
  else if (cx.m === "client" && s.clientHours != null){ h = s.clientHours; src = "doc"; }
  else if (cx.m === "client" && s.sqft && cx.fill(s)){ h = half(s.sqft / cx.fill(s)); src = "est"; }
  else if (s.sqft){ h = half(curveHours(s, cx)); src = cx.curveSrc; }
  else if (s.clientHours != null){ h = s.clientHours; src = "doc"; }
  else { h = cx.flat[s.format]; src = "def"; }
  if (cx.challenge && (src === "doc" || src === "est")) h = half(h * (1 - cx.challenge));
  let lifted = false; if (h < cx.minH){ h = cx.minH; lifted = true; }
  return {h, src, lifted};
}
function payRate(s){
  const basis = val("payBasis"), base = basis === "RLW" ? (isLondon(s) ? RATECARD.LLW : RATECARD.RLW) : RATECARD.NLW;
  return base + num(val("payPremium")) / 100;
}
function mgmtDefaults(H, n){
  const ratio = Math.max(300, num(val("mgmtRatio")) || MGMT.hoursPerAreaManager), r1 = x => Math.round(x * 10) / 10;
  const roles = [{role:"Account Director", fte:r1(Math.min(1, Math.max(0.25, n / 450 + H / 40000))), salary:85000}];
  if (H > 40000) roles.push({role:"Regional Director", fte:Math.max(1, Math.round(H / 35000)), salary:76500}, {role:"Regional Support Manager", fte:Math.max(1, Math.round(H / 17000)), salary:46000});
  roles.push({role:"Area Manager", fte:Math.max(1, r1(Math.max(H / ratio, n / 85))), salary:34000});
  const adm = n >= 200 ? 1 : n >= 100 ? 0.5 : 0; if (adm) roles.push({role:"Contract Administrator", fte:adm, salary:28000});
  return roles;
}
const plPct = () => S.overrides.pl != null ? S.overrides.pl : BENCH.pl;
const machRate = () => S.overrides.machRate != null ? S.overrides.machRate : (MACH_RATE[val("machinery")] ?? MACH_RATE.standard);
const mgmtOnCost = () => S.overrides.mgmtOnCost != null ? S.overrides.mgmtOnCost : MGMT.onCostPct;
function compute(){
  if (!S.spec || !S.spec.sites.length) return null;
  syncRateCard();
  const sp = S.spec, oc = Object.assign({}, OC_DEFAULT, S.overrides.oc || {}), cx = hoursContext();
  const hol = num(val("holiday")) / 100, roundUp = val("headRounding") === "up", hb = val("headBasis");
  const mat = num(val("materials")), credit = num(val("credits")) / 100, unsocial = num(val("unsocial")) / 100;
  const tradeOut = sp.service.tradingShare ? 1 - (sp.service.tradingShare[0] + sp.service.tradingShare[1]) / 200 : 0;
  const cobots = sp.equipment.cobots && val("cobots") === "1", mr = machRate(), pl = plPct(), fact = num(val("factoring")), oh = num(val("overheads")), prof = num(val("profit"));
  const den = 1 - (pl + fact + oh + prof) / 100, years = Math.max(1, num(sp.term.years) || 3);
  const rebateWk = num(val("rebate")) / (years * RATECARD.weeksPerYear);
  const basis = val("payBasis"), prem = num(val("payPremium")) / 100;
  const pre = sp.sites.map(s => { const x = siteHours(s, cx), cobot = cobots && s.format === "Large"; if (cobot) x.h = half(x.h * 0.88); x.cobot = cobot; return x; });
  const flatPH = Math.max(1, num(val("hoursPerHead")) || flatHead(sp)), tupeN = num(sp.commercial.tupeHeads);
  const tupePH = tupeN ? Math.max(1, pre.reduce((a, x) => a + x.h, 0) / tupeN) : flatPH;
  const perHeadOf = h => hb === "curve" ? hphCurve(h) : hb === "tupe" ? tupePH : flatPH;
  const rows = sp.sites.map((s, i) => {
    let {h, src, lifted, cobot} = pre[i];
    const perHead = perHeadOf(h);
    const rate = ((basis === "RLW" ? (isLondon(s) ? RATECARD.LLW : RATECARD.RLW) : RATECARD.NLW) + prem) * (1 + unsocial * tradeOut);
    const hc = h > 0 ? (s.heads > 0 ? s.heads : Math.max(1, roundUp ? Math.ceil(h / perHead - 1e-9) : Math.round(h / perHead))) : 0;
    // Same stacking as the BB template, so the preview matches the generated workbook:
    // NI per operative on base wage; holiday on wages & NI; SSP, pension and training on wages; levy on wages & holiday.
    const wages = h * rate;
    const ni = hc ? Math.max(0, wages / hc - RATECARD.niThresholdWk) * RATECARD.niRate * hc : 0;
    const holiday = (wages + ni) * hol, gross = wages + holiday;
    const ons = wages * (oc.ssp + oc.pension + oc.training) / 100 + gross * RATECARD.levyPct / 100;
    const labour = gross + ons + ni, creditAllow = labour * credit;
    const materials = h * mat, uniforms = hc * 0.45, other = RATECARD.tnaPerSiteWk + RATECARD.auditPerSiteWk;
    const machinery = h * mr + (cobot ? cobotWk() : 0);
    return {s, h, src, lifted, cobot, perHead, rate, hc, wages, holiday, ons, ni, labour, creditAllow, materials, uniforms, other, machinery};
  });
  const H = rows.reduce((a, r) => a + r.h, 0) || 1;
  const roles = S.overrides.mgmt || mgmtDefaults(H, rows.length), onc = mgmtOnCost();
  const mgmtWk = roles.reduce((a, r) => a + num(r.fte) * num(r.salary), 0) * (1 + onc / 100) / RATECARD.weeksPerYear;
  const amFte = roles.filter(r => /area/i.test(r.role)).reduce((a, r) => a + num(r.fte), 0);
  rows.forEach(r => {
    r.mgmt = mgmtWk * r.h / H + rebateWk * r.h / H;
    r.direct = r.labour + r.creditAllow + r.materials + r.uniforms + r.other + r.machinery;
    r.charge = (r.direct + r.mgmt) / den;
  });
  const sum = k => rows.reduce((a, r) => a + r[k], 0);
  const T = {hours:H, hc:sum("hc"), wages:sum("wages"), labour:sum("labour") + sum("creditAllow"), materials:sum("materials"),
    uniforms:sum("uniforms"), other:sum("other"), machinery:sum("machinery"), mgmt:mgmtWk, rebate:rebateWk, direct:sum("direct"), charge:sum("charge"), ni:sum("ni")};
  T.annual = T.charge * RATECARD.weeksPerYear; T.contract = T.annual * years; T.contractExt = T.annual * (years + num(sp.term.ext));
  T.pl = T.charge * pl / 100; T.fact = T.charge * fact / 100; T.oh = T.charge * oh / 100; T.profit = T.charge * prof / 100;
  T.revPerHr = T.charge / H; T.labourPct = T.labour / T.charge * 100; T.avgPay = T.wages / H; T.contrib = prof;
  T.capex = rows.filter(r => r.cobot).length * COBOT.cost; T.machRate = mr; T.hoursPerAM = amFte ? H / amFte : null;
  const iw = S.internal.wageMult, iu = S.internal.uniformsPct / 100;
  const intCost = T.labour * iw + T.materials + T.uniforms * iu + T.other + T.machinery + T.mgmt + T.rebate + T.pl + T.fact + T.oh;
  T.intContrib = (T.charge - intCost) / T.charge * 100;
  T.margin = {pl, fact, oh, prof, den, mgrs:amFte, roles, onCost:onc, mgmtFte:roles.reduce((a, r) => a + num(r.fte), 0)};
  return {rows, T, oc};
}

/* ---------- Validation and risk rules ---------- */
function headBasisText(){ const hb = val("headBasis"); return hb === "curve" ? "hours per operative scaled by site size" : hb === "tupe" ? "hours per operative matched to the TUPE list" : `${num(val("hoursPerHead")) || flatHead(S.spec)} hrs per operative`; }
function dupIds(){ const c = {}; (S.spec ? S.spec.sites : []).forEach(s => { c[s.id] = (c[s.id] || 0) + 1; }); return Object.keys(c).filter(k => c[k] > 1); }
function flags(R){
  if (!R) return S.spec && S.extracted ? [{lvl:"block", t:"No site list loaded yet. Add the sites before generating the model.", go:"sites"}] : [];
  const sp = S.spec, T = R.T, f = [];
  const reds = openReds();
  if (!sp.client.name) f.push({lvl:"block", t:"The client name is missing. Add it on the survey sheet; it names the workbook and the approval.", go:"spec"});
  const low = (sp.lowConfidence || []).filter(p => p !== "client.name" && !sp.fieldSrc[p]);
  if (low.length) f.push({lvl:"warn", t:`${low.length} extracted value${low.length > 1 ? "s have" : " has"} low confidence (${low.map(p => (oppFields().find(F => F.p === p) || {l:p}).l).join(", ")}). Check ${low.length > 1 ? "each" : "it"} against the citation on the survey sheet.`, go:"spec"});
  if (sp.commercial.tupeApplies && !sp.commercial.tupeHeads && !sp.sites.some(s => s.heads > 0)) f.push({lvl:"info", t:"TUPE applies but the client has not given a headcount yet. Headcount is estimated; re-price when the employee list arrives.", go:"questions"});
  (S.restoreNotes || []).forEach(n => f.push(Object.assign({}, n)));
  if (reds) f.push({lvl:"block", t:`${reds} critical question${reds > 1 ? "s" : ""} still unanswered. Answer ${reds > 1 ? "them" : "it"} before generating the model.`, go:"questions"});
  const under = R.rows.filter(r => r.h > 0 && r.rate < RATECARD.NLW - 1e-9);
  f.push(under.length ? {lvl:"block", t:`${under.length} sites pay below the NLW (£${RATECARD.NLW}).`} : {lvl:"pass", t:`All pay rates meet the NLW (£${RATECARD.NLW}).`});
  f.push({lvl:"pass", t:`${RATECARD.label} (${RATECARD.why}): NLW £${RATECARD.NLW}, employer NI ${+(RATECARD.niRate * 100).toFixed(1)}% above £${RATECARD.niThresholdWk}/wk.`});
  if (RATECARD.future) f.push({lvl:"warn", t:`The contract starts after the latest published rate card (${RATECARD.id}). Rates for the first year are not yet known. Price on ${RATECARD.id} and rely on the indexation clause, or add a pay premium.`, go:"spec"});
  f.push({lvl:"pass", t:`All ${sp.sites.length} sites are included in the totals. The generator extends every template total range to the last row, so none are truncated as in the Asda model's COUNT(E7:E417).`});
  const d = dupIds();
  if (d.length) f.push({lvl:"warn", t:`${d.length} site ID${d.length > 1 ? "s appear" : " appears"} more than once (${d.slice(0, 4).join(", ")}${d.length > 4 ? "…" : ""}). Both rows are priced. Check that they are different sites.`, go:"sites"});
  const lifted = R.rows.filter(r => r.lifted).length;
  if (lifted) f.push({lvl:"info", t:`${lifted} sites raised to the spec minimum of ${sp.service.minHours} hrs/wk.`, go:"sites"});
  const tupe = R.rows.filter(r => r.h > 0 && r.s.heads > 0).length;
  if (tupe) f.push({lvl:"info", t: tupe === R.rows.filter(r => r.h > 0).length ? `All ${tupe} sites use the client's headcount for NI and uniforms.` : `${tupe} of ${R.rows.length} sites use the client's headcount. The other sites use ${headBasisText()}, rounded ${val("headRounding") === "up" ? "up" : "to the nearest"}.`, go:"sites"});
  const chal = num(val("hoursChallenge"));
  if (chal && val("hoursMethod") === "client") f.push(chal > APPROVAL.maxHoursChallengePct
    ? {lvl:"warn", t:`Hours are priced ${chal}% under the client's hours, beyond the ${APPROVAL.maxHoursChallengePct}% the approval policy allows without the commercial director. Present it as an alternative to a compliant bid.`, go:"questions"}
    : {lvl:"info", t:`Hours are priced ${chal}% under the client's hours. The bid is not compliant with the stated hours; present it as an alternative.`, go:"questions"});
  const est = R.rows.filter(r => r.src === "est").length, bm = R.rows.filter(r => r.src === "bm").length, dflt = R.rows.filter(r => r.src === "def").length;
  if (est) f.push({lvl:"info", t:`${est} sites have no client hours and were filled at the client's own sq ft per hour for their format.`, go:"sites"});
  if (bm) f.push({lvl:"warn", t:`${bm} sites are priced from the size curve. Past bids missed by up to ±44% on floor area alone. Confirm with a site survey or the frequency schedule.`, go:"sites"});
  if (dflt) f.push({lvl:"warn", t:`${dflt} sites have neither floor area nor hours and use flat default hours.`, go:"sites"});
  const inBand = (v, b) => v >= b.lo && v <= b.hi;
  if (!inBand(T.revPerHr, {lo:APPROVAL.minRevPerHr, hi:APPROVAL.maxRevPerHr})) f.push({lvl:"warn", t:`Revenue per labour hour is £${T.revPerHr.toFixed(2)}, outside the past-bid band of £${APPROVAL.minRevPerHr.toFixed(2)}–£${APPROVAL.maxRevPerHr.toFixed(2)}.`, go:"price"});
  if (T.labourPct > APPROVAL.maxLabourPct || T.labourPct < 75) f.push({lvl:"warn", t:`Labour is ${T.labourPct.toFixed(1)}% of revenue. Past bids ran at 78.5–87.1%.`, go:"price"});
  if (T.contrib < APPROVAL.minProfitPct) f.push({lvl:"warn", t:`Profit is ${T.contrib.toFixed(2)}%, below the ${APPROVAL.minProfitPct}% floor.`, go:"questions"});
  else if (T.contrib > 6.5) f.push({lvl:"warn", t:`Profit is ${T.contrib.toFixed(2)}%, above anything in past bids (${BENCH.profit.lo}–${BENCH.profit.hi}%).`, go:"questions"});
  if (T.hoursPerAM && (T.hoursPerAM < 1000 || T.hoursPerAM > 5000)) f.push({lvl:"warn", t:`Each area manager covers ${Math.round(T.hoursPerAM).toLocaleString("en-GB")} hrs/wk. Past bids ran 1,400–4,600.`, go:"price"});
  const hph = T.hours / Math.max(1, T.hc);
  if (hph < 9 || hph > 28) f.push({lvl:"warn", t:`Operatives average ${hph.toFixed(1)} hrs/wk each. Past bids ran ${BENCH.hoursPerHead.lo}–${BENCH.hoursPerHead.hi}.`, go:"questions"});
  const dens = R.rows.filter(r => r.s.sqft && r.h > 0).map(r => r.s.sqft / r.h).sort((a, b) => a - b);
  if (dens.length >= 10){ const med = dens[Math.floor(dens.length / 2)], odd = dens.filter(x => x > med * 3 || x < med / 3).length;
    if (odd) f.push({lvl:"info", t:`${odd} sites have hours far from the estate's typical ${Math.round(med)} sq ft per hour (more than 3× either way). Check for unit errors (sq m vs sq ft).`, go:"sites"}); }
  if (sp.commercial.paymentDays > 30 && num(val("factoring")) === 0) f.push({lvl:"warn", t:`${sp.commercial.paymentDays}-day payment terms with no working-capital allowance.`, go:"questions"});
  if (sp.incumbentHours){ const dd = (T.hours - sp.incumbentHours) / sp.incumbentHours * 100;
    if (Math.abs(dd) > 25) f.push({lvl:"warn", t:`Hours are ${dd > 0 ? "+" : ""}${dd.toFixed(1)}% against the previous tender (${sp.incumbentHours.toLocaleString("en-GB")} hrs). Confirm that the spec change supports this.`, go:"sites"}); }
  if (sp.commercial.credits) f.push({lvl:"info", t:"The spec credits undelivered hours. A delivery-risk allowance is in the labour line."});
  if (plPct() !== BENCH.pl) f.push({lvl:"info", t:`Public liability set to ${plPct()}% (standard ${BENCH.pl}%).`});
  if (!S.visited.sites) f.push({lvl:"warn", t:"Sites & hours has not been reviewed.", go:"sites"});
  if (sp.service.auditPass) f.push({lvl:"info", t:`An audit pass mark of ${sp.service.auditPass}% applies. Audit (OCS Q) is costed at £${RATECARD.auditPerSiteWk}/site/wk.`});
  if (sp.commercial.rateCard) f.push({lvl:"info", t:"The client wants an on-request rate card. Export one from Generate model."});
  if (T.capex) f.push({lvl:"info", t:`Cobots at ${R.rows.filter(r => r.cobot).length} large stores: capex £${(T.capex / 1e6).toFixed(2)}m. Finance approval is needed.`});
  return f;
}
/* ---------- Site list importer: delimiter, header mapping, units, synonyms, partial load ---------- */
function splitDelimited(text){
  const first = (text.split(/\r?\n/).find(l => l.trim()) || "");
  const count = ch => first.split(ch).length - 1;
  const delim = count("\t") ? "\t" : count(";") > count(",") ? ";" : ",";
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++){
    const ch = text[i];
    if (q){ if (ch === '"'){ if (text[i + 1] === '"'){ cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"' && cell.trim() === ""){ q = true; cell = ""; continue; }
    if (ch === delim){ row.push(cell); cell = ""; continue; }
    if (ch === "\n" || ch === "\r"){ if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; continue; }
    cell += ch;
  }
  if (cell !== "" || row.length){ row.push(cell); rows.push(row); }
  return {rows, delim};
}
function parseNum(v, delim){
  if (v == null) return null; if (typeof v === "number") return v;
  let s = String(v).replace(/[£\s]/g, "").replace(/(sq\.?ft|sqft|ft2|hrs?|hours?)$/i, "");
  if (s === "" || s === "-" || s === "–") return null;
  if (delim === ";" && /^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  else if (/^-?\d+,\d{1,2}$/.test(s) && delim !== ",") s = s.replace(",", ".");
  const n = Number(s); return Number.isFinite(n) ? n : NaN;
}
const FMT_SYN = [[/^(s|sm|small|kiosk|express|local|living|pop-?up|convenience|mini|compact)\b/i, "Small"], [/^(m|med|medium|mid|supermarket|standard|core)\b/i, "Medium"],
  [/^(l|lg|large|superstore|flagship|hypermarket|extra|mega)\b/i, "Large"], [/^(office|hq|head\s*office|support|clinic|clinical|hub|depot|dc|warehouse)\b/i, "Office"]];
const fmtOf = v => { const s = String(v || "").trim(); if (!s) return null; const hit = FMT_SYN.find(([re]) => re.test(s)); return hit ? hit[1] : undefined; };
/* ---------- Site locations: postcodes, coordinates and OS grid references ---------- */
const PC_RE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;
const normPostcode = v => { const m = String(v || "").trim().toUpperCase().match(/^([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})$/); return m ? `${m[1]} ${m[2]}` : null; };
const postcodeIn = v => { const m = String(v || "").toUpperCase().match(PC_RE); return m ? `${m[1]} ${m[2]}` : null; };
const inUK = (lat, lon) => lat >= 49.8 && lat <= 60.95 && lon >= -8.7 && lon <= 1.8;
// OS National Grid (OSGB36) easting/northing to WGS84 latitude/longitude: inverse Transverse Mercator on Airy 1830, then a Helmert shift (about 5 m accuracy).
function osgbToWgs84(E, N){
  const a = 6377563.396, b = 6356256.909, F0 = 0.9996012717, lat0 = 49 * Math.PI / 180, lon0 = -2 * Math.PI / 180, N0 = -100000, E0 = 400000;
  const e2 = 1 - b * b / (a * a), n = (a - b) / (a + b), n2 = n * n, n3 = n2 * n;
  let lat = lat0, M = 0;
  do { lat = (N - N0 - M) / (a * F0) + lat;
    M = b * F0 * ((1 + n + 1.25 * n2 + 1.25 * n3) * (lat - lat0) - (3 * n + 3 * n2 + 2.625 * n3) * Math.sin(lat - lat0) * Math.cos(lat + lat0)
      + (1.875 * n2 + 1.875 * n3) * Math.sin(2 * (lat - lat0)) * Math.cos(2 * (lat + lat0)) - 35 / 24 * n3 * Math.sin(3 * (lat - lat0)) * Math.cos(3 * (lat + lat0)));
  } while (Math.abs(N - N0 - M) >= 0.00001);
  const s = Math.sin(lat), c = Math.cos(lat), t = Math.tan(lat), nu = a * F0 / Math.sqrt(1 - e2 * s * s), rho = a * F0 * (1 - e2) / Math.pow(1 - e2 * s * s, 1.5), eta2 = nu / rho - 1;
  const VII = t / (2 * rho * nu), VIII = t / (24 * rho * nu ** 3) * (5 + 3 * t * t + eta2 - 9 * t * t * eta2), IX = t / (720 * rho * nu ** 5) * (61 + 90 * t * t + 45 * t ** 4);
  const X = 1 / (c * nu), XI = 1 / (c * 6 * nu ** 3) * (nu / rho + 2 * t * t), XII = 1 / (c * 120 * nu ** 5) * (5 + 28 * t * t + 24 * t ** 4), XIIA = 1 / (c * 5040 * nu ** 7) * (61 + 662 * t * t + 1320 * t ** 4 + 720 * t ** 6);
  const dE = E - E0, phi = lat - VII * dE ** 2 + VIII * dE ** 4 - IX * dE ** 6, lam = lon0 + X * dE - XI * dE ** 3 + XII * dE ** 5 - XIIA * dE ** 7;
  // Helmert OSGB36 → WGS84 via cartesian coordinates
  const toXYZ = (p, l, A, B) => { const E2 = 1 - B * B / (A * A), v = A / Math.sqrt(1 - E2 * Math.sin(p) ** 2); return [v * Math.cos(p) * Math.cos(l), v * Math.cos(p) * Math.sin(l), (1 - E2) * v * Math.sin(p)]; };
  const [x1, y1, z1] = toXYZ(phi, lam, a, b), sc = -20.4894e-6, rx = 0.1502 / 206265, ry = 0.2470 / 206265, rz = 0.8421 / 206265;
  const x2 = 446.448 + (1 + sc) * x1 - rz * y1 + ry * z1, y2 = -125.157 + rz * x1 + (1 + sc) * y1 - rx * z1, z2 = 542.06 - ry * x1 + rx * y1 + (1 + sc) * z1;
  const A2 = 6378137, B2 = 6356752.3142, E22 = 1 - B2 * B2 / (A2 * A2), p = Math.hypot(x2, y2);
  let la = Math.atan2(z2, p * (1 - E22)), prev = 2 * Math.PI;
  while (Math.abs(la - prev) > 1e-12){ const v = A2 / Math.sqrt(1 - E22 * Math.sin(la) ** 2); prev = la; la = Math.atan2(z2 + E22 * v * Math.sin(la), p); }
  return {lat:la * 180 / Math.PI, lon:Math.atan2(y2, x2) * 180 / Math.PI};
}
// A site's location from its row: coordinates beat a grid reference; a postcode is kept for the geocoder. Returns only what the row gives.
function siteGeo(g){
  const out = {}, pc = normPostcode(g.postcode) || postcodeIn(g.postcode) || postcodeIn(g.address), addr = String(g.address || "").trim().slice(0, 240);
  if (pc) out.postcode = pc; if (addr) out.address = addr;
  let lat = parseNum(String(g.lat ?? "").trim()), lon = parseNum(String(g.lon ?? "").trim());
  if (Number.isFinite(lat) && Number.isFinite(lon) && !inUK(lat, lon) && inUK(lon, lat)) [lat, lon] = [lon, lat];
  if (Number.isFinite(lat) && Number.isFinite(lon) && inUK(lat, lon)){ out.lat = +lat.toFixed(5); out.lon = +lon.toFixed(5); out.geoSrc = "file"; out.geoConf = "exact"; }
  else { const e = parseNum(String(g.east ?? "").trim()), n = parseNum(String(g.north ?? "").trim());
    if (Number.isFinite(e) && Number.isFinite(n) && e > 0 && e < 700000 && n > 0 && n < 1300000){ const w = osgbToWgs84(e, n); if (inUK(w.lat, w.lon)){ out.lat = +w.lat.toFixed(5); out.lon = +w.lon.toFixed(5); out.geoSrc = "grid"; out.geoConf = "exact"; } } }
  return out;
}
function headerMap(cells){
  const map = {}, units = {};
  cells.forEach((raw, i) => { const h = String(raw || "").toLowerCase().trim(); if (!h) return;
    let k = null;
    if (/post\s*code|postal\s*code|^zip|^pc$/.test(h)) k = "postcode";
    else if (/^lat(itude)?\b|\blatitude\b/.test(h)) k = "lat";
    else if (/^(lon|lng|long)(gitude)?\b|\blongitude\b/.test(h)) k = "lon";
    else if (/\beastings?\b/.test(h)) k = "east";
    else if (/\bnorthings?\b/.test(h)) k = "north";
    else if (/address|street|^town$|^city$/.test(h)) k = "address";
    else if (/sq\.?\s*ft|sqft|square\s*f(ee|oo)t|ft2|ft²/.test(h)) k = "sqft";
    else if (/sq\.?\s*m\b|sqm|\bm2\b|m²|square\s*met/.test(h)){ k = "sqft"; units.sqm = true; }
    else if (!/hour|hrs/.test(h) && /head\s*count|^heads?$|^hc$|operatives|^staff|tupe|cleaners|no\.?\s*of\s*(staff|cleaners|operatives|people)/.test(h)) k = "heads";
    else if (/hour|hrs/.test(h)) k = "hours";
    else if (/(?:^|[\s_#.(-])(id|no|number|code|ref)(?:$|[\s_.#)-])/.test(h) || h === "#") k = "id";
    else if (/format|type|category|class|size\s*band/.test(h)) k = "format";
    else if (/name|^site$|^store$|^branch$|^location$/.test(h)) k = "name";
    else if (/region|division|zone|^area$|county/.test(h)) k = "region";
    else if (/\b(gia|nia|floor\s*area|area)\b/.test(h)) k = "sqft";
    if (k === "sqft"){ (units.areaCols = units.areaCols || []).push({i, h, sqm: /sq\.?\s*m\b|sqm|\bm2\b|m²|square\s*met/.test(h)}); }
    if (k && map[k] == null) map[k] = i; });
  return (map.name != null && (map.sqft != null || map.hours != null)) ? {map, units} : null;
}
function importRows(rows, source, delim){
  const rep = {source, lines:rows.length, loaded:0, skipped:[], bad:[], inferred:0, sqm:false, dupIds:[], delim: delim === "\t" ? "tab" : delim === ";" ? "semicolon" : delim ? "comma" : "workbook"};
  let hi = rows.findIndex(r => r.some(c => String(c).trim())), hm = hi >= 0 ? headerMap(rows[hi]) : null;
  const map = hm ? hm.map : {name:0, region:1, format:2, sqft:3, hours:4, id:5}; rep.header = !!hm; rep.sqm = !!(hm && hm.units.sqm);
  // Several area columns (Foodhall, Café, BOH…) are zones of one store: add them up, unless one of them is already the total.
  let sumCols = null;
  const ac = hm && hm.units.areaCols || [];
  if (ac.length > 1){
    const tot = ac.find(a => /total|gross|overall|\bgia\b/.test(a.h));
    if (tot){ map.sqft = tot.i; rep.sqm = tot.sqm; }
    else if (ac.every(a => a.sqm === ac[0].sqm)){ sumCols = ac.map(a => a.i); rep.sqm = ac[0].sqm; rep.areaSum = ac.map(a => String(rows[hi][a.i]).trim()); }
  }
  // A file that uses its own format names (FULL LINE, SIMPLY FOOD…) gets those names mapped to size bands by floor area.
  // A stray unknown label among recognised ones is still an error.
  const fmtCol = map.format, body = rows.filter((r, i) => !(hm && i <= hi) && r.some(c => String(c).trim()));
  const labels = {}; if (fmtCol != null) body.forEach(r => { const v = String(r[fmtCol] ?? "").trim(); if (v && fmtOf(v) === undefined) labels[v] = (labels[v] || 0) + 1; });
  const unk = Object.values(labels).reduce((a, b) => a + b, 0), classes = Object.keys(labels).length && Object.keys(labels).length <= 12 && unk >= body.length / 2 ? labels : null;
  const areaOf = r => { if (!sumCols) return parseNum(String(r[map.sqft] ?? "").trim(), delim);
    let t = null; for (const i of sumCols){ const v = parseNum(String(r[i] ?? "").trim(), delim); if (Number.isNaN(v)) return NaN; if (v != null) t = (t || 0) + v; } return t; };
  const out = [], seen = new Set();
  rows.forEach((r, i) => {
    const line = i + 1, cell = k => map[k] != null ? String(r[map[k]] ?? "").trim() : "";
    if (hm && i <= hi) return;
    if (!r.some(c => String(c).trim())) return rep.skipped.push({line, reason:"blank"});
    const name = cell("name");
    if (/^(grand\s*)?(sub)?\s*totals?\b/i.test(name) || (!name && r.some(c => /^totals?$/i.test(String(c).trim())))) return rep.skipped.push({line, reason:"total row"});
    if (headerMap(r)) return rep.skipped.push({line, reason:"repeated header"});
    if (!name) return rep.bad.push({line, reason:"no site name"});
    let sq = areaOf(r), hrs = parseNum(cell("hours"), delim);
    if (Number.isNaN(sq)) return rep.bad.push({line, reason:sumCols ? "a floor area column is not a number" : `floor area "${cell("sqft")}" is not a number`});
    if (Number.isNaN(hrs)) return rep.bad.push({line, reason:`hours "${cell("hours")}" is not a number`});
    if ((sq != null && sq < 0) || (hrs != null && hrs < 0)) return rep.bad.push({line, reason:"negative value"});
    if (sq === 0) sq = null; if (hrs === 0) hrs = null;
    if (sq != null && rep.sqm) sq = Math.round(sq * 10.764);
    if (sq == null && hrs == null) return rep.bad.push({line, reason:"needs a floor area or weekly hours"});
    const hcRaw = parseNum(cell("heads"), delim);
    if (Number.isNaN(hcRaw) || (hcRaw != null && hcRaw < 0)) return rep.bad.push({line, reason:`headcount "${cell("heads")}" is not a whole number of people`});
    const heads = hcRaw ? Math.max(1, Math.round(hcRaw)) : null;
    const label = cell("format"); let f = fmtOf(label);
    if (f === undefined && classes && classes[label]) f = null;
    if (f === undefined) return rep.bad.push({line, reason:`format "${cell("format")}" not recognised (use Small, Medium, Large or Office)`});
    const key = [name, cell("region"), f, sq, hrs, cell("id")].join("|");
    if (seen.has(key)) return rep.skipped.push({line, reason:"exact duplicate row"}); seen.add(key);
    const site = {uid:nextUid(), id:cell("id") || null, name, region:cell("region"), format:f, sqft:sq, clientHours:hrs, heads, line};
    Object.assign(site, siteGeo({postcode:cell("postcode"), address:cell("address"), lat:cell("lat"), lon:cell("lon"), east:cell("east"), north:cell("north")}));
    if (f === null && classes && classes[label]) site.clientFormat = label;
    out.push(site);
  });
  // Client format classes: each class takes the band (Small / Medium / Large by floor-area terciles) that holds its median store
  if (classes){
    const all = out.filter(s => s.sqft).map(s => s.sqft).sort((a, b) => a - b), t1 = all[Math.floor(all.length / 3)], t2 = all[Math.floor(all.length * 2 / 3)];
    rep.formatMap = {};
    for (const k of Object.keys(classes)){
      const v = out.filter(s => s.clientFormat === k && s.sqft).map(s => s.sqft).sort((a, b) => a - b), md = v.length ? v[Math.floor(v.length / 2)] : null;
      const band = md == null || !all.length ? "Medium" : md <= t1 ? "Small" : md <= t2 ? "Medium" : "Large";
      rep.formatMap[k] = band; out.filter(s => s.clientFormat === k).forEach(s => { s.format = band; s.formatMapped = true; });
    }
  }
  // Missing formats: nearest format by median floor area (log scale), else terciles
  const need = out.filter(s => !s.format && !s.clientFormat);
  if (need.length){
    const med = {}; ["Small","Medium","Large","Office"].forEach(k => { const v = out.filter(s => s.format === k && s.sqft).map(s => s.sqft).sort((a, b) => a - b); if (v.length) med[k] = v[Math.floor(v.length / 2)]; });
    const all = out.filter(s => s.sqft).map(s => s.sqft).sort((a, b) => a - b), t1 = all[Math.floor(all.length / 3)], t2 = all[Math.floor(all.length * 2 / 3)];
    need.forEach(s => { rep.inferred++;
      if (!s.sqft){ s.format = "Medium"; return; }
      const ks = Object.keys(med).filter(k => k !== "Office");
      s.format = ks.length ? ks.reduce((b, k) => Math.abs(Math.log(s.sqft / med[k])) < Math.abs(Math.log(s.sqft / med[b])) ? k : b, ks[0]) : s.sqft <= t1 ? "Small" : s.sqft <= t2 ? "Medium" : "Large";
      s.formatInferred = true; });
  }
  out.forEach((s, i) => { if (!s.id) s.id = "S" + String(i + 1).padStart(4, "0"); });
  const c = {}; out.forEach(s => { c[s.id] = (c[s.id] || 0) + 1; }); rep.dupIds = Object.keys(c).filter(k => c[k] > 1);
  rep.loaded = out.length;
  return {sites:out, rep};
}
/* ---------- Spec facts from DOCX text (rules; the Cowork agent does PDFs and judgement) ---------- */
// pages (optional) gives the page number of each paragraph, for PDFs
function docFacts(paras, doc, pages){
  const F = {}, c = (i, text) => Object.assign({doc, para:i + 1}, pages ? {page:pages[i]} : {}, {text: text.length > 240 ? text.slice(0, 237) + "…" : text});
  const n = w => WORDNUM[String(w).toLowerCase()] ?? Number(w);
  const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December";
  const brands = {};
  paras.forEach((p, i) => {
    let m;
    if (i < 3 && !F.client && (m = p.match(/^(.{3,80}?)\s+[–—-]\s+.*(specification|tender|invitation)/i))) F.client = {v:m[1].trim(), cite:c(i, p)};
    if (!F.term && (m = p.match(/initial (?:term|period) of (\w+)(?:\s*\(\d+\))? years?/i))) F.term = {v:n(m[1]), cite:c(i, p)};
    if (!F.term && (m = p.match(/until the (first|second|third|fourth|fifth|sixth|seventh) anniversary of the (?:commencement|effective|start|service commencement) date/i))) F.term = {v:ORDNUM[m[1].toLowerCase()], cite:c(i, p)};
    if (!F.ext && /extend/i.test(p) && (m = p.slice(p.search(/extend/i)).match(/\b(a|an|one|two|three|four|five|\d+)\s+(?:further\s+|additional\s+)?years?/i))) F.ext = {v:n(m[1]), cite:c(i, p)};
    // "commence on 1 July 2026"; a bare "from <date>" only counts when the paragraph is about the contract or services starting, never "in force from"
    if (!F.start && !/in force from|version|regulations? \d{4}|act \d{4}/i.test(p) && (m = p.match(new RegExp(`(from|commenc\\w*|start\\w*)(?:\\s+on)?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS})\\s+(20\\d\\d)`, "i")))
        && (!/^from$/i.test(m[1]) || (/\b(contract|services?|agreement)\b/i.test(p) && /commenc|start|begin|\bterm\b|\bruns?\b/i.test(p)))){
      const d = new Date(`${m[2]} ${m[3]} ${m[4]} 12:00`); if (!isNaN(d)) F.start = {v:d.toISOString().slice(0, 10), cite:c(i, p)}; }
    // A timetable row split into cells: "~June 2027" then "Contract Commencement". Approximate or month-only dates are low confidence.
    if (!F.start && (m = p.match(new RegExp(`^\\s*(~|c\\.|circa|approx\\.?)?\\s*(?:(\\d{1,2})(?:st|nd|rd|th)?\\s+)?(${MONTHS})\\s+(20\\d\\d)\\s*$`, "i")))
        && /^\s*(?:contract\s+|service\s+)?(?:commencement|start|go[- ]live)(?:\s+date)?\s*$/i.test(paras[i + 1] || "")){
      const d = new Date(`${m[2] || 1} ${m[3]} ${m[4]} 12:00`); if (!isNaN(d)) F.start = {v:d.toISOString().slice(0, 10), cite:c(i, `${p.trim()} | ${paras[i + 1].trim()}`), low:!!m[1] || !m[2]}; }
    if (!F.pay && (m = p.match(/(\d{2,3})\s+days\s+(?:from|of|after)\s+(?:the\s+)?(?:date|receipt)/i) || p.match(/payment terms (?:are|of)\s+(\d{2,3})\s+days/i)
        || (/invoice/i.test(p) && p.match(/(\d{2,3})(?:st|nd|rd|th)\s+day\s+after\s+the\s+date/i)))) F.pay = {v:+m[1], cite:c(i, p)};
    if (!F.min && (m = p.match(/minimum of (\d+(?:\.\d+)?)\s+(?:cleaning\s+)?hours/i) || p.match(/(?:never|not) (?:have|receive) (?:less|fewer) than (\d+(?:\.\d+)?)\s+(?:cleaning\s+)?hours/i))) F.min = {v:+m[1], cite:c(i, p)};
    if (!F.audit && /audit|score/i.test(p) && (m = p.match(/(?:below|under|less than)\s+(\d{2})\s*%/i))) F.audit = {v:+m[1], cite:c(i, p)};
    if (!F.credits && /credit/i.test(p) && /hours?/i.test(p) && /(not delivered|undelivered|fails? to|shortfall|missed)/i.test(p)) F.credits = {v:true, cite:c(i, p)};
    if (!F.lw && /real living wage/i.test(p) && /(must|shall|paid|accredited)/i.test(p)) F.lw = {v:"RLW", cite:c(i, p)};
    if (!F.equip && (m = p.match(/supplier (?:provides|shall provide|will provide|is to provide)[^.]*(machinery|equipment)/i))) F.equip = {v:"supplier", cite:c(i, p)};
    // "The Supplier shall also fully provide, manage and maintain:" followed by list items, one of them machinery or equipment
    if (!F.equip && /supplier (?:shall|will|is to|must)\b[^.:]{0,40}\bprovide\b[^.:]*:\s*$/i.test(p)){
      const item = paras.slice(i + 1, i + 13).findIndex(q => /\b(machinery|equipment)\b/i.test(q) && q.length < 160);
      if (item >= 0) F.equip = {v:"supplier", cite:c(i, `${p.trim()} … ${paras[i + 1 + item].trim()}`)}; }
    if (!F.equip && /(each store|stores?) (?:is|are|will be) supplied with[^.]*equipment/i.test(p)) F.equip = {v:"client", cite:c(i, p)};
    if (!F.cobots && /(autonomous|cobot|robotic)/i.test(p)) F.cobots = {v:true, cite:c(i, p)};
    if (!F.tupe && /TUPE/.test(p) && (m = p.match(/(\d{1,3}(?:,\d{3})*|\d+)\s+(?:cleaning\s+)?(?:operatives|employees|staff|colleagues|cleaners)\b/i))) F.tupe = {v:+m[1].replace(/,/g, ""), cite:c(i, p)};
    if (!F.rebate && /rebate/i.test(p)) F.rebate = {v:true, cite:c(i, p)};
    if (!F.idx && /(indexation|reviewed annually|annual (?:price )?review)/i.test(p)) F.idx = {v:p.length > 80 ? "Annual review" : p, cite:c(i, p)};
    if (!F.trade && /trad(?:e|ing)/i.test(p) && (m = p.match(/(\d{1,2})\s*%?\s*(?:-|–|—|to|and)\s*(\d{1,2})\s*%/))){ const lo = +m[1], hi = +m[2]; if (lo < hi && hi <= 100) F.trade = {v:[lo, hi], cite:c(i, p)}; }
    if (!F.rateCard && /on[- ]request/i.test(p) && /\b(costs?|rates?|prices?|price list|rate card)\b/i.test(p) && /\b(provide|submit|quote|supply|price)\b/i.test(p)) F.rateCard = {v:true, cite:c(i, p)};
    if (!F.tupeApplies && /\bTUPE\b/.test(p) && /(appl|transfer)/i.test(p)) F.tupeApplies = {v:true, cite:c(i, p)};
    for (const b of p.matchAll(BRAND_RE)) if (!BRAND_STOP.has(b[1].toLowerCase())){ const k = b[1]; brands[k] = brands[k] || {n:0, cite:c(i, p)}; brands[k].n++; }
  });
  const top = Object.entries(brands).sort((a, b) => b[1].n - a[1].n)[0];
  if (top) F.brand = {v:top[0].length > 3 && top[0] === top[0].toUpperCase() ? top[0][0] + top[0].slice(1).toLowerCase() : top[0], n:top[1].n, cite:top[1].cite};
  return F;
}
// A capitalised name used as the owner of stores, colleagues or an FM team: "All Currys Stores", "Primark EHS", "Asda colleagues".
// It is only ever a suggestion for the client name; the seller confirms it.
const BRAND_RE = /\b([A-Z][A-Za-z&'’]+|[A-Z]{3,})\s+(?:stores?|EHS|colleagues?|FM|estate)\b/g;
const BRAND_STOP = new Set(("all each every the our your their these those this that large small medium grade indoor outdoor high street mall malls seasonal stadium coastal cold retail new existing " +
  "other some many most flagship office offices store stores local express superstore supermarket in of for with across within participating selected remaining relevant customer " +
  "contractor supplier client cleaning where when uk national regional key core open closed trading any no named").split(" "));
const clientLabel = () => S.spec && S.spec.client.name ? S.spec.client.name : "Client name needed";
function blankSpec(files){
  const base = files[0] ? files[0].name.replace(/\.[^.]+$/, "") : "";
  return {client:{name:null, hint: base.split(/\s+[–—-]\s+/)[0] || null, sector:null, cite:null},   // the file name is a hint, never the client name
    term:{years:3, start:null, ext:null, cite:null}, sites:[], sitesCite:null,
    service:{minHours:null, auditPass:null, tradingShare:null}, commercial:{paymentDays:30, credits:false, indexation:null, rebate:null, tupeHeads:null},
    equipment:{clientSupplied:null, cobots:false}, incumbentHours:null, livingWage:null, custom:true, fieldSrc:{}, notes:[]};
}
function normaliseSpec(sp){
  sp.fieldSrc = sp.fieldSrc || {}; sp.notes = sp.notes || [];
  sp.sites.forEach(s => { if (!s.uid) s.uid = nextUid(); });
  if (sp.equipment.cobotCite && !sp.equipment.eqCite) sp.equipment.eqCite = null;
  return sp;
}
const getPath = (o, p) => p.split(".").reduce((a, k) => a == null ? a : a[k], o);
const setPath = (o, p, v) => { const ks = p.split("."), last = ks.pop(); ks.reduce((a, k) => a[k] = a[k] || {}, o)[last] = v; };
const SPEC_FIELDS = [
  {p:"client.name", l:"Client", type:"text", ph:sp => sp.client.hint ? `e.g. ${sp.client.hint}` : "Client name", cite:sp => sp.client.cite,
    hint:() => S.spec && S.spec.client.hintCite ? `Suggested: ${S.spec.client.hint} (${S.spec.client.hintCite.doc}${S.spec.client.hintCite.page ? " p" + S.spec.client.hintCite.page : S.spec.client.hintCite.para ? " ¶" + S.spec.client.hintCite.para : ""}). Confirm it.` : ""},
  {p:"client.sector", l:"Sector", type:"text", ph:"e.g. Grocery retail", cite:sp => sp.client.sectorCite || null},
  {p:"term.years", l:"Initial term (years)", type:"number", min:1, max:15, step:1, cite:sp => sp.term.cite},
  {p:"term.ext", l:"Extension (years)", type:"number", min:0, max:10, step:1, cite:sp => sp.term.extCite || (sp.term.ext ? sp.term.cite : null)},
  {p:"term.start", l:"Start date", type:"date", cite:sp => sp.term.startCite, hint:() => `${RATECARD.label} · ${RATECARD.why}`},
  {p:"commercial.paymentDays", l:"Payment terms (days)", type:"number", min:0, max:180, step:1, cite:sp => sp.commercial.payCite},
  {p:"commercial.credits", l:"Undelivered hours credited", type:"bool", cite:sp => sp.commercial.credCite},
  {p:"service.minHours", l:"Minimum hours per site / wk", type:"number", min:0, max:100, step:0.5, cite:sp => sp.service.minHoursCite, optional:true},
  {p:"service.auditPass", l:"Audit pass mark (%)", type:"number", min:0, max:100, step:1, cite:sp => sp.service.auditCite, optional:true},
  {p:"service.tradingShare", l:"Hours in trading time (%)", type:"range", ph:"e.g. 20–40", cite:sp => sp.service.tradeCite, optional:true},
  {p:"livingWage", l:"Pay floor stated", type:"select", opts:[["", "Not stated"], ["NLW", "National Living Wage"], ["RLW", "Real Living Wage (LLW in London)"]], cite:sp => sp.lwCite},
  {p:"equipment.clientSupplied", l:"Machinery supplied by", type:"select", opts:[["", "Not stated"], ["false", "Supplier (us)"], ["true", "Client"]], cite:sp => sp.equipment.eqCite},
  {p:"equipment.cobots", l:"Autonomous kit invited", type:"bool", cite:sp => sp.equipment.cobotCite},
  {p:"commercial.rebate", l:"Upfront rebate invited (£)", type:"number", min:0, max:1e8, step:1000, cite:sp => sp.commercial.rebCite, optional:true},
  {p:"commercial.indexation", l:"Indexation", type:"text", ph:"e.g. annual RLW review", cite:sp => sp.commercial.idxCite, optional:true},
  {p:"commercial.tupeHeads", l:"TUPE headcount (total operatives)", type:"number", min:0, max:100000, step:1, cite:sp => sp.commercial.tupeCite, optional:true},
  {p:"incumbentHours", l:"Previous tender hours / wk", type:"number", min:0, max:1e6, step:0.5, cite:sp => sp.incCite, optional:true}
];
function specCellSrc(sp, F){
  const v = getPath(sp, F.p), fs = sp.fieldSrc[F.p];
  if (fs) return fs; if (F.cite(sp)) return "doc";
  const empty = v == null || v === "" || v === false;
  if (F.p === "client.name") return empty || sp.custom ? "gap" : "doc";
  if ((F.p === "commercial.credits" || F.p === "equipment.cobots") && sp.docRead) return "def";   // read the spec; not mentioned
  if (F.p === "term.years" || F.p === "commercial.paymentDays" || F.p === "commercial.credits" || F.p === "equipment.cobots") return sp.custom ? "gap" : "def";
  return empty ? (F.optional ? "def" : "gap") : "def";
}
const LEVERS = [
  {id:"payPremium", l:"Pay above floor", u:"p/hr", min:0, max:150, step:1},
  {id:"hoursChallenge", l:"Hours challenge", u:"%", min:0, max:30, step:0.5, when:() => val("hoursMethod") === "client" && S.spec.sites.some(s => s.clientHours != null)},
  {id:"hoursPerHead", l:"Hours per operative (flat)", u:"hrs", min:4, max:40, step:0.5, fallback:() => flatHead(S.spec)},
  {id:"holiday", l:"Holiday cover", u:"%", min:0, max:15, step:0.1},
  {oc:"ssp", l:"SSP", u:"%", min:0, max:3, step:0.1}, {oc:"pension", l:"Pension", u:"%", min:0, max:6, step:0.1}, {oc:"training", l:"Training", u:"%", min:0, max:3, step:0.1},
  {id:"materials", l:"Materials", u:"£/hr", min:0, max:0.8, step:0.01},
  {ov:"machRate", l:"Machinery", u:"£/labour hr", min:0, max:4, step:0.01, def:() => MACH_RATE[val("machinery")] ?? MACH_RATE.standard},
  {id:"mgmtRatio", l:"Hours per area manager", u:"hrs", min:300, max:8000, step:50},
  {ov:"pl", l:"Public liability", u:"%", min:0, max:3, step:0.01, def:() => BENCH.pl},
  {id:"factoring", l:"Factoring / working capital", u:"%", min:0, max:4, step:0.05},
  {id:"overheads", l:"Overheads", u:"%", min:0, max:6, step:0.05},
  {id:"profit", l:"Profit", u:"%", min:0, max:12, step:0.05}
];
function leverVal(L){
  if (L.oc) return S.overrides.oc && S.overrides.oc[L.oc] != null ? S.overrides.oc[L.oc] : OC_DEFAULT[L.oc];
  if (L.ov) return S.overrides[L.ov] != null ? S.overrides[L.ov] : L.def();
  const v = val(L.id);
  return v === undefined && L.fallback ? L.fallback() : num(v);
}
function leverSrc(L){
  if (L.oc) return S.overrides.oc && S.overrides.oc[L.oc] != null ? "ans" : "bm";
  if (L.ov) return S.overrides[L.ov] != null ? "ans" : "bm";
  return srcOf(L.id);
}
function leverSet(L, v){
  logEvent("lever", {lever:L.id || L.oc || L.ov, from:leverVal(L), to:v});
  if (L.oc){ S.overrides.oc = S.overrides.oc || {}; S.overrides.oc[L.oc] = v; }
  else if (L.ov) S.overrides[L.ov] = v;
  else S.answers[L.id] = {value: L.id === "factoring" ? String(v) : v, source:"ans"};
  if (L.id === "hoursPerHead") S.answers.headBasis = {value:"flat", source:"ans"};   // a typed figure means one figure for every site
}
function payload(){
  const R = compute(), T = R.T, sp = S.spec, oc = R.oc;
  const log = qs().map(q => ({input:q.id, question:q.text, value:val(q.id), source:({doc:"Doc", ans:"Answer", bm:"Benchmark", def:"Default"})[srcOf(q.id)], citation:q.cite || null}));
  LEVERS.filter(L => L.oc).forEach(L => log.push({input:L.oc, value:oc[L.oc], source:S.overrides.oc && S.overrides.oc[L.oc] != null ? "Answer" : "Benchmark"}));
  LEVERS.filter(L => L.ov).forEach(L => log.push({input:L.ov, value:leverVal(L), source:S.overrides[L.ov] != null ? "Answer" : "Benchmark"}));
  log.push({input:"management.onCostPct", value:T.margin.onCost, source:S.overrides.mgmtOnCost != null ? "Answer" : "Benchmark"}, {input:"management.roles", value:T.margin.roles.map(r => `${r.role} ${r.fte}×£${r.salary}`).join("; "), source:S.overrides.mgmt ? "Answer" : "Benchmark"});
  log.push({input:"rateCard", value:RATECARD.id, source:S.overrides.rc ? "Answer" : "Benchmark", question:RATECARD.why});
  log.push({input:"internal.wageMult", value:S.internal.wageMult, source:"Default"}, {input:"internal.uniformsPct", value:S.internal.uniformsPct, source:"Default"});
  const {why, ...rc} = RATECARD;
  const extraction = oppFields().map(F => { const v = getPath(sp, F.p), c = getPath(sp, CITE_AT[F.p]), src = F.cite ? specCellSrc(sp, F) : c ? "doc" : "def";
    return {field:F.l, path:F.p, value:Array.isArray(v) ? v.join("–") : v ?? null, source:({doc:"Doc", ans:"Seller", def:"Default", gap:"Gap"})[src] || src,
      confidence:src === "doc" ? ((sp.lowConfidence || []).includes(F.p) ? "low" : "medium") : null, citation:src === "doc" ? c || null : null}; });
  return {schema:"ModelPayload/2.1", template:"BB Cleaning Cost Model · master v1 (pinned)", generatedAt:new Date().toISOString(), engineVersion:ENGINE_VERSION,
    referenceData:{version:CMB_DATA.meta.version, status:CMB_DATA.meta.status, owner:CMB_DATA.meta.owner}, rateCard:rc,
    // Named ranges in the pinned master template (templates/CMB Master Template v1.xlsx). The populator writes these by name, never by address.
    inputs:{ClientName:sp.client.name, Sector:sp.client.sector || "", TermYears:num(sp.term.years) || 3, ExtensionYears:num(sp.term.ext), StartDate:sp.term.start || "", PaymentDays:num(sp.commercial.paymentDays),
      RateCard:RATECARD.id, NLW:RATECARD.NLW, NIRate:RATECARD.niRate, NIThresholdWk:RATECARD.niThresholdWk, WeeksPerYear:RATECARD.weeksPerYear,
      HolidayPct:num(val("holiday")), SSPPct:oc.ssp, PensionPct:oc.pension, TrainingPct:oc.training, LevyPct:RATECARD.levyPct, CreditPct:num(val("credits")),
      MaterialsPerHr:num(val("materials")), UniformPerHeadWk:0.45, TnAPerSiteWk:RATECARD.tnaPerSiteWk, AuditPerSiteWk:RATECARD.auditPerSiteWk,
      PLPct:plPct(), FactoringPct:num(val("factoring")), OverheadsPct:num(val("overheads")), ProfitPct:num(val("profit")),
      MgmtOnCostPct:T.margin.onCost, RebateWk:+T.rebate.toFixed(6)},
    sites:R.rows.map(r => ({id:r.s.id, name:r.s.name, region:r.s.region, format:r.s.format, sqft:r.s.sqft, hoursPerWeek:r.h, hoursSource:r.src, payRate:r.rate, headcount:r.hc, headcountSource:r.s.heads > 0 ? "client" : "calc", machineryPerWeek:r.machinery, cobot:!!r.cobot, expectedWeeklyCharge:r.charge})),
    machinery:{basis:val("machinery"), ratePerLabourHour:T.machRate, cobots:R.rows.filter(r => r.cobot).length},
    management:{roles:T.margin.roles, onCostPct:T.margin.onCost, weekly:+T.mgmt.toFixed(2)},
    controlTotals:{weeklyCharge:+T.charge.toFixed(2), annualCharge:+T.annual.toFixed(2), hours:T.hours, tolerancePct:0.5},
    flags:flags(R).filter(f => f.lvl !== "pass").map(f => ({level:f.lvl, text:f.t})), extraction,
    approval:{route:approvalRoute(R), signoff:signoffState(R).valid ? S.signoff : null}, feedback:(S.feedback || []).slice(), guideFeedback:(S.guideFeedback || []).slice(), assumptionsLog:log, audit:(S.audit || []).slice(), runs:S.runs.map(({state, ...r}) => r)};
}
/* ---------- State transitions shared by the UI and the harness ---------- */
function applyDocFacts(sp, F, name){
  const got = []; sp.docRead = true;
  if (F.client){ sp.client.name = F.client.v; sp.client.cite = F.client.cite; got.push("client"); }
  if (F.term){ sp.term.years = F.term.v; sp.term.cite = F.term.cite; got.push("term"); }
  if (F.ext){ sp.term.ext = F.ext.v; sp.term.extCite = F.ext.cite; got.push("extension"); }
  if (F.start){ sp.term.start = F.start.v; sp.term.startCite = F.start.cite; got.push("start date"); if (F.start.low) sp.lowConfidence = [...new Set((sp.lowConfidence || []).concat("term.start"))]; }
  if (F.pay){ sp.commercial.paymentDays = F.pay.v; sp.commercial.payCite = F.pay.cite; got.push("payment terms"); }
  if (F.min){ sp.service.minHours = F.min.v; sp.service.minHoursCite = F.min.cite; got.push("minimum hours"); }
  if (F.audit){ sp.service.auditPass = F.audit.v; sp.service.auditCite = F.audit.cite; got.push("audit pass mark"); }
  if (F.credits){ sp.commercial.credits = true; sp.commercial.credCite = F.credits.cite; got.push("credits"); }
  if (F.lw){ sp.livingWage = F.lw.v; sp.lwCite = F.lw.cite; got.push("living wage"); }
  if (F.equip){ sp.equipment.clientSupplied = F.equip.v === "client"; sp.equipment.eqCite = F.equip.cite; got.push("equipment"); }
  if (F.cobots){ sp.equipment.cobots = true; sp.equipment.cobotCite = F.cobots.cite; got.push("autonomous kit"); }
  if (F.tupe){ sp.commercial.tupeHeads = F.tupe.v; sp.commercial.tupeCite = F.tupe.cite; got.push("TUPE headcount"); }
  if (F.rebate){ sp.commercial.rebateInvited = true; sp.commercial.rebCite = F.rebate.cite; }
  if (F.idx){ sp.commercial.indexation = F.idx.v; sp.commercial.idxCite = F.idx.cite; }
  if (F.trade){ sp.service.tradingShare = F.trade.v; sp.service.tradeCite = F.trade.cite; got.push("trading-hours share"); }
  if (F.rateCard){ sp.commercial.rateCard = true; sp.commercial.rcCite = F.rateCard.cite; got.push("on-request rate card"); }
  if (F.tupeApplies && !F.tupe){ sp.commercial.tupeApplies = true; sp.commercial.tupeAppliesCite = F.tupeApplies.cite; got.push("TUPE applies (no headcount given)"); }
  if (F.brand && !F.client && !sp.client.name){ sp.client.hint = F.brand.v; sp.client.hintCite = F.brand.cite; got.push(`a suggested client name (${F.brand.v})`); }
  sp.notes.push(`${name}: found ${got.length ? got.join(", ") : "no recognised terms"}.`);
  return got;
}
// src is {sheets: [rows[]]} for a workbook or {text} for delimited text; the sheet with the most sites wins
function applySiteFile(sp, src, name){
  let best = null;
  if (src.sheets){ for (const rows of src.sheets){ const r = importRows(rows, name, null); if (r.sites.length && (!best || r.sites.length > best.sites.length)) best = r; } }
  else { const {rows, delim} = splitDelimited(src.text); best = importRows(rows, name, delim); }
  if (best && best.sites.length && best.sites.length >= sp.sites.length){ sp.sites = best.sites; S.importReport = best.rep; sp.sitesCite = {doc:name, page:0, text:`${best.sites.length} sites read from the workbook.`}; sp.notes.push(`${name}: ${best.sites.length} sites read.` + (best.rep.bad.length ? ` ${best.rep.bad.length} rows need attention (${[...new Set(best.rep.bad.map(b => b.reason))].join("; ")}).` : "")
      + (best.rep.areaSum ? ` Floor area = ${best.rep.areaSum.join(" + ")}.` : "") + (best.rep.formatMap ? ` Formats mapped: ${Object.entries(best.rep.formatMap).map(([k, v]) => `${k} → ${v}`).join(", ")}.` : "")); }
  else sp.notes.push(`${name}: no site list found.`);
  return best;
}
function applySites(sites, rep, citeText){
  S.spec.sites = sites; S.importReport = rep; S.overrides.siteHours = {};
  S.spec.sitesCite = {doc:rep.source, page:0, text:citeText || `${sites.length} sites loaded from ${rep.source}.`};
  delete S.answers.hoursMethod; delete S.answers.intensity; S.sitePage = 0;
  logEvent("sites.load", {source:rep.source, loaded:sites.length, bad:rep.bad.length});
}
function setSpecField(p, v){
  if (p === "client.name" && !v) v = null;
  const before = getPath(S.spec, p);
  setPath(S.spec, p, v); S.spec.fieldSrc[p] = "ans";
  // Answers that were only defaults follow the new facts
  ["payBasis", "machinery", "factoring", "headBasis", "hoursPerHead", "cobots", "rebate", "credits"].forEach(id => { if (S.answers[id] && S.answers[id].source !== "ans") delete S.answers[id]; });
  syncRateCard();
  logEvent("spec.set", {field:p, from:before ?? null, to:v ?? null});
}
/* ---------- OpportunitySpec/1.x: the Spec Extractor's output (schemas/opportunity-spec.schema.json) ---------- */
// Every fact the agent returns is validated against the survey-sheet field it fills. Nothing is trusted as internal state.
const OPP_SPEC = "OpportunitySpec/1.0";
const CITE_AT = {"client.name":"client.cite", "client.sector":"client.sectorCite", "term.years":"term.cite", "term.ext":"term.extCite", "term.start":"term.startCite",
  "commercial.paymentDays":"commercial.payCite", "commercial.credits":"commercial.credCite", "service.minHours":"service.minHoursCite", "service.auditPass":"service.auditCite",
  "service.tradingShare":"service.tradeCite", "livingWage":"lwCite", "equipment.clientSupplied":"equipment.eqCite", "equipment.cobots":"equipment.cobotCite",
  "commercial.rebate":"commercial.rebCite", "commercial.indexation":"commercial.idxCite", "commercial.tupeHeads":"commercial.tupeCite", "incumbentHours":"incCite",
  "commercial.rateCard":"commercial.rcCite", "commercial.tupeApplies":"commercial.tupeAppliesCite"};
const OPP_EXTRA = [{p:"commercial.rateCard", l:"On-request rate card wanted", type:"bool"}, {p:"commercial.tupeApplies", l:"TUPE applies", type:"bool"}];
const oppFields = () => SPEC_FIELDS.concat(OPP_EXTRA);
function parseRange(v){
  if (v == null || v === "") return {value:null};
  const a = Array.isArray(v) ? v.map(Number) : String(v).split(/\s*(?:-|–|—|to)\s*/i).map(x => Number(String(x).replace("%", "").trim()));
  const [lo, hi = lo] = a;
  if (a.length > 2 || !Number.isFinite(lo) || !Number.isFinite(hi) || lo < 0 || hi > 100 || lo > hi) return {error:"must be a percentage or a range such as 20–40"};
  return {value:[lo, hi]};
}
function coerceField(F, v){
  if (v === null) return {value:null};
  switch (F.type){
    case "number": { const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN; return Number.isFinite(n) && n >= F.min && n <= F.max ? {value:n} : {error:`must be a number from ${F.min} to ${F.max}`}; }
    case "bool": return typeof v === "boolean" ? {value:v} : {error:"must be true or false"};
    case "date": return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(new Date(v + "T12:00:00Z")) ? {value:v} : {error:"must be a date as YYYY-MM-DD"};
    case "range": return parseRange(v);
    case "select": { if (F.p === "equipment.clientSupplied") return typeof v === "boolean" ? {value:v} : v === "true" || v === "false" ? {value:v === "true"} : {error:"must be true (client) or false (supplier)"};
      return F.opts.some(([k]) => k && k === v) ? {value:v} : {error:`must be one of ${F.opts.filter(([k]) => k).map(([k]) => k).join(", ")}`}; }
    default: return typeof v === "string" && v.trim() && v.length <= 200 ? {value:v.trim()} : {error:"must be text of up to 200 characters"};
  }
}
function cleanCite(c){
  if (!c || typeof c !== "object" || typeof c.doc !== "string" || !c.doc.trim()) return null;
  const q = typeof c.text === "string" ? c.text : typeof c.quote === "string" ? c.quote : "";
  if (!q.trim()) return null;
  const out = {doc:c.doc.trim().slice(0, 200)};
  if (Number.isInteger(c.page) && c.page >= 0) out.page = c.page;
  if (Number.isInteger(c.para) && c.para > 0) out.para = c.para;
  out.text = q.length > 240 ? q.slice(0, 237) + "…" : q;
  return out;
}
function applyOpportunitySpec(sp, X){
  if (!X || typeof X !== "object" || !/^OpportunitySpec\/1\.\d+$/.test(String(X.schema || ""))) throw new Error(`not an OpportunitySpec/1.x document (schema "${X && X.schema}")`);
  const res = {applied:[], rejected:[], low:[], notFound:[], sites:0}, defs = Object.fromEntries(oppFields().map(F => [F.p, F]));
  const who = (X.extractedBy && typeof X.extractedBy.agent === "string" && X.extractedBy.agent.slice(0, 80)) || "Spec Extractor";
  for (const [p, f] of Object.entries(X.fields && typeof X.fields === "object" ? X.fields : {})){
    const F = defs[p];
    if (!F){ res.rejected.push({field:p, reason:"not a survey-sheet field"}); continue; }
    if (!f || typeof f !== "object" || !("value" in f)){ res.rejected.push({field:p, reason:"no value"}); continue; }
    const v = coerceField(F, f.value);
    if (v.error){ res.rejected.push({field:p, reason:v.error}); continue; }
    if (v.value == null){ res.notFound.push(p); continue; }
    const cite = cleanCite(f.citation);
    if (!cite){ res.rejected.push({field:p, reason:"no citation (every fact needs the document and the quoted text)"}); continue; }
    const conf = ["high", "medium", "low"].includes(f.confidence) ? f.confidence : "medium";
    if (p === "client.name" && conf === "low"){ sp.client.hint = v.value; sp.client.hintCite = cite; res.low.push(p); continue; }   // a guess is a suggestion, never the name
    setPath(sp, p, v.value); setPath(sp, CITE_AT[p], cite); delete sp.fieldSrc[p]; res.applied.push(p);
    if (conf === "low") res.low.push(p);
  }
  (Array.isArray(X.notFound) ? X.notFound : []).filter(p => defs[p] && !res.applied.includes(p) && !res.notFound.includes(p)).forEach(p => res.notFound.push(p));
  const rows = X.sites && Array.isArray(X.sites.rows) ? X.sites.rows : [];
  if (rows.length){
    const cite = cleanCite(X.sites.citation) || {doc:who, text:`${rows.length} sites returned by ${who}.`};
    const hdr = ["Site ID", "Site", "Region", "Format", "Sq ft", "Hours per week", "Headcount", "Postcode", "Address", "Latitude", "Longitude"];
    const r = importRows([hdr].concat(rows.map(x => x && typeof x === "object" ? [x.id, x.name, x.region, x.format, x.sqft, x.hoursPerWeek, x.headcount, x.postcode, x.address, x.lat, x.lon] : [])), cite.doc, null);
    if (r.sites.length && r.sites.length >= sp.sites.length){ sp.sites = r.sites; sp.sitesCite = cite; if (S) S.importReport = r.rep; res.sites = r.sites.length; }
    if (r.rep.bad.length) res.rejected.push({field:"sites", reason:`${r.rep.bad.length} site rows could not be read (${r.rep.bad.slice(0, 3).map(b => `row ${b.line - 1}: ${b.reason}`).join("; ")})`});
  }
  sp.docRead = true;
  sp.lowConfidence = [...new Set((sp.lowConfidence || []).concat(res.low))];
  sp.notes.push(`${who}: ${res.applied.length} fact${res.applied.length === 1 ? "" : "s"} with citations${res.sites ? `, ${res.sites} sites` : ""}${res.low.length ? `; ${res.low.length} low confidence` : ""}${res.notFound.length ? `; ${res.notFound.length} not stated` : ""}${res.rejected.length ? `; ${res.rejected.length} rejected (${res.rejected.slice(0, 4).map(r => `${r.field}: ${r.reason}`).join("; ")})` : ""}.`);
  return res;
}
// The survey sheet as an OpportunitySpec: what the rules (or the seller) found, with citations, and what the documents did not state
function toOpportunitySpec(sp, meta = {}){
  const fields = {}, notFound = [];
  for (const F of oppFields()){
    const v = getPath(sp, F.p), c = getPath(sp, CITE_AT[F.p]);
    if (c && v != null && v !== "") fields[F.p] = {value:v, citation:c, confidence:(sp.lowConfidence || []).includes(F.p) ? "low" : "medium"};
    else if (sp.docRead) notFound.push(F.p);
  }
  if (!sp.client.name && sp.client.hint && sp.client.hintCite){ fields["client.name"] = {value:sp.client.hint, citation:sp.client.hintCite, confidence:"low"}; const i = notFound.indexOf("client.name"); if (i >= 0) notFound.splice(i, 1); }
  const out = {schema:OPP_SPEC, extractedBy:{agent:meta.agent || "Cost Model Builder rules", version:ENGINE_VERSION, at:new Date().toISOString()}, documents:meta.documents || [], fields, notFound};
  if (sp.sites.length) out.sites = {citation:sp.sitesCite, rows:sp.sites.map(s => Object.assign({id:s.id, name:s.name, region:s.region || null, format:s.format, sqft:s.sqft ?? null, hoursPerWeek:s.clientHours ?? null, headcount:s.heads ?? null},
    s.postcode ? {postcode:s.postcode} : {}, s.address ? {address:s.address} : s.geoHint ? {address:s.geoHint} : {}, s.lat != null && (s.geoSrc === "file" || s.geoSrc === "grid" || s.geoSrc === "manual") ? {lat:s.lat, lon:s.lon} : {}))};
  return out;
}
/* ---------- Approval route and the seller's sign-off ---------- */
// Who must approve this price and why. The thresholds are CMB_DATA.approval, owned by commercial finance.
function approvalRoute(R){
  R = R || compute(); if (!R) return null;
  const T = R.T, A = APPROVAL, chal = num(val("hoursChallenge")), dir = [], fin = [];
  if (chal > A.maxHoursChallengePct && val("hoursMethod") === "client") dir.push(`hours priced ${chal}% under the client's (policy limit ${A.maxHoursChallengePct}%)`);
  if (T.contrib < A.minProfitPct) dir.push(`profit ${T.contrib.toFixed(2)}% is below the ${A.minProfitPct}% floor`);
  if (T.labourPct > A.maxLabourPct) dir.push(`labour is ${T.labourPct.toFixed(1)}% of revenue (limit ${A.maxLabourPct}%)`);
  if (T.revPerHr < A.minRevPerHr || T.revPerHr > A.maxRevPerHr) dir.push(`revenue per labour hour £${T.revPerHr.toFixed(2)} is outside £${A.minRevPerHr.toFixed(2)}–£${A.maxRevPerHr.toFixed(2)}`);
  if (T.annual >= A.secondApproverAnnual) fin.push(`annual value £${(T.annual / 1e6).toFixed(2)}m is at or above £${(A.secondApproverAnnual / 1e6).toFixed(0)}m`);
  const approvers = [{role:"Bid manager", why:"prepares the first pass and signs off the checks"},
    dir.length ? {role:"Commercial director", why:dir.join("; "), exception:true} : {role:"Commercial manager", why:"the price is inside every policy threshold"}];
  if (fin.length) approvers.push({role:"Finance director", why:fin.join("; "), exception:true});
  return {level:fin.length ? "finance" : dir.length ? "director" : "standard", approvers, exceptions:dir.concat(fin), policyVersion:CMB_DATA.meta.version};
}
// The sign-off is for one price. Any change to the charge or the site count makes it stale.
function signoffState(R){
  const s = S.signoff; R = R || compute();
  if (!s || !R) return {valid:false, stale:false};
  const valid = Math.abs(s.weeklyCharge - +R.T.charge.toFixed(2)) < 0.005 && s.sites === R.rows.length;
  return Object.assign({}, s, {valid, stale:!valid});
}
function signOff(by, R){
  R = R || compute(); if (!R) throw new Error("nothing to sign off");
  const F = flags(R);
  if (F.some(f => f.lvl === "block")) throw new Error("clear the blocking checks first");
  S.signoff = {by:(by || (S.user && S.user.name) || "standalone user").slice(0, 120), at:new Date().toISOString(), weeklyCharge:+R.T.charge.toFixed(2), sites:R.rows.length,
    warnings:F.filter(f => f.lvl === "warn").length, lowConfidence:(S.spec.lowConfidence || []).length, route:approvalRoute(R).level};
  logEvent("signoff", S.signoff);
  return S.signoff;
}
/* ---------- What the model tells us: one price read at five scales (£1 → hour → site → estate → contract) ---------- */
// Pure read-outs of compute(). The UI only draws them, so the node harness can test every figure the seller is shown.
const MONEY = v => { const a = Math.abs(v), s = v < 0 ? "−" : ""; return s + (a >= 1e6 ? "£" + (a / 1e6).toFixed(a >= 1e8 ? 0 : a >= 1e7 ? 1 : 2) + "m" : a >= 1e4 ? "£" + Math.round(a / 1e3) + "k" : a >= 1e3 ? "£" + (a / 1e3).toFixed(1) + "k" : "£" + Math.round(a)); };
const PENNY = v => v >= 1 ? "£" + v.toFixed(2) : Math.round(v * 100) + "p";
// Integer shares that add to exactly 100 (largest remainder), so the £1 grid never shows 99p or 101p.
function wholeShares(vals, total = 100){
  const t = vals.reduce((a, b) => a + Math.max(0, b), 0) || 1, raw = vals.map(v => Math.max(0, v) / t * total), fl = raw.map(Math.floor);
  let left = total - fl.reduce((a, b) => a + b, 0);
  raw.map((v, i) => [v - fl[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).forEach(([, i]) => { if (left > 0){ fl[i]++; left--; } });
  return fl;
}
// Each lever moved a realistic step either way, the whole model re-priced, and S put back exactly as it was.
function sensitivity(){
  const A0 = S.answers, O0 = S.overrides, snap = JSON.stringify({a:A0, o:O0}), out = [];
  const R0 = compute(); if (!R0) return out;
  const base = R0.T.annual, sp = S.spec;
  const run = fn => { const k = JSON.parse(snap); S.answers = k.a; S.overrides = k.o; fn(); const R = compute(); return R ? R.T.annual : base; };
  const setA = (id, v) => { S.answers[id] = {value:v, source:"ans"}; };
  const add = (id, l, go, loLab, hiLab, lo, hi) => { const a = run(lo) - base, b = run(hi) - base; out.push({id, l, go, lo:{lab:loLab, d:a}, hi:{lab:hiLab, d:b}, span:Math.abs(b - a)}); };
  try {
    const cx = hoursContext();
    if (sp.sites.every(s => s.uid)){
      const hrs = sp.sites.map(s => [s.uid, siteHours(s, cx).h]);
      const scale = f => () => { S.overrides.siteHours = Object.fromEntries(hrs.map(([u, h]) => [u, Math.max(cx.minH, h * f)])); };
      add("hours", "Weekly hours at every site", "sites", "10% fewer", "10% more", scale(0.9), scale(1.1));
    }
    const prem = num(val("payPremium")), pLo = Math.max(0, prem - 25);
    add("pay", "Hourly pay", "price", pLo === prem ? "already at the floor" : `${prem - pLo}p less`, "25p more", () => setA("payPremium", pLo), () => setA("payPremium", prem + 25));
    if (val("headBasis") !== "curve" && val("headBasis") !== "tupe" && !sp.sites.every(s => s.heads > 0)){
      const hph = num(val("hoursPerHead")) || flatHead(sp);
      add("heads", "Hours per operative", "price", "2 hrs fewer", "2 hrs more", () => setA("hoursPerHead", Math.max(4, hph - 2)), () => setA("hoursPerHead", hph + 2));
    }
    const mat = num(val("materials"));
    add("materials", "Materials per hour", "price", mat >= 0.1 ? "10p less" : "none", "10p more", () => setA("materials", Math.max(0, mat - 0.1)), () => setA("materials", mat + 0.1));
    const mr = machRate();
    add("machinery", "Machinery per hour", "price", mr >= 0.1 ? "10p less" : "none", "10p more", () => { S.overrides.machRate = Math.max(0, mr - 0.1); }, () => { S.overrides.machRate = mr + 0.1; });
    if (O0.mgmt) add("mgmt", "Management team", "price", "20% smaller", "20% larger", () => { S.overrides.mgmt.forEach(r => { r.fte = num(r.fte) * 0.8; }); }, () => { S.overrides.mgmt.forEach(r => { r.fte = num(r.fte) * 1.2; }); });
    else { const ratio = num(val("mgmtRatio")) || MGMT.hoursPerAreaManager;
      add("mgmt", "Area managers", "price", "20% fewer", "20% more", () => setA("mgmtRatio", ratio * 1.25), () => setA("mgmtRatio", ratio / 1.2)); }
    const pr = num(val("profit")), oh = num(val("overheads")), fa = num(val("factoring"));
    add("profit", "Profit margin", "questions", pr >= 1 ? "1 point less" : "none", "1 point more", () => setA("profit", Math.max(0, pr - 1)), () => setA("profit", pr + 1));
    add("overheads", "Overheads", "price", oh >= 0.5 ? "0.5 point less" : "none", "0.5 point more", () => setA("overheads", Math.max(0, oh - 0.5)), () => setA("overheads", oh + 0.5));
    add("factoring", "Working-capital charge", "questions", fa >= 0.5 ? "0.5 point less" : "none", "0.5 point more", () => setA("factoring", String(Math.max(0, fa - 0.5))), () => setA("factoring", String(fa + 0.5)));
  } finally { S.answers = A0; S.overrides = O0; compute(); }
  return out.sort((a, b) => b.span - a.span || a.id.localeCompare(b.id));
}
function insights(R){
  R = R || compute(); if (!R) return null;
  const T = R.T, sp = S.spec, W = RATECARD.weeksPerYear, n = R.rows.length, H = T.hours || 1;
  const credit = R.rows.reduce((a, r) => a + r.creditAllow, 0);
  // £1: the same seven parts, order and colours as the price trace's margin stack
  const parts = [["labour", "Labour", T.labour], ["materials", "Materials", T.materials], ["kit", "Kit & other", T.machinery + T.uniforms + T.other],
    ["mgmt", "Management", T.mgmt + T.rebate], ["plf", "PL & factoring", T.pl + T.fact], ["oh", "Overheads", T.oh], ["profit", "Profit", T.profit]];
  const pc = wholeShares(parts.map(p => p[2]));
  const pound = parts.map((p, i) => ({k:p[0], l:p[1], weekly:p[2], share:p[2] / T.charge, p:pc[i]}));
  const P = k => pound.find(x => x.k === k).p;
  const costP = 100 - P("profit");
  const sum = k => R.rows.reduce((a, r) => a + r[k], 0);
  // Pure wage (hours × pay rate) against the on-costs stacked on it; wage + on-costs + risk allowance is the labour line exactly
  const onCosts = sum("holiday") + T.ni + sum("ons");
  const lab = pound.find(x => x.k === "labour"), wageP = Math.min(lab.p, Math.round(T.wages / T.charge * 100));
  lab.split = {wage:wageP, on:lab.p - wageP};
  const areaRows = R.rows.filter(r => r.s.sqft > 0 && r.h > 0), aSq = areaRows.reduce((a, r) => a + r.s.sqft, 0);
  const aH = areaRows.reduce((a, r) => a + r.h, 0), aW = areaRows.reduce((a, r) => a + r.wages, 0);
  const wb = BENCH.wagePct || null, wageShare = T.wages / T.charge;
  const wage = {weekly:T.wages, share:wageShare, onCosts, onShare:onCosts / T.charge, credit, uplift:T.wages ? onCosts / T.wages : 0, multiple:T.wages ? T.charge / T.wages : 0,
    perHr:T.wages / H, bench:wb, pos:!wb ? null : wageShare * 100 < wb.lo ? "below" : wageShare * 100 > wb.hi ? "above" : "inside",
    prod:aSq && aH ? {n:areaRows.length, of:R.rows.filter(r => r.h > 0).length, sqftPerHr:aSq / aH, wagePer1k:aW / aSq * 1000, hrsPer1k:aH / aSq * 1000,
      bench:{sqftPerHr:BENCH.sqftPerHr || null, wagePer1k:BENCH.wagePer1k || null}} : null};
  // One billed hour
  const hourParts = [["pay", "labour", "Operative's pay", T.wages], ["holiday", "labour", "Holiday cover", sum("holiday")], ["ni", "labour", "Employer NI", T.ni],
    ["ons", "labour", "SSP, pension, training, levy", sum("ons")], ["credit", "labour", "Delivery-risk allowance", credit],
    ["materials", "materials", "Materials", T.materials], ["kit", "kit", "Machinery, uniforms, T&A and audit", T.machinery + T.uniforms + T.other],
    ["mgmt", "mgmt", "Management", T.mgmt + T.rebate], ["plf", "plf", "PL and factoring", T.pl + T.fact], ["oh", "oh", "Overheads", T.oh], ["profit", "profit", "Profit", T.profit]]
    .filter(p => p[3] > 1e-9).map(([k, g, l, v]) => ({k, g, l, perHr:v / H, share:v / T.charge}));
  const band = BENCH.revPerHr, rph = T.revPerHr, bandPos = rph < band.lo ? "below" : rph > band.hi ? "above" : "inside";
  // One site
  const live = R.rows.map((r, i) => ({i, id:r.s.id, name:r.s.name, format:r.s.format, clientFormat:r.s.clientFormat || null, region:r.s.region || "", sqft:r.s.sqft || null,
    h:r.h, hc:r.hc, charge:r.charge, annual:r.charge * W, perHr:r.h ? r.charge / r.h : 0, rate:r.rate, src:r.src, lifted:!!r.lifted, cobot:!!r.cobot,
    wages:r.wages, onCosts:r.holiday + r.ni + r.ons, labour:r.labour + r.creditAllow, wagePct:r.charge ? r.wages / r.charge : 0,
    sqftPerHr:r.s.sqft > 0 && r.h ? r.s.sqft / r.h : null, wagePer1k:r.s.sqft > 0 ? r.wages / r.s.sqft * 1000 : null})).filter(p => p.h > 0);
  const byCharge = live.slice().sort((a, b) => a.charge - b.charge || a.i - b.i);
  const pick = {typical:byCharge[Math.floor((byCharge.length - 1) / 2)] || null, largest:byCharge.at(-1) || null, smallest:byCharge[0] || null};
  const withArea = live.filter(p => p.sqft).length;
  // Least-squares line through the origin: hours a week per 1,000 sq ft, and how much of the scatter it explains
  let fit = null;
  if (withArea >= 3){
    const a = live.filter(p => p.sqft), sxy = a.reduce((s, p) => s + p.sqft / 1000 * p.h, 0), sxx = a.reduce((s, p) => s + (p.sqft / 1000) ** 2, 0);
    const slope = sxx ? sxy / sxx : 0, my = a.reduce((s, p) => s + p.h, 0) / a.length;
    const ssr = a.reduce((s, p) => s + (p.h - slope * p.sqft / 1000) ** 2, 0), sst = a.reduce((s, p) => s + (p.h - my) ** 2, 0);
    fit = {per1k:slope, r2:sst > 1e-9 ? Math.max(0, 1 - ssr / sst) : 1};
  }
  // Estate
  const desc = byCharge.slice().reverse(), tot = desc.reduce((a, p) => a + p.charge, 0) || 1;
  let cum = 0; const cumShare = desc.map(p => (cum += p.charge) / tot);
  const nAt = f => { const k = cumShare.findIndex(c => c >= f - 1e-12); return k < 0 ? desc.length : k + 1; };
  const step = Math.max(1, Math.ceil(desc.length / 240));
  const curve = [{x:0, y:0}].concat(cumShare.map((y, k) => ({x:(k + 1) / desc.length, y})).filter((_, k) => k % step === 0 || k === desc.length - 1));
  const group = key => { const g = {}; R.rows.forEach(r => { const k = key(r) || "Not stated"; const x = g[k] = g[k] || {k, n:0, hours:0, charge:0, wages:0, sqft:0, aH:0, aW:0}; x.n++; x.hours += r.h; x.charge += r.charge; x.wages += r.wages;
      if (r.s.sqft > 0 && r.h > 0){ x.sqft += r.s.sqft; x.aH += r.h; x.aW += r.wages; } });
    return Object.values(g).map(fin).sort((a, b) => b.charge - a.charge || a.k.localeCompare(b.k)); };
  const fin = x => Object.assign(x, {share:x.charge / T.charge, wagePct:x.charge ? x.wages / x.charge : 0, sqftPerHr:x.aH ? x.sqft / x.aH : null, wagePer1k:x.sqft ? x.aW / x.sqft * 1000 : null});
  const byFormat = group(r => r.s.format);
  let byRegion = group(r => r.s.region);
  if (byRegion.length > 9){ const rest = byRegion.slice(8), tot = k => rest.reduce((a, x) => a + x[k], 0);
    byRegion = byRegion.slice(0, 8).concat([fin({k:`${rest.length} other regions`, other:true, n:tot("n"), hours:tot("hours"), charge:tot("charge"), wages:tot("wages"), sqft:tot("sqft"), aH:tot("aH"), aW:tot("aW")})]); }
  const SRC_ORDER = ["doc", "ans", "est", "bm", "def"], SRC_L = {doc:"Client's hours", ans:"Your figures", est:"Filled at the client's density", bm:"Size curve from past bids", def:"Flat default"};
  const ev = group(r => r.src).map(x => Object.assign(x, {src:x.k, l:SRC_L[x.k] || x.k})).sort((a, b) => SRC_ORDER.indexOf(a.src) - SRC_ORDER.indexOf(b.src));
  const firm = ev.filter(x => x.src === "doc" || x.src === "ans").reduce((a, x) => a + x.share, 0);
  // Contract
  const years = Math.max(1, num(sp.term.years) || 3), ext = num(sp.term.ext), payDays = num(sp.commercial.paymentDays) || 30;
  const tornado = sensitivity(), route = approvalRoute(R), F = flags(R);
  const raise = F.filter(f => f.lvl === "block" || f.lvl === "warn").map(f => ({lvl:f.lvl, t:f.t, go:f.go || null}));
  const pct = v => Math.round(v * 100);
  const I = {
    pound, wage, perHour:{rev:rph, parts:hourParts, band, bandPos, pay:T.wages / H, wagePct:wageShare, multiple:wage.multiple, uplift:wage.uplift},
    site:{n, live:live.length, withArea, fit, points:live, pick, spread:pick.smallest && pick.smallest.charge ? pick.largest.charge / pick.smallest.charge : null},
    estate:{n50:nAt(0.5), n80:nAt(0.8), concentrated:desc.length >= 5 && nAt(0.5) / desc.length < 0.2, curve, count:desc.length, byFormat, byRegion, evidence:ev, firm},
    contract:{weekly:T.charge, annual:T.annual, years, term:T.contract, ext, termExt:T.contractExt, capex:T.capex, payDays, workingCapital:T.annual / 365 * payDays, profitTerm:T.profit * W * years, wagesTerm:T.wages * W * years, tornado, route, raise},
    takeaways:{}
  };
  const tp = pick.typical, fmtN = v => Math.round(v).toLocaleString("en-GB");
  I.takeaways.pound = `${lab.split.wage}p of every £1 is the cleaners' pay, and ${lab.split.on}p more covers NI, holiday, pension and the other employment costs. We keep ${P("profit")}p as profit; the other ${costP - lab.p}p is materials, kit, management and overheads.`;
  const mult = wage.multiple ? `£${wage.multiple.toFixed(2)}` : "£0";
  I.takeaways.hour = `Each hour is billed at ${PENNY(rph)}. The operative is paid ${PENNY(T.wages / H)} of it (${Math.round(wageShare * 100)}%), so every £1 of pay is billed at ${mult}. That is ${bandPos} the past-bid range of ${PENNY(band.lo)} to ${PENNY(band.hi)}.`;
  const per1k = fit ? (fit.per1k >= 10 ? fmtN(fit.per1k) : fit.per1k.toFixed(1)) : "";
  const siteLead = !fit ? (I.site.spread && I.site.spread >= 1.5 ? `The largest site is billed ${I.site.spread >= 10 ? fmtN(I.site.spread) : I.site.spread.toFixed(1)} times the smallest. ` : "")
    : fit.r2 >= 0.7 ? `Hours follow floor area: about ${per1k} hrs a week for every 1,000 sq ft. `
    : fit.r2 >= 0.4 ? `Hours broadly follow floor area, about ${per1k} hrs a week per 1,000 sq ft, with wide gaps between sites of the same size. `
    : `Hours do not follow floor area: sites of the same size carry very different hours, so check the outliers. `;
  const pr1 = wage.prod, pb = pr1 && pr1.bench.sqftPerHr;
  const prodLead = pr1 ? ` Each weekly hour covers ${fmtN(pr1.sqftPerHr)} sq ft${pb ? ` (past bids ${fmtN(pb.lo)}–${fmtN(pb.hi)})` : ""}, and pay costs ${PENNY(pr1.wagePer1k)} a week per 1,000 sq ft.` : "";
  I.takeaways.site = tp ? `${siteLead}A typical site, ${tp.name}, needs ${fmtN(tp.h)} hrs and ${tp.hc} operative${tp.hc === 1 ? "" : "s"}, billed ${MONEY(tp.charge)} a week.${prodLead}` : "No site has any hours yet.";
  const n50 = I.estate.n50, cnt = desc.length.toLocaleString("en-GB");
  I.takeaways.estate = `${desc.length < 5 ? `${n50.toLocaleString("en-GB")} of ${cnt} site${desc.length === 1 ? "" : "s"} carr${n50 === 1 ? "ies" : "y"} half the charge.`
    : I.estate.concentrated ? `The price is concentrated: the largest ${n50.toLocaleString("en-GB")} of ${cnt} sites carry half of it. Survey those first.`
    : `The charge is spread across the estate: it takes ${n50.toLocaleString("en-GB")} of ${cnt} sites to reach half of it, so no small group decides the price.`} ${pct(firm) >= 100 ? "All of the price rests on hours the client gave or you set." : pct(firm) <= 0 ? "None of the price rests on client hours; every site is estimated." : `${pct(firm)}% of the price rests on hours the client gave or you set; ${100 - pct(firm)}% on hours we estimated.`}`;
  const top = tornado[0];
  I.takeaways.contract = `${MONEY(T.annual)} a year, ${MONEY(T.contract)} over ${years} year${years === 1 ? "" : "s"}, of which ${MONEY(I.contract.wagesTerm)} is cleaners' pay.${top ? ` ${top.l} moves it most: ${top.hi.lab} adds ${MONEY(Math.abs(top.hi.d))} a year.` : ""} ${route.level === "standard" ? "A commercial manager can approve it." : route.level === "director" ? "It needs the commercial director." : "It needs the finance director."}`;
  return I;
}
function insightsText(I){
  I = I || insights(); if (!I) return "";
  const t = I.takeaways, c = I.contract;
  return [`What the model tells us: ${clientLabel()}`, `${S.spec.sites.length.toLocaleString("en-GB")} sites · ${Math.round(I.site.points.reduce((a, p) => a + p.h, 0)).toLocaleString("en-GB")} hrs a week · ${MONEY(c.weekly)} a week`, "",
    `£1: ${t.pound}`, `One hour: ${t.hour}`, `One site: ${t.site}`, `The estate: ${t.estate}`, `The contract: ${t.contract}`, "",
    `Pay: wages are ${(I.wage.share * 100).toFixed(1)}% of the price${I.wage.bench ? ` (past bids ${I.wage.bench.lo}–${I.wage.bench.hi}%)` : ""}; NI, holiday, pension and other employment costs add ${(I.wage.uplift * 100).toFixed(1)}% on top of pay.${I.wage.prod ? ` Productivity: ${Math.round(I.wage.prod.sqftPerHr).toLocaleString("en-GB")} sq ft per weekly hour, pay ${PENNY(I.wage.prod.wagePer1k)} a week per 1,000 sq ft (${I.wage.prod.n.toLocaleString("en-GB")} of ${I.wage.prod.of.toLocaleString("en-GB")} sites have a floor area).` : ""}`, "",
    "What moves the price most (a year):"].concat(c.tornado.slice(0, 5).map(x => `  ${x.l}: ${x.lo.lab} ${x.lo.d >= 0 ? "+" : ""}${MONEY(x.lo.d)}, ${x.hi.lab} ${x.hi.d >= 0 ? "+" : ""}${MONEY(x.hi.d)}`))
    .concat(c.raise.length ? ["", "Raise before sign-off:"].concat(c.raise.map(f => `  ${f.lvl === "block" ? "Must fix" : "Check"}: ${f.t}`)) : [])
    .join("\n");
}
/* ---------- Estate map: offline geocoder and map model ---------- */
// data/geo/*.js is loaded on demand and sets CMB_GEO_AREAS, CMB_GEO_PC and CMB_GEO_PLACES. Nothing here goes to the network.
// A site is placed by the best thing it gives: its own coordinates, then its postcode sector or district, a place name, a local authority, then its region.
const GEO_SRC_L = {file:"Coordinates in the site list", grid:"OS grid reference in the site list", manual:"Placed by you", sector:"Postcode", district:"Postcode district",
  place:"Town or place name", lad:"Local authority", region:"Region only", none:"Not placed"};
const GEO_CONF_OF = {file:"exact", grid:"exact", manual:"exact", sector:"high", district:"medium", place:"medium", lad:"low", region:"low", none:"none"};
const REGION_ALIAS = [[/northern ireland|\bulster\b|^n\.? ?i\.?$/, "TLN"], [/london/, "TLI"], [/north[\s-]*east|^ne$|tyne|northumb|durham|teesside/, "TLC"],
  [/north[\s-]*west|^nw$|lancashire|cheshire|merseyside|cumbria|manchester/, "TLD"], [/yorks|humber/, "TLE"], [/east[\s-]*mid|derbyshire|nottingham|leicester|lincoln|northampton/, "TLF"],
  [/west[\s-]*mid|stafford|warwick|worcester|shropshire|hereford/, "TLG"], [/south[\s-]*east|home counties|^se$|kent|surrey|sussex|hampshire|berkshire|oxford|buckingham|isle of wight/, "TLJ"],
  [/south[\s-]*west|west country|^sw$|devon|cornwall|somerset|dorset|gloucester|wiltshire|avon/, "TLK"], [/east of england|east anglia|eastern|^east$|essex|norfolk|suffolk|cambridge|hertford|bedford/, "TLH"],
  [/wales|cymru/, "TLL"], [/scotland|highlands|lothian|strathclyde|grampian/, "TLM"]];
const PLACE_ALIAS = {hull:"kingston upon hull", newcastle:"newcastle upon tyne", stoke:"stoke on trent", southend:"southend on sea", bexhill:"bexhill on sea", staines:"staines upon thames",
  barrow:"barrow in furness", clacton:"clacton on sea", burton:"burton upon trent", leamington:"royal leamington spa", "leamington spa":"royal leamington spa",
  // shopping centres and districts that are not settlements in OS Open Names
  "canary wharf":"poplar", barbican:"city of london", "oxford street":"london", "oxford st":"london", "covent garden":"london", bluewater:"greenhithe", merryhill:"brierley hill",
  "merry hill":"brierley hill", meadowhall:"sheffield", metrocentre:"gateshead", "metro centre":"gateshead", teesside:"middlesbrough", lakeside:"west thurrock",
  "cribbs causeway":"patchway", braehead:"renfrew", silverburn:"pollok", "trafford centre":"trafford park", "white rose":"leeds", "westfield stratford":"stratford", "westfield london":"shepherds bush"};
// OS Open Names covers Great Britain only, so Northern Ireland towns go to their council
const NI_TOWN = {derry:"Derry City and Strabane", londonderry:"Derry City and Strabane", strabane:"Derry City and Strabane", ballymena:"Mid and East Antrim", larne:"Mid and East Antrim",
  carrickfergus:"Mid and East Antrim", antrim:"Antrim and Newtownabbey", newtownabbey:"Antrim and Newtownabbey", glengormley:"Antrim and Newtownabbey", lisburn:"Lisburn and Castlereagh",
  castlereagh:"Lisburn and Castlereagh", newry:"Newry, Mourne and Down", downpatrick:"Newry, Mourne and Down", newcastle:"Newry, Mourne and Down", coleraine:"Causeway Coast and Glens",
  ballymoney:"Causeway Coast and Glens", limavady:"Causeway Coast and Glens", portrush:"Causeway Coast and Glens", enniskillen:"Fermanagh and Omagh", omagh:"Fermanagh and Omagh",
  armagh:"Armagh City, Banbridge and Craigavon", banbridge:"Armagh City, Banbridge and Craigavon", craigavon:"Armagh City, Banbridge and Craigavon", portadown:"Armagh City, Banbridge and Craigavon",
  lurgan:"Armagh City, Banbridge and Craigavon", dungannon:"Mid Ulster", cookstown:"Mid Ulster", magherafelt:"Mid Ulster", newtownards:"Ards and North Down", bangor:"Ards and North Down",
  holywood:"Ards and North Down", belfast:"Belfast"};
const GEO_STOP = new Set(("the and of at in on st store stores shop shops retail park centre center high street road lane way avenue close drive court house unit units mall market station square plaza " +
  "extra express superstore super local metro outlet hub depot office offices hq dc warehouse clinic north south east west central city town new old great little upper lower green hill bridge " +
  "cross end gate row place quay wharf village shopping precinct arcade parade site branch area region zone large medium small format fort point view field fields gardens").split(" "));
const geoFold = s => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/['’.]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
let GEO_IX = null;
function geoIndex(){
  const g = globalThis, A = g.CMB_GEO_AREAS, P = g.CMB_GEO_PC, N = g.CMB_GEO_PLACES;
  if (!A || !P) return null;
  if (GEO_IX && GEO_IX.A === A && GEO_IX.P === P && GEO_IX.N === N) return GEO_IX;
  const table = s => { const m = new Map(); for (const r of s.split(";")){ const [k, la, lo, i] = r.split("|"); if (k) m.set(k, {lat:+la, lon:+lo, lad:i === "" || i == null ? null : +i}); } return m; };
  const places = new Map(); if (N) for (const r of N.places.split(";")){ const [n, rk, la, lo, amb] = r.split("|"); const k = geoFold(n); if (k && !places.has(k)) places.set(k, {n, rank:+rk, lat:+la, lon:+lo, amb:amb === "1"}); }
  const lads = new Map(); A.lads.forEach((l, i) => lads.set(geoFold(l.nm), i));
  const box = p => { let x0 = 180, y0 = 90, x1 = -180, y1 = -90; for (const poly of p) for (const ring of poly) for (let i = 0; i < ring.length; i += 2){ const x = ring[i], y = ring[i + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return [x0, y0, x1, y1]; };
  const regIx = {}; A.regions.forEach((r, i) => { regIx[r.cd] = i; });
  GEO_IX = {A, P, N, sectors:table(P.sectors), districts:table(P.districts), places, lads, ladBox:A.lads.map(l => box(l.p)), regIx, attribution:A.attribution};
  return GEO_IX;
}
function inPolys(x, y, polys){
  for (const poly of polys){ let c = false;
    for (const r of poly) for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2){ const xi = r[i], yi = r[i + 1], xj = r[j], yj = r[j + 1]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; }
    if (c) return true; }
  return false;
}
// The local authority a point falls in; a coastal point just outside the simplified coastline takes the nearest one within about 20 km
function ladAt(ix, lat, lon){
  const L = ix.A.lads;
  for (let i = 0; i < L.length; i++){ const b = ix.ladBox[i]; if (lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3] && inPolys(lon, lat, L[i].p)) return i; }
  let best = null, bd = 0.3; const k = Math.cos(lat * Math.PI / 180);
  for (let i = 0; i < L.length; i++){ const b = ix.ladBox[i], dx = Math.max(b[0] - lon, 0, lon - b[2]) * k, dy = Math.max(b[1] - lat, 0, lat - b[3]); const d = Math.hypot(dx, dy); if (d < bd){ bd = d; best = i; } }
  return best;
}
function regionCode(text){ const t = geoFold(text); if (!t) return null; const hit = REGION_ALIAS.find(([re]) => re.test(t)); return hit ? hit[1] : null; }
const km = (a, b) => Math.hypot((a.lat - b.lat) * 111.2, (a.lon - b.lon) * 111.2 * Math.cos((a.lat + b.lat) / 2 * Math.PI / 180));
function geoLoc(ix, lat, lon, src, extra){
  const lad = extra && extra.lad != null ? extra.lad : ladAt(ix, lat, lon);
  return Object.assign({lat:+lat.toFixed(5), lon:+lon.toFixed(5), src, conf:GEO_CONF_OF[src], lad, rgn:lad != null ? ix.A.lads[lad].r : null}, extra || {}, {lad});
}
// Word runs (longest first) from free text that name a place or local authority in the lookup; brand and generic words never match on their own
function geoGrams(text, stop){
  const w = geoFold(String(text || "").replace(PC_RE, " ")).split(" ").filter(t => t && !/^\d+[a-z]?$/.test(t)), out = [];
  for (let n = Math.min(4, w.length); n >= 1; n--) for (let i = 0; i + n <= w.length; i++){ const g = w.slice(i, i + n).join(" "); if (n === 1 && (g.length < 3 || GEO_STOP.has(g) || stop.has(g))) continue; out.push({g, n}); }
  return out;
}
function geoByPostcode(ix, pc){
  if (!pc) return null; const [out, inw] = pc.split(" "), sec = ix.sectors.get(`${out} ${inw[0]}`);
  if (sec) return geoLoc(ix, sec.lat, sec.lon, "sector", {lad:sec.lad, via:pc});
  const d = ix.districts.get(out); return d ? geoLoc(ix, d.lat, d.lon, "district", {lad:d.lad, via:pc}) : null;
}
// Place names, then local authority names, in [text, kind] order. The region column breaks ties and settles names shared by two places;
// a clear town in another region still wins (client sales regions rarely follow official boundaries) but is marked low confidence.
function geoByText(ix, texts, rg, stop){
  const hits = [];
  texts.forEach(([t, kind], ti) => geoGrams(t, stop).forEach(({g, n}) => { const p = ix.places.get(PLACE_ALIAS[g] || g); if (p) hits.push({p, n, ti, kind, lad:ladAt(ix, p.lat, p.lon)}); }));
  const inRg = h => !rg || h.lad == null || ix.A.lads[h.lad].r === rg;
  const pool = hits.filter(h => !h.p.amb || (rg && h.lad != null && inRg(h))), fit = pool.filter(inRg), ok = fit.length ? fit : pool;
  if (ok.length){
    const towns = ok.filter(h => h.p.rank <= 1), subs = ok.filter(h => h.p.rank >= 2);
    const near = towns.length ? subs.filter(h => towns.some(t => km(t.p, h.p) <= 25)) : [];
    const by = (a, b) => a.ti - b.ti || b.n - a.n || a.p.rank - b.p.rank;
    const pick = near.length ? near.sort(by)[0] : towns.length ? towns.sort(by)[0] : subs.sort(by)[0], clash = !inRg(pick);
    // A town named only in the region column ("London") says where the site is roughly, not where it is
    const firm = !clash && pick.kind !== "region" && (pick.p.rank <= 1 || near.length || (rg && pick.lad != null));
    return geoLoc(ix, pick.p.lat, pick.p.lon, "place", Object.assign({lad:pick.lad, via:pick.p.n, conf:firm ? "medium" : "low"}, clash ? {clash:true} : {}));
  }
  let other = null;
  for (const [t] of texts) for (const {g} of geoGrams(t, stop)){ const i = ix.lads.get(g) ?? (NI_TOWN[g] ? ix.lads.get(geoFold(NI_TOWN[g])) : undefined);
    if (i == null) continue; const c = ix.A.lads[i].c, loc = () => geoLoc(ix, c[1], c[0], "lad", {lad:i, via:ix.A.lads[i].nm});
    if (!rg || ix.A.lads[i].r === rg) return loc(); if (!other) other = () => Object.assign(loc(), {clash:true}); }
  return other ? other() : null;
}
function geoByHint(ix, t, rg){
  const h = [[t, "hint"]];
  return geoByPostcode(ix, postcodeIn(t)) || geoByText(ix, h, regionCode(t) || rg, new Set()) || geoByText(ix, h, null, new Set());
}
// Coordinates, then the seller's own fix, then the site list's postcode, then names; a region alone is the last resort
function geocodeSite(s, ix, ctx){
  ctx = ctx || {stop:new Set()};
  if (s.lat != null && s.lon != null && inUK(s.lat, s.lon)) return geoLoc(ix, s.lat, s.lon, s.geoSrc === "grid" || s.geoSrc === "manual" ? s.geoSrc : "file");
  const rg = regionCode(s.region);
  if (s.geoHint){ const g = geoByHint(ix, s.geoHint, rg); if (g) return g; }
  const g = geoByPostcode(ix, normPostcode(s.postcode) || postcodeIn(s.postcode) || postcodeIn(s.address))
    || geoByText(ix, [...String(s.address || "").split(/[,;\n]/).map(t => [t, "address"]), [s.name, "name"], [s.region, "region"]].filter(t => t[0]), rg, ctx.stop);
  if (g) return g;
  if (rg){ const r = ix.A.regions[ix.regIx[rg]]; return {lat:r.c[1], lon:r.c[0], src:"region", conf:"low", lad:null, rgn:rg, via:r.nm}; }
  return {lat:null, lon:null, src:"none", conf:"none", lad:null, rgn:null};
}
function geoContext(){
  const sp = S && S.spec, stop = new Set();
  [sp && sp.client.name, sp && sp.client.hint].forEach(t => geoFold(t).split(" ").forEach(w => { if (w.length >= 3) stop.add(w); }));
  return {stop};
}
function geocode(sites){
  const ix = geoIndex(); if (!ix) return null;
  const ctx = geoContext(), by = new Map(), sum = {n:sites.length, placed:0, clash:0, bySrc:{}, byConf:{}};
  for (const s of sites){ const g = geocodeSite(s, ix, ctx); by.set(s.uid, g); if (g.lat != null) sum.placed++; if (g.clash) sum.clash++; sum.bySrc[g.src] = (sum.bySrc[g.src] || 0) + 1; sum.byConf[g.conf] = (sum.byConf[g.conf] || 0) + 1; }
  return {by, sum};
}
// The seller fixes a site's location with a postcode, "lat, lon", or a town name. Returns the new location, or an error to show.
function setSiteLocation(s, text){
  const ix = geoIndex(), t = String(text || "").trim(), before = {postcode:s.postcode || null, geoHint:s.geoHint || null, lat:s.lat ?? null, lon:s.lon ?? null};
  if (!ix) return {error:"The map data has not loaded yet."};
  const clearPin = () => { if (s.geoSrc === "manual"){ delete s.lat; delete s.lon; delete s.geoSrc; delete s.geoConf; } };
  const ll = t.match(/^(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,2}(?:\.\d+)?)$/);
  if (!t){ clearPin(); delete s.geoHint; }
  else if (ll){ let la = +ll[1], lo = +ll[2]; if (!inUK(la, lo) && inUK(lo, la)) [la, lo] = [lo, la];
    if (!inUK(la, lo)) return {error:`${t} is not in the UK. Give latitude then longitude, like 53.80, -1.55.`};
    Object.assign(s, {lat:+la.toFixed(5), lon:+lo.toFixed(5), geoSrc:"manual", geoConf:"exact"}); }
  else if (normPostcode(t)){ const pc = normPostcode(t), [o, i] = pc.split(" ");
    if (!ix.sectors.has(`${o} ${i[0]}`) && !ix.districts.has(o)) return {error:`${pc} is not a postcode we know. Check it, or type the town instead.`};
    clearPin(); s.postcode = pc; delete s.geoHint; }
  else { if (!geoByHint(ix, t, regionCode(s.region)))
    return {error:`We could not find "${t}". Try the postcode, or a nearby town.`};
    clearPin(); s.geoHint = t.slice(0, 120); }
  const loc = geocodeSite(s, ix, geoContext());
  logEvent("site.location", {id:s.id, from:before, to:{postcode:s.postcode || null, geoHint:s.geoHint || null, lat:s.lat ?? null, lon:s.lon ?? null}, placedBy:loc.src});
  return {loc};
}
// Map-ready sites and area totals from the priced model. Every site is counted once, placed or not, so the totals equal compute().
function mapModel(R){
  R = R || compute(); if (!R) return null;
  const ix = geoIndex(), G = ix ? geocode(R.rows.map(r => r.s)) : null, W = RATECARD.weeksPerYear;
  const points = R.rows.map((r, i) => { const s = r.s, g = G ? G.by.get(s.uid) : {lat:null, lon:null, src:"none", conf:"none", lad:null, rgn:null};
    return {i, uid:s.uid, id:s.id, name:s.name, format:s.format, clientFormat:s.clientFormat || null, region:s.region || "", sqft:s.sqft || null, postcode:s.postcode || null,
      h:r.h, hc:r.hc, charge:r.charge, annual:r.charge * W, wages:r.wages, rate:r.rate, perHr:r.h ? r.charge / r.h : 0, wagePct:r.charge ? r.wages / r.charge : 0,
      sqftPerHr:s.sqft > 0 && r.h ? s.sqft / r.h : null, wagePer1k:s.sqft > 0 ? r.wages / s.sqft * 1000 : null, src:r.src,
      lat:g.lat, lon:g.lon, geoSrc:g.src, geoConf:g.conf, via:g.via || null, clash:!!g.clash, lad:g.lad, rgn:g.rgn}; });
  const agg = () => ({n:0, placed:0, hours:0, hc:0, charge:0, wages:0, sqft:0, aH:0, aW:0});
  const add = (x, p) => { x.n++; if (p.lat != null && p.geoSrc !== "region") x.placed++; x.hours += p.h; x.hc += p.hc; x.charge += p.charge; x.wages += p.wages; if (p.sqft && p.h > 0){ x.sqft += p.sqft; x.aH += p.h; x.aW += p.wages; } };
  const T = R.T, fin = x => Object.assign(x, {share:T.charge ? x.charge / T.charge : 0, wagePct:x.charge ? x.wages / x.charge : null, sqftPerHr:x.aH ? x.sqft / x.aH : null,
    wagePer1k:x.sqft ? x.aW / x.sqft * 1000 : null, perHr:x.hours ? x.charge / x.hours : null});
  const regions = {}, lads = {}, unplaced = agg();
  if (ix) ix.A.regions.forEach(r => { regions[r.cd] = Object.assign({cd:r.cd, nm:r.nm}, agg()); });
  points.forEach(p => { if (p.rgn && regions[p.rgn]) add(regions[p.rgn], p); else add(unplaced, p);
    if (p.lad != null){ const l = ix.A.lads[p.lad]; add(lads[p.lad] = lads[p.lad] || Object.assign({i:p.lad, cd:l.cd, nm:l.nm, rgn:l.r}, agg()), p); } });
  const placed = points.filter(p => p.lat != null), exact = placed.filter(p => p.geoSrc !== "region");
  const ext = exact.length ? {s:Math.min(...exact.map(p => p.lat)), n:Math.max(...exact.map(p => p.lat)), w:Math.min(...exact.map(p => p.lon)), e:Math.max(...exact.map(p => p.lon))} : null;
  return {ready:!!ix, points, regions:Object.values(regions).map(fin), lads:Object.values(lads).map(fin).sort((a, b) => b.charge - a.charge), unplaced:fin(unplaced),
    totals:{n:points.length, hours:T.hours, hc:T.hc, charge:T.charge, wages:T.wages},
    geo:G ? Object.assign({}, G.sum, {pin:exact.length, chargePinned:exact.reduce((a, p) => a + p.charge, 0) / (T.charge || 1)}) : null, extent:ext, attribution:ix ? ix.attribution : null};
}
/* ---------- Saved opportunity (autosave, resume, hand-over) ---------- */
const OPP_FILE = "CostModelOpportunity/1.1";
const SAVE_KEYS = ["step", "pack", "files", "spec", "extracted", "answers", "qi", "importReport", "runs", "view", "internal", "overrides", "generated", "visited", "audit", "signoff", "feedback", "guideFeedback"];
function saveOpportunity(){
  const st = {}; SAVE_KEYS.forEach(k => { if (S[k] !== undefined) st[k] = S[k]; });
  st.files = (S.files || []).map(({name, size, pages, sample}) => ({name, size, pages, sample}));
  const R = S.spec && S.spec.sites.length ? compute() : null;
  return JSON.parse(JSON.stringify({schema:OPP_FILE, savedAt:new Date().toISOString(), savedBy:(S.user && S.user.name) || "standalone user", engineVersion:ENGINE_VERSION, referenceData:CMB_DATA.meta.version,
    client:S.spec ? S.spec.client.name || null : null, sites:S.spec ? S.spec.sites.length : 0, weeklyCharge:R ? +R.T.charge.toFixed(2) : null, state:st}));
}
// Returns the state to install; the caller assigns it to S and then calls reconcileRestored().
function restoreOpportunity(O, base){
  if (!O || typeof O !== "object" || !/^CostModelOpportunity\/1\.\d+$/.test(String(O.schema || ""))) throw new Error(`not a saved Cost Model Builder opportunity (schema "${O && O.schema}")`);
  const st = O.state && typeof O.state === "object" ? O.state : {};
  const N = Object.assign({}, base);
  SAVE_KEYS.forEach(k => { if (st[k] != null) N[k] = st[k]; });
  if (N.spec){
    if (!Array.isArray(N.spec.sites) || !N.spec.client || !N.spec.term || !N.spec.commercial) throw new Error("the saved survey sheet is incomplete");
    N.spec.sites.forEach(s => { const m = /^u(\d+)$/.exec(s.uid || ""); if (m) uidSeq = Math.max(uidSeq, +m[1]); });
    normaliseSpec(N.spec);
  }
  if (!N.spec) N.extracted = false;
  N.step = N.extracted ? (STEP_IDS.includes(N.step) ? N.step : "spec") : "docs";
  N.generated = false; N.extracting = false; N.genStage = undefined;
  return N;
}
const STEP_IDS = ["docs", "spec", "questions", "sites", "price", "board", "insights", "generate"];
// After S is the restored state: bring the rate card in line and explain anything that moved since the save.
function reconcileRestored(O){
  const notes = [];
  if (!S.spec) return notes;
  syncRateCard();
  if (O.engineVersion && O.engineVersion !== ENGINE_VERSION) notes.push({lvl:"info", t:`Saved with engine ${O.engineVersion}; this is ${ENGINE_VERSION}.`});
  if (O.referenceData && O.referenceData !== CMB_DATA.meta.version) notes.push({lvl:"info", t:`Reference data changed from ${O.referenceData} to ${CMB_DATA.meta.version} since this was saved.`});
  const R = S.spec.sites.length ? compute() : null;
  if (R && O.weeklyCharge != null && Math.abs(R.T.charge - O.weeklyCharge) >= 0.005) notes.push({lvl:"warn", t:`The weekly charge moved from £${O.weeklyCharge.toFixed(2)} when saved to £${R.T.charge.toFixed(2)} now. Re-check the price before sign-off.`, go:"price"});
  logEvent("opportunity.restore", {savedAt:O.savedAt || null, savedBy:O.savedBy || null, notes:notes.length});
  S.restoreNotes = notes;
  return notes;
}
function recordAnswer(q, v, useDefault){
  const before = S.answers[q.id] ? S.answers[q.id].value : null;
  S.answers[q.id] = {value:v, source: useDefault ? q.defSrc : "ans", at:new Date().toISOString()};
  logEvent("answer", {id:q.id, from:before, to:v, source:S.answers[q.id].source});
}
// Append-only audit trail of what the seller changed. It is saved with the opportunity and goes into the payload.
function logEvent(type, data){
  if (!S) return;
  S.audit = S.audit || [];
  S.audit.push({at:new Date().toISOString(), by:(S.user && S.user.name) || "standalone user", type, ...data});
  if (S.audit.length > 5000) S.audit.splice(0, S.audit.length - 5000);
}
