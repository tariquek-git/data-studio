> **HISTORICAL — do not edit. See `/STATE.md` and `/CONTRIBUTING.md` at the repo root.**
> Archived 2026-04-12 during Phase 0 standardization. The "active branch" claim in this file is stale — `codex/entity-intelligence-foundation` is fully contained in `main`.

---

# AGENTS.md — Data Studio (Codex Instructions)

> **For the full technical brief, read `CODEX.md` in this same directory.**
> **For handoff/status between you and Claude, read and update `HANDOFF.md`.**

## Your Role
You and Claude are equal partners on this project. Either of you can make architecture calls, fix bugs, add features, or do data work. Use your judgment. The shared status log is `HANDOFF.md` — read it before starting, update it when done, so the other knows what happened.

## Critical Rules
1. Run `npm run build` before every commit. Husky pre-push enforces this. If it fails, fix it.
2. No `any` types, no `@ts-ignore`. Strict TypeScript.
3. `cert_number` is the unique key for institutions. Never change this.
4. FDIC API returns amounts in **thousands** — multiply by 1000 on ingest. Always.
5. Use `upsert` (ON CONFLICT) for all data ingestion. Scripts must be rerunnable.
6. Keep API routes thin. Business logic goes in `lib/`.
7. Don't add new npm dependencies without strong justification.
8. Don't refactor working code. Additive changes only.
9. Don't add auth, GraphQL, Redis, or a separate backend server.

## Current State
- **Active branch**: `codex/entity-intelligence-foundation` (20 commits ahead of main)
- **Stack**: React 19 + Vite 8 + TS 5.9 + Tailwind 4 + Supabase + Vercel serverless
- **125 frontend files, 40 API endpoints, 20+ ingestion scripts**
- **Two data models coexist**: Legacy `institutions` table + new `entity_warehouse`. Don't try to unify them.

## Priority Tasks
See `CODEX.md` for the full prioritized task list. Summary:
1. P0: Verify entity tables in prod Supabase, merge entity branch → main
2. P1: FFIEC CDR/NIC ingestion, FinCEN MSB
3. P2: Indexes, pagination, freshness badges, `.env.example`

## After Completing Work
**You MUST update `HANDOFF.md`** with:
- What you did (commits, files changed)
- What worked vs. what broke
- What's left / blocked
- Any decisions you need from Tarique or Claude

Format your update as a new section at the TOP of the file with today's date.

## MCP Tools Available
You have `supabase_postgrest` MCP — use it to query/verify Supabase tables directly.

## Verification
After every change:
```bash
npm run build
npm run dev
# Then hit: /api/qa/status, /api/institutions/search?q=chase, /api/analytics/overview
```
