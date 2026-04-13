# CODEX.md — Code Review Brief for Data Studio

> **Purpose:** This file gives an external code reviewer (Codex, human, or any AI agent) the context needed to do a meaningful review of this codebase. It is NOT a development guide — see `CLAUDE.md` and `STATE.md` for that.

---

## What This Project Is

A Palantir/Bloomberg-style intelligence platform for ~10,000 North American financial institutions (US banks, credit unions, Canadian FIs). React 19 + TypeScript 5.9 + Vite + Tailwind 4 frontend, Vercel serverless API, Supabase PostgreSQL database.

**Live:** `data-studio-mu.vercel.app`

---

## Architecture (3 minutes)

```
Browser → Vercel Edge → api/*.ts (serverless functions)
                            ↓
                      lib/entity-service.ts (business logic)
                            ↓
                      Supabase PostgreSQL
                        ├── institutions (legacy, 10K rows)
                        ├── registry_entities (warehouse)
                        ├── entity_facts / entity_tags / entity_relationships
                        ├── bank_capabilities (card/BaaS data)
                        ├── institution_summary_mv (materialized view, GIN-indexed)
                        └── financial_history_quarterly (35K rows)

Data Ingestion:
  scripts/sync-*.mjs → institutions table (Node.js)
  scripts/agent_*.py → bank_capabilities, entity_relationships (Python)
```

**Key pattern:** The codebase is mid-migration from a legacy flat `institutions` table to a normalized entity warehouse (`registry_entities` + `entity_facts` + `entity_relationships`). Both read paths coexist. `lib/entity-service.ts` is the abstraction layer that unifies them.

---

## Review Priorities (what to focus on)

### 1. `lib/entity-service.ts` (~1900 lines)

This is the most critical file. It's the service layer between all API routes and the database. Review for:

- **N+1 queries** — several functions load entities then make per-entity follow-up queries. Look for opportunities to batch.
- **Type safety** — the file maps between multiple row types (`InstitutionRow`, `RegistryEntityRow`, `InstitutionSummaryRow`, `EntitySummary`). Check that the mappings are complete and no fields are silently dropped.
- **`searchEntities()`** (line ~680) — recently refactored to use server-side filtering via the materialized view. Verify the query building logic handles edge cases (empty strings, special characters in search terms, SQL injection via `.textSearch()`).
- **`fetchAllPages()`** — generic pagination helper. Check for off-by-one errors and verify the `maxPages` safeguard actually prevents runaway fetches.
- **Error handling** — `safeRows()` and `safeMaybeSingle()` swallow missing-table errors. Confirm this is intentional and doesn't mask real failures.

### 2. `api/relationships/graph.ts`

Recently rewritten to support all entity types + multi-hop depth traversal. Review for:
- **Depth parameter** — iterative multi-hop queries (depth 1-3). Check for exponential blowup on highly-connected nodes.
- **Missing `any` types** — the previous version had `(i: any)`. Verify all types are properly narrowed.
- **Edge deduplication** — multi-hop traversal could return duplicate edges. Verify dedup logic.

### 3. `scripts/schema/000_current.sql` (~1100 lines)

The consolidated schema. Review for:
- **Constraint completeness** — are CHECK constraints on `source`, `status`, `entity_table` columns consistent across all tables?
- **Index coverage** — the `institution_summary_mv` has 14 indexes. Are any redundant? Are any missing for common query patterns?
- **`validate_data_provenance()`** — lightweight JSONB validator. Is it too permissive? Should it validate individual source entries?
- **pgvector IVFFlat** — `lists = 100` parameter. With 10K rows, is this the right value? (Rule of thumb: sqrt(n) = ~100, so this is correct.)

### 4. Ingestion Scripts (`scripts/sync-*.mjs`, `scripts/agent_*.py`)

72 sync scripts + 18 Python agents. Spot-check for:
- **Idempotency** — every script must use upsert with onConflict. Flag any INSERT without conflict handling.
- **FDIC thousands rule** — FDIC API returns amounts in thousands. Every sync script that touches FDIC data must multiply by 1000. This is the #1 source of bugs historically.
- **Error handling** — do scripts properly call `finishSyncJob('failed', error)` on exceptions?
- **Hardcoded values** — look for hardcoded Supabase URLs, API keys, or cert numbers that should be config.

### 5. Frontend Pages (`src/pages/*.tsx`)

17 pages. Focus on:
- **`RelationshipGraphPage.tsx`** — D3 force graph with typed node shapes. Check for memory leaks (D3 simulations must be stopped on unmount).
- **`InstitutionPage.tsx`** — largest page (~190KB bundle). Review for code-splitting opportunities.
- **`ScreenerPage.tsx`** — complex filter state. Check for unnecessary re-renders.

---

## Hard Rules (violations are bugs)

Any code that violates these rules should be flagged as a defect:

1. **No `any` types, no `@ts-ignore`** — TypeScript strict mode is enforced.
2. **No word "engine"** in code, comments, or docs. Historical decision, not negotiable.
3. **FDIC amounts in thousands** — if you see a sync script reading from FDIC API without multiplying by 1000, that's a data corruption bug.
4. **All data writes must use upsert** with `onConflict`. No bare INSERTs in ingestion.
5. **No Claude/LLM API calls in sync scripts or agents.** AI features go through `/api/ai/*` routes only.
6. **No stored PDFs.** Extract data, keep the source URL, delete the file.
7. **`npm run build` must pass.** If you find code that breaks the build, flag it as critical.

---

## What NOT to Review

- `docs/archive/` — historical planning docs, intentionally stale
- `node_modules/`, `dist/` — generated
- `.env.local` — secrets (not in git)
- Bundle size warnings from Vite — known, tracked separately

---

## Tech Stack Reference

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript 5.9 (strict), Vite, Tailwind CSS 4 |
| State | TanStack Query (server state), URL params (filter state) |
| Visualization | D3.js (graph), Recharts (charts), Leaflet (maps) |
| API | Vercel serverless functions (`api/*.ts`) |
| Database | Supabase PostgreSQL 17, pgvector, RLS enabled |
| Data Ingestion | Node.js sync scripts (`.mjs`), Python agents (`.py`) |
| Auth | Not yet implemented (Phase 3+) |
| Testing | Vitest (unit), Playwright (e2e) — coverage is thin |

---

## File Map (where to find things)

```
data-studio/
  api/                    # Vercel serverless endpoints
    entities/             # Entity CRUD + search
    institutions/         # Legacy institution endpoints
    relationships/        # Graph API
    analytics/            # Aggregation endpoints
    ai/                   # Claude-powered features
  lib/                    # Shared business logic
    entity-service.ts     # THE service layer (most important file)
    provenance.ts         # Data provenance validation
    supabase.ts           # DB client factory
    api-handler.ts        # Request middleware
  src/
    pages/                # 17 route pages
    components/           # UI components by domain
    types/                # TypeScript interfaces
    hooks/                # Custom React hooks
  scripts/
    schema/               # SQL schema (000_current.sql is truth)
    sync-*.mjs            # Data ingestion (Node.js)
    agent_*.py            # Data enrichment (Python)
    _sync-utils.mjs       # Shared Node.js helpers
    _db.py                # Shared Python DB helper
  STATE.md                # Current state, roadmap, rules
  CLAUDE.md               # AI agent instructions
```

---

## Known Technical Debt

1. **Legacy `institutions` table** — still the primary write target. Migration to `registry_entities` is in progress but not complete. Both tables contain overlapping data.
2. **Test coverage** — minimal. No unit tests for `entity-service.ts`. No integration tests for API routes.
3. **No auth** — all data is public read. RLS policies exist but default to `SELECT true`.
4. **Bundle size** — `InstitutionPage` is 189KB, `WatchlistPage` is 191KB. Need code-splitting.
5. **`searchEntities()` aggregations** — computed over the full filtered result set in JS. Should be a server-side GROUP BY for large result sets.
6. **72 sync scripts** — many share patterns that could be abstracted into a base class or config-driven runner.

---

## Output Format

When you complete the review, organize findings as:

### Critical (blocks deployment)
- [file:line] description

### High (should fix soon)
- [file:line] description

### Medium (tech debt)
- [file:line] description

### Low (style / preference)
- [file:line] description

### Positive Observations
- Things done well that should be preserved
