# Getting the Cost Model Builder hosted using only a browser

Use this if you can't run the `ms` command-line tool, or you don't have your own access to a Power Platform environment. All three routes below end in the same place: a hosted app your sellers open with a link and their normal work sign-in.

> Checked against Microsoft's preview docs, September 2026. There is **no "upload my app" button** in Cowork or Copilot Studio yet. Both build apps by chatting with an AI, and the only code-level tool is the `ms` command line. So each route below works around that in a different way. Where something isn't documented, it's marked *check*.

## Which route?

| | Route A: a terminal in a browser tab | Route B: have Cowork build it from our files | Route C: a colleague does the one-off set-up |
|---|---|---|---|
| What you need | A GitHub account with **Codespaces** allowed by your company | Cowork with the **App** skill (Frontier programme) | Someone who can run `ms` once |
| Is the tested pricing kept exactly? | **Yes**, it's the same files | **Maybe**: the AI might change them, so you must check (step B4) | **Yes** |
| Effort | About 1 hour | About 1 hour, plus checking | About 30 minutes of their time |
| Best for | You want to own it yourself | You only have Cowork | You have a friendly developer or IT contact |

**Recommendation:** try Route A first. If Codespaces isn't allowed, use Route C. Use Route B only if neither is possible, and treat the result as a pilot until it passes the checks.

---

## Route A: a terminal in a browser tab (GitHub Codespaces)

A Codespace is a computer in the cloud that you use through a browser tab. It has a terminal, so you can run the `ms` tool there without installing anything on your own laptop.

1. **Put the project on GitHub.** Create a **private** repository at github.com. Choose *Add file*, then *Upload files*, and drag in **everything inside** `C:\CModels\CostModelBuilder-upload` (30 files, 3.6 MB). That folder is made by `npm run pack:upload` and has only what the hosted app needs. It leaves out `node_modules`, `dist` and the tender-derived `examples`; its `UPLOAD-README.md` lists what's in and what's out. Re-run `npm run pack:upload` after any change to the app.
2. **Open a Codespace.** On the repository page, choose *Code*, then *Codespaces*, then *Create codespace*. A browser version of VS Code opens with a terminal at the bottom.
3. **Go to the folder that holds `package.json`.** Type `ls` and press Enter. If `package.json` is in the list, you're in the right place. If you see a folder name instead (for example `CostModelBuilder-upload`), GitHub kept the folder when you uploaded. Go into it with `cd CostModelBuilder-upload` (use the name you see), then type `ls` again to check. Run every command below from that folder. If you open a new terminal later, `cd` into it again. **If `ls` shows only `README.md`**, the files never reached the Codespace. Type `git pull` and `ls` again. If they're still missing, drag everything inside `CostModelBuilder-upload` from Windows Explorer into the file list on the left of the Codespace, replacing any existing files, then save it to GitHub with `git add -A && git commit -m "Add app" && git push`.
4. **Paste these lines into the terminal, one at a time:**
   ```bash
   npm install
   npm install -g @microsoft/managed-apps-cli
   npm test                      # should say 6 passed (the full 49 run only on your PC, which has the tender data)
   ms auth login                 # sign in with your work account when asked
   ms app init --display-name "Cost Model Builder" --build-path ./dist --build-command "npm run build" --repo native
   git add -A && git commit -m "Cost Model Builder 3.0.0" && git push
   ms app play                   # opens the preview
   ms app deploy                 # makes it live
   ```
   If you don't give an environment ID, the app goes into your default environment. That's fine for a pilot.
5. **Check it** (see "The checks" at the end), then share it: `ms app share --help` shows the options.

*Check:* your company may block sign-in from a cloud machine (Conditional Access), or may not allow Codespaces at all. If either happens, use Route C.

---

## Route B: have Cowork build it from our files

Cowork's App skill builds an app when you describe it, and you can attach files. Here you ask it to **use our files as they are**, instead of inventing its own version.

**B1. Find the files.** They're ready in `cowork/browser-route/attach/`, taken from the tested managed build. First upload the whole folder to your OneDrive, so Cowork can reach it.

| File | Bytes | Needed for |
|---|---|---|
| `index.html` | 55,881 | The page |
| `platform.js` | 357,335 | Sign-in and the link to the hosted platform |
| `app.js` | 135,574 | The screens |
| `engine.js` | 116,251 | **The pricing engine: must not change** |
| `guide.js` | 61,372 | The Guide |
| `data/reference-data.js` | 4,856 | Rates and benchmarks |
| `map.js`, `map-street.js` | 55,082 and 14,059 | The estate map |
| `data/geo/uk-areas.js`, `uk-postcodes.js`, `uk-places.js` | 583,714, 347,739 and 760,586 | Map data (the three largest files) |

If Cowork refuses the large map files, leave out the three `data/geo` files. The app still prices correctly; only the estate map says its data hasn't loaded.

**B2. Start Cowork.** Type `/app`, attach the files (or point it at the OneDrive folder), and paste this:

> Build an app called **Cost Model Builder** from the files I've attached. This is a finished, tested app, so **do not redesign, rewrite, convert or tidy it**. Use each attached file exactly as it is, as a static file, with the same name and the same folder (`data/` and `data/geo/` stay as sub-folders). `engine.js` is a pricing engine that has been checked to the penny, so it must be byte-for-byte unchanged. If the platform needs a build step, it must only copy these files into the output folder: no bundling, no minifying, no React or TypeScript conversion. Don't add any data sources or connectors yet. When you've finished, list every file in the app with its size in bytes.

**B3. Compare the file list** Cowork gives you with the table above. Every size should match exactly. If `engine.js` or `app.js` is a different size, say: *"engine.js has been changed. Replace it with the attached file exactly as it is."*

**B4. Run the checks** at the end. If a figure is wrong, don't use it for real bids.

**B5. After that, leave the code alone in Cowork.** Asking Cowork to "improve" the app later lets the AI edit the tested code. Make changes here instead, and re-attach the changed files.

*Check:* Cowork's attachment size limits, and whether it keeps files verbatim, aren't documented. Route B is the least predictable route, which is why the checks matter.

---

## Route C: a colleague does the one-off set-up

Only the **first** step really needs the `ms` tool. After that, updates can be done in a browser.

1. Put the project in a **private GitHub repository** (Route A, step 1).
2. Ask a developer or IT contact to run, once:
   `ms app init --display-name "Cost Model Builder" --build-path ./dist --build-command "npm run build" --repo <your GitHub repo URL>`
   Then ask them to share the app with you as an owner.
3. From then on, you update the app in your browser: on GitHub choose *Add file*, then *Upload files*, and commit. Opening the app's preview link starts a new build of the latest commit.

*Check:* making a build **live** is `ms app deploy`. The docs don't yet show a button for it, so your colleague may need to run that each time, or show you where it is in the app's management page.

---

## The checks (for every route)

Open the hosted app, and for each sample pack choose the pack, then *Extract specification*. The weekly charge (in the top strip, or in the *Estate map* header) must read:

| Sample pack | Sites | Weekly charge |
|---|---|---|
| Electricals retail and offices | 280 | **£304,543** |
| Value fashion stores | 194 | **£403,564** |
| Grocery estate with cobots | 607 | **£1,281,003** |

Also check that:
- your name appears at sign-off;
- the Guide opens;
- the downloads work.

A different figure means a file was changed, so don't use the app for real bids until it's fixed.

What won't work yet on any route, and doesn't need to:
- the AI extraction and Bid Coach agents;
- saving drafts to Dataverse;
- writing the workbook to SharePoint;
- the street map.

Each of these needs an admin to allow something (MANAGED-APP.md §4). Until then the app uses its built-in versions, exactly as on your laptop.

To refresh the `attach` folder after the app changes, run `npm run build`, then copy the same files from `dist/`.
