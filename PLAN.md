# Doorman: build plan

**What we're building:** a "Know Your Agent" checkpoint for small PayPal merchants. It lets real customers' AI agents shop and keeps scalper bots out. Every agent purchase ends with the customer approving the payment in PayPal.

**Hackathon:** PayPal AI Hackathon on Devpost. Hard deadline **Thu Nov 12, 2026, 12:00pm PST** (20:00 UTC). **We submit on Wed Nov 11.** Nov 12 is buffer only.

**Who does what**
- **You:** accounts, the design of every screen, reviewing what I build, narrating the demo video, and the final Devpost submission.
- **Claude:** backend, PayPal integration, agent gateway, risk rules, AI features, demo agents, turning your designs into code, hosting, README, and the video script.

**Rules for not getting lost**
1. This file is the single source of truth. Every session starts by reading it and ends by ticking boxes and writing the next step under "Status".
2. Check-ins are three lines: **Done / Next / Blocked**.
3. Never paste secrets (client secret, API keys, database URL) into chat. They go in the `.env` file only, which is never committed.
4. The repo stays private until Nov 10, then goes public with the MIT license.
5. If a checkpoint fails, we use the fallback listed for it, not extra days.

---

## Status
- **Phase:** 2 (core engine), mostly built on Oct 31, ahead of the Nov 2–4 slot. Phase 1 passed its checkpoint on Oct 31.
- **Done:**
  - **Oct 27:** GitHub repo `04-John/Doorman` created (private), PayPal developer login, 1 US personal sandbox account.
  - **Oct 30:** project skeleton built (server, PayPal client, key-check script, README, MIT license), first commit pushed to GitHub.
  - **Oct 31:**
    - Doorman app created under the US business account, with Log in with PayPal on (return URL on 127.0.0.1). Keys verified.
    - Phase 1 built: payments (authorize, capture, void), Log in with PayPal, payer-ID match, agent signatures, the first MCP store tool, and the test bench.
    - **Browser tests passed:** login, capture, void and the payer mismatch. Phase 1 is done.
    - **Neon and Gemini keys added.** Gemini (gemini-3.5-flash) works on the free tier.
    - **Phase 2 core built and tested:** database, risk rules, passes, MCP store tools, checkout to approval to charge or release, and the drop simulation.
    - **You tested Phase 2 end to end:** Kestrel's step-up was charged; Ava paid from buyer 2 was released for payer mismatch.
    - **AI added:** explanations, rule writer, Gemini-driven Ava.
    - **Fixed:** a Windows-level `GEMINI_API_KEY` from another project was overriding ours; `.env` now wins locally.
    - **Designs exported** (`doorman/design/`; the file names were shifted on export, so contents ≠ names).
    - **All 7 screens built** from them and screenshot-checked.
    - **Fixed:** the live feed could crash the server when a browser tab closed mid-update; a server that can't bind its port now exits so the watcher restarts it.
    - **Fixed:** the dev server never started under `npm run dev` (`tsx watch` hangs under `concurrently` on Windows); it now uses Node's own watch mode.
    - **Your review, round 1:**
      - Every page now has a demo bar linking all screens. Add `?clean=1` to a URL to hide it for recording.
      - Storefront: Add to cart opens a real cart paid with PayPal, with the drop's one-per-customer rule checked against the paying account. "Let my AI assistant buy it" becomes "Ask Ava to buy it" once you've linked an agent: Ava checks out through Doorman with your pass, and you land on the approval page.
      - Link flow now matches the design: Choose your agent (Ava, Juniper, Milo, or paste a key), then limits, then pass created. My passes moved to `/passes`.
      - Approve: shows the size, has "Try again" after a released hold, and approval links expire after 15 minutes as the page says.
      - Logins are kept in the database, so a server restart (or Render waking up) no longer logs people out.
    - **Your review, round 2:**
      - PayPal button: full width and pill-shaped as designed.
      - It shows sooner: the 18s eligibility check is gone, and PayPal starts loading as soon as the store or approval page opens. From the store ("Ask Ava to buy it") it's ready in about 2s. A freshly opened approval link still waits about 15s for PayPal's sandbox to start (shown as "Loading PayPal…").
      - Approvals older than 15 minutes now expire everywhere, so old drop runs no longer trigger "Another one for the same customer" or inflate "Awaiting approval".
      - Doorman's refusals no longer show as red 409 errors in the console; Log in with PayPal looks like PayPal's button and says "Opening PayPal…" while the sandbox loads.
  - **Nov 1:**
    - **You tested the whole agent purchase:** Ava bought with your pass, you approved in PayPal, and it was charged.
    - **Review round 3:** real product photos (Pexels and Unsplash, no logos, credited in `apps/web/public/products/CREDITS.md`), and the merchant avatar opens a profile menu.
    - **Checked the official rules** (Nov 1). Changes to the plan:
      - Judges need a sandbox buyer login to test the PayPal parts.
      - Keep the demo awake until Dec 15.
      - Opt into AG Grid and Render; don't claim APIMatic unless we actually use it.
    - **Hosted:** deployed on Render as a Blueprint. **Live URL: https://doorman-ppw2.onrender.com**. Judges' sandbox buyer: `sb-nizs553636398@personal.example.com` (payer ID `ZTAEZCCT64MPW`, set in `render.yaml`). You tested the full flow on the live site with it.
    - **Review round 4:**
      - Storefront: once you have your hoodie from the drop it says "You've got yours" (or "Waiting for your approval" with a link), and a refused repeat buy is explained in the customer's terms.
      - Fixed: a redeploy made Ava forget the passes customers gave her. The demo agents' tokens now live in the database.
    - **PayPal webhooks:** the live server registers its webhook and verifies every delivery with PayPal (tested with PayPal's simulator). An approval whose page was closed still gets finished, and each order's detail panel lists the webhook events.
    - **Keep-awake until Dec 15:** the server checks its own health every 10 minutes, plus a GitHub Actions check from outside. Idle database connections close after a minute so Neon can scale to zero.
    - **README** rewritten for judges: live link, sandbox login, a 6-step walkthrough, how it works, PayPal APIs, AI, sponsor tools, run locally, deploy.
- **Next step:**
  - You: test the live site with the README's "Try it" steps, exactly as a judge would, in a private window.
  - Done Nov 2: you followed the README's "Try it" steps on the live site and everything worked.
  - Done Nov 2: GitHub ran the Actions check only twice in 6 hours (GitHub delays scheduled jobs), so you added an UptimeRobot monitor (free, every 5 minutes, emails you if it's down) on `/health`. It shows Up.
  - Done Nov 2: fresh-clone test of the README passed.
  - Claude: video script and shot list; Devpost text draft.
- **Blocked on:** nothing.
- **Watch:** one login attempt ended with `reason=token_exchange`. It's non-blocking; the error now shows PayPal's reason if it happens again.

---

## Phase 0: Setup (finish by Fri Oct 30)

**You**
- [ ] Confirm eligibility: you're 18+ and not a resident of Brazil, Quebec, Russia, Crimea, Cuba, Iran, North Korea or a US-sanctioned country.
- [ ] Devpost: open https://paypalaihackathon.devpost.com and click **Join hackathon**.
- [x] GitHub: private repo created at https://github.com/04-John/Doorman
- [x] PayPal Developer: logged in at https://developer.paypal.com
  - [x] Testing Tools → Sandbox Accounts → **Create account**: a new **Business** account, country **United States** (`sb-vg98x49213061@business.example.com`). Don't use the NG accounts as the merchant.
  - [x] First US Personal account (buyer 1)
  - [x] Second US Personal account (buyer 2, used for the "wrong person approved it" test)
  - [x] Apps & Credentials (Sandbox) → **Create App** named "Doorman", type Merchant, linked to the new US Business account.
  - [x] In the app: **Other features** → tick **Log in with PayPal** → **Advanced Settings**:
    - Return URL `http://127.0.0.1:5173/auth/paypal/callback`. PayPal rejected `localhost`, so always open the app at `http://127.0.0.1:5173`.
    - Information: Full name, Email, Account verification status, PayPal account ID (payer ID)
    - Privacy policy URL and User agreement URL: `https://example.com` for now
    - Save
  - [x] Paste the app's Client ID and Secret into `doorman/.env`. Don't send them in chat.
- [ ] Google AI Studio (https://aistudio.google.com): create a free Gemini API key and add it to `.env`.
- [ ] Join the PayPal Developer Discord (https://discord.gg/sJ2G6DyvSK) for help when the sandbox misbehaves.
- [ ] Tell me which design tool you'll use. Figma is ideal because I can read your file directly.

**Claude**
- [x] Set up the project: TypeScript monorepo, `.gitignore`, `.env.example`, MIT license, README skeleton.
- [x] Connect the local repo to your GitHub repo and make the first commit.
- [x] Add a key-check command (`npm run check:paypal`) that confirms the sandbox keys, Log in with PayPal and the business account's country.
- [ ] Install the PayPal AI-Toolkit plugin and APIMatic's PayPal context plugin. Using the APIMatic plugin makes us eligible for its sponsor prize, and we'll document that we used it.

---

## Phase 1: Prove the risky parts (Sat Oct 31 – Sun Nov 1)

**Claude**
- [x] PayPal access: fetch and cache a sandbox token, and attach a unique request ID to every payment call so a retry can't charge twice.
- [x] Payments: create an order that **authorizes** without charging, have the buyer approve on a test page (PayPal JS SDK v6), then **capture** or **void** it. Confirmed Oct 31: capture → COMPLETED, void → VOIDED.
- [x] Log in with PayPal: sign a sandbox buyer in and read `verified_account`, email and user ID. Confirmed Oct 31: returns name, email, verified=true and payer ID. Needs `response_type=code`, which PayPal's docs example omits.
- [x] Match the payer ID from Log in with PayPal (the "PayPal account ID" attribute) against the payer ID on the approved order. Confirmed Oct 31: same buyer → match, different buyer → MISMATCH.
- [x] Agent signatures: an agent signs each request with an Ed25519 key (RFC 9421 HTTP Message Signatures), and Doorman verifies the signature. 6 tests pass. `npm run demo:agent` shows unsigned, signed and tampered requests handled correctly.
- [x] Agent-facing server: a bare MCP server with one tool, `search_products`.
- [x] Test bench at `http://127.0.0.1:5173/lab.html` (start everything with `npm run dev`).

**You**
- [x] ~~Rough sketches~~ Replaced on Oct 31: you design directly in Figma from `docs/DESIGN_BRIEF.md` (7 screens, all states, sample data).
- [ ] **By Sun Nov 1:** Screen 1 (Live agent dashboard) and its components in Figma, so the build can start.

**Checkpoint, Sun Nov 1 (go/no-go): PASSED Oct 31, a day early**
- [x] Authorize → approve → capture/void works in the sandbox.
- [x] Log in with PayPal works. No fallback needed.
- [x] Signed request verified end to end.

---

## Phase 2: Core engine (Mon Nov 2 – Wed Nov 4)

**Claude**
- [x] Database on Neon (free Postgres): products, drops, agents, customers, passes, link requests, orders, events, settings. Set up with `npm run db:setup`.
- [x] **Agent pass:** the agent asks to be linked, the customer logs in with PayPal and sets a cap and expiry, and the agent collects a pass token once. The pass only works for that agent's key. Revoking works instantly.
- [x] **Store tools for agents (MCP):** `search_products`, `add_to_cart`, `checkout` (returns the customer's approval link), `order_status`, `request_customer_link`, `collect_agent_pass`.
- [x] **Risk rules**, fixed and predictable (15 tests pass):
  - Identity level: verified pass / signed with no pass / unsigned.
  - Request speed (per agent key or network address), the cap, and one item per customer during a drop.
  - The approving PayPal account doesn't match the pass.
  - Outcome: **allow / step-up / throttle / block**, each with a reason code.
  - *Dropped: "several passes on one account". The payer match and per-customer limit cover the same abuse.*
- [x] **Drop mode:** limited stock taken atomically at approval. After the customer approves, the payment is charged if every check passes; otherwise the hold is released automatically (payer mismatch, already bought, sold out).
- [x] **PayPal webhooks:** order approved, payment captured, authorization voided. *Moved to Phase 3 and done Nov 1.*
- [x] **AI features (Gemini free tier):**
  - A plain-English explanation of each decision, cached so we stay inside free limits.
    - Uses `gemini-3.5-flash-lite` (about 1 second). Identical situations share one explanation.
    - Falls back to a rules-based sentence if Gemini is down.
  - The merchant's plain-English rules converted into settings, shown to the merchant for confirmation before saving.
    - `POST /api/rules/compile` uses `gemini-3.5-flash`.
    - Anything it can't express is listed as "unsupported", never silently dropped.
- [x] **Demo agents:**
  1. A real AI shopping assistant with a valid pass, with a scripted fallback.
     - Ava runs on Gemini. Asked for 2 hoodies, she's refused ("limit 1 per customer"), adapts to 1, checks out, and sends John the approval link.
     - Her conversation is at `GET /api/drop/transcript`.
  2. [x] A scalper bot swarm with no identity (58 bots from documentation-only IP ranges).
  3. [x] A signed agent with no linked customer (Kestrel), plus Juniper with a revoked pass.
- [x] **One-click "Run the drop" simulation** so judges can see everything without any API keys. Verified Oct 31: 14 visitors, 44 allowed, 30 blocked, 20 throttled, 2 step-ups with real PayPal orders.
- [x] Temporary test pages until the designs land: `/monitor.html` (live table + Run the drop), `/approve/<token>`, `/link/<id>` and `/link` (My passes).

**You**
- [ ] **By Tue Nov 3:** final designs for all 7 screens in Figma (see `docs/DESIGN_BRIEF.md`). Share the link with view access. These are the designs we stick with.

**Checkpoint, Wed Nov 4**
- [ ] A full drop runs end to end from the terminal: good agent buys, bots get blocked, losers voided, events logged.

---

## Phase 3: Interface and hosting (Thu Nov 5 – Sun Nov 8)

**Claude**
- [ ] **Deploy first (Nov 5):** server on Render, database on Neon, public URL working.
  - Ready: `render.yaml` (one free web service, US East). Production mode was tested locally on Oct 31: the server serves the built app, and every page route plus the API works from one URL.
  - Needs: you sign up for Render with GitHub and look for the hackathon credit (Render sponsor page or Discord).
- [x] Build the 7 screens from your designs (React), done Oct 31, ahead of schedule:
  - Dashboard + detail panel + Ava's conversation, Approve purchase, Link your agent / My passes (Claude).
  - Demo hub, Storefront, Setup + Rules (helper agent).
  - All screenshot-checked against the designs at desktop and phone sizes.
- [x] Use AG Grid for the live traffic table (sponsor prize target) and update it live as agents arrive. It is themed with the design system's grid params and uses custom cells and a new-row flash.
- [ ] Add the live URL to the PayPal app's Log in with PayPal return URLs.
- [x] PayPal webhooks on the live URL (order approved, authorization created and voided, capture completed and denied), with signature verification. Done Nov 1.
- [x] Production settings: `DEMO_BUYER_PAYER_ID` = the judges' sandbox buyer (`ZTAEZCCT64MPW`, in `render.yaml`), so Ava's drop orders expect the account judges log in with. On Render the public URL and the login return URL come from the service's own address.
- [x] Keep the free Render service awake until Dec 15: the server pings its own `/health` every 10 minutes, UptimeRobot checks every 5 minutes (your account, emails on failure), and a GitHub Actions workflow is a third check (one always-on service fits Render's free 750 hours a month). Done Nov 1.

**You**
- [ ] Review each screen as it lands and send fixes in one list per day.
- [ ] Act as the merchant: run the onboarding and a drop yourself and note anything confusing.

**Checkpoint, Sun Nov 8: feature freeze.** After this, only bug fixes and polish.

---

## Phase 4: Polish and video (Mon Nov 9 – Tue Nov 10)

**Claude**
- [x] Clone the repo fresh and follow the README exactly. Fix anything that breaks. Done Nov 2 against a temporary empty database: install, database setup, PayPal key check, 15 tests, every page, the example agent and a full drop all worked. Fixed an outdated log message and added two README notes.
- [x] README: what it is, architecture diagram, how to run, which PayPal APIs and AI tools are used and how, and the sponsor tools (AG Grid, Render). Done Nov 1.
- [x] Testing instructions for judges (rules: required if a login is needed): the live URL, the judges' sandbox buyer email and password, and a 5-minute walkthrough. In the README, Nov 1.
- [ ] Draft the Devpost text: problem, what it does, how it's built, the AI tools and how they're used, challenges, what's next.
- [ ] Write the 3-minute video script and shot list.
- [ ] Check the hosted demo works from a fresh browser with no login.

**You**
- [ ] **Nov 9:** record the video with OBS Studio (free). No copyrighted music. Keep it under 3:00.
  - Record in a clean browser profile, or capture only the page. The rules ban third-party trademarks, and your bookmarks bar and extension icons show other companies' logos.
- [ ] **Nov 10:** upload to YouTube as **Public**.
- [ ] **Nov 10:** make the GitHub repo public and confirm the MIT license shows in the About section.

---

## Phase 5: Submit (Wed Nov 11)

- [ ] Fill in the Devpost submission: name, tagline, description (problem, what it does, how we built it, challenges, what's next), "Built with" tags, repo URL, demo URL, YouTube link.
- [ ] State which AI tools are used and how (required).
- [ ] Opt into the AG Grid and Render sponsor prizes (a project can win at most one sponsor prize). Only claim APIMatic if we actually use an APIMatic tool.
- [ ] Submit, then confirm the "submitted" status on Devpost.
- [ ] Keep the hosted demo running and free until **Dec 15** (judging runs Dec 1–15).

---

## Scope

**Must have:** agent signatures, agent pass, the store tools for agents, risk rules with reasons, drop mode, PayPal authorize/capture/void with the payer cross-check, webhooks, AI explanations, the simulation button, the 7 screens (storefront and demo hub kept simple), hosted demo, README, video.

**Only if we're ahead:** Venmo button on the approval page, importing products from PayPal's catalog, a Postman collection.

**Cut order if we fall behind:**
1. Venmo
2. Catalog import
3. Postman
4. AI rule writer (replace with a simple form)
5. Live updates (refresh every few seconds instead)

## Stack
TypeScript (Node) · Hono · PayPal REST APIs and Server SDK · PayPal JS SDK v6 · MCP TypeScript SDK · Vercel AI SDK with Gemini · Postgres (Neon) with Drizzle · React (Vite) · AG Grid · Render
