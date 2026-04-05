import type { VercelRequest, VercelResponse } from '@vercel/node';
import { apiHandler } from '../../lib/api-handler.js';
import { getSupabase } from '../../lib/supabase.js';

const FDIC_FAILURES_BASE = 'https://banks.data.fdic.gov/api/failures';

interface FdicFailureRaw {
  CERT: number;
  INSTNAME: string;
  FAILDATE: string;
  RESTYPE: string;
  SAVR: string | null;
  COST: number | null;
  CHCLASS: string | null;
}

interface FdicApiResponse {
  data: Array<{ data: FdicFailureRaw }>;
  meta: { total: number };
}

interface FailureEventRow {
  cert_number: number;
  institution_name: string;
  fail_date: string;
  resolution_type: string | null;
  estimated_loss: number | null;
  charter_class: string | null;
}

export interface BankFailure {
  cert_number: number;
  name: string;
  fail_date: string;
  resolution_type: string;
  estimated_loss: number | null;
  charter_class: string | null;
}

function isMissingTableError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const maybe = error as { code?: string; message?: string };
  return (
    maybe.code === '42P01' ||
    maybe.code === 'PGRST205' ||
    /relation .* does not exist/i.test(maybe.message ?? '') ||
    /schema cache/i.test(maybe.message ?? '')
  );
}

function normalizeWarehouseFailure(row: FailureEventRow): BankFailure {
  return {
    cert_number: Number(row.cert_number),
    name: row.institution_name ?? '',
    fail_date: row.fail_date ?? '',
    resolution_type: row.resolution_type ?? '',
    estimated_loss: row.estimated_loss != null ? Number(row.estimated_loss) : null,
    charter_class: row.charter_class ?? null,
  };
}

export default apiHandler({ methods: ['GET'] }, async (req: VercelRequest, res: VercelResponse) => {
  const yearMin = Number(req.query.year_min ?? 2000);
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const limit = Math.min(Number(req.query.limit ?? 50), 500);
  const supabase = getSupabase();

  const { data: warehouseRows, error: warehouseError } = await supabase
    .from('failure_events')
    .select('cert_number, institution_name, fail_date, resolution_type, estimated_loss, charter_class')
    .order('fail_date', { ascending: false });

  if (!warehouseError && (warehouseRows?.length ?? 0) > 0) {
    const filtered = (warehouseRows ?? [])
      .map((row) => normalizeWarehouseFailure(row as FailureEventRow))
      .filter((failure) => {
        const year = Number(String(failure.fail_date).slice(0, 4));
        if (Number.isFinite(year) && year < yearMin) return false;
        if (search && !failure.name.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      });

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
    return res.json({ failures: filtered.slice(0, limit), total: filtered.length, source: 'warehouse' });
  }

  if (warehouseError && !isMissingTableError(warehouseError)) {
    return res.status(500).json({ error: warehouseError.message ?? 'Unable to read warehouse failures' });
  }

  const fields = 'CERT,INSTNAME,FAILDATE,RESTYPE,SAVR,COST,CHCLASS';
  const filterParts: string[] = [`FAILDATE:[${yearMin}0101 TO 99991231]`];
  if (search) {
    // FDIC API supports wildcard — wrap in quotes for phrase or append *
    filterParts.push(`INSTNAME:"${search.replace(/"/g, '')}"`);
  }
  const filters = filterParts.join(' AND ');

  const url = new URL(FDIC_FAILURES_BASE);
  url.searchParams.set('fields', fields);
  url.searchParams.set('filters', filters);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('sort_by', 'FAILDATE');
  url.searchParams.set('sort_order', 'DESC');

  const apiRes = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!apiRes.ok) {
    return res.status(502).json({ error: 'FDIC Failures API unavailable', status: apiRes.status });
  }

  const raw: FdicApiResponse = await apiRes.json();

  const failures: BankFailure[] = (raw.data ?? []).map((item) => {
    const d = item.data;
    return {
      cert_number: Number(d.CERT),
      name: d.INSTNAME ?? '',
      fail_date: d.FAILDATE ?? '',
      resolution_type: d.RESTYPE ?? '',
      // COST is in millions in the FDIC API — convert to dollars (* 1_000_000)
      // The FDIC COST field is reported in $millions
      estimated_loss: d.COST != null ? Math.round(Number(d.COST) * 1_000_000) : null,
      charter_class: d.CHCLASS ?? null,
    };
  });

  const total = raw.meta?.total ?? failures.length;

  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
  return res.json({ failures, total, source: 'fdic_live' });
});
