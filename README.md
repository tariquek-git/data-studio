# Data Studio

North American financial-infrastructure intelligence platform built on Vite, React, Vercel serverless APIs, and Supabase.

The product blends regulated institution search, registry-backed nonbank coverage, source provenance, analytics, and an entity-intelligence layer across the United States and Canada.

## Current scope

Live or seeded source coverage includes:

- `fdic` for U.S. insured banks
- `ncua` for U.S. credit unions
- `osfi` for Canadian federally regulated institutions
- `rpaa` for Bank of Canada PSP registry coverage
- `ciro` for Canadian dealer registry coverage
- `fintrac` and starter `fincen` coverage for MSB-style entities
- `cmhc` and `boc` for macro / market context
- registry entries for planned sources such as `ffiec_cdr`, `ffiec_nic`, `occ`, `frb_routing`, `sec_edgar`, `cfpb_complaints`, `ffiec_hmda`, `ffiec_census`, `ffiec_cra`, and `nmls`

Recent platform additions:

- entity APIs under `/api/entities/*`
- source APIs under `/api/sources*`
- dynamic source registry UI
- fixes for FDIC SOD year discovery and legacy history joins

## Stack

- Frontend: React 19, Vite, TypeScript, Tailwind, TanStack Query
- APIs: Vercel serverless functions in `api/`
- Data store: Supabase Postgres
- Ingestion: Node-based sync scripts in `scripts/`

## Project structure

- `src/pages/` user-facing pages
- `src/components/` page and UI components
- `api/` serverless endpoints for search, analytics, entities, sources, QA, and sync
- `lib/` shared server utilities and service layers
- `scripts/` database setup, migrations, and ingestion jobs

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local` with at least:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Optional:

```bash
CRON_SECRET=...
SUPABASE_ACCESS_TOKEN=...
FDIC_SOD_YEAR=2025
FFIEC_CDR_USER_ID=...
FFIEC_CDR_AUTH_TOKEN=...
FFIEC_CDR_REPORTING_PERIOD=03/31/2026
FFIEC_NIC_ACTIVE_FILE=/absolute/path/to/attributes-active.zip
FFIEC_NIC_RELATIONSHIPS_FILE=/absolute/path/to/relationships.zip
FFIEC_NIC_TRANSFORMATIONS_FILE=/absolute/path/to/transformations.zip
```

3. Run the app:

```bash
npm run dev
```

4. Build for production:

```bash
npm run build
```

## Local Postgres Sandbox

If you want a local warehouse sandbox outside Supabase:

```bash
node scripts/setup-local-postgres.mjs
```

This creates and bootstraps a local database named `data_studio_local` on `localhost:5432` using the running Homebrew PostgreSQL service.

To recreate it from scratch:

```bash
RESET=1 node scripts/setup-local-postgres.mjs
```

To mirror the live Supabase core tables into the local sandbox:

```bash
node scripts/mirror-supabase-to-local-postgres.mjs
```

To seed and verify the local entity warehouse after mirroring:

```bash
node scripts/backfill-entity-warehouse-local.mjs
node scripts/verify-local-entity-warehouse.mjs
```

To run the full local data pipeline in one step:

```bash
node scripts/run-local-data-pipeline.mjs
```

## Database and migrations

Initial setup and older schema helpers live in:

- `scripts/setup-db.mjs`
- `scripts/run-migration.mjs`
- `scripts/schema.sql`

Source registry migration:

```bash
node scripts/run-migration-data-sources.mjs
```

If `SUPABASE_ACCESS_TOKEN` is not set, the script prints SQL-editor instructions and still attempts to seed the `data_sources` table through the service role.

## Ingestion scripts

Core institution and registry loaders:

- `node scripts/sync-fdic.mjs`
- `node scripts/backfill-history.mjs`
- `node scripts/sync-sod.mjs`
- `node scripts/sync-ncua.mjs`
- `node scripts/sync-osfi.mjs`
- `node scripts/sync-rpaa.mjs`
- `node scripts/sync-ciro.mjs`
- `node scripts/sync-fintrac.mjs`
- `node scripts/sync-occ.mjs`
- `node scripts/sync-fed-master-accounts.mjs`
- `node scripts/backfill-entity-warehouse.mjs`
- `node scripts/backfill-entity-warehouse-local.mjs`
- `node scripts/sync-ffiec-cdr.mjs`
- `node scripts/sync-ffiec-nic.mjs`
- `node scripts/verify-entity-warehouse.mjs`
- `node scripts/verify-local-entity-warehouse.mjs`
- `node scripts/run-local-data-pipeline.mjs`

Important notes:

- FDIC amounts arrive in thousands and are normalized to dollars on ingest.
- `sync-sod.mjs` now auto-resolves the latest available SOD year unless `FDIC_SOD_YEAR` is explicitly set.
- `sync-occ.mjs` uses public OCC Excel lists and only creates new `institutions` rows when it cannot match an existing institution by OCC charter, FDIC cert, or RSSD.
- `sync-ffiec-cdr.mjs` uses the official FFIEC CDR PWS REST flow and requires a PWS account token.
- `sync-ffiec-nic.mjs` expects locally downloaded NIC bulk CSV ZIP files because the public download page is CAPTCHA-protected from plain scripted fetches.
- `backfill-entity-warehouse.mjs` seeds the new warehouse tables from current `institutions`, `financial_history`, and `branches` data so the entity APIs can use the new model before every source has a native warehouse loader.
- `backfill-entity-warehouse-local.mjs` performs the same warehouse seed inside the local Postgres sandbox after the legacy tables are mirrored from Supabase.
- `verify-entity-warehouse.mjs` is the quickest way to confirm whether the new warehouse tables are visible through PostgREST or still blocked by schema-cache lag.
- `run-local-data-pipeline.mjs` mirrors the live legacy tables, seeds the local warehouse, and verifies the result in one command.
- Several planned sources are registered but not yet fully ingested.

## Main APIs

Institution APIs:

- `GET /api/institutions/search`
- `GET /api/institutions/:certNumber`
- `GET /api/institutions/screen`

Entity APIs:

- `GET /api/entities/search`
- `GET /api/entities/:entityId`
- `GET /api/entities/:entityId/context`
- `GET /api/entities/:entityId/history`
- `GET /api/entities/:entityId/relationships`
- `GET /api/entities/:entityId/sources`

Source and relationship APIs:

- `GET /api/sources`
- `GET /api/sources/:sourceKey`
- `GET /api/sync`
- `GET /api/sync/:sourceKey`
- `POST /api/sync/:sourceKey`
- `GET /api/relationships/search`
- `GET /api/series/search`

Analytics and QA:

- `GET /api/analytics/overview`
- `GET /api/analytics/discovery`
- `GET /api/analytics/failures`
- `GET /api/qa/status`
- `GET /api/qa/data-readiness`
- `GET /api/qa/warehouse-status`
- `GET /api/qa/check`

Operational sync endpoints:

- `POST /api/sync/fdic`
- `POST /api/sync/occ`
- `POST /api/sync/:sourceKey` for generic script-backed loaders

Sync endpoint notes:

- `GET /api/sync` returns backend sync readiness for all wired loaders.
- `GET /api/sync/:sourceKey` returns requirements, endpoint, and readiness for one source.
- `POST /api/sync/:sourceKey` runs the registered loader when prerequisites are satisfied.
- `dry_run` is only accepted for sources that explicitly support it today. Currently that is `occ`.
- Source detail payloads from `GET /api/sources/:sourceKey` now include sync metadata so the frontend can show whether a loader is callable, blocked on credentials/files, or ready.

## Product direction

The target model is a layered warehouse:

- regulated institutions
- registry-backed nonbank entities
- ecosystem entities
- historical relationships
- source provenance
- macro and market series

Near-term implementation priorities:

1. finish the entity warehouse migration layer
2. add FFIEC CDR and FFIEC NIC ingestion
3. ship terminal-style entity search and profile UI
4. persist failures, enforcement, and charter events
5. expand QA and freshness checks

## QA checklist

Before pushing substantial changes:

```bash
npm run build
```

Recommended manual smoke checks:

- `/api/institutions/screen`
- `/api/analytics/discovery`
- `/api/entities/search`
- `/api/sources`
- `/sources`
- `/analytics`

For data updates, also verify:

- source counts in `data_sources`
- recent `sync_jobs`
- latest `data_as_of` by source
- historical period coverage in `financial_history`

## Branching

Current active implementation branch:

- `codex/entity-intelligence-foundation`

Use feature branches with the `codex/` prefix for major slices like warehouse migrations, new source ingestion, and entity UI work.
