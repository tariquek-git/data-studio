#!/usr/bin/env node
/**
 * Entity Foundation Migration Runner
 *
 * Applies scripts/add-entity-foundation.sql through the Supabase Management API
 * when SUPABASE_ACCESS_TOKEN is available. Otherwise prints manual SQL steps.
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=<pat> node scripts/run-migration-entity-foundation.mjs
 *   node scripts/run-migration-entity-foundation.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const envPath = join(__dirname, '..', '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const env = {};

for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
}

const SUPABASE_URL = env.SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const ref = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
const sqlFiles = [
  join(__dirname, 'add-entity-foundation.sql'),
  join(__dirname, 'add-failure-events-table.sql'),
];
const sql = sqlFiles
  .map((filePath) => readFileSync(filePath, 'utf-8'))
  .join('\n\n');

async function runViaMgmtApi(accessToken) {
  console.log(`Applying entity foundation migration via Supabase Management API (project: ${ref})...`);
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
    console.log('Entity foundation migration applied successfully.');
    return true;
  }

  console.error(`Management API error (${res.status}):`, body.slice(0, 500));
  return false;
}

function printManualInstructions() {
  console.log('\n=== MANUAL MIGRATION — entity foundation ===');
  console.log('Apply the SQL migration manually using one of these methods:\n');
  console.log('OPTION 1 — Supabase Dashboard SQL Editor:');
  console.log(`  1. Open: https://supabase.com/dashboard/project/${ref}/sql/new`);
  console.log(`  2. Paste the contents of:\n     - ${sqlFiles[0]}\n     - ${sqlFiles[1]}`);
  console.log('  3. Click "Run"\n');
  console.log('OPTION 2 — Supabase CLI:');
  console.log(`  supabase login && supabase link --project-ref ${ref}`);
  console.log('  supabase db push\n');
  console.log('SQL preview:\n---');
  console.log(sql.split('\n').slice(0, 24).join('\n'));
  console.log('...\n---\n');
}

async function main() {
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

  if (accessToken) {
    const ok = await runViaMgmtApi(accessToken);
    if (!ok) printManualInstructions();
  } else {
    console.log('No SUPABASE_ACCESS_TOKEN found - skipping automatic migration.');
    printManualInstructions();
  }

  const { data, error } = await supabase
    .from('registry_entities')
    .select('id')
    .limit(1);

  if (!error) {
    console.log('Post-migration probe complete.');
    console.log('registry_entities table is reachable.');
    return;
  }

  if (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /schema cache/i.test(error.message ?? '')
  ) {
    console.warn(
      'Post-migration probe could not see registry_entities yet. ' +
      'If you just ran the SQL in the dashboard, refresh PostgREST with: NOTIFY pgrst, \'reload schema\';'
    );
    return;
  }

  console.error('Unexpected post-migration probe error:', error.message);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
