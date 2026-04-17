# CorServ Solutions Agent-Bank Targets

**What this is:** Every bank that runs its credit card program on **CorServ Solutions' platform** is a Brim BD target. CorServ is a credit-card-issuing CaaS (Card-as-a-Service) platform — they enable community banks to self-issue credit cards without building their own infrastructure. Different model than TCM/Elan/FNBO: with CorServ, the bank is often the direct issuer of record, CorServ just powers the backend. This means the switching conversation is technical (platform) rather than contractual (agent relationship).

**Quick facts about CorServ:**
- Claims 40+ community bank partner logos on their website
- Self-described: "empowers community banks to issue credit cards"
- Launch time for new partners: ~90 days
- Platform capabilities: self-issuing, hybrid, or full CaaS
- Cards: typically Mastercard-branded (Platinum, Platinum Rewards, World Rewards)
- HQ: Norcross, GA

**How partners were identified:** CorServ's own site has a client logo grid — 40+ named banks publicly listed. Five more named in testimonial/case-study quotes. This is the **most transparent** of the major agent-bank platforms.

**Coverage caveat:** 19 confirmed DB matches out of ~40 named CorServ clients. Gap is mostly in generic names ("First Bank", "Peoples Bank", "Pinnacle Bank" — 20+ matches each in our DB — where we can't verify which one without visiting each bank's website). Also several CorServ names that aren't in our institutions table (Studio Bank, Rosedale Bank, Reliant Bank, Our Heritage Bank, BHG Financial, etc.).

**Last updated:** 2026-04-17

---

## In-cohort CorServ agent banks ($10B-$250B ICP)

| # | Bank | State | Assets | Tier | Score | BD Note |
|---|---|---|---:|---|---:|---|
| 1 | 🔵 **Pinnacle Bank (Pinnacle Financial Partners)** | TN | $57.6B | **B** | 45 | Holding: Pinnacle Financial Partners (NASDAQ: PNFP). One of the best-run regional banks in the Southeast. Already on CorServ — so they made the "outsource to a modern platform" decision. Brim pitch: be the next-gen upgrade from CorServ, especially for commercial/premium products. |
| 2 | 🟡 **Busey Bank** | IL | $18.1B | C | 36 | Holding: First Busey Corp (NASDAQ: BUSE). Midwest regional. Same pitch as Pinnacle — CorServ client already open to modern platforms. |

---

## Below-cohort CorServ agent banks

Still valid if Brim wants to stretch below $10B:

| # | Bank | State | Assets | Score | Source |
|---|---|---|---:|---:|---|
| 1 | Capitol Federal Savings Bank | KS | $9.8B | 22 | Logo on client list |
| 2 | Fremont Bank | CA | $5.9B | 22 | Logo on client list |
| 3 | Northeast Bank | ME | $4.9B | 22 | Testimonial (Eva Rasmussen, CSO) |
| 4 | First Dakota National Bank | SD | $3.2B | 22 | Logo on client list |
| 5 | STAR Financial Bank | IN | $3.2B | 22 | Logo on client list |
| 6 | The Bank of Missouri | MO | $3.0B | 22 | CorServ + Visa community bank partnership press release |
| 7 | Bank Independent | AL | $3.0B | 22 | Logo on client list |
| 8 | Midwest BankCentre | MO | $3.0B | 22 | Logo on client list |
| 9 | BayCoast Bank | MA | $2.8B | 22 | Logo on client list |
| 10 | Machias Savings Bank | ME | $2.7B | 22 | Logo on client list |
| 11 | Tradition Capital Bank | MN | $2.6B | 22 | Logo on client list |
| 12 | Meridian Bank | PA | $2.6B | 22 | Logo on client list |
| 13 | BankWest | SD | $1.9B | 22 | Logo on client list |
| 14 | Newtown Savings Bank | CT | $1.9B | 22 | Logo on client list |
| 15 | Plains Commerce Bank | SD | $1.3B | 22 | Logo on client list |
| 16 | Fieldpoint Private Bank & Trust | CT | $0.9B | 22 | Logo on client list |
| 17 | The Bank of Glen Burnie | MD | $0.4B | 22 | Logo on client list |

---

## Ambiguous matches not tagged

CorServ's logo grid lists these without state/city qualifier; our DB has 20+ candidates each. Can't match automatically:

- **First Bank** — 20+ candidates in the DB
- **First National Bank** — 50+ candidates in the DB
- **Peoples Bank** — 30+ candidates in the DB (Erin Erhart testimonial from "First Bank"; Tom Frawley testimonial from "Peoples Bank" — no state given)
- **Pinnacle Bank** (other than TN) — additional candidates in NE, TX, CA, WY, IA, KY, AL — likely one of these is also a CorServ client, just can't verify which

Also on CorServ's logo list but not in our DB:
- Reliant Bank (TN — press release)
- Bank of Clarke County (VA)
- BHG Financial (specialty lender, not FDIC)
- Studio Bank, Rosedale Bank, Our Heritage Bank, Community Bank of the South (smaller)

---

## BD playbook for CorServ targets

**The macro nuance:** CorServ's customers are already modern-minded. They chose CaaS over agent banking. That's a BETTER posture than TCM/FNBO/Elan customers because:

1. They already decided infrastructure matters.
2. They already accept "vendor-managed platform" as a model.
3. They're typically 5-10 years into the decision — contract renewals are real.
4. They often picked CorServ specifically because it let them issue in their own name (brand matters to them).

**Pitch angles vs. CorServ:**
1. **Feature depth.** CorServ's product catalog is standard-template Mastercards. Brim can do more.
2. **Newer platform.** CorServ was founded earlier than Brim and relies on older architecture under the hood.
3. **API-first design.** If the bank's embedded finance ambitions are evolving, Brim's API coverage may be materially broader.
4. **Commercial/premium depth.** CorServ's strength is consumer + SMB business. For sophisticated commercial products, Brim's library is deeper.

**Opening hook template:**
> "Saw you're running your cards through CorServ — you've already made the 'modern platform over legacy agent bank' call. Worth talking about where Brim goes further on [commercial products / API depth / feature library]?"

---

## Maintenance notes

- **Expansion method:** scan each of the ambiguous names ("First Bank", "Peoples Bank", "Pinnacle Bank") by visiting their card pages and looking for CorServ mentions. Also watch CorServ's news page for new partnership announcements.
- **Signal in DB:** `signal.agent_bank_dependency = 'corserv'` with confidence 90, source_kind='official'. Scoring weight 0.9x (one tier below pure agent-bank vendors because CorServ is hybrid CaaS).
- **Cross-platform check:** some banks appear on multiple platforms' client lists (e.g., Columbia Bank on Elan, possibly CorServ too). Verify before tagging the same bank twice.
