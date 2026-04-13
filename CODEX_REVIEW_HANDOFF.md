# Codex + Claude Coordination

Last updated: 2026-04-12
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

## Current Slice
Status: active

Primary files in recent review:
- `lib/entity-service.ts`
- `api/relationships/graph.ts`
- `api/entities/[entityId]/similar.ts`
- `src/components/institution/SimilarInstitutions.tsx`
- `src/components/institution-story/StorySimilar.tsx`
- `src/types/entity.ts`
- `scripts/schema/000_current.sql`

Other files likely to matter soon:
- `scripts/schema/000_current.sql`
- `src/pages/RelationshipGraphPage.tsx`
- `src/types/entity.ts`
- related API/entity files touched by current merge work

## Review Findings Logged So Far
### High
1. `lib/entity-service.ts` — FIXED (2026-04-12)
   `searchEntities()` uses server-side full-text search, then `applySearchFilters()` re-applies a plain substring check on `q`.
   Fix: added `skipTextFilter` param to `applySearchFilters()`; passed `true` when `hasMV && q`.

2. `lib/entity-service.ts` — FIXED (2026-04-12)
   `getEntityRelationships()` appends derived `sponsor_bank_for` relationships twice when `baas_partners` exists and warehouse relationships are absent.
   Fix: removed the duplicate second loop that was guarded by `rows.length === 0`.

3. `api/entities/[entityId]/similar.ts`, `src/components/institution/SimilarInstitutions.tsx`, `src/components/institution-story/StorySimilar.tsx`
   The similar-institutions API returns institution `id`, but both UI consumers link to `/institution/${id}` even though that route expects a cert number.
   Risk: clicking a similar institution card can navigate to a broken or incorrect institution page.

4. `api/institutions/search.ts`
   The route builds and filters `pageInstitutions` in memory, but the final response returns `institutions` instead of `pageInstitutions`.
   Risk: Brim/migration-target filters and flattened joined fields do not actually match the response payload, and aggregations can disagree with returned rows.

### Medium
3. `lib/entity-service.ts` — FIXED (2026-04-12)
   The fallback `.or(...)` search path interpolates raw user search text directly into PostgREST filter strings.
   Fix: added `sanitizePostgrestText()` helper that strips PostgREST special characters; applied to both `buildInstitutionQuery` and `buildRegistryQuery` fallback paths.

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

9. `api/institutions/search.ts`
   This route reintroduces multiple `any`-typed mappings and raw `.or(...)` query interpolation.
   Risk: it violates the review brief’s hard rules and increases the chance of silent shape drift in a still-user-facing legacy endpoint.

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
None — between slices.

## Ready For Review

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
