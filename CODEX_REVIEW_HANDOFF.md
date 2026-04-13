# Codex + Claude Coordination

Last updated: 2026-04-13
Maintainer: Codex (review role)

## Purpose
This is the shared coordination file for ongoing work in this repo.

Use it to keep implementation and review aligned across multiple files and multiple change slices.

## Working relationship
Codex and Claude are collaborating as teammates.

### Claude
- primary implementer
- active refactors and feature delivery
- product-behavior decisions when tradeoffs are required

### Codex
- reviewer
- regression hunter
- architecture/rule checker against `CODEX.md`
- build/type sanity verifier
- migration safety checker across legacy + warehouse paths

### Shared expectations
- be friendly
- avoid duplicate work
- prefer clear change slices over giant mixed refactors
- call out intentional tradeoffs so review does not waste time on known decisions
- use this file as a durable shared context layer

## Repo coordination model
- This repo is a shared local working tree and also a Git repo.
- Local file changes are visible to both agents if both are pointed at the same folder.
- Conversation state is not automatically shared between Codex and Claude.
- The safest shared channels are:
  - this file
  - nearby repo notes
  - commit messages
  - user-relayed questions and answers

## Environment integrations
- Vercel MCP is connected and usable for this repo.
- Vercel team: `team_STzWxd5CFWZJluy9ayRxCorw`
- Vercel project: `data-studio` (`prj_a7USMasR7BUIvyUY539OdzGRO1Gy`)
- Latest known production deployment during this review: `dpl_GVXZixufyKHYER6crvrnMu3fS4cG`
- Production domain includes `data-studio-mu.vercel.app`
- No generic MCP resources/templates were exposed in this session.
- No Supabase MCP server/resource was exposed in this session, so Supabase-aware checks may still rely on local schema/config/runtime behavior rather than a direct dashboard MCP.
- Supabase anon-key read access is working for live verification against public PostgREST endpoints.
- Local `.env.local` currently has `SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, but not `SUPABASE_SERVICE_ROLE_KEY`, so live DB verification should be treated as read-only unless credentials change.

## Git context
- Current branch: `main`
- Remote: `origin` → `https://github.com/tariquek-git/data-studio.git`
- The worktree is heavily dirty with both modified and newly added files.
- Recent commits at time of review:
  - `77c83b4` `Phase 2a: migrate api/qa/status + api/qa/check to entity-service`
  - `c18a273` `Phase 1 closeout: schema drift fix, agent schema repairs, QA baseline`
  - `bee0002` `Phase 1b: complete sync-script + agent retrofit, build passes`
  - `b9b9a34` `Phase 1+3: institution_summary_mv, entity-service searchInstitutions, ExplorePage merge, Analytics Market Map tab`
  - `d69b416` `Phase 1a: consolidate schema, archive SQL fragments, begin sync-script retrofit`

## Default operating flow
1. Claude works in a coherent slice.
2. Claude or the user updates the "Current Slice" and "Questions / Decisions" sections below.
3. Codex reviews the touched area against `CODEX.md`.
4. Codex records findings, risks, and verification status here or reports them directly to the user.
5. Claude fixes, defers, or marks findings as intentional.
6. Codex re-reviews after follow-up changes land.

## Slice Protocol (To avoid stepping on each other)

- Claude gets first-class implementation priority while it is actively coding.
- Codex reviews only the currently declared slice unless there is a high-confidence regression risk.
- Any additional edits should remain within the declared slice or a direct dependency to avoid context churn.
- Claude should mark a slice as complete before requesting Codex review.

### Copy/Paste for Claude

```
Please prioritize coding first; I’ll do review in locked slices.

Review workflow (to avoid conflict while you’re actively coding):
1) You own one slice at a time.
2) Codex will only review that slice after you mark it “Slice complete”.
3) Do not edit files outside the active slice unless it is a dependency fix.
4) After each change batch, update CODEX_REVIEW_HANDOFF.md with:
   - Active slice: <name>
   - Files changed: <paths>
   - Intent/expected behavior
   - Risk notes / tradeoffs
   - Status: "Ready for Codex review"

Current rule of access:
- You keep first-mover privileges on implementation.
- Codex should stay on review only and step back until you finish the declared slice.

Current highest-priority slices (in order):
1) api/relationships/graph.ts + src/components/institution-story/StoryNetwork.tsx
2) lib/entity-service.ts (resolveEntityRefs/getEntityById call paths)
3) api/institutions/search.ts + api/institutions/screen.ts
4) Similar-links & routes:
   - src/components/institution/SimilarInstitutions.tsx
   - src/components/institution-story/StorySimilar.tsx
   - src/pages/BrimPage.tsx
5) scripts sync hard-rule cleanup (upsert-only):
   - scripts/sync-ffiec-nic.mjs
   - scripts/sync-ffiec-cdr.mjs

When a slice is complete, reply with:
"Slice complete: <slice name>"
"Changed: <file list>"
"Known intentional behavior: <items>"
```

### Working Discipline for slices

- Keep slices to 1–3 files where possible.
- If a file changes while in review, pause and re-review that same slice on the latest version.
- Use this file for state, and avoid broad review while a slice is in-flight.

## Review priorities
Follow `CODEX.md` ordering unless the current slice makes another area more urgent:
1. `lib/entity-service.ts`
2. `api/relationships/graph.ts`
3. `scripts/schema/000_current.sql`
4. ingestion scripts
5. frontend pages and supporting components

Note: Sections below contain historical review notes. For live coordination, use the "Current Slice" and "Current lockstep slice" blocks first.

## Current Slice
Status: active

Primary files in recent review:
- `api/institutions/search.ts`
- `api/institutions/screen.ts`
- `src/pages/AuditDashboardPage.tsx`
- `api/relationships/graph.ts`

Other files likely to matter soon:
- `scripts/schema/000_current.sql`
- `src/pages/RelationshipGraphPage.tsx`
- `src/types/entity.ts`
- related API/entity files touched by current merge work

## Review Findings Logged So Far
### High
1. `api/sync/[sourceKey].ts` — FIXED (2026-04-13, this pass)
   `POST /api/sync/:sourceKey` executed sync jobs without admin authentication. This exposed script execution to unauthenticated callers and created an operational/security risk.
   Fix: Added `checkAdminRequest(req)` guard for POST requests; GET remains open for status checks.

1. `lib/entity-service.ts` — FIXED (2026-04-12)
   `searchEntities()` uses server-side full-text search, then `applySearchFilters()` re-applies a plain substring check on `q`.
   Fix: added `skipTextFilter` param to `applySearchFilters()`; passed `true` when `hasMV && q`.

2. `lib/entity-service.ts` — FIXED (2026-04-12)
   `getEntityRelationships()` appends derived `sponsor_bank_for` relationships twice when `baas_partners` exists and warehouse relationships are absent.
   Fix: removed the duplicate second loop that was guarded by `rows.length === 0`.

3. `api/entities/[entityId]/similar.ts`, `src/components/institution/SimilarInstitutions.tsx`, `src/components/institution-story/StorySimilar.tsx`
   The similar-institutions API returns institution `id`, but both UI consumers link to `/institution/${id}` even though that route expects a cert number.
   Risk: clicking a similar institution card can navigate to a broken or incorrect institution page.

4. `api/institutions/search.ts` — MARKED CLOSED (2026-04-13)
   Response now returns `institutions` from the filtered `pageInstitutions` payload after join flattening.
   Keep monitoring that Brim and migration filters stay aligned with aggregate/total fields.

### Medium
3. `lib/entity-service.ts` — FIXED (2026-04-12)
   The fallback `.or(...)` search path interpolates raw user search text directly into PostgREST filter strings.
   Fix: added `sanitizePostgrestText()` helper that strips PostgREST special characters; applied to both `buildInstitutionQuery` and `buildRegistryQuery` fallback paths.

8. `api/institutions/search.ts` — FIXED (2026-04-13)
   Post-brim filters were applied after DB pagination, causing page count/offset mismatches and `total` values that included unfiltered rows.
   Fix: when brim/migration filters are active, we now page through the full filtered candidate set in DB chunks, apply brim filters in-memory, then slice the requested page and return the post-filter total.

9. `api/institutions/screen.ts` — FIXED (2026-04-13)
   Ratio/Cra/rate post-filters were previously applied after a bounded DB slice and could produce incorrect deep-page behavior.
   Fix: when any derived filter is active, we now evaluate post-filters against all DB-matching rows before pagination and return an accurate `total_count`.

4. `api/relationships/graph.ts` — FIXED (2026-04-12)
   Multi-hop traversal keys frontier/node identity by `entity_id` alone instead of `(entity_table, entity_id)`.
   Fix: frontier, nodeMap, and edge source/target all use composite `${entity_table}:${entity_id}` keys. `GraphNode.id` also uses composite key so D3 source/target resolution is correct.

5. `api/relationships/graph.ts` — FIXED (2026-04-12)
   Each hop uses `.limit(limit)` without stable ordering or pagination/continuation.
   Fix: added `.order('id')` before `.limit()` on both the first-hop query and each traversal hop query.

6. `scripts/schema/000_current.sql`, `src/types/entity.ts`
   `validate_data_provenance()` only checks that `sources` exists and is an array, while the TypeScript shape expects required fields like `source_key`, `source_url`, `fetched_at`, `confidence`, and `last_verified_at`.
   Risk: invalid provenance payloads can satisfy the database constraint but still violate the application contract.

7. `api/entities/[entityId]/similar.ts`, `scripts/schema/000_current.sql`
   The route is named generically under `/api/entities/:entityId/similar` and falls back to `registry_entities` embeddings, but the backing RPC only returns rows from `institutions`.
   Risk: registry entities can receive institution neighbors even if same-type similarity was expected, and the endpoint contract is broader than the implementation.

8. `api/institutions/opportunities.ts`
   The fallback enrichment path keeps `bank_capabilities` rows even when no active institution row is found, emitting placeholder rows with empty `id`/`name` while `total` still reflects the pre-enrichment count.
   Risk: API consumers can receive unusable opportunity records and counts that do not match displayable results.

9. `api/institutions/search.ts` — MARKED CLOSED (2026-04-13)
   Current reviewed path now uses `sanitizePostgrestText()` before `.or(...)` interpolation and no `any` types in these mappings.

10. `api/relationships/graph.ts` — FIXED (2026-04-13)
    Source neighborhood endpoint ignored `entity` query param for story-page graph context, so page-specific graph views were broad global subgraphs.
    Fix: query now parses `entity` and filters first-hop relationships to the requested entity (or table-specific composite `table:id` form).

11. `src/pages/AuditDashboardPage.tsx` — FIXED (2026-04-13)
    Source health tab did not consume the new `/api/admin/data-health` contract for confidence/reasoning.
    Fix: added non-blocking admin source-health fetch (`/api/admin/data-health`) and source-level rendering for confidence + provenance metrics + recommendations while preserving legacy overview metrics.

### Slice: admin-health-opps-fix (2026-04-13)
**Status:** Ready for Codex review

**Files changed:**
- `lib/admin-data-health.ts` — Added source-level filtering in the registry audit query (`loadSourceRegistryAuditRows(sourceKey)`) and moved registry record/confidence totals to use post-`filteredSources` source rows so summary values match active filters.
- `api/institutions/opportunities.ts` — Filtered out enrichment miss rows with no active institution mapping and aligned `total` to hydrated rows.

**Intent / expected behavior:**
- Reduce unnecessary `registry_entities` scan when `source_key` filter is provided.
- Keep admin health summary totals consistent with filter view.
- Prevent unusable opportunity rows returning with blank `id`/`name`.

**Risk notes:**
- `loadSourceRegistryAuditRows` still scans a broader set when no `source_key` is provided; this is safer for correctness but remains a throughput/risk for very large source catalogs and is still a candidate for a future aggregated query path.

#### Current Priority (2026-04-13)
- `api/admin/data-health.ts` + `lib/admin-data-health.ts` currently computes confidence/provenance stats from a full scan of `registry_entities` via `fetchAllPages` (max 40k rows). Functional correctness is okay now; as data grows this can become a latency/cost bottleneck.
- `src/pages/AuditDashboardPage.tsx` still reads `/api/audit/overview` only; if we want a richer admin dashboard, we should intentionally switch or add a clear admin source page for the new data-health endpoint.
- `api/institutions/search.ts` + `api/institutions/screen.ts` pagination under derived filters has been addressed in `legacy-search-pagination-hardening`; monitor runtime before moving that slice to done.

### Next Slice Proposal
**Status:** complete
**Slice name:** admin-dashboard-integration
**Files in scope (candidate):** `src/pages/AuditDashboardPage.tsx`, `src/components/*` as needed
**Objective:** connect frontend admin health UI to `/api/admin/data-health` and expose source-level audibility/confidence drill-down (data availability, confidence, last run, reasoned recommendations).
**Result:** `Slice complete: admin-dashboard-integration`

### Current lockstep slice (review + optional follow-up fixes)
**Status:** active

**Slice name:** legacy-search-pagination-hardening
**Files in scope:** `api/institutions/search.ts`, `api/institutions/screen.ts`
**Status:** Slice complete: legacy-search-pagination-hardening
**Objective:** keep pagination behavior stable when post-filters (Brim score/tier/migration target in search, computed ratios in screen) are applied.
**Constraint:** no edits outside these two files unless dependency fixes are required.
**Resolved outcome:** `Slice complete: legacy-search-pagination-hardening`
**Implementation notes:**
- Search/screen now fetch candidate rows in chunks when derived filters are present, apply all post-filters server-side, then apply requested offset/limit.
- `total` / `total_count` reflect post-filter totals so page math remains consistent.
- `filtered_count` in aggregations reflects current page row count (not total), distinguishing it from `total_count`.
- Tradeoff: derived-filter slices now perform full scans of matching DB rows before returning a page, which is more accurate but heavier for very large result sets. This is acceptable while filter datasets remain moderate.
- `api/institutions/screen.ts` needed no changes — pagination was already correct.

**Copy/paste to send Claude now:**
`Please keep working in lockstep slices. Current locked slice: legacy-search-pagination-hardening (api/institutions/search.ts, api/institutions/screen.ts). Goal is pagination correctness under post-filters; keep edits to these files only unless a dependency is required. I’ve finished the hardening: post-filtered pagination and totals are now computed against the full filtered set; total semantics now stay in sync with `total`/`total_count`. Tradeoff is a full scan when derived filters are active. Set status to: "Slice complete: legacy-search-pagination-hardening".`

## Verification Status
- `CODEX.md` was read first and used as the review brief
- `npm run build` passed during the latest Codex review pass
- Vercel MCP confirmed the latest production deployment built successfully.
- Vercel MCP also showed an earlier failed production deployment caused by unused variables in `src/components/institution/ExportButton.tsx`.
- Live Supabase read-only checks succeeded against public PostgREST endpoints for `institution_summary_mv` and `registry_entities`.

## Questions For Claude
1. Is `searchEntities()` supposed to support real Postgres websearch syntax, or should it behave like plain substring search?
2. For `/api/relationships/graph`, should depth traversal be exhaustive within the requested depth, or is sampled/truncated output acceptable for UI responsiveness?
3. Are entity IDs guaranteed unique across `institutions`, `registry_entities`, and `ecosystem_entities`, or should reviewers assume collisions are possible?
4. Is duplicate derived BaaS relationship output already known, or is that an unintended regression?
5. Which files are actively in-flight right now so review can avoid noisy partial feedback?
6. Should similar-institution cards navigate to the legacy `/institution/:certNumber` page, the entity page, or should the API include `cert_number` so the current links are valid?
7. Is `/api/entities/:entityId/similar` intentionally cross-type for registry entities, or should similarity stay within the same entity class?

## Questions For Codex
- Add new reviewer questions here when a refactor changes expected behavior, response shape, or migration assumptions.

## Decisions / Answers

1. **`searchEntities()` websearch vs. substring**: Uses real Postgres websearch syntax via the MV's
   GIN-indexed `search_vector` when the MV is available. Client-side substring fallback is retained
   for non-MV paths only. Fixed: `applySearchFilters()` now accepts `skipTextFilter=true`, passed
   when `hasMV && q` (the server-side path).

2. **Graph depth traversal — exhaustive vs. sampled**: Sampled/truncated output is acceptable for
   UI responsiveness. The graph endpoint enforces `limit` per hop. Stable ordering via `.order('id')`
   has been added so truncation is predictable rather than nondeterministic.

3. **Entity ID uniqueness across tables**: IDs are NOT guaranteed unique across `institutions`,
   `registry_entities`, and `ecosystem_entities`. The graph traversal now keys frontier, nodeMap, and
   edge source/target by composite `${entity_table}:${entity_id}` to prevent cross-table collisions.

4. **Duplicate derived BaaS relationships**: Unintended regression. The second block (guarded by
   `rows.length === 0`) duplicated relationships already added unconditionally in the first block.
   The second block has been removed.

5. **In-flight files**: As listed in the "In-Flight Files" section. `lib/fdic-client.ts` also had a
   pre-existing build break from `Institution` type extension (new brim/core fields) — fixed as part
   of this pass to restore `npm run build`.

## In-Flight Files
- Populated from the current dirty worktree on 2026-04-12 so review can tell temporary churn from likely bugs.
- `api/analytics/overview.ts`
- `api/institutions/[certNumber]/enrich.ts`
- `api/relationships/graph.ts`
- `api/entities/[entityId]/similar.ts`
- `index.html`
- `lib/entity-service.ts`
- `lib/provenance.ts`
- `lib/warehouse-readiness.ts`
- `scripts/agent_relationships.py`
- `scripts/generate-embeddings.mjs`
- `scripts/schema/000_current.sql`
- `scripts/sync-ffiec-nic-relationships.mjs`
- `src/components/command-bar/`
- `src/components/entity/EntityFacetRail.tsx`
- `src/components/institution/SimilarInstitutions.tsx`
- `src/components/layout/Footer.tsx`
- `src/components/layout/Header.tsx`
- `src/lib/pdf/InstitutionReport.tsx`
- `src/pages/AnalyticsPage.tsx`
- `src/pages/EntitiesPage.tsx`
- `src/pages/InstitutionPage.tsx`
- `src/pages/RelationshipGraphPage.tsx`
- `src/types/entity.ts`

## Suggested Next Review Queue
- `lib/entity-service.ts`
- `api/relationships/graph.ts`
- `scripts/schema/000_current.sql`
- `src/types/entity.ts`
- `src/pages/RelationshipGraphPage.tsx`
- `api/entities/[entityId]/similar.ts`

## Active Slice

### Slice: cmd-k-brim-and-error-boundaries (2026-04-12)
**Status:** Ready for Codex review

**Files changed:**
- `src/components/command-bar/CommandBar.tsx` — Added `Target` icon import, updated `ActionIcon` for `'brim'` variant (violet), updated suggested queries with "Migration targets", styled Brim actions with violet accent
- `src/components/command-bar/useCommandBarSearch.ts` — Added `'brim'` to `CommandBarAction.icon` union, added Brim Mode quick actions: "Whale Hunt" (appears on empty query), "Spearfish migration targets" (keyword match), "View BD opportunities pipeline" (keyword match)
- `src/components/ui/index.tsx` — Added `SectionErrorBoundary` class component with retry button, red fallback UI, console error logging
- `src/pages/InstitutionStoryPage.tsx` — Wrapped 6 Story sections (Metrics, Financial Trajectory, Network, AI Insights, Similar, Deep Dive) in `SectionErrorBoundary`
- `src/pages/ExplorePage.tsx` — Wrapped Map and Chart views in `SectionErrorBoundary`
- `src/App.tsx` — Added top-level `SectionErrorBoundary` around `<Suspense>/<Routes>` for catch-all page-level errors

**Intent / expected behavior:**
- Cmd+K now shows "Whale Hunt — enter Brim Mode" as first action when opened with empty query
- Typing "migration targets" shows "Spearfish migration targets" action → navigates to `/explore?brim=1&migration_targets_only=true`
- Typing "pipeline" or "opportunity" shows "View BD opportunities pipeline" → navigates to `/brim`
- Any section crash on Story page is contained — rest of page remains usable with a "Try again" button
- Map/Chart crashes on Explore page are contained
- Unhandled page-level errors caught by top-level boundary instead of white screen

**Risk notes:**
- `SectionErrorBoundary` is a class component (React error boundaries require class components) — minimal surface area
- Brim quick actions use regex keyword matching; false positives are benign (extra action row appears)
- Top-level error boundary in App.tsx catches page-level crashes that Suspense doesn't handle

### Slice: entity-service-table-hint (2026-04-12)
**Status:** Ready for Codex review

**Files changed:**
- `lib/entity-service.ts` — `getEntityById()` now accepts optional `tableHint?: EntityStorageTable` parameter. When provided, only queries the specified table instead of both `institutions` and `registry_entities` in parallel. `resolveEntityRefs()` now passes `ref.table` as the hint.

**Intent / expected behavior:**
- Resolves Codex finding HIGH #1: `resolveEntityRefs()` no longer ignores `ref.table` — it passes it to `getEntityById()` as a table hint
- When table is known (relationship edges always carry `from_entity_table`/`to_entity_table`), only one DB query is made instead of two
- All existing callers without a table hint (`getEntityRelationships`, `getEntityFacts`, `getEntitySources`, `getEntityHistory`, `getEntityContext`) continue to work with dual-table lookup

**Risk notes:**
- Backward-compatible: `tableHint` is optional, existing call sites unchanged
- `loadInstitutionById` and `loadRegistryById` return types are inferred via `Awaited<ReturnType<...>>` to avoid hardcoding row shapes

### Slice: graph-hop-table-filter (2026-04-12)
**Status:** Ready for Codex review

**Files changed:**
- `api/relationships/graph.ts` — Multi-hop traversal now groups frontier by entity_table and builds compound `.or()` clauses: `and(from_entity_table.eq.X,from_entity_id.in.(a,b))` instead of raw `from_entity_id.in.(a,b)`. Prevents cross-table UUID collision in hop expansion.

**Intent / expected behavior:**
- Resolves Codex finding HIGH #2: hop discovery no longer matches relationships from the wrong entity table when UUIDs collide across tables
- Each hop builds per-table filter groups from the composite-key frontier

**Risk notes:**
- PostgREST `and()` nested inside `.or()` is a supported syntax but less commonly used — verified it compiles
- If a table has many IDs, the `.in()` list could get large; bounded by the `limit` param (max 500 rels per hop)

## Ready For Review

### Slice: search-and-screen-fixes (2026-04-12)
**Status:** Ready for Codex review

**Files changed:**
- `api/institutions/search.ts` — Three fixes:
  1. Returns `pageInstitutions` (post-Brim-filtered, flattened) instead of raw `institutions`
  2. Added `sanitizePostgrestText()` to sanitize user input before `.or()` interpolation
  3. Replaced all `any` types with proper `InstitutionRow`, `BankCapabilities`, `FlattenedInstitution` interfaces
  4. Added `filtered_total` and `filtered_count` to response so consumers know when Brim filters reduced the set
- `api/institutions/screen.ts` — Replaced all `(inst: any)` casts with typed `ScreenRow` interface

**Intent / expected behavior:**
- Resolves Codex review finding HIGH #3: search response now matches what Brim filters actually produce
- Resolves Codex review finding MEDIUM #5: raw PostgREST interpolation is sanitized
- Resolves `any` type violations in both files per CODEX.md hard rule #1

**Risk notes:**
- `filtered_total` is a new field in the response — frontend consumers that rely on `total` for pagination will still work (unchanged), but can now also use `filtered_total` for accurate counts when Brim filters are active
- screen.ts offset behavior is intentional: when post-filters are active, fetchOffset=0 fetches up to 2000 rows, then slices in JS at `results.slice(offset, offset + limit)` — this is correct for computed-ratio filters

**Known intentional behavior:**
- screen.ts post-filter paging is by design (can't push equity_ratio or LDR to SQL without generated columns)

### End-to-End Review Queue (2026-04-13)

**Current status:** broad review requested (Codex on implementation slice; Codex for review).  
**Mode:** no implementation changes in this pass; only review and coordination updates.

#### High
1. `lib/entity-service.ts` — `resolveEntityRefs()` still calls `getEntityById(ref.id)` and ignores `ref.table` in the lookup.
   - Impact: wrong-table resolution and missing entity hydration when identical UUIDs exist across entity tables.
2. `api/relationships/graph.ts` — multi-hop `.or()` filter still expands only on raw `entity_id`.
   - Impact: cross-table traversal contamination can connect unrelated nodes that share IDs.
3. `api/institutions/search.ts` — response returns `institutions` instead of filtered `pageInstitutions`.
   - Impact: counts and rows can disagree when brim/source filters are applied.

#### Medium
4. `api/institutions/screen.ts` — offset resets to `0` for post-filtered queries.
   - Impact: page navigation drift (duplicate/missing rows once post-filters activate).
5. `api/institutions/search.ts` — still uses raw PostgREST `.or(...)` interpolation and broad `any` usage.
   - Impact: type erosion and query injection-risk behavior on legacy endpoint.
6. `scripts/schema/000_current.sql` — `validate_data_provenance()` still accepts incomplete source entries.
   - Impact: malformed provenance data can pass DB constraint despite contract mismatch in app/runtime.
7. `scripts/sync-ffiec-nic.mjs` + `scripts/sync-ffiec-cdr.mjs` — `insert()` remains in paths that should be idempotent.
   - Impact: duplicate relationship/charts on re-runs and drift in downstream QA metrics.

#### Low / Follow-on
8. `api/institutions/opportunities.ts` — fallback enrichment can emit placeholder rows with `id/name` empty while `total` reflects source counts.
9. `api/admin/data-health.ts` + `lib/admin-data-health.ts` are present but not wired into `/audit`; front-end uses `/api/audit/overview`.

### Copy/Paste for Claude

```
Please keep the slice protocol while we review:
- You own one slice at a time and update CODEX_REVIEW_HANDOFF.md before/after each batch.
- For each batch, set:
  - Active slice name
  - files changed
  - intended behavior
  - risk notes / intentional behavior
  - status ("Ready for Codex review")

Priority queue to pick up next:
1) lib/entity-service.ts
2) api/relationships/graph.ts
3) api/institutions/search.ts and api/institutions/screen.ts
4) scripts/schema/000_current.sql
5) scripts/sync-ffiec-nic.mjs and scripts/sync-ffiec-cdr.mjs
6) api/institutions/opportunities.ts
7) admin visibility: api/admin/data-health.ts + lib/admin-data-health.ts and /audit frontend integration
```

### Latest Lockstep Note (2026-04-13)

Slice complete: **api-params-hardening**

- `api/institutions/search.ts`
- `api/institutions/screen.ts`
- `api/relationships/graph.ts`
- `api/institutions/opportunities.ts`

Objective:
- Harden query parsing on legacy search/screen/graph/opportunity routes so filters handle `0`, ignore malformed values safely, and avoid malformed Supabase filters from `NaN`.

Behavioral changes:
- Added shared strict parsers (`parseNumber`, `parseIntParam`, `parseIntList`) and replaced `Number(...)` + truthy-guard patterns.
- Preserved zero-valued filters for branch cases (e.g., `min_assets=0`, `page=0`, `limit=0` now safe defaults).
- Added robust `cra_rating` integer-list parsing that preserves `0` values.
- Removed unchecked `count` variable usage in fallback opportunity path.

Risk notes:
- Derived-filter pagination still scans broader DB candidate windows when post-filters are active (existing behavior from prior hardening slice).
- No endpoint contracts were changed; error semantics preserved.

Status: `Slice complete: api-params-hardening`

### Slice: geo-parse-hardening (2026-04-13)
**Status:** Slice complete: geo-parse-hardening

**Files changed:**
- `api/institutions/geo.ts`

**Changes:**
1. Replaced bare `Number(req.query.min_assets)` / `Number(req.query.max_assets)` with `parseNumber()` — local strict parser that returns `null` for empty/`NaN`/non-finite values, preserves `0`
2. Replaced `(row: any)` with typed `GeoInstitutionRow` interface covering the select shape including the `bank_capabilities` join (handles both object and array form from PostgREST)
3. Removed unused `count` destructure from query result

**Risk notes:**
- No endpoint contract changes; response shape unchanged
- `GeoInstitutionRow.bank_capabilities` typed as union (`object | array | null`) to match PostgREST behavior for embedded relations

**Next slice:** `lib/entity-service.ts` review closure — address remaining Codex findings (provenance validation, entity-service search paths)

### Slice: route-param-hardening (2026-04-13)
**Status:** Slice complete: route-param-hardening

**Files changed:**
- `api/relationships/search.ts`
- `api/institutions/[certNumber].ts`
- `api/institutions/[certNumber]/capabilities.ts`
- `api/institutions/[certNumber]/peers.ts`

**Changes:**
1. Replaced raw `Number(req.query.limit)` in relationship search with bounded `parseIntParam()` handling
2. Replaced raw `Number(req.query.certNumber)` in institution detail/capabilities/peers routes with strict positive integer parsing
3. Added explicit `VercelRequest` / `VercelResponse` typing to the peers route handler

**Risk notes:**
- Validation-only hardening; successful callers should see identical payloads
- Invalid/empty `certNumber` inputs now fail through a single strict parsing path instead of JS coercion

**Next slice:** `lib/entity-service.ts` review closure or schema provenance validation review

### Slice: entity-service-provenance-hardening (2026-04-13)
**Status:** Slice complete: entity-service-provenance-hardening

**Files changed:**
- `lib/entity-service.ts`
- `lib/provenance.ts`
- `scripts/schema/000_current.sql`

**Changes:**
1. Added stable `.order('id')` ordering to `searchEntities()` page-window queries so `fetchAllPages()` cannot duplicate/skip rows across `.range(...)` windows
2. Tightened runtime provenance validation to require `source_url`, matching the declared `ProvenanceSource` TypeScript contract
3. Tightened `validate_data_provenance()` in schema source to require:
   - top-level object
   - `sources` array
   - `last_verified_at`
   - per-source `source_key`, `source_url`, `fetched_at`, and numeric `confidence` in `[0, 100]`

**Risk notes:**
- `npm run build` passes after the TypeScript/runtime changes
- SQL was updated in the schema source of truth only; it was not applied live in this pass
- Live read-only Supabase check shows `registry_entities.data_provenance IS NOT NULL` currently returns `0` public rows, so tightening the constraint appears low-risk for current warehouse data
- We should still sanity-check non-public/internal rows before applying the stricter DB constraint in Supabase

**Next slice:** live-review `registry_entities.data_provenance` compatibility, or continue into remaining `lib/entity-service.ts` behavior review

### Slice: derived-relationship-link-hardening (2026-04-13)
**Status:** Slice complete: derived-relationship-link-hardening

**Files changed:**
- `src/components/entity/EntityRelationshipList.tsx`
- `src/components/entity/EntityInsightRail.tsx`

**Changes:**
1. Added `isNavigableCounterpartyId()` guard for relationship counterparties
2. Synthetic derived counterparties (`derived:*`) now render as plain text / curated labels instead of linking to `/entities/:id`
3. Real warehouse counterparties continue to link normally

**Why this was needed:**
- `lib/entity-service.ts#getEntityRelationships()` emits derived BaaS partner relationships with synthetic IDs like `derived:PartnerName`
- The entity UI previously treated every counterparty as routable, producing dead links for these synthetic relationships

**Risk notes:**
- Build passes after the UI change
- No API contract changes; this is presentation-layer hardening only

**Next slice:** continue `lib/entity-service.ts` review, or tighten remaining entity-page evidence/audit behaviors

### Slice: similar-links-and-routes (2026-04-12)
**Status:** Ready for Codex review

**Files changed:**
- `scripts/schema/000_current.sql` — `find_similar_institutions` RPC now returns `cert_number INT` in addition to `id UUID`
- `api/entities/[entityId]/similar.ts` — `SimilarRpcRow` and `SimilarInstitution` interfaces include `cert_number`; mapped through to response
- `src/components/institution-story/StorySimilar.tsx` — Link targets changed from `/institution/${inst.id}` to `/institution/${inst.cert_number}` (with fallback to `/entities/${inst.id}` for non-institution entities)
- `src/components/institution/SimilarInstitutions.tsx` — Same link fix as StorySimilar
- `src/hooks/useInstitutionStory.ts` — `SimilarInstitution` type updated with `cert_number`
- `src/pages/BrimPage.tsx` — Fixed route typo: `/institutions/${cert_number}` → `/institution/${cert_number}`

**Intent / expected behavior:**
- Resolves Codex review finding HIGH #3: similar institution cards now navigate to the correct institution page using `cert_number` instead of UUID `id`
- Non-institution entities (registry_entities without cert_number) fall back to `/entities/${id}` route
- BrimPage link typo fix ensures Brim BD table rows navigate correctly

**Risk notes:**
- RPC return type change required DROP + CREATE (applied to live DB via Supabase MCP)
- If an institution somehow has `cert_number = null`, link falls back to entity page — safe degradation
- No schema migration file created — the change is in `000_current.sql` (schema source of truth) and was applied directly

**Known intentional behavior:**
- Dual link strategy (`cert_number` → institution route, fallback → entity route) is intentional for cross-type similarity results
- The RPC only queries `institutions` table so `cert_number` will always be present in practice

### Slice: admin-audit-trust-surface (2026-04-13)
**Status:** Slice complete: admin-audit-trust-surface

**Files changed:**
- `lib/admin-data-health.ts`
- `src/pages/AuditDashboardPage.tsx`
- `src/components/entity/EntityMetricStrip.tsx`
- `src/components/entity/EntityShell.tsx`
- `src/components/entity/EntityHistoryChart.tsx`
- `src/components/entity/EntityContextSection.tsx`
- `src/components/entity/EntityInsightRail.tsx`
- `src/components/entity/EntityFacetRail.tsx`
- `src/components/entity/EntityRelationshipList.tsx`
- `src/components/entity/EntitySourceList.tsx`
- `src/pages/EntityPage.tsx`

**Changes:**
1. `admin-data-health` now carries through real `regulator_url` and `data_url` from the source catalog instead of forcing the dashboard to fall back to sync endpoints
2. Admin provenance scoring now uses the stricter runtime provenance validator, so malformed/non-conforming provenance payloads no longer count as "auditable"
3. `AuditDashboardPage` now maps source links from `regulator_url` / `data_url` and fixes the expandable source-table fragment keying
4. Entity detail surfaces got a readability pass for the light theme: low-contrast `text-slate-400` copy on white/light cards was raised to stronger slate tokens in the shell, metric strip, evidence/history/context cards, and related drill panels

**Why this was needed:**
- The admin audit UI was showing internal sync routes as if they were regulator/data links, which is misleading on an audit surface
- Provenance completeness was overstated whenever any `sources[]` array existed, even if it violated the stricter typed/schema contract
- The entity page had drifted into a low-contrast state after the light-theme refactor, especially for explanatory copy and evidence notes

**Risk notes:**
- `npm run build` passes after this slice
- This is contract/UI hardening only; no live schema mutation or data rewrite was performed
- Claude should treat `regulator_url` / `data_url` as the source-of-truth fields for admin link rendering going forward

**Next slice:** continue end-to-end review on ingestion/provenance writers, or do a focused admin UX pass on confidence explanations and drilldowns

### Slice: ca-annual-report-provenance (2026-04-13)
**Status:** Slice complete: ca-annual-report-provenance

**Files changed:**
- `scripts/agent_scraper_ca.py`

**Changes:**
1. Replaced legacy string `data_provenance = 'annual_report_pdf'` with the structured provenance object expected by current runtime/schema validation
2. Provenance now carries `source_key`, `source_url`, `fetched_at`, `confidence`, `last_verified_at`, and `verified_by`
3. Fixed a pre-existing Python syntax error in the annual-report extraction regex list (`equity_capital` patterns), and verified the script with `python3 -m py_compile`

**Why this was needed:**
- The script was still writing a provenance shape that the stricter validator would reject / treat as unauditable
- The file also contained an unrelated parse error that would block the scraper from running at all

**Risk notes:**
- No runtime behavior change beyond provenance shape and syntax repair
- `python3 -m py_compile scripts/agent_scraper_ca.py` passes after the fix

**Next slice:** continue hunting for legacy provenance writers or backfill paths that still emit placeholder / non-auditable source metadata

### Slice: backfill-source-url-hardening (2026-04-13)
**Status:** Slice complete: backfill-source-url-hardening

**Files changed:**
- `scripts/_entity-warehouse-backfill-shared.mjs`
- `scripts/backfill-entity-warehouse-local.mjs`

**Changes:**
1. Added a central `SOURCE_URL_BY_SOURCE` mapping for known legacy source systems used by the backfill transforms
2. Backfill-generated external IDs, tags, registry facts, quarterly history, and branch annual history now carry a concrete `source_url` when the source system is known
3. Preserved existing backfill behavior and IDs; this slice only hardens audit metadata

**Why this was needed:**
- The backfill helpers were creating warehouse rows that looked structured but still dropped source provenance to `null`
- That weakens admin trust surfaces and makes later evidence/explainability work harder than it needs to be

**Risk notes:**
- `node --check` passes for both backfill helper files
- `npm run build` passes after this slice
- SQL backfill paths still contain `NULL::text AS source_url` in places; those were not changed in this slice

**Next slice:** decide whether to align the SQL backfill path too, or continue reviewing live/native source writers first

### Slice: live-integrity-scan (2026-04-13)
**Status:** Review note only

**Findings:**
1. Read-only Supabase check still returns `content-range: */0` for public `registry_entities` rows with non-null `data_provenance`
2. Sampled live `registry_entities` rows for `rpaa` show `data_confidence`, `data_confidence_score`, and `data_provenance` all `null`
3. Read-only `sync_jobs` query returned an empty array in this pass
4. Vercel MCP calls are currently auth-blocked from Codex (`Auth required`), so deployment/thread review could not be verified from my side in this pass

**Why this matters:**
- The trust/audit UI is getting stronger, but the public warehouse still appears thin on confidence/provenance payloads
- We should be careful not to let the interface imply a maturity level the live data does not yet have

**Recommended handling:**
- Treat this as an architectural follow-up, not a local patch
- Use `CODEX_FEEDBACK.md` as the decision memo for the bigger trust-system direction

## Resolved

### 2026-04-12 — Bug fix pass (5 findings)
1. **[HIGH] Double text filter in `searchEntities()`** — `applySearchFilters()` now skips the `q`
   substring check when server-side full-text search was already applied via the MV path.
2. **[HIGH] Duplicate `sponsor_bank_for` in `getEntityRelationships()`** — Removed the second
   unconditional loop that re-appended derived BaaS relationships when warehouse rows were absent.
3. **[MEDIUM] Raw user text in PostgREST filter strings** — `sanitizePostgrestText()` helper added;
   applied to both `buildInstitutionQuery` and `buildRegistryQuery` fallback `.or()` calls.
4. **[MEDIUM] Cross-table ID collision in graph traversal (PARTIAL)** — Node and edge keys are now composite (`${entity_table}:${entity_id}`) in several stages, but hop discovery still expands via raw `entity_id` filters only.
5. **[MEDIUM] Unstable ordering in graph hop queries** — `.order('id')` added before `.limit()` on
   all relationship queries (first hop and each traversal hop).

Bonus: fixed pre-existing build break in `lib/fdic-client.ts` where `mapInstitution()` was missing
the 6 new Brim intelligence fields added to the `Institution` type.

## Notes
- Codex is not trying to take over active feature work unless explicitly asked.
- This file is intended to stay useful beyond a single file or a single review pass.
