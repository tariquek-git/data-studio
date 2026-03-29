#!/usr/bin/env node
/**
 * Migration Runner
 *
 * Applies a SQL migration file to the Supabase database.
 * Uses the Supabase Management API (requires SUPABASE_ACCESS_TOKEN env var)
 * or falls back to printing instructions for manual application.
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=<pat> node scripts/run-migration.mjs scripts/add-capabilities-table.sql
 *   node scripts/run-migration.mjs scripts/add-capabilities-table.sql   # prints instructions
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env
const envContent = readFileSync(join(__dirname, '..', '.env.local'), 'utf-8');
const env = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
}

const sqlFile = process.argv[2]
  ? resolve(process.argv[2])
  : join(__dirname, 'add-capabilities-table.sql');

const sql = readFileSync(sqlFile, 'utf-8');
const ref = env.SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];

async function runViaMgmtApi(accessToken) {
  console.log(`Running migration via Supabase Management API (project: ${ref})...`);
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
    console.log('Response:', body.slice(0, 500));
    return true;
  } else {
    console.error(`Management API error (${res.status}):`, body.slice(0, 500));
    return false;
  }
}

function printManualInstructions() {
  console.log('\n=== MANUAL MIGRATION INSTRUCTIONS ===');
  console.log('The migration could not be applied automatically.');
  console.log('Please apply it manually via one of these methods:\n');
  console.log('OPTION 1 — Supabase Dashboard SQL Editor:');
  console.log(`  1. Open: https://supabase.com/dashboard/project/${ref}/sql/new`);
  console.log(`  2. Paste the contents of: ${sqlFile}`);
  console.log('  3. Click "Run"\n');
  console.log('OPTION 2 — Supabase CLI (requires personal access token):');
  console.log('  1. supabase login');
  console.log('  2. supabase link --project-ref', ref);
  console.log('  3. supabase db push\n');
  console.log('OPTION 3 — psql direct connection:');
  console.log(`  psql "postgresql://postgres.<ref>:[DB_PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres"`);
  console.log(`  \\i ${sqlFile}\n`);
  console.log('SQL file contents:\n');
  console.log('---');
  console.log(sql);
  console.log('---');
}

async function main() {
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

  if (accessToken) {
    const ok = await runViaMgmtApi(accessToken);
    if (!ok) printManualInstructions();
  } else {
    console.log('No SUPABASE_ACCESS_TOKEN found — cannot apply migration automatically.');
    printManualInstructions();
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
