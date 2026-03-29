#!/usr/bin/env node
/**
 * AI Summaries Migration Runner
 *
 * Creates the ai_summaries table via the Supabase Management API.
 *
 * Usage:
 *   node scripts/add-ai-summaries-table.mjs
 *   (uses SUPABASE_ACCESS_TOKEN from the hardcoded token below, or override via env)
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Load .env.local
// ---------------------------------------------------------------------------
const envPath = join(__dirname, '..', '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const env = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
}

const SUPABASE_URL = env.SUPABASE_URL;

if (!SUPABASE_URL) {
  console.error('Missing SUPABASE_URL in .env.local');
  process.exit(1);
}

const ref = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
if (!ref) {
  console.error('Could not extract project ref from SUPABASE_URL:', SUPABASE_URL);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Apply migration via Management API
// ---------------------------------------------------------------------------
const sqlFile = join(__dirname, 'add-ai-summaries-table.sql');
const sql = readFileSync(sqlFile, 'utf-8');

// Use token from env or fall back to the provided token
const accessToken =
  process.env.SUPABASE_ACCESS_TOKEN ??
  'sbp_v0_29b0779c431bc5e0532d710281b860d55bd72e41';

async function runViaMgmtApi() {
  console.log(`Applying ai_summaries migration via Supabase Management API (project: ${ref})...`);
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
    console.log('Table: ai_summaries — created (or already exists)');
    console.log('Index: ai_summaries_generated_at_idx — created (or already exists)');
    return true;
  } else {
    console.error(`Management API error (${res.status}):`, body.slice(0, 500));
    return false;
  }
}

function printManualInstructions() {
  console.log('\n=== MANUAL MIGRATION — ai_summaries table ===');
  console.log('Apply the SQL migration manually:\n');
  console.log('OPTION 1 — Supabase Dashboard SQL Editor:');
  console.log(`  1. Open: https://supabase.com/dashboard/project/${ref}/sql/new`);
  console.log(`  2. Paste the contents of: ${sqlFile}`);
  console.log('  3. Click "Run"\n');
  console.log('SQL preview:\n---');
  console.log(sql);
  console.log('---\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const ok = await runViaMgmtApi();
  if (!ok) {
    printManualInstructions();
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
