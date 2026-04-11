# AGENTS.md — Data Studio

**Read `STATE.md` first.** It is the single source of truth for this project. This file exists so Codex (and any other agent harness that looks for `AGENTS.md`) auto-loads a pointer to the real docs.

## Orientation

- **`STATE.md`** — current state, locked decisions, database inventory, roadmap.
- **`CONTRIBUTING.md`** — how to run dev, run agents, run sync scripts, and commit.
- **`docs/archive/`** — historical planning docs. Do not trust as current. Do not edit.

## Your role

You are one of several sessions (Claude, Codex, Cursor, humans) editing the same git repo and the same Supabase project. There is no "partner" coordination layer — the only shared state is `git` and `STATE.md`. Before you commit, check `git status`. Before you make strategy decisions, read `STATE.md`. After you make strategy decisions, update `STATE.md` in the same commit.

## Critical rules

See `STATE.md` → "Rules". Highlights:

1. Run `npm run build` before every commit. Husky `pre-push` enforces TypeScript strict.
2. No `any` types, no `@ts-ignore`.
3. `cert_number` is the unique key for institutions. Never change this.
4. FDIC amounts are in thousands — multiply by 1000 on ingest.
5. Use `upsert` with `onConflict` for all ingestion. Scripts must be rerunnable.
6. Don't add new npm dependencies without strong justification.
7. Don't refactor working code. Additive changes only, unless the current phase in `STATE.md` explicitly authorizes the refactor.
8. Never use the word "engine" in code, comments, or docs.

## After completing work

Update `STATE.md` if you changed strategy, schema, roadmap, or a locked decision. Otherwise a regular commit message is fine. Do not write to `docs/archive/`.
