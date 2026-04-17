# Elan Financial Services Agent-Bank Targets

**What this is:** Every bank or credit union that outsources its credit card issuance to **Elan Financial Services** (a division of U.S. Bank) is a prime Brim BD target. Elan is the largest US agent-bank issuer — they partner with **1,300+ financial institutions**, issuing cards in those banks' names while running all the backend (underwriting, marketing, servicing, portfolio management). Switching costs exist but the posture is right: they've already decided to outsource.

**Quick facts about Elan** (U.S. Bancorp IR + Elan news pages, 2024-2025):
- ~1,300 partner institutions total (not publicly listed)
- 50+ new partners added in 2024
- 62 new partners added in 2025 (1,105 new branches, 1.8M potential cardmembers)
- 2025 strategic alliance with Fiserv's Credit Choice (integration coming in 2025)
- Servicing portal at `card.myaccountaccess.com`

**How these were identified:** Unlike FNBO which centralizes partner pages at `card.fnbo.com/mpp/fi/<slug>/`, Elan's partner cards live on each partner bank's own website. The canonical disclosure text *"Creditor and Issuer of the card is Elan Financial Services, pursuant to a license from Visa U.S.A. Inc."* appears in card T&Cs. Enumeration method: Google for this phrase + variants.

**Coverage caveat:** 8 confirmed matches below out of 1,300 total Elan partners. This is a **starting set** assembled from ~30 minutes of targeted searches. The discovery methodology is reproducible — more partners can be added with additional searches, and Elan's news pages + individual bank press releases are a future source. **~95% of Elan's partner base is still unexplored.**

**Last updated:** 2026-04-17

---

## In-cohort Elan agent banks ($10B-$250B ICP)

These are the **primary Brim targets**.

| # | Bank | State | Assets | CC Loans | Tier | Score | BD Note |
|---|---|---|---:|---:|---|---:|---|
| 1 | 🔵 **Columbia Bank (Umpqua)** | OR | $66.8B | — | **B** | 47 | Columbia Banking System (NASDAQ: COLB). Confirmed via business credit card page. Large regional bank with significant commercial customer base — card program modernization would land on real volume. |
| 2 | 🟡 **Renasant Bank** | MS | $26.7B | — | C | 38 | Holding: Renasant Corp (NASDAQ: RNST). Commercial One Card also powered by Elan (travel + purchasing). **Dual-product Elan relationship** — if Brim could replace both consumer + commercial, that's a bigger swing than most Elan targets. |
| 3 | 🟡 **Provident Bank (NJ)** | NJ | $24.9B | — | C | 38 | Holding: Provident Financial Services (NYSE: PFS). **Multi-vendor complication**: Provident also had a 2020 commercial-payments partnership with First Bankcard. May be running Elan for consumer + FBC for commercial. Worth confirming the current split during discovery. |
| 4 | 🟡 **Associated Bank** | WI | $45.1B | $201M | C | 37 | Holding: Associated Banc-Corp (NYSE: ASB). **Most recent Elan win** — 2025 strategic partnership announced for consumer + commercial credit cards. Contract is fresh, so switching-friction argument is harder; but also means you can ask them why they picked Elan and learn what Brim would need to beat. |

---

## Below-cohort Elan agent banks ($1B-$10B)

Still valid if Brim wants to stretch below the $10B ICP floor:

| # | Bank | State | Assets | Tier | Score | Note |
|---|---|---|---:|---|---:|---|
| 1 | Preferred Bank | CA | $7.6B | D | 22 | LA-area business-focused bank. Elan for business cards. |
| 2 | Macatawa Bank, N.A. | MI | $3.7B | D | 22 | Holland, MI community bank. Elan for personal. |
| 3 | First Independence Bank | MI | $0.7B | C | 35 | Detroit MDI (Minority Depository Institution). Elan announced as partner via their own 2024 press release. |
| 4 | Citizens Deposit Bank of Arlington | KY | $0.3B | D | 22 | Small KY community bank, dedicated "ELAN Credit Cards" landing page on their site. |

---

## Elan partners NOT in our institutions table (credit unions)

These CUs are confirmed Elan partners in the research but don't map to our `institutions` rows via name match (likely because NCUA data normalizes/truncates names). Worth adding to scoring separately:

- **BluPeak Credit Union** (California)
- **CorePlus Credit Union**
- **Connexus Credit Union**
- **Gold Coast Federal Credit Union**
- **Mokelumne Federal Credit Union** (California)
- **Envision Credit Union** (Florida — featured in Elan's 2024 news)

---

## Confirmed-but-ambiguous matches (pending verification)

These name patterns surfaced in the search but have too many candidate matches in the DB to tag automatically:

- **Gateway Bank** — the search result pointed to `gateway.bank` (a Mesa, AZ institution). None of the Gateway Bank entries in our DB match that domain. Not tagged.
- **First State Bank** — 60+ active banks with this name in our DB. The search-result URL was `fsbfinancial.com` (KS/MO). Would need to manually match — not tagged.
- **Columbia Bank (NJ)** — separate from Columbia Banking System (OR). Columbia Financial in NJ may also be an Elan partner; not verified.

---

## BD playbook for Elan agent-bank targets

**The macro unlock, same as FNBO:** these banks have already chosen to outsource. The conversation is vendor-vs-vendor, not build-vs-buy.

**Differentiators to lead with vs. Elan:**

1. **Fresh alternative after Elan-Fiserv integration.** Elan announced a major platform integration with Fiserv's Credit Choice in 2025. If the bank is on the old Elan stack, they're about to go through a migration anyway — and migration-time is exactly when switching vendors becomes possible.

2. **Revenue share economics.** Elan's standard partner economics have been in market for 50+ years. Brim can position as newer = more flexible on splits, especially for banks adding commercial/co-brand products that Elan doesn't do as well as consumer.

3. **Product depth in commercial / co-brand.** Elan's strength is consumer "templates" (cash back, travel, secured). For a bank wanting a sophisticated co-brand or premium business product, Elan's catalog is thinner than Brim's.

4. **Direct-servicing UX.** Cardholders interact with Elan's portal (myaccountaccess.com), not the partner bank's online banking. Banks that want **unified online banking** (cards + deposits + loans in one experience) will hear Brim differently.

5. **Renewal-window timing.** Elan contracts are multi-year. Ask what the renewal schedule looks like. Associated Bank's 2025 signing suggests their Elan deal runs through ~2028-2030.

**Opening hook template:**
> "I noticed your credit card program runs through Elan. With the Elan-Fiserv integration announcement, there's a forced migration window coming — worth a conversation about what your roadmap looks like on the card side?"

Or for banks not in the Fiserv migration path:
> "Your card program through Elan — curious what the contract renewal timeline looks like. We help banks evaluate vendors ahead of those decisions."

---

## FNBO vs. Elan at a glance

| | FNBO / First Bankcard | Elan Financial Services |
|---|---|---|
| Parent | First National Bank of Omaha | U.S. Bank (U.S. Bancorp) |
| Partners | ~90 financial institutions | ~1,300 financial institutions |
| Portal structure | Central `card.fnbo.com/mpp/fi/<slug>/` | Distributed across partner sites |
| Discovery method | `site:card.fnbo.com/mpp/fi/` | Disclosure-phrase Google search |
| Co-brand strength | Heavy (Amtrak, MGM, Jeep, BP, Scheels) | Moderate |
| Recent news | Expanded commercial product suite | 2025 Fiserv Credit Choice integration |
| Typical partner size | $5-50B community banks | $1-100B range, CU-heavy |

**If I were running BD:** target both platforms, but **FNBO may be easier to penetrate first** because their platform is older and more legacy. Elan is larger but currently better-positioned due to the Fiserv integration hype.

---

## Maintenance notes

- **To expand this list**: run more Google searches for the Elan disclosure phrase variants listed in the plan. Each search yields 2-5 new partners. Also check:
  - `cupartnership.com/about-elan.html` — a CU-focused aggregator that lists Elan's CU partners
  - `elanfinancialservices.com/credit-card/news-and-community/*` — Elan's own press releases occasionally name specific partners
  - Individual bank press release archives — search `"[bank name]" Elan Financial partnership`
- **To verify an existing tag**: visit the partner bank's credit-card page and look for the "Creditor and Issuer of the card is Elan Financial Services" disclosure.
- **Signal facts in DB**: each tagged bank has `signal.agent_bank_dependency='elan_financial'` (confidence 95, source_kind='official'). Scoring weight applies 1.0x (same as TCM, FNBO, and other true agent-bank vendors).
