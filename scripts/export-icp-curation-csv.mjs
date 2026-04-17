#!/usr/bin/env node
/**
 * export-icp-curation-csv.mjs
 *
 * Export the $10B-$250B US ICP cohort as a CSV with the fields Tarique needs
 * to fill manually. Pre-populated where we have data; empty where we don't.
 *
 * Why this exists: 10-K scraping doesn't reliably extract vendor-level card
 * program data (core processor, agent bank relationship, card network
 * principal status). Those live in IR pages, press releases, paid data
 * (Nilson Report, Callahan), or tribal knowledge. For a 164-institution
 * cohort it's faster to curate manually than to build fragile scrapers.
 *
 * Fields in the CSV:
 *   cert_number          — key for re-import (don't edit)
 *   name, city, state    — identity (don't edit)
 *   source               — fdic or ncua (don't edit)
 *   total_assets_b       — $B, rounded (read-only reference)
 *   cc_loans_m           — credit card loans $M from FDIC (read-only reference)
 *   current_brim_score   — current Brim score (read-only reference)
 *   bd_exclusion_reason  — if non-empty, we don't prospect this institution
 *   ─── fill-me columns ──────────────────────────────────────────────────
 *   core_processor       — Jack Henry / Fiserv / FIS / Symitar / COCC / etc.
 *   agent_bank_program   — in_house / elan / tcm_bank / fnbo / synovus / pscu / co_op / other
 *   visa_principal       — y/n
 *   mastercard_principal — y/n
 *   card_program_manager — for CUs: PSCU / Co-Op / TMG / None / etc.
 *   notes                — anything else relevant, free text
 *
 * Run:
 *   node scripts/export-icp-curation-csv.mjs > icp-curation-2026-04-17.csv
 *
 * Then fill in Google Sheets / Excel / a text editor. Re-import via:
 *   node scripts/import-icp-curation-csv.mjs < icp-curation-2026-04-17.csv
 */

import { createSupabaseServiceClient, loadEnvLocal } from './_sync-utils.mjs';

const env = loadEnvLocal();
const supabase = createSupabaseServiceClient(env);

function csvCell(v) {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function main() {
  // Pull the full cohort + their existing bank_capabilities rows (so we pre-fill
  // anything we already know from prior runs — preserves manual curation
  // done in previous sessions if the user re-exports).
  const { data: cohort, error } = await supabase
    .from('icp_cohort_10b_250b_us')
    .select('id, cert_number, name, city, state, source, total_assets, credit_card_loans, brim_score, brim_tier, bd_exclusion_reason')
    .order('total_assets', { ascending: false });
  if (error) throw new Error(`fetch cohort: ${error.message}`);

  const certs = cohort.map((r) => r.cert_number);
  const { data: caps } = await supabase
    .from('bank_capabilities')
    .select('cert_number, core_processor, agent_bank_program, visa_principal, mastercard_principal, card_program_manager, notes')
    .in('cert_number', certs);
  const capByCert = new Map((caps ?? []).map((c) => [c.cert_number, c]));

  // Emit CSV header
  const header = [
    'cert_number', 'name', 'city', 'state', 'source',
    'total_assets_b', 'cc_loans_m', 'current_brim_score', 'bd_exclusion_reason',
    'core_processor', 'agent_bank_program',
    'visa_principal', 'mastercard_principal',
    'card_program_manager', 'notes',
  ];
  console.log(header.map(csvCell).join(','));

  for (const r of cohort) {
    const cap = capByCert.get(r.cert_number) ?? {};
    const row = [
      r.cert_number,
      r.name,
      r.city ?? '',
      r.state ?? '',
      r.source,
      r.total_assets ? (r.total_assets / 1e9).toFixed(1) : '',
      r.credit_card_loans ? (r.credit_card_loans / 1e6).toFixed(0) : '',
      r.brim_score ?? '',
      r.bd_exclusion_reason ?? '',
      cap.core_processor ?? '',
      cap.agent_bank_program ?? '',
      cap.visa_principal == null ? '' : (cap.visa_principal ? 'y' : 'n'),
      cap.mastercard_principal == null ? '' : (cap.mastercard_principal ? 'y' : 'n'),
      cap.card_program_manager ?? '',
      cap.notes ?? '',
    ];
    console.log(row.map(csvCell).join(','));
  }
  process.stderr.write(`Exported ${cohort.length} cohort institutions.\n`);
}

main().catch((e) => {
  console.error('export-icp-curation-csv failed:', e);
  process.exit(1);
});
