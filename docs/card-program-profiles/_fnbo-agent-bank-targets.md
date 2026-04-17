# FNBO / First Bankcard Agent-Bank Targets

**What this is:** Every bank that outsources its credit card issuance to First National Bank of Omaha's "Card by FNBO" / First Bankcard agent-bank platform is a prime BD candidate — they're already running a card program through a third party, which means the conversation is about **vendor economics** rather than **build vs. buy**. These are the lowest-friction Brim modernization targets.

**How they were identified:** FNBO's own portal at `card.fnbo.com/mpp/fi/<bank-slug>/` exposes a unique landing page for each agent-bank partner. Discovered via Google's `site:card.fnbo.com/mpp/fi/` index. This is authoritative disclosure — the URL is served by FNBO itself.

**Coverage caveat:** FNBO claims ~90 financial-institution partners (plus 100+ co-brand/affinity partners for ~200 total). This list has **12 confirmed** matches in our institutions table. The remaining ~78 are not yet discovered — this list is a **starting point, not comprehensive**. More FBC partners can be added via (a) searching `site:card.fnbo.com/mpp/fi/` with different terms, (b) scanning individual community bank T&Cs for "issued by First National Bank of Omaha", or (c) purchasing Nilson Report agent-bank rankings.

**Last updated:** 2026-04-17

---

## In-cohort FNBO agent banks ($10B-$250B ICP)

These are the **primary Brim targets**. They have the scale to justify a card-program modernization investment and are already paying FNBO for agent services.

| # | Bank | State | Assets | Tier | Score | BD Note |
|---|---|---|---:|---|---:|---|
| 1 | **Glacier Bank** | MT | $32B | 🔵 B | 47 | Holding co: Glacier Bancshares. FNBO agent despite being one of Montana's largest banks — they prioritize community-bank operations over owning card infrastructure. Prime target. |
| 2 | **Apple Bank** | NY | $19B | 🟡 C | 34 | 70+ branches in the NY metro area. Consumer + business Visa products via FNBO. Never built in-house. |
| 3 | **Community Bank, N.A.** | NY | $17B | 🟡 C | 34 | Upstate NY community bank network. Consumer Visa + business Mastercard via FNBO. |
| 4 | **Bank OZK** | AR | $41B | 🟡 C | 25 | Highly sophisticated CRE lender. Offers consumer + business Visa via FNBO — unusual that such a commercial-focused bank outsources cards. |
| 5 | **Stellar Bank** | TX | $11B | 🟡 C | 25 | Houston-area community bank formed via Allegiance + CommunityBank of Texas merger. Inherited FBC relationship from Allegiance. Consumer Visa + business via FNBO. |
| 6 | ⚠️ **Flagstar Bank** | NY | $88B | 🔴 F | 14 | **Has active OCC enforcement order (2024)** — don't lead with BD here. Post-NYCB merger and recent regulatory friction. Monitor for enforcement resolution before pursuing. |

---

## Below-cohort FNBO agent banks ($1B-$10B)

These are still valid targets if Brim wants to stretch below the $10B ICP floor (e.g., for smaller community bank wins). They're smaller but the agent-bank unlock is identical.

| # | Bank | State | Assets | Tier | Score | BD Note |
|---|---|---|---:|---|---:|---|
| 1 | **Arrow Bank, N.A.** | NY | $4.4B | 🟡 C | 35 | Arrow Financial Corp holding co (NASDAQ: AROW). Glens Falls, NY. Consumer Visa via FNBO. |
| 2 | **Amerant Bank, N.A.** | FL | $9.8B | 🟠 D | 22 | Miami, mostly Latin American customer base. Business Visa via FNBO. |
| 3 | **International Bank of Commerce (TX-19629)** | TX | $9.8B | 🟠 D | 22 | Largest IBC entity in the group. Consumer + business Visa via FNBO. |
| 4 | **Amalgamated Bank** | NY | $8.9B | 🟠 D | 22 | Union-owned, progressive-bank positioning. Consumer + business Mastercard via FNBO. |
| 5 | **IBC Bank (cert 25679)** | TX | $4.4B | 🟠 D | 22 | Smaller IBC entity in the group. |
| 6 | **Gate City Bank** | ND | $4.0B | 🟠 D | 22 | North Dakota community bank. Consumer Visa via FNBO. |

---

## Confirmed FNBO partners NOT in our institutions table

These need to be added to the database or matched to differently-named entries before they can be scored:

| Slug | Display Name | Status |
|---|---|---|
| `ppb` | Pacific Premier Bank | Not in DB — was merged into Columbia Banking System (Sep 2025). Their FBC relationship may or may not have survived the merger. |
| `nycb` | New York Community Bank | Merged into Flagstar Financial (cert 32541 — already tagged above). |
| `allegiance` | Allegiance Bank | Merged into Stellar Bank (cert 58629 — already tagged above). |

---

## BD playbook for FNBO agent-bank targets

**The macro unlock:** these banks have all made the "we don't want to build this ourselves" decision. You don't have to convince them; you just have to convince them you're a better vendor than FNBO/First Bankcard.

**What to lead with:**
1. **Product breadth** — FBC offers ~4 standard templates (Evergreen, Getaway, Secured, etc.) that get white-labeled per partner. Brim's product library is materially more flexible for co-brand and segment-specific cards.
2. **Revenue share economics** — ask what their current revenue share looks like. FBC keeps the lion's share; Brim's partner economics can be positioned as more favorable.
3. **Tech stack modernization** — FBC's platform is mature but not cutting-edge. If the bank has a digital-first strategy or is investing in mobile / fintech partnerships, Brim's API-first architecture is a real differentiator.
4. **Renewal-window timing** — agent-bank contracts are typically 3-5 year terms. Worth asking about contract expiration during discovery.

**What to NOT lead with (applies to all these targets):**
- "Build your own in-house program" — if they wanted to, they already would have. The ask is vendor-vs-vendor.
- "Modernize your core" — that's a separate conversation. Card program is orthogonal to core banking.

**Opening hook template:**
> "I saw you're running your card program through First Bankcard / FNBO. We work with banks in similar positions who wanted more flexibility on [product design | revenue share | tech integration] than what the FBC standard templates deliver. Worth a 20-minute conversation?"

---

## Maintenance notes

- **To expand this list:** run more `site:card.fnbo.com/mpp/fi/` searches with different keyword combinations to surface additional slugs. The URL pattern `card.fnbo.com/mpp/fi/<slug>/consumer/web-visa` or `...business/web-visa` is the canonical source-of-truth.
- **To verify a contact is still active:** visit `card.fnbo.com/mpp/fi/<slug>/` directly. If the page loads with card products, the partnership is live. If it redirects to the root FNBO site, the partnership may have ended.
- **Signal facts in DB:** each bank has `signal.agent_bank_dependency = 'fnbo'` with confidence 95 and `source_url` pointing to their specific `mpp/fi/<slug>/` URL. The scoring weights this at 1.0x (maximum) for BD priority.
