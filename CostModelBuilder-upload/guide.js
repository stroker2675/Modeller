/* Guide: plain-English help for every step, field, question and lever, plus the "do this next" nudge.
   Pure: it reads S and the engine and never writes a price. Loaded after engine.js and before app.js.
   Copy markup: [[key]] or [[key|label]] links a glossary term (GUIDE.items["term:" + key]). */
const GUIDE_VERSION = "1.0";
const gEsc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const gN = v => Math.round(v).toLocaleString("en-GB");
const gPl = (n, one, many) => `${gN(n)} ${n === 1 ? one : (many || one + "s")}`;
const gRange = (r, u = "") => `${r.lo}${u}–${r.hi}${u}`;

/* ---------- Steps ---------- */
const GUIDE_STEPS = {
  docs: {t:"Documents",
    what:"Every bid starts here. You give the tool the client's tender pack and it reads out the facts it needs.",
    put:"Drop in the specification, the site list and any pricing schedule. PDF, Word, Excel and CSV all work. No pack to hand? Pick a sample to practise.",
    why:"Everything after this step is built from what the documents say. Without a site list the tool has to guess the hours.",
    unsure:"Add everything you were sent. The tool ignores what it can't use and tells you which files it couldn't read."},
  spec: {t:"Extracted spec",
    what:"The survey sheet. It lists every fact the tool found, and a stamp on each one shows where it came from.",
    put:"Check each value against its source. Fill in anything stamped [[gap|GAP]]. What you type is stamped [[ans|ANS]].",
    why:"The term, payment days and pay floor change the price, and they decide which questions you are asked next.",
    unsure:"Hover the grey note under a value to see the sentence it came from. If the pack says nothing, leave the default."},
  questions: {t:"Questions",
    what:"A short interview about what the documents didn't answer. The questions that move the price most come first.",
    put:"Answer every [[critical|critical]] question yourself. For the rest you can accept the suggestion, and each one says why it was chosen.",
    why:"Hours, pay and profit move the price most, so they are asked first.",
    unsure:"Use the suggested value. It keeps its source stamp, so the approver can see it was a default and not your judgement."},
  sites: {t:"Sites & hours",
    what:"Every site and the cleaning hours it gets each week. Hours drive about 80% of the price.",
    put:"Confirm the hours method, then scan the Hours / wk column for any site that looks wrong. Type over a figure to change it.",
    why:"Ten per cent too many hours puts roughly ten per cent on the price.",
    unsure:"Use the client's hours where they gave them. Check odd-looking sites with your bid lead rather than guessing."},
  price: {t:"Price build",
    what:"The engine room. Each lever is one assumption in the price, and the trace updates as you move it.",
    put:"Check the levers and change anything your bid lead has agreed. Then launch a run to save it, and launch another to compare a scenario.",
    why:"Runs let you show the approver a compliant bid next to a cheaper alternative.",
    unsure:"Leave a lever on its stamped value and let the checks at the bottom tell you if anything is out of line."},
  board: {t:"Board summary",
    what:"The one-page view the board sees: revenue, each cost and the [[contribution|contribution]], by week and by year.",
    put:"Nothing to fill in. Read it, then switch to Internal view to see the margin you expect to make in practice.",
    why:"This is the page approvers compare with past bids.",
    unsure:"If a bar sits outside its dashed past-bid band, the Checks list says why."},
  insights: {t:"What it tells us",
    what:"The same price explained at five scales, from a single pound up to the whole contract.",
    put:"Nothing to fill in. Read each scale and the summary ticks as you go. Copy it into your bid email.",
    why:"You should be able to say why the price is that number before you send it.",
    unsure:"Start with 'What moves the price most'. It shows which assumption to check first."},
  generate: {t:"Generate model",
    what:"The last step. You sign off the price and the tool writes it into the standard cost model workbook.",
    put:"Clear any blocking checks, tick the sign-off box, add your name, then press Generate workbook.",
    why:"The workbook goes to commercial approval, so its totals are checked against the price shown here.",
    unsure:"Save the opportunity file first if you want a colleague to look before you sign."}
};
/* ---------- Questions (keys match buildQuestions ids) ---------- */
const sectorBand = s => /fashion|flagship|luxury/i.test(s) ? "Premium" : /health|beauty|pharm|chemist/i.test(s) ? "Enhanced" : /office|bank|headquart/i.test(s) ? "Light" : "Standard";
const GUIDE_Q = {
  hoursMethod: {t:"How hours are set",
    what:"How the tool works out the weekly cleaning hours for each site.",
    put:"If the client gave hours, use them: that is a compliant bid. If they only gave floor areas, use the size curve. Use flat hours only when you have neither.",
    why:"Hours drive about 80% of the price, so this is the biggest single choice you make.",
    unsure:"Pick the suggested option. You can switch method later on Sites & hours, and your own edits to a site are kept.",
    live:() => { const sp = S.spec; if (!sp || !sp.sites.length) return "";
      const ch = sp.sites.filter(s => s.clientHours != null).length, sq = sp.sites.filter(s => s.sqft).length;
      return `Your site list has ${gPl(sp.sites.length, "site")}: ${gN(ch)} with the client's hours and ${gN(sq)} with a floor area.`; }},
  intensity: {t:"Service intensity",
    what:"How demanding the cleaning is compared with an ordinary store. It scales the [[curve|size curve]] up or down.",
    put:"Standard (1.0) suits value retail and grocery. Enhanced suits health, beauty and pharmacy. Premium suits fashion flagships, and Light suits offices.",
    why:"Premium is 1.75 times Standard, so this can nearly double the hours.",
    unsure:"Read the frequency schedule in the spec. Daily deep cleans and high presentation standards point to Enhanced or Premium.",
    live:() => { const s = S.spec && S.spec.client.sector; return s ? `The sector is recorded as "${s}", which usually sits at ${sectorBand(s)}.` : "No sector is recorded yet, so Standard is the safe choice."; }},
  hoursChallenge: {t:"Hours challenge",
    what:"A cut to the client's hours, as a percentage. Bid teams use it to offer a cheaper alternative bid.",
    put:"Leave it at 0 for a compliant bid. Only enter a cut your bid lead has agreed.",
    why:"Every 1% off the hours takes roughly 1% off the price.",
    unsure:"Leave it at 0. Past alternative bids cut 12% (Currys) and 15% (Asda).",
    live:() => `It is set to ${num(val("hoursChallenge"))}%. Above ${APPROVAL.maxHoursChallengePct}% needs commercial director approval.`},
  payBasis: {t:"Pay floor",
    what:"The lowest hourly rate operatives are paid: the [[nlw|National Living Wage]] or the higher [[rlw|Real Living Wage]].",
    put:"Choose what the tender asks for. If it mentions the Living Wage Foundation, choose the Real Living Wage.",
    why:"Pay is the largest part of the price, and the floor applies to every hour worked.",
    unsure:"Search the spec for 'living wage'. If it isn't there, the National Living Wage is the legal minimum.",
    live:() => { const lw = S.spec && S.spec.livingWage;
      return `${lw ? `The documents name the ${lw === "RLW" ? "Real" : "National"} Living Wage.` : "The documents don't name a pay floor."} ${RATECARD.label}: National £${RATECARD.NLW}, Real £${RATECARD.RLW}, London £${RATECARD.LLW} an hour.`; }},
  payPremium: {t:"Pay above the floor",
    what:"Extra pence per hour on top of the pay floor.",
    put:"Enter 0 unless you pay more, for example to keep staff in a tight local job market or to blend in supervisor pay.",
    why:"It applies to every hour. 10p on 10,000 hours a week is £1,000 a week before [[oncosts|on-costs]].",
    unsure:"Leave it at 0. Past bids paid between 0 and 68p above the floor."},
  headBasis: {t:"How headcount is set",
    what:"How many people work at each site. Hours say how much work there is; headcount says how many people share it.",
    put:"Match the [[tupe|TUPE]] list if the client gave one. Otherwise scale with site hours.",
    why:"Each person has their own [[ni|NI]] threshold and needs a uniform and vetting. More people on the same hours means less NI but more uniforms.",
    unsure:"Use the suggestion.",
    live:() => { const n = S.spec && num(S.spec.commercial.tupeHeads); return n ? `The TUPE list gives ${gPl(n, "operative")}.` : "No TUPE headcount was found in the documents."; }},
  hoursPerHead: {t:"Hours per operative",
    what:"The average weekly contract for one operative, when one figure is used for every site.",
    put:"Enter the typical contract length, for example 16 hours for small stores or 24 for grocery.",
    why:"Shorter contracts mean more people, which changes [[ni|NI]], uniforms and vetting.",
    unsure:"Use the suggestion.",
    live:() => `Past bids ranged from ${gRange(BENCH.hoursPerHead, " hrs")}.`},
  headRounding: {t:"Rounding headcount",
    what:"Whether each site's headcount is rounded to the nearest person or always up.",
    put:"Nearest matches the completed cost models. Choose up only if your operations team staffs that way.",
    why:"Rounding up adds a person at many sites, and each one needs a uniform and vetting.",
    unsure:"Choose nearest."},
  holiday: {t:"Holiday cover",
    what:"The cost of covering shifts while operatives are on paid holiday, as a percentage of wages and [[ni|NI]].",
    put:"Keep the suggestion unless your finance team uses a different rate.",
    why:"It is added to every pound of wages.",
    unsure:"Keep the suggestion. Sick pay, pension and training are set from past bids, and you can change them on Price build.",
    live:() => `Past bids ranged from ${gRange(BENCH.holiday, "%")}.`},
  factoring: {t:"Funding long payment terms",
    what:"When the client pays slowly, you pay wages weeks before their money arrives. This covers the cost of funding that gap.",
    put:"Pick [[factoring|invoice factoring]] at 1.3% for terms of 60 days or more, or a 0.6% allowance for terms around 45 days.",
    why:"Leave it out and the gap comes out of your profit.",
    unsure:"Ask finance how they fund this client. If in doubt, use the suggestion.",
    live:() => S.spec ? `The client pays in ${S.spec.commercial.paymentDays} days.` : ""},
  credits: {t:"Delivery-risk allowance",
    what:"The client takes money back for hours that weren't delivered. This allowance covers that risk.",
    put:"Enter a percentage of labour cost. 1% is a sensible start.",
    why:"Without it, every missed shift comes straight off the margin. See [[credits|service credits]].",
    unsure:"Use 1%, or ask operations how often shifts go uncovered at similar clients."},
  materials: {t:"Materials and consumables",
    what:"Cleaning chemicals, bags and cloths. If the client wants it, washroom supplies such as soap and paper towels too.",
    put:"A figure in pounds for every labour hour. Go to the top of the range if the spec includes washroom supplies.",
    why:"It is a small part of the price, but it applies to every hour.",
    unsure:"Keep the suggestion.",
    live:() => `Past bids ranged from £${BENCH.materials.lo} to £${BENCH.materials.hi} per hour.`},
  machinery: {t:"Machinery",
    what:"Who provides the cleaning machines, and how heavy the kit is.",
    put:"Standard kit suits most retail. The scrubber-dryer fleet suits grocery and large floors. Choose client-supplied if the spec says they provide it.",
    why:"It is charged on every labour hour, and the fleet costs several times as much as standard kit.",
    unsure:"Search the spec for 'equipment' or 'machinery'. If it says nothing, keep the suggestion."},
  cobots: {t:"Cleaning robots",
    what:"Autonomous floor cleaners, called [[cobot|cobots]], placed at the largest stores.",
    put:"Say yes only if the spec invites autonomous cleaning and your operations team can support it.",
    why:"Each robot costs money up front but is assumed to save 12% of the hours at a large store.",
    unsure:"Choose no, and offer robots as an option in the bid instead."},
  mgmtRatio: {t:"Area manager coverage",
    what:"How many weekly cleaning hours one area manager looks after.",
    put:"A lower number means more managers. Use around 1,400 for many small stores and up to 4,600 for big stores.",
    why:"It sets how many managers are priced, and each one is a full salary.",
    unsure:"Keep the suggestion. You can edit the whole management structure on Price build.",
    live:() => { const R = S.spec && S.spec.sites.length ? compute() : null; if (!R) return "";
      return `At ${gN(num(val("mgmtRatio")))} hours each, ${gN(R.T.hours)} hours a week needs about ${(R.T.hours / Math.max(1, num(val("mgmtRatio")))).toFixed(1)} area managers.`; }},
  unsocial: {t:"Out-of-hours premium",
    what:"Extra pay for early or late shifts outside trading hours.",
    put:"Enter the premium your contracts pay for those shifts, or 0 if they pay none.",
    why:"It raises pay on the out-of-hours share of the hours only.",
    unsure:"Ask HR what your standard contracts pay. Many retail contracts pay no premium."},
  rebate: {t:"Upfront rebate",
    what:"A lump sum paid to the client at the start. The client has invited bidders to offer one. See [[rebate|rebate]].",
    put:"Choose no rebate unless your commercial director has agreed one.",
    why:"The rebate is won back through the weekly charge over the initial term, so it raises the price.",
    unsure:"Choose no rebate and tell your bid lead the client asked."},
  overheads: {t:"Overheads",
    what:"A share of head-office costs such as finance, HR, IT and offices.",
    put:"Keep the suggestion unless finance gives you a figure for this bid.",
    why:"It is a percentage of the price, so each extra 1% adds about 1%.",
    unsure:"Keep the suggestion.",
    live:() => `Past bids ranged from ${gRange(BENCH.overheads, "%")}.`},
  profit: {t:"Target profit",
    what:"The profit the bid is built to make, as a percentage of the price.",
    put:"Enter the figure your commercial lead has agreed. Don't guess it.",
    why:"It is the last line of the price and the first thing an approver asks about.",
    unsure:"Ask your commercial lead. The suggested 3% is only a placeholder.",
    live:() => `Past bids ranged from ${gRange(BENCH.profit, "%")}.`}
};
/* ---------- Survey sheet fields (keys match SPEC_FIELDS paths) ---------- */
const GUIDE_F = {
  "client.name": {t:"Client",
    what:"The client's trading name, as it should appear on the model.",
    put:"Type it the way the client writes it.",
    why:"It names the workbook and appears on every page of it.",
    unsure:"Use the suggestion under the box if there is one, and confirm it.",
    live:() => S.spec && S.spec.client.hint && !S.spec.client.name ? `The documents suggest "${S.spec.client.hint}".` : ""},
  "client.sector": {t:"Sector",
    what:"The kind of business, for example grocery, fashion or offices.",
    put:"A few words is enough, such as 'Grocery retail' or 'Health and beauty'.",
    why:"A grocery sector sets bigger machinery and longer shifts as the suggestions.",
    unsure:"Describe what the client mostly sells."},
  "term.years": {t:"Initial term",
    what:"How many years the contract runs before any extension.",
    put:"The number of years in the tender, usually 3 to 5.",
    why:"It sets the contract value and how long a rebate or robots have to pay back.",
    unsure:"Search the spec for 'term' or 'duration'."},
  "term.ext": {t:"Extension",
    what:"Optional extra years the client can add at the end.",
    put:"The number of extension years, or 0.",
    why:"It is shown separately and doesn't change the weekly price.",
    unsure:"A phrase like '3+2 years' means 3 years plus a 2-year extension."},
  "term.start": {t:"Start date",
    what:"The day the contract starts.",
    put:"The start date in the tender timetable, or your best estimate.",
    why:"It picks which year's wage rates and [[ni|NI]] rates apply.",
    unsure:"Use the date in the timetable. The note under the box shows which rate card it picked.",
    live:() => `${RATECARD.label}: ${RATECARD.why}.`},
  "commercial.paymentDays": {t:"Payment terms",
    what:"How many days the client takes to pay each invoice.",
    put:"The number of days, for example 30 or 60.",
    why:"Anything over 30 days adds a question about funding the gap.",
    unsure:"Search for 'payment terms' or 'days from invoice'.",
    live:() => S.spec && S.spec.commercial.paymentDays > 30 ? `At ${S.spec.commercial.paymentDays} days you will be asked how to fund the gap.` : ""},
  "commercial.credits": {t:"Undelivered hours credited",
    what:"Whether the client takes money back for hours that weren't worked.",
    put:"Choose Yes if the spec says missed or undelivered hours are credited or deducted.",
    why:"Yes adds a question about a delivery-risk allowance. See [[credits|service credits]].",
    unsure:"Search for 'credit', 'deduction' or 'service credit'."},
  "service.minHours": {t:"Minimum hours per site",
    what:"The fewest weekly hours the client will accept at any one site.",
    put:"The figure in the spec, or leave it blank.",
    why:"Small sites below the minimum are lifted up to it.",
    unsure:"Leave it blank if the spec doesn't set one."},
  "service.auditPass": {t:"Audit pass mark",
    what:"The score the client expects in its cleaning audits.",
    put:"The percentage in the spec.",
    why:"It doesn't change the price, but the approver will want to know it.",
    unsure:"Leave it blank."},
  "service.tradingShare": {t:"Hours in trading time",
    what:"How much of the cleaning must happen while the store is open.",
    put:"A range such as 20–40.",
    why:"It adds a question about paying a premium for the out-of-hours shifts.",
    unsure:"Leave it blank if the spec doesn't say."},
  livingWage: {t:"Pay floor stated",
    what:"Whether the tender names a pay floor, such as the [[rlw|Real Living Wage]].",
    put:"Choose what the documents say. 'Not stated' is fine.",
    why:"It sets the suggested answer to the pay floor question.",
    unsure:"Search the documents for 'living wage'."},
  "equipment.clientSupplied": {t:"Machinery supplied by",
    what:"Whether you or the client provide the cleaning machines.",
    put:"Choose Supplier if you provide them, or Client if they do.",
    why:"It sets the suggested machinery rate.",
    unsure:"Leave it as 'Not stated'. The machinery question will ask you."},
  "equipment.cobots": {t:"Autonomous kit invited",
    what:"Whether the client invites robot floor cleaners.",
    put:"Choose Yes only if the spec asks for or welcomes them.",
    why:"Yes adds a question about [[cobot|cobots]].",
    unsure:"Choose No."},
  "commercial.rebate": {t:"Upfront rebate invited",
    what:"A lump sum the client invites bidders to offer at the start.",
    put:"The amount in pounds, or leave it blank.",
    why:"An amount here adds a [[rebate|rebate]] question.",
    unsure:"Leave it blank."},
  "commercial.indexation": {t:"Indexation",
    what:"How the price rises each year. This is called [[indexation|indexation]].",
    put:"A short note, for example 'annual review in line with the Real Living Wage'.",
    why:"It doesn't change the first-year price, but it matters over the whole contract.",
    unsure:"Search for 'indexation', 'price review' or 'uplift'."},
  "commercial.tupeHeads": {t:"TUPE headcount",
    what:"The number of operatives who will move across to you under [[tupe|TUPE]].",
    put:"The total number of people on the transfer list.",
    why:"It becomes the suggested headcount, which drives [[ni|NI]], uniforms and vetting.",
    unsure:"Leave it blank if there is no transfer list."},
  incumbentHours: {t:"Previous tender hours",
    what:"The weekly hours the current supplier was paid for, if the client shared them.",
    put:"The total weekly hours, or leave it blank.",
    why:"It is a check on your hours. It doesn't set them.",
    unsure:"Leave it blank."},
  sites: {t:"Sites",
    what:"How many sites were found in the site list.",
    put:"Nothing to enter here. Add or fix sites on Sites & hours.",
    why:"Every site gets its own hours and headcount.",
    unsure:"If the number looks wrong, check the site list for total rows or blank rows."},
  formats: {t:"Formats",
    what:"The size bands the sites fall into: Small, Medium, Large and Office.",
    put:"Nothing to enter here. Formats come from the site list.",
    why:"The band sets the flat hours and some other defaults.",
    unsure:"Check the import note on Sites & hours."},
  clientHours: {t:"Client hours",
    what:"How many sites came with the client's own weekly hours.",
    put:"Nothing to enter here.",
    why:"The client's hours make the bid compliant, and they are the firmest evidence you have.",
    unsure:"If none were given, the size curve estimates them from floor area."}
};
/* ---------- Price build levers (keys match LEVERS id / oc / ov). Levers that repeat a question borrow its text. ---------- */
const GUIDE_L = {
  payPremium:{alias:"q:payPremium"}, hoursChallenge:{alias:"q:hoursChallenge"}, hoursPerHead:{alias:"q:hoursPerHead"}, holiday:{alias:"q:holiday"},
  materials:{alias:"q:materials"}, mgmtRatio:{alias:"q:mgmtRatio"}, factoring:{alias:"q:factoring"}, overheads:{alias:"q:overheads"}, profit:{alias:"q:profit"},
  ssp: {t:"Sick pay",
    what:"The cost of [[ssp|statutory sick pay]], as a percentage of wages.",
    put:"Keep the benchmark unless finance gives you a rate for this client.",
    why:"It is small, but it is added to all wages.",
    unsure:"Keep it.", live:() => `Past bids ranged from ${gRange(BENCH.ssp, "%")}.`},
  pension: {t:"Pension",
    what:"Your workplace pension contribution for operatives, as a percentage of wages.",
    put:"Keep the benchmark unless finance gives you a different rate.",
    why:"It is added to all wages.",
    unsure:"Keep it.", live:() => `Past bids ranged from ${gRange(BENCH.pension, "%")}.`},
  training: {t:"Training",
    what:"The cost of induction and ongoing training, as a percentage of wages.",
    put:"Raise it if the spec asks for accredited training or a high staff turnover is expected.",
    why:"It is added to all wages.",
    unsure:"Keep it.", live:() => `Past bids ranged from ${gRange(BENCH.training, "%")}.`},
  machRate: {t:"Machinery rate",
    what:"The machinery cost charged on every labour hour.",
    put:"It follows your machinery answer. Type an exact rate only if operations gave you one.",
    why:"It is charged on every hour, so small changes add up across the estate.",
    unsure:"Leave it as set."},
  pl: {t:"Public liability",
    what:"Insurance against injury and damage claims, as a percentage of the price. It is often shortened to [[pl|PL]].",
    put:"Keep the default unless the insurance team quotes a rate for this client.",
    why:"It is a percentage of the price, like overheads and profit.",
    unsure:"Keep the default."}
};
/* ---------- Parts of the screen (data-guide="el:…") ---------- */
const GUIDE_E = {
  rail: {t:"The eight steps",
    what:"The steps of a bid, in order. A tick means the step is done, and a red number shows open critical questions.",
    put:"Work down the list. You can go back to any step, and nothing you've entered is lost.",
    why:"Later steps use what you entered earlier, so going in order saves rework.",
    unsure:"Follow the 'Next' line at the top of this guide."},
  trace: {t:"Price trace",
    what:"The live price. It shows the weekly charge, hours, headcount and where each pound goes, and it updates as you work.",
    put:"Nothing to enter. Keep an eye on it as you change things.",
    why:"You can see straight away how much each change moves the price.",
    unsure:"If the charge jumps a lot, the last thing you changed is the reason."},
  drop: {t:"Drop zone",
    what:"Where you add the tender documents.",
    put:"Drag files here, or click to browse. You can also drop a saved opportunity file (.json) to carry on where you left off.",
    why:"The tool reads the facts from these files.",
    unsure:"This preview reads Word specs and Excel or CSV site lists. PDFs are read by the Cowork agent."},
  packs: {t:"Sample packs",
    what:"Practice tenders based on real bids, with made-up site lists.",
    put:"Pick one to see how the whole process works before you use a real pack.",
    why:"It is the quickest way to learn the tool without risking a real bid.",
    unsure:"Start with the Currys-style pack. It uses the client's own hours."},
  extract: {t:"Extract specification",
    what:"Reads the documents and fills in the survey sheet.",
    put:"Press it once all the files are added.",
    why:"Nothing else can start until the documents have been read.",
    unsure:"You can run it again after adding more files. Your answers will be cleared."},
  resume: {t:"Saved work",
    what:"Your last opportunity, saved automatically in this browser.",
    put:"Press Resume to carry on, or Discard to delete the saved copy.",
    why:"You don't lose work if the page closes.",
    unsure:"Resume it. Start over later if you need to."},
  notes: {t:"Reading notes",
    what:"Notes from reading the documents, such as files that couldn't be read.",
    put:"Read each note and enter what it says is missing.",
    why:"A file that wasn't read may hold facts the price needs.",
    unsure:"Enter the key terms from that file by hand."},
  excerpts: {t:"Source excerpts",
    what:"The exact sentences each fact came from.",
    put:"Nothing to enter. Use them to check the facts above.",
    why:"The approver will ask where each number came from.",
    unsure:"If an excerpt doesn't support the value, correct the value."},
  qlist: {t:"All questions",
    what:"Every question, in order. A red dot means it is critical and still open. A filled dot means it is answered.",
    put:"Click any question to jump to it.",
    why:"You can see at a glance what is left.",
    unsure:"Answer the red dots first."},
  acceptAll: {t:"Accept suggestions",
    what:"Records the suggested answer for every non-critical question in one go.",
    put:"Use it once you've answered the critical ones and are happy with the rest.",
    why:"It saves time. Each value keeps its source stamp, so nothing is hidden from the approver.",
    unsure:"It's safe. You can change any answer later."},
  qfeedback: {t:"Was this clear?",
    what:"Tells the team building this tool whether a question made sense.",
    put:"Choose Yes or No. If No, say what was unclear.",
    why:"Your feedback improves the questions for the next seller.",
    unsure:"Skip it if you're short of time."},
  method: {alias:"q:hoursMethod"},
  intensity: {alias:"q:intensity"},
  officeRate: {t:"Office cleaning rate",
    what:"How many square feet of office one cleaner covers in an hour.",
    put:"Keep the benchmark unless the spec describes the offices in detail.",
    why:"A higher number means fewer hours for the offices.",
    unsure:"Keep it."},
  flat: {t:"Flat hours by format",
    what:"A fixed number of weekly hours for each store size, used when there is no floor area or client hours.",
    put:"Enter what a typical store of each size gets.",
    why:"It is the least accurate way to set hours, so the checks will warn you.",
    unsure:"Ask operations for typical hours at a similar client."},
  siteTable: {t:"Site table",
    what:"One row per site, with its hours, headcount and weekly charge.",
    put:"Type over the Hours / wk figure to change a site. Your figure is stamped [[ans|ANS]].",
    why:"The hours in this column are what the client pays for.",
    unsure:"Sort out the big sites first. They carry most of the price."},
  filter: {t:"Filter",
    what:"Shows only the sites that match what you type.",
    put:"A town, region, format or site ID.",
    why:"It makes a long site list easier to check.",
    unsure:"Clear it to see every site again."},
  sitesMap: {t:"Estate map",
    what:"Opens a map of every site, sized by charge and coloured by format. See the [[estatemap|estate map]].",
    put:"Nothing, unless a site is listed under Sites to check. Then type its postcode or town.",
    why:"A misplaced site usually means a wrong region, and region drives pay and travel.",
    unsure:"Leave it. A site placed only by region is still priced correctly."},
  siteUpload: {t:"Upload site list",
    what:"Loads the client's site schedule from a spreadsheet.",
    put:"An Excel, CSV or TSV file with a row per site.",
    why:"It replaces the current site list.",
    unsure:"Columns are matched by their headings, so the order doesn't matter."},
  sitePaste: {t:"Paste sites",
    what:"Another way to add sites: paste the rows straight from Excel.",
    put:"Copy the rows, headings included, and paste them in.",
    why:"It is handy when the site list is inside a PDF or an email.",
    unsure:"Each row needs a site name and either a floor area or weekly hours."},
  levers: {t:"Levers",
    what:"Every assumption in the price, in one place. The stamp shows where each value came from.",
    put:"Type a figure or drag the slider. The trace updates straight away.",
    why:"This is where you test 'what if' before you launch a run.",
    unsure:"Leave a lever alone if you don't know why you'd change it."},
  buildup: {t:"Weekly build-up",
    what:"The price line by line, from wages down to the weekly charge.",
    put:"Nothing to enter. Read it top to bottom.",
    why:"It shows how the cost becomes the price once [[pl|PL]], [[overheads|overheads]] and profit are added.",
    unsure:"The percentage beside each line is its share of the charge."},
  mgmt: {t:"Management structure",
    what:"The area managers and other roles priced into the contract.",
    put:"Edit any role, number of [[fte|FTEs]] or salary. Once you do, the table is yours and stops following the suggestion.",
    why:"Management is a fixed cost, so it matters most on small contracts.",
    unsure:"Keep the suggestion, which scales with the hours and the number of sites."},
  launch: {t:"Launch run",
    what:"Saves the current price as a named [[run|run]].",
    put:"Give it a clear name, such as 'Compliant' or 'Alt −12% hours', and press Launch run.",
    why:"You need at least one run before you can move on. More runs let you compare options.",
    unsure:"Launch one now as your base case."},
  runs: {t:"Runs",
    what:"Every run you've launched. Each one after the first shows how it compares with the first.",
    put:"Press Restore to go back to the levers of any run.",
    why:"Approvers like to see the compliant bid next to the alternative.",
    unsure:"The first run is always the base case."},
  checks: {t:"Checks",
    what:"Automatic checks on the price. BLOCK must be fixed. WARN needs a reason. INFO is for your notes.",
    put:"Press Review on each one to go to where it can be fixed.",
    why:"Blocking checks stop the workbook being generated.",
    unsure:"Fix the BLOCKs first, then read the WARNs."},
  viewToggle: {t:"Client or internal view",
    what:"Client view shows the costs as priced. Internal view shows what you expect to actually spend.",
    put:"Switch to Internal view at least once before you sign off.",
    why:"Past bids made more money in practice than on paper. Internal view shows by how much.",
    unsure:"Show the client view to the client, and the internal view to your approver."},
  boardTable: {t:"Board table",
    what:"Revenue, each cost and the [[contribution|contribution]] left over, by week and by year.",
    put:"Nothing to enter.",
    why:"It is laid out like the template's Board Summary tab.",
    unsure:"The bottom line, contribution, is what the business keeps."},
  boardBars: {t:"Against past bids",
    what:"Four key ratios compared with the range of past bids, shown as the dashed band.",
    put:"Nothing to enter. Look for any bar outside its band.",
    why:"A figure outside the band is the first thing an approver will ask about. See [[revhr|revenue per hour]].",
    unsure:"Outside the band isn't wrong, but you need a reason."},
  internal: {t:"Internal view assumptions",
    what:"How far below the priced figures you expect wages and uniform spend to come in.",
    put:"Keep the defaults unless finance gives you actuals for a similar contract.",
    why:"Past models buried these figures in the workbook. Here they are visible and logged.",
    unsure:"Keep the defaults."},
  "ins-pound": {t:"Every £1",
    what:"Where each pound the client pays ends up, in pence.",
    put:"Nothing to enter. Hover a row to light up its squares.",
    why:"It is the simplest way to explain the price to anyone. Solid squares are the cleaners' pay; hatched squares are the [[oncosts|on-costs]] on top.",
    unsure:"Labour is usually around 80p, of which pay is around 64–76p."},
  "ins-wage": {t:"Cleaners' pay",
    what:"The pure wage: hours worked × the hourly pay rate. Nothing added.",
    put:"Nothing to enter. It follows the pay rate and hours you set.",
    why:"It is the part of the price that goes straight to the people doing the cleaning, and the number clients and unions ask about. See [[wagepct|pay as a share of the price]].",
    unsure:"Check the pay rate on the Commercials step first.",
    live:() => BENCH.wagePct ? `Past bids put pay at ${BENCH.wagePct.lo}–${BENCH.wagePct.hi}% of the price.` : ""},
  "ins-oncost": {t:"Employment on-costs",
    what:"What employing the cleaners costs on top of their pay: [[ni|NI]], holiday cover, [[ssp|sick pay]], [[pension|pension]], training and the [[levy|apprenticeship levy]], plus any delivery-risk allowance.",
    put:"Nothing to enter. The rates are on the Commercials step.",
    why:"It is why labour is well above the wage bill. Rises in [[ni|NI]] or pension land here.",
    unsure:"Keep the default rates unless finance gives you actuals."},
  "ins-paykpi": {t:"Pay against the hour",
    what:"Three ways to relate pay to the price. Pay's share of each billed hour. What the client is billed for every £1 of pay. How much the on-costs add to pay.",
    put:"Nothing to enter.",
    why:"'Every £1 of pay is billed at £1.40' is the quickest way to explain the markup to a client.",
    unsure:"If pay's share is below past bids, check the margins and overheads; if above, check the pay rate."},
  "ins-map": {t:"Estate map",
    what:"The whole estate on a UK map. Sites are sized by charge and coloured by format, with heat and area shading.",
    put:"Nothing to enter. Fix any site the map could not place.",
    why:"It shows where the money and the operatives sit, which shapes management and travel.",
    unsure:"Shade areas by pay share to find regions priced outside past bids.",
    live:() => { const M = typeof mapModel === "function" ? mapModel() : null; return M && M.ready && M.geo ? `${M.geo.pin} of ${M.totals.n} sites are placed from a postcode, town or council.` : ""; }},
  "ins-prod": {t:"Pay and productivity",
    what:"How this bid compares with past bids on pay share and [[productivity|productivity]]. The tinted band is the past-bid range; the pin is this bid.",
    put:"Nothing to enter. Add floor areas on the Sites step to measure productivity.",
    why:"Low sq ft per hour means the hours are generous for the floor; high means the team is stretched.",
    unsure:"Formats outside the band are shown in red. Check their hours first.",
    live:() => BENCH.sqftPerHr ? `Past bids cleaned ${BENCH.sqftPerHr.lo}–${BENCH.sqftPerHr.hi} sq ft per labour hour.` : ""},
  "ins-payterm": {t:"Cleaners' pay over the term",
    what:"The total pure wage bill across the contract's firm years.",
    put:"Nothing to enter.",
    why:"It is the figure behind any living-wage or pay-rise conversation with the client.",
    unsure:"Compare it with the profit over the term beside it."},
  "ins-hour": {t:"One hour",
    what:"What the client pays for one hour of cleaning, compared with what the operative is paid.",
    put:"Nothing to enter.",
    why:"The gap between the two is what pays for [[oncosts|on-costs]], kit, managers and profit.",
    unsure:"Check that the billed rate sits inside the past-bid band."},
  "ins-site": {t:"One site",
    what:"One site's week in detail. Every dot on the chart is a site.",
    put:"Choose Typical, Largest or Smallest, pick a site from the list, or click a dot.",
    why:"Dots far from the others are the sites to check first.",
    unsure:"Start with the largest site."},
  "ins-estate": {t:"The estate",
    what:"How the price is spread across all the sites, and how firm the hours are.",
    put:"Nothing to enter.",
    why:"If a few sites carry most of the price, survey those first. [[est|Estimated]] hours are the weakest evidence.",
    unsure:"Look at 'What the hours rest on'."},
  "ins-contract": {t:"The contract",
    what:"The whole contract: its value, profit, cash tied up and what moves the price most.",
    put:"Nothing to enter. Press Adjust beside a lever to change it.",
    why:"This is what the approver signs up to, not just the weekly price.",
    unsure:"Read 'What moves the price most' first."},
  insSummary: {t:"Summary",
    what:"One sentence for each scale, ticked once you've read it.",
    put:"Press Copy the summary and paste it into your bid email or approval note.",
    why:"It gives the approver the story behind the number.",
    unsure:"Scroll through each scale first so every line is ticked."},
  route: {t:"Approval route",
    what:"Who has to approve this price, and why. See [[approval|approval policy]].",
    put:"Nothing to enter. It follows the approval policy.",
    why:"Anything outside policy goes to the commercial director.",
    unsure:"If you didn't expect a director, read the reason next to their name."},
  signoff: {t:"Your sign-off",
    what:"Your confirmation that you've checked this first pass.",
    put:"Tick the box, check your name and press Sign off this price.",
    why:"The workbook can't be generated until someone owns the price. If the price changes, you sign off again.",
    unsure:"Read the warnings on Price build first."},
  flow: {t:"Build the workbook",
    what:"What happens when you press Generate: the tool copies the template, fills it in and checks its totals.",
    put:"Press Generate workbook once you've signed off.",
    why:"The workbook's totals must match this price to within 0.5%.",
    unsure:"In this preview the steps are simulated. In Cowork they run for real."},
  downloads: {t:"Downloads",
    what:"Copies of the model to keep or share: the payload, the opportunity file, site pricing and the assumptions log.",
    put:"Save the opportunity file to share your work or carry on later.",
    why:"The assumptions log lists every value and where it came from.",
    unsure:"Save the opportunity file. It holds everything."},
  guide: {t:"This guide",
    what:"Plain-English help for whatever you're looking at.",
    put:"Click or tab into any part of the screen and the guide explains it. Press ? to open or close it.",
    why:"You shouldn't need to ask a colleague what a box means.",
    unsure:"Press Show me to see where something is on the screen."}
};
/* ---------- Glossary (term:…) ---------- */
const GUIDE_T = {
  estatemap: {t:"Estate map",
    what:"A built-in UK map of the priced sites. It works offline. A street map appears when your organisation allows it.",
    why:"Sites are placed from their postcode, then town, then council, then region. Dashed rings are sites known only by region."},
  ni: {t:"NI (employer's National Insurance)",
    what:"A tax you pay on each operative's wages above a weekly threshold.",
    why:"Each person has their own threshold, so the same hours spread across more people costs less NI.",
    live:() => `${RATECARD.label}: ${+(RATECARD.niRate * 100).toFixed(1)}% above £${RATECARD.niThresholdWk} a week.`},
  ssp: {t:"SSP (statutory sick pay)", what:"The legal minimum sick pay. The model allows a percentage of wages for it.", why:"It is small, but it applies to all wages."},
  pension: {t:"Pension", what:"Your workplace pension contribution for each operative.", why:"It is a percentage of wages."},
  tupe: {t:"TUPE",
    what:"The law that moves the current cleaners across to you, on their existing pay and terms, when you win the contract.",
    why:"You inherit their pay rates and contracted hours, so the transfer list is the best evidence for headcount."},
  nlw: {t:"NLW (National Living Wage)", what:"The legal minimum hourly pay for workers aged 21 and over.", why:"No site can be priced below it.",
    live:() => `£${RATECARD.NLW} an hour on the ${RATECARD.label}.`},
  rlw: {t:"RLW (Real Living Wage)", what:"A higher voluntary rate set each year by the Living Wage Foundation. Many clients ask for it.", why:"It costs more on every hour than the legal minimum.",
    live:() => `£${RATECARD.RLW} an hour outside London on the ${RATECARD.label}.`},
  llw: {t:"LLW (London Living Wage)", what:"The Real Living Wage rate for London, which is higher because London costs more to live in.", why:"It applies to London sites when the client asks for the Real Living Wage.",
    live:() => `£${RATECARD.LLW} an hour on the ${RATECARD.label}.`},
  factoring: {t:"Factoring", what:"Selling your invoices to a finance company so you're paid sooner, for a fee.", why:"It is one way to fund long payment terms."},
  pl: {t:"PL (public liability)", what:"Insurance against injury or damage claims from the public.", why:"It is priced as a percentage of the charge."},
  overheads: {t:"Overheads", what:"Head-office costs shared across all contracts, such as finance, HR and IT.", why:"Every contract has to pay its share."},
  contribution: {t:"Contribution", what:"What is left from the charge after every cost. It is close to profit.", why:"It is the figure the board looks at first."},
  curve: {t:"Size curve", what:"A formula from past bids that estimates weekly hours from a store's floor area.", why:"It is only an estimate. Past bids missed by up to 44% on floor area alone."},
  intensity: {t:"Service intensity", what:"A multiplier on the size curve for how demanding the cleaning is.", why:"1.0 is an ordinary store. 1.75 is a fashion flagship."},
  headcount: {t:"Headcount", what:"The number of people employed, not the number of hours.", why:"Each person needs a uniform and vetting, and has their own [[ni|NI]] threshold."},
  fte: {t:"FTE (full-time equivalent)", what:"One full-time job. Two half-time people are one FTE.", why:"Management roles are priced in FTEs."},
  capex: {t:"Capex", what:"Money spent up front on equipment, such as cleaning robots.", why:"It is recovered through the weekly charge over the term."},
  cobot: {t:"Cobot", what:"An autonomous floor-cleaning robot that works alongside the cleaning team.", why:"Each one costs money up front and saves hours at big stores."},
  rebate: {t:"Rebate", what:"A lump sum paid to the client at the start of the contract.", why:"You win it back through a higher weekly charge."},
  credits: {t:"Service credits", what:"Money the client deducts for hours or standards you didn't deliver.", why:"They come straight off your margin."},
  indexation: {t:"Indexation", what:"The agreed way the price rises each year, usually linked to wage rises.", why:"Without it, next year's wage rise comes out of your profit."},
  oncosts: {t:"On-costs", what:"The costs on top of wages: holiday, [[ssp|sick pay]], [[pension|pension]], training, the [[levy|apprenticeship levy]] and [[ni|NI]].", why:"They are added to every pound of wages, so small changes add up across the estate."},
  levy: {t:"Apprenticeship levy", what:"A 0.5% tax on the pay bill of large employers.", why:"It is one of the on-costs."},
  wagepct: {t:"Pay as a share of the price", what:"The cleaners' pure wages divided by the charge. It leaves out [[ni|NI]], holiday, pension and the other on-costs.", why:"It shows how much of the price reaches the cleaners. Too low looks greedy; too high leaves nothing for the rest.",
    live:() => BENCH.wagePct ? `Past bids: ${BENCH.wagePct.lo}–${BENCH.wagePct.hi}%.` : ""},
  productivity: {t:"Productivity", what:"Floor area cleaned for each weekly labour hour (sq ft per hour), and what that floor costs in pay (£ per 1,000 sq ft a week).", why:"It tests whether the hours fit the building, whoever set them.",
    live:() => BENCH.sqftPerHr && BENCH.wagePer1k ? `Past bids: ${BENCH.sqftPerHr.lo}–${BENCH.sqftPerHr.hi} sq ft per hour; £${BENCH.wagePer1k.lo}–£${BENCH.wagePer1k.hi} pay per 1,000 sq ft.` : ""},
  revhr: {t:"Revenue per labour hour", what:"The weekly charge divided by the weekly hours. It is what the client pays for each hour of cleaning.", why:"It is the quickest way to compare bids of different sizes.",
    live:() => `The approval policy expects £${APPROVAL.minRevPerHr.toFixed(2)}–£${APPROVAL.maxRevPerHr.toFixed(2)}.`},
  labourpct: {t:"Labour % of revenue", what:"The share of the charge spent on labour.", why:"If it is too high, there is too little left for everything else.",
    live:() => `The approval policy limit is ${APPROVAL.maxLabourPct}%.`},
  approval: {t:"Approval policy", what:"The limits set by commercial finance. A price outside them needs a more senior approver.", why:"It keeps risky bids in front of the right people.",
    live:() => `Profit floor ${APPROVAL.minProfitPct}%, labour limit ${APPROVAL.maxLabourPct}%, hours cut limit ${APPROVAL.maxHoursChallengePct}%.`},
  run: {t:"Run", what:"A saved snapshot of the price and every lever, so you can compare options.", why:"The approver sees each run side by side."},
  critical: {t:"Critical question", what:"A question the documents couldn't answer that moves the price a lot.", why:"You must answer it yourself before the model can be generated."},
  doc: {t:"DOC stamp", what:"The value came from the client's documents.", why:"It is the firmest evidence."},
  ans: {t:"ANS stamp", what:"You entered or confirmed this value.", why:"It is your judgement, and it is logged with your name."},
  bm: {t:"BM stamp", what:"A benchmark from past bids.", why:"It is reasonable, but it isn't specific to this client."},
  def: {t:"DEF stamp", what:"A default setting, used when nothing better is known.", why:"It is the weakest evidence, so check it."},
  est: {t:"EST stamp", what:"An estimate, for example a site's hours filled in from similar sites.", why:"Check estimated values before you sign off."},
  gap: {t:"GAP stamp", what:"The documents didn't give this value.", why:"Fill it in, or accept the default knowingly."}
};
/* ---------- One lookup for everything ---------- */
const GUIDE = {items:{}};
[["step", GUIDE_STEPS], ["q", GUIDE_Q], ["field", GUIDE_F], ["lever", GUIDE_L], ["el", GUIDE_E], ["term", GUIDE_T]]
  .forEach(([p, o]) => Object.entries(o).forEach(([k, v]) => { GUIDE.items[p + ":" + k] = v; }));
GUIDE_E.genBtn = {alias:"el:flow"}; GUIDE.items["el:genBtn"] = GUIDE_E.genBtn;

// Plain words the seller may not know. The first use on a screen becomes a glossary link.
const GUIDE_JARGON = [[/\bNI\b/, "ni"], [/\bSSP\b/, "ssp"], [/\bTUPE\b/, "tupe"], [/\bNLW\b/, "nlw"], [/\bRLW\b/, "rlw"], [/\bLLW\b/, "llw"],
  [/\bPL\b/, "pl"], [/\bFTEs?\b/, "fte"], [/\b[Cc]apex\b/, "capex"], [/\b[Cc]obots?\b/, "cobot"]];

function guideEntry(key){
  let k = key, it = GUIDE.items[k], hops = 0;
  while (it && it.alias && hops++ < 4){ k = it.alias; it = GUIDE.items[k]; }
  if (!it) return null;
  let live = "";
  if (it.live){ try { live = String(it.live() || ""); } catch (e){ live = ""; } if (/undefined|NaN|null/.test(live)) live = ""; }
  return {key, src:k, kind:k.split(":")[0], t:it.t, what:it.what, put:it.put || "", why:it.why || "", unsure:it.unsure || "", live};
}
// [[key]] / [[key|label]] → a glossary button. Unknown keys fall back to the label as plain text.
function guideHtml(text){
  return gEsc(text).replace(/\[\[([\w.-]+)(?:\|([^\]]+))?\]\]/g, (m, k, label) => {
    const it = GUIDE.items["term:" + k], l = label || (it ? it.t.replace(/\s*\(.*\)$/, "") : k);
    return it ? `<button type="button" class="gterm" data-term="${k}">${l}</button>` : l;
  });
}
const guideText = text => String(text || "").replace(/\[\[([\w.-]+)(?:\|([^\]]+))?\]\]/g, (m, k, l) => l || (GUIDE.items["term:" + k] ? GUIDE.items["term:" + k].t : k));
// Link the first use of each jargon word in text that has already been HTML-escaped (no tags inside).
function termify(escaped){
  let out = String(escaped || "");
  GUIDE_JARGON.forEach(([re, k]) => { out = out.replace(re, w => `<button type="button" class="gterm" data-term="${k}">${w}</button>`); });
  return out;
}

/* ---------- Tours: short spotlight walks. Stops whose element isn't on screen are skipped. ---------- */
const GUIDE_TOURS = {
  first: [
    {sel:".rail", t:"Eight steps to a priced model", b:"You work down this list, from the tender pack to a populated workbook. Ticks show what's done."},
    {sel:'[data-guide="el:packs"]', t:"Start with a sample", b:"Pick a sample pack to practise, or drop the client's documents above it."},
    {sel:"#trace", t:"The price, live", b:"The weekly charge builds here as you work. Watch it move when you change something."},
    {sel:"#guideBtn", t:"Help is always here", b:"The guide explains whatever you click on, in plain English. Press ? at any time to open or close it."}],
  docs: [
    {sel:'[data-guide="el:drop"]', t:"Add the documents", b:"Drop the specification, site list and pricing schedule here."},
    {sel:'[data-guide="el:packs"]', t:"Or practise", b:"Sample packs show the whole process with made-up sites."},
    {sel:"#extractBtn", t:"Read them", b:"Press Extract specification once every file is added."}],
  spec: [
    {sel:".mosaic.form", sm:".mosaic.form > :first-child", t:"The survey sheet", b:"Each fact has a stamp. [[doc|DOC]] means it came from the documents, and [[gap|GAP]] means it is missing."},
    {sel:'[data-guide="field:client.name"]', t:"Start with the client", b:"The client name labels the workbook, so it must be filled in."},
    {sel:'[data-guide="field:commercial.paymentDays"]', t:"Terms that change the price", b:"Payment days, the term and the pay floor all change the price. Check them against the source."},
    {sel:'[data-guide="el:excerpts"]', t:"The evidence", b:"These are the sentences each fact came from."}],
  questions: [
    {sel:".qcard", t:"One question at a time", b:"Pick an answer, or use the suggestion. [[critical|Critical]] questions must be answered by you."},
    {sel:".qcard .why", t:"Why the suggestion", b:"Every suggestion says where it came from, usually past bids."},
    {sel:'[data-guide="el:qlist"]', t:"What's left", b:"Red dots are critical questions still open. Click any question to jump to it."},
    {sel:"#acceptAll", t:"Finish quickly", b:"Once the critical ones are done, accept the suggestions for the rest."}],
  sites: [
    {sel:'[data-guide="el:method"]', t:"How hours are set", b:"Confirm the method first. Client hours give a compliant bid."},
    {sel:'[data-guide="el:siteTable"]', sm:'[data-guide="el:siteTable"] tbody tr:first-child', t:"Every site", b:"Type over Hours / wk to change a site. The stamp shows where each figure came from."},
    {sel:'[data-guide="el:siteUpload"]', t:"Replace the list", b:"Upload or paste a new site list at any time."}],
  price: [
    {sel:'[data-guide="el:levers"]', sm:'[data-guide="el:levers"] > :first-child', t:"The levers", b:"Each box is one assumption. Change one and watch the trace."},
    {sel:'[data-guide="el:buildup"]', sm:'[data-guide="el:buildup"] > :first-child', t:"How cost becomes price", b:"Wages at the top, the weekly charge at the bottom."},
    {sel:'[data-guide="el:launch"]', t:"Save a run", b:"Launch a run to save this price. Launch another to compare an option."},
    {sel:'[data-guide="el:checks"]', t:"The checks", b:"BLOCK must be fixed before you can generate. WARN needs a reason."}],
  board: [
    {sel:'[data-guide="el:viewToggle"]', t:"Two views", b:"Client view is the price. Internal view is what you expect to spend."},
    {sel:'[data-guide="el:boardTable"]', sm:'[data-guide="el:boardTable"] tbody tr:first-child', t:"The board page", b:"Revenue, costs and [[contribution|contribution]], by week and by year."},
    {sel:'[data-guide="el:boardBars"]', t:"Against past bids", b:"Anything outside the dashed band needs a reason."}],
  insights: [
    {sel:"#ins-pound", sm:"#ins-pound h3", t:"Every £1", b:"Where each pound goes, in pence."},
    {sel:"#ins-hour", sm:"#ins-hour h3", t:"One hour", b:"What the client pays for an hour, against what the cleaner is paid."},
    {sel:"#ins-site", sm:"#ins-site h3", t:"One site", b:"Pick any site to see its week in detail."},
    {sel:"#ins-estate", sm:"#ins-estate h3", t:"The estate", b:"Which sites carry the price, and how firm their hours are."},
    {sel:"#ins-contract", sm:"#ins-contract h3", t:"The contract", b:"The whole term, and what moves the price most."},
    {sel:".spine", t:"Your summary", b:"One line per scale. Copy it into your bid email."}],
  generate: [
    {sel:'[data-guide="el:route"]', t:"Who approves", b:"This follows the approval policy. Exceptions go to a director."},
    {sel:'[data-guide="el:signoff"]', t:"Sign it off", b:"Tick, add your name and sign. If the price changes, sign again."},
    {sel:"#genBtn", t:"Generate", b:"This writes the price into the standard workbook and checks the totals."}]
};

/* ---------- Checklist and the "do this next" nudge ---------- */
function guideChecklist(step){
  if (typeof S === "undefined" || !S) return [];
  const sp = S.spec, R = sp && sp.sites.length ? compute() : null, F = R ? flags(R) : [], blocks = F.filter(f => f.lvl === "block").length;
  const gap = p => { const F2 = SPEC_FIELDS.find(x => x.p === p); return !sp || !F2 || specCellSrc(sp, F2) === "gap"; };
  const all = sp ? qs() : [], so = R ? signoffState(R) : {valid:false};
  const L = {
    docs: [["Add the tender documents or pick a sample pack", S.files.length > 0], ["Extract the specification", !!S.extracted]],
    spec: [["Add the client name", !!(sp && sp.client.name)], ["Check the contract term", sp && !gap("term.years")], ["Check the payment terms", sp && !gap("commercial.paymentDays")], ["Check the pay floor", sp && !!sp.livingWage || !!S.answers.payBasis]],
    questions: [["Answer every critical question", !!sp && openReds() === 0], ["Answer or accept the rest", !!sp && all.every(q => S.answers[q.id])]],
    sites: [["Load the site list", !!(sp && sp.sites.length)], ["Confirm the hours method", !!S.answers.hoursMethod], ["No sites on flat default hours", !!R && !R.rows.some(r => r.src === "def")]],
    price: [["Clear the blocking checks", !!R && !blocks], ["Launch a run as your base case", S.runs.length > 0], ["Compare an alternative run (optional)", S.runs.length > 1]],
    board: [["Read the client view", !!S.visited.board], ["Check the internal view", !!(S.visited.internalView || S.view === "internal")]],
    insights: [["Read all five scales", Object.keys(S.insRead || {}).length >= 5], ["Copy or download the summary", !!S.visited.insCopy]],
    generate: [["Clear the blocking checks", !!R && !blocks], ["Sign off the price", !!so.valid], ["Generate the workbook", !!S.generated]]
  }[step] || [];
  return L.map(([t, done]) => ({t, done:!!done}));
}
function guideNext(){
  if (typeof S === "undefined" || !S) return null;
  if (S.extracting) return {t:"Reading the documents. This takes a few seconds."};
  if (!S.extracted) return S.files.length ? {t:"Press Extract specification to read the files.", show:"el:extract"} : {t:"Add the tender documents, or pick a sample pack to practise.", show:"el:packs"};
  const sp = S.spec, R = sp.sites.length ? compute() : null, F = R ? flags(R) : flags(null), block = F.find(f => f.lvl === "block");
  const warns = F.filter(f => f.lvl === "warn").length, reds = openReds(), list = qs();
  const firstRed = () => { const i = list.findIndex(q => q.critical && !S.answers[q.id]); return i < 0 ? null : {t:`Answer: ${list[i].text}`, go:"questions", q:i}; };
  switch (S.step){
    case "docs": return {t:"The documents are read. Check what was found on the survey sheet.", go:"spec"};
    case "spec":
      if (!sp.client.name) return {t:"Add the client name. It labels the workbook.", show:"field:client.name"};
      return reds ? {t:`Answer the ${gPl(reds, "critical question")} the documents didn't cover.`, go:"questions"} : {t:"The sheet is complete. Review your answers next.", go:"questions"};
    case "questions": return firstRed() || {t:"Every critical question is answered. Move on to the sites and their hours.", go:"sites"};
    case "sites":
      if (!sp.sites.length) return {t:"Load the client's site list.", show:"el:siteUpload"};
      if (!S.answers.hoursMethod) return {t:"Confirm how the hours are set.", show:"el:method"};
      { const weak = R.rows.filter(r => r.src === "bm" || r.src === "def").length;
        if (weak) return {t:`${gPl(weak, "site")} ${weak === 1 ? "uses" : "use"} estimated hours. Check the largest ones, then build the price.`, show:"el:siteTable", go:"price"}; }
      return {t:"The hours are set. Build the price next.", go:"price"};
    case "price":
      if (block) return {t:block.t, go:block.go};
      if (!S.runs.length) return {t:"Launch a run to save this price as your base case.", show:"el:launch"};
      if (warns) return {t:`Read the ${gPl(warns, "warning")} under Checks and be ready to explain ${warns === 1 ? "it" : "them"}.`, show:"el:checks", go:"board"};
      return {t:"The price is saved. Read the board summary.", go:"board"};
    case "board":
      if (!S.visited.internalView && S.view !== "internal") return {t:"Switch to Internal view to see the margin you expect in practice.", show:"el:viewToggle"};
      return {t:"Next, see what the model tells us.", go:"insights"};
    case "insights": {
      const read = Object.keys(S.insRead || {}).length;
      if (read < 5) return {t:`Scroll through each scale. ${read} of 5 read so far.`, show:"el:insSummary"};
      if (!S.visited.insCopy) return {t:"Copy the summary into your bid email or approval note.", show:"el:insSummary"};
      return {t:"You can explain the price. Generate the model next.", go:"generate"};
    }
    case "generate": {
      if (block) return {t:block.t, go:block.go};
      if (!R || !signoffState(R).valid) return {t:"Tick the box and sign off the price.", show:"el:signoff"};
      if (!S.generated) return {t:"Press Generate workbook.", show:"el:genBtn"};
      return {t:"Done. The first-pass model is ready for approval."};
    }
  }
  return null;
}

/* ---------- Local answers (standalone, or when the Bid Coach agent doesn't reply) ---------- */
const GUIDE_STOP = new Set("the a an and or of to in on for is it this that what how why do does i my me we you your be can should with at by from are was which when who much many".split(" "));
function searchGuide(text, n = 3){
  const words = String(text || "").toLowerCase().replace(/[^a-z0-9£%\s-]/g, " ").split(/\s+/).filter(w => w.length > 1 && !GUIDE_STOP.has(w));
  if (!words.length) return [];
  const hits = [];
  Object.entries(GUIDE.items).forEach(([k, it]) => {
    if (it.alias) return;
    const title = it.t.toLowerCase(), body = guideText([it.what, it.put, it.why, it.unsure].join(" ")).toLowerCase();
    let s = 0; words.forEach(w => { if (title.includes(w)) s += 3; if (body.includes(w)) s += 1; if (k.endsWith(":" + w)) s += 4; });
    if (s) hits.push({key:k, s});
  });
  return hits.sort((a, b) => b.s - a.s || a.key.localeCompare(b.key)).slice(0, n).map(h => h.key);
}
// The static text only (no live figures), for the Bid Coach agent's knowledge source.
function guideExport(){
  const items = Object.entries(GUIDE.items).filter(([, it]) => !it.alias).map(([key, it]) => ({key, title:it.t, what:guideText(it.what), put:guideText(it.put), why:guideText(it.why), unsure:guideText(it.unsure)}));
  const tours = Object.fromEntries(Object.entries(GUIDE_TOURS).map(([k, v]) => [k, v.map(s => ({title:s.t, body:guideText(s.b)}))]));
  return {schema:"CostModelGuide/1.0", version:GUIDE_VERSION, items, tours};
}
