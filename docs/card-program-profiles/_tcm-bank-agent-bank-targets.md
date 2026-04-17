# TCM Bank, N.A. Agent-Bank Targets

**What this is:** Every bank that outsources its credit card issuance to **TCM Bank, N.A.** (the credit-card subsidiary of ICBA Payments, which is the payments services arm of the Independent Community Bankers of America) is a prime Brim BD candidate. TCM is a limited-purpose bank — credit cards are their only product, so they have no conflicting interest in cross-selling — but a Brim win from a TCM client bank is a direct substitution.

**Quick facts about TCM Bank:**
- Subsidiary of ICBA Payments (itself a subsidiary of ICBA)
- **750+ community bank partners**, 530K+ customers
- Launched 1998; celebrated 25 years in May 2023
- Tagline: "Total Card Management" program
- Structure: TCM is the issuer of record; partner banks are agent banks sharing interchange
- Flagship case: **First-Citizens Bank & Trust** ($229B) is a TCM client — disclosed via testimonial on TCM's own website

**How partners were identified:** TCM's own site lists a few testimonials. Individual partner banks disclose TCM in their card T&Cs and credit card program FAQs (the phrase "issued by TCM Bank, N.A." appears on partner bank websites and PDF disclosures).

**Coverage caveat:** 5 confirmed + DB-matched out of 750+ TCM partners. This is a **starting sample**, not comprehensive. The 745 unnamed partners are almost entirely ICBA-member community banks — methodology for expansion: search individual community bank websites for "TCM Bank" disclosure, or work the ICBA membership directory.

**Last updated:** 2026-04-17

---

## In-cohort TCM agent banks ($10B-$250B ICP)

| # | Bank | State | Assets | Tier | Score | BD Note |
|---|---|---|---:|---|---:|---|
| 1 | 🔵 **First-Citizens Bank & Trust** | NC | $229B | **B** | 41 | The biggest TCM client. $229B in assets but only $295M in credit card loans (0.13% of assets — the direct consequence of outsourcing issuance). Post-SVB integration completed; large commercial customer base is underserved on cards. Brim pitch: modernize the program + bring it in-house to capture SVB's commercial clientele. |

---

## Below-cohort TCM agent banks

These are smaller but still valid if you want to stretch below the $10B ICP floor:

| # | Bank | State | Assets | Tier | Score | Note |
|---|---|---|---:|---|---:|---|
| 1 | **Burke & Herbert Bank** | VA | $7.9B | D | 22 | Just-below-cohort Northern Virginia bank. Has TCM credit card disclosures on their site. |
| 2 | **First Bank Richmond** | IN | $1.5B | D | 22 | Indiana community bank; publishes "Why did my bank partner with TCM Bank?" FAQ. |
| 3 | **First Southern State Bank** | AL | $0.9B | D | 22 | Alabama community bank with TCM credit cards. |
| 4 | **Moultrie Bank & Trust** | GA | $0.2B | D | 22 | Small Georgia community bank with TCM cards. |

---

## BD playbook for TCM targets

**The macro unlock:** TCM's value prop is "we issue for you so you don't have to build it." They're the conservative choice for risk-averse community banks. Brim's pitch vs. TCM:

1. **Modern tech stack.** TCM's platform is proven but traditional — designed around ICBA community bankers rather than digital-first banking. Brim is API-first.
2. **Revenue share economics.** Ask about TCM's revenue split. The ICBA model tends toward protecting TCM; Brim can position as more favorable.
3. **Product customization.** TCM's product suite is a handful of standard templates. Brim can co-develop.
4. **Commercial card depth.** TCM offers consumer + business + purchasing, but the business segment isn't their strength. Commercial-focused banks (like First-Citizens post-SVB) get more with Brim.
5. **Transition friction argument works both ways.** Agent-bank contracts are multi-year; ask about renewal timing. First-Citizens switched to TCM from somewhere else originally — they could switch away too.

**Opening hook template:**
> "I noticed your credit cards are issued through TCM. A few community banks your size are starting to bring issuance back in-house or move to modern platforms that let them customize beyond TCM's standard templates. Worth a conversation?"

---

## Known TCM partners NOT in our institutions table

These were surfaced in searches but don't cleanly match our institutions rows:

- **Bank of Canton** (MA)
- **North Salem State Bank** (IN)

Add them to institutions table manually if worth tracking.

---

## Maintenance notes

- **Expansion method:** pull the ICBA member directory, cross-reference with search results for "issued by TCM Bank" on each member's website, and tag matches.
- **Verification:** visit the bank's credit card page, look for "issued by TCM Bank, N.A." in disclosures or T&Cs.
- **Signal in DB:** `signal.agent_bank_dependency = 'tcm_bank'` with confidence 95, source_kind varies ('curated' for testimonial-based, 'official' for disclosure-PDF-based). Scoring weight 1.0x (full agent-bank BD priority).
