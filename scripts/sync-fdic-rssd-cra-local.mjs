#!/usr/bin/env node
/**
 * Backward-compatible wrapper around the shared FDIC RSSD / CRA sync.
 *
 * Prefer:
 *   WRITE_TARGET=local_pg node scripts/sync-fdic-rssd-cra.mjs
 */

import { execFileSync } from 'child_process';

execFileSync('node', ['scripts/sync-fdic-rssd-cra.mjs'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    WRITE_TARGET: process.env.WRITE_TARGET || 'local_pg',
  },
});
