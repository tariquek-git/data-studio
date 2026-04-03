import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as XLSX from 'xlsx';
import { apiHandler } from '../../lib/api-handler.js';
import { getSupabase } from '../../lib/supabase.js';

const OCC_INDEX_URL =
  'https://www.occ.treas.gov/topics/charters-and-licensing/financial-institution-lists/index-financial-institution-lists.html';
const OCC_CERT_BASE = 6_000_000;

const SHEET_SPECS = [
  {
    key: 'national_bank',
    url: 'https://www.occ.treas.gov/topics/charters-and-licensing/financial-institution-lists/national-by-name.xlsx',
    sheetName: 'All',
    charterType: 'commercial',
  },
  {
    key: 'trust_bank',
    url: 'https://www.occ.treas.gov/topics/charters-and-licensing/financial-institution-lists/trust-by-name.xlsx',
    sheetName: 'Trust',
    charterType: 'trust',
  },
  {
    key: 'federal_savings_association',
    url: 'https://www.occ.treas.gov/topics/charters-and-licensing/financial-institution-lists/thrifts-by-name.xlsx',
    sheetName: 'All',
    charterType: 'savings_association',
  },
  {
    key: 'federal_branch_agency',
    url: 'https://www.occ.treas.gov/topics/charters-and-licensing/financial-institution-lists/national-by-name.xlsx',
    sheetName: 'Fed Branches',
    charterType: 'federal_branch_agency',
  },
] as const;

type OccInstitutionRow = {
  cert_number: number;
  source: 'occ';
  name: string;
  legal_name: string;
  charter_type: 'commercial' | 'savings_association' | 'trust' | 'federal_branch_agency';
  active: boolean;
  city: string | null;
  state: string | null;
  regulator: string;
  data_as_of: string;
  last_synced_at: string;
  raw_data: {
    occ_charter_number: number;
    fdic_cert: number | null;
    rssd_id: number | null;
    address: string | null;
    list_type: string;
    source_sheet: string;
    source_url: string;
    active_as_of: string;
  };
};

function normalizeText(value: unknown) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function toInteger(value: unknown) {
  if (value == null || value === '') return null;
  const number = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

function toIsoDate(value: string | null) {
  if (!value) return new Date().toISOString().slice(0, 10);
  const match = value.match(/As of\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
  if (!match) return new Date().toISOString().slice(0, 10);
  return `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
}

function findHeaderRow(rows: unknown[][]) {
  return rows.findIndex((row) => String(row?.[0] ?? '').trim().toUpperCase() === 'CHARTER NO');
}

async function loadSheet(spec: (typeof SHEET_SPECS)[number]): Promise<OccInstitutionRow[]> {
  const response = await fetch(spec.url, {
    headers: {
      'User-Agent': 'DataStudio/1.0 (github.com/tariquek-git/data-studio)',
    },
  });

  if (!response.ok) {
    throw new Error(`Unable to fetch OCC workbook ${spec.url}: HTTP ${response.status}`);
  }

  const workbook = XLSX.read(Buffer.from(await response.arrayBuffer()), { type: 'buffer' });
  const sheet = workbook.Sheets[spec.sheetName];
  if (!sheet) {
    throw new Error(`Workbook ${spec.url} is missing sheet ${spec.sheetName}`);
  }

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as unknown[][];
  const headerIndex = findHeaderRow(rows);
  if (headerIndex === -1) {
    throw new Error(`Unable to locate OCC header row in ${spec.sheetName}`);
  }

  const headers = rows[headerIndex].map((header) => String(header ?? '').trim().toUpperCase());
  const activeAsOf = toIsoDate(String(rows[0]?.[0] ?? ''));

  const mapped = rows
    .slice(headerIndex + 1)
    .map<OccInstitutionRow | null>((row) => {
      const record = Object.fromEntries(headers.map((header, index) => [header, row[index] ?? null]));
      const occCharterNumber = toInteger(record['CHARTER NO']);
      const name = normalizeText(record.NAME);

      if (!occCharterNumber || !name) return null;

      const fdicCert = toInteger(record.CERT);
      return {
        cert_number: fdicCert && fdicCert > 0 ? fdicCert : OCC_CERT_BASE + occCharterNumber,
        source: 'occ' as const,
        name,
        legal_name: name,
        charter_type: spec.charterType,
        active: true,
        city: normalizeText(record.CITY),
        state: normalizeText(record.STATE),
        regulator: 'OCC',
        data_as_of: activeAsOf,
        last_synced_at: new Date().toISOString(),
        raw_data: {
          occ_charter_number: occCharterNumber,
          fdic_cert: fdicCert,
          rssd_id: toInteger(record.RSSD),
          address: normalizeText(record['ADDRESS (LOC)']),
          list_type: spec.key,
          source_sheet: spec.sheetName,
          source_url: spec.url,
          active_as_of: activeAsOf,
        },
      };
    });

  return mapped.filter((row): row is OccInstitutionRow => row !== null);
}

export default apiHandler({ methods: ['POST'] }, async (req: VercelRequest, res: VercelResponse) => {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const supabase = getSupabase();
  const dryRun = req.query.dry_run === '1' || req.query.dry_run === 'true';

  const { data: job } = dryRun
    ? { data: null }
    : await supabase
        .from('sync_jobs')
        .insert({ source: 'occ', status: 'running', started_at: new Date().toISOString() })
        .select()
        .single();

  try {
    const allRows = (await Promise.all(SHEET_SPECS.map(loadSheet))).flat();
    const byCert = new Map<number, OccInstitutionRow>();
    for (const row of allRows) {
      byCert.set(row.cert_number, row);
    }
    const institutions = [...byCert.values()];

    if (!dryRun) {
      for (let i = 0; i < institutions.length; i += 250) {
        const batch = institutions.slice(i, i + 250);
        const { error } = await supabase
          .from('institutions')
          .upsert(batch, { onConflict: 'cert_number' });

        if (error) {
          if (error.message?.includes('institutions_source_check')) {
            return res.status(409).json({
              error: 'OCC source is not yet allowed by institutions_source_check',
              next_sql: [
                'ALTER TABLE institutions DROP CONSTRAINT IF EXISTS institutions_source_check;',
                "ALTER TABLE institutions ADD CONSTRAINT institutions_source_check CHECK (source IN ('fdic', 'ncua', 'osfi', 'rpaa', 'ciro', 'fintrac', 'fincen', 'fintech_ca', 'occ'));",
                "NOTIFY pgrst, 'reload schema';",
              ],
            });
          }
          throw new Error(error.message);
        }
      }

      await supabase
        .from('data_sources')
        .update({
          institution_count: institutions.length,
          last_synced_at: new Date().toISOString(),
          data_as_of: institutions[0]?.data_as_of ?? null,
          status: 'active',
          notes: 'OCC public institution list sync is active.',
        })
        .eq('source_key', 'occ');

      if (job?.id) {
        await supabase
          .from('sync_jobs')
          .update({
            status: 'completed',
            records_processed: institutions.length,
            completed_at: new Date().toISOString(),
          })
          .eq('id', job.id);
      }
    }

    return res.json({
      success: true,
      dry_run: dryRun,
      source_url: OCC_INDEX_URL,
      records_processed: institutions.length,
      breakdown: {
        national_bank: allRows.filter((row) => row.raw_data?.list_type === 'national_bank').length,
        trust_bank: allRows.filter((row) => row.raw_data?.list_type === 'trust_bank').length,
        federal_savings_association: allRows.filter((row) => row.raw_data?.list_type === 'federal_savings_association').length,
        federal_branch_agency: allRows.filter((row) => row.raw_data?.list_type === 'federal_branch_agency').length,
      },
    });
  } catch (error: any) {
    if (!dryRun && job?.id) {
      await supabase
        .from('sync_jobs')
        .update({
          status: 'failed',
          error: error.message,
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.id);
    }

    throw error;
  }
});
