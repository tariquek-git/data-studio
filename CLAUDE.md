# CLAUDE.md — Data Studio

## Project Overview

Data Studio is a regulatory data search and analytics tool for U.S. and Canadian financial institutions. Users can search, filter, and analyze banks, credit unions, and payment service providers using data from FDIC, NCUA, OSFI, Bank of Canada, and the RPAA PSP registry.

- **Live URL:** https://data.fintechcommons.com (planned)
- **Part of:** Fintech Commons ecosystem (hub at https://fintechcommons.com)
- **Hosted on:** Vercel (SPA + serverless API routes)

## Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + TypeScript 5.9 |
| Build | Vite 8, `@vitejs/plugin-react` |
| Styling | Tailwind CSS 4 (via `@tailwindcss/vite` plugin) |
| State | Zustand (search filters), React Query (server state) |
| Charts | Recharts |
| Routing | React Router 7 |
| Database | Supabase (PostgreSQL) — caches regulatory data |
| Icons | lucide-react |
| Deploy | Vercel (SPA + serverless) |
| Node | >= 20 |

## Project Structure

```
data-studio/
├── api/                        # Vercel serverless API routes
│   ├── institutions/
│   │   ├── search.ts           # GET /api/institutions/search
│   │   └── [certNumber].ts    # GET /api/institutions/:certNumber
│   ├── analytics/
│   │   └── overview.ts         # GET /api/analytics/overview
│   └── sync/
│       └── fdic.ts             # POST /api/sync/fdic (cron)
├── lib/                        # Shared server utilities
│   ├── supabase.ts             # Supabase client singleton
│   ├── fdic-client.ts          # FDIC BankFind API wrapper
│   ├── api-handler.ts          # API route wrapper
│   └── format.ts               # Number/currency formatters
├── src/
│   ├── App.tsx                 # Root — React Router + React Query
│   ├── main.tsx                # Entry point
│   ├── index.css               # Tailwind 4 imports + theme
│   ├── components/
│   │   ├── layout/             # Header, Footer
│   │   ├── search/             # SearchBar, FilterPanel, ResultsTable, QuickStats
│   │   ├── institution/        # ProfileHeader, FinancialSnapshot, HistoryChart
│   │   └── ui/                 # Button, Badge, Card, Skeleton, Input, Select
│   ├── pages/
│   │   ├── HomePage.tsx
│   │   ├── SearchPage.tsx
│   │   ├── InstitutionPage.tsx
│   │   └── AnalyticsPage.tsx
│   ├── stores/
│   │   └── searchStore.ts      # Zustand search state
│   ├── lib/
│   │   └── format.ts           # Client-side formatters
│   └── types/
│       ├── institution.ts
│       └── filters.ts
├── scripts/
│   └── schema.sql              # Supabase migration
├── vercel.json
├── vite.config.ts
└── package.json
```

## Commands

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server (port 5174) |
| `npm run build` | TypeScript check + Vite build |
| `npm run preview` | Preview production build |

## Data Sources

| Source | Country | Type | Auth | Update Freq |
|--------|---------|------|------|-------------|
| FDIC BankFind API | US | REST API | None | Quarterly |
| NCUA 5300 Reports | US | Bulk CSV | None | Quarterly |
| OSFI | Canada | CSV/Excel | None | Quarterly |
| RPAA PSP Registry | Canada | TBD | None | Ongoing |
| Bank of Canada Valet | Canada | REST API | None | Varies |

## Key Architecture

- **Supabase as cache**: Regulatory data is bulk-loaded into Supabase for fast search. FDIC API search is unreliable for name matching.
- **FDIC amounts in thousands**: The FDIC API returns financial amounts in thousands. We multiply by 1000 when storing.
- **Cert number as key**: FDIC cert_number is the unique identifier. NCUA charter number uses the same field.
- **No auth**: Public read-only tool. No user accounts needed.
- **URL-synced filters**: Search params reflected in URL for shareable searches.

## Environment Variables

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase URL (client-side) |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key (client-side) |
| `SUPABASE_URL` | Supabase URL (server-side) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side) |
| `CRON_SECRET` | Secret for sync endpoints |
