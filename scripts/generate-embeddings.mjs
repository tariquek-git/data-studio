#!/usr/bin/env node
/**
 * generate-embeddings.mjs
 *
 * Generates OpenAI text-embedding-3-small embeddings (1536 dimensions) for
 * every institution that does not yet have an embedding stored, then upserts
 * the result back into the institutions table.
 *
 * Usage:
 *   node scripts/generate-embeddings.mjs
 *
 * Required env vars (in .env.local or environment):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   OPENAI_API_KEY
 *
 * Note: this script requires the `openai` npm package.
 *   Install with: npm install openai
 */

import { loadEnvLocal, getEnvValue, createSupabaseServiceClient, chunkArray } from './_sync-utils.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatAssets(value) {
  if (value == null) return 'N/A';
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${(value / 1e12).toFixed(1)}T`;
  if (abs >= 1e9)  return `${(value / 1e9).toFixed(1)}B`;
  if (abs >= 1e6)  return `${(value / 1e6).toFixed(1)}M`;
  if (abs >= 1e3)  return `${(value / 1e3).toFixed(1)}K`;
  return String(value);
}

/**
 * Build a compact text representation of an institution for embedding.
 * Aim: capture enough signal (charter type, regulator, location, financial
 * scale, profitability) so that cosine distance reflects genuine similarity.
 */
function buildInstitutionText(inst) {
  const cityState = [inst.city, inst.state].filter(Boolean).join(', ') || 'Unknown location';
  const assets    = `$${formatAssets(inst.total_assets)}`;
  const deposits  = `$${formatAssets(inst.total_deposits)}`;
  const roa       = inst.roa != null ? `${inst.roa.toFixed(2)}%` : 'N/A';
  const hc        = inst.holding_company || 'None';

  return [
    `${inst.name} | ${inst.charter_type ?? 'N/A'} | ${inst.source ?? 'N/A'} | ${inst.regulator ?? 'N/A'} | ${cityState}`,
    `Assets: ${assets} | ROA: ${roa} | Deposits: ${deposits}`,
    `Holding company: ${hc}`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const env = loadEnvLocal();

  const openaiKey = getEnvValue(env, 'OPENAI_API_KEY');
  if (!openaiKey) {
    throw new Error('Missing OPENAI_API_KEY in .env.local');
  }

  // Lazy-import openai so the error message is clear if not installed.
  let OpenAI;
  try {
    ({ default: OpenAI } = await import('openai'));
  } catch {
    throw new Error(
      'The `openai` package is not installed. Run: npm install openai'
    );
  }

  const openai   = new OpenAI({ apiKey: openaiKey });
  const supabase = createSupabaseServiceClient(env);

  // Fetch all institutions without embeddings.
  console.log('Fetching institutions without embeddings…');
  const { data: institutions, error: fetchError } = await supabase
    .from('institutions')
    .select('id, name, charter_type, source, regulator, city, state, total_assets, total_deposits, roa, holding_company')
    .is('embedding', null)
    .order('cert_number', { ascending: true });

  if (fetchError) throw new Error(`Fetch failed: ${fetchError.message}`);
  if (!institutions || institutions.length === 0) {
    console.log('All institutions already have embeddings. Nothing to do.');
    return;
  }

  console.log(`Found ${institutions.length} institutions to embed.`);

  const BATCH_SIZE = 100;
  const batches = chunkArray(institutions, BATCH_SIZE);
  let processed = 0;
  let errors = 0;

  for (const batch of batches) {
    const texts = batch.map(buildInstitutionText);

    let embeddingResponse;
    try {
      embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: texts,
        dimensions: 1536,
      });
    } catch (err) {
      console.error(`OpenAI API error on batch starting at index ${processed}:`, err.message);
      errors += batch.length;
      continue;
    }

    // Build upsert rows: [{id, embedding}]
    const rows = batch.map((inst, idx) => ({
      id: inst.id,
      embedding: embeddingResponse.data[idx].embedding,
    }));

    // Upsert in sub-chunks to avoid hitting Supabase payload limits.
    const upsertChunks = chunkArray(rows, 50);
    for (const chunk of upsertChunks) {
      const { error: upsertError } = await supabase
        .from('institutions')
        .upsert(chunk, { onConflict: 'id' });

      if (upsertError) {
        console.error(`Upsert error: ${upsertError.message}`);
        errors += chunk.length;
      }
    }

    processed += batch.length;
    if (processed % 500 === 0 || processed === institutions.length) {
      console.log(`  Progress: ${processed} / ${institutions.length} institutions embedded`);
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Total processed: ${processed}`);
  console.log(`Successful:      ${processed - errors}`);
  console.log(`Errors:          ${errors}`);
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
