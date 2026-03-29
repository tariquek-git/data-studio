import type { VercelRequest, VercelResponse } from '@vercel/node';
import { apiHandler } from '../../lib/api-handler.js';

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

export interface BankFailure {
  cert_number: number;
  name: string;
  fail_date: string;
  resolution_type: string;
  estimated_loss: number | null;
  charter_class: string | null;
}

export default apiHandler({ methods: ['GET'] }, async (req: VercelRequest, res: VercelResponse) => {
  const yearMin = Number(req.query.year_min ?? 2000);
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const limit = Math.min(Number(req.query.limit ?? 50), 500);

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
  return res.json({ failures, total });
});
