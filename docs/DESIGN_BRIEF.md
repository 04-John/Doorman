# Doorman: design brief

This is everything you need to design Doorman in Figma. Claude builds from the same document, so if you change something in the design, note it in Figma and we'll update this file.

---

## 1. What Doorman is, in one minute

AI agents (shopping assistants built into ChatGPT, Gemini, browsers and so on) are starting to buy things for people. A small store can't tell a real customer's assistant from a scalper bot. Doorman is the **checkpoint at the store's door**:

- **Good agents get in.** An agent working for a real, verified PayPal customer carries an **agent pass**. Doorman checks it and lets the agent shop.
- **Bad bots stay out.** Unknown bots, bots hammering the store, and agents breaking the store's rules are **slowed down or blocked**.
- **The customer stays in control.** Every purchase ends with the customer **approving the payment in PayPal**. Doorman then checks the person who paid is the person who linked the agent.

**The demo story** (this is what the video and judges see):
1. A small streetwear brand, **Static Supply**, drops **50 Night Shift Hoodies** at $68.
2. Three kinds of agents arrive:
   - **Ava**, a shopping assistant working for John Doe, with a valid agent pass. She gets in, John approves in PayPal, and the hoodie is his.
   - **A swarm of scalper bots** with no identity, trying to buy 40 hoodies. They're slowed down, then blocked.
   - **Kestrel**, an agent that signs its requests properly but isn't linked to any customer. Doorman pauses it until a real customer confirms it in PayPal.
3. The merchant watches it all live on the dashboard, with a plain-English reason for every decision.

---

## 2. Who uses it

| Person | What they want | Where they are in Doorman |
|---|---|---|
| **Merchant** (Maya, owns Static Supply) | Sell to real customers' agents, stop bots, understand what happened | Onboarding, Dashboard, Decision detail, Rules |
| **Customer** (John Doe) | Let his AI assistant shop for him safely, with limits he controls | Link your agent, My passes, Approve purchase |
| **Judges** (PayPal developers, sponsor engineers) | Understand it in 30 seconds and see it work without setup | Demo hub, then the Dashboard |

The merchant side is a **desktop** web app. The customer side is **mobile-first**, because approval links are usually opened on a phone.

---

## 3. Words we use (keep these exact in the UI)

**Identity: who the agent is.** Every visitor gets one of three labels:

| Label | Meaning | Suggested look |
|---|---|---|
| **Verified customer** | Signed agent with a valid pass from a verified PayPal account | Strongest, trustworthy (e.g. filled badge + shield icon) |
| **Signed agent** | Signs its requests, but no customer has linked it yet | Neutral (outline badge + key icon) |
| **Unknown** | No signature; could be anyone | Muted or warning (grey or dashed badge + question icon) |

**Decision: what Doorman did.** Every request gets one of four:

| Label | Meaning | Suggested colour family |
|---|---|---|
| **Allowed** | Let through | Green |
| **Step up** | Paused until the customer confirms the agent in PayPal | Amber |
| **Throttled** | Slowed down for sending too many requests | Orange or purple |
| **Blocked** | Refused | Red |

Never show a decision by colour alone. Always use **colour + icon + word** for colour-blind users and so it reads in the video.

**Money words.** Use plain words in the main UI and technical words in detail panels, because the PayPal judges like seeing the real terms:

| Plain (main UI) | Technical (detail panels) |
|---|---|
| **Held**: money reserved, not charged yet | Authorized |
| **Charged** | Captured |
| **Released**: hold cancelled, no money moved | Voided |

**Other terms**
- **Agent pass**: permission a customer gives their agent, with a spending cap and an expiry date. The customer can revoke it any time.
- **Drop**: a limited release (50 hoodies, 1 per customer).
- **Payer match**: whether the PayPal account that paid equals the one that linked the agent. A mismatch means the hold is released.

---

## 4. Screens

Design them in this priority order: the first four matter most.

| # | Screen | Side | Frame size | Priority |
|---|---|---|---|---|
| 1 | Live agent dashboard | Merchant | Desktop 1440×900 | **Highest**: the hero of the video |
| 2 | Decision detail (side panel over the dashboard) | Merchant | Desktop | High |
| 3 | Approve purchase | Customer | Mobile 390×844 | High |
| 4 | Link your agent + My passes | Customer | Mobile 390×844 (also check desktop) | High |
| 5 | Merchant onboarding + Rules | Merchant | Desktop | Medium |
| 6 | Storefront | Public | Desktop (mobile optional) | Low: keep it simple |
| 7 | Demo hub (landing page for judges) | Public | Desktop | Low: one simple page |

### Screen 1: Live agent dashboard (hero)

**Purpose:** the merchant sees every agent at the door in real time and what Doorman did about it.

**Content, top to bottom**
- **Top bar:**
  - Doorman logo
  - Store name "Static Supply"
  - A small **"Sandbox demo, no real money"** tag
  - Nav: Dashboard · Rules · Settings
- **Drop status strip:**
  - "Night Shift Hoodie drop · LIVE"
  - Stock counter **41 / 50 left** (a progress bar works well)
  - Time since the drop started
  - A **"Run the drop" button**: starts the simulation for judges. It's the most important button on the page; make it obvious.
- **KPI tiles** (sample numbers): Agents seen **14** · Allowed **44** · Step up **2** · Throttled **20** · Blocked **30** · Awaiting approval **$136** · Held **$0** · Charged **$68**
  - These are close to what a real simulated drop produces.
  - Agent purchases wait for the customer to approve in PayPal, so "Awaiting approval" matters. It's the money agents have asked for that customers haven't approved yet.
- **Live traffic table** (the main element; built with AG Grid, see section 7):
  - **Columns:** Time · Agent (name, or "Unknown") · Operator · Identity badge · Customer (masked, e.g. "John D.") · Action (Browsed / Added to cart / Checkout / Paid) · Decision badge · Reason (short) · Amount
  - **Behaviour:**
    - New rows appear at the top while the drop runs, with a subtle highlight on new rows.
    - Clicking a row opens Screen 2.
    - Filters above the table: Decision (All / Allowed / Step up / Throttled / Blocked) and Identity (All / Verified customer / Signed agent / Unknown).
- **Optional side widget:** "Top blocked sources" or a small requests-per-second sparkline. Only if it fits.

**States to design**
1. **Before the drop:** empty table with an explanation, "No agents yet. Press Run the drop to simulate launch traffic", and KPIs at 0.
2. **Drop live:** table filling up (the main frame).
3. **Drop sold out or ended:** banner "Sold out in 2m 14s · 50 sold to 50 verified customers · 31 bots blocked".

### Screen 2: Decision detail (side panel)

**Purpose:** answer "why did Doorman do this?" for one request. It slides in from the right over the dashboard.

**Content**
- **Header:**
  - Decision badge (big)
  - One-line reason, e.g. "Allowed: verified customer, within their $150 cap"
- **Agent card:**
  - Name ("Ava")
  - Operator ("Demo Assistant Co.")
  - Identity badge
  - Signature: ✓ Valid / ✗ Invalid (with reason)
  - Key ID (short, monospace, e.g. `8f3k…Q2a`)
  - First seen
- **Pass card** (only when there's a pass):
  - Customer ("John Doe", "Verified PayPal account" ✓)
  - Cap "$150 per purchase"
  - Used "$68 of $150"
  - Expires "in 6 days"
  - Status: Active / Revoked
- **Checks list:** each line ✓ pass / ✗ fail / – not applicable:
  - Signature valid
  - Agent pass valid and not expired
  - Within spending cap
  - Drop limit (1 per customer)
  - Request rate normal
  - Payer match (after approval in PayPal)
- **"Why Doorman did this":** a short AI-written paragraph. Sample: *"Ava is signed with a registered key and carries a pass from John Doe, whose PayPal account is verified. The $68 hoodie is within his $150 cap and he hasn't bought one yet, so Doorman let the checkout through. John approved in PayPal, the payer matched his pass, and the payment was charged."*
- **Timeline:** Browsed → Added to cart → Checkout → Customer approved in PayPal → Held $68 → Charged $68 (or Released).
- **PayPal references** (small, technical): Order ID, Authorization ID, Capture ID.
- **Actions:**
  - "Block this agent" (destructive)
  - "Release hold" (only while held)

**States to design**
1. **Allowed + charged** (Ava)
2. **Blocked** (unknown scalper bot): no pass card. Reason: "Unknown agent tried to check out during a drop".
3. **Payer mismatch:** reason "Approved by a different PayPal account than the pass holder. Hold released." Payer match ✗.

### Screen 3: Approve purchase (customer, mobile)

**Purpose:** the customer's agent tried to buy something, and the customer approves or declines. This page is opened from a link the agent sends.

**Content**
- Store name and Doorman mark ("Protected by Doorman")
- **Who's buying:** "**Ava** (Demo Assistant Co.) wants to buy this for you"
- **Product:** image, name "Night Shift Hoodie", size, **$68.00**
- **Your limits:** "Within your $150 cap · Pass expires in 6 days"
- **PayPal button:** leave a placeholder **at least 300×48 px**. The real button is drawn by PayPal's code, so we can't restyle it beyond yellow/blue/white and rounded/square.
- **Decline** link: "This isn't me / Decline"

**States to design**
1. **Ready to approve** (above)
2. **Step up**, for an agent without a pass (Kestrel):
   - "An agent called **Kestrel** wants to buy for you. Doorman doesn't know it yet."
   - Step 1: **Log in with PayPal** to confirm it's yours.
   - Step 2: approve the payment.
3. **Held:** "Payment held. Doorman is confirming your order…" (a few seconds)
4. **Charged:** "Done. Your Night Shift Hoodie is on its way."
5. **Released (mismatch):** "This was approved by a different PayPal account than the one linked to Ava. We released the hold, so no money was taken."
6. **Declined / expired:** "Cancelled. Nothing was charged."

### Screen 4: Link your agent + My passes (customer, mobile-first)

**Purpose:** a customer gives their AI assistant permission to shop at this store, with limits.

**How it starts:** the customer's agent asks to be linked and sends them a link (like "Connect your account" in other apps). The customer opens it, so the agent is already known when the page loads.

**Link flow, 3 steps on one page or a short stepper**
1. **Log in with PayPal**: use PayPal's official button style, leave a placeholder. After login show "Logged in as John Doe · Verified PayPal account ✓".
2. **Confirm your agent:** a card saying "**Ava** (Demo Assistant Co.) is asking to shop for you at Static Supply", with the agent's name, operator and an icon. This is a confirmation, not a picker.
3. **Set limits:**
   - Spending cap per purchase: $50 / $150 / $300 / custom
   - Expires: 24 hours / 7 days / 30 days
   - Then a **Create pass** button.

**Then:** a success state with a **pass card** summary (agent, cap, expiry, "You can revoke this any time").

**My passes**
- A list of pass cards: Agent · Store · Cap · Used so far · Expires · Status
- A **Revoke** button on each pass, with a confirmation: "Ava will no longer be able to buy for you at Static Supply."
- A revoked pass shows greyed out with a "Revoked" label.

**States to design:** not logged in · logged in · pass created · passes list · revoked pass · link expired ("This link has expired. Ask your agent for a new one.") · login failed ("PayPal login didn't complete. Try again.")

### Screen 5: Merchant onboarding + Rules

**Purpose:** make the store agent-ready in 3 steps. Keep it short; it's mainly shown once in the video.

1. **Connect PayPal:** "Connected to PayPal sandbox ✓ (Static Supply business account)".
2. **Your products:** shows the 3 products and lets the merchant mark one as a **drop** (limit per customer, stock).
3. **Your rules in plain English:**
   - A text box. Sample: *"During drops, one hoodie per verified customer. Unknown bots can browse but never buy. Agents without a pass need the customer to confirm. Slow down anyone sending more than 20 requests a minute."*
   - A **"Turn into rules"** button. The AI converts the text into **rule cards** the merchant reviews, each with a toggle and the exact setting:
     - "Drop limit: 1 per customer"
     - "Unknown agents: browse only"
     - "Signed agents without pass: step up"
     - "Rate limit: 20 requests/minute → throttle"
   - **Save rules**

**The Rules page** (from the nav) is the same rule cards, editable.

**States:** step 1–3 frames · AI converting (loading) · rule cards to confirm · saved.

### Screen 6: Storefront (public)

**Purpose:** shows the store is real and invites customers to link their agent. One simple page.

- Store header "Static Supply"
- A hero for the **drop**: Night Shift Hoodie, $68, "Drop live · 41 left"
- 3 product cards (Night Shift Hoodie $68, Static Tee $32, Signal Cap $28)
- Badge: **"Agent-ready · Protected by Doorman"**
- A section "Shop with your AI assistant", with 3 short steps and a **Link your agent** button that goes to Screen 4

### Screen 7: Demo hub (landing page for judges)

**Purpose:** judges arrive at the demo link with no context. This page orients them in 10 seconds.

- One-line pitch: **"Let real customers' AI agents in. Keep scalper bots out."**
- 3 steps: Agent arrives → Doorman checks who it works for → Customer approves in PayPal
- Big button: **Open the live demo** (goes to the Dashboard). Secondary: **Try it as a customer** (goes to Screen 4).
- Small "Sandbox demo, no real money" note and a link to the GitHub repo

---

## 5. Flows (for linking frames in a Figma prototype)

- **A. Judge:** Demo hub → Dashboard (empty) → Run the drop → Dashboard (live) → click a row → Decision detail
- **B. Customer links agent:** (agent sends a link) → Link your agent → (PayPal login, an external page) → Confirm agent + set limits → Pass created → My passes. Customers can also reach "My passes" from the Storefront.
- **C. Agent buys:** (agent checks out) → Approve purchase → (PayPal popup, external) → Held → Charged
- **D. Unknown agent:** Approve purchase (step up) → Log in with PayPal → Approve → Held → Charged
- **E. Merchant setup:** Onboarding 1 → 2 → 3 → Dashboard

We don't design PayPal's own screens (login, payment popup). Show them as a simple "PayPal" placeholder frame in the prototype.

---

## 6. Sample data (use in the designs so they look real)

**Store:** Static Supply

**Products**
| Product | Price | Stock | Drop |
|---|---|---|---|
| Night Shift Hoodie | $68 | 50 | Yes, 1 per customer |
| Static Tee | $32 | 200 | No |
| Signal Cap | $28 | 120 | No |

**Agents**
| Agent | Operator | Identity | Notes |
|---|---|---|---|
| Ava | Demo Assistant Co. | Verified customer (John Doe, $150 cap, 7 days) | |
| Kestrel | Northwind Labs | Signed agent (no pass) | |
| *(unnamed)* | — | Unknown | ~40 requests in 10 seconds, the scalper swarm |
| Juniper | Brightline AI | Verified customer (Priya S., $300 cap) | A second good agent, to show it's not just one |

**Sample reasons** (short versions go in the table column)
| Decision | Reason |
|---|---|
| Allowed | "Verified customer, within $150 cap" |
| Step up | "Signed agent with no linked customer" |
| Throttled | "48 requests in 10 seconds" |
| Blocked | "Unknown agent tried to check out during a drop" |
| Blocked | "Second hoodie for the same customer (limit 1)" |
| Released | "Paid from a different PayPal account than the pass holder" |

**Sample IDs** (monospace)
- Order `9A316864BP517031P`
- Authorization `55P457165L5495408`
- Key `8f3kQ…v2Qa`

---

## 7. Visual and technical guidelines

- **Mood:** calm, trustworthy, precise. Think "security desk" or "air traffic control", not "hacker green-on-black". Light or dark theme is your call. If dark, check the badge colours still read clearly.
- **Brand:** Doorman has its own name and logo. **Don't use PayPal's logo or colours as Doorman's brand.** PayPal elements appear only as PayPal's official buttons, plus text like "Log in with PayPal".
- **The table is AG Grid** (a sponsor; we're targeting its prize):
  - Design it as a real data grid: row height 40–48 px, sticky header, sortable columns.
  - Custom cells are a plus for the prize: badge cells, an agent cell with an avatar or icon, an amount cell.
  - AG Grid can be fully themed (colours, fonts, borders, row hover), so style it to match your design rather than leaving it plain.
- **Video legibility:** the dashboard will be recorded at 1920×1080. Keep body text ≥ 14 px and table text ≥ 13 px, and make the badges large enough to read in the video.
- **Accessibility:** colour + icon + label on every status, WCAG AA contrast, visible focus states on buttons.
- **Components to make** (as Figma components, so the build matches):
  - Identity badge (3 variants)
  - Decision badge (4 variants)
  - KPI tile
  - Stock counter
  - Agent card
  - Pass card
  - Check row (✓/✗/–)
  - Timeline item
  - Rule card (with toggle)
  - Buttons (primary / secondary / destructive)
  - Toast
  - Empty state
  - "Sandbox demo" tag
  - PayPal button placeholder

---

## 8. Hand-off

- **Frame names:** number them like the screens, e.g. `1 Dashboard / Live`, `2 Detail / Blocked`, `3 Approve / Step up`.
- **Getting the designs to Claude:** Claude can't open claude.ai/design links directly, since they need your login.
  - **Preferred:** use Claude Design's export or download option (HTML or a ZIP) and save the files into `C:\Users\USER\doorman\design\`. Claude reads them from there and matches them closely.
  - **Fallback:** a full-size screenshot of every screen and state, saved in the same folder.
- **Deadlines:**
  - **Sun Nov 1:** Screen 1 (Dashboard) and its components, so the build can start.
  - **Tue Nov 3:** everything else.
