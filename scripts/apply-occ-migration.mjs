#!/usr/bin/env node
/**
 * Apply OCC Source Constraint Migration
 *
 * Expands the institutions.source CHECK constraint to include:
 *   'occ'
 *
 * Requires SUPABASE_ACCESS_TOKEN (Supabase personal access token / PAT).
 * Without a PAT, the script prints the exact SQL to run manually.
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=sbp_xxxx node scripts/apply-occ-migration.mjs
 *   node scripts/apply-occ-migration.mjs
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const envContent = readFileSync(join(__dirname, '..', '.env.local'), 'utf-8');
const env = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
}

const ref = env.SUPABASE_URL?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
const sql = readFileSync(join(__dirname, 'schema', 'archive', 'add-occ-source-constraint.sql'), 'utf-8');
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

if (!accessToken) {
  console.log('No SUPABASE_ACCESS_TOKEN found.\n');
  console.log('Manual migration steps:');
  console.log(`  1. Open: https://supabase.com/dashboard/project/${ref}/sql/new`);
  console.log('  2. Paste and run this SQL:\n');
  console.log(sql);
  console.log('\n  3. Then re-run: node scripts/sync-occ.mjs');
  process.exit(0);
}

console.log(`Applying OCC source migration to project: ${ref}`);
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
  console.log('Migration applied successfully.');
  console.log('Now run: node scripts/sync-occ.mjs');
} else {
  console.error(`Management API error (${res.status}):`, body.slice(0, 500));
  process.exit(1);
}
