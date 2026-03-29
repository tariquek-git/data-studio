import type { VercelRequest, VercelResponse } from '@vercel/node';
import { apiHandler } from '../../lib/api-handler.js';

// Bank of Canada Valet API series codes:
// V39079     — Target overnight rate
// V122530    — Prime rate
// V80691346  — 5-year conventional fixed mortgage rate
// V111955    — CAD/USD exchange rate

const BOC_URL =
  'https://www.bankofcanada.ca/valet/observations/V39079,V122530,V80691346,V111955/json?recent=4';

interface BoCObservation {
  d: string; // date YYYY-MM-DD
  V39079?: { v: string };
  V122530?: { v: string };
  V80691346?: { v: string };
  V111955?: { v: string };
}

interface BoCResponse {
  observations: BoCObservation[];
}

function parseNum(v: string | undefined): number | null {
  if (v === undefined || v === null) return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

export default apiHandler({ methods: ['GET'] }, async (_req: VercelRequest, res: VercelResponse) => {
  const bocRes = await fetch(BOC_URL, {
    headers: { Accept: 'application/json' },
  });

  if (!bocRes.ok) {
    return res.status(502).json({
      error: 'Bank of Canada Valet API unavailable',
      status: bocRes.status,
    });
  }

  const data: BoCResponse = await bocRes.json();
  const obs = data.observations ?? [];

  if (obs.length === 0) {
    return res.status(502).json({ error: 'No observations returned from Bank of Canada' });
  }

  // Most recent observation
  const latest = obs[obs.length - 1];
  // Previous observation for direction arrows
  const previous = obs.length > 1 ? obs[obs.length - 2] : null;

  const result = {
    overnight_rate: parseNum(latest.V39079?.v),
    prime_rate: parseNum(latest.V122530?.v),
    mortgage_5yr: parseNum(latest.V80691346?.v),
    cad_usd: parseNum(latest.V111955?.v),
    as_of: latest.d,
    prev: previous
      ? {
          overnight_rate: parseNum(previous.V39079?.v),
          prime_rate: parseNum(previous.V122530?.v),
          mortgage_5yr: parseNum(previous.V80691346?.v),
          cad_usd: parseNum(previous.V111955?.v),
          as_of: previous.d,
        }
      : null,
  };

  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
  return res.json(result);
});
