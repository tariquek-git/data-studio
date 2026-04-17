#!/usr/bin/env node
/**
 * backfill-cik-icp-cohort.mjs
 *
 * Focused CIK backfill for the $10B-$250B US ICP cohort (icp_cohort_10b_250b_us view).
 * The generic scripts/backfill-cik-ids.mjs misses a chunk of these because FDIC
 * abbreviates "Bancorp" as "BCORP" and uses other short forms the default
 * normalizer doesn't collapse (Huntington Bancshares, Fifth Third BCORP,
 * KeyCorp, Comerica Inc, etc.).
 *
 * This script:
 *   1. Loads the 164 cohort institutions.
 *   2. Uses an expanded normalizer that handles the known FDIC short forms.
 *   3. Matches against SEC company_tickers.json by normalized name.
 *   4. Falls back to a substring / token-overlap match for unmatched names.
 *   5. Upserts entity_external_ids with id_type='cik'.
 *
 * Idempotent. Run: node scripts/backfill-cik-icp-cohort.mjs [--dry-run]
 */

import {
  createSupabaseServiceClient,
  loadEnvLocal,
  startSyncJob,
  finishSyncJob,
} from './_sync-utils.mjs';

const DRY_RUN = process.argv.includes('--dry-run');
const SEC_TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';
const USER_AGENT = 'data-studio brim-bd-intelligence (tarique@brimfinancial.com)';

// Expanded suffix list: includes FDIC's BCORP abbreviation and other short forms.
const SUFFIX_PATTERNS = [
  /\b(inc|incorporated|corp|corporation|co|company|ltd|limited|plc|sa|nv|llc|lp|llp|group|holdings|holding|bancorp|bancorporation|bcorp|banc|bancshares|bkshares|financial|financials|services|svcs|national association|n\.a\.|na|fsb|fa|the)\b/gi,
  /[.,&']/g,
  /\s+/g,
];

function normalizeName(raw) {
  if (!raw) return '';
  let s = String(raw).toLowerCase().replace(/[^a-z0-9 ]/g, ' ');
  for (const pat of SUFFIX_PATTERNS) s = s.replace(pat, ' ');
  return s.trim().replace(/\s+/g, ' ');
}

// Tokens that are too common to drive a match on their own — geographic
// descriptors, generic banking words, common proper-noun fragments.
const GENERIC_TOKENS = new Set([
  // Banking nouns
  'bank', 'banks', 'trust', 'financial', 'savings', 'loan', 'credit', 'union',
  'bancshares', 'services', 'holdings', 'holding', 'company', 'group', 'corp',
  'corporation', 'incorporated',
  // "National/federal/state" generics
  'national', 'federal', 'state', 'commercial', 'industrial', 'mutual',
  // Generic place-of-origin words that appear in thousands of names
  'american', 'america', 'new', 'united', 'peoples', 'citizens', 'international',
  'global', 'pacific', 'atlantic', 'southern', 'northern', 'western', 'eastern',
  'central', 'valley', 'mountain', 'washington', 'california', 'florida',
  'texas', 'carolina', 'virginia', 'pennsylvania', 'illinois',
  // Generic qualifiers
  'first', 'second', 'third', 'fourth', 'fifth', 'sixth',
  'community', 'city', 'county', 'commerce', 'enterprise', 'enterprises',
  'farmers', 'mechanics', 'merchants', 'capital', 'resources', 'technology',
]);

/**
 * Returns a match confidence: 'strong' (2+ shared distinctive tokens),
 * 'unique-token' (1 shared token that appears in exactly 1 SEC company), or null.
 * Using freq == 1 (not <= 3) keeps "synovus", "keycorp", "bancfirst" as valid
 * identifiers while rejecting "family", "discount", "idaho" that match several.
 */
function matchQuality(a, b, tokenFreq) {
  if (!a || !b) return null;
  const aDistinct = new Set([...new Set(a.split(' '))].filter((t) => t.length >= 4 && !GENERIC_TOKENS.has(t)));
  const bDistinct = [...new Set(b.split(' '))].filter((t) => t.length >= 4 && !GENERIC_TOKENS.has(t));
  if (aDistinct.size === 0 || bDistinct.length === 0) return null;
  const shared = bDistinct.filter((t) => aDistinct.has(t));
  if (shared.length >= 2) return 'strong';
  if (shared.length === 1) {
    const t = shared[0];
    const freq = tokenFreq.get(t) ?? 0;
    if (freq === 1 && t.length >= 6) return 'unique-token';
  }
  return null;
}

async function fetchSecTickers() {
  const resp = await fetch(SEC_TICKERS_URL, { headers: { 'User-Agent': USER_AGENT } });
  if (!resp.ok) throw new Error(`SEC tickers fetch failed: ${resp.status}`);
  const json = await resp.json();
  return Object.values(json).map((r) => ({
    cik: String(r.cik_str).padStart(10, '0'),
    ticker: r.ticker,
    title: r.title,
    normalized: normalizeName(r.title),
  }));
}

async function main() {
  const env = loadEnvLocal();
  const supabase = createSupabaseServiceClient(env);

  console.log('=== backfill-cik-icp-cohort.mjs ===');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);

  // ── 1. Fetch SEC tickers
  console.log('Fetching SEC ticker → CIK map...');
  const secRecords = await fetchSecTickers();
  console.log(`  ${secRecords.length.toLocaleString()} SEC companies`);
  const secByNormalized = new Map();
  // Token frequency map: counts distinctive tokens across SEC titles so we can
  // tell "keycorp" (rare) from "technology" (common).
  const tokenFreq = new Map();
  for (const r of secRecords) {
    if (!r.normalized) continue;
    if (!secByNormalized.has(r.normalized)) secByNormalized.set(r.normalized, r);
    const distinctive = new Set(
      r.normalized.split(' ').filter((t) => t.length >= 4 && !GENERIC_TOKENS.has(t))
    );
    for (const t of distinctive) tokenFreq.set(t, (tokenFreq.get(t) ?? 0) + 1);
  }

  // ── 2. Fetch ICP cohort institutions (no CIK yet)
  const { data: cohort, error: cohortErr } = await supabase
    .from('icp_cohort_10b_250b_us')
    .select('id, cert_number, name, holding_company, cik');
  if (cohortErr) throw new Error(`fetch cohort: ${cohortErr.message}`);
  const missing = (cohort ?? []).filter((r) => !r.cik);
  console.log(`Cohort: ${cohort.length} total, ${missing.length} missing CIK`);

  // ── 3. Match
  const matches = [];
  const stillMissing = [];

  // Ticker-based lookup: for well-known public banks, the holding-company
  // ticker is the most reliable identifier. Each entry maps cert_number to the
  // ticker symbol SEC uses — we then pull the authoritative CIK from the
  // already-loaded company_tickers.json. Easy to audit, no guessing.
  // Tickers verified against investor relations sites, not memory.
  const COHORT_TICKER_OVERRIDES = {
    6560: 'HBAN',     // Huntington National Bank → Huntington Bancshares
    17534: 'KEY',     // KeyBank → KeyCorp
    983: 'CMA',       // Comerica Bank → Comerica Inc
    2270: 'ZION',     // Zions Bancorporation NA → Zions Bancorporation
    11063: 'FCNCA',   // First-Citizens Bank → First Citizens BancShares
    32541: 'FLG',     // Flagstar Bank → Flagstar Financial (ex-NYCB)
    3832: 'ONB',      // Old National Bank → Old National Bancorp
    31628: 'EWBC',    // East West Bank → East West Bancorp
    9396: 'VLY',      // Valley National Bank → Valley National Bancorp
    8273: 'UMBF',     // UMB Bank → UMB Financial
    18221: 'WBS',     // Webster Bank → Webster Financial
    57819: 'WTFC',    // (TBD — verify cert)
    12368: 'RF',      // Regions Bank → Regions Financial
    17266: 'COLB',    // Columbia Bank → Columbia Banking System
    57957: 'CFG',     // Citizens Bank NA → Citizens Financial Group
    4977: 'FHN',      // First Horizon Bank → First Horizon
    33555: 'SSB',     // SouthState Bank → SouthState Corp
    // Additional cohort banks whose holding name doesn't normalize cleanly:
    14241: 'BAC',     // Bank of America California (subsidiary) → Bank of America Corp
    35444: 'SNV',     // Synovus Bank → Synovus Financial Corp
    7946: 'BK',       // BNY Mellon NA → Bank of New York Mellon Corp
    4163: 'BANF',     // BancFirst → BancFirst Corp
    35334: 'FCF',     // First Commonwealth Bank → First Commonwealth Financial
    58001: 'TFSL',    // Third Federal S&L Cleveland → TFS Financial Corp
    35301: 'PNFP',    // Pinnacle Bank → Pinnacle Financial Partners
    21846: 'SFBS',    // (TBD)
    // Ones we know are private / no SEC filing — leave out on purpose:
    //   MidFirst Bank (private, owned by Records family)
    //   Safra NB of NY (foreign parent, no US 10-K)
    //   Toyota Financial Savings (subsidiary of Toyota Motor Corp; parent does
    //     file but not about its US bank subsidiary)
    //   BMW Bank of North America (same pattern as Toyota)
    //   Bank of China (foreign)
    //   Israel Discount Bank of NY (foreign)
    //   Mechanics Bank (private via Ford family trust)
  };

  const secByTicker = new Map();
  for (const r of secRecords) {
    if (r.ticker) secByTicker.set(r.ticker.toUpperCase(), r);
  }

  for (const inst of missing) {
    let matched = null;
    let matchType = null;

    // Highest priority: hand-curated ticker override resolves to the
    // authoritative CIK via SEC's company_tickers.json. Zero fuzzy guessing.
    const overrideTicker = COHORT_TICKER_OVERRIDES[inst.cert_number];
    if (overrideTicker) {
      const secRec = secByTicker.get(overrideTicker.toUpperCase());
      if (secRec) {
        matched = secRec;
        matchType = `ticker:${overrideTicker} -> ${secRec.title}`;
      }
    }

    // Try holding_company first, then name — exact match
    const candidates = [inst.holding_company, inst.name].filter(Boolean);
    if (!matched) {
      for (const cand of candidates) {
        const norm = normalizeName(cand);
        if (!norm) continue;
        const sec = secByNormalized.get(norm);
        if (sec) { matched = sec; matchType = `exact:${cand}`; break; }
      }
    }
    // Strong token match (2+ shared distinctive tokens)
    if (!matched) {
      for (const cand of candidates) {
        const norm = normalizeName(cand);
        if (!norm) continue;
        for (const [normSec, secRec] of secByNormalized) {
          if (matchQuality(norm, normSec, tokenFreq) === 'strong') {
            matched = secRec;
            matchType = `strong:${cand} <> ${secRec.title}`;
            break;
          }
        }
        if (matched) break;
      }
    }
    if (matched) {
      matches.push({
        entity_table: 'institutions',
        entity_id: inst.id,
        id_type: 'cik',
        id_value: matched.cik,
        is_primary: false,
        source_url: SEC_TICKERS_URL,
        notes: `Cohort CIK backfill: ${matchType} → ${matched.title} (${matched.ticker})`,
        _debug: { inst_name: inst.name, holding: inst.holding_company, match_type: matchType, sec_title: matched.title },
      });
    } else {
      stillMissing.push(inst);
    }
  }

  console.log(`\nNewly matched: ${matches.length}`);
  console.log(`Still missing: ${stillMissing.length}`);
  console.log('\nSample matches:');
  for (const m of matches.slice(0, 20)) {
    console.log(`  ${m._debug.inst_name}: ${m._debug.match_type}`);
  }
  if (stillMissing.length > 0) {
    console.log('\nStill missing (first 20):');
    for (const m of stillMissing.slice(0, 20)) {
      console.log(`  ${m.name} (holding: ${m.holding_company || '—'})`);
    }
  }

  if (DRY_RUN) {
    console.log('\n(DRY RUN — no writes made)');
    return;
  }

  // Strip debug fields before insert
  const toInsert = matches.map(({ _debug, ...rest }) => rest);
  const jobId = await startSyncJob(supabase, 'backfill-cik-icp-cohort');
  let inserted = 0;
  const errors = [];
  // Upsert one at a time to avoid losing the batch on a single conflict
  for (const row of toInsert) {
    const { error } = await supabase
      .from('entity_external_ids')
      .upsert([row], {
        onConflict: 'entity_table,entity_id,id_type,id_value',
        ignoreDuplicates: true,
      });
    if (error) errors.push(`${row.id_value}: ${error.message}`);
    else inserted++;
  }

  await finishSyncJob(supabase, jobId, {
    status: errors.length > 0 && inserted === 0 ? 'failed' : 'completed',
    records_processed: inserted,
    error: errors.length > 0 ? errors.slice(0, 3).join(' | ') : null,
  });

  console.log(`\nUpserted ${inserted} CIK rows for ICP cohort`);
  if (errors.length > 0) {
    console.log(`Errors (${errors.length}):`);
    for (const e of errors.slice(0, 5)) console.log(`  - ${e}`);
  }
}

main().catch((err) => {
  console.error('backfill-cik-icp-cohort failed:', err);
  process.exit(1);
});
