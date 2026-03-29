#!/usr/bin/env node
/**
 * Fix blank institution names by fetching from FDIC /institutions endpoint.
 * Run: node scripts/fix-names.mjs
 */
import { createClient } from '@supabase/supabase-js';
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

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const FDIC_API = 'https://banks.data.fdic.gov/api';

async function main() {
  console.log('Fetching all institution names from FDIC /institutions...');
  const nameMap = {};
  let offset = 0;
  const limit = 10000;

  while (true) {
    const url = `${FDIC_API}/institutions?fields=CERT,NAME&limit=${limit}&offset=${offset}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.data || data.data.length === 0) break;
    for (const row of data.data) {
      if (row.data?.CERT && row.data?.NAME) {
        nameMap[Number(row.data.CERT)] = row.data.NAME;
      }
    }
    console.log(`  Fetched ${Object.keys(nameMap).length} names...`);
    if (data.data.length < limit) break;
    offset += limit;
  }
  console.log(`Total: ${Object.keys(nameMap).length} names from FDIC`);

  // Get all institutions in our DB with blank names (paginate past 1000 limit)
  const blankRows = [];
  let blankOffset = 0;
  while (true) {
    const { data: batch, error } = await supabase
      .from('institutions')
      .select('cert_number')
      .or('name.eq.,name.is.null')
      .range(blankOffset, blankOffset + 999);
    if (error) { console.error('Fetch error:', error.message); break; }
    if (!batch || batch.length === 0) break;
    blankRows.push(...batch);
    if (batch.length < 1000) break;
    blankOffset += 1000;
  }

  console.log(`Found ${blankRows.length} institutions with blank names`);

  if (!blankRows || blankRows.length === 0) {
    console.log('Nothing to fix!');
    return;
  }

  // Update in concurrent batches of 20
  let updated = 0;
  const concurrency = 20;
  const rows = blankRows.filter(r => nameMap[r.cert_number]);

  for (let i = 0; i < rows.length; i += concurrency) {
    const chunk = rows.slice(i, i + concurrency);
    await Promise.all(chunk.map(async (row) => {
      const name = nameMap[row.cert_number];
      if (!name) return;
      const { error: upErr } = await supabase
        .from('institutions')
        .update({ name })
        .eq('cert_number', row.cert_number);
      if (!upErr) updated++;
      else console.error(`  Error updating cert ${row.cert_number}:`, upErr.message);
    }));
    if (i % 200 === 0) console.log(`  Updated ${updated}/${rows.length}...`);
  }

  console.log(`\nDone! Updated names for ${updated} institutions.`);
}

main().catch(console.error);
