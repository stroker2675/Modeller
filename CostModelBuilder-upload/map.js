/* ---------- Estate map: where the sites are, what they cost and who works there ---------- */
// A modal over the priced model. Offline by default: data/geo/*.js loads on first use and is drawn as a survey-style outline in SVG,
// with a canvas heat layer between the areas and the site circles. Every figure comes from mapModel(), so area totals always equal the price.
// The table view carries the same figures for keyboard and screen-reader users. The street map (map-street.js) is optional.
const EMap = (() => {
  const FILES = ["data/geo/uk-areas.js", "data/geo/uk-postcodes.js", "data/geo/uk-places.js"];
  const KX = Math.cos(54.5 * Math.PI / 180) * 111.32, KY = 110.57;
  const wx = lon => lon * KX, wy = lat => -lat * KY;
  const UK = {w:-8.3, e:1.9, s:49.85, n:60.9};
  const clamp = (lo, hi, v) => Math.max(lo, Math.min(hi, v));
  const pct = v => (v * 100).toFixed(1) + "%";
  const FMT_C = {Large:"#1c1e21", Medium:"#1f5a9e", Small:"#a8740f", Office:"#2c6a39"}, FMT_OTHER = "#8a8d92";
  const BAND_C = {below:"#1f5a9e", inside:"#8a8d92", above:"#b8321f"}, BAND_W = {below:"#bcd0e8", inside:"#e6e1d3", above:"#f0c1b6"};
  const RAMP = ["#e3ecf6", "#bfd3ea", "#8eb0d6", "#5586bc", "#1f5a9e"];
  // Area shading is an ink wash, so it never competes with the format colours of the circles on top
  const WASH = ["#f3f0e9", "#e0dcd2", "#c7c2b6", "#a7a296", "#827d72"];
  const SRC_C = {doc:"#1f5a9e", est:"#8eb0d6", ans:"#2c6a39", bm:"#a8740f", def:"#8a8d92"};
  const CONF = {exact:["Exact: coordinates or your pin", "#1c1e21"], high:["Postcode", "#1f5a9e"], medium:["Postcode district or town", "#8eb0d6"], low:["Council, or a town to check", "#a8740f"]};
  const SIZE = {charge:{l:"Charge a week", k:"charge", f:v => gbp(v)}, hours:{l:"Hours a week", k:"h", f:v => fmtN(v) + " hrs"}, hc:{l:"Operatives", k:"hc", f:v => fmtN(v)}, wages:{l:"Pay a week", k:"wages", f:v => gbp(v)}};
  const HEAT = {hc:{l:"Operatives", k:"hc"}, hours:{l:"Hours", k:"h"}, wages:{l:"Pay", k:"wages"}, charge:{l:"Charge", k:"charge"}, n:{l:"Sites", k:null}};
  const AREA = {charge:{l:"Charge a week", k:"charge", f:v => gbp(v)}, hours:{l:"Hours a week", k:"hours", f:v => fmtN(v) + " hrs"}, hc:{l:"Operatives", k:"hc", f:v => fmtN(v)},
    wages:{l:"Pay a week", k:"wages", f:v => gbp(v)}, n:{l:"Sites", k:"n", f:v => fmtN(v)},
    wagePct:{l:"Pay share of the price", k:"wagePct", f:pct, bench:BENCH.wagePct, x:100}, sqftPerHr:{l:"Sq ft per labour hour", k:"sqftPerHr", f:v => fmtN(v), bench:BENCH.sqftPerHr, x:1},
    perHr:{l:"Billed per hour", k:"perHr", f:v => gbp(v, 2), bench:BENCH.revPerHr, x:1}};
  const COLOUR = {format:"Format", wagePct:"Pay share of the price", sqftPerHr:"Sq ft per labour hour", perHr:"Billed per hour", rate:"Pay rate", src:"Where the hours came from", place:"How it was placed"};
  // Cities labelled first, in this order, wherever they fit; every other city and town joins in when zoomed in
  const CITY = ["London", "Birmingham", "Manchester", "Glasgow", "Edinburgh", "Cardiff", "Belfast", "Bristol", "Newcastle upon Tyne", "Leeds", "Aberdeen", "Inverness", "Liverpool", "Norwich",
    "Plymouth", "Southampton", "Nottingham", "Sheffield", "Exeter", "Swansea", "Dundee", "Carlisle", "Cambridge", "Kingston upon Hull", "Leicester", "York", "Brighton", "Oxford", "Stoke-on-Trent", "Derry"];
  const NI_PT = {Belfast:[54.597, -5.93], Derry:[54.997, -7.309]};

  const O = {base:"outline", view:"map", sites:true, heat:false, areas:"regions", size:"charge", color:"format", heatOf:"hc", areaOf:"charge", hide:new Set()};
  const V = {k:1, x:0, y:0, kFit:1, kMin:0.2, kMax:60};
  let M = null, sel = null, side = "overview", dlg = null, E = null, loadP = null, dirty = false, lastFocus = null, W = 0, H = 0;
  let touched = false, paths = null, cities = null, pts = [], raf = 0, needBase = true, heatAt = null, heatT = 0, lut = null, sprites = {}, grown = false, tblFilter = "";

  const street = () => globalThis.CMB_STREET, streetOn = () => O.base === "street" && !!street() && street().active();
  const attrText = () => (streetOn() ? street().attribution + " · " : "") + ((M && M.attribution) || "");
  function layers(){ const s = streetOn(); E.base.style.display = E.top.style.display = s ? "none" : ""; E.stage.classList.toggle("street", s); if (s) E.heat.hidden = true; E.attr.textContent = attrText(); schedule(true); if (!s) drawHeat(); }
  function load(){
    const g = globalThis; if (g.CMB_GEO_AREAS && g.CMB_GEO_PC && g.CMB_GEO_PLACES) return Promise.resolve();
    return loadP = loadP || Promise.all(FILES.map(src => new Promise((ok, no) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => no(new Error(`${src} did not load`)); document.head.appendChild(s); })))
      .catch(e => { loadP = null; throw e; });
  }
  const thinD = (p, tol) => p.map(poly => poly.map(r => { let d = "", px = null, py = null, n = 0; for (let i = 0; i < r.length; i += 2){ const x = wx(r[i]), y = wy(r[i + 1]); if (px != null && Math.abs(x - px) + Math.abs(y - py) < tol && i < r.length - 2) continue; d += (n++ ? "L" : "M") + x.toFixed(0) + " " + y.toFixed(0); px = x; py = y; } return n > 3 ? d + "Z" : ""; }).join("")).join("");
  const ringD = r => { let d = ""; for (let i = 0; i < r.length; i += 2) d += (i ? "L" : "M") + wx(r[i]).toFixed(1) + " " + wy(r[i + 1]).toFixed(1); return d + "Z"; };
  const polyD = p => p.map(poly => poly.map(ringD).join("")).join("");
  function geoPaths(){ const A = globalThis.CMB_GEO_AREAS; if (A && (!paths || paths.A !== A)) paths = {A, rg:A.regions.map(r => polyD(r.p)), lad:A.lads.map(l => polyD(l.p))}; return paths; }
  function cityList(){
    if (cities) return cities; const ix = geoIndex(); if (!ix) return [];
    const seen = new Set(), out = [];
    CITY.forEach((n, t) => { const p = NI_PT[n] ? {lat:NI_PT[n][0], lon:NI_PT[n][1]} : ix.places.get(geoFold(n)); if (p){ seen.add(geoFold(n)); out.push({n, lat:p.lat, lon:p.lon, t:t < 12 ? 0 : 1}); } });
    ix.places.forEach((p, k) => { if (p.rank <= 1 && !seen.has(k)) out.push({n:p.n, lat:p.lat, lon:p.lon, t:p.rank === 0 ? 2 : 3}); });
    return cities = out.sort((a, b) => a.t - b.t);
  }

  /* ----- figures ----- */
  const pinned = p => p.lat != null && p.geoSrc !== "region";
  const shown = p => !O.hide.has(p.format);
  const siteOf = p => S.spec && S.spec.sites.find(s => s.uid === p.uid);
  const rgName = cd => { const r = M && M.regions.find(x => x.cd === cd); return r ? r.nm : cd; };
  const bandOf = (v, b) => v == null || !b ? null : v < b.lo ? "below" : v > b.hi ? "above" : "inside";
  const bandTxt = (v, def) => { const b = def.bench, s = bandOf(v * def.x, b); return s ? `${s === "inside" ? "inside" : s} past bids (${def.f(b.lo / def.x)}–${def.f(b.hi / def.x)})` : ""; };
  function quantBreaks(vals, n){ const v = vals.filter(x => x != null && x > 0).sort((a, b) => a - b); if (!v.length) return []; const out = [];
    for (let i = 1; i < n; i++){ const q = v[Math.min(v.length - 1, Math.floor(i / n * v.length))]; if (!out.length || q > out[out.length - 1]) out.push(q); } return out; }
  const classOf = (v, br) => { let i = 0; while (i < br.length && v >= br[i]) i++; return i; };
  function colourer(){
    const vis = M.points.filter(shown);
    if (O.color === "format"){ const ks = [...new Set(vis.map(p => p.format))].sort((a, b) => Object.keys(FMT_C).indexOf(a) - Object.keys(FMT_C).indexOf(b));
      return {of:p => FMT_C[p.format] || FMT_OTHER, keys:ks.map(k => [FMT_C[k] || FMT_OTHER, k, vis.filter(p => p.format === k).length])}; }
    if (AREA[O.color] && AREA[O.color].bench){ const d = AREA[O.color], b = d.bench, of = p => BAND_C[bandOf(p[d.k] == null ? null : p[d.k] * d.x, b)] || "#c9c5b9";
      const cnt = s => vis.filter(p => bandOf(p[d.k] == null ? null : p[d.k] * d.x, b) === s).length, none = vis.filter(p => p[d.k] == null).length;
      return {of, keys:[[BAND_C.below, `Below past bids (under ${d.f(b.lo / d.x)})`, cnt("below")], [BAND_C.inside, `Inside past bids`, cnt("inside")], [BAND_C.above, `Above past bids (over ${d.f(b.hi / d.x)})`, cnt("above")]]
        .concat(none ? [["#c9c5b9", "No floor area", none]] : [])}; }
    if (O.color === "rate"){ const br = quantBreaks(vis.map(p => p.rate), 4), C = RAMP.slice(1), r = [Math.min(...vis.map(p => p.rate))].concat(br);
      return {of:p => C[classOf(p.rate, br)], keys:C.slice(0, br.length + 1).map((c, i) => [c, i < br.length ? `${gbp(r[i], 2)} to ${gbp(br[i], 2)}` : `${gbp(r[i], 2)} and above`, vis.filter(p => classOf(p.rate, br) === i).length])}; }
    if (O.color === "src") return {of:p => SRC_C[p.src] || FMT_OTHER, keys:Object.keys(SRC_C).filter(k => vis.some(p => p.src === k)).map(k => [SRC_C[k], SRC_NAME[k], vis.filter(p => p.src === k).length])};
    const conf = p => p.clash ? "clash" : p.geoConf;
    return {of:p => p.clash ? "#b8321f" : (CONF[p.geoConf] || CONF.low)[1],
      keys:Object.keys(CONF).filter(k => vis.some(p => pinned(p) && conf(p) === k)).map(k => [CONF[k][1], CONF[k][0], vis.filter(p => pinned(p) && conf(p) === k).length])
        .concat(vis.some(p => p.clash) ? [["#b8321f", "Town is in another region to the site list", vis.filter(p => p.clash).length]] : [])};
  }
  function areaList(){ return O.areas === "councils" ? M.lads : M.regions.filter(r => r.n); }
  function areaFill(){
    const d = AREA[O.areaOf], list = areaList(); if (!list.length) return {of:() => null, keys:[]};
    if (d.bench){ const of = a => a[d.k] == null ? null : BAND_W[bandOf(a[d.k] * d.x, d.bench)];
      return {of, keys:[[BAND_W.below, "Below past bids"], [BAND_W.inside, "Inside past bids"], [BAND_W.above, "Above past bids"]].filter(([c]) => list.some(a => of(a) === c))}; }
    const br = quantBreaks(list.map(a => a[d.k]), Math.min(5, list.length)), C = WASH.slice(WASH.length - br.length - 1), lo = Math.min(...list.map(a => a[d.k]).filter(v => v > 0));
    return {of:a => a[d.k] > 0 ? C[classOf(a[d.k], br)] : null, keys:C.map((c, i) => [c, i < br.length ? `${d.f(i ? br[i - 1] : lo)} to ${d.f(br[i])}` : `${d.f(br[i - 1] ?? lo)} and above`])};
  }

  /* ----- view ----- */
  const tf = () => `translate(${V.x.toFixed(1)} ${V.y.toFixed(1)}) scale(${V.k.toFixed(5)})`;
  const SX = lon => wx(lon) * V.k + V.x, SY = lat => wy(lat) * V.k + V.y;
  function fitTo(b, pad){
    pad = pad ?? (W < 500 ? 22 : 44); const x0 = wx(b.w), x1 = wx(b.e), y0 = wy(b.n), y1 = wy(b.s), dx = Math.max(x1 - x0, 40), dy = Math.max(y1 - y0, 40);
    V.k = clamp(V.kMin, V.kMax, Math.min((W - 2 * pad) / dx, (H - 2 * pad) / dy)); V.x = W / 2 - (x0 + x1) / 2 * V.k; V.y = H / 2 - (y0 + y1) / 2 * V.k;
  }
  function fit(){
    if (!W || !H) return; const kUK = Math.min((W - 40) / (wx(UK.e) - wx(UK.w)), (H - 40) / (wy(UK.s) - wy(UK.n)));
    V.kMin = kUK * 0.7; const b = M && M.extent ? Object.assign({}, M.extent) : UK;
    if (M) M.points.filter(p => p.geoSrc === "region" && shown(p)).forEach(p => { b.s = Math.min(b.s, p.lat); b.n = Math.max(b.n, p.lat); b.w = Math.min(b.w, p.lon); b.e = Math.max(b.e, p.lon); });
    fitTo(b); V.kFit = V.k; touched = false; schedule(true);
  }
  function zoomAt(sx, sy, k){ touched = true; k = clamp(V.kMin, V.kMax, k); V.x = sx - (sx - V.x) * k / V.k; V.y = sy - (sy - V.y) * k / V.k; V.k = k; schedule(); }
  function schedule(base){ if (base) needBase = true; if (!raf) raf = requestAnimationFrame(frame); }
  function frame(){
    raf = 0; if (!dlg || !dlg.open || !M || O.view !== "map") return; if (streetOn()){ needBase = false; street().update(); return; }
    if (needBase){ drawBase(); needBase = false; } else E.world.setAttribute("transform", tf());
    drawTop(); moveHeat(); clearTimeout(heatT); heatT = setTimeout(drawHeat, 150);
  }

  /* ----- drawing ----- */
  function drawBase(){
    const P = geoPaths(); E.base.setAttribute("viewBox", `0 0 ${W} ${H}`); E.world.setAttribute("transform", tf());
    if (!P){ E.world.innerHTML = ""; return; }
    let grat = ""; for (let lo = -10; lo <= 3; lo++) grat += `M${wx(lo).toFixed(1)} ${wy(61.5).toFixed(1)}V${wy(49).toFixed(1)}`; for (let la = 49; la <= 61; la++) grat += `M${wx(-10).toFixed(1)} ${wy(la).toFixed(1)}H${wx(3).toFixed(1)}`;
    const F = O.areas === "none" ? null : areaFill(), rgBy = {}, ladBy = {}; M.regions.forEach(r => { rgBy[r.cd] = r; }); M.lads.forEach(l => { ladBy[l.i] = l; });
    const on = k => sel && sel.t === "area" && sel.key === k ? " on" : "";
    const regions = P.A.regions.map((r, i) => { const a = rgBy[r.cd], f = F && O.areas === "regions" && a && a.n ? F.of(a) : null;
      return `<path d="${P.rg[i]}" class="rg${on("rg:" + r.cd)}" data-a="rg:${r.cd}"${f ? ` style="fill:${f}"` : ""}/>`; }).join("");
    const lads = O.areas === "councils" ? P.A.lads.map((l, i) => { const a = ladBy[i], f = a ? F.of(a) : null;
      return `<path d="${P.lad[i]}" class="lad${on("lad:" + i)}" data-a="lad:${i}"${f ? ` style="fill:${f}"` : ""}/>`; }).join("") : "";
    E.world.innerHTML = `<path class="grat" d="${grat}"/><g class="${O.areas === "councils" ? "rgs under" : "rgs"}">${regions}</g>${lads ? `<g class="lads">${lads}</g><path class="rgline" d="${P.rg.join("")}"/>` : ""}`;
  }
  function project(){
    // Sites that share a point (a town centre or a postcode sector) are fanned out a little so each can be seen and clicked
    const seen = new Map(); pts = [];
    M.points.forEach(p => { if (!pinned(p) || !shown(p)) return; const key = p.lat + "," + p.lon, j = seen.get(key) || 0; seen.set(key, j + 1); pts.push({p, X:wx(p.lon), Y:wy(p.lat), j}); });
    const S1 = SIZE[O.size], vmax = Math.max(1e-9, ...pts.map(q => q.p[S1.k])); pts.forEach(q => { q.v = q.p[S1.k] / vmax; });
    pts.sort((a, b) => b.v - a.v);
  }
  const small = () => clamp(0.6, 1, Math.min(W || 560, H || 560) / 560);
  const radius = v => (2 + 9.5 * Math.sqrt(clamp(0, 1, v))) * clamp(1, 2, Math.pow(V.k / V.kFit, 0.3)) * small();
  function drawTop(){
    E.top.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const C = colourer(), out = [], lab = [], boxes = [], hit = (x, y, w, h) => boxes.some(b => x < b[2] && x + w > b[0] && y < b[3] && y + h > b[1]);
    // place names sit above the circles, haloed, so a crowded city never hides its own name; towns only once zoomed in
    const zoomed = V.k > V.kFit * 3.5 || V.k > 2.2;
    for (const c of cityList()){
      if (c.t === 3 && !zoomed) continue; if (c.t === 2 && V.k < V.kFit * 1.6) continue; if (lab.length > 70) break;
      const x = SX(c.lon), y = SY(c.lat); if (x < -40 || y < -20 || x > W + 40 || y > H + 20) continue;
      const w = c.n.length * (c.t ? 5.7 : 6.4) + 8, h = 14; if (hit(x - 2, y - 11, w, h)) continue; boxes.push([x - 2, y - 11, x - 2 + w, y + 3]);
      lab.push(`<circle class="cdot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.6"/><text class="c${c.t}" x="${(x + 4).toFixed(1)}" y="${(y - 3).toFixed(1)}">${esc(c.n)}</text>`);
    }
    if (O.sites){
      pts.forEach(q => { let x = q.X * V.k + V.x, y = q.Y * V.k + V.y; const r = radius(q.v) * (O.heat ? 0.5 : 1);
        if (q.j){ const a = q.j * 2.39996, d = (3 + r * 0.55) * Math.sqrt(q.j); x += Math.cos(a) * d; y += Math.sin(a) * d; }
        q.sx = x; q.sy = y; q.r = r; if (x < -r || y < -r || x > W + r || y > H + r) return;
        out.push(`<circle data-i="${q.p.i}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${C.of(q.p)}"${grown ? "" : ` style="animation-delay:${Math.min(420, (1 - q.v) * 420).toFixed(0)}ms"`}/>`); });
      // sites known only by their region: a dashed ring with the count, at the region's centre
      const byRg = {}; M.points.forEach(p => { if (p.geoSrc === "region" && shown(p)) (byRg[p.rgn] = byRg[p.rgn] || []).push(p); });
      Object.entries(byRg).forEach(([cd, list]) => { const p = list[0], x = SX(p.lon), y = SY(p.lat);
        out.push(`<g class="rgonly" data-rgo="${cd}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="13"/><text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}">${list.length}</text></g>`); });
    }
    let hi = "";
    if (sel && sel.t === "site"){ const q = pts.find(z => z.p.i === sel.i);
      if (q && q.sx != null && O.sites){ const name = esc(q.p.name), w = q.p.name.length * 6.6 + 12, lx = q.sx + q.r + 6 + w > W ? q.sx - q.r - 6 - w : q.sx + q.r + 6;
        hi = `<circle class="selring" cx="${q.sx.toFixed(1)}" cy="${q.sy.toFixed(1)}" r="${(q.r + 4).toFixed(1)}"/><g class="sellab"><rect x="${lx.toFixed(1)}" y="${(q.sy - 10).toFixed(1)}" width="${w.toFixed(0)}" height="20" rx="2"/><text x="${(lx + 6).toFixed(1)}" y="${(q.sy + 4).toFixed(1)}">${name}</text></g>`; } }
    E.top.innerHTML = `<g class="pts${grown ? "" : " grow"}${O.heat ? " dim" : ""}">${out.join("")}</g><g class="lbl">${lab.join("")}</g>${hi}`;
    if (!grown) setTimeout(() => { grown = true; }, 60);
  }
  function lutRamp(){
    if (lut) return lut; const c = document.createElement("canvas"); c.width = 256; c.height = 1; const g = c.getContext("2d"), gr = g.createLinearGradient(0, 0, 256, 0);
    [[0, "rgba(246,214,150,0)"], [0.12, "rgba(246,214,150,.45)"], [0.35, "rgba(232,168,70,.7)"], [0.62, "rgba(206,96,38,.82)"], [0.85, "rgba(168,40,24,.9)"], [1, "rgba(104,20,12,.94)"]].forEach(([o, col]) => gr.addColorStop(o, col));
    g.fillStyle = gr; g.fillRect(0, 0, 256, 1); return lut = g.getImageData(0, 0, 256, 1).data;
  }
  function sprite(r){
    if (sprites[r]) return sprites[r]; const c = document.createElement("canvas"); c.width = c.height = r * 2; const g = c.getContext("2d"), gr = g.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, "rgba(0,0,0,1)"); gr.addColorStop(0.45, "rgba(0,0,0,.55)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(0, 0, r * 2, r * 2);
    return sprites[r] = c;
  }
  // Heat is drawn when the map stops moving; while it moves the last drawing is shifted and scaled to follow
  function drawHeat(){
    const c = E.heat, on = O.heat && O.view === "map" && M && dlg.open && !streetOn(); c.hidden = !on; if (!on) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), w = Math.max(1, Math.round(W * dpr)), h = Math.max(1, Math.round(H * dpr));
    if (c.width !== w || c.height !== h){ c.width = w; c.height = h; }
    const g = c.getContext("2d", {willReadFrequently:true}); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.clearRect(0, 0, w, h);
    const key = HEAT[O.heatOf].k, list = M.points.filter(p => pinned(p) && shown(p) && (!key || p[key] > 0)), vals = list.map(p => key ? p[key] : 1).sort((a, b) => a - b);
    const ref = vals[Math.floor(vals.length * 0.9)] || 1, r = Math.round(clamp(26, 160, 24 * V.k) * dpr), spr = sprite(r);
    list.forEach(p => { const x = SX(p.lon) * dpr, y = SY(p.lat) * dpr; if (x < -r || y < -r || x > w + r || y > h + r) return; g.globalAlpha = clamp(0.05, 1, (key ? p[key] : 1) / ref) * 0.3; g.drawImage(spr, x - r, y - r); });
    const img = g.getImageData(0, 0, w, h), d = img.data, L = lutRamp();
    for (let i = 3; i < d.length; i += 4){ const a = d[i]; if (!a) continue; const j = a * 4; d[i - 3] = L[j]; d[i - 2] = L[j + 1]; d[i - 1] = L[j + 2]; d[i] = L[j + 3]; }
    g.putImageData(img, 0, 0); heatAt = {k:V.k, x:V.x, y:V.y}; c.style.transform = "";
  }
  function moveHeat(){ if (!heatAt || E.heat.hidden) return; const s = V.k / heatAt.k; E.heat.style.transform = `translate(${(V.x - heatAt.x * s).toFixed(1)}px,${(V.y - heatAt.y * s).toFixed(1)}px) scale(${s.toFixed(4)})`; }
  function drawLegend(){
    const C = colourer(), S1 = SIZE[O.size], vmax = Math.max(0, ...M.points.filter(p => pinned(p) && shown(p)).map(p => p[S1.k])), F = O.areas === "none" ? null : areaFill();
    const sw = (c, l, n, ring) => `<li><span class="sw${ring ? " ring" : ""}" style="--c:${c}"></span><span>${esc(l)}</span>${n != null ? `<span class="n">${fmtN(n)}</span>` : ""}</li>`;
    const sizes = [1, 0.25, 0.04].map(f => [radius(f), S1.f(vmax * f)]), R0 = sizes[0][0];
    const was = E.legend.querySelector("details"), open = was ? was.open : (W || innerWidth) >= 600;
    E.legend.innerHTML = `<details${open ? " open" : ""}><summary>Key</summary>
      ${O.sites ? `<h4>Sites, coloured by ${esc(COLOUR[O.color].toLowerCase())}</h4><ul>${C.keys.map(([c, l, n]) => sw(c, l, n)).join("")}</ul>
      <h4>Circle size: ${esc(S1.l.toLowerCase())}</h4><div class="sizes"><svg width="${(R0 * 2 + 2).toFixed(0)}" height="${(R0 * 2 + 2).toFixed(0)}" aria-hidden="true">${sizes.map(([r]) => `<circle cx="${(R0 + 1).toFixed(1)}" cy="${(R0 * 2 + 1 - r).toFixed(1)}" r="${r.toFixed(1)}"/>`).join("")}</svg>
        <ul>${sizes.map(([, v]) => `<li>${esc(v)}</li>`).join("")}</ul></div>
      ${M.points.some(p => p.geoSrc === "region" && shown(p)) ? `<ul>${sw("transparent", "Sites known only by region (count)", null, true)}</ul>` : ""}` : ""}
      ${O.heat ? `<h4>Heat: where the ${esc(HEAT[O.heatOf].l.toLowerCase())} ${O.heatOf === "wages" ? "goes" : "are"}</h4><div class="heatbar"><i></i><span>Less</span><span>More, within about 20 km</span></div>` : ""}
      ${F ? `<h4>${O.areas === "councils" ? "Councils" : "Regions"}: ${esc(AREA[O.areaOf].l.toLowerCase())}</h4><ul>${F.keys.map(([c, l]) => sw(c, l)).join("")}${sw("#fffdf8", "No sites")}</ul>` : ""}
    </details>`;
  }

  /* ----- panels ----- */
  function stats(){
    const T = M.totals, g = M.geo;
    E.stats.innerHTML = `<div><dt>On the map</dt><dd>${g ? `${fmtN(g.pin)} of ${fmtN(T.n)} sites<span>${Math.round(g.chargePinned * 100)}% of the charge</span>` : "–"}</dd></div>
      <div><dt>Charge a week</dt><dd>${gbp(T.charge)}</dd></div><div><dt>Hours a week</dt><dd>${fmtN(T.hours)}</dd></div>
      <div><dt>Operatives</dt><dd>${fmtN(T.hc)}</dd></div><div><dt>Pay a week</dt><dd>${gbp(T.wages)}<span>${pct(T.wages / (T.charge || 1))} of the charge</span></dd></div>`;
    E.sub.textContent = `${clientLabel()} · sites placed from their postcode, town or council, all on this device`;
  }
  function rail(){
    const opt = (id, l, map, v, dis) => `<label class="f">${l}<select data-mopt="${id}"${dis ? " disabled" : ""}>${Object.entries(map).map(([k, x]) => `<option value="${k}"${k === v ? " selected" : ""}>${esc(typeof x === "string" ? x : x.l)}</option>`).join("")}</select></label>`;
    const street = globalThis.CMB_STREET, can = street && street.available(), fmts = [...new Set(M.points.map(p => p.format))];
    E.rail.innerHTML = `
      <fieldset><legend>Base map</legend><div class="seg" role="group" aria-label="Base map"><button type="button" data-mbase="outline" aria-pressed="${O.base === "outline"}">Outline</button><button type="button" data-mbase="street" aria-pressed="${O.base === "street"}"${can ? "" : " disabled"}>Street map</button></div>
        <p class="xs muted">${can ? "The street map loads map tiles from OpenFreeMap." : street ? esc(street.why()) : "The outline map works offline. The street map needs the map library, which is not in this build."}</p></fieldset>
      <fieldset><legend>Layers</legend>
        <label class="chk"><input type="checkbox" data-mopt="sites"${O.sites ? " checked" : ""}> Sites</label>
        <label class="chk"><input type="checkbox" data-mopt="heat"${O.heat ? " checked" : ""}> Heat</label>
        ${opt("areas", "Shade areas", {none:"No shading", regions:"Regions", councils:"Councils"}, O.areas)}</fieldset>
      <fieldset${O.sites ? "" : " disabled"}><legend>Sites</legend>${opt("size", "Size by", SIZE, O.size)}${opt("color", "Colour by", COLOUR, O.color)}</fieldset>
      <fieldset${O.heat ? "" : " disabled"}><legend>Heat</legend>${opt("heatOf", "Heat shows", HEAT, O.heatOf)}</fieldset>
      <fieldset${O.areas === "none" ? " disabled" : ""}><legend>Area shading</legend>${opt("areaOf", "Shade by", AREA, O.areaOf)}</fieldset>
      <fieldset><legend>Formats</legend>${fmts.map(f => `<label class="chk"><input type="checkbox" data-mfmt="${esc(f)}"${O.hide.has(f) ? "" : " checked"}><span class="sw" style="--c:${FMT_C[f] || FMT_OTHER}" aria-hidden="true"></span> ${esc(f)} <span class="xs muted">${fmtN(M.points.filter(p => p.format === f).length)}</span></label>`).join("")}</fieldset>`;
  }
  const kv = (l, v, note) => `<div><dt>${l}</dt><dd>${v}${note ? `<span class="src xs muted">${note}</span>` : ""}</dd></div>`;
  function problems(){
    const rank = p => p.geoSrc === "none" ? 0 : p.geoSrc === "region" ? 1 : p.clash ? 2 : p.geoConf === "low" ? 3 : 9;
    return M.points.filter(p => rank(p) < 9).sort((a, b) => rank(a) - rank(b) || b.charge - a.charge).map(p => Object.assign({why:["Not placed", "Only the region is known", "Town is in another region", "Placed by council or a town to check"][rank(p)]}, {p}));
  }
  const fixForm = (p, label) => `<div class="m-fix" role="group" data-mfix="${p.i}"><label for="mf${p.i}">${label}</label><span class="row"><input id="mf${p.i}" type="text" autocomplete="off" placeholder="Postcode, town, or lat, lon" maxlength="120"><button class="btn" type="button" data-mplace="${p.i}">Place</button></span><span class="err" id="mfe${p.i}" aria-live="polite"></span></div>`;
  function panel(){
    const T = M.totals, g = M.geo, el = E.side;
    if (!M.ready){ el.innerHTML = `<h3>The map could not load</h3><p class="small">The site figures are in the table view.</p>`; return; }
    if (sel && sel.t === "site"){ const p = M.points[sel.i]; if (!p) return (sel = null, panel());
      const hint = siteOf(p), fixed = hint && (hint.geoHint || hint.geoSrc === "manual");
      el.innerHTML = `<button type="button" class="m-back" data-mact="overview">← The whole estate</button>
        <h3 id="mapSel" tabindex="-1">${esc(p.name)}</h3><p class="xs muted">${[p.id, p.format + (p.clientFormat ? ` (the client says ${p.clientFormat})` : ""), p.region, p.postcode].filter(Boolean).map(esc).join(" · ")}</p>
        <p class="m-placed small"><b>${esc(GEO_SRC_L[p.geoSrc] || p.geoSrc)}</b>${p.via && p.geoSrc !== "manual" ? `: ${esc(p.via)}` : ""}${p.lad != null ? ` · ${esc(geoIndex().A.lads[p.lad].nm)}` : ""}</p>
        ${p.clash ? `<p class="m-warn small">The site list says ${esc(p.region)}, but ${esc(p.via)} is in ${esc(rgName(p.rgn))}. Check where this site is, then place it below.</p>` : ""}
        ${p.geoSrc === "region" ? `<p class="m-warn small">Only its region is known, so it counts in ${esc(rgName(p.rgn))} but has no pin. Add its postcode below.</p>` : ""}
        ${p.geoSrc === "none" ? `<p class="m-warn small">Nothing in the site list says where this is. Add its postcode below.</p>` : ""}
        <dl class="mosaic m-kv">${kv("A week", gbp(p.charge))}${kv("A year", gbpK(p.annual))}${kv("Hours a week", (+p.h.toFixed(1)).toLocaleString("en-GB"))}${kv("Operatives", fmtN(p.hc))}
          ${kv("Pay rate", gbp(p.rate, 2) + "/hr")}${kv("Billed", gbp(p.perHr, 2) + "/hr", bandTxt(p.perHr, AREA.perHr))}${kv("Pay a week", gbp(p.wages), `${pct(p.wagePct)} of the charge`)}
          ${kv("Sq ft per hour", p.sqftPerHr != null ? fmtN(p.sqftPerHr) : "–", p.sqftPerHr != null ? bandTxt(p.sqftPerHr, AREA.sqftPerHr) : "no floor area")}</dl>
        ${streetOn() && pinned(p) ? `<p class="xs muted">Or drag its pin on the street map.</p>` : ""}${fixForm(p, p.geoConf === "exact" || p.geoConf === "high" ? "Move this site" : "Place this site")}
        ${fixed ? `<button type="button" class="btn ghost" data-mclear="${p.i}">Undo my change</button>` : ""}
        <div class="actions"><button type="button" class="btn ghost" data-mcard="${p.i}">Open its site card</button></div>`;
      return;
    }
    if (sel && sel.t === "area"){ const [kind, key] = sel.key.split(":"), a = kind === "rg" ? M.regions.find(r => r.cd === key) : M.lads.find(l => l.i === +key); if (!a) return (sel = null, panel());
      const here = M.points.filter(p => kind === "rg" ? p.rgn === key : p.lad === +key).sort((x, y) => y.charge - x.charge);
      el.innerHTML = `<button type="button" class="m-back" data-mact="overview">← The whole estate</button>
        <h3 id="mapSel" tabindex="-1">${esc(a.nm)}</h3><p class="xs muted">${kind === "rg" ? "Region" : `Council in ${esc(rgName(a.rgn))}`}</p>
        ${a.n ? `<p class="small">${fmtN(a.n)} site${a.n === 1 ? "" : "s"} carry <b>${pct(a.share)}</b> of the weekly charge${kind === "rg" && a.placed < a.n ? `; ${fmtN(a.n - a.placed)} of them ${a.n - a.placed === 1 ? "has" : "have"} no pin` : ""}.</p>
        <dl class="mosaic m-kv">${kv("A week", gbp(a.charge))}${kv("A year", gbpK(a.charge * RATECARD.weeksPerYear))}${kv("Hours a week", fmtN(a.hours))}${kv("Operatives", fmtN(a.hc))}
          ${kv("Pay a week", gbp(a.wages), a.wagePct != null ? `${pct(a.wagePct)} of the charge, ${bandTxt(a.wagePct, AREA.wagePct)}` : "")}
          ${kv("Billed", a.perHr != null ? gbp(a.perHr, 2) + "/hr" : "–", a.perHr != null ? bandTxt(a.perHr, AREA.perHr) : "")}
          ${kv("Sq ft per hour", a.sqftPerHr != null ? fmtN(a.sqftPerHr) : "–", a.sqftPerHr != null ? bandTxt(a.sqftPerHr, AREA.sqftPerHr) : "no floor areas")}</dl>
        <h4>Largest sites here</h4><ol class="m-list">${here.slice(0, 8).map(p => `<li><button type="button" data-mi="${p.i}"><span>${esc(p.name)}</span><span class="num">${gbp(p.charge)}</span></button></li>`).join("")}</ol>
        ${here.length > 8 ? `<p class="xs muted">And ${fmtN(here.length - 8)} more. The table view lists them all.</p>` : ""}` : `<p class="small">No sites here.</p>`}`;
      return;
    }
    if (side === "fix"){ const list = problems();
      el.innerHTML = `<button type="button" class="m-back" data-mact="overview">← The whole estate</button><h3 id="mapSel" tabindex="-1">Sites to check</h3>
        <p class="small">Give each one a postcode, a town, or a latitude and longitude. The price does not change; only the map and the area totals do.</p>
        ${list.length ? `<ol class="m-fixlist">${list.slice(0, 60).map(({p, why}) => `<li><button type="button" class="m-name" data-mi="${p.i}">${esc(p.name)}</button><span class="xs muted">${esc(why)}${p.region ? ` · list says ${esc(p.region)}` : ""} · ${gbp(p.charge)} a week</span>${fixForm(p, `<span class="sr">Location for ${esc(p.name)}</span>`)}</li>`).join("")}</ol>
          ${list.length > 60 ? `<p class="xs muted">Showing the 60 that matter most by charge. Fix these, then the rest appear.</p>` : ""}` : `<p class="small">Every site is placed. Nothing to check.</p>`}`;
      return;
    }
    const d = AREA[O.areaOf].bench ? AREA.charge : AREA[O.areaOf], top = M.regions.filter(r => r.n).sort((a, b) => b[d.k] - a[d.k]), max = top.length ? top[0][d.k] : 1;
    const lead = M.regions.filter(r => r.n).sort((a, b) => b.charge - a.charge), top3 = lead.slice(0, 3).reduce((a, r) => a + r.share, 0);
    const bs = g ? g.bySrc : {}, probs = problems(), n = k => bs[k] || 0;
    el.innerHTML = `<h3 id="mapSel" tabindex="-1">Where the money is</h3>
      ${lead.length ? `<p class="small">${esc(lead[0].nm)} carries <b>${pct(lead[0].share)}</b> of the weekly charge from ${fmtN(lead[0].n)} site${lead[0].n === 1 ? "" : "s"}.${lead.length > 3 ? ` The top three regions carry ${pct(top3)}.` : ""}</p>` : ""}
      <ol class="m-rank" aria-label="Regions by ${esc(d.l.toLowerCase())}">${top.map(r => `<li><button type="button" data-ma="rg:${r.cd}"><span class="nm">${esc(r.nm)}</span><span class="mbar"><i style="width:${(r[d.k] / max * 100).toFixed(1)}%"></i></span><span class="num">${d.f(r[d.k])}</span></button></li>`).join("")}</ol>
      ${M.unplaced.n ? `<p class="xs muted">${fmtN(M.unplaced.n)} site${M.unplaced.n === 1 ? "" : "s"} (${gbp(M.unplaced.charge)} a week) could not be put in any region.</p>` : ""}
      <h4>How the sites were placed</h4>
      <p class="small">${fmtN(g.pin)} of ${fmtN(T.n)} have a pin: ${[["file", "from coordinates in the list"], ["grid", "from grid references"], ["manual", "placed by you"], ["sector", "by postcode"], ["district", "by postcode district"], ["place", "by town name"], ["lad", "by council"]].filter(([k]) => n(k)).map(([k, l]) => `${fmtN(n(k))} ${l}`).join(", ")}.
        ${n("region") ? `${fmtN(n("region"))} ${n("region") === 1 ? "is" : "are"} known only by region.` : ""} ${n("none") ? `${fmtN(n("none"))} could not be placed.` : ""} ${g.clash ? `${fmtN(g.clash)} sit${g.clash === 1 ? "s" : ""} in a different region from the one the site list gives.` : ""}</p>
      ${probs.length ? `<button type="button" class="btn" data-mact="fix">Check ${fmtN(probs.length)} site${probs.length === 1 ? "" : "s"}</button>` : ""}
      <h4>Reading the map</h4>
      <ul class="m-read small"><li>Each circle is a site, sized by ${esc(SIZE[O.size].l.toLowerCase())} and coloured by ${esc(COLOUR[O.color].toLowerCase())}.</li>
        <li>Select a circle or an area for its figures.</li><li>Drag to move. Scroll, pinch or use + and − to zoom.</li><li>Turn on Heat to see where the operatives or the pay are concentrated.</li></ul>`;
  }
  function table(){
    const f = tblFilter.toLowerCase(), list = M.points.filter(p => !f || (p.name + " " + p.id + " " + p.region + " " + p.format + " " + (p.postcode || "")).toLowerCase().includes(f)).sort((a, b) => b.charge - a.charge);
    const A = O.areas === "councils" ? M.lads : M.regions.filter(r => r.n).sort((a, b) => b.charge - a.charge);
    const cell = v => v == null ? "–" : v;
    E.table.innerHTML = `<h3>${O.areas === "councils" ? "Councils with sites" : "Regions"}</h3>
      <div class="scroll"><table class="tbl"><thead><tr><th>${O.areas === "councils" ? "Council" : "Region"}</th><th class="num">Sites</th><th class="num">Pinned</th><th class="num">Charge / wk</th><th class="num">Share</th><th class="num">Hours / wk</th><th class="num">Operatives</th><th class="num">Pay / wk</th><th class="num">Pay share</th><th class="num">Sq ft / hr</th></tr></thead>
        <tbody>${A.map(a => `<tr><th scope="row"><button type="button" class="linkish" data-ma="${O.areas === "councils" ? "lad:" + a.i : "rg:" + a.cd}">${esc(a.nm)}</button></th><td class="num">${fmtN(a.n)}</td><td class="num">${fmtN(a.placed)}</td><td class="num">${gbp(a.charge)}</td><td class="num">${pct(a.share)}</td><td class="num">${fmtN(a.hours)}</td><td class="num">${fmtN(a.hc)}</td><td class="num">${gbp(a.wages)}</td><td class="num">${a.wagePct != null ? pct(a.wagePct) : "–"}</td><td class="num">${cell(a.sqftPerHr != null ? fmtN(a.sqftPerHr) : null)}</td></tr>`).join("")}
        ${O.areas !== "councils" && M.unplaced.n ? `<tr><th scope="row">Not in any region</th><td class="num">${fmtN(M.unplaced.n)}</td><td class="num">0</td><td class="num">${gbp(M.unplaced.charge)}</td><td class="num">${pct(M.unplaced.share)}</td><td class="num">${fmtN(M.unplaced.hours)}</td><td class="num">${fmtN(M.unplaced.hc)}</td><td class="num">${gbp(M.unplaced.wages)}</td><td class="num">${M.unplaced.wagePct != null ? pct(M.unplaced.wagePct) : "–"}</td><td class="num">–</td></tr>` : ""}</tbody>
        ${O.areas !== "councils" ? `<tfoot><tr><td>All sites</td><td class="num">${fmtN(M.totals.n)}</td><td class="num">${fmtN(M.geo ? M.geo.pin : 0)}</td><td class="num">${gbp(M.totals.charge)}</td><td class="num">100%</td><td class="num">${fmtN(M.totals.hours)}</td><td class="num">${fmtN(M.totals.hc)}</td><td class="num">${gbp(M.totals.wages)}</td><td class="num">${pct(M.totals.wages / (M.totals.charge || 1))}</td><td></td></tr></tfoot>` : ""}</table></div>
      <h3>Sites</h3><label class="f m-tfilter">Filter<input type="text" data-mtfilt value="${esc(tblFilter)}" placeholder="Name, ID, region, format or postcode"></label>
      <p class="xs muted">${fmtN(list.length)} site${list.length === 1 ? "" : "s"}, largest charge first${list.length > 400 ? "; showing the first 400" : ""}.</p>
      <div class="scroll"><table class="tbl"><thead><tr><th>Site</th><th>Format</th><th>Region in the list</th><th>Placed by</th><th class="num">Charge / wk</th><th class="num">Hours / wk</th><th class="num">Operatives</th><th class="num">Pay / hr</th><th><span class="sr">Map</span></th></tr></thead>
        <tbody>${list.slice(0, 400).map(p => `<tr><td>${esc(p.name)} <span class="xs muted">${esc(p.id)}</span></td><td>${esc(p.format)}</td><td>${esc(p.region || "–")}</td><td>${esc(GEO_SRC_L[p.geoSrc] || p.geoSrc)}${p.clash ? ' <span class="stamp gap">CHECK</span>' : ""}</td>
          <td class="num">${gbp(p.charge)}</td><td class="num">${(+p.h.toFixed(1)).toLocaleString("en-GB")}</td><td class="num">${fmtN(p.hc)}</td><td class="num">${gbp(p.rate, 2)}</td><td><button type="button" class="btn ghost" data-mi="${p.i}" data-mshow="1">${pinned(p) ? "Show on map" : "Place it"}</button></td></tr>`).join("")}</tbody></table></div>`;
  }

  /* ----- state changes ----- */
  function refresh(){
    M = mapModel(); if (!M){ E.side.innerHTML = `<p class="small">Add sites first. The map shows them once they have a price.</p>`; return; }
    stats(); rail(); project(); drawLegend(); panel(); if (O.view === "table") table();
    E.attr.textContent = attrText(); E.base.setAttribute("aria-label", mapLabel()); schedule(true);
  }
  function mapLabel(){
    const g = M.geo, top = M.regions.filter(r => r.n).sort((a, b) => b.charge - a.charge).slice(0, 3);
    return `Map of the UK with ${g ? fmtN(g.pin) : 0} of ${fmtN(M.totals.n)} sites. ${top.map(r => `${r.nm} ${pct(r.share)} of the charge`).join(", ")}. The table view lists every figure.`;
  }
  function pick(s, focusPanel){
    sel = s && (s.t !== "site" || s.i >= 0) ? s : null; if (sel) side = "overview";
    panel(); schedule(true);
    if (sel && sel.t === "site" && O.view === "map"){ const p = M.points[sel.i];
      if (pinned(p) || p.geoSrc === "region"){ const x = SX(p.lon), y = SY(p.lat); if (x < 30 || y < 30 || x > W - 30 || y > H - 30){ V.x += W / 2 - x; V.y += H / 2 - y; schedule(); } } }
    if (focusPanel){ const h = E.side.querySelector("#mapSel"); if (h) h.focus({preventScroll:true}); }
  }
  function setView(v){
    O.view = v; E.dlg.querySelectorAll("[data-mview]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mview === v)));
    E.stage.hidden = v !== "map"; E.table.hidden = v !== "table"; if (v === "table") table(); else { resize(); schedule(true); }
  }
  function place(i, text){
    const p = M.points[i], s = p && siteOf(p), err = E.dlg.querySelector("#mfe" + i); if (!s) return;
    const r = setSiteLocation(s, text);
    if (r.error){ if (err) err.textContent = r.error; const inp = E.dlg.querySelector("#mf" + i); if (inp){ inp.setAttribute("aria-invalid", "true"); inp.focus(); } return; }
    dirty = true; Store.queue(); const was = side, uid = p.uid; refresh();
    const j = M.points.findIndex(q => q.uid === uid), q = M.points[j];
    toast(`${q.name}: ${GEO_SRC_L[q.geoSrc].toLowerCase()}${q.via && q.geoSrc !== "manual" ? " " + q.via : ""}${q.lad != null ? `, ${geoIndex().A.lads[q.lad].nm}` : ""}.`);
    if (was === "fix" && !sel){ side = "fix"; panel(); const next = E.side.querySelector(".m-fix input"); if (next) next.focus(); }
    else pick({t:"site", i:j}, true);
  }
  function openCard(i){
    const uid = M.points[i].uid; close();
    const R = compute(), k = R ? R.rows.findIndex(r => r.s.uid === uid) : -1; if (k < 0) return;
    S.insSite = k; if (S.step !== "insights") go("insights"); else renderInsights();
    requestAnimationFrame(() => { const el = document.getElementById("ins-site"), h = document.getElementById("hi-site"); if (el) el.scrollIntoView({block:"start"}); if (h) h.focus({preventScroll:true}); });
  }

  /* ----- building and events ----- */
  function build(){
    dlg = document.getElementById("mapDlg");
    dlg.innerHTML = `
      <header class="m-head"><div class="m-title"><h2 id="mapT">Estate map</h2><p class="xs muted" id="mapSub"></p></div>
        <dl class="m-stats" id="mapStats"></dl>
        <div class="m-tools"><button type="button" class="btn ghost m-layers" data-mact="layers" aria-expanded="false" aria-controls="mapRail">Layers</button>
          <div class="seg" role="group" aria-label="Show as"><button type="button" data-mview="map" aria-pressed="true">Map</button><button type="button" data-mview="table" aria-pressed="false">Table</button></div>
          <button type="button" class="btn" data-mact="close">Close</button></div></header>
      <div class="m-body">
        <div class="m-rail" id="mapRail" role="region" aria-label="Map layers"></div>
        <div class="m-stage" id="mapStage" tabindex="0" role="group" aria-roledescription="map" aria-label="Estate map" aria-describedby="mapKeys">
          <svg class="m-base" role="img" aria-label="Map of the UK"><g class="w"></g></svg>
          <canvas class="m-heat" aria-hidden="true" hidden></canvas>
          <svg class="m-top" aria-hidden="true"></svg>
          <div class="m-zoom"><button type="button" data-mact="in" aria-label="Zoom in">+</button><button type="button" data-mact="out" aria-label="Zoom out">−</button><button type="button" data-mact="fit" aria-label="Fit to the sites">Fit</button></div>
          <div class="m-legend" id="mapLegend"></div>
          <p class="m-attr" id="mapAttr"></p>
          <div class="m-tip" hidden></div>
          <p class="m-status" id="mapStatus" aria-live="polite" hidden></p>
          <p class="sr" id="mapKeys">Arrow keys move the map, plus and minus zoom, 0 fits it to the sites. The table view lists every figure.</p>
        </div>
        <div class="m-table" id="mapTable" hidden></div>
        <aside class="m-side" id="mapSide" aria-label="Details"></aside>
      </div>`;
    const q = s => dlg.querySelector(s);
    E = {dlg, body:q(".m-body"), stage:q("#mapStage"), base:q(".m-base"), world:q(".m-base .w"), heat:q(".m-heat"), top:q(".m-top"), legend:q("#mapLegend"), attr:q("#mapAttr"),
      tip:q(".m-tip"), status:q("#mapStatus"), rail:q("#mapRail"), side:q("#mapSide"), table:q("#mapTable"), stats:q("#mapStats"), sub:q("#mapSub")};
    dlg.addEventListener("click", onClick); dlg.addEventListener("change", onChange); dlg.addEventListener("input", onInput); dlg.addEventListener("keydown", onKey);
    dlg.addEventListener("close", () => { clearTimeout(heatT); E.tip.hidden = true; if (dirty){ dirty = false; render(); } if (lastFocus && lastFocus.isConnected) lastFocus.focus(); });
    const st = E.stage, ptrs = new Map(); let drag = null, moved = false, pinch = null, eat = false;
    st.addEventListener("pointerdown", e => {
      if (streetOn() || (e.pointerType === "mouse" && e.button !== 0)) return; if (e.target.closest(".m-zoom, .m-legend, .m-attr")) return;
      ptrs.set(e.pointerId, {x:e.clientX, y:e.clientY}); moved = false; drag = {x:e.clientX, y:e.clientY, vx:V.x, vy:V.y};
      if (ptrs.size === 2){ const [a, b] = [...ptrs.values()]; pinch = {d:Math.hypot(a.x - b.x, a.y - b.y) || 1, k:V.k}; }
    });
    st.addEventListener("pointermove", e => {
      if (!ptrs.has(e.pointerId)) return hover(e); ptrs.set(e.pointerId, {x:e.clientX, y:e.clientY});
      if (ptrs.size === 2 && pinch){ const [a, b] = [...ptrs.values()], bb = st.getBoundingClientRect(); moved = true; zoomAt((a.x + b.x) / 2 - bb.left, (a.y + b.y) / 2 - bb.top, pinch.k * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d); return; }
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!moved && Math.hypot(dx, dy) > 4){ moved = true; st.setPointerCapture(e.pointerId); st.classList.add("dragging"); E.tip.hidden = true; }
      if (moved && !pinch){ touched = true; V.x = drag.vx + dx; V.y = drag.vy + dy; schedule(); }
    });
    const up = e => { if (!ptrs.delete(e.pointerId)) return; if (ptrs.size < 2) pinch = null;
      if (ptrs.size === 1){ const [a] = [...ptrs.values()]; drag = {x:a.x, y:a.y, vx:V.x, vy:V.y}; }
      if (!ptrs.size){ st.classList.remove("dragging"); if (moved){ eat = true; setTimeout(() => { eat = false; }, 0); } } };
    st.addEventListener("pointerup", up); st.addEventListener("pointercancel", up);
    st.addEventListener("pointerleave", () => { E.tip.hidden = true; });
    st.addEventListener("click", e => { if (eat){ e.stopPropagation(); e.preventDefault(); } }, true);
    st.addEventListener("wheel", e => { if (streetOn()) return; e.preventDefault(); const bb = st.getBoundingClientRect(); zoomAt(e.clientX - bb.left, e.clientY - bb.top, V.k * Math.exp(-e.deltaY * (e.deltaMode ? 0.06 : 0.0018))); }, {passive:false});
    st.addEventListener("dblclick", e => { if (streetOn() || e.target.closest(".m-zoom, .m-legend")) return; const bb = st.getBoundingClientRect(); zoomAt(e.clientX - bb.left, e.clientY - bb.top, V.k * 2); });
    st.addEventListener("keydown", e => {
      if (e.target !== st || streetOn()) return; const k = e.key, c = {x:W / 2, y:H / 2};
      if (k === "ArrowLeft" || k === "ArrowRight" || k === "ArrowUp" || k === "ArrowDown"){ e.preventDefault(); touched = true; const s = e.shiftKey ? 200 : 70;
        V.x += k === "ArrowLeft" ? s : k === "ArrowRight" ? -s : 0; V.y += k === "ArrowUp" ? s : k === "ArrowDown" ? -s : 0; schedule(); }
      else if (k === "+" || k === "="){ e.preventDefault(); zoomAt(c.x, c.y, V.k * 1.5); }
      else if (k === "-" || k === "_"){ e.preventDefault(); zoomAt(c.x, c.y, V.k / 1.5); }
      else if (k === "0"){ e.preventDefault(); fit(); }
    });
    new ResizeObserver(() => resize()).observe(st);
  }
  function resize(){
    if (!E || E.stage.hidden) return; const w = E.stage.clientWidth, h = E.stage.clientHeight;
    if (!w || !h || (w === W && h === H)) return; const first = !W; if (!first){ V.x += (w - W) / 2; V.y += (h - H) / 2; } W = w; H = h;
    if ((first || !touched) && M) fit(); else schedule(true);
  }
  function hover(e){
    if (e.pointerType !== "mouse" || streetOn()) return; const c = e.target.closest && e.target.closest("[data-i], [data-a], [data-rgo]"); if (!c || !M){ E.tip.hidden = true; return; }
    const bb = E.stage.getBoundingClientRect(); tipAt(c.dataset, e.clientX - bb.left, e.clientY - bb.top);
  }
  function tipAt(ds, x, y){
    let h = "";
    if (ds.i != null){ const p = M.points[+ds.i]; h = `<b>${esc(p.name)}</b><span>${esc(p.format)} · ${gbp(p.charge)} a week · ${(+p.h.toFixed(1)).toLocaleString("en-GB")} hrs · ${fmtN(p.hc)} operative${p.hc === 1 ? "" : "s"}</span>`; }
    else if (ds.rgo){ const n = M.points.filter(p => p.geoSrc === "region" && p.rgn === ds.rgo && shown(p)).length; h = `<b>${fmtN(n)} site${n === 1 ? "" : "s"} with no pin</b><span>Known only as ${esc(rgName(ds.rgo))}. Select to see them.</span>`; }
    else if (ds.a){ const [kind, key] = ds.a.split(":"), a = kind === "rg" ? M.regions.find(r => r.cd === key) : M.lads.find(l => l.i === +key);
      if (kind === "lad" && !a){ const L = geoIndex().A.lads[+key]; h = `<b>${esc(L.nm)}</b><span>No sites</span>`; }
      else if (a){ const d = AREA[O.areaOf]; h = `<b>${esc(a.nm)}</b><span>${a.n ? `${fmtN(a.n)} site${a.n === 1 ? "" : "s"} · ${gbp(a.charge)} a week${O.areas !== "none" && O.areaOf !== "charge" && O.areaOf !== "n" && a[d.k] != null ? ` · ${esc(d.l.toLowerCase())} ${d.f(a[d.k])}` : ""}` : "No sites"}</span>`; } }
    if (!h){ E.tip.hidden = true; return; }
    E.tip.innerHTML = h; E.tip.hidden = false;
    const tw = E.tip.offsetWidth, th = E.tip.offsetHeight;
    E.tip.style.left = `${clamp(6, W - tw - 6, x + 14)}px`; E.tip.style.top = `${y + 18 + th > H ? y - th - 12 : y + 18}px`;
  }
  function onClick(e){
    const t = e.target, b = t.closest("button"); if (t === dlg) return close();
    if (b){
      if (b.dataset.mact){ const a = b.dataset.mact;
        if (a === "close") return close();
        if ((a === "in" || a === "out" || a === "fit") && streetOn()) return street().zoom(a);
        if (a === "in" || a === "out"){ zoomAt(W / 2, H / 2, V.k * (a === "in" ? 1.6 : 1 / 1.6)); return; }
        if (a === "fit") return fit();
        if (a === "layers"){ const open = E.body.classList.toggle("rail-open"); b.setAttribute("aria-expanded", String(open)); return; }
        if (a === "overview"){ sel = null; side = "overview"; panel(); schedule(true); const h = E.side.querySelector("#mapSel"); if (h) h.focus(); return; }
        if (a === "fix"){ sel = null; side = "fix"; panel(); schedule(true); const h = E.side.querySelector("#mapSel"); if (h) h.focus(); return; }
      }
      if (b.dataset.mview) return setView(b.dataset.mview);
      if (b.dataset.mbase){ const v = b.dataset.mbase; if (v === O.base) return; O.base = v; E.rail.querySelectorAll("[data-mbase]").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.mbase === v)));
        if (street()) street().toggle(v === "street", api); layers(); return; }
      if (b.dataset.mi != null){ const i = +b.dataset.mi; if (b.dataset.mshow && O.view !== "map") setView("map"); if (!pinned(M.points[i]) && M.points[i].geoSrc !== "region"){ sel = {t:"site", i}; side = "overview"; panel(); const inp = E.side.querySelector(".m-fix input"); if (inp) inp.focus(); return; } return pick({t:"site", i}, true); }
      if (b.dataset.ma){ if (O.view !== "map") setView("map"); return pick({t:"area", key:b.dataset.ma}, true); }
      if (b.dataset.mcard != null) return openCard(+b.dataset.mcard);
      if (b.dataset.mclear != null) return place(+b.dataset.mclear, "");
      if (b.dataset.mplace != null){ const inp = E.dlg.querySelector("#mf" + b.dataset.mplace); return place(+b.dataset.mplace, inp ? inp.value : ""); }
      return;
    }
    if (!t.closest("#mapStage") || t.closest(".m-zoom, .m-legend, .m-attr, .m-street")) return;
    const c = t.closest("[data-i]"), g = t.closest("[data-rgo]"), a = t.closest("[data-a]");
    if (c) return pick({t:"site", i:+c.dataset.i});
    if (g) return pick({t:"area", key:"rg:" + g.dataset.rgo});
    if (a) return pick({t:"area", key:a.dataset.a});
    if (sel){ sel = null; panel(); schedule(true); }
  }
  function onChange(e){
    const t = e.target;
    if (t.dataset.mopt){ const k = t.dataset.mopt; O[k] = t.type === "checkbox" ? t.checked : t.value;
      if (k === "areas" && O.areas === "none" && sel && sel.t === "area" && sel.key.startsWith("lad")) sel = null;
      if (k === "areas" && sel && sel.t === "area" && ((O.areas === "councils") !== sel.key.startsWith("lad"))) sel = null;
      const f = t.dataset.mopt; rail(); project(); drawLegend(); panel(); if (O.view === "table") table();
      if (k === "heat" && !O.heat) E.heat.hidden = true; schedule(true); if (k === "heat" || k === "heatOf") drawHeat();
      const back = E.rail.querySelector(`[data-mopt="${f}"]`); if (back) back.focus(); return; }
    if (t.dataset.mfmt != null){ if (t.checked) O.hide.delete(t.dataset.mfmt); else O.hide.add(t.dataset.mfmt); const f = t.dataset.mfmt;
      rail(); project(); drawLegend(); schedule(true); drawHeat(); const back = E.rail.querySelector(`[data-mfmt="${CSS.escape(f)}"]`); if (back) back.focus(); }
  }
  let tt = 0;
  function onInput(e){
    const t = e.target;
    if (t.dataset.mtfilt != null){ tblFilter = t.value; clearTimeout(tt); tt = setTimeout(() => { table(); const f = E.table.querySelector("[data-mtfilt]"); f.focus(); f.setSelectionRange(f.value.length, f.value.length); }, 150); }
    if (t.closest(".m-fix")){ t.removeAttribute("aria-invalid"); const err = t.closest(".m-fix").querySelector(".err"); if (err) err.textContent = ""; }
  }
  function onKey(e){ if (e.key !== "Enter" || e.isComposing) return; const f = e.target.closest && e.target.closest(".m-fix"); if (!f || e.target.tagName !== "INPUT") return; e.preventDefault(); place(+f.dataset.mfix, e.target.value); }
  function close(){ if (dlg && dlg.open) dlg.close(); }
  function open(uid){
    if (!document.getElementById("mapDlg")) return;
    lastFocus = document.activeElement; if (!dlg) build();
    sel = null; side = "overview"; grown = false; E.body.classList.remove("rail-open");
    if (!dlg.open) dlg.showModal(); setView(O.view === "table" ? "table" : "map");
    E.status.hidden = false; E.status.textContent = "Loading the map of the UK…"; E.stage.setAttribute("aria-busy", "true");
    load().then(() => { E.status.hidden = true; E.stage.removeAttribute("aria-busy"); refresh(); W = 0; resize();
      if (uid){ const i = M.points.findIndex(p => p.uid === uid); if (i >= 0) pick({t:"site", i}, true); } else E.stage.focus({preventScroll:true});
    })
      .catch(e => { E.status.textContent = `The map data did not load (${e.message}). Close and try again, or use the table view.`; M = mapModel(); if (M){ stats(); panel(); } });
  }
  // A small outline of the UK with a dot per site, for the insights page. It loads the map data in the background.
  function thumb(el){
    if (!el) return;
    load().then(() => { if (!el.isConnected) return; const P = geoPaths(), MM = mapModel(); if (!P || !MM) return;
      const vb = `${wx(UK.w).toFixed(0)} ${wy(UK.n).toFixed(0)} ${(wx(UK.e) - wx(UK.w)).toFixed(0)} ${(wy(UK.s) - wy(UK.n)).toFixed(0)}`, list = MM.points.filter(pinned), max = Math.max(1, ...list.map(p => p.charge));
      el.innerHTML = `<svg viewBox="${vb}" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><path class="land" d="${P.A.regions.map(r => thinD(r.p, 6)).join("")}"/>${list.sort((a, b) => b.charge - a.charge).map(p => `<circle cx="${wx(p.lon).toFixed(1)}" cy="${wy(p.lat).toFixed(1)}" r="${(5 + 22 * Math.sqrt(p.charge / max)).toFixed(1)}" style="fill:${FMT_C[p.format] || FMT_OTHER}"/>`).join("")}</svg>`;
      const cap = el.parentElement && el.parentElement.querySelector("[data-mthumb]"); if (cap && MM.geo) cap.textContent = `${fmtN(MM.geo.pin)} of ${fmtN(MM.totals.n)} sites placed from their postcode, town or council.`;
    }).catch(() => { el.innerHTML = ""; });
  }
  const api = {get model(){ return M; }, get opts(){ return O; }, get sel(){ return sel; }, pick, place, colourer, areaFill, sizeOf:p => { const k = SIZE[O.size].k, vmax = Math.max(1e-9, ...M.points.map(q => q[k])); return p[k] / vmax; }, stage:() => E.stage,
    visible:p => pinned(p) && shown(p), regionOnly:p => p.geoSrc === "region" && shown(p), baseRadius:p => { const k = SIZE[O.size].k, vmax = Math.max(1e-9, ...M.points.filter(q => pinned(q) && shown(q)).map(q => q[k])); return (2 + 9.5 * Math.sqrt(clamp(0, 1, p[k] / vmax))) * (O.heat ? 0.5 : 1) * small(); },
    heatWeight:() => { const key = HEAT[O.heatOf].k, vals = M.points.filter(p => pinned(p) && shown(p)).map(p => key ? p[key] : 1).sort((a, b) => a - b), ref = vals[Math.floor(vals.length * 0.9)] || 1; return p => clamp(0.05, 1, (key ? p[key] : 1) / ref); },
    extent:() => { const b = M && M.extent ? Object.assign({}, M.extent) : Object.assign({}, UK); return b; }, uk:UK, tip:(ds, x, y) => ds ? tipAt(ds, x, y) : (E.tip.hidden = true),
    status:txt => { E.status.hidden = !txt; E.status.textContent = txt || ""; }, streetReady:() => { layers(); panel(); }, streetFailed:why => { O.base = "outline"; rail(); layers(); panel(); toast(why); }, rgName:cd => rgName(cd)};
  return {open, close, thumb, load, api};
})();
