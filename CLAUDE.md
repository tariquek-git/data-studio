# CLAUDE.md — Data Studio

## Infra
- Supabase: bvznhycwkgouwmaufdpe
- Vercel: team_STzWxd5CFWZJluy9ayRxCorw, project data-studio
- Live: data-studio-mu.vercel.app (auto-deploys on push to main)
- Repo: tariquek-git/data-studio

## Model Strategy
Default: opusplan (Opus for planning, Sonnet for execution)
- Use Opus when: architecture decisions, complex debugging, multi-file refactors, schema design
- Use Sonnet when: building scripts, writing features, running agents, standard coding
- Use Haiku when: quick syntax questions, formatting, simple single-line edits
- Always optimize for value over cost. Don't shy away from Opus when quality matters.

## Database
- 10,112 institutions across 13+ sources (FDIC, NCUA, OSFI, BCFSA, FSRA, CUDGC, DGCM, etc.)
- 19 tables, 245K+ total rows
- 35K+ financial history records (annual + quarterly)
- 74K branches
- entity_relationships table exists but is EMPTY (populate from holding_company field)
- bank_capabilities table has Brim Mode fields (brim_score, brim_tier, agent_bank_program, core_processor)
- data_confidence tracking on institutions table (high/medium/low/unverified)
- cert_number 900001+ for Canadian CUs

## Key Files
- DATA_STUDIO.md: Single source of truth, database health, agent registry, priority list
- MASTER_PLAN.md: Multi-agent execution plan, QA agents, frontend mesh network architecture
- BRIM_MODE.md: Card issuing BD intelligence layer, scoring model, Elan migration tracker
- .cursorrules: Cursor-specific context (if using Cursor alongside Claude Code)

## Rules
1. Never use "engine" in code or comments
2. Canadian CU reports are in thousands of CAD. Multiply by 1000
3. cert_number 900001+ for Canadian CUs
4. source field must match check constraint (lowercase)
5. No LLM/AI API calls in agents. Phase 1 is pdfplumber only
6. Don't store PDFs. Extract, store data, delete file
7. Don't target existing Brim clients: Manulife, Affinity CU, Laurentian Bank, CWB, Zolve/Continental, Air France KLM, PayFacto
8. Set data_confidence and data_provenance on every database write
9. Every agent prints a summary report when done
10. Push to main. Vercel auto-deploys.

## Agent Priority (build in this order)
1. agent_qa_completeness.py — per-source data coverage scorecard
2. agent_fill_roa.py — calculate ROA where missing
3. agent_relationships.py — populate entity_relationships from holding_company + charter_events
4. agent_brim_cards.py — copy 698 card portfolios into bank_capabilities
5. All remaining QA agents (balance, orphans, dupes, staleness, ranges, yoy)
6. agent_scraper_ca.py — Canadian CU annual report PDF extraction
7. agent_brim_score.py — 0-100 Brim fit scoring
8. Frontend rebuild as mesh network with real-time Supabase connection

## Autonomy
Run commands, open files, edit files, install packages, start servers, iterate on code without asking.
Only stop and confirm for: destructive ops (delete, drop DB), deploying to production, making public commits, or spending real money.
