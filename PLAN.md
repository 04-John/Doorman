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
- **Phase:** 0 (setup), finishing Fri Oct 30. The schedule was re-planned on Oct 30: 12 days left, every later phase shifted.
- **Done:**
  - **Oct 27:** GitHub repo `04-John/Doorman` created (private), PayPal developer login, 1 US personal sandbox account.
  - **Oct 30:** project skeleton built (server, PayPal client, key-check script, README, MIT license), first commit pushed to GitHub.
- **Next step:** you paste the Client ID and Secret into `.env` and run `npm run check:paypal`. Also make sure the Doorman app sits under a US business account with Log in with PayPal turned on.
- **Blocked on:** keys in `.env`

---

## Phase 0: Setup (finish by Fri Oct 30)

**You**
- [ ] Confirm eligibility: you're 18+ and not a resident of Brazil, Quebec, Russia, Crimea, Cuba, Iran, North Korea or a US-sanctioned country.
- [ ] Devpost: open https://paypalaihackathon.devpost.com and click **Join hackathon**.
- [x] GitHub: private repo created at https://github.com/04-John/Doorman
- [x] PayPal Developer: logged in at https://developer.paypal.com
  - [ ] Testing Tools → Sandbox Accounts → **Create account**: a new **Business** account, country **United States**. Don't use the NG accounts as the merchant.
  - [x] First US Personal account (buyer 1)
  - [ ] Second US Personal account (buyer 2, used for the "wrong person approved it" test)
  - [ ] Apps & Credentials (Sandbox) → **Create App** named "Doorman", type Merchant, linked to the new US Business account.
  - [ ] In the app: **Other features** → tick **Log in with PayPal** → **Advanced Settings**:
    - Return URL `http://localhost:5173/auth/paypal/callback`. If it's rejected, use `http://127.0.0.1:5173/auth/paypal/callback` and tell Claude which one was accepted.
    - Information: Full name, Email, Account verification status, PayPal account ID (payer ID)
    - Privacy policy URL and User agreement URL: `https://example.com` for now
    - Save
  - [ ] Paste the app's Client ID and Secret into `doorman/.env`. Don't send them in chat.
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
- [ ] PayPal access: fetch and cache a sandbox token, and attach a unique request ID to every payment call so a retry can't charge twice.
- [ ] Payments: create an order that **authorizes** without charging, have the buyer approve on a test page (PayPal JS SDK v6), then **capture** or **void** it.
- [ ] Log in with PayPal: sign a sandbox buyer in and read `verified_account`, email and user ID.
- [ ] Match the payer ID from Log in with PayPal (the "PayPal account ID" attribute) against the payer ID on the approved order.
- [ ] Agent signatures: an agent signs each request with an Ed25519 key (RFC 9421 HTTP Message Signatures), and Doorman verifies the signature.
- [ ] Agent-facing server: a bare MCP server with one tool, `search_products`.

**You**
- [ ] **By Sat Oct 31:** rough wireframes of the 5 screens (sketches or photos are fine):
  1. Merchant onboarding (connect PayPal, products, rules in plain English)
  2. Live agent traffic dashboard (the hero screen)
  3. Decision detail ("why was this agent allowed, stepped up or blocked?")
  4. Customer "link your agent" page (log in with PayPal, set cap and expiry, revoke)
  5. Buyer approval page and a minimal storefront

**Checkpoint, Sun Nov 1 (go/no-go)**
- [ ] Authorize → approve → capture/void works in the sandbox.
- [ ] Log in with PayPal works. **If not:** we link the pass to the customer on their first approved PayPal order instead.
- [ ] Signed request verified end to end.

---

## Phase 2: Core engine (Mon Nov 2 – Wed Nov 4)

**Claude**
- [ ] Database on Neon (free Postgres): merchants, products, drops, agents, passes, carts, orders, decisions, events.
  - Needs: you create a free Neon project and put its URL in `.env`.
- [ ] **Agent pass:** after PayPal login the customer sets a cap and expiry, and Doorman issues a signed pass tied to the agent's key. Revoking it works instantly.
- [ ] **Store tools for agents (MCP):** `search_products`, `get_product`, `create_cart`, `checkout`, `order_status`.
- [ ] **Risk rules**, fixed and predictable:
  - Identity level: verified pass / signed with no pass / unsigned.
  - Request speed, cart size against the drop's limits, and one item per customer during a drop.
  - Several passes on one PayPal account.
  - The approving PayPal account doesn't match the pass.
  - Outcome: **allow / step-up / throttle / block**, each with a reason code.
- [ ] **Drop mode:** limited stock. Winners are captured; losing authorizations are voided automatically.
- [ ] **PayPal webhooks:** order approved, payment captured, authorization voided.
- [ ] **AI features (Gemini free tier):**
  - A plain-English explanation of each decision, cached so we stay inside free limits.
  - The merchant's plain-English rules converted into settings, shown to the merchant for confirmation before saving.
- [ ] **Demo agents:**
  1. A real AI shopping assistant with a valid pass, with a scripted fallback.
  2. A scalper bot swarm with no identity.
  3. A signed agent with no linked customer.
- [ ] **One-click "Run the drop" simulation** so judges can see everything without any API keys.

**You**
- [ ] **By Tue Nov 3:** final designs for all 5 screens, as a Figma link or exported images. These are the designs we stick with.

**Checkpoint, Wed Nov 4**
- [ ] A full drop runs end to end from the terminal: good agent buys, bots get blocked, losers voided, events logged.

---

## Phase 3: Interface and hosting (Thu Nov 5 – Sun Nov 8)

**Claude**
- [ ] **Deploy first (Nov 5):** server on Render, database on Neon, public URL working.
  - Needs: you sign up for Render with GitHub and look for the hackathon credit (Render sponsor page or Discord).
- [ ] Build the 5 screens from your designs (React).
- [ ] Use AG Grid for the live traffic table (sponsor prize target) and update it live as agents arrive.
- [ ] Add the live URL to the PayPal app's Log in with PayPal return URLs.

**You**
- [ ] Review each screen as it lands and send fixes in one list per day.
- [ ] Act as the merchant: run the onboarding and a drop yourself and note anything confusing.

**Checkpoint, Sun Nov 8: feature freeze.** After this, only bug fixes and polish.

---

## Phase 4: Polish and video (Mon Nov 9 – Tue Nov 10)

**Claude**
- [ ] Clone the repo fresh and follow the README exactly. Fix anything that breaks.
- [ ] README: what it is, architecture diagram, how to run, which PayPal APIs and AI tools are used and how, and the sponsor tools (AG Grid, APIMatic).
- [ ] Write the 3-minute video script and shot list.
- [ ] Check the hosted demo works from a fresh browser with no login.

**You**
- [ ] **Nov 9:** record the video with OBS Studio (free). No copyrighted music. Keep it under 3:00.
- [ ] **Nov 10:** upload to YouTube as **Public**.
- [ ] **Nov 10:** make the GitHub repo public and confirm the MIT license shows in the About section.

---

## Phase 5: Submit (Wed Nov 11)

- [ ] Fill in the Devpost submission: name, tagline, description (problem, what it does, how we built it, challenges, what's next), "Built with" tags, repo URL, demo URL, YouTube link.
- [ ] State which AI tools are used and how (required).
- [ ] Select the AG Grid sponsor prize (one sponsor prize can be won) and mention APIMatic usage.
- [ ] Submit, then confirm the "submitted" status on Devpost.
- [ ] Keep the hosted demo running and free until **Dec 15** (judging runs Dec 1–15).

---

## Scope

**Must have:** agent signatures, agent pass, the store tools for agents, risk rules with reasons, drop mode, PayPal authorize/capture/void with the payer cross-check, webhooks, AI explanations, the simulation button, the 5 screens, hosted demo, README, video.

**Only if we're ahead:** Venmo button on the approval page, importing products from PayPal's catalog, a Postman collection.

**Cut order if we fall behind:**
1. Venmo
2. Catalog import
3. Postman
4. AI rule writer (replace with a simple form)
5. Live updates (refresh every few seconds instead)

## Stack
TypeScript (Node) · Hono · PayPal REST APIs and Server SDK · PayPal JS SDK v6 · MCP TypeScript SDK · Vercel AI SDK with Gemini · Postgres (Neon) with Drizzle · React (Vite) · AG Grid · Render
