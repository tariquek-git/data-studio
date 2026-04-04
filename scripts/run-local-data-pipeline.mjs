#!/usr/bin/env node
/**
 * One-command local data pipeline for the Postgres sandbox.
 *
 * Runs:
 * 1. mirror live core tables from Supabase
 * 2. backfill the local entity warehouse
 * 3. verify local warehouse counts
 *
 * Usage:
 *   node scripts/run-local-data-pipeline.mjs
 *   RESET_LOCAL=1 node scripts/run-local-data-pipeline.mjs
 */

import { execFileSync } from 'child_process';

const STEPS = [
  'scripts/mirror-supabase-to-local-postgres.mjs',
  'scripts/backfill-entity-warehouse-local.mjs',
  'scripts/verify-local-entity-warehouse.mjs',
];

for (const script of STEPS) {
  console.log(`\n=== Running ${script} ===`);
  execFileSync('node', [script], {
    stdio: 'inherit',
    env: process.env,
  });
}

console.log('\nLocal data pipeline complete.');
