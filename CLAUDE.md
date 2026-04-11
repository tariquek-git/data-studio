# CLAUDE.md — Data Studio

**Read `STATE.md` first.** It is the single source of truth for this project — the data model, the roadmap, the locked decisions, and the rules. Everything else in this file is a thin pointer.

## Orientation

- **`STATE.md`** — current state, locked decisions, database inventory, roadmap. Update at the end of any session that changes strategy, schema, or product surface.
- **`CONTRIBUTING.md`** — how to run dev, how to run agents and sync scripts, where things live, commit rules.
- **`docs/archive/`** — historical planning docs (`CLAUDE.md`, `AGENTS.md`, `CODEX.md`, `DATA_STUDIO.md`, `MASTER_PLAN.md`, `HANDOFF.md`). Do not trust as current. Do not edit.

## Model strategy

- **Opus** — cross-codebase planning, schema/contract decisions, `entity-service` design, the kind of work in `/Users/tarique/.claude/plans/`.
- **Sonnet** — implementing an agent, writing a sync script, migrating an API route, running a fill.
- **Haiku** — doc edits, renames, mechanical find-and-replace, single-line fixes.

Optimize for value, not cost. Don't shy away from Opus when quality matters.

## Autonomy

Run commands, edit files, install packages, start servers, iterate on code without asking. **Stop and confirm** for: destructive ops (delete, drop, force-push), deploying to production, making public commits, or spending real money. Note that another session may be editing the same repo — always check `git status` before committing.

## The rules you must not break

See `STATE.md` → "Rules" for the full list. The short version:

1. Never use the word "engine" in code, comments, or docs.
2. FDIC amounts are in thousands — multiply by 1000 on ingest.
3. `cert_number >= 900001` for Canadian credit unions.
4. Don't store PDFs. Extract, use the source URL, delete the file.
5. Use `upsert` with `onConflict` for all ingestion.
6. `npm run build` passes before every commit.
7. No `any`, no `@ts-ignore`.
