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

## Default operating flow
1. Claude works in a coherent slice.
2. Claude or the user updates the "Current Slice" and "Questions / Decisions" sections below.
3. Codex reviews the touched area against `CODEX.md`.
4. Codex records findings, risks, and verification status here or reports them directly to the user.
5. Claude fixes, defers, or marks findings as intentional.
6. Codex re-reviews after follow-up changes land.

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

## Verification Status
- `CODEX.md` was read first and used as the review brief
- `npm run build` passed during the latest Codex review pass

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

## Ready For Review
- Add coherent slices here when they are ready for targeted review.
- Suggested slice template:
  - slice name
  - files touched
  - intended behavior changes
  - known temporary breakage
  - questions for Codex

## Resolved

### 2026-04-12 — Bug fix pass (5 findings)
1. **[HIGH] Double text filter in `searchEntities()`** — `applySearchFilters()` now skips the `q`
   substring check when server-side full-text search was already applied via the MV path.
2. **[HIGH] Duplicate `sponsor_bank_for` in `getEntityRelationships()`** — Removed the second
   unconditional loop that re-appended derived BaaS relationships when warehouse rows were absent.
3. **[MEDIUM] Raw user text in PostgREST filter strings** — `sanitizePostgrestText()` helper added;
   applied to both `buildInstitutionQuery` and `buildRegistryQuery` fallback `.or()` calls.
4. **[MEDIUM] Cross-table ID collision in graph traversal** — Frontier, nodeMap, and edge
   source/target use composite `${entity_table}:${entity_id}` keys throughout.
5. **[MEDIUM] Unstable ordering in graph hop queries** — `.order('id')` added before `.limit()` on
   all relationship queries (first hop and each traversal hop).

Bonus: fixed pre-existing build break in `lib/fdic-client.ts` where `mapInstitution()` was missing
the 6 new Brim intelligence fields added to the `Institution` type.

## Notes
- Codex is not trying to take over active feature work unless explicitly asked.
- This file is intended to stay useful beyond a single file or a single review pass.
