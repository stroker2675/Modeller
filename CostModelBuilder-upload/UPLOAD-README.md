# Cost Model Builder: the upload copy

This folder is everything the hosted app needs, and nothing else. Upload **all of it**, as it is, to a **private** GitHub repository (or use it in a Codespace), then follow `cowork/browser-route/README.md`.

Made by `npm run pack:upload` in the full project on 2026-09-28 (version 3.0.0). Don't edit files here; change the full project and pack again.

## What's in it

| Path | Why it's needed |
|---|---|
| `index.html` | the page |
| `app.js` | the screens |
| `engine.js` | the pricing engine |
| `guide.js` | the Guide |
| `map.js` | the estate map |
| `map-street.js` | the optional street map |
| `data` | rates, benchmarks and the offline UK map data |
| `vendor/maplibre` | the street map library (BSD-3-Clause) |
| `platform` | the Managed Runtime adapter, connector wiring and CSP exceptions |
| `tools/build.mjs` | the build the platform runs (npm run build) |
| `tools/csp-check.mjs` | the security-policy check the build runs |
| `tools/dev.mjs` | the local preview (npm run dev) |
| `tests/platform.test.mjs` | the build and CSP tests |
| `package.json` | dependencies and commands (trimmed below) |
| `package-lock.json` | exact dependency versions |
| `.gitignore` | keeps build output out of Git |
| `README.md` | what the app is |
| `MANAGED-APP.md` | hosting plan |
| `DEPLOYMENT.md` | security and set-up runbook |
| `cowork/skills` | the Cowork helper skill |
| `cowork/browser-route/README.md` | the browser-only hosting guide |

## What's deliberately left out

| Left out | Why |
|---|---|
| `examples/` | Tender-derived client data. It must not go into the repository |
| `node_modules/`, `dist/` | Rebuilt automatically by `npm install` and `npm run build` |
| `tools/` analysis scripts and `tools/.cache` | Accuracy harness, stress-test and map-data builders. They need `examples/` or large downloads, and aren't used by the hosted app |
| `tests/engine.test.mjs`, `tests/guide.test.mjs` | They read `examples/`. Run them in the full project before each upload (`npm test`, 49 tests) |
| `agents/`, `schemas/`, `templates/` | Used later in Copilot Studio and SharePoint, not inside the app |
| Planning and review notes (`PLAN.md`, `PILOT.md`, `STRESS-TEST-REVIEW.md`, `DESIGN.md`, `PRODUCT.md`, `.impeccable/`) | Working notes, not needed to run the app |
| `cowork/browser-route/attach/` | A copy of built files for the Cowork route only. The build makes the same files |

## Keep the repository private

The app's own reference data and hints name the past bids its benchmarks were calibrated from (for example in `engine.js`, `guide.js` and `data/reference-data.js`). There are no tender documents or site lists in here, but treat the repository as confidential all the same.

## Check it before uploading (optional)

```
npm install
npm test          # 6 tests: the build and the security-policy check
npm run build     # makes dist/, the folder the platform serves
```
