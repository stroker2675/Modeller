# Cost Model Builder

This tool turns a cleaning tender pack into a first-pass BB cost model. A seller loads the documents, checks the extracted facts, answers the red-marked questions, signs off, and gets the populated master workbook. It is built to run as a Copilot Cowork hosted app, backed by a Copilot Studio agent and a Power Automate flow.

Before generating, step 7 **What it tells us** explains the finished price at five scales: £1, one billed hour, one site, the estate and the contract. Each scale gives one plain sentence and the visual that proves it:
- a pence grid;
- an hour receipt against past bids;
- a site scatter with the hours-per-floor-area fit;
- a concentration curve with the evidence behind the hours;
- the term bar and a re-priced "what moves the price most" tornado.

The sentences collect in a summary the seller can copy into the bid email or approval note.

The **estate map** opens as a full-screen dialog from the Sites step, the estate section of step 7, or any site card.
- **What it shows.** Every site is pinned from its postcode, town or council. Sites are sized by charge, hours or operatives, and coloured by format, region or pay share.
- **Shading and heat.** A heat layer shows where the operatives or the charge are. Regions or councils can be shaded by charge, pay share of the price, or billed rate against past bids.
- **Fixing sites.** Sites placed only by region, or in a different region from the one the site list gives, are listed to check. The seller fixes each one with a postcode, a town, or "lat, lon", or by dragging its pin.
- **Totals.** Every site is counted once, so the map's totals always equal the priced model.
- **Basemaps.** The built-in outline map works offline. The optional **Street map** (MapLibre and OpenFreeMap) needs internet access, plus the CSP exceptions in `platform/csp-exceptions.json` when it's hosted.
- **Table view.** A sortable table gives the same data without the map.

Step 7 also shows **wage to productivity**: pure pay (without NI, pension or holiday on-costs) as a share of the price, per £1 and per billed hour, against the past-bid bands.

A **Guide** panel walks a seller who isn't a cost modeller through every step. Open it with the Guide button or `?`; it opens by itself on the first visit.
- It explains whatever the seller points at or tabs to, in plain English: what it is, what to put, why it matters to the price, and what to do if unsure.
- It shows a checklist for the current step and the next thing to do.
- **Show me** spotlights the part of the page being described. Each step has a short tour.
- Glossary terms (TUPE, NLW, SSP…) are buttons that open a definition.
- **Ask** takes a free-text question. Standalone, it searches the guide. In Cowork it goes to the Bid Coach agent (`agents/bid-coach.md`), which explains but never recommends a price.
- Each explanation has a "Did this help?" vote, carried in the payload as `guideFeedback`.

All the guide text lives in `guide.js`.

## Run it

```powershell
python -m http.server 8765 --bind 127.0.0.1 --directory C:\CModels
# open http://127.0.0.1:8765/CostModelBuilder/index.html  (standalone preview; try a sample pack)
```

As a Copilot Managed Runtime app (see MANAGED-APP.md):

```powershell
npm install
npm run build        # dist/ with the platform adapter; checks the platform CSP
npm run dev          # serves dist/ on http://127.0.0.1:5173 with a strict CSP header (plus the street-map exceptions), rebuilds on change
npm run dev:strict   # the same without the street-map exceptions
npm run vendor       # refresh vendor/maplibre/ from node_modules after upgrading maplibre-gl
```

## Check it (release gates)

```powershell
npm test                                    # unit tests (engine, extraction contract, approval, save/restore, guide, managed build)
node tools/harness.mjs --parity             # node engine vs browser robot, 20 runs, to the penny
node tools/harness.mjs --loo                # leave-one-out accuracy
node tools/harness.mjs --payloads out\p; python tools/verify_template.py out\p out\wb out\verify.json   # Excel round trip (needs Excel)
node tools/extract_spec.mjs --score         # extraction precision/recall; add --agent <dir> to score the agent
node tools/export_guide.mjs                 # rewrite agents/bid-coach-knowledge.json after editing guide.js
```

## Files

| Path | What it is |
|---|---|
| `index.html`, `app.js` | The seller UI (shell and CSS; UI script) |
| `engine.js` | The pricing engine, flags, approval route, sign-off, payload, OpportunitySpec and save/restore. The same code runs in node |
| `guide.js` | The Guide's plain-English content (fields, questions, levers, checks, glossary), step tours, checklists, the next-step logic and the local search |
| `data/reference-data.js` | Rate card, benchmarks, curve, approval thresholds, hosting allow-list. The only file to edit when rates change |
| `map.js`, `map-street.js` | The estate map dialog: the built-in outline map (SVG and canvas heat), the table, the site-fix flow, and the optional street map layer |
| `vendor/maplibre/` | MapLibre GL JS 5 (BSD-3-Clause, `LICENSE.txt`), vendored so the page loads no script from a CDN |
| `data/geo/` | Offline UK geography for the estate map: region and local-authority outlines, postcode sectors and districts, place names. Rebuilt by `node tools/build_geo.mjs` (add `--offline` to reuse the download cache) |
| `schemas/opportunity-spec.schema.json`, `agents/spec-extractor.md` | Extraction contract and the Copilot Studio agent instructions |
| `agents/bid-coach.md`, `agents/bid-coach-knowledge.json` | The Bid Coach agent's instructions, contract and acceptance test, and its knowledge file (generated) |
| `templates/` | Master template and the Office Script `populateModel.ts` |
| `tools/` | Harness, extractor, template builder, populator and verifier, analysis scripts |
| `platform/` | Managed Runtime adapter (`managed.js`) and connector wiring points (`connectors.js`), bundled into `dist/platform.js` |
| `cowork/skills/cost-model-builder/` | Cowork custom skill that gathers the tender pack and hands off to the app |
| `tests/` | Unit tests (`npm test`) |
| `tools/pack-upload.mjs` | `npm run pack:upload`: makes `../CostModelBuilder-upload`, the clean folder to put on GitHub (no `examples/`, `node_modules/` or `dist/`) |
| `examples/` | Currys seller inputs, stress datasets DS1–DS5, the held-out Northwind ITT, the M&S readiness check (`examples/ms/`), results |
| `PLAN.md` | Architecture and roadmap |
| `DESIGN.md`, `PRODUCT.md` | Design system and product context |
| `STRESS-TEST-REVIEW.md` | Measured accuracy, iterations 1–3 |
| `DEPLOYMENT.md` | Cowork, Copilot Studio, Dataverse and security runbook, plus the release gates |
| `MANAGED-APP.md` | Moving to Copilot Managed Runtime and Cowork: routes, admin asks, phases, commands, cost |
| `PILOT.md` | Shadow pilot plan and go/no-go |

## Data attribution

`data/geo/` is derived from Ordnance Survey Code-Point Open and OS Open Names, and from ONS ITL1 and local authority boundaries. Contains OS data © Crown copyright and database right 2025. Contains Royal Mail data © Royal Mail copyright and database right 2025. Source: Office for National Statistics licensed under the Open Government Licence v3.0. The map shows this attribution on screen.

The optional street map uses MapLibre GL JS (BSD-3-Clause) and OpenFreeMap tiles: © OpenFreeMap, © OpenMapTiles, data © OpenStreetMap contributors (ODbL). The street map shows this attribution on screen too. Only tile, font and icon requests go to `tiles.openfreemap.org`; site, client and price data stay in the page.
