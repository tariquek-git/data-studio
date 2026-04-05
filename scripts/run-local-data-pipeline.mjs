#!/usr/bin/env node
/**
 * One-command local data pipeline for the Postgres sandbox.
 *
 * Runs:
 * 1. mirror live core tables from Supabase
 * 2. backfill the local entity warehouse
 * 3. enrich FDIC institutions with RSSD / CRA context
 * 4. load FDIC institution-level history events
 * 5. seed the local sponsor-bank / embedded-banking ecosystem graph
 * 6. load Bank of Canada macro context
 * 7. verify local warehouse counts
 *
 * Usage:
 *   node scripts/run-local-data-pipeline.mjs
 *   RESET_LOCAL=1 node scripts/run-local-data-pipeline.mjs
 */

import { execFileSync } from 'child_process';

const STEPS = [
  'scripts/mirror-supabase-to-local-postgres.mjs',
  'scripts/backfill-entity-warehouse-local.mjs',
  'scripts/sync-fdic-rssd-cra-local.mjs',
  'scripts/sync-fdic-history.mjs',
  'scripts/sync-baas-ecosystem-local.mjs',
  'scripts/sync-boc-series.mjs',
  'scripts/verify-local-entity-warehouse.mjs',
];

for (const script of STEPS) {
  console.log(`\n=== Running ${script} ===`);
  execFileSync('node', [script], {
    stdio: 'inherit',
    env:
      script === 'scripts/sync-boc-series.mjs' || script === 'scripts/sync-fdic-history.mjs'
        ? { ...process.env, WRITE_TARGET: 'local_pg' }
        : process.env,
  });
}

console.log('\nLocal data pipeline complete.');
