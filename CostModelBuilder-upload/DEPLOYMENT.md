# Cost Model Builder: deployment runbook

How to take the prototype in this folder to a Copilot Cowork hosted app used by sellers. The app is a static page (index.html, app.js, engine.js, data/reference-data.js). All pricing runs in the browser, and the same engine runs in node for the tests. Anything that needs identity, storage or Office runs in the host, the Copilot Studio agent or the Power Automate flow, and talks to the page through the message bridge described below.

> Status: the page, engine, tests and template are built and verified locally. The Cowork host origin, the Dataverse tables and the Copilot Studio agent and flow are **designs, not yet deployed**. Confirm each item marked *confirm* with the platform team before go-live.

> **Hosting as a Copilot Managed Runtime app** (recommended) is covered in [MANAGED-APP.md](MANAGED-APP.md): `npm run build` produces `dist/`, where the adapter `platform.js` replaces the iframe host and maps the same messages to connectors. The message types in section 3 are unchanged; the host side is the adapter, wired in `platform/connectors.js`.

## 1. Components

| Component | What it does | Where it lives |
|---|---|---|
| Hosted page | Seller UX, pricing engine, sign-off, audit log | Static hosting behind the Cowork app (SharePoint or Azure Static Web Apps, *confirm*) |
| Reference data | Rate card, benchmarks, curve, approval thresholds, hosting allow-list | `data/reference-data.js`, owned by commercial finance |
| Spec Extractor agent | Reads the tender pack (PDF, DOCX, XLSX) and returns an `OpportunitySpec/1.0` | Copilot Studio; instructions in `agents/spec-extractor.md`, schema in `schemas/opportunity-spec.schema.json` |
| Bid Coach agent | Answers the seller's Ask-box questions in plain English; never recommends a price | Copilot Studio; instructions in `agents/bid-coach.md`, knowledge in `agents/bid-coach-knowledge.json` |
| Build Workbook flow | Copies the master template, runs the Office Script, checks totals | Power Automate; script in `templates/populateModel.ts` |
| Master template | The workbook the payload fills | `templates/CMB Master Template v1.xlsx` in a locked SharePoint library |
| Opportunity folder | Tender documents, generated workbook, saved opportunity file | SharePoint, one folder per opportunity |
| Dataverse | Opportunity state, payloads, audit, question feedback | Tables in section 4 |

## 2. Identity (Entra ID)

- The Cowork host signs the seller in with Entra SSO. The page never handles tokens.
- After `app.ready`, the host sends `session.user` with `{name, upn}`. The page keeps it for the whole session (Start over and Resume keep it). It fills the sign-off name and stamps question feedback.
- In standalone preview there is no identity: the seller types a name at sign-off and feedback is stamped "standalone user". Standalone is for demos and testing only.
- Restrict the Cowork app to the bid and sales security group. Put commercial and finance approvers in a separate group; section 7 shows how the approval route uses them.

## 3. Message bridge

The page runs in an iframe. Every message is `{source:"cost-model-builder", type, data}` from the page, or `{target:"cost-model-builder", type, data}` to the page.

**The page trusts only its host.** It works out the parent origin from `location.ancestorOrigins`, or failing that the referrer, and checks it against `hosting.allowedHostOrigins`. A leading `*.` wildcard matches subdomains, and same-origin is always trusted. If the origin is not on the list, the page shows "Host not recognised" and sends and accepts nothing. Incoming messages must come from `window.parent` and from that exact origin. This was tested with a same-origin host (connected), a cross-origin host that is not on the list (ignored) and a forged self-post (ignored).

| Direction | Type | Data | Host action |
|---|---|---|---|
| page → host | `app.ready` | `{version}` | Reply with `session.user`, then `opportunity.load` if reopening |
| host → page | `session.user` | `{name, upn}` | — |
| host → page | `opportunity.load` | `CostModelOpportunity/1.0` | The page restores it, reconciles the rate card and flags a price move |
| page → host | `spec.extract.request` | `{files:[names]}` | Run the Spec Extractor agent on the files in the opportunity folder |
| host → page | `spec.extract.result` | `OpportunitySpec/1.0` | The page validates each field; a low-confidence client name stays a suggestion |
| page → host | `guide.ask` | `{id, question, step, item, context:{sector, sites, openCritical, hoursMethod}}` | Run the Bid Coach agent; reply within 20 s or the page falls back to its local search |
| host → page | `guide.answer` | `{id, text (≤4,000 chars), refs:[guide keys]}` | The page shows it only if `id` matches the open question; unknown `refs` are dropped |
| page → host | `opportunity.save` | `CostModelOpportunity/1.0` | Upsert the Opportunity row (debounced: 0.7 s in Cowork, 15 s as a managed app, `hosting.managedSaveMs`, because each connector call is metered; also flushed when the tab is hidden) |
| page → host | `opportunity.discard` | `{}` | The seller chose Start over or discarded the draft; delete or close the draft row |
| host → page | `opportunity.draft` | `CostModelOpportunity/1.0` or `null` | Managed app only: the seller's latest saved draft, offered in the Resume banner ("in your opportunity records") |
| host → page | `platform.ready` | none | Managed app only: the adapter finished connecting; the page refreshes and the header tooltip lists the connected capabilities |
| host → page | `host.notice` | `{text}` (shown up to 300 chars) | A connector call failed; the page shows a toast and keeps working locally |
| page → host | `model.generate.request` | `ModelPayload` (includes `approval` and `feedback`) | Run the Build Workbook flow; store Payload, Feedback and Audit rows |
| host → page | `model.generate.result` | `{name, url}` | The page marks the model generated |

The page sends `model.generate.request` only after a valid sign-off (section 7).

## 4. Dataverse tables (proposed)

| Table | Key columns | Written by |
|---|---|---|
| Opportunity | opportunity id, client, owner (upn), sites, weekly charge, state (JSON, `CostModelOpportunity/1.0`), engine version, reference-data version, modified | `opportunity.save` |
| Payload | opportunity id, payload (JSON), weekly charge, approval level, signed off by, signed off at | `model.generate.request` |
| Audit | opportunity id, event, detail, by, at | payload `audit` array (spec.extract, spec.set, sites.load, answer, lever, feedback, signoff, signoff.withdrawn, opportunity.restore, opportunity.export, generate) |
| QuestionFeedback | opportunity id, question id, clear (yes/no), note, by, at, engine version | payload `feedback` array |
| GuideFeedback | opportunity id, guide key, helpful (yes/no), by, at | payload `guideFeedback` array (one vote per guide key; a changed vote replaces the earlier one) |
| ExtractionScore | opportunity id, field, extracted value, final value, confidence | Pilot only: compares the agent's spec with the signed-off spec |

Keep the full JSON so any payload can be replayed through `tools/populate_template.py` or the harness.

## 5. Copilot Studio and Power Automate

**Spec Extractor agent**
- Use the instructions in `agents/spec-extractor.md`. The output must validate against `schemas/opportunity-spec.schema.json`.
- The rules: cite a document and page for every value; leave a field out rather than guess; set a confidence for each value.
- Acceptance gate: run `node tools/extract_spec.mjs --score --agent <dir of agent outputs>`. It needs **100% precision on every case and at least 90% recall on the held-out cases**. The rule-based reference extractor scores 100% precision, but only 33% held-out recall on Northwind. That gap is why the agent is needed.

**Bid Coach agent**
- Use the instructions in `agents/bid-coach.md`. Upload `agents/bid-coach-knowledge.json` as its knowledge, and regenerate it with `node tools/export_guide.mjs` whenever `guide.js` changes.
- Acceptance gate: the ten-question test in `agents/bid-coach.md` passes 10/10, with no reply that recommends a number.

**Build Workbook flow**
1. Trigger: `model.generate.request`, received through the host.
2. Refuse the payload unless `approval.signoff` is present.
3. Copy `CMB Master Template v1.xlsx` into the opportunity folder as `<client> - First pass model.xlsx`.
4. Run the Office Script `populateModel.ts` with the payload.
5. The script returns `{ok, sites, workbookWeekly, appWeekly, totalDiff, sitesOutsidePenny, worstSiteDiff, control, errors}`. Fail the run unless `ok` is true and `totalDiff` is under a penny.
6. Write the Payload, Audit and Feedback rows, then reply `model.generate.result`.

## 6. Hosting and security headers

- `index.html` carries a CSP meta tag: `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://tiles.openfreemap.org; worker-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'`. There is no inline script and no eval. The OpenFreeMap origin and `worker-src` are only for the optional street map in the estate map. Remove them to keep the page fully offline; the outline map still works.
- **Managed app build:** `npm run build` removes the meta tag from `dist/index.html`, because the platform sets its own CSP header and a second policy would intersect with it and could block the platform's bridge script. `tools/csp-check.mjs` checks `dist/` against the platform's default policy and fails the build on inline script, eval, workers, external resources or forms. It waives a rule only for the vendored MapLibre files named in `platform/csp-exceptions.json`, which also lists the header exceptions the street map needs (MANAGED-APP.md §4 item 11). Sections below on `frame-ancestors` and the allow-list apply to the Cowork iframe host only.
- `frame-ancestors` cannot be set in a meta tag. Set it as a **response header** on the hosting service, with the same origins as `hosting.allowedHostOrigins`, for example `Content-Security-Policy: frame-ancestors https://m365.cloud.microsoft https://*.cloud.microsoft https://*.office.com https://*.sharepoint.com`.
- The allow-list in `reference-data.js` is a best guess. *Confirm* the real Cowork host origins and trim the list to them.
- The page makes no network calls of its own, except map tiles for the optional street map. Those go to `tiles.openfreemap.org` and carry no client data. Documents are read in the browser (standalone) or by the agent (Cowork).
- **Local autosave.** In standalone mode, the page autosaves the opportunity to the browser's localStorage (`cmb.opportunity.v1`), which holds client data on that device. In Cowork, autosave goes to the host only. For any shared or unmanaged device, set `hosting.localAutosave: false`.
- DLP: put the agent, the flow, SharePoint and Dataverse in the same Power Platform environment and data policy group, and block other connectors in that environment.

## 7. Approval route and sign-off

The approval route comes from `approvalRoute()` in engine.js, using `approval` in reference-data.js:

| Level | When | Approvers |
|---|---|---|
| standard | Every check is inside policy | Bid manager, Commercial manager |
| director | Profit below `minProfitPct`, labour above `maxLabourPct`, revenue per hour outside `minRevPerHr`–`maxRevPerHr`, or an hours challenge above `maxHoursChallengePct` | Bid manager, Commercial director |
| finance | Annual value at or above `secondApproverAnnual` (added to either level above) | adds Finance director |

- The seller cannot sign off while any blocking check is open.
- A sign-off records the name, the weekly charge and the site count. It goes stale when either the charge (to the penny) or the site count changes, and Generate stays disabled until the seller signs off again.
- In-tool sign-off is the preparer's sign-off only. The approvers named in the route approve outside the tool, for example in a Teams approval started by the flow.

## 8. Reference data ownership

- There is one file, `data/reference-data.js`. Every change needs a new `meta.version`, a date, the owner and a source. Set `meta.status` to `verified` only after the owner has checked each rate against HMRC and the Living Wage Foundation (it is currently `unverified`).
- Saved opportunities record the engine and reference-data versions. When a saved opportunity is reopened under newer data, the page shows an info flag. If the weekly charge moved, it shows a warning, and the old sign-off becomes stale.
- Treat changes to approval thresholds and the hosting allow-list as policy changes. Commercial finance and security sign them off.

## 9. Environments and release gates

Use three Power Platform environments: dev, test and prod. Promote with managed solutions. Host the page files per environment, each with its own allow-list.

A release is blocked unless every gate passes:

```powershell
cd CostModelBuilder
npm test                                   # 45 unit tests: engine, extraction contract, approval, save/restore, insights, guide, managed build and adapter
npm run build                              # managed app build into dist/; fails if the platform CSP would block anything
node tools/harness.mjs --parity            # 20 runs, node vs browser robot, to the penny
node tools/harness.mjs --payloads out\payloads
python tools/verify_template.py out\payloads out\workbooks out\verify.json   # Excel recalc, 20/20 match (needs Excel)
node tools/extract_spec.mjs --score        # precision 100%; the agent run must also reach >= 90% held-out recall
```

- Also run the axe-core accessibility scan across the 11 page states at desktop and mobile size. The last run found 0 violations in all 22 checks.
- `node tools/harness.mjs --loo` reports the leave-one-out error. Rerun it whenever the curve or benchmarks change, and record the result in STRESS-TEST-REVIEW.md.

## 10. Go-live checklist

- [ ] Cowork host origins confirmed; allow-list and `frame-ancestors` header set to match
- [ ] Host sends `session.user`; sign-off shows the Entra name
- [ ] Dataverse tables created with role-based security (owners see their own rows; bid managers see their team's)
- [ ] Spec Extractor agent passes the extraction gate
- [ ] Bid Coach agent passes its ten-question test and `agents/bid-coach-knowledge.json` matches `guide.js`
- [ ] Build Workbook flow refuses unsigned payloads and checks totals
- [ ] Reference data `meta.status` is `verified`, with the owner named
- [ ] Approval groups created; the Teams approval is wired to the route
- [ ] `hosting.localAutosave` decided for the standalone build
- [ ] Shadow pilot run (PILOT.md) and its go/no-go met
- [ ] Managed app only (MANAGED-APP.md): Frontier enrolment, shared environment, repository choice, Copilot Studio connector allowed, workbook option chosen, downloads checked in the preview, licensing decided, app shared with the seller group
- [ ] Cowork skill uploaded with the live app URL
