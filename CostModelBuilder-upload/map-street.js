/* ---------- Estate map: the optional street basemap ---------- */
// MapLibre GL JS (BSD-3-Clause, vendor/maplibre) drawing OpenFreeMap's Positron style (tiles.openfreemap.org, OpenStreetMap data).
// It reads the same figures and options as the outline map through EMap.api, so both show the same sites, heat and area shading.
// Loaded only when the seller picks Street map. If the library, WebGL, the network or the host's security policy says no,
// it explains why and hands back to the offline outline map. Nothing about the sites leaves the device: tiles are requested by area only.
globalThis.CMB_STREET = (() => {
  const LIB = "vendor/maplibre/maplibre-gl-csp.js", WORKER = "vendor/maplibre/maplibre-gl-csp-worker.js", CSS = "vendor/maplibre/maplibre-gl.css";
  const ORIGIN = "https://tiles.openfreemap.org", STYLE = ORIGIN + "/styles/positron";
  const attribution = "Street map © OpenFreeMap © OpenMapTiles © OpenStreetMap contributors";
  const HEAT_RAMP = ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(246,214,150,0)", 0.12, "rgba(246,214,150,.45)", 0.35, "rgba(232,168,70,.7)", 0.62, "rgba(206,96,38,.82)", 0.85, "rgba(168,40,24,.9)", 1, "rgba(104,20,12,.94)"];
  let map = null, host = null, api = null, libP = null, ready = false, on = false, failed = "", blocked = false, marker = null, lastSel = null, ro = null, timer = 0;

  document.addEventListener("securitypolicyviolation", e => { if (String(e.blockedURI).startsWith(ORIGIN) || /worker|blob/.test(e.effectiveDirective || "")) blocked = true; });
  const webgl = () => { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; } };
  function available(){ return !failed && navigator.onLine !== false; }
  function why(){ return failed || (navigator.onLine === false ? "The street map needs a network connection. The outline map works offline." : ""); }
  function active(){ return on && ready; }

  function loadLib(){
    if (globalThis.maplibregl) return Promise.resolve();
    return libP = libP || new Promise((ok, no) => {
      if (!document.querySelector(`link[href="${CSS}"]`)){ const l = document.createElement("link"); l.rel = "stylesheet"; l.href = CSS; document.head.appendChild(l); }
      const s = document.createElement("script"); s.src = LIB; s.onload = () => globalThis.maplibregl ? ok() : no(new Error("lib")); s.onerror = () => no(new Error("lib")); document.head.appendChild(s);
    }).catch(e => { libP = null; throw e; });
  }
  function fail(reason){
    clearTimeout(timer); failed = reason; on = false; ready = false;
    if (map){ try { map.remove(); } catch {} map = null; } if (host){ host.remove(); host = null; } if (ro){ ro.disconnect(); ro = null; }
    if (api){ api.status(null); api.streetFailed(reason); }
  }

  /* ----- GeoJSON from the model ----- */
  const ring = r => { const c = []; for (let i = 0; i < r.length; i += 2) c.push([r[i], r[i + 1]]); if (c.length && (c[0][0] !== c[c.length - 1][0] || c[0][1] !== c[c.length - 1][1])) c.push(c[0]); return c; };
  const geom = p => ({type:"MultiPolygon", coordinates:p.map(poly => poly.map(ring))});
  let shapes = null;
  function areaShapes(){
    const A = globalThis.CMB_GEO_AREAS; if (shapes && shapes.A === A) return shapes;
    return shapes = {A, rg:A.regions.map(r => ({type:"Feature", geometry:geom(r.p), properties:{key:"rg:" + r.cd}})), lad:A.lads.map((l, i) => ({type:"Feature", geometry:geom(l.p), properties:{key:"lad:" + i}}))};
  }
  function areasData(){
    const M = api.model, O = api.opts, sh = areaShapes(); if (!M || O.areas === "none") return {type:"FeatureCollection", features:[]};
    const F = api.areaFill(), sel = api.sel, by = {};
    (O.areas === "councils" ? M.lads.map(a => ["lad:" + a.i, a]) : M.regions.filter(r => r.n).map(a => ["rg:" + a.cd, a])).forEach(([k, a]) => { by[k] = a; });
    const list = O.areas === "councils" ? sh.lad : sh.rg;
    return {type:"FeatureCollection", features:list.map(f => { const a = by[f.properties.key], fill = a ? F.of(a) : null;
      return {type:"Feature", geometry:f.geometry, properties:{key:f.properties.key, fill:fill || "rgba(0,0,0,0)", on:!!(sel && sel.t === "area" && sel.key === f.properties.key)}}; })};
  }
  function sitesData(){
    const M = api.model, C = api.colourer(), w = api.heatWeight(), feats = [], seen = new Map(), z = map ? map.getZoom() : 5;
    const degPx = 360 / (512 * Math.pow(2, z)), f = z < 7 ? 0.9 + (z - 4) * 0.1 : z < 10 ? 1.2 + (z - 7) * 0.133 : 1.6;
    M.points.forEach(p => { if (!api.visible(p)) return; const k = p.lat + "," + p.lon, j = seen.get(k) || 0; seen.set(k, j + 1);
      // sites sharing a town centre are fanned out on screen, as on the outline map, so each one can be seen and picked
      const r = api.baseRadius(p), a = j * 2.39996, d = j ? (3 + r * f * 0.55) * Math.sqrt(j) : 0;
      const lon = p.lon + Math.cos(a) * d * degPx, lat = p.lat - Math.sin(a) * d * degPx * Math.cos(p.lat * Math.PI / 180);
      feats.push({type:"Feature", geometry:{type:"Point", coordinates:[lon, lat]}, properties:{i:p.i, r:+r.toFixed(2), c:C.of(p), w:+w(p).toFixed(3)}}); });
    feats.sort((x, y) => y.properties.r - x.properties.r);
    return {type:"FeatureCollection", features:feats};
  }
  function rgoData(){
    const M = api.model, by = {}; M.points.forEach(p => { if (api.regionOnly(p)) (by[p.rgn] = by[p.rgn] || {lon:p.lon, lat:p.lat, n:0}).n++; });
    return {type:"FeatureCollection", features:Object.entries(by).map(([cd, v]) => ({type:"Feature", geometry:{type:"Point", coordinates:[v.lon, v.lat]}, properties:{rgo:cd, n:String(v.n)}}))};
  }

  /* ----- layers ----- */
  // circle size grows gently with zoom, like the outline map; zoom must sit at the top of the expression
  const zoomR = (add = 0) => ["interpolate", ["linear"], ["zoom"], ...[[4, 0.9], [7, 1.2], [10, 1.6], [14, 2.1]].flatMap(([z, f]) => [z, ["+", ["*", ["get", "r"], f], add]])];
  function addLayers(){
    map.addSource("cmb-areas", {type:"geojson", data:areasData()});
    map.addSource("cmb-sites", {type:"geojson", data:sitesData()});
    map.addSource("cmb-rgo", {type:"geojson", data:rgoData()});
    const before = (map.getStyle().layers.find(l => l.type === "symbol") || {}).id;
    map.addLayer({id:"cmb-area-fill", type:"fill", source:"cmb-areas", paint:{"fill-color":["get", "fill"], "fill-opacity":0.62}}, before);
    map.addLayer({id:"cmb-area-line", type:"line", source:"cmb-areas", paint:{"line-color":["case", ["get", "on"], "#1c1e21", "#6a6c70"], "line-width":["case", ["get", "on"], 2.4, 0.6], "line-opacity":0.85}}, before);
    map.addLayer({id:"cmb-heat", type:"heatmap", source:"cmb-sites", layout:{visibility:"none"}, paint:{"heatmap-weight":["get", "w"], "heatmap-intensity":["interpolate", ["linear"], ["zoom"], 4, 0.7, 9, 1.4],
      "heatmap-radius":["interpolate", ["linear"], ["zoom"], 4, 16, 7, 30, 10, 56, 13, 90], "heatmap-color":HEAT_RAMP, "heatmap-opacity":0.85}});
    map.addLayer({id:"cmb-sites", type:"circle", source:"cmb-sites", paint:{"circle-radius":zoomR(), "circle-color":["get", "c"], "circle-opacity":0.85,
      "circle-stroke-color":"#fffdf8", "circle-stroke-width":0.9}});
    map.addLayer({id:"cmb-sel", type:"circle", source:"cmb-sites", filter:["==", ["get", "i"], -1], paint:{"circle-radius":zoomR(4), "circle-color":"rgba(0,0,0,0)", "circle-stroke-color":"#1c1e21", "circle-stroke-width":2}});
    map.addLayer({id:"cmb-rgo", type:"circle", source:"cmb-rgo", paint:{"circle-radius":13, "circle-color":"rgba(255,253,248,.92)", "circle-stroke-color":"#46484c", "circle-stroke-width":1.3}});
    map.addLayer({id:"cmb-rgo-n", type:"symbol", source:"cmb-rgo", layout:{"text-field":["get", "n"], "text-font":["Noto Sans Bold"], "text-size":11, "text-allow-overlap":true}, paint:{"text-color":"#1c1e21"}});
    const tip = (ds, e) => api.tip(ds, e.point.x, e.point.y);
    map.on("mousemove", "cmb-sites", e => { map.getCanvas().style.cursor = "pointer"; tip({i:e.features[0].properties.i}, e); });
    map.on("mousemove", "cmb-rgo", e => { map.getCanvas().style.cursor = "pointer"; tip({rgo:e.features[0].properties.rgo}, e); });
    map.on("mousemove", "cmb-area-fill", e => { if (map.queryRenderedFeatures(e.point, {layers:["cmb-sites", "cmb-rgo"]}).length) return; map.getCanvas().style.cursor = "pointer"; tip({a:e.features[0].properties.key}, e); });
    map.on("mouseout", () => { map.getCanvas().style.cursor = ""; api.tip(null); });
    let zr = 0; map.on("zoomend", () => { cancelAnimationFrame(zr); zr = requestAnimationFrame(() => { if (map && ready) map.getSource("cmb-sites").setData(sitesData()); }); });
    map.on("click", e => {
      const f = map.queryRenderedFeatures(e.point, {layers:["cmb-sites", "cmb-rgo", "cmb-area-fill"].filter(id => map.getLayer(id))})[0];
      if (!f) return api.pick(null);
      if (f.layer.id === "cmb-sites") return api.pick({t:"site", i:f.properties.i});
      if (f.layer.id === "cmb-rgo") return api.pick({t:"area", key:"rg:" + f.properties.rgo});
      api.pick({t:"area", key:f.properties.key});
    });
  }
  function fitSites(animate){
    const b = api.extent(); map.fitBounds([[b.w, b.s], [b.e, b.n]], {padding:{top:40, bottom:40, left:40, right:40}, maxZoom:12, duration:animate ? 500 : 0});
  }
  function update(){
    if (!map || !ready) return; const O = api.opts, sel = api.sel;
    map.getSource("cmb-areas").setData(areasData()); map.getSource("cmb-sites").setData(sitesData()); map.getSource("cmb-rgo").setData(rgoData());
    const vis = (id, v) => map.getLayer(id) && map.setLayoutProperty(id, "visibility", v ? "visible" : "none");
    vis("cmb-sites", O.sites); vis("cmb-sel", O.sites); vis("cmb-rgo", O.sites); vis("cmb-rgo-n", O.sites); vis("cmb-heat", O.heat); vis("cmb-area-fill", O.areas !== "none"); vis("cmb-area-line", O.areas !== "none");
    const si = sel && sel.t === "site" ? sel.i : -1; map.setFilter("cmb-sel", ["==", ["get", "i"], si]);
    const key = sel ? sel.t + ":" + (sel.i ?? sel.key) : "";
    if (key !== lastSel){ lastSel = key; pin(si); }
  }
  // The selected site gets a draggable pin: drop it where the site really is and the map re-places it (the price does not change)
  function pin(i){
    if (marker){ marker.remove(); marker = null; } if (i < 0) return;
    const p = api.model.points[i]; if (!p || !api.visible(p)) return;
    const pt = map.project([p.lon, p.lat]), c = map.getContainer(); if (pt.x < 30 || pt.y < 30 || pt.x > c.clientWidth - 30 || pt.y > c.clientHeight - 30) map.easeTo({center:[p.lon, p.lat], duration:400});
    const el = document.createElement("div"); el.className = "m-pin"; el.setAttribute("aria-label", `Drag to move ${p.name}`);
    marker = new maplibregl.Marker({element:el, draggable:true, anchor:"bottom"}).setLngLat([p.lon, p.lat]).addTo(map);
    marker.on("dragend", () => { const ll = marker.getLngLat(); api.place(i, `${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}`); });
  }
  function zoom(a){ if (!map) return; if (a === "in") map.zoomIn(); else if (a === "out") map.zoomOut(); else fitSites(true); }

  function start(){
    const stage = api.stage(); if (!webgl()) return fail("This browser cannot draw the street map (WebGL is off). The outline map shows the same figures.");
    host = document.createElement("div"); host.className = "m-street"; stage.insertBefore(host, stage.querySelector(".m-zoom"));
    maplibregl.setWorkerUrl(WORKER);
    const b = api.extent(); blocked = false; ready = false;
    try {
      map = new maplibregl.Map({container:host, style:STYLE, bounds:[[b.w, b.s], [b.e, b.n]], fitBoundsOptions:{padding:40, maxZoom:12}, attributionControl:false,
        dragRotate:false, pitchWithRotate:false, touchPitch:false, maxBounds:[[-14, 48], [6, 62.5]], cooperativeGestures:false});
    } catch (e){ return fail("The street map could not start here. The outline map shows the same figures."); }
    map.touchZoomRotate.disableRotation(); map.keyboard.disableRotation();
    timer = setTimeout(() => { if (!ready) fail(blocked ? blockedMsg() : "The street map tiles did not arrive in time. Your network may block tiles.openfreemap.org."); }, 15000);
    map.on("error", e => { if (ready) return; const m = String((e && e.error && e.error.message) || ""), s = e && e.error && (e.error.status || "");
      if (/^(layers|sources)\./.test(m)){ console.error(m); return fail("The street map could not draw the sites. The outline map shows the same figures."); }      // The browser reports a CSP block as an event after the failed fetch, so wait a moment before naming the cause.
      setTimeout(() => { if (!ready && on) fail(blocked ? blockedMsg() : `The street map tiles could not be reached${s ? ` (${String(s).slice(0, 60)})` : ""}. Your network may block tiles.openfreemap.org.`); }, 120); });
    map.on("load", () => { clearTimeout(timer); if (!map) return; try { addLayers(); } catch (e){ console.error(e); return fail("The street map could not draw the sites. The outline map shows the same figures."); } ready = true; lastSel = null; api.status(null); api.streetReady(); update(); });
    ro = new ResizeObserver(() => { if (map) map.resize(); }); ro.observe(host);
  }
  const blockedMsg = () => "This host's security policy blocks the street map. Ask for the OpenFreeMap exception in MANAGED-APP.md, or use the outline map.";
  function toggle(want, a){
    api = a; on = want;
    if (!want){ if (host) host.hidden = true; if (marker){ marker.remove(); marker = null; } lastSel = null; return; }
    if (map && ready){ host.hidden = false; map.resize(); lastSel = null; update(); fitSites(false); return; }
    api.status("Loading the street map…");
    loadLib().then(() => { if (on) start(); }).catch(() => fail(blocked ? blockedMsg() : "The street map library is missing from this build. The outline map shows the same figures."));
  }
  return {available, why, active, toggle, update, zoom, attribution};
})();
