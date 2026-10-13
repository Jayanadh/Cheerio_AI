# Cheerio Troubleshoot: interactive concept

A clickable prototype of a guided check for one support problem: **"My WhatsApp keyword auto-reply isn't working."**
A non-technical user opens it from the Keywords page. The guide asks one question at a time, explains why each check matters, and lets the user fix a demo rule themselves and confirm a simulated test. If the cause can't be confirmed, they get a reviewable summary to send to support.

First-time visitors are offered a 7-step **product tour** (also available from **Take the tour** in the header). It spotlights the real UI, waits for you to click Troubleshoot, then continues inside the guide.

> Independent concept for the Cheerio Product Intern assignment. Not an official Cheerio product or connected account. Northstar Apparel, its rules and every outcome are fictional demo data. Nothing sends WhatsApp messages or creates support tickets.

## Run it locally

No build step and no dependencies: plain HTML, CSS and JavaScript modules.

```bash
cd cheerio-troubleshoot
python3 -m http.server 4173
```

Open http://localhost:4173. A server is needed because browsers block JavaScript modules on `file://`.

Logic tests (Node 20+):

```bash
node --test
```

## Deploy to Vercel (public link)

**Option A: Vercel CLI**, from this folder:

```bash
npx vercel --prod
```

The first run asks you to log in. Then accept the defaults: set up and deploy → yes, link to an existing project → no, pick a project name, code directory `./`, don't modify settings. Vercel detects a static site (framework "Other", no build command) and prints your production URL.

**Option B: GitHub + Vercel dashboard.** Push this folder to a GitHub repo. In Vercel, choose *Add New → Project*, import the repo and set **Framework Preset: Other**. If the repo contains more than this folder, set **Root Directory** to `cheerio-troubleshoot`. Leave the build and output settings empty, then deploy.

**Before you share:** use the short production domain from *Project → Settings → Domains* (for example `your-project.vercel.app`). Vercel's default Deployment Protection can show a login wall on the long per-deployment URLs, but the production domain stays public. Open it in a private window to confirm anyone can see it.

## Demo scenarios (prototype controls in the header)

| Scenario | What it shows |
|---|---|
| Keyword case mismatch | Rule expects `PRICE`, test was `price`. Exact match is case-sensitive, so the user edits the demo rule, runs a simulated test and confirms it. |
| Incoming message missing | The test message isn't in Team Inbox. One grouped Inbox check, then "Still missing" leads to a handoff that says the keyword rule wasn't diagnosed. |
| Rule looks correct; no reply | Everything visible matches, but the simulated check gets no reply. Human handoff with root cause **unknown**. |
| Wrong action selected | The keyword matches, but the rule assigns the chat instead of replying. The user switches the demo action to a text reply, re-tests and confirms. |

Switching scenarios or pressing **Reset demo** restores the original fixture and clears all answers.

## What's simulated and what's left out

- **Simulated:** the keyword rules, Inbox visibility (always *user reported*), and the test. The test is a deterministic check: exact text equals the keyword, the action is a text reply, the rule is active, the message is visible, and the scenario isn't set to fail. No real message is sent or checked.
- **Real:** **Copy summary** uses the clipboard. If the browser blocks it, the summary is selected for manual copy, and "Copied" only shows after a successful copy. **Email support** is a `mailto:support@cheerio.in` link with the reviewed summary, sent from your own email app.
- **Deliberately excluded:** chatbot or AI diagnosis, login, APIs, WhatsApp integration, ticket creation, approximate matching, workflow debugging, analytics and persistence. Answers live in memory only.

## Files

| File | Purpose |
|---|---|
| `index.html` | Workspace shell, drawer frame, Lucide icon sprite (ISC licence) |
| `styles.css` | Cheerio-inspired styling (purple accent, Onest + DM Sans), responsive and reduced-motion |
| `flow.js` | Scenarios, step content, branching state machine, simulator and support summary. Pure functions, no DOM |
| `app.js` | Renders state and wires up events, focus management and the handoff actions |
| `tour.js` | Product tour: steps, card placement, and a spotlight built on the Popover API so it can sit above the modal drawer |
| `flow.test.js`, `tour.test.js` | 30 tests: exact matching, the success guard, branching, invalidation, resets, the summary, and tour card placement |

## Verification (13 Oct 2026)

Checked in a Chromium browser at 1024×768 and at 375×812 (mobile emulation), plus `node --test` (30/30 passing).

- [x] Keywords table shows the fictional "Pricing reply" rule. **Troubleshoot** and **Auto-reply not working?** both open the same guide.
- [x] Path 1: "did not arrive" → Inbox "Yes" → `price` vs `PRICE` explained as a possible cause → manual edit and save → labelled simulation → "Yes, in this demo" → demo success with a change summary. Closing shows `price` and "Edited in demo" in the table; Reset demo restores `PRICE`.
- [x] Path 2: "can't find message" skips the repeat question → grouped Inbox check → "Still missing" → handoff with the exact cause wording. "Found it now" continues to the keyword check; "I can't access Inbox" → admin/support handoff.
- [x] Path 3: matching settings → "The visible settings don't explain the missing reply" → simulation with no reply → only human help offered, root cause unknown.
- [x] Path 4: "different action" → expected outcome → action edit to text reply (reply text editable) → re-test → confirm. Being unsure about routing sends you to support.
- [x] **Get human help** works from the first question and every later step. **Return to troubleshooting** keeps your answers.
- [x] "I'm not sure" explains once, then hands off. The complex-workflow escape hatch and "I can't edit this rule" each lead to a handoff.
- [x] Back keeps answers; changing an earlier answer clears the results that depended on it. A failed re-test allows one more fix, then only human help. **Start over** asks for confirmation when a demo edit exists.
- [x] Keyboard: Tab stays in the drawer with a visible focus ring, Enter activates options, focus moves to each new step heading, and Esc closes and returns focus to the trigger. Reopening resumes where you left off.
- [x] Product tour: a first-visit prompt ("Not now" is remembered) and the header button both start it. All 7 steps spotlight the right element. Clicking the real Troubleshoot button or "Open it for me" continues inside the drawer. Back leaves the drawer, Esc or Skip end only the tour, and choosing the suggested answer finishes it. On phones the card docks opposite the target.
- [x] Mobile: no horizontal scroll, the table becomes cards, navigation collapses to a menu, and the guide is full-screen.

**Limits of this check:**
- The embedded test browser denies clipboard access, so only the copy fallback was exercised there. The Clipboard API path should work in normal browsers over HTTPS.
- Not tested in Safari, Firefox, on real phones or with a screen reader.
