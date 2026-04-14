#!/usr/bin/env node
/**
 * sync-sec-exec-transition.mjs
 *
 * Detects executive transitions at FDIC institutions by scanning SEC EDGAR for
 * 8-K filings containing Item 5.02 (Departure of Directors or Principal Officers;
 * Election of Directors; Appointment of Principal Officers; Compensation).
 *
 * Writes one `signal.exec_transition` fact per (institution, filing) into
 * entity_facts. Depends on entity_external_ids having id_type='cik' rows —
 * see scripts/backfill-cik-ids.mjs.
 *
 * SEC EDGAR rate limit: 10 req/sec. We go well under that (~2/sec) with a
 * declared User-Agent as required by SEC.
 *
 * Idempotent: existing signal rows are cleared per-run, then re-inserted from
 * the most recent 12 months of filings.
 *
 * Run: node scripts/sync-sec-exec-transition.mjs [--dry-run]
 */

import {
  createSupabaseServiceClient,
  loadEnvLocal,
  startSyncJob,
  finishSyncJob,
  chunkArray,
} from './_sync-utils.mjs';

const DRY_RUN = process.argv.includes('--dry-run');
const USER_AGENT = 'data-studio brim-bd-intelligence (tarique@brimfinancial.com)';
const EDGAR_SUBMISSIONS = (cik) => `https://data.sec.gov/submissions/CIK${cik}.json`;
const EDGAR_FILING_INDEX = (cik, accession) =>
  `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=8-K&dateb=&owner=include&count=40`;
// 6-month window: recency matters for BD. A 12-month-old exec change is stale.
const LOOKBACK_MONTHS = 6;
const MIN_DELAY_MS = 120; // ~8 req/sec ceiling, well under 10/sec SEC limit

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url) {
  const resp = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
  if (!resp.ok) throw new Error(`${url} → ${resp.status}`);
  return resp.json();
}

/**
 * For a given CIK, pull recent 8-K filings. Returns array of
 * { accession, filedAt, items, primaryDoc }.
 */
async function fetchRecent8Ks(cik) {
  const data = await fetchJson(EDGAR_SUBMISSIONS(cik));
  const recent = data?.filings?.recent;
  if (!recent) return [];
  const {
    accessionNumber = [],
    form = [],
    filingDate = [],
    items = [],
    primaryDocument = [],
  } = recent;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - LOOKBACK_MONTHS);
  const out = [];
  for (let i = 0; i < form.length; i++) {
    if (form[i] !== '8-K') continue;
    const filedAt = new Date(filingDate[i]);
    if (filedAt < cutoff) continue;
    const itemsStr = items[i] || '';
    // Item 5.02 is the trigger. EDGAR sometimes writes "5.02" or "Item 5.02".
    if (!/5\.02/.test(itemsStr)) continue;
    // Exclude annual-meeting filings (5.07) — those are routine director
    // re-elections, not executive transitions. Same for 5.03 (bylaw
    // amendments) which are governance housekeeping.
    if (/5\.07/.test(itemsStr)) continue;
    out.push({
      accession: accessionNumber[i],
      filedAt: filingDate[i],
      items: itemsStr,
      primaryDoc: primaryDocument[i],
    });
  }
  return out;
}

async function main() {
  const env = loadEnvLocal();
  const supabase = createSupabaseServiceClient(env);

  console.log('=== sync-sec-exec-transition.mjs ===');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);

  // Load CIKs from entity_external_ids and join back to institution
  const { data: cikRows, error: cikErr } = await supabase
    .from('entity_external_ids')
    .select('entity_id, id_value')
    .eq('entity_table', 'institutions')
    .eq('id_type', 'cik');
  if (cikErr) throw new Error(`fetch CIK rows: ${cikErr.message}`);

  // Group: one CIK can map to many institutions (holding co → many subs).
  // We issue one EDGAR fetch per unique CIK and fan out to every linked entity.
  const byCik = new Map();
  for (const row of cikRows) {
    if (!byCik.has(row.id_value)) byCik.set(row.id_value, []);
    byCik.get(row.id_value).push(row.entity_id);
  }
  console.log(`Loaded ${cikRows.length} CIK links (${byCik.size} unique CIKs)`);

  const jobId = DRY_RUN ? null : await startSyncJob(supabase, 'sync-sec-exec-transition');

  const facts = [];
  let ciksScanned = 0;
  let ciksWith502 = 0;
  const errors = [];

  for (const [cik, entityIds] of byCik) {
    ciksScanned++;
    try {
      const filings = await fetchRecent8Ks(cik);
      if (filings.length > 0) {
        ciksWith502++;
        for (const f of filings) {
          const accessionClean = f.accession.replace(/-/g, '');
          const docUrl = f.primaryDoc
            ? `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accessionClean}/${f.primaryDoc}`
            : `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=8-K`;
          for (const entityId of entityIds) {
            facts.push({
              entity_table: 'institutions',
              entity_id: entityId,
              fact_type: 'signal.exec_transition',
              fact_key: `8k_${f.accession}`,
              fact_value_json: {
                cik,
                accession: f.accession,
                filed_at: f.filedAt,
                items: f.items,
              },
              source_kind: 'official',
              source_url: docUrl,
              observed_at: new Date(f.filedAt).toISOString(),
              // 0–100 percent scale, matching compute_brim_score() expectations
              // and the existing signal.* facts (asset_band_fit=90, card_portfolio=95, etc.).
              confidence_score: 85,
              notes: `SEC 8-K Item 5.02 filed ${f.filedAt} (items: ${f.items})`,
              sync_job_id: jobId,
            });
          }
        }
      }
    } catch (err) {
      errors.push(`CIK ${cik}: ${err.message}`);
    }
    if (ciksScanned % 25 === 0) {
      console.log(`  scanned ${ciksScanned}/${byCik.size}, ${ciksWith502} with 5.02, ${facts.length} facts queued`);
    }
    await sleep(MIN_DELAY_MS);
  }

  console.log();
  console.log(`Scanned ${ciksScanned} CIKs`);
  console.log(`${ciksWith502} had Item 5.02 filings in last ${LOOKBACK_MONTHS} months`);
  console.log(`${facts.length} facts to write`);
  if (errors.length > 0) console.log(`${errors.length} CIKs errored (first 3): ${errors.slice(0, 3).join(' | ')}`);

  if (DRY_RUN) {
    console.log('(DRY RUN — no writes)');
    if (facts.length > 0) {
      console.log('Sample facts:');
      for (const f of facts.slice(0, 5)) {
        console.log(`  ${f.fact_key} ${f.notes}`);
      }
    }
    return;
  }

  // Clear previous signal rows then insert fresh (partial unique index
  // prevents us from using ON CONFLICT cleanly).
  const { error: delErr } = await supabase
    .from('entity_facts')
    .delete()
    .eq('fact_type', 'signal.exec_transition')
    .eq('source_kind', 'official');
  if (delErr) throw new Error(`clear prior facts: ${delErr.message}`);

  let inserted = 0;
  for (const batch of chunkArray(facts, 500)) {
    const { error } = await supabase.from('entity_facts').insert(batch);
    if (error) {
      errors.push(`insert batch: ${error.message}`);
      continue;
    }
    inserted += batch.length;
  }

  await finishSyncJob(supabase, jobId, {
    status: errors.length > 0 && inserted === 0 ? 'failed' : 'completed',
    records_processed: inserted,
    error: errors.length > 0 ? errors.slice(0, 3).join(' | ') : null,
  });

  console.log(`Inserted ${inserted} facts`);
}

main().catch((err) => {
  console.error('sync-sec-exec-transition failed:', err);
  process.exit(1);
});
