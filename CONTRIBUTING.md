# Contributing to Data Studio

> Read `STATE.md` first. It's the single source of truth for what we're building and why. This file explains **how** to work in the repo.

## Before you start

- Work on `main`. Vercel auto-deploys on push.
- Run `npm run build` before every commit. Husky `pre-push` enforces TypeScript strict.
- No `any`, no `@ts-ignore`, no new dependencies without strong justification.
- If you're an AI session (Claude / Cursor / Codex), you're editing the same git + DB as every other session. Update `STATE.md` at the end of anything that changes strategy, schema, or roadmap.

## Local setup

```bash
npm install
cp .env.example .env.local   # fill in Supabase URL + keys
npm run dev                   # http://localhost:5173
```

Required env vars (`.env.local`):

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Optional: `CRON_SECRET`, `FDIC_SOD_YEAR`, `FFIEC_CDR_*`, `FFIEC_NIC_*`. See `.env.example`.

## Running the frontend

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check + production build (required before commit) |
| `npm run lint` | ESLint |
| `npm run preview` | Preview production build locally |

## Running ingestion scripts

All Node sync scripts live in `scripts/sync-*.mjs`. All Python agents live in `scripts/agent_*.py`.

```bash
# Node sync (reads .env.local, writes to Supabase)
node scripts/sync-fdic.mjs
node scripts/sync-ncua.mjs

# Python agents (reads .env.local via scripts/_db.py)
python scripts/agent_qa_completeness.py      # QA, read-only
python scripts/agent_fill_roa.py --dry-run   # preview
python scripts/agent_fill_roa.py             # apply
python scripts/agent_relationships.py        # populate entity_relationships
```

All agents and sync scripts are rerunnable (upsert on conflict). Every Python agent prints a summary report when done.

## Where things live

```
src/
  pages/          Route components (see STATE.md "Frontend surface" table)
  components/     Feature and UI components, grouped by page/feature
  lib/            Shared client utilities (supabase.ts, searchParser.ts, format.ts)
  stores/         Zustand state (searchStore)
  hooks/          React hooks
api/
  analytics/      Aggregate endpoints (10 routes)
  institutions/   Search, detail, peers, capabilities, enrich (6 routes)
  entities/       Polymorphic entity endpoints (5 routes)
  qa/             QA / readiness endpoints (5 routes)
  sources/        Source registry endpoints
  sync/           Sync trigger endpoints
  ai/             AI summary endpoint
lib/              Server-side shared code (entity-service will land here)
scripts/
  _db.py                  Python DB helper — use this, don't duplicate HEADERS
  _sync-utils.mjs         Node ingestion helper — use this, don't hand-parse .env.local
  sync-*.mjs              Data ingestion (regulators, specialty sources)
  agent_*.py              QA, fill, Brim, and relationship agents
  add-*.sql               Incremental schema migrations (being consolidated)
  schema.sql              Legacy base schema (being consolidated)
docs/
  archive/                Historical planning docs — do not edit
```

## The data model (the short version)

- **`institutions`** is the legacy flat table. Still writable; being deprecated in place.
- **`registry_entities`** + **`entity_facts`** + **`entity_relationships`** are the new polymorphic warehouse.
- **`institution_summary_mv`** (landing in Phase 1) is the fast read surface over the warehouse.
- All new API reads go through `lib/entity-service.ts`. Grep for `.from('institutions')` — the goal by end of Phase 2 is zero hits in `api/`.

Full context in `STATE.md` → "Locked decisions".

## Rules you must not break

See `STATE.md` → "Rules". Highlights:

1. Never use the word "engine" in code, comments, or docs.
2. FDIC amounts are in thousands — multiply by 1000 on ingest.
3. `cert_number >= 900001` for Canadian credit unions.
4. `source` values must match the DB check constraint (lowercase).
5. Don't store PDFs. Extract, use the source URL, delete the file.
6. Don't target existing Brim clients (list in `STATE.md`).
7. Use `upsert` with `onConflict` for all ingestion.
8. Run `npm run build` before every commit.

## Committing

- Create new commits; don't amend unless you're explicitly cleaning up your own unpushed work.
- Don't skip hooks (`--no-verify`). If `pre-push` fails, fix the underlying issue.
- Don't `git add -A` — stage specific files to avoid accidentally committing `.env.local`, temp files, or large artifacts.
- Commit messages: imperative mood, short subject line, optional body. Match the existing repo style.

## If you get confused

1. Read `STATE.md`. It overrides anything in `docs/archive/`.
2. Run `git log --oneline -20` to see recent activity.
3. Check if another session has modified `STATE.md` recently — someone may have already made the decision you're reconsidering.
4. Still stuck? Leave a question as an H2 section at the bottom of `STATE.md` and stop.
