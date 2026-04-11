# DATA_STUDIO.md — Single Source of Truth

> Last synced by Claude: April 11, 2026 23:30 UTC
> Repo: tariquek-git/data-studio
> DB: Supabase bvznhycwkgouwmaufdpe
> Deploy: data-studio-mu.vercel.app (auto-deploys on push)

---

## This File Replaces

This is the ONE file both Claude and Cursor reference. It consolidates:
- HANDOFF.md (architecture + schema)
- MASTER_PLAN.md (agent execution plan)
- BRIM_MODE.md (BD intelligence layer)

All three still exist in the repo for reference, but THIS file is the living document. When Claude updates strategy, it goes here. When Cursor has questions, it writes them here.

---

## Database State (April 11, 2026)

### Health Scorecard

| Metric | Value | Grade |
|--------|-------|-------|
| Institutions | 10,112 | — |
| With total_assets | 8,699 (86%) | B+ |
| With net_income | 4,394 (43%) | C |
| With ROA | 8,695 (86%) | B+ |
| With lat/lng | 0 (0%) | F |
| With website | 125 (1%) | F |
| With branches | 4,405 (44%) | C |
| With holding_company | 3,672 (36%) | C- |
| With card data | 698 (7%) | D |
| Canadian CUs w/ data | 4/30 (13%) | F |
| Entity relationships | 0 | F |
| Bank capabilities | 0 | F |
| Financial history | 35,222 | — |
| Quarterly history | 35,220 | — |
| Branches | 74,750 | — |

### Confidence Levels

Every institution now has `data_confidence`, `data_confidence_score`, `data_provenance`, and `verified_by` columns.

| Level | Score | Count | What |
|-------|-------|-------|------|
| high | 85-90 | 8,695 | FDIC API + NCUA CSV |
| medium | 70 | 4 | Claude web research (Vancity, Servus, Meridian, Coast Capital) |
| unverified | 10 | 26 | Canadian CU seeds with no financials |
| unverified | null | 1,387 | OSFI/RPAA/CIRO/FINTRAC registry data |

### Tables

| Table | Rows | Status |
|-------|------|--------|
| institutions | 10,112 | Active. Confidence tracking added. |
| branches | 74,750 | Populated. No changes needed. |
| financial_history | 35,222 | Annual snapshots. Growing. |
| financial_history_quarterly | 35,220 | Quarterly snapshots. Growing. |
| charter_events | 29,642 | Merger/closure/charter events. |
| entity_external_ids | 26,191 | Cross-reference IDs. |
| entity_tags | 21,197 | Classification tags. |
| branch_history_annual | 4,336 | Branch network changes. |
| failure_events | 3,626 | Bank/CU failures. |
| entity_facts | 1,046 | Key facts per entity. |
| registry_entities | 1,033 | Non-bank FI entities. |
| data_sources | 26 | All sources registered. |
| sync_jobs | 33 | Pipeline tracking. |
| entity_relationships | **0** | EMPTY. Needs populating. |
| bank_capabilities | **0** | EMPTY. Brim Mode fields added. |
| ecosystem_entities | 0 | Empty. Phase 2. |
| ai_summaries | 0 | Empty. Phase 3. |
| saved_searches | 0 | Empty. |
| macro_series | 0 | Empty. Phase 2. |

### Data Sources (26 registered)

Active with data: fdic (4408), ncua (4287), rpaa (936), osfi (357), fintrac (54), fincen (23), ciro (20), bcfsa (9), fsra (8), dgcm (4), cudgc_sk (3), cudgc (2), nscudic (1)

Configured pending: ffiec_cdr, ffiec_nic, ffiec_hmda, ffiec_census, ffiec_cra, occ, frb_routing, sec_edgar, cfpb_complaints, nmls, cmhc, boc, ccua

---

## Roles

**Claude** (via claude.ai with Supabase + Vercel MCP):
- Strategy, schema design, data source research
- Writes directly to database (schema changes, data updates, confidence tracking)
- Monitors Vercel deployments
- Validates data Cursor inserts
- Answers questions in this file

**Cursor** (via tariquek-git/data-studio repo):
- All code: scrapers, agents, frontend, deployment
- Reads this file for instructions
- Writes questions at the bottom
- Pushes to main (auto-deploys to Vercel)

---

## Agent Registry

### QA Agents (read-only, safe to run anytime)
| Script | Purpose | Status |
|--------|---------|--------|
| agent_qa_balance.py | Balance sheet identity checks | NOT BUILT |
| agent_qa_orphans.py | Orphan records in financial_history, branches | NOT BUILT |
| agent_qa_dupes.py | Duplicate institution detection | NOT BUILT |
| agent_qa_staleness.py | Flag stale data_as_of dates | NOT BUILT |
| agent_qa_ranges.py | ROA, assets, income range checks | NOT BUILT |
| agent_qa_yoy.py | YoY consistency in financial_history | NOT BUILT |
| agent_qa_completeness.py | Per-source data coverage scorecard | NOT BUILT |

### Data Fill Agents (write to DB, idempotent)
| Script | Purpose | Status |
|--------|---------|--------|
| agent_fill_roa.py | Calculate ROA from net_income/total_assets | NOT BUILT |
| agent_fill_branches.py | Sync num_branches from branches table | NOT BUILT |
| agent_fill_websites.py | Extract websites from raw_data jsonb | NOT BUILT |
| agent_fill_coords.py | Geocode city+state to lat/lng | NOT BUILT |
| agent_relationships.py | Populate entity_relationships from holding_company + charter_events | NOT BUILT |

### Scraper Agents
| Script | Purpose | Status |
|--------|---------|--------|
| agent_scraper_ca.py | Canadian CU annual report PDF extraction | NOT BUILT |
| agent_ncua.py | NCUA 5300 bulk CSV sync | NOT BUILT |
| agent_ffiec.py | FFIEC CDR call report sync | NOT BUILT |

### Brim Mode Agents
| Script | Purpose | Status |
|--------|---------|--------|
| agent_brim_cards.py | Backfill card portfolio from FDIC credit_card_loans | NOT BUILT |
| agent_brim_agent_banks.py | Detect Elan/PSCU/Co-Op agent banking relationships | NOT BUILT |
| agent_brim_cores.py | Detect core processor (fiserv/fis/jack_henry) | NOT BUILT |
| agent_brim_score.py | Calculate 0-100 Brim fit score | NOT BUILT |
| agent_brim_elan.py | Track Elan-to-Fiserv migration window | NOT BUILT |
| agent_brim_canada.py | Canadian BD intelligence signals | NOT BUILT |

---

## Priority Order for Cursor

### Immediate (do first)
1. Build agent_qa_completeness.py and run it. Print the full health scorecard.
2. Build agent_fill_roa.py. Calculate ROA for ~4,300 institutions missing it.
3. Build agent_relationships.py. Populate from holding_company field (~3,672 rows).
4. Build agent_brim_cards.py. Copy 698 card portfolios into bank_capabilities.

### Next (after immediate)
5. Build all remaining QA agents and run them.
6. Build agent_scraper_ca.py for Canadian CU annual reports.
7. Build agent_brim_score.py. Score all institutions with card data.
8. Rebuild frontend as mesh network with Supabase real-time connection.

### Later
9. NCUA 5300 bulk sync.
10. FFIEC CDR sync.
11. Lat/lng geocoding.
12. Brim Mode UI tab.

---

## Schema Quick Reference

### institutions key columns
id, cert_number (NOT NULL), name, source (check constraint), charter_type, active, city, state, latitude, longitude, website, holding_company, total_assets (bigint), total_deposits (bigint), total_loans (bigint), net_income (bigint), equity_capital (bigint), roa (float), num_branches, num_employees, credit_card_loans, credit_card_charge_offs, data_as_of, data_confidence, data_confidence_score, data_provenance, verified_by, last_synced_at, raw_data (jsonb)

### bank_capabilities key columns
cert_number, visa_principal, mastercard_principal, issues_credit_cards, issues_debit_cards, card_program_manager, agent_bank_program, core_processor, card_portfolio_size, brim_score, brim_tier, brim_score_factors (jsonb)

### entity_relationships key columns
from_entity_id, to_entity_id, relationship_type (subsidiary_of, merged_into, regulated_by), active, effective_start, effective_end

---

## Rules (Non-Negotiable)

1. Never use "engine" in code or comments
2. Canadian CU reports are in thousands of CAD. Multiply by 1000.
3. cert_number 900001+ for Canadian CUs
4. source must match check constraint (lowercase)
5. No Claude API / LLM calls in agents (Phase 1 is pdfplumber only)
6. Don't store PDFs. Extract, store, delete.
7. Don't target existing Brim clients in Brim Mode
8. Push to main. Vercel auto-deploys.
9. Every agent prints a summary report when done.
10. Set data_confidence and data_provenance on every write.

---

## Questions for Claude
(Cursor: write questions here. Claude answers next sync.)

---

## Change Log

| Date | Who | What |
|------|-----|------|
| 2026-04-11 | Claude | Seeded 30 Canadian CUs (cert 900001-900030) |
| 2026-04-11 | Claude | Updated Vancity ($28.4B), Servus ($29.3B), Meridian ($28.5B), Coast Capital ($21.9B) |
| 2026-04-11 | Claude | Marked Connect First as merged into Servus |
| 2026-04-11 | Claude | Registered 7 Canadian provincial sources in data_sources |
| 2026-04-11 | Claude | Updated institution counts across all data_sources |
| 2026-04-11 | Claude | Added Brim Mode columns to bank_capabilities table |
| 2026-04-11 | Claude | Added data_confidence tracking columns to institutions |
| 2026-04-11 | Claude | Backfilled confidence levels: 8,695 high, 4 medium, 1,413 unverified |

