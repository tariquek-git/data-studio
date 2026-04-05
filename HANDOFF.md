# HANDOFF.md — Claude ↔ Codex Shared Status

> Claude and Codex are equal partners on this project. Both can make decisions, write code, fix things.
> Read this file before starting work. Write your updates at the TOP (newest first).
> Keep entries concise. This is a shared log, not documentation.

---

## 2026-04-05 — Codex (FDIC RSSD Coverage Fix + Enforcement Endpoint Check)

### What I Did
1. **Resumed the U.S. banking / FDIC lane**
   - Checked current `main` state and confirmed the next highest-value live data lane was FDIC RSSD / CRA enrichment.

2. **Fixed `scripts/sync-fdic-rssd-cra.mjs`**
   - Added explicit pagination against the FDIC financials API using `limit` + `offset`.
   - Added explicit range-based pagination for the Supabase `institutions` lookup so the sync no longer silently stops at the first `1000` FDIC institutions.

3. **Reran the FDIC RSSD / CRA sync against prod Supabase**
   - `node scripts/sync-fdic-rssd-cra.mjs`
   - Result:
     - `reporting_date=2025-12-31`
     - `matched_institutions=4408`
     - `rssd_upserts=4408`
     - `cra_upserts=0`

4. **Verified build**
   - `npm run build` passed after the script fix.

### What Broke / What I Fixed
- **FDIC RSSD / CRA sync only matched `1000` institutions**
  - Cause 1: the FDIC financials request assumed a single oversized `limit` call would return the full latest-quarter set.
  - Cause 2: the Supabase institution lookup also only loaded the first `1000` FDIC institutions.
  - Fix: paginated both sides explicitly.

- **FDIC enforcement sync still fails**
  - `node scripts/sync-fdic-enforcement.mjs`
  - Current failure:
    - `404 Cannot GET /api/enforcement`
  - Meaning: the script is pointed at a non-working FDIC endpoint and needs to be rebuilt around a verified official machine-readable source or a different official scraping path.

### What Worked
- Full FDIC RSSD coverage is now loaded for all FDIC institutions in prod.
- The repo still builds cleanly on `main`.

### What's Left / Blocked
1. **FDIC enforcement**
   - The currently configured endpoint is dead.
   - Rework is needed before enforcement can be treated as a live warehouse source.

2. **FFIEC**
   - FFIEC CDR still needs credentials or a panel file.
   - FFIEC NIC still needs local ZIP files.

3. **Prod warehouse depth**
   - `ecosystem_entities`, `entity_relationships`, `macro_series`, and `bank_capabilities` are still the next major live-fill targets.

## 2026-04-05 — Codex (Warehouse Backfill + API Smoke Test + Deploy Check)

### What I Did
1. **Verified production deploy status**
   - Vercel project is live and a fresh production deployment completed successfully:
     - `https://data-studio-hetpoxgbw-tariquek-4483s-projects.vercel.app`
     - aliased to `https://data-studio-mu.vercel.app`
   - Important: `data.fintechcommons.com` still does **not** resolve because the domain DNS is misconfigured in Vercel (`A data.fintechcommons.com 76.76.21.21` missing, or nameservers not delegated).

2. **Ran the entity warehouse backfill against prod Supabase**
   - `node scripts/backfill-entity-warehouse.mjs`
   - Result:
     - `registry_entities=1033`
     - `entity_external_ids=21783`
     - `entity_tags=21197`
     - `entity_facts=1033`
     - `financial_history_quarterly=35220`
     - `branch_history_annual=4336`

3. **Ran FDIC failures sync**
   - `node scripts/sync-fdic-failures.mjs`
   - Result:
     - `failure_events=3626`
     - latest failure date `2026-01-30`

4. **Ran FDIC history sync**
   - `node scripts/sync-fdic-history.mjs`
   - Final result after fixes:
     - `charter_events=30145`
     - matched institutions `4407`
     - latest event date `2026-04-01`

5. **Added `.env.example`**
   - Includes required app/Supabase vars plus optional FFIEC/FDIC/CFPB/local sandbox vars.

6. **Smoke-tested requested endpoints via local Vercel runtime**
   - `/api/qa/status` → `200`, `healthy`
   - `/api/institutions/search?q=chase` → `200`, `7` institutions
   - `/api/entities/search?q=bank` → `200`, `24` results on page 1, `5445` total
   - `/api/analytics/overview` → `200`, `total_institutions=10076`, `charter_events=30145`, `failure_events=3626`
   - `/api/sources` → `200`, `22` sources

### What Broke / What I Fixed
- **`scripts/sync-fdic-history.mjs` failed after fetching all rows**
  - Cause: `updateDataSourceSnapshot` was called but never imported.
  - Fix: imported it.

- **FDIC history coverage was incomplete (`5211` events / `770` institutions)**
  - Cause: Supabase lookup used `.limit(20000)`, but only `1000` rows were actually returned in practice.
  - Fix: replaced the lookup with explicit range-based pagination for `institutions` and `entity_external_ids`.

- **`/api/entities/search` 500ed**
  - Cause: entity service sent very large `.in(...)` queries for UUIDs/cert lists, which caused PostgREST fetch failures.
  - Fix: batched large `.in(...)` lookups in [lib/entity-service.ts](/Users/tarique/projects/data-studio/lib/entity-service.ts).

- **Vercel-specific TS2835 warnings**
  - Cause: some server-side type imports were missing explicit `.js` extensions under Node ESM resolution.
  - Fix: normalized imports in `lib/entity-service.ts`, `lib/source-service.ts`, `lib/source-registry.ts`, and `lib/fdic-client.ts`.

### What Worked
- Prod Supabase warehouse tables are now seeded and queryable.
- FDIC failures and FDIC history warehouse layers are populated.
- Requested API smoke tests are green.
- Local `npm run build` passes.
- Fresh Vercel production deployment completed.

### What's Left / Blocked
1. **Fix custom domain DNS**
   - `data.fintechcommons.com` is still not pointed correctly at Vercel.

2. **FFIEC / extended sources**
   - FFIEC CDR still needs credentials or a panel file.
   - FFIEC NIC still needs local ZIP files.

3. **Warehouse depth still to do**
   - `ecosystem_entities`, `entity_relationships`, `macro_series`, and `bank_capabilities` are still empty in prod.

## 2026-04-05 — Claude (Migrations + Merge to Main)

### What I Did
1. **Ran 4 migrations against prod Supabase** (project `bvznhycwkgouwmaufdpe`):
   - `add_entity_warehouse_foundation` — 10 new tables: registry_entities, ecosystem_entities, entity_external_ids, entity_tags, entity_facts, entity_relationships, charter_events, financial_history_quarterly, branch_history_annual, macro_series
   - `add_bank_capabilities` — bank_capabilities table (card networks, BaaS, Fed access)
   - `add_failure_events` — failure_events table (FDIC failure history)
   - `add_pg_trgm_fuzzy_search` — pg_trgm extension + GIN trigram indexes on institution/entity names + common query indexes on institutions(state, total_assets, charter_type)

2. **Merged `codex/entity-intelligence-foundation` → `main`** — Fast-forward, 93 files, +17,665 lines, zero conflicts

3. **Pushed to origin/main** — Vercel deploy triggered

4. **Updated CLAUDE.md** — Was stale (described 4-page early project), now reflects full 125-file platform

5. **Created coordination files**: AGENTS.md (Codex auto-reads), CODEX.md (full technical brief), HANDOFF.md (this file)

### Prod Supabase State (19 tables)
| Table | Rows | RLS |
|-------|------|-----|
| institutions | 10,082 | Yes |
| financial_history | 38,116 | Yes |
| branches | 74,750 | Yes |
| sync_jobs | 22 | Yes |
| data_sources | 19 | No |
| registry_entities | 0 | Yes |
| ecosystem_entities | 0 | Yes |
| entity_external_ids | 0 | Yes |
| entity_tags | 0 | Yes |
| entity_facts | 0 | Yes |
| entity_relationships | 0 | Yes |
| charter_events | 0 | Yes |
| financial_history_quarterly | 0 | Yes |
| branch_history_annual | 0 | Yes |
| macro_series | 0 | Yes |
| bank_capabilities | 0 | Yes |
| failure_events | 0 | Yes |
| saved_searches | 0 | Yes |
| ai_summaries | 0 | No |

### What's Next (for Codex or Claude)
1. **Verify Vercel deploy succeeded** — check data.fintechcommons.com or Vercel dashboard
2. **Populate entity warehouse** — Run `scripts/backfill-entity-warehouse.mjs` to seed registry_entities from existing institutions
3. **Run failure sync** — `scripts/sync-fdic-failures.mjs` to populate failure_events
4. **Run FDIC history sync** — `scripts/sync-fdic-history.mjs` to populate financial_history_quarterly
5. **Add `.env.example`** — still missing
6. **API pagination** — search/screener endpoints return unbounded results
7. **Data freshness badges** — UI doesn't show when data was last synced

### What Worked
- All 4 migrations applied cleanly via Supabase MCP
- Fast-forward merge — no conflicts (entity branch was purely additive)
- Build passes on main post-merge

### Decisions Still Needed (from Tarique)
1. Do you have FFIEC CDR credentials? If not, skip CDR ingestion for now.
2. Want to run the entity backfill scripts now, or let Codex handle it?
3. Confirm Vercel deploy is healthy

---

## 2026-04-05 — Claude (Initial Analysis)

### Project State
- **Branch `codex/entity-intelligence-foundation`**: 20 commits ahead of main, +17,665 lines, 93 files changed. Clean build, clean working tree.
- **Branch `main`**: 8 commits. Core platform (search, analytics, institution profiles).
- **Both pushed to origin** — no data loss risk, but the entity branch needs to merge.

### What Exists
- 125 frontend files (47 components, 13 pages)
- 40 API endpoints (institutions, entities, analytics, sources, sync, QA)
- 20+ ingestion scripts (FDIC, NCUA, OSFI, RPAA, OCC, CFPB, FFIEC stubs)
- Local Postgres sandbox setup
- Husky pre-push TypeScript checks
- Quarterly FDIC cron via Vercel

### What's Missing / Broken
- [ ] **Unknown: Do entity_warehouse tables exist in prod Supabase?** — Must verify before merging to main. If they don't exist, entity API routes will 500 in production.
- [ ] **No `.env.example`** — new contributors have to guess env vars
- [ ] **CLAUDE.md is stale** — describes early project state, not current 125-file platform
- [ ] **FFIEC CDR** — registered in source registry but not implemented (needs credentials)
- [ ] **FFIEC NIC** — registered but not implemented (needs manual ZIP download, CAPTCHA)
- [ ] **No `pg_trgm`** — fuzzy name search won't match "JPMorgan" → "JP Morgan Chase"
- [ ] **No materialized views** — analytics endpoints will slow down past 50K rows
- [ ] **No API pagination** — screener/search can return unbounded result sets
- [ ] **No data freshness badges in UI** — users can't tell if data is current
- [ ] **Deduplication across sources** — same bank appears in FDIC + OCC + FFIEC with different IDs
- [ ] **Bank merger chains** — no `successor_cert` field to track mergers
- [ ] **Null normalization** — government APIs return -1, 0, "" for "not reported" — needs normalization to null

### Decisions Needed (from Tarique)
1. Do you have FFIEC CDR credentials? If not, skip CDR for now.
2. Confirm entity_warehouse tables are live in Supabase before merging.
3. Should the merge happen now or after more testing on the branch?

### Recommendations for Codex (Next Session)
1. **First**: Query Supabase to check if entity tables exist (`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`)
2. **If yes**: Merge entity branch → main, push, verify Vercel deploy
3. **If no**: Run migration SQL from codebase, then merge
4. Create `.env.example`
5. Add `pg_trgm` extension + GIN index on institution name
6. Add LIMIT/OFFSET pagination to search and screener endpoints
7. Add `data_as_of` display to source-backed UI components

---

<!-- Codex: add your entries above this line, newest first -->
