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
const SKIP_TEXT_FILTER = process.argv.includes('--skip-text-filter');
const USER_AGENT = 'data-studio brim-bd-intelligence (tarique@brimfinancial.com)';
const EDGAR_SUBMISSIONS = (cik) => `https://data.sec.gov/submissions/CIK${cik}.json`;
const EDGAR_FILING_DOC = (cik, accessionClean, primaryDoc) =>
  `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accessionClean}/${primaryDoc}`;
// 6-month window: recency matters for BD. A 12-month-old exec change is stale.
const LOOKBACK_MONTHS = 6;
const MIN_DELAY_MS = 120; // ~8 req/sec ceiling, well under 10/sec SEC limit

// C-suite titles — deliberately NARROW. "President" alone is too broad (matches
// "President of [some subsidiary]") and "Executive Vice President" is middle
// management for BD purposes. We only want top-of-house changes.
const CSUITE_TITLES = /\b(chief\s+executive\s+officer|chief\s+financial\s+officer|chief\s+operating\s+officer|chief\s+risk\s+officer|\bCEO\b|\bCFO\b|\bCOO\b|\bCRO\b)\b/i;
// Departure/appointment verbs — excludes "transition" (too generic, matches
// "transition services agreement" in every 8-K's legal boilerplate).
const TRANSITION_VERBS = /\b(resign(?:ed|ation)?|retire(?:d|ment)?|depart(?:ed|ure)?|terminat(?:ed|ion)?|step(?:ped|ping)?\s+down|appoint(?:ed|ment)?\s+(?:\w+\s+){0,5}(?:chief|ceo|cfo|coo)|succeed(?:ed|ing)?\s+(?:\w+\s+){0,5}(?:as|chief))/i;
// Proximity requirement: a C-suite title must appear within this many chars of
// a transition verb in order to count. Filters out unrelated mentions on page.
const PROXIMITY_CHARS = 300;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url) {
  const resp = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
  if (!resp.ok) throw new Error(`${url} → ${resp.status}`);
  return resp.json();
}

/**
 * Fetch the primary document of an 8-K filing and check if it mentions
 * C-suite titles + transition verbs. Returns { isCsuite, matchedTitle, matchedVerb }
 * or null if the document couldn't be fetched.
 */
async function checkFilingForCsuiteTransition(cik, accession, primaryDoc) {
  if (!primaryDoc) return null;
  const accessionClean = accession.replace(/-/g, '');
  const url = EDGAR_FILING_DOC(cik, accessionClean, primaryDoc);
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html, text/plain' },
    });
    if (!resp.ok) return null;
    // Only read first 50KB — the Item 5.02 section is near the top
    const text = (await resp.text())
      .substring(0, 50000)
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ');

    // Proximity check: a title match and verb match must sit within
    // PROXIMITY_CHARS of each other. This filters out cases where "CEO" appears
    // in a header and "resignation" appears elsewhere for unrelated reasons.
    const titleMatches = [...text.matchAll(new RegExp(CSUITE_TITLES.source, 'gi'))];
    const verbMatches = [...text.matchAll(new RegExp(TRANSITION_VERBS.source, 'gi'))];

    for (const t of titleMatches) {
      for (const v of verbMatches) {
        if (Math.abs(t.index - v.index) <= PROXIMITY_CHARS) {
          return {
            isCsuite: true,
            matchedTitle: t[0],
            matchedVerb: v[0],
            distance: Math.abs(t.index - v.index),
          };
        }
      }
    }
    return { isCsuite: false, matchedTitle: null, matchedVerb: null };
  } catch {
    return null;
  }
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
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}${SKIP_TEXT_FILTER ? ' (text filter OFF)' : ''}`);

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
  let filingsChecked = 0;
  let filingsPassedFilter = 0;
  let filingsSkippedNoDoc = 0;
  const errors = [];

  for (const [cik, entityIds] of byCik) {
    ciksScanned++;
    try {
      const filings = await fetchRecent8Ks(cik);
      if (filings.length > 0) {
        ciksWith502++;
        for (const f of filings) {
          filingsChecked++;
          const accessionClean = f.accession.replace(/-/g, '');
          const docUrl = f.primaryDoc
            ? `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accessionClean}/${f.primaryDoc}`
            : `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=8-K`;

          // Text-level filter: fetch the filing and check for C-suite keywords
          let textResult = null;
          let confidence = 85;
          if (!SKIP_TEXT_FILTER && f.primaryDoc) {
            textResult = await checkFilingForCsuiteTransition(cik, f.accession, f.primaryDoc);
            await sleep(MIN_DELAY_MS); // rate limit the extra fetch
            if (textResult && !textResult.isCsuite) {
              // Filing doesn't mention C-suite transition — skip it
              continue;
            }
            if (!textResult) {
              // Couldn't fetch/parse — keep it but lower confidence
              filingsSkippedNoDoc++;
              confidence = 60;
            } else {
              filingsPassedFilter++;
            }
          } else if (!f.primaryDoc) {
            filingsSkippedNoDoc++;
            confidence = 60;
          } else {
            filingsPassedFilter++;
          }

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
                ...(textResult?.matchedTitle && { matched_title: textResult.matchedTitle }),
                ...(textResult?.matchedVerb && { matched_verb: textResult.matchedVerb }),
                ...(textResult?.distance != null && { match_distance: textResult.distance }),
              },
              source_kind: 'official',
              source_url: docUrl,
              observed_at: new Date(f.filedAt).toISOString(),
              confidence_score: confidence,
              notes: `SEC 8-K Item 5.02 filed ${f.filedAt}${textResult?.matchedTitle ? ` (${textResult.matchedTitle})` : ''} (items: ${f.items})`,
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
  console.log(`${filingsChecked} filings checked, ${filingsPassedFilter} passed C-suite filter, ${filingsSkippedNoDoc} had no doc`);
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
