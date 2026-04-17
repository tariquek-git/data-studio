# Synovus Cards — Research Note

**Status:** Researched 2026-04-17. **No public partner list discoverable.** This is a placeholder for future research; no facts written.

## What Synovus does

Synovus Bank has operated a **credit card agent-bank program since 1974** — they issue credit cards for hundreds of other banks in addition to their own branded products. Publicly reported aggregates are "hundreds of other banks" but Synovus doesn't publish a partner list.

**Key identifying language (for future discovery):**
- T&Cs say "Credit cards are issued by Pinnacle Bank, a Tennessee bank, dba Synovus Bank, 33 West 14th Street, Columbus, GA 31901" — this is their legal issuer identity.
- The Pinnacle Bank TN charter is a legal artifact (Synovus acquired Pinnacle's TN charter for card issuing); unrelated to Pinnacle Financial Partners (the $57B bank on CorServ).

## Why this is a gap

Unlike FNBO (central portal), Elan (disclosure phrase), TCM (testimonials + T&Cs), and CorServ (public client logos), **Synovus does not publish the identity of its agent-bank partners**. Their website markets only their own-branded products.

## Where the partners live

- Individual agent-bank partner banks list "Credit cards issued by Synovus Bank" in their card T&Cs. So enumeration via Google for the phrase is possible but less reliable (Synovus is a common consumer brand, many search results are about Synovus' own customers).
- CFPB credit card agreement database at `consumerfinance.gov/credit-cards/agreements/issuer/synovus-bank/` — every agreement filed under Synovus as issuer. Sample reading of these agreements would reveal partner-specific language.
- Nilson Report (paid) publishes agent-bank rankings that would include Synovus clients.

## Recommended future action

To build a Synovus target list:
1. **Option A — CFPB database scraping.** Download all Synovus-filed agreements (a few hundred filings). Each agreement template names the partner brand in the document body. Takes ~2-3 hours.
2. **Option B — Targeted Google searches.** Search `"credit cards are issued by Synovus Bank" site:.bank` + state variations. Yield probably 10-30 partners.
3. **Option C — Paid data.** Nilson Report subscription ($2K-3K) unlocks the authoritative list.

None are time-efficient compared to the FNBO/CorServ/Elan/TCM research paths. **Recommended: defer Synovus discovery unless specifically needed for a pipeline gap.**

## If we did assemble the list

Synovus partners would be tagged with `signal.agent_bank_dependency = 'synovus_cards'` (already weighted 1.0x in `compute_brim_score` — same tier as TCM/Elan/FNBO). They're a pure agent-bank vendor (not CaaS), so BD pitches would match the FNBO/TCM playbook: vendor economics, product flexibility, tech modernization.
