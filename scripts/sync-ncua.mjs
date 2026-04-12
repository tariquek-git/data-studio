#!/usr/bin/env node
/**
 * NCUA Data Sync Script
 * Fetches all federally-insured credit unions from NCUA and loads them into Supabase.
 *
 * Data source: NCUA quarterly call report download
 *   https://ncua.gov/files/publications/analysis/federally-insured-credit-union-list-december-2025.zip
 *
 * The XLSX contains ~4,300 active federally-insured credit unions with
 * financials as of Q4 2025.
 *
 * cert_number collision strategy:
 *   NCUA charter numbers overlap with FDIC cert numbers (both can reach ~68k-91k).
 *   We offset NCUA charter numbers by 1,000,000 to ensure no conflicts.
 *   e.g. NCUA charter 68700 → cert_number 1068700
 *
 * Run: node scripts/sync-ncua.mjs
 */

import { loadEnvLocal, createSupabaseServiceClient } from './_sync-utils.mjs';
import { readFileSync, createWriteStream, existsSync, mkdirSync, createReadStream } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createUnzip } from 'zlib';
import { pipeline } from 'stream/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));

const env = loadEnvLocal();
const supabase = createSupabaseServiceClient(env);

// ── Constants ──────────────────────────────────────────────────────────────────
// NCUA charter numbers overlap with FDIC cert numbers — offset by 1M to avoid conflicts
const NCUA_CERT_OFFSET = 1_000_000;

// Primary source: NCUA quarterly federally-insured CU list (December 2025 = Q4 2025)
const NCUA_ZIP_URL = 'https://ncua.gov/files/publications/analysis/federally-insured-credit-union-list-december-2025.zip';

// Fallback: search for the latest available quarter
const NCUA_DATA_PAGE = 'https://ncua.gov/analysis/credit-union-corporate-call-report-data/quarterly-data-summary-reports';

const TMP_DIR = join(__dirname, '..', '.tmp');
const ZIP_PATH = join(TMP_DIR, 'ncua-cu-list.zip');
const XLSX_NAME = 'FederallyInsuredCreditUnions_2025q4.xlsx';
const XLSX_PATH = join(TMP_DIR, XLSX_NAME);

// ── Helpers ───────────────────────────────────────────────────────────────────
function num(v) { return v != null && v !== '' ? Number(v) : null; }

/**
 * Download a URL to a local file path using the native fetch + streams.
 */
async function downloadFile(url, destPath) {
  console.log(`Downloading: ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);

  const writer = createWriteStream(destPath);
  const reader = res.body.getReader();
  let downloaded = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      downloaded += value.length;
      writer.write(value);
    }
  } finally {
    reader.releaseLock();
  }

  await new Promise((resolve, reject) => {
    writer.end();
    writer.on('finish', resolve);
    writer.on('error', reject);
  });

  console.log(`  Downloaded ${(downloaded / 1024).toFixed(0)} KB`);
}

/**
 * Unzip a .zip file that contains a single file, extract it to destPath.
 * Uses the built-in unzip command (available on macOS/Linux).
 */
async function unzipFile(zipPath, destDir) {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);
  await execAsync(`unzip -o "${zipPath}" -d "${destDir}"`);
  console.log(`  Extracted to ${destDir}`);
}

/**
 * Parse the NCUA XLSX file using xlsx (SheetJS) if available,
 * or fall back to a Python-based parser.
 */
async function parseXlsx(xlsxPath) {
  // Try SheetJS (xlsx) if available in node_modules
  let xlsx;
  try {
    const mod = await import('xlsx');
    xlsx = mod.default ?? mod;
    console.log('Parsing XLSX with SheetJS...');

    const workbook = xlsx.readFile(xlsxPath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: null });

    // Row 0 is headers, rows 1+ are data
    const headers = rows[0];
    const data = rows.slice(1).filter(r => r[0] != null);
    console.log(`  Parsed ${data.length} rows, ${headers.length} columns`);
    return { headers, data };
  } catch (e) {
    if (e.code !== 'ERR_MODULE_NOT_FOUND' && !e.message?.includes('Cannot find')) {
      throw e;
    }
    console.log('SheetJS not available, using Python fallback...');
    return parseXlsxWithPython(xlsxPath);
  }
}

/**
 * Python fallback: parse XLSX and emit JSON to stdout.
 */
async function parseXlsxWithPython(xlsxPath) {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);

  const pythonScript = `
import json, openpyxl, sys
wb = openpyxl.load_workbook('${xlsxPath}', read_only=True, data_only=True)
ws = wb.active
rows = []
for row in ws.iter_rows(values_only=True):
    rows.append(list(row))
wb.close()
json.dump(rows, sys.stdout)
`;

  const tmpScript = join(TMP_DIR, 'parse_xlsx.py');
  const { writeFileSync } = await import('fs');
  writeFileSync(tmpScript, pythonScript);

  const { stdout } = await execAsync(`python3 "${tmpScript}"`, { maxBuffer: 50 * 1024 * 1024 });
  const rows = JSON.parse(stdout);

  const headers = rows[0];
  const data = rows.slice(1).filter(r => r[0] != null);
  console.log(`  Parsed ${data.length} rows (Python), ${headers.length} columns`);
  return { headers, data };
}

/**
 * Map a raw NCUA XLSX row to the institutions table schema.
 *
 * Column indices (from Q4 2025 file):
 *   0  Charter number
 *   1  Year and quarter
 *   2  Credit Union name
 *   3  Street (Mailing address)
 *   4  City (Mailing address)
 *   5  State (Mailing address)
 *   6  Zip code (Mailing address)
 *   7  Credit Union type  (FCU = Federal CU, SCU = State CU, etc.)
 *   8  NCUA region
 *   9  Low-income designation
 *  10  Members
 *  11  Total assets          (in dollars)
 *  12  Total loans           (in dollars)
 *  13  Total deposits/shares (in dollars)
 *  14  Return on average assets (decimal, e.g. 0.00704)
 *  15  Net worth ratio
 *  16  Loan-to-share ratio
 *  17-21 Growth metrics
 *  22  NCUA internal ID (join_number)
 */
function mapRow(row, dataAsOf) {
  const charterNumber = row[0] != null ? Math.round(Number(row[0])) : null;
  if (!charterNumber) return null;

  const certNumber = charterNumber + NCUA_CERT_OFFSET;

  // ROA is already expressed as a percentage (e.g. 0.704 = 0.704%)
  // Net worth ratio is also already a percentage (e.g. 11.007 = 11.007%)
  const roa = num(row[14]);
  const netWorthRatio = num(row[15]);
  // We store net worth ratio in the roi field (closest equivalent for credit unions)
  const roi = netWorthRatio;

  // Charter type
  const cuType = (row[7] || '').toString().trim().toUpperCase();
  // FCU = Federal Credit Union, SCU = State-chartered CU
  // Both are credit unions
  const regulator = cuType.startsWith('F') ? 'NCUA' : 'State/NCUA';

  // Period: year-quarter encoded as e.g. 2025.4 → "2025-12-31" (Q4 = Dec)
  const quarterMap = { '1': '03-31', '2': '06-30', '3': '09-30', '4': '12-31' };
  let period = dataAsOf;
  if (row[1]) {
    const yq = row[1].toString();
    const [year, qFrac] = yq.split('.');
    const q = qFrac ? Math.round(Number('0.' + qFrac) * 10).toString() : '4';
    period = `${year}-${quarterMap[q] || '12-31'}`;
  }

  // Zip — coerce to string, pad if needed
  let zip = row[6] != null ? row[6].toString().trim() : null;
  if (zip && zip.length < 5 && /^\d+$/.test(zip)) {
    zip = zip.padStart(5, '0');
  }

  return {
    cert_number: certNumber,
    source: 'ncua',
    name: (row[2] || '').toString().trim(),
    city: row[4] ? row[4].toString().trim() : null,
    state: row[5] ? row[5].toString().trim().toUpperCase().substring(0, 2) : null,
    zip,
    county: null,
    latitude: null,
    longitude: null,
    website: null,
    established_date: null,
    regulator,
    holding_company: null,
    holding_company_id: null,
    charter_type: 'credit_union',
    active: true,
    total_assets: num(row[11]),
    total_deposits: num(row[13]),
    total_loans: num(row[12]),
    num_branches: null,
    num_employees: null,
    roa,
    roi,
    equity_capital: null,
    net_income: null,
    credit_card_loans: null,
    credit_card_charge_offs: null,
    data_as_of: period,
    last_synced_at: new Date().toISOString(),
    raw_data: {
      charter_number: charterNumber,
      cu_type: cuType,
      ncua_region: num(row[8]),
      low_income_designation: row[9] === 'Yes',
      members: num(row[10]),
      net_worth_ratio_pct: netWorthRatio,
      loan_to_share_ratio: num(row[16]),
      total_deposits_growth_4q: num(row[17]),
      total_loans_growth_4q: num(row[18]),
      total_assets_growth_4q: num(row[19]),
      members_growth_4q: num(row[20]),
      net_worth_growth_4q: num(row[21]),
      ncua_join_number: num(row[22]),
      year_quarter: row[1],
    },
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Starting NCUA credit union sync...');
  console.log(`cert_number = charter_number + ${NCUA_CERT_OFFSET} (to avoid FDIC conflicts)`);

  // Create sync job
  const { data: job, error: jobErr } = await supabase
    .from('sync_jobs')
    .insert({ source: 'ncua', status: 'running', started_at: new Date().toISOString() })
    .select()
    .single();

  if (jobErr) {
    console.warn('Could not create sync job record:', jobErr.message);
  }
  console.log('Sync job created:', job?.id);

  try {
    // ── Step 1: Ensure tmp dir exists ────────────────────────────────────────
    if (!existsSync(TMP_DIR)) {
      mkdirSync(TMP_DIR, { recursive: true });
    }

    // ── Step 2: Download ZIP ──────────────────────────────────────────────────
    if (existsSync(XLSX_PATH)) {
      console.log(`XLSX already exists at ${XLSX_PATH}, skipping download.`);
      console.log('  (Delete the file to force re-download)');
    } else {
      await downloadFile(NCUA_ZIP_URL, ZIP_PATH);
      await unzipFile(ZIP_PATH, TMP_DIR);

      // Verify XLSX was extracted
      if (!existsSync(XLSX_PATH)) {
        // List what was extracted
        const { readdirSync } = await import('fs');
        const files = readdirSync(TMP_DIR);
        console.log('Files in tmp dir:', files);
        throw new Error(`Expected ${XLSX_NAME} not found after extraction. Files: ${files.join(', ')}`);
      }
    }

    // ── Step 3: Parse XLSX ────────────────────────────────────────────────────
    console.log('Parsing XLSX...');
    const { headers, data } = await parseXlsx(XLSX_PATH);
    console.log(`Columns: ${headers.map((h, i) => `[${i}] ${String(h).replace(/\n/g, ' ')}`).join(', ')}`);

    // Determine the reporting period from the first data row
    const samplePeriod = data[0]?.[1];
    let dataAsOf = '2025-12-31';
    if (samplePeriod) {
      const yq = samplePeriod.toString();
      const [year, qFrac] = yq.split('.');
      const q = qFrac ? Math.round(Number('0.' + qFrac) * 10).toString() : '4';
      const quarterMap = { '1': '03-31', '2': '06-30', '3': '09-30', '4': '12-31' };
      dataAsOf = `${year}-${quarterMap[q] || '12-31'}`;
    }
    console.log(`Data period: ${dataAsOf} (raw: ${samplePeriod})`);

    // ── Step 4: Map rows ──────────────────────────────────────────────────────
    console.log('Mapping rows to institutions schema...');
    const institutions = [];
    let skipped = 0;

    for (const row of data) {
      const record = mapRow(row, dataAsOf);
      if (record) {
        institutions.push(record);
      } else {
        skipped++;
      }
    }

    console.log(`Mapped: ${institutions.length} records, skipped: ${skipped}`);

    if (institutions.length === 0) {
      throw new Error('No institutions mapped — check XLSX column format');
    }

    // Log a sample
    const sample = institutions[0];
    console.log('\nSample record:');
    console.log(`  cert_number: ${sample.cert_number} (charter: ${sample.cert_number - NCUA_CERT_OFFSET})`);
    console.log(`  name: ${sample.name}`);
    console.log(`  city: ${sample.city}, ${sample.state} ${sample.zip}`);
    console.log(`  total_assets: $${(sample.total_assets / 1e6).toFixed(1)}M`);
    console.log(`  total_deposits: $${(sample.total_deposits / 1e6).toFixed(1)}M`);
    console.log(`  roa: ${sample.roa?.toFixed(3)}%`);
    console.log('');

    // ── Step 5: Upsert in batches ─────────────────────────────────────────────
    let processed = 0;
    const batchSize = 500;

    for (let i = 0; i < institutions.length; i += batchSize) {
      const batch = institutions.slice(i, i + batchSize);
      const { error } = await supabase
        .from('institutions')
        .upsert(batch, { onConflict: 'cert_number' });

      if (error) {
        console.error(`Batch ${i}–${i + batchSize} error:`, error.message);
        throw error;
      }
      processed += batch.length;
      console.log(`  Upserted ${processed}/${institutions.length}`);
    }

    // ── Step 6: Complete sync job ─────────────────────────────────────────────
    await supabase
      .from('sync_jobs')
      .update({
        status: 'completed',
        records_processed: processed,
        completed_at: new Date().toISOString(),
      })
      .eq('id', job?.id);

    console.log(`\nSync complete! ${processed} credit unions loaded.`);
    console.log(`Data as of: ${dataAsOf}`);
    console.log(`cert_number range: ${NCUA_CERT_OFFSET + 1} – ${NCUA_CERT_OFFSET + 100000}`);

  } catch (error) {
    console.error('\nSync failed:', error.message);
    if (job?.id) {
      await supabase
        .from('sync_jobs')
        .update({
          status: 'failed',
          error: error.message,
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.id);
    }
    process.exit(1);
  }
}

main();
