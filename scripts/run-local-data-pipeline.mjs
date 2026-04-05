#!/usr/bin/env node
/**
 * One-command local data pipeline for the Postgres sandbox.
 *
 * Runs:
 * 1. mirror live core tables from Supabase
 * 2. backfill the local entity warehouse
 * 3. enrich FDIC institutions with RSSD / CRA context
 * 4. optionally replace CRA facts with the official FFIEC ratings file
 * 5. load FDIC institution-level history events
 * 6. persist FDIC failure history
 * 7. seed the local sponsor-bank / embedded-banking ecosystem graph
 * 8. optionally load CFPB complaint context for matched entities
 * 9. load Bank of Canada macro context
 * 10. verify local warehouse counts
 *
 * Usage:
 *   node scripts/run-local-data-pipeline.mjs
 *   RESET_LOCAL=1 node scripts/run-local-data-pipeline.mjs
 */

import { execFileSync } from 'child_process';

const ENABLE_CFPB = /^(1|true|yes)$/i.test(process.env.ENABLE_CFPB ?? '');
const ENABLE_FFIEC_CRA =
  /^(1|true|yes)$/i.test(process.env.ENABLE_FFIEC_CRA ?? '') ||
  Boolean(process.env.FFIEC_CRA_FILE);

const STEPS = [
  'scripts/mirror-supabase-to-local-postgres.mjs',
  'scripts/backfill-entity-warehouse-local.mjs',
  'scripts/sync-fdic-rssd-cra.mjs',
  ...(ENABLE_FFIEC_CRA ? ['scripts/sync-ffiec-cra.mjs'] : []),
  'scripts/sync-fdic-history.mjs',
  'scripts/sync-fdic-failures.mjs',
  'scripts/sync-baas-ecosystem-local.mjs',
  'scripts/sync-boc-series.mjs',
  'scripts/verify-local-entity-warehouse.mjs',
];

if (ENABLE_CFPB) {
  STEPS.splice(STEPS.length - 2, 0, 'scripts/sync-cfpb-complaints.mjs');
}

for (const script of STEPS) {
  console.log(`\n=== Running ${script} ===`);
  execFileSync('node', [script], {
    stdio: 'inherit',
    env:
      (
        script === 'scripts/sync-boc-series.mjs' ||
        script === 'scripts/sync-fdic-history.mjs' ||
        script === 'scripts/sync-fdic-rssd-cra.mjs' ||
        script === 'scripts/sync-fdic-failures.mjs' ||
        script === 'scripts/sync-ffiec-cra.mjs' ||
        script === 'scripts/sync-cfpb-complaints.mjs'
      )
        ? { ...process.env, WRITE_TARGET: 'local_pg' }
        : process.env,
  });
}

console.log('\nLocal data pipeline complete.');
