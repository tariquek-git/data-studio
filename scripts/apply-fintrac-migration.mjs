#!/usr/bin/env node
/**
 * Apply FINTRAC Source Constraint Migration
 *
 * Expands the institutions.source CHECK constraint to include:
 *   'fintrac', 'fincen', 'fintech_ca'
 *
 * Requires SUPABASE_ACCESS_TOKEN (Supabase personal access token / PAT).
 * Get one at: https://supabase.com/dashboard/account/tokens
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=sbp_xxxx node scripts/apply-fintrac-migration.mjs
 *
 * Alternative (manual):
 *   1. Open: https://supabase.com/dashboard/project/bvznhycwkgouwmaufdpe/sql/new
 *   2. Paste and run: scripts/schema/archive/add-fintrac-source-constraint.sql
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env
const envContent = readFileSync(join(__dirname, '..', '.env.local'), 'utf-8');
const env = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
}

const SUPABASE_URL = env.SUPABASE_URL;
const ref = SUPABASE_URL?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];

const sql = `
ALTER TABLE institutions
  DROP CONSTRAINT IF EXISTS institutions_source_check;

ALTER TABLE institutions
  ADD CONSTRAINT institutions_source_check
  CHECK (source IN ('fdic', 'ncua', 'osfi', 'rpaa', 'ciro', 'fintrac', 'fincen', 'fintech_ca'));
`.trim();

const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

if (!accessToken) {
  console.log('No SUPABASE_ACCESS_TOKEN found.\n');
  console.log('Manual migration steps:');
  console.log('  1. Open the Supabase SQL Editor:');
  console.log(`     https://supabase.com/dashboard/project/${ref}/sql/new`);
  console.log('  2. Paste and run this SQL:\n');
  console.log(sql);
  console.log('\n  3. Then re-run: node scripts/sync-fintrac.mjs');
  process.exit(0);
}

console.log(`Applying migration to project: ${ref}`);
const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  },
  body: JSON.stringify({ query: sql }),
});

const body = await res.text();
if (res.ok) {
  console.log('Migration applied successfully!');
  console.log('Now run: node scripts/sync-fintrac.mjs');
} else {
  console.error(`Management API error (${res.status}):`, body.slice(0, 500));
  process.exit(1);
}
