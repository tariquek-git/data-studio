> **HISTORICAL — do not edit. See `/STATE.md` and `/CONTRIBUTING.md` at the repo root.**
> Archived 2026-04-12 during Phase 0 standardization. The "active branch" claim in this file is stale — `codex/entity-intelligence-foundation` is fully contained in `main`.

---

# Data Studio — Codex Instructions

## What This Is
Financial institution intelligence platform. Think Bloomberg Terminal for community banks, credit unions, and fintech entities. Search, analytics, entity profiles, regulatory data.

**Live URL**: data.fintechcommons.com
**Stack**: React 19 + Vite 8 + TypeScript 5.9 + Tailwind 4 + Supabase (Postgres) + Vercel serverless
**Repo**: github.com/tariquek-git/data-studio

---

## Current State

### Branches
- `main` — Production. Core platform (search, analytics, institution profiles, screener, watchlist)
- `codex/entity-intelligence-foundation` — **20 commits ahead of main, +17,665 lines**. Entity warehouse, terminal UI, FFIEC/OCC/CFPB loaders, local Postgres sandbox, failure analytics. THIS IS THE ACTIVE BRANCH.

### What Works
- FDIC institution search + profiles (6,000+ banks)
- NCUA credit unions, OSFI Canadian banks, RPAA payment providers
- Analytics dashboard (12 endpoints): distribution, leaderboards, correlation, rates
- PDF/Excel export
- Institution comparison tool
- Watchlist/collections
- AI summaries (Claude-generated via /api/ai/summary)
- Local Postgres sandbox for development
- Quarterly FDIC cron sync

### What's In Progress (on entity branch)
- Entity warehouse model (relationship-aware, source-tracked)
- Terminal-style entity search UI
- OCC, FDIC history, CFPB complaint ingestion
- Warehouse-backed failure/enforcement analytics
- QA and data freshness endpoints

---

## Priority Tasks (in order)

### P0 — Stabilize
1. **Verify entity_warehouse tables exist in prod Supabase**
   ```sql
   SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public'
   ORDER BY table_name;
   ```
   If `entity`, `entity_relationships`, `entity_capabilities` don't exist, find the migration SQL in the codebase and run it.

2. **Merge `codex/entity-intelligence-foundation` → `main`**
   - `git checkout main && git merge codex/entity-intelligence-foundation`
   - Run `npm run build` — fix any TypeScript errors
   - Push to origin/main
   - Verify Vercel deployment succeeds

3. **Create `.env.example`** with all required vars:
   ```
   # Required
   VITE_SUPABASE_URL=
   VITE_SUPABASE_ANON_KEY=
   SUPABASE_URL=
   SUPABASE_SERVICE_ROLE_KEY=
   CRON_SECRET=

   # Optional — FFIEC
   FFIEC_CDR_USER_ID=
   FFIEC_CDR_AUTH_TOKEN=
   FFIEC_CDR_REPORTING_PERIOD=

   # Optional — Data
   FDIC_SOD_YEAR=
   ANTHROPIC_API_KEY=
   ```

4. **Smoke test all API endpoints post-merge**
   - GET `/api/qa/status` — should return all green
   - GET `/api/institutions/search?q=chase`
   - GET `/api/entities/search?q=test`
   - GET `/api/analytics/overview`
   - GET `/api/sources`

### P1 — Data Ingestion
5. **FFIEC CDR ingestion** (if credentials are available in env)
   - CDR provides Call Report data: detailed financials, capital ratios, loan breakdowns
   - Use existing pattern in `scripts/` and `lib/source-registry.ts`
   - Batch insert to Supabase (1000 rows per batch, use upsert)
   - Update `data_sources` table with sync metadata

6. **FFIEC NIC ingestion** (from local ZIP files)
   - NIC provides organizational hierarchy: holding companies, subsidiaries, mergers
   - Files are pipe-delimited, not CSV
   - Map to `entity_relationships` table
   - Key fields: RSSD_ID (unique), entity type, parent RSSD

7. **FinCEN MSB registry** — bulk CSV download, map to entities table

8. **SEC EDGAR** — quarterly 13F filings for bank holding companies. Use EDGAR full-text search API.

### P2 — Quality & Polish
9. **Add Postgres indexes** for common queries:
   ```sql
   -- If not already present
   CREATE INDEX IF NOT EXISTS idx_institutions_state ON institutions(state);
   CREATE INDEX IF NOT EXISTS idx_institutions_assets ON institutions(total_assets);
   CREATE INDEX IF NOT EXISTS idx_institutions_charter ON institutions(charter_type);
   CREATE INDEX IF NOT EXISTS idx_financial_history_cert_period ON financial_history(cert_number, period);
   CREATE INDEX IF NOT EXISTS idx_entity_source ON entity(primary_source);
   CREATE INDEX IF NOT EXISTS idx_entity_name_trgm ON entity USING gin(name gin_trgm_ops);
   ```
   Check if `pg_trgm` extension is enabled first: `SELECT * FROM pg_extension WHERE extname = 'pg_trgm';`

10. **Add API response pagination** — any endpoint returning lists should support `?limit=50&offset=0`. Cap at 500.

11. **Add rate limiting headers** to sync endpoints (they hit external APIs)

12. **Add data freshness badges** — each source should show last sync date on the UI

---

## Architecture Rules

### Database
- `cert_number` is the unique key for FDIC institutions. Always use it for lookups/joins.
- FDIC API returns amounts in **thousands** — multiply by 1000 on ingest. Always.
- Supabase is the cache layer, not source of truth. Government APIs are source of truth.
- Use `upsert` (ON CONFLICT) for all ingestion — scripts must be rerunnable/idempotent.
- Every table that holds external data needs: `source`, `data_as_of`, `last_synced_at` columns.

### API
- All API routes go in `api/` directory (Vercel serverless functions)
- Use the existing `lib/api-handler.ts` wrapper for error handling
- Return JSON with consistent shape: `{ data, meta: { count, source, as_of } }`
- Cache headers: analytics endpoints = 30min, institution detail = 5min, sync endpoints = no-cache

### Frontend
- Lazy-load all pages (already done in App.tsx)
- Use TanStack React Query for all API calls (already set up)
- Use Zustand only for cross-page state (search filters)
- Tailwind 4 — no CSS modules, no styled-components

### Code Quality
- Run `npm run build` before every commit (Husky pre-push enforces this)
- Strict TypeScript — no `any`, no `@ts-ignore`
- No new dependencies without justification
- Keep API routes thin — business logic goes in `lib/`

---

## Data Sources Reference

### Live & Working
| Source | API/Method | Frequency | Key |
|--------|-----------|-----------|-----|
| FDIC BankFind | REST API (no auth) | Quarterly | cert_number |
| FDIC SOD | REST API (no auth) | Annual | cert_number + year |
| NCUA | Bulk CSV download | Quarterly | charter_number |
| OSFI | Web scrape / PDF | Quarterly | institution_name |
| RPAA | Bank of Canada API | On change | psp_name |
| CIRO | Bulk download | Monthly | dealer_id |
| FINTRAC | Bulk download | Monthly | msb_reg_number |
| OCC | REST API | Quarterly | cert / charter_number |
| CMHC | API | Monthly | n/a (macro) |
| Bank of Canada | Valet API | Daily | series_name |
| Fed Funds | FRED API | Daily | series_id |

### To Implement
| Source | API/Method | Value | Difficulty |
|--------|-----------|-------|-----------|
| FFIEC CDR | SOAP/REST (auth required) | Call Reports, detailed financials | Medium |
| FFIEC NIC | Bulk ZIP (manual download, CAPTCHA) | Org hierarchy, holding companies | Medium |
| CFPB Complaints | REST API (no auth) | Consumer complaint data by bank | Easy |
| SEC EDGAR | REST API (rate limited: 10 req/sec) | 13F filings, proxy statements | Medium |
| FinCEN MSB | Bulk CSV | Money service business registry | Easy |
| NMLS | Bulk download | State-licensed lenders/servicers | Medium |
| FFIEC HMDA | Bulk CSV | Mortgage lending patterns by geography | Hard (huge files) |
| FDIC Failures | Static page + API | Historical bank failures | Easy |

### Important API Notes
- **FDIC**: No auth, no rate limit documented, but be polite (1 req/sec max)
- **FFIEC CDR**: Requires registration at cdr.ffiec.gov. SOAP API with XML responses. Has a bulk download option too.
- **SEC EDGAR**: User-Agent header required (must include email). 10 requests/second hard limit. They will block you.
- **CFPB**: No auth. Returns JSON. Max 10,000 results per query. Use date ranges for pagination.
- **Bank of Canada Valet**: No auth. XML or JSON. Rate limit unclear but generous.
- **FRED**: Requires free API key. 120 requests/minute.

---

## Open Source Projects to Study

### For Architecture Patterns
| Project | Why Look At It | What to Take |
|---------|---------------|-------------|
| **[OpenBB](https://github.com/OpenBB-finance/OpenBB)** | Bloomberg terminal alternative (Python). Most mature open-source financial data platform. | Data source abstraction pattern, how they normalize data across 90+ sources, their provider interface |
| **[Datasette](https://github.com/simonw/datasette)** | Instant JSON API for any SQLite/Postgres database. By Simon Willison. | URL-based filtering pattern (`?column__gte=100`), faceted search, export formats |
| **[Evidence.dev](https://github.com/evidence-dev/evidence)** | SQL-based data visualization framework. | How they render charts from SQL queries, markdown-driven analytics pages |
| **[Maybe Finance](https://github.com/maybe-finance/maybe)** | Open-source personal finance app (Rails + React). | Institution data modeling, financial data sync patterns, account aggregation |

### For UI Components
| Project | Why Look At It | What to Take |
|---------|---------------|-------------|
| **[Tremor](https://github.com/tremorlabs/tremor)** | React dashboard components built on Tailwind. | KPI cards, area/bar/donut charts, metric lists — drop-in components |
| **[AG Grid](https://github.com/ag-grid/ag-grid)** | Most powerful data grid for JS. Free community edition. | Consider for screener/comparison tables if current tables feel slow at 5K+ rows |
| **[TanStack Table](https://github.com/TanStack/table)** | Headless table library (already in React ecosystem). | Sorting, filtering, column pinning, virtual scrolling — lighter than AG Grid |
| **[Nivo](https://github.com/plouc/nivo)** | React data viz built on D3. Beautiful defaults. | Choropleth maps (state-level bank density), heatmaps, sankey diagrams |
| **[Lightweight Charts](https://github.com/niclas-niclas-niclas/niclas-tradingview-lightweight-charts)** *(TradingView)* | Financial charting library. Fast, small, looks professional. | Time series charts for rate history, asset trends — more "financial" than Recharts |

### For Data Pipeline
| Project | Why Look At It | What to Take |
|---------|---------------|-------------|
| **[Airbyte](https://github.com/airbytehq/airbyte)** | Open-source data integration. 300+ connectors. | Pattern for source connectors, schema normalization, incremental sync |
| **[dbt](https://github.com/dbt-labs/dbt-core)** | SQL-based data transformation. | How they handle data freshness tests, schema tests, documentation |
| **[Meltano](https://github.com/meltano/meltano)** | Singer-based ELT. | Tap/target pattern for extracting from APIs and loading to Postgres |

---

## Things You Probably Haven't Thought Of

### Data Quality
1. **Deduplication across sources** — The same bank appears in FDIC, OCC, and FFIEC. You need a merge strategy. Use `cert_number` as the golden key for FDIC-supervised banks, `rssd_id` for Fed-supervised. Map between them using FFIEC NIC's ID mapping table.

2. **Data staleness alerts** — Add a `/api/qa/freshness` endpoint that returns which sources are stale (last sync > expected frequency). Show a yellow badge in the UI. You don't want users seeing Q3 2025 data and thinking it's current.

3. **Historical data gaps** — FDIC history may have gaps (bank mergers, charter conversions). When a bank merges, the surviving entity gets a new cert. You need a `successor_cert` field to chain history across mergers.

4. **Null handling** — Government APIs return `-1`, `0`, empty string, and null all to mean "not reported." Normalize to null on ingest. Don't let `-1` show up in averages.

### Legal & Compliance
5. **Terms of use** — All the government data (FDIC, FFIEC, CFPB, FRED) is public domain. You're fine. BUT: HMDA data has borrower-level records that are partially redacted for privacy. If you ingest HMDA, never store or display fields that could identify borrowers.

6. **SEC EDGAR** — Requires a User-Agent with your name and email. They actively block scrapers without it. Also: 10 req/sec is a HARD limit, they will IP-ban you.

7. **Data attribution** — Add a footer or source badge on every data view: "Source: FDIC BankFind as of 2026-03-31". Government data is free but they appreciate attribution, and your users need to know the vintage.

### Performance & Scale
8. **Postgres full-text search** — Enable `pg_trgm` extension in Supabase for fuzzy name search. Without it, searching "JPMorgan" won't match "JP Morgan Chase". Add a GIN index on institution name.
   ```sql
   CREATE EXTENSION IF NOT EXISTS pg_trgm;
   CREATE INDEX idx_inst_name_trgm ON institutions USING gin(name gin_trgm_ops);
   ```

9. **Materialized views for analytics** — Your analytics endpoints (distribution, leaderboard, correlation) hit raw tables with aggregations. Once you have 50K+ institutions, these will slow down. Create materialized views refreshed on sync:
   ```sql
   CREATE MATERIALIZED VIEW mv_state_metrics AS
   SELECT state, count(*), avg(total_assets), sum(total_deposits), ...
   FROM institutions GROUP BY state;
   ```
   Refresh after each sync job.

10. **API response size** — The screener endpoint can return thousands of institutions. Add server-side pagination (LIMIT/OFFSET) and don't return all fields in list views. Use a `fields` query param or separate list vs. detail response shapes.

11. **Vercel serverless cold starts** — Your API functions may cold-start in 1-2 seconds. For the most-hit endpoints (search, overview), consider adding `export const config = { runtime: 'edge' }` for sub-100ms cold starts. Edge runtime supports Supabase client fine.

### Features You'll Want Eventually
12. **Saved searches / alerts** — "Tell me when a bank in Texas with >$1B assets drops below 8% capital ratio." This is a killer feature for the BD use case. Architecture: store the query, run it on each sync, diff results, email/notify.

13. **Peer group builder** — Let users define custom peer groups (e.g., "community banks in Ohio with $500M-2B assets") and track them over time. Just a saved filter + watchlist combo.

14. **Embeddable charts** — If Fintech Commons wants to let partners embed data widgets, add an `/embed/:chartType` route that renders a standalone chart with source attribution. Iframe-friendly.

15. **Bulk export API** — For power users who want to pull data into their own Excel models. Rate-limited, paginated CSV endpoint.

16. **Change tracking** — When a bank's assets jump 20% quarter-over-quarter, flag it. When a bank changes charter type, flag it. Store diffs between sync runs. This is the "signal" layer that makes it more than a data viewer.

---

## Don't Do These Things
- Don't add a separate backend server (Express, Fastify). Vercel serverless is sufficient.
- Don't add authentication yet. This is a public data tool. Auth adds complexity for zero value right now.
- Don't try to process FFIEC bulk files in serverless functions. They'll timeout. Process locally, upload results.
- Don't store raw API responses. Only store the fields you need.
- Don't add GraphQL. REST is fine for this use case.
- Don't add a message queue or job system. The cron + manual sync pattern works.
- Don't add Redis. Supabase Postgres with proper indexes handles the load.
- Don't refactor working code. Additive changes only.

---

## Verification Checklist (Run After Every PR)
```bash
# Build
npm run build

# Dev server
npm run dev
# Open http://localhost:5174

# Smoke test these routes:
# /                    — Homepage loads
# /search              — Search works, returns results
# /analytics           — Charts render
# /entities            — Entity search works
# /institution/{cert}  — Profile page loads
# /sources             — Data source list renders
# /screener            — Screener filters work

# API health
curl http://localhost:5174/api/qa/status
curl http://localhost:5174/api/qa/data-readiness
curl "http://localhost:5174/api/institutions/search?q=chase"
curl http://localhost:5174/api/analytics/overview
curl http://localhost:5174/api/sources
```

---

## File Map (Key Files)
```
/
├── api/                     # Vercel serverless API routes (40 files)
├── lib/                     # Shared server utilities
│   ├── supabase.ts          # Supabase client singleton
│   ├── fdic-client.ts       # FDIC BankFind API wrapper
│   ├── api-handler.ts       # API route error handling wrapper
│   ├── entity-service.ts    # Entity business logic
│   ├── source-registry.ts   # Data source registry
│   └── source-sync.ts       # Sync orchestration
├── src/                     # Frontend React app
│   ├── components/          # 47 components (analytics/, entity/, institution/, ui/)
│   ├── pages/               # 13 pages
│   ├── stores/              # Zustand state
│   ├── types/               # TypeScript types
│   └── lib/                 # Client-side utilities (format, export, supabase)
├── scripts/                 # Data ingestion scripts (20+)
├── vercel.json              # Deployment config + cron
├── tsconfig.json            # Root TS config (project references)
└── vite.config.ts           # Vite + Tailwind + path aliases
```
