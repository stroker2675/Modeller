/* Connector wiring for the managed app. Each entry stays null until its data source is added and tested; the matching
   capability then turns on by itself (platform/managed.js probes ready()). Wire one at a time, in the order of MANAGED-APP.md §6.

   Add a data source with the CLI, which writes typed services into generated/ (don't edit those by hand):
     ms connector list --search dataverse
     ms app add data-source --connector <connector id> ...
   then import the generated service here and fill in the methods below. esbuild bundles .ts imports as they are.

   Contracts (the page validates everything it receives, so a bad reply is rejected, never applied wholesale):
     store     ready() → bool · save(CostModelOpportunity) · latest() → CostModelOpportunity|null · discard()
               Dataverse table Opportunity (DEPLOYMENT.md §4). Upsert on the row id you keep after the first create;
               latest() = the signed-in user's newest row that isn't marked Submitted.
     extract   ready() → bool · request({files:[names]}) → OpportunitySpec/1.0 (agents/spec-extractor.md)
               Microsoft Copilot Studio connector, ExecuteCopilotAsyncV2 against the Spec Extractor agent, with the
               files taken from the opportunity's SharePoint folder. Needs the connector allow-listed (§4).
     coach     ready() → bool · ask({id, question, step, item, context}) → {text, refs:[guide keys]} (agents/bid-coach.md)
               Same connector, Bid Coach agent. Must answer inside 20 s or the page uses its own search.
     workbook  ready() → bool · build(ModelPayload) → {name, url}
               Option A (§5): Excel Online (Business) "Run script" with templates/populateModel.ts, after copying the
               template with SharePoint "Copy file". "Run script" is blocked by default; the admin must allow it.
               Option B: a Copilot Studio agent flow that does the same, called like extract.
     identity  upn() → string    Office 365 Users, MyProfile (optional: getUser() already gives the name). */

export const connectors = {
  store: null,
  extract: null,
  coach: null,
  workbook: null,
  identity: null
};

/* Shape of a wired entry, for reference:

import { Cr123_opportunitiesService as Opps } from "../generated/services/Cr123_opportunitiesService";   // name comes from your table
let rowId = null;
connectors.store = {
  ready: async () => (await Opps.getAll({top:1})).success,
  save: async O => {
    const row = {cr123_client:O.client, cr123_sites:O.sites, cr123_weeklycharge:O.weeklyCharge, cr123_state:JSON.stringify(O)};
    const r = rowId ? await Opps.update(rowId, row) : await Opps.create(row);
    if (!r.success) throw r.error; if (!rowId) rowId = r.data.cr123_opportunityid;
  },
  latest: async () => { ... },
  discard: async () => { if (rowId) await Opps.delete(rowId); rowId = null; }
};
*/
