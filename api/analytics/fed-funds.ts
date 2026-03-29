import type { VercelRequest, VercelResponse } from '@vercel/node';
import { apiHandler } from '../../lib/api-handler.js';

const BOC_URL =
  'https://www.bankofcanada.ca/valet/observations/V39079/json?recent=24';

interface BoCObservation {
  d: string;
  V39079?: { v: string };
}

interface BoCResponse {
  observations: BoCObservation[];
}

interface RatePoint {
  date: string;
  rate: number;
}

function parseNum(v: string | undefined): number | null {
  if (v === undefined || v === null) return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

/** Return the quarter-end date string (YYYY-MM-DD) for a given Date */
function toQuarterEnd(d: Date): string {
  const m = d.getMonth(); // 0-indexed
  const y = d.getFullYear();
  // Q1 ends Mar 31, Q2 ends Jun 30, Q3 ends Sep 30, Q4 ends Dec 31
  const quarterEndMonths = [2, 5, 8, 11]; // 0-indexed months
  const qMonth = quarterEndMonths[Math.floor(m / 3)];
  const lastDay = new Date(y, qMonth + 1, 0).getDate();
  const mm = String(qMonth + 1).padStart(2, '0');
  const dd = String(lastDay).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

/** Generate the last N quarter-end dates going backwards from today */
function lastNQuarterEnds(n: number): string[] {
  const today = new Date();
  const currentQEnd = toQuarterEnd(today);
  const results: string[] = [];
  const seen = new Set<string>();

  // Start from the current quarter and walk back
  let cursor = new Date(today);
  while (results.length < n) {
    const qEnd = toQuarterEnd(cursor);
    if (!seen.has(qEnd)) {
      seen.add(qEnd);
      results.push(qEnd);
    }
    // Move back ~1 month to reach the previous quarter
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
  }

  // The current quarter end might be in the future — skip future dates
  const todayStr = today.toISOString().slice(0, 10);
  return results
    .filter((d) => d <= todayStr)
    .slice(0, n)
    .reverse(); // oldest first
}

/** Find the closest observation to a target date */
function findClosest(observations: RatePoint[], targetDate: string): number | null {
  if (observations.length === 0) return null;
  const target = new Date(targetDate).getTime();
  let best: RatePoint | null = null;
  let bestDiff = Infinity;
  for (const obs of observations) {
    const diff = Math.abs(new Date(obs.date).getTime() - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = obs;
    }
  }
  return best?.rate ?? null;
}

/** Align a series of rate observations to a list of quarter-end dates */
function alignToQuarters(observations: RatePoint[], quarterDates: string[]): RatePoint[] {
  return quarterDates
    .map((date) => {
      const rate = findClosest(observations, date);
      if (rate === null) return null;
      return { date, rate };
    })
    .filter((x): x is RatePoint => x !== null);
}

async function fetchFredFunds(): Promise<RatePoint[]> {
  const apiKey = process.env.FRED_API_KEY;

  if (apiKey) {
    // Use the JSON API when a key is available
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=FEDFUNDS&api_key=${apiKey}&file_type=json&frequency=q`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`FRED API error: ${res.status}`);
    const data = await res.json() as { observations: Array<{ date: string; value: string }> };
    return (data.observations ?? [])
      .map((o) => {
        const rate = parseFloat(o.value);
        if (isNaN(rate)) return null;
        return { date: o.date, rate };
      })
      .filter((x): x is RatePoint => x !== null);
  }

  // Public CSV endpoint — no auth required
  const url =
    'https://fred.stlouisfed.org/graph/fredgraph.csv?id=FEDFUNDS&vintage_date=2026-01-01';
  const res = await fetch(url, { headers: { Accept: 'text/csv' } });
  if (!res.ok) throw new Error(`FRED CSV error: ${res.status}`);
  const text = await res.text();
  const lines = text.trim().split('\n');
  // First line is the header: DATE,FEDFUNDS
  const points: RatePoint[] = [];
  for (let i = 1; i < lines.length; i++) {
    const [date, value] = lines[i].split(',');
    if (!date || !value) continue;
    const rate = parseFloat(value.trim());
    if (!isNaN(rate)) {
      points.push({ date: date.trim(), rate });
    }
  }
  return points;
}

async function fetchBoCOvernight(): Promise<RatePoint[]> {
  const res = await fetch(BOC_URL, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`BoC API error: ${res.status}`);
  const data: BoCResponse = await res.json();
  return (data.observations ?? [])
    .map((o) => {
      const rate = parseNum(o.V39079?.v);
      if (rate === null) return null;
      return { date: o.d, rate };
    })
    .filter((x): x is RatePoint => x !== null);
}

export default apiHandler({ methods: ['GET'] }, async (_req: VercelRequest, res: VercelResponse) => {
  const quarterDates = lastNQuarterEnds(20);

  const [fredPoints, bocPoints] = await Promise.allSettled([
    fetchFredFunds(),
    fetchBoCOvernight(),
  ]);

  const fedFundsRaw: RatePoint[] =
    fredPoints.status === 'fulfilled' ? fredPoints.value : [];
  const bocRaw: RatePoint[] =
    bocPoints.status === 'fulfilled' ? bocPoints.value : [];

  const fed_funds = alignToQuarters(fedFundsRaw, quarterDates);
  const overnight_ca = alignToQuarters(bocRaw, quarterDates);

  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=172800');
  return res.json({ fed_funds, overnight_ca });
});
