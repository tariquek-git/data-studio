# STATE.md — Data Studio

> **This is the single source of truth for humans and AI sessions working on Data Studio.**
> If a claim in this file conflicts with anything in `docs/archive/`, this file wins.
> Last updated: 2026-04-17

---

## What this project is

A Palantir-style intelligence layer for ~10,000 North American financial institutions (FDIC banks, NCUA credit unions, OSFI/provincial Canadian regulators). The product goal is: pick any dimension — assets, geography, charter type, holding company, card portfolio, failure history — and slice, compare, and explore in real time. Every institution is a node; every relationship is an edge.

A secondary product surface is **Brim Mode**: a lens tuned for card-issuing business development — Brim score, core processor, agent bank program, card portfolio size.

## Infra

| Thing | Where |
|---|---|
| Repo | `tariquek-git/data-studio` |
| Working branch | `main` (Vercel auto-deploys on push) |
| Live URL | `data-studio-mu.vercel.app` |
| Database | Supabase `bvznhycwkgouwmaufdpe` |
| Vercel team | `team_STzWxd5CFWZJluy9ayRxCorw` |
| Stack | React 19 + Vite + TypeScript 5.9 + Tailwind 4 + Supabase + Vercel serverless |

---

## Locked decisions (2026-04-12)

These three are one-way doors. If you want to reopen them, update this section with a dated entry and a reason.

### 1. Data model → converge onto `entity_warehouse`

`institutions` (the legacy flat table) is being deprecated in place. All new reads go through a new `lib/entity-service.ts` abstraction backed by `registry_entities` + `entity_facts` + `entity_relationships` + `institution_summary_mv` (a materialized view joining the warehouse tables with `financial_history_quarterly`).

- **`registry_entities`** = canonical identity row for every regulated FI and every non-FI (fintech, vendor, regulator-as-entity).
- **`entity_facts`** = typed facts keyed by entity.
- **`entity_relationships`** = the graph (holding company, merger, regulator, vendor).
- **`institution_summary_mv`** = fast, flat read surface for the screener/search/profile.
- **`institutions`** = legacy, still writable during the migration. Becomes a view over `registry_entities` once writes flip, then eventually deleted.

Sync scripts keep writing to `institutions` for now. `scripts/backfill-entity-warehouse.mjs` mirrors into `registry_entities` nightly. See "Roadmap" for the staged flip.

### 2. Brim Mode → a lens, not a standalone product

Brim is a filter + a few extra columns (`brim_score`, `brim_tier`, `core_processor`, `agent_bank_program`) on institution data. Its filters fold into the unified Explore page's advanced panel. The `/brim` route stays as a pre-filtered saved view. No separate schema, no dedicated nav tier. Revisit only if Brim grows into a paying product.

### 3. `codex/entity-intelligence-foundation` branch → archive

**Discovered during Phase 0:** the branch is fully contained in `main`. `main` is 6 commits ahead of it. No cherry-pick is needed. The branch should be renamed `archive/codex-entity-intelligence-foundation` and removed from default branch lists. AGENTS.md's claim that it was "20 commits ahead" was stale.

---

## Session progress log — Brim BD intelligence (2026-04-14 → 2026-04-17)

Five consecutive sessions added a full Brim BD intelligence layer on top of
the data foundation. What landed:

**Scoring + signals infrastructure:**
- `compute_brim_score()` plpgsql function with per-signal scaling (scoring function persisted at `scripts/schema/functions/compute_brim_score.sql`).
- Tier thresholds recalibrated to A≥55, B≥40, C≥25, D≥15, F<15.
- ICP cohort: $10B-$250B US FDIC + NCUA (view `icp_cohort_10b_250b_us`, 164 institutions). Earlier ICP of $1-10B was superseded 2026-04-17.
- `score_snapshots` table + `snapshot_all_scores()` + `detect_tier_changes()` for weekly-cron snapshotting.
- `agent_bank_dependency` scaled by `fact_value_text`: 1.0x for agent-bank vendors (TCM, Elan, FNBO, Synovus, Cardworks), 0.9x for CorServ + CU vendors (PSCU, Co-Op) + Visa DPS, 0.65x for CaaS vendors (Marqeta, Galileo), 0.33x for in-house.

**Signal collectors:**
- `sync-sec-exec-transition.mjs` with C-suite text filter (220 → 67 filings, 70% noise reduction).
- `sync-ncua-enforcement.mjs` (58 facts).
- `sync-occ-enforcement.mjs` (140 facts).
- Enforcement false-positive fix: 152 individual-level actions moved to `regulatory.individual_prohibition` (not scored). `signal.enforcement_action` now 55 institution-level facts only. Collector scripts patched to filter individuals going forward.
- `sync-ncua.mjs` dynamic-quarter (no more hardcoded `december-2025`).

**Agent-bank partner research (44+ targets identified):**
- FNBO / First Bankcard: 12 partners (6 in cohort). URL pattern discovery via `card.fnbo.com/mpp/fi/<slug>/`.
- Elan Financial Services: 8 partners (4 in cohort). Disclosure-phrase Google search.
- TCM Bank (ICBA Payments): 5 partners (1 in cohort — First-Citizens flagship).
- CorServ Solutions: 19 partners (2 in cohort). Logo-grid discovery.
- Synovus Cards: deferred (no public partner list).
- Target list markdowns: `docs/card-program-profiles/_fnbo-*.md`, `_elan-*.md`, `_tcm-*.md`, `_corserv-*.md`, `_synovus-*.md`.
- Vendor tags land in both `entity_facts.signal.agent_bank_dependency` AND `bank_capabilities.agent_bank_program`.

**Per-bank deep research (9 analyst briefs):**
- `docs/card-program-profiles/11063-first-citizens-bank-trust.md` (TCM, B-tier flagship)
- `docs/card-program-profiles/6560-huntington-national-bank.md` (in-house Mastercard)
- `docs/card-program-profiles/1005536-navy-federal-credit-union.md` (tri-network in-house)
- `docs/card-program-profiles/1000227-penfed-pentagon-federal.md` (Visa in-house CU)
- `docs/card-program-profiles/24998-commerce-bank-kansas-city.md` (dual-network in-house)
- `docs/card-program-profiles/17266-columbia-bank-umpqua.md` (Elan + direct Visa + inherited FNBO, post-M&A)
- `docs/card-program-profiles/30788-glacier-bank.md` (FNBO serial acquirer, 27 deals since 2000)
- `docs/card-program-profiles/35583-pinnacle-financial-partners.md` (in-house Mastercard; **DATA CORRECTION** — logo-gallery mis-tag fixed)
- `docs/card-program-profiles/8273-umb-bank.md` (peer/competitor, flagged `bd_exclusion_reason`)

**Product surface:**
- `StoryBrimSignals.tsx` — per-signal contribution bars on institution story page.
- `ScoreDeltaChip` + `CoverageChip` — week-over-week score delta + signal completeness.
- `api/institutions/[certNumber]/signals.ts` — signal breakdown endpoint with previous snapshot for delta.
- `api/institutions/export.ts` — CSV export with Brim tier/score/top-signals columns.
- `cron-snapshot-scores.mjs` — weekly score-snapshot cron.
- `cron-slack-digest.mjs` — weekly Slack digest of tier changes + top prospects + new signal facts.
- `.github/workflows/weekly-scoring.yml` — GitHub Actions cron (needs `SLACK_WEBHOOK_URL` secret to activate).
- **Navigation revision (2026-04-17)**: Brim BD promoted to primary nav; Watchlist promoted from icon to primary; More dropdown groups Data Sources / Audit / Entities / Compare / Failures / QA.
- **BrimPage enhancements**: agent-bank vendor filter pills (FNBO/Elan/TCM/CorServ/in-house/All). Vendor column in table. Default view tier=ALL, min_score=25.

**Data corrections / scoring fixes this session:**
- Sept 2025 URL `vite.config.ts` proxies `/api/*` → prod Vercel (so `agent_bank_vendor` filter needs prod deploy to work).
- Synced `score_snapshots` → `bank_capabilities.brim_score/tier` 2026-04-17. Otherwise BrimPage would still show months-old legacy scoring.
- Pinnacle Financial Partners (cert 35583): `corserv` tag corrected to `in_house`. Vallant Bank (cert 14065, formerly Pinnacle Bank GA/Elberton) is the real CorServ partner.
- Navy Federal: "skip / not a target" framing removed from analyst report. BD should be lane-specific (business card modernization, Amex expansion, secured sub-platform), not core-issuer displacement.
- UMB Bank: tagged `bd_exclusion_reason='peer'`. They run UMB Card Services + UMB Cobrand + UMB Healthcare — direct Brim competitors.

**Current ICP tier distribution (after all fixes, 2026-04-17):**
- 🔵 B-tier: 6 — Columbia Bank OR, Glacier Bank, Huntington, Commerce, First-Citizens, Pinnacle FP (dropped UMB to peer exclusion)
- 🟡 C-tier: 36
- 🟠 D-tier: 306
- 🔴 F-tier: 9,757

**Signal coverage (entity_facts, fact_type LIKE 'signal.%'):**
- `signal.asset_band_fit`: 8,699 (reclassified 2026-04-17 for new ICP)
- `signal.card_portfolio_size`: 698
- `signal.agent_bank_dependency`: 49 (19 corserv, 12 fnbo, 8 elan, 5 in-house, 5 tcm)
- `signal.card_network_membership`: ~13
- `signal.post_merger_window`: 284
- `signal.card_program_decline`: 130
- `signal.enforcement_action`: 55 (institution-level only after 2026-04-17 fix)
- `signal.regulatory_capital_stress`: 15
- `signal.exec_transition`: 89

**Still deferred:**
- PSCU / Co-Op Financial partner discovery (would illuminate the 21 NCUA cohort CUs — all currently dark).
- Automated card-program research agent (approved plan from 2026-04-16; manual pattern has been productive enough so far).
- BD workflow surface (saved prospect lists beyond watchlist, per-prospect notes, cadence). User is ad-hoc solo; build when needed.
- Phase 1 entity warehouse migration per the original roadmap below.

---

## Database state (2026-04-11, mined from DATA_STUDIO.md)

| Metric | Value |
|---|---|
| Institutions | 10,112 |
| With `total_assets` | 8,699 (86%) |
| With `net_income` | 4,394 (43%) |
| With `roa` | 8,695 (86%) |
| With `lat/lng` | **9,932 (98%)** — city+state seeds via SQL; 173 need Nominatim refinement |
| With `holding_company` | 3,672 (36%) |
| With card data | 698 |
| `entity_relationships` rows | **190** — 8 subsidiary_of + 182 sibling_of (co-subsidiary FDIC pairs >$1B) |
| `bank_capabilities` rows | **8,699** — Brim scores + card portfolios loaded |
| `financial_history` rows | 38,118 annual / 35,220 quarterly |
| `branches` rows | 74,750 |
| `charter_events` rows | 29,642 |

### Active data sources

| Source | Country | Institutions | Notes |
|---|---|---|---|
| `fdic` | US | 4,408 | Full financials, quarterly |
| `ncua` | US | 4,287 | Full financials, quarterly |
| `rpaa` | CA | 936 | Payment providers, no financials |
| `osfi` | CA | 357 | Banks/trust cos., no financials yet |
| `fintrac` | US | 54 | MSBs |
| `fincen` | US | 23 | MSBs |
| `ciro` | CA | 20 | Investment dealers |
| `bcfsa` | CA | 9 | Only Vancity has financials |
| `fsra`, `dgcm`, `cudgc_sk`, `cudgc`, `nscudic` | CA | <20 total | Provincial CUs, no financials yet |

Configured but pending: `ffiec_cdr`, `ffiec_nic`, `ffiec_hmda`, `ffiec_cra`, `occ`, `frb_routing`, `sec_edgar`, `cfpb_complaints`, `nmls`, `cmhc`, `boc`, `ccua`.

### cert_number convention

- FDIC / NCUA use their real cert numbers.
- Canadian CUs use `cert_number >= 900001` to avoid collision.

---

## Roadmap (the standardization sequence)

See `/Users/tarique/.claude/plans/cosmic-honking-crown.md` for the full plan. Summary:

### Phase 0 — Stop the drift (in progress)
Consolidate docs → this file + `CONTRIBUTING.md`. Archive `codex` branch. Commit working tree. Delete `BRIM_MODE.md` references.

### Phase 1 — Data foundation
1. Consolidate schema → `scripts/schema/000_current.sql`
2. Add `data_confidence`, `data_confidence_score`, `data_provenance`, `verified_by` columns to `registry_entities`
3. Retrofit every `sync-*.mjs` to import from `scripts/_sync-utils.mjs` (no more hand-parsing `.env.local`)
4. Retrofit `agent_*.py` to use `scripts/_db.py` helpers (no more duplicated HEADERS dicts)
5. Design + implement `src/lib/entity-service.ts` (pass-through to existing queries at first)
6. Verify `scripts/backfill-entity-warehouse.mjs` mirrors `institutions` → `registry_entities` correctly
7. Build `institution_summary_mv` materialized view
8. Run `agent_relationships.py` against prod → populate `entity_relationships` (~3,672 rows)
9. Run `agent_brim_cards.py` → populate `bank_capabilities` (698 rows)
10. Add `bd_exclusion_reason` column, seed 7 Rule-7 exclusions
11. Run all QA agents → baseline health report at `docs/baselines/2026-04-12-health.md`

### Phase 2 — API convergence (staged)
Migrate read routes to `entity-service` one group at a time, smallest blast radius first:
`api/qa/*` → `api/sources/*`, `api/series/*`, `api/sync/*` → `api/analytics/*` → `api/institutions/search|screen` → `api/institutions/[certNumber]|peers|branches|capabilities|enrich` → `api/entities/*` → `api/relationships/*`.

Every migrated route has a stored response-shape diff test. Only after all reads flip do the sync scripts start writing to `registry_entities`.

### Phase 3 — Frontend consolidation
- Merge `SearchPage` + `ScreenerPage` → `ExplorePage`
- Fold `MarketMapPage` into `AnalyticsPage` as a tab
- Rename Data Ops section (`/ops/sources`, `/ops/entities`, `/ops/entity/:id`)
- Fold Brim filters into Explore; keep `/brim` as a saved view
- Extract shared data hooks: `useInstitutionSearch`, `useInstitution`, `useAnalyticsOverview`
- Mobile pass on Home, Explore, InstitutionPage

### Phase 4 — Earn the right to build new
- `agent_scraper_ca.py` (Canadian CU annual report PDF extraction)
- Mesh/graph view (`RelationshipGraph.tsx`) — now that `entity_relationships` is populated
- `agent_brim_score.py` live scoring
- FFIEC CDR + NCUA 5300 quarterly refresh

---

## Rules (non-negotiable)

1. **Never** use the word "engine" in code, comments, or docs.
2. FDIC API amounts are in thousands. Multiply by 1000 on ingest. Applied centrally in each sync script via a `thousands()` helper.
3. Canadian CU annual report amounts are in thousands of CAD. Also multiply by 1000.
4. `cert_number >= 900001` for Canadian CUs.
5. `source` field must match the DB check constraint (lowercase).
6. No Claude API / LLM calls inside ingestion scripts or agents (Phase 1). AI features go through `/api/ai/*` routes only.
7. Don't store PDFs. Extract data, keep the source URL, delete the file.
8. Don't target existing Brim clients in BD outputs. Exclusion list (enforced in data via `bd_exclusion_reason` once Phase 1 ships): **Manulife, Affinity CU, Laurentian Bank, CWB, Zolve/Continental, Air France KLM, PayFacto.**
9. Every write sets `data_confidence` and `data_provenance` (once the columns land on `registry_entities` in Phase 1).
10. Every agent prints a summary report when done.
11. Push to `main`. Vercel auto-deploys.
12. Run `npm run build` before every commit. Husky `pre-push` enforces TypeScript strict.
13. No `any` types; no `@ts-ignore`.
14. Use `upsert` with `onConflict` for all data ingestion. Scripts must be rerunnable.
15. API routes stay thin. Business logic lives in `lib/` (eventually `lib/entity-service.ts`).
16. Don't add new npm dependencies without strong justification.

---

## Agents and scripts (what exists and what it does)

### Python agents (`scripts/agent_*.py`) — all 18 built, just need to be run

**QA (read-only, safe anytime):** `agent_qa_completeness`, `agent_qa_balance`, `agent_qa_orphans`, `agent_qa_dupes`, `agent_qa_staleness`, `agent_qa_ranges`, `agent_qa_yoy`.

**Fill (idempotent writes):** `agent_fill_roa`, `agent_fill_branches`, `agent_fill_websites`, `agent_fill_coords`.

**Brim:** `agent_brim_cards`, `agent_brim_agent_banks`, `agent_brim_cores`, `agent_brim_elan`, `agent_brim_score`.

**Graph:** `agent_relationships`.

Shared helper: `scripts/_db.py` (`sql/select/update/insert`, loads `.env.local`, picks service vs anon key).

### Node sync scripts (`scripts/sync-*.mjs`)

FDIC family: `sync-fdic`, `sync-fdic-history`, `sync-fdic-rssd-cra`, `sync-fdic-enforcement`, `sync-fdic-failures`.

Other regulators: `sync-ncua`, `sync-osfi`, `sync-occ`, `sync-ciro`, `sync-fintrac`, `sync-rpaa`.

FFIEC: `sync-ffiec-cdr`, `sync-ffiec-cra`, `sync-ffiec-nic`.

Specialty: `sync-branches`, `sync-cfpb-complaints`, `sync-boc-series`, `sync-fed-master-accounts`, `sync-sec-edgar-local`, `sync-sod`.

Ecosystem: `sync-baas-ecosystem-local`, `sync-sponsor-ecosystem-local`.

Shared helper: `scripts/_sync-utils.mjs` (`loadEnvLocal`, `createSupabaseServiceClient`, `startSyncJob`, `finishSyncJob`, `chunkArray`, `stableUuid`, `parseDelimited`). **Currently underused** — Phase 1 retrofit makes it mandatory.

### Schema migrations

- **`scripts/schema/000_current.sql`** — idempotent end-state schema. Single file of truth for tables, indexes, RLS, triggers. Apply this against a fresh Supabase branch.
- `scripts/schema/archive/` — historical fragments (`schema.sql`, `add-*.sql`, `migrate-*.sql`) preserved for context and used by legacy helper scripts (`setup-local-postgres.mjs`, `run-migration-entity-foundation.mjs`) until those are retired.

---

## Frontend surface (current state)

14 pages under `src/pages/`:

| Page | Role | Phase 3 fate |
|---|---|---|
| `HomePage` | Landing + quick filters | Keep |
| `SearchPage` | Freeform text + preset filters | Merge → `ExplorePage` |
| `ScreenerPage` | Numeric slider-driven screener | Merge → `ExplorePage` |
| `InstitutionPage` | FI deep-dive (Sankey, peers, CAMELS, AI summary) | Keep |
| `AnalyticsPage` | Aggregate dashboard | Keep, absorb MarketMap as tab |
| `MarketMapPage` | ROA/ROE bubble chart | Fold into AnalyticsPage |
| `ComparePage` | Side-by-side compare (2–5 FIs) | Keep |
| `WatchlistPage` | Personal watchlist | Keep |
| `FailuresPage` | Historical failure registry | Keep |
| `BrimPage` | Brim tier/score filter view | Becomes pre-filtered Explore view |
| `DataSourcesPage` | Source registry | Move under `/ops` |
| `EntitiesPage` | Entity explorer (ops-flavored) | Move under `/ops` |
| `EntityPage` | Entity detail | Rename `DataEntityPage`, move under `/ops` |
| `QAPage` | QA / FDIC validation | Move under `/ops` |

---

## How to update this file

Whenever you make a decision that affects strategy, schema shape, product surface, or the roadmap: **update this file before ending your session.** Add a dated entry under "Locked decisions" or update the relevant section.

Historical docs (`CLAUDE.md`, `CODEX.md`, `AGENTS.md`, `DATA_STUDIO.md`, `MASTER_PLAN.md`, `HANDOFF.md`) live in `docs/archive/` with a banner that points back here. Don't edit them.
