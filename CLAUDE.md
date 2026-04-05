# CLAUDE.md — Data Studio

> **Shared status with Codex: read `HANDOFF.md` before starting work. Update it when done.**
> **Full Codex brief: `CODEX.md`**

## Project Overview

Financial institution intelligence platform — search, analytics, entity profiles for U.S. and Canadian banks, credit unions, fintechs. Bloomberg Terminal for community banking.

- **Live URL:** data.fintechcommons.com (planned)
- **Part of:** Fintech Commons ecosystem (fintechcommons.com)
- **Hosted on:** Vercel (SPA + serverless API routes)
- **Repo:** github.com/tariquek-git/data-studio

## Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + TypeScript 5.9 |
| Build | Vite 8, `@vitejs/plugin-react` |
| Styling | Tailwind CSS 4 (`@tailwindcss/vite`) |
| State | Zustand (search filters), TanStack React Query (server state) |
| Charts | Recharts + D3 (sankey, sunburst) |
| Routing | React Router 7 |
| Database | Supabase (PostgreSQL) |
| PDF | @react-pdf/renderer |
| Export | xlsx (Excel), CSV |
| Icons | lucide-react |
| AI | Anthropic SDK (institution summaries) |
| Deploy | Vercel (SPA + serverless + cron) |
| Node | >= 20 |

## Project Structure

```
data-studio/
├── api/                        # 40 Vercel serverless API routes
│   ├── institutions/           # search, screen, detail, branches, capabilities, enrich, peers, history
│   ├── entities/               # search, detail, context, history, relationships, sources
│   ├── analytics/              # overview, discovery, failures, benchmarks, state-metrics, distribution,
│   │                           # branches, leaderboard, correlation, market-map, cmhc, fed-funds, rates
│   ├── qa/                     # status, check, data-readiness, warehouse-status
│   ├── sources/                # list, detail
│   ├── sync/                   # fdic, occ, generic
│   ├── relationships/          # search
│   ├── series/                 # search
│   └── ai/                     # summary (Claude-generated)
├── lib/                        # Shared server utilities
│   ├── supabase.ts             # Supabase client singleton
│   ├── fdic-client.ts          # FDIC BankFind API wrapper
│   ├── api-handler.ts          # API route error handling
│   ├── entity-service.ts       # Entity business logic
│   ├── source-registry.ts      # Data source registry
│   ├── source-sync.ts          # Sync orchestration
│   ├── warehouse-readiness.ts  # Schema validation
│   └── format.ts               # Number/currency formatters
├── src/
│   ├── components/             # 47 components
│   │   ├── analytics/          # 7 visualization components
│   │   ├── entity/             # 8 entity components
│   │   ├── institution/        # 18 institution components
│   │   ├── layout/             # Header, Footer
│   │   ├── market/             # Market map
│   │   ├── search/             # SearchBar, FilterPanel, ResultsTable, QuickStats
│   │   └── ui/                 # Button, Badge, Card, Skeleton, Input
│   ├── pages/                  # 13 pages (HomePage, SearchPage, InstitutionPage, AnalyticsPage,
│   │                           # MarketMapPage, ComparePage, QAPage, DataSourcesPage, WatchlistPage,
│   │                           # ScreenerPage, FailuresPage, EntitiesPage, EntityPage)
│   ├── stores/                 # Zustand search state
│   ├── hooks/                  # watchlist hook
│   ├── types/                  # institution, entity, filters, data-source
│   └── lib/                    # Client utils (format, export, supabase, watchlist, pdf/)
├── scripts/                    # 20+ data ingestion scripts (ESM)
├── CODEX.md                    # Full instructions for Codex
├── HANDOFF.md                  # Shared Claude ↔ Codex status log
├── AGENTS.md                   # Codex auto-read instructions
├── vercel.json                 # Deploy config + FDIC quarterly cron
├── vite.config.ts              # Vite + Tailwind + path aliases
└── package.json
```

## Commands

| Command | Description |
|---|---|
| `npm run dev` | Vite dev server (port 5174) |
| `npm run build` | TypeScript check + Vite build |
| `npm run preview` | Preview production build |
| `npm run lint` | ESLint |

## Key Architecture

- **Supabase as cache**: Government APIs are source of truth. Supabase stores processed snapshots.
- **FDIC amounts in thousands**: FDIC API returns amounts in thousands → multiply by 1000 on ingest.
- **`cert_number` as key**: Unique identifier for FDIC banks. NCUA charter uses same field.
- **No auth**: Public read-only. No user accounts.
- **Two data models**: Legacy `institutions` table + new `entity_warehouse` (entity, entity_relationships, entity_capabilities). Both coexist — don't unify.
- **Lazy-loaded pages**: All pages lazy-loaded in App.tsx.
- **API routes thin**: Business logic in `lib/`, API routes are wrappers.

## Data Sources (10+ live)

| Source | Country | Method | Auth | Frequency | Key Field |
|--------|---------|--------|------|-----------|-----------|
| FDIC BankFind | US | REST API | None | Quarterly | cert_number |
| FDIC SOD | US | REST API | None | Annual | cert_number |
| NCUA | US | Bulk CSV | None | Quarterly | charter_number |
| OSFI | Canada | CSV/Excel | None | Quarterly | institution_name |
| RPAA | Canada | BoC API | None | On change | psp_name |
| CIRO | Canada | Bulk download | None | Monthly | dealer_id |
| FINTRAC | Canada | Bulk download | None | Monthly | msb_reg_number |
| OCC | US | REST API | None | Quarterly | cert/charter |
| CMHC | Canada | API | None | Monthly | n/a (macro) |
| Bank of Canada | Canada | Valet API | None | Daily | series_name |
| Fed Funds | US | FRED | Free key | Daily | series_id |

## Environment Variables

| Variable | Purpose | Required |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase URL (client-side) | Yes |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key (client-side) | Yes |
| `SUPABASE_URL` | Supabase URL (server-side) | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side) | Yes |
| `CRON_SECRET` | Secret for sync endpoints | Yes |
| `ANTHROPIC_API_KEY` | Claude AI summaries | Optional |
| `FFIEC_CDR_USER_ID` | FFIEC CDR credentials | Optional |
| `FFIEC_CDR_AUTH_TOKEN` | FFIEC CDR auth | Optional |
| `FDIC_SOD_YEAR` | Override SOD year (default: current) | Optional |

## Verification

```bash
npm run build                                          # Must pass
curl http://localhost:5174/api/qa/status               # All green
curl "http://localhost:5174/api/institutions/search?q=chase"  # Returns results
curl http://localhost:5174/api/analytics/overview       # Returns data
curl http://localhost:5174/api/sources                  # Lists all sources
```
