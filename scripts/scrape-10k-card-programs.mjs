#!/usr/bin/env node
/**
 * scrape-10k-card-programs.mjs
 *
 * For each ICP cohort bank with a mapped SEC CIK, fetch the most recent 10-K
 * and extract card-program disclosures:
 *   - core_processor (Jack Henry, FIS, Fiserv, Symitar, COCC, Finxact, Corelation)
 *   - agent_bank_program (Elan, TCM Bank, FNBO, Synovus, Cardworks, etc.)
 *   - card_issuer_of_record ("issued by X")
 *   - card_network_principal (Visa/Mastercard principal member status)
 *   - contract_expiration_hint (any disclosed term / renewal window)
 *
 * Writes two parallel outputs for every detected hit:
 *   1. Updates `bank_capabilities` columns (core_processor, agent_bank_program,
 *      visa_principal, mastercard_principal) so the signal-backfill scripts
 *      and the UI both see it.
 *   2. Writes signal.* facts into entity_facts so the Brim score picks it up
 *      with full freshness + confidence tracking + provenance.
 *
 * SEC EDGAR rate limit: 10 req/sec. We go ~5/sec (200ms sleep) to stay well under.
 * Most 10-Ks are 500KB-5MB. We only read the first 400KB (Item 1 Business is
 * always near the front) to keep runtime + memory sane.
 *
 * Idempotent: re-running re-writes facts with the same fact_key, so we always
 * reflect the most recent 10-K. New filings overwrite prior extractions.
 *
 * Run: node scripts/scrape-10k-card-programs.mjs [--dry-run] [--limit N] [--cert-only N]
 */

import {
  createSupabaseServiceClient,
  loadEnvLocal,
  startSyncJob,
  finishSyncJob,
  chunkArray,
} from './_sync-utils.mjs';

const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT_IDX = process.argv.indexOf('--limit');
const LIMIT = LIMIT_IDX >= 0 ? parseInt(process.argv[LIMIT_IDX + 1], 10) : null;
const CERT_IDX = process.argv.indexOf('--cert-only');
const CERT_ONLY = CERT_IDX >= 0 ? parseInt(process.argv[CERT_IDX + 1], 10) : null;

const USER_AGENT = 'data-studio brim-bd-intelligence (tarique@brimfinancial.com)';
const REQ_DELAY_MS = 200; // 5 req/sec, well under SEC's 10/sec limit
// Modern 10-Ks are iXBRL documents: the first ~400KB is taxonomy metadata
// and schema URIs. "Item 1. Business" typically starts 18%+ into the stripped
// text (~150KB of stripped content, which is ~1MB of raw). To capture through
// the MD&A and risk factors, we need to read generously. Budget ~5MB raw per
// doc = ~700KB stripped, which covers Business + Risk + MD&A for most filers.
const MAX_READ_BYTES = 5_000_000;
// After stripping, we skip content before "Item 1" to bypass the XBRL preamble.
const ITEM_1_MARKER = /\bItem\s+1\.?\s+Business\b/i;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ── Extraction patterns ──────────────────────────────────────────────────
// Tuned to minimize false positives. Each vendor group has a canonical
// normalized form so that different spellings/cases still write one fact.

const CORE_PROCESSORS = [
  { canonical: 'fiserv',       pattern: /\bfiserv\b/i },
  { canonical: 'fis',          pattern: /\b(fis|fidelity national information services)\b/i },
  { canonical: 'jack_henry',   pattern: /\bjack\s+henry\b/i },
  { canonical: 'symitar',      pattern: /\bsymitar\b/i },
  { canonical: 'cocc',         pattern: /\bCOCC\b/ },  // case-sensitive — "cocc" common in other contexts
  { canonical: 'finxact',      pattern: /\bfinxact\b/i },
  { canonical: 'temenos',      pattern: /\btemenos\b/i },
  { canonical: 'corelation',   pattern: /\bcorelation\s+keystone\b/i },
  { canonical: 'computer_services_inc', pattern: /\bcomputer\s+services,?\s+inc\b/i },
  { canonical: 'dci',          pattern: /\bdata\s+center\s+inc\b/i },
];

// Agent-bank / card-issuer-of-record vendors — when a bank says "our credit
// card program is issued through X", that's the signal. We look for the
// vendor name in close proximity to card-program language.
const AGENT_BANK_VENDORS = [
  { canonical: 'elan_financial',   pattern: /\belan\s+financial\b/i },
  { canonical: 'tcm_bank',         pattern: /\bTCM\s+Bank\b/ },
  { canonical: 'fnbo',             pattern: /\b(first\s+bankcard|FNBO|first\s+national\s+bank\s+of\s+omaha)\b/i },
  { canonical: 'synovus_cards',    pattern: /\bsynovus\s+(card|trust)\b/i },
  { canonical: 'cardworks',        pattern: /\bcardworks\b/i },
  { canonical: 'pscu',             pattern: /\bPSCU\b/ },
  { canonical: 'co_op_financial',  pattern: /\bco-?op\s+(financial|solutions)\b/i },
  { canonical: 'visa_dps',         pattern: /\bvisa\s+(dps|debit\s+processing)\b/i },
  { canonical: 'marqeta',          pattern: /\bmarqeta\b/i },
  { canonical: 'galileo',          pattern: /\bgalileo\s+(financial|processing)\b/i },
];

// Card-program language that should appear near the agent-bank vendor name
// to qualify. Without this, a random mention of "PSCU" in a footnote doesn't
// mean anything. We require the vendor to be within PROXIMITY_CHARS of one
// of these phrases.
const CARD_PROGRAM_HINTS = [
  /\bcredit\s+card\s+(program|portfolio|issuing|services|products|loans|receivables)/i,
  /\bcard\s+(program|portfolio|issuing|issuance|services|partner|partnership|processing)/i,
  /\bco-?brand(ed)?\s+card/i,
  /\bissuer\s+(of|bank)/i,
  /\bagent\s+(bank|relationship|issuer)/i,
  /\bthird-?party\s+(issuer|card|program|vendor)/i,
];
const PROXIMITY_CHARS = 800;

// Principal membership (Visa or Mastercard)
const VISA_PRINCIPAL = /\bvisa\s+(principal\s+member|member\s+bank|principal\s+issuer|principal)\b/i;
const MC_PRINCIPAL = /\bmastercard\s+(principal\s+member|member\s+bank|principal\s+issuer|principal)\b/i;

// ── SEC EDGAR helpers ────────────────────────────────────────────────────
function secSubmissionsUrl(cik) {
  return `https://data.sec.gov/submissions/CIK${cik.padStart(10, '0')}.json`;
}
function secFilingDocUrl(cik, accession, primaryDoc) {
  const accClean = accession.replace(/-/g, '');
  return `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accClean}/${primaryDoc}`;
}

async function fetchJson(url) {
  const resp = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!resp.ok) throw new Error(`${url} → HTTP ${resp.status}`);
  return resp.json();
}

async function fetchTextFirstNBytes(url, maxBytes = MAX_READ_BYTES) {
  const resp = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,text/plain' },
  });
  if (!resp.ok) throw new Error(`${url} → HTTP ${resp.status}`);
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let read = 0;
  while (read < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    read += value.byteLength;
  }
  try { reader.cancel(); } catch {}
  // Strip HTML, decode common entities, and collapse whitespace.
  const stripped = text
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(nbsp|amp|lt|gt|quot|apos);/gi, ' ')
    .replace(/&#\d+;/g, ' ')  // numeric char refs ("&#160;" is non-breaking space)
    .replace(/\s+/g, ' ');
  // Skip everything before the "Item 1. Business" marker to bypass XBRL
  // taxonomy noise. If the marker isn't found (unusual format), return the
  // whole stripped text so the extraction still runs.
  const m = stripped.match(ITEM_1_MARKER);
  return m && m.index ? stripped.substring(m.index) : stripped;
}

/**
 * Locate the most recent 10-K (not 10-K/A amendment) for a given CIK.
 * Returns { accession, filedAt, primaryDoc } or null.
 */
async function findLatest10K(cik) {
  const data = await fetchJson(secSubmissionsUrl(cik));
  const recent = data?.filings?.recent;
  if (!recent) return null;
  const { accessionNumber = [], form = [], filingDate = [], primaryDocument = [] } = recent;
  for (let i = 0; i < form.length; i++) {
    if (form[i] !== '10-K') continue;
    return {
      accession: accessionNumber[i],
      filedAt: filingDate[i],
      primaryDoc: primaryDocument[i],
    };
  }
  return null;
}

/**
 * Scan the fetched 10-K text for known vendor mentions. Returns structured
 * detection results: {core_processors[], agent_banks[], visa_principal, mc_principal}.
 */
function extractCardProgramSignals(text) {
  const result = {
    core_processors: [],
    agent_banks: [],
    visa_principal: false,
    mc_principal: false,
  };

  // Core processors: any mention in the doc is a hit (these are foundational
  // tech, typically named in the Business section).
  for (const { canonical, pattern } of CORE_PROCESSORS) {
    const m = text.match(pattern);
    if (m) {
      result.core_processors.push({
        canonical,
        match: m[0],
        index: m.index ?? 0,
      });
    }
  }

  // Agent banks: require proximity to card-program language to qualify.
  // Avoids false positives like "We banked our payroll with Elan Financial"
  // (hypothetical) being miscategorized as a card program.
  const hintMatches = [];
  for (const hint of CARD_PROGRAM_HINTS) {
    const m = text.match(hint);
    if (m) hintMatches.push({ index: m.index ?? 0, hint: m[0] });
  }

  for (const { canonical, pattern } of AGENT_BANK_VENDORS) {
    const m = text.match(pattern);
    if (!m) continue;
    const vendorIdx = m.index ?? 0;
    // Require a card-program hint within PROXIMITY_CHARS of the vendor mention
    const near = hintMatches.find((h) => Math.abs(h.index - vendorIdx) <= PROXIMITY_CHARS);
    if (near) {
      result.agent_banks.push({
        canonical,
        match: m[0],
        index: vendorIdx,
        hint: near.hint,
        distance: Math.abs(near.index - vendorIdx),
      });
    }
  }

  // Principal membership: direct pattern match, no proximity needed
  if (VISA_PRINCIPAL.test(text)) result.visa_principal = true;
  if (MC_PRINCIPAL.test(text)) result.mc_principal = true;

  return result;
}

async function main() {
  const env = loadEnvLocal();
  const supabase = createSupabaseServiceClient(env);

  console.log('=== scrape-10k-card-programs.mjs ===');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);

  // Fetch cohort banks with CIK
  const { data: rows, error } = await supabase
    .from('icp_cohort_10b_250b_us')
    .select('id, cert_number, name, cik, bd_exclusion_reason')
    .not('cik', 'is', null)
    .order('total_assets', { ascending: false });
  if (error) throw new Error(`fetch cohort: ${error.message}`);
  let cohort = rows ?? [];
  if (CERT_ONLY) cohort = cohort.filter((r) => r.cert_number === CERT_ONLY);
  if (LIMIT) cohort = cohort.slice(0, LIMIT);
  console.log(`Cohort to scan: ${cohort.length} banks`);
  console.log();

  const jobId = DRY_RUN ? null : await startSyncJob(supabase, 'scrape-10k-card-programs');

  const allFacts = [];
  const capabilityUpdates = [];
  let scanned = 0;
  let with10K = 0;
  let withAnyHit = 0;
  const errors = [];

  for (const inst of cohort) {
    scanned++;
    try {
      const filing = await findLatest10K(inst.cik);
      if (!filing) {
        console.log(`  [${scanned}/${cohort.length}] ${inst.name} (CIK ${inst.cik}): no 10-K found`);
        await sleep(REQ_DELAY_MS);
        continue;
      }
      with10K++;
      const docUrl = secFilingDocUrl(inst.cik, filing.accession, filing.primaryDoc);
      const text = await fetchTextFirstNBytes(docUrl);
      const signals = extractCardProgramSignals(text);

      const hasAny =
        signals.core_processors.length > 0 ||
        signals.agent_banks.length > 0 ||
        signals.visa_principal || signals.mc_principal;
      if (hasAny) withAnyHit++;

      const cores = signals.core_processors.map((x) => x.canonical).join(',') || '—';
      const agents = signals.agent_banks.map((x) => x.canonical).join(',') || '—';
      const networks = [
        signals.visa_principal ? 'Visa' : null,
        signals.mc_principal ? 'MC' : null,
      ].filter(Boolean).join('+') || '—';
      console.log(
        `  [${scanned}/${cohort.length}] ${inst.name}: core=[${cores}] agents=[${agents}] networks=[${networks}]`,
      );

      // Build facts
      const observedAt = filing.filedAt + 'T00:00:00Z';
      for (const cp of signals.core_processors) {
        allFacts.push({
          entity_table: 'institutions',
          entity_id: inst.id,
          fact_type: 'signal.core_processor_fit',
          fact_key: `10k_${cp.canonical}`,
          fact_value_text: cp.canonical,
          fact_value_json: { match: cp.match, accession: filing.accession },
          source_kind: 'official',
          source_url: docUrl,
          observed_at: observedAt,
          confidence_score: 80,
          notes: `10-K ${filing.filedAt}: core processor match "${cp.match}"`,
          sync_job_id: jobId,
        });
      }
      for (const ab of signals.agent_banks) {
        allFacts.push({
          entity_table: 'institutions',
          entity_id: inst.id,
          fact_type: 'signal.agent_bank_dependency',
          fact_key: `10k_${ab.canonical}`,
          fact_value_text: ab.canonical,
          fact_value_json: {
            match: ab.match,
            hint: ab.hint,
            distance: ab.distance,
            accession: filing.accession,
          },
          source_kind: 'official',
          source_url: docUrl,
          observed_at: observedAt,
          confidence_score: 80,
          notes: `10-K ${filing.filedAt}: agent-bank match "${ab.match}" (hint: "${ab.hint}", dist ${ab.distance})`,
          sync_job_id: jobId,
        });
      }
      if (signals.visa_principal || signals.mc_principal) {
        const networksList = [];
        if (signals.visa_principal) networksList.push('visa');
        if (signals.mc_principal) networksList.push('mastercard');
        allFacts.push({
          entity_table: 'institutions',
          entity_id: inst.id,
          fact_type: 'signal.card_network_membership',
          fact_key: `10k_principal_membership`,
          fact_value_text: networksList.join('+'),
          fact_value_json: { networks: networksList, accession: filing.accession },
          source_kind: 'official',
          source_url: docUrl,
          observed_at: observedAt,
          confidence_score: 75,
          notes: `10-K ${filing.filedAt}: ${networksList.join(' + ')} principal membership disclosed`,
          sync_job_id: jobId,
        });
      }

      // Build bank_capabilities update (only fields we have a definite signal for)
      const capUpdate = { cert_number: inst.cert_number };
      if (signals.core_processors.length > 0) {
        capUpdate.core_processor = signals.core_processors[0].canonical;
        capUpdate.core_processor_confidence = 'medium-10k';
      }
      if (signals.agent_banks.length > 0) {
        capUpdate.agent_bank_program = signals.agent_banks[0].canonical;
        capUpdate.agent_bank_program_source = `10-K ${filing.filedAt}`;
      }
      if (signals.visa_principal) capUpdate.visa_principal = true;
      if (signals.mc_principal) capUpdate.mastercard_principal = true;
      if (Object.keys(capUpdate).length > 1) {
        capUpdate.data_source = '10k_scrape';
        capUpdate.verified_at = new Date().toISOString();
        capUpdate.source_urls = [docUrl];
        capabilityUpdates.push(capUpdate);
      }
    } catch (e) {
      errors.push(`${inst.name} (CIK ${inst.cik}): ${e.message}`);
    }
    await sleep(REQ_DELAY_MS);
  }

  console.log();
  console.log(`Scanned: ${scanned} / 10-K found: ${with10K} / with any extracted signal: ${withAnyHit}`);
  console.log(`Facts to write: ${allFacts.length}`);
  console.log(`bank_capabilities updates: ${capabilityUpdates.length}`);
  if (errors.length > 0) {
    console.log(`Errors (${errors.length}) — first 5:`);
    for (const e of errors.slice(0, 5)) console.log(`  - ${e}`);
  }

  if (DRY_RUN) {
    console.log('\n(DRY RUN — no writes)');
    return;
  }

  // Delete prior 10-K-sourced facts (idempotent replace) and re-insert
  if (allFacts.length > 0) {
    const { error: delErr } = await supabase
      .from('entity_facts')
      .delete()
      .in('fact_type', ['signal.core_processor_fit', 'signal.agent_bank_dependency', 'signal.card_network_membership'])
      .like('fact_key', '10k_%')
      .eq('source_kind', 'official');
    if (delErr) console.warn(`delete prior 10-K facts: ${delErr.message}`);

    let factsInserted = 0;
    for (const batch of chunkArray(allFacts, 500)) {
      const { error: insErr } = await supabase.from('entity_facts').insert(batch);
      if (insErr) errors.push(`insert facts: ${insErr.message}`);
      else factsInserted += batch.length;
    }
    console.log(`Inserted ${factsInserted} signal facts`);
  }

  // Upsert bank_capabilities on cert_number
  if (capabilityUpdates.length > 0) {
    let capsUpdated = 0;
    for (const batch of chunkArray(capabilityUpdates, 100)) {
      const { error: capErr } = await supabase
        .from('bank_capabilities')
        .upsert(batch, { onConflict: 'cert_number' });
      if (capErr) errors.push(`upsert bank_capabilities: ${capErr.message}`);
      else capsUpdated += batch.length;
    }
    console.log(`Updated ${capsUpdated} bank_capabilities rows`);
  }

  await finishSyncJob(supabase, jobId, {
    status: errors.length > 0 && allFacts.length === 0 ? 'failed' : 'completed',
    records_processed: allFacts.length,
    error: errors.length > 0 ? errors.slice(0, 3).join(' | ') : null,
  });
}

main().catch((e) => {
  console.error('scrape-10k-card-programs failed:', e);
  process.exit(1);
});
