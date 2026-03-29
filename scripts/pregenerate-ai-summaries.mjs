#!/usr/bin/env node
/**
 * Pre-generate AI Summaries for Large Institutions
 *
 * Loads FDIC + NCUA institutions with total_assets > $1B from Supabase,
 * skips those with fresh cached summaries, and calls POST /api/ai/summary
 * on the production URL for each. Rate-limited to 2 req/sec.
 *
 * Usage:
 *   node scripts/pregenerate-ai-summaries.mjs
 *   PRODUCTION_URL=https://data.fintechcommons.com node scripts/pregenerate-ai-summaries.mjs
 */

import { createClient } from '@supabase/supabase-js';
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
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const PRODUCTION_URL = process.env.PRODUCTION_URL ?? env.PRODUCTION_URL ?? 'https://data.fintechcommons.com';
const RATE_LIMIT_MS = 500; // 2 req/sec = 500ms between requests
const CACHE_TTL_DAYS = 7;
const MIN_ASSETS = 1_000_000_000; // $1B

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isStale(generatedAt) {
  if (!generatedAt) return true;
  const ageMs = Date.now() - new Date(generatedAt).getTime();
  return ageMs > CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('=== Pre-generate AI Summaries ===');
  console.log(`Production URL: ${PRODUCTION_URL}`);
  console.log(`Min assets: $${(MIN_ASSETS / 1e9).toFixed(0)}B`);
  console.log(`Cache TTL: ${CACHE_TTL_DAYS} days`);
  console.log(`Rate limit: 2 req/sec\n`);

  // 1. Load target institutions (fdic + ncua, active, assets > $1B)
  console.log('Loading institutions from Supabase...');
  const { data: institutions, error: instError } = await supabase
    .from('institutions')
    .select('cert_number, name, source, total_assets')
    .in('source', ['fdic', 'ncua'])
    .eq('active', true)
    .gte('total_assets', MIN_ASSETS)
    .order('total_assets', { ascending: false });

  if (instError || !institutions) {
    console.error('Failed to load institutions:', instError?.message);
    process.exit(1);
  }

  console.log(`Found ${institutions.length} institutions with assets > $1B\n`);

  // 2. Load existing fresh summaries to skip
  console.log('Loading existing cached summaries...');
  const { data: existingSummaries, error: sumError } = await supabase
    .from('ai_summaries')
    .select('cert_number, generated_at');

  if (sumError) {
    console.warn('Warning: could not load existing summaries (table may not exist yet):', sumError.message);
  }

  const freshSet = new Set(
    (existingSummaries ?? [])
      .filter((s) => !isStale(s.generated_at))
      .map((s) => s.cert_number)
  );

  const toProcess = institutions.filter((inst) => !freshSet.has(inst.cert_number));
  const skipped = institutions.length - toProcess.length;

  console.log(`Skipping ${skipped} institutions with fresh summaries`);
  console.log(`Processing ${toProcess.length} institutions\n`);

  if (toProcess.length === 0) {
    console.log('All summaries are up to date. Nothing to do.');
    return;
  }

  // 3. Process each institution
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const inst = toProcess[i];
    const assetStr =
      inst.total_assets >= 1e9
        ? `$${(inst.total_assets / 1e9).toFixed(1)}B`
        : `$${(inst.total_assets / 1e6).toFixed(0)}M`;

    process.stdout.write(
      `[${i + 1}/${toProcess.length}] ${inst.name} (${inst.source.toUpperCase()} #${inst.cert_number}, ${assetStr})... `
    );

    try {
      const res = await fetch(`${PRODUCTION_URL}/api/ai/summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certNumber: inst.cert_number }),
      });

      if (res.ok) {
        const data = await res.json();
        const label = data.cached ? '[cached]' : '[generated]';
        console.log(`OK ${label}`);
        succeeded++;
      } else {
        const body = await res.text().catch(() => '');
        console.log(`FAIL (${res.status}) ${body.slice(0, 100)}`);
        failed++;
      }
    } catch (err) {
      console.log(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }

    // Rate limit: wait 500ms between requests (2 req/sec)
    if (i < toProcess.length - 1) {
      await sleep(RATE_LIMIT_MS);
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Total processed: ${toProcess.length}`);
  console.log(`Succeeded: ${succeeded}`);
  console.log(`Failed: ${failed}`);
  console.log(`Skipped (fresh): ${skipped}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
