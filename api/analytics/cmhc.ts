import type { VercelRequest, VercelResponse } from '@vercel/node';
import { apiHandler } from '../../lib/api-handler.js';

// CMHC Housing Observer API — requires registration / CORS-blocked in many environments.
// We attempt the public HMI endpoint; on failure we fall back to Q4 2025 seeded values.

const CMHC_HMI_URL =
  'https://api.cmhc-schl.gc.ca/housingObserver/v1/metric/hmi/season/1/geo/can';

// Q4 2025 publicly-known CMHC benchmark values
const SEED_DATA = {
  housing_starts_annualized: 240_000,
  avg_home_price: 713_000,
  mortgage_arrears_rate: 0.22,
  reference_period: 'Q4 2025',
  source: 'cmhc_seeded',
  note: 'CMHC API requires registration or is not publicly accessible. Values are Q4 2025 published estimates.',
};

export default apiHandler({ methods: ['GET'] }, async (_req: VercelRequest, res: VercelResponse) => {
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');

  try {
    const cmhcRes = await fetch(CMHC_HMI_URL, {
      headers: { Accept: 'application/json' },
      // Short timeout — if CMHC is unavailable we want to fall back quickly
      signal: AbortSignal.timeout(5000),
    });

    if (!cmhcRes.ok) {
      // API accessible but returned an error — return seeded fallback
      return res.json({
        ...SEED_DATA,
        api_status: cmhcRes.status,
        api_error: `CMHC returned HTTP ${cmhcRes.status}`,
      });
    }

    const raw = await cmhcRes.json();

    // If we get a valid response, surface what we can alongside seeded housing metrics
    // (the HMI endpoint returns a Housing Market Index score, not starts/prices)
    return res.json({
      hmi: raw,
      housing_starts_annualized: SEED_DATA.housing_starts_annualized,
      avg_home_price: SEED_DATA.avg_home_price,
      mortgage_arrears_rate: SEED_DATA.mortgage_arrears_rate,
      reference_period: SEED_DATA.reference_period,
      source: 'cmhc_live_hmi_seeded_metrics',
    });
  } catch {
    // Network error / timeout / CORS — fall back to seed
    return res.json({
      ...SEED_DATA,
      api_error: 'CMHC API not reachable (network error or registration required)',
    });
  }
});
