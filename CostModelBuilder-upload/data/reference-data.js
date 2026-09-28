/* Cost Model Builder reference data. This is the only file to edit when rates or benchmarks change.
   Every change needs a new version, the owner's name and the source. The test harness (npm test) prints the version it ran against,
   and the payload carries it into the generated workbook and the assumptions log.
   Loaded as a classic script before engine.js, so it works in the Cowork iframe, from file:// and in the node harness. */
const CMB_DATA = {
  meta: {
    version: "2026.09-r4",
    updated: "2026-09-28",
    owner: "Commercial finance (rate card owner to be confirmed)",
    status: "unverified",   // set to "verified" once the owner has checked every rate card row against HMRC and the Living Wage Foundation
    sources: [
      "NLW: gov.uk National Minimum Wage and National Living Wage rates",
      "RLW / LLW: Living Wage Foundation announcements",
      "Employer NI: HMRC rates and thresholds for employers",
      "Benchmarks, size curve, machinery and management defaults: the Inditex, Asda, Currys and Primark BB models in C:\\CModels"
    ]
  },
  // Rate cards by April year. The card in force for most of the first 12 months is used (ties go to the earlier card).
  rateCards: [
    {id:"2024/25", from:"2024-04-01", NLW:11.44, RLW:12.00, LLW:13.15, niRate:0.138, niThresholdWk:175},
    {id:"2025/26", from:"2025-04-01", NLW:12.21, RLW:12.60, LLW:13.85, niRate:0.15, niThresholdWk:96.15},
    {id:"2026/27", from:"2026-04-01", NLW:12.71, RLW:13.45, LLW:14.80, niRate:0.15, niThresholdWk:96.15}
  ],
  rateCardCommon: {levyPct:0.5, auditPerSiteWk:1.42, tnaPerSiteWk:1.10, weeksPerYear:52.143},
  // Ranges across the four prior BB models
  bench: {
    revPerHr: {lo: 15.64, hi: 21.07, label: "Revenue per labour hour"},
    labourPct: {lo: 78.5, hi: 87.1, label: "Labour % of revenue"},
    payRate: {lo: 11.56, hi: 13.39, label: "Average pay rate £/hr"},
    contrib: {lo: 2.1, hi: 5.6, label: "Client-view contribution %"},
    // Pure wage (hours × pay rate, before NI, holiday cover and other on-costs) as a % of the charge: Asda 63.5, Currys 68.3, Primark 73.9, Inditex 76.1
    wagePct: {lo: 63.5, hi: 76.1, label: "Wages % of revenue"},
    // Floor area per weekly labour hour (sq ft ÷ weekly hours, estate total): Inditex 161, Asda 345, Primark 353. Currys has no floor areas.
    sqftPerHr: {lo: 161, hi: 353, label: "Sq ft per weekly labour hour"},
    // Pure wage £ a week per 1,000 sq ft: Primark 32.7, Asda 38.8, Inditex 76.9
    wagePer1k: {lo: 32.7, hi: 76.9, label: "Wages £ a week per 1,000 sq ft"},
    materials: {lo: 0.22, hi: 0.31}, holiday: {lo: 6.2, hi: 9.6}, ssp: {lo: 0.9, hi: 1.3},
    pension: {lo: 2, hi: 3}, training: {lo: 0.3, hi: 1}, hoursPerHead: {lo: 11.8, hi: 25.8},
    pl: 0.55, overheads: {lo: 1.7, hi: 3.25}, profit: {lo: 1.7, hi: 5.78}
  },
  // Size curve fitted to the priced hours in the Inditex, Primark and Asda site lists: hours = a × sq ft^b × service intensity
  curve: {a:0.03762, b:0.7595, officeSqftPerHr:600},
  flat: {Small:12, Medium:16, Large:24, Office:20},
  // £ per labour hour: Currys 0.27, Inditex 0.31, Primark 0.39, Asda 1.49 incl. cobots
  machRate: {standard:0.33, fleet:1.10, client:0.10},
  cobot: {cost: 11500, lifeWks: 260, serviceWk: 18},   // Asda model (Lionsbot R5)
  onCostDefaults: {ssp:1.1, pension:2.5, training:0.6},
  headcount: {grocery:24, standard:13,
    // Hours per operative = a × site hours^b, clamped. Fitted on the per-site rows of the four completed models (equal weight per model).
    // Offered as an option only: leave-one-model-out it did not beat the flat figure (A pass MAE 4.65% vs 4.45%), so flat stays the default.
    curve:{a:6.676, b:0.212, min:8, max:30, fittedOn:["Currys", "Inditex", "Primark", "Asda"]},
    defaultBasis:{grocery:"flat", standard:"flat"}},
  management: {onCostPct: 50, hoursPerAreaManager: 3000},
  // Suggested answers: close to the mean of the four completed models (holiday 7.8%, materials £0.27/hr, overheads 2.4%)
  questionDefaults: {holiday: 8.0, materials: 0.26, overheads: 2.5},
  // Sign-off gate: a bid outside these needs a commercial approver before the workbook is released
  // Hosting: the Cowork host origins the app will talk to (postMessage), whether the standalone preview autosaves in this browser,
  // and how long a managed app batches autosaves (each connector call is metered, see MANAGED-APP.md).
  hosting: {allowedHostOrigins: ["https://m365.cloud.microsoft", "https://*.cloud.microsoft", "https://*.office.com", "https://*.sharepoint.com"], localAutosave: true, managedSaveMs: 15000},
  approval: {minProfitPct: 2.0, maxLabourPct: 88, minRevPerHr: 15.5, maxRevPerHr: 21.5, maxHoursChallengePct: 10, secondApproverAnnual: 10e6}
};
if (typeof module !== "undefined") module.exports = CMB_DATA;
