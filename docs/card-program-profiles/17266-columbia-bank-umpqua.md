# Columbia Bank (OR — Columbia Banking System / ex-Umpqua / + Pacific Premier)

- **Cert:** 17266 · **Holding Co:** Columbia Banking System Inc (NASDAQ: COLB)
- **Assets:** $66.8B (pre-Pacific Premier; combined company is ~$85-90B post-merger)
- **HQ:** Tacoma, WA (legacy Columbia) / Portland, OR (legacy Umpqua)
- **Brim Fit:** B-tier (47) · **Profile last updated:** 2026-04-17

## Credit card program — Agent bank via Elan Financial Services

**Model:** `agent_bank`
**Vendor:** Elan Financial Services (U.S. Bancorp subsidiary)
**Confidence:** 95

Columbia Bank's consumer and business credit cards are issued by Elan Financial Services. Their business credit card page's own fine print carries the standard Elan disclosure: *"Credit cards offered through Elan Financial Services are not FDIC insured."*

**Known product lineup (pre-2025 merger, subject to post-merger portfolio review):**

| Product | Network | Type |
|---|---|---|
| Columbia Bank Zero+ Card | Visa (Elan template) | Balance transfer / credit-builder |
| Columbia Bank Visa Platinum | Visa | Standard consumer |
| Columbia Bank Visa Rewards | Visa | Consumer rewards |
| Columbia Bank Business Visa | Visa | Business (standard Elan business template) |

**Evidence:**
- https://www.columbiabank.com/business-banking/credit-cards/ (Elan disclosure in fine print)
- https://wallethub.com/d/umpqua-bank-visa-platinum-card-1397c (WalletHub confirms Visa Platinum as Umpqua→Columbia legacy product)

## Debit card program — Self-issued

**Issuer:** Columbia Bank (direct debit issuance tied to checking accounts)
**Network:** Visa (confirmed — customers received "Umpqua Bank Visa debit cards" in the 2023 Columbia+Umpqua merger; now rebranded Columbia debit cards)

## Commercial card program — DIRECT Visa partnership (distinct from Elan)

**Product:** Visa Commercial Preferred Solution
**Partner:** Visa (launched ~2023 under Umpqua brand)
**Issuer:** Columbia Bank directly (this is NOT on Elan's platform)

This is an important nuance: **Columbia runs a HYBRID card strategy**:
- Consumer + small-business credit → **Elan**
- Commercial / middle-market corporate cards → **self-issued via direct Visa partnership**

Source: https://www.columbiabank.com/blog/umpqua-bank-announces-collaboration-with-visa-to-launch-new-commercial-card-solutions-for-the-middle-market/

This hybrid split is itself a BD insight — they've already made the "build it ourselves" decision for commercial. Consumer is still outsourced to Elan.

## Network principal status

- **Visa:** Almost certainly principal (they run a direct Visa Commercial Preferred program). Confidence 85.
- **Mastercard:** No Mastercard products surfaced in research. Likely not MC principal. Confidence 70.

## Recent news (last 2 years)

- **Sept 2, 2025:** Closed acquisition of Pacific Premier Bancorp ($2.0B deal). Adds SoCal footprint, +$20B assets, +$16B in deposits. Combined company ~$85-90B.
- **Sept 2025:** Unified brand under "Columbia Bank" — retired the Umpqua Bank name after only ~2 years of using it (the 2023 Columbia+Umpqua merger branded everything "Umpqua" but this 2025 move reversed it).
- **2023:** Direct Visa partnership for middle-market commercial cards (launched under Umpqua brand).
- **Three integrations in three years** (CBS+Umpqua 2023 → Umpqua→Columbia rebrand 2025 → +Pacific Premier 2025). This is a management team doing heavy platform work.

## Network principal status

- **Visa:** Yes (direct Visa Commercial partnership implies principal status). Confidence 85.
- **Mastercard:** Not evident. Confidence 70 (no).
- **Amex:** Not evident.

## BD assessment — **prime target**

**Rationale:** Columbia has a *perfect profile* for Brim BD:

1. **Post-M&A integration window is wide open.** Just closed Pacific Premier (Sept 2025). Integration of Pacific Premier's card portfolio onto Columbia's platform happens over the next 12-24 months. Vendor consolidation conversations are live.
2. **Already hybrid.** They've proven willing to split consumer (Elan) vs commercial (direct with Visa). That's a bank with sophistication and internal opinions. They could add Brim for specific segments (premium consumer, new digital sub-brand, or white-label for their business banking clients).
3. **Elan relationship is pre-merger Umpqua** — multi-year contract probably renewing in the 2025-2027 window. With Pacific Premier integration, they'll re-evaluate ALL vendor contracts. Timing is good.
4. **Sophisticated buyer.** $85B+ bank with a direct Visa relationship already. They're not the typical ICBA community-bank agent-bank-migration target — they're closer to a peer discussion about platform capabilities.
5. **West Coast geography aligns with Brim's fintech-adjacent customer base.**

**Opening hook — post-merger angle:**
> "Congrats on closing Pacific Premier. Most banks go through a platform rationalization in year 1-2 post-merger. Elan for consumer + direct Visa for commercial is a solid split — curious whether you're looking at the consumer program during integration, and if there's a version of that conversation where we can add value."

**Opening hook — commercial-extension angle:**
> "You've already built direct Visa commercial cards. When you're ready to modernize the consumer side off Elan, or launch a Columbia-branded SMB card that sits between the two, we should talk."

## Gaps / what to verify live

- **Pacific Premier's pre-merger card program** — what were they on, and where does it go post-integration? Pacific Premier was on FNBO's MPP platform (per our earlier research — I saw `card.fnbo.com/mpp/fi/ppb/` in the scrape). So Columbia now owns a THIRD legacy relationship (Elan + direct Visa + inherited FNBO). Platform rationalization may consolidate all three.
- **Post-merger total card loans** — not in our FDIC data yet (next quarterly update will show combined figures).
- **Specific Elan contract expiration date** — not disclosed publicly; discovery-stage question during BD outreach.
- **Brand consolidation status** — how much of the Pacific Premier customer base has fully rebranded to Columbia vs. still using legacy Pacific Premier materials.
