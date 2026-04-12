/**
 * QA aggregate status endpoint.
 * Returns a summary of the most recent QA run (in-memory cache)
 * and a lightweight count of institutions by source.
 *
 * GET /api/qa/status
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { apiHandler } from '../../lib/api-handler.js';
import { getQADatabaseSummary } from '../../lib/entity-service.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QAStatusResponse {
  last_check: {
    checked_at: string | null;
    total_checked: number;
    pass_count: number;
    warning_count: number;
    error_count: number;
    pass_rate_pct: number | null;
  };
  database_summary: {
    total_fdic_institutions: number;
    total_active_fdic: number;
    institutions_with_raw_data: number;
    stale_records_count: number; // data_as_of older than 6 months
  };
  known_issues: KnownIssue[];
  status: 'healthy' | 'degraded' | 'unknown';
  checked_at: string;
}

interface KnownIssue {
  severity: 'warning' | 'error';
  code: string;
  message: string;
}

// ─── In-memory cache (persists for the lifetime of the serverless function instance) ──

interface CacheEntry {
  data: QAStatusResponse;
  expires_at: number;
}

// Module-level cache — shared across requests in the same warm function instance
const cache: { entry: CacheEntry | null } = { entry: null };
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ─── Handler ──────────────────────────────────────────────────────────────────

export default apiHandler({ methods: ['GET'] }, async (req: VercelRequest, res: VercelResponse) => {
  const now = Date.now();
  const bypassCache = req.query.refresh === '1';

  // Return cached response if still fresh
  if (!bypassCache && cache.entry && cache.entry.expires_at > now) {
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
    res.setHeader('X-Cache', 'HIT');
    return res.json(cache.entry.data);
  }

  // ── Database summary ──────────────────────────────────────────────────────

  const dbSummary = await getQADatabaseSummary();
  const totalFdic = dbSummary.total_fdic_institutions;
  const totalActive = dbSummary.total_active_fdic;
  const withRawData = dbSummary.institutions_with_raw_data;
  const staleCount = dbSummary.stale_records_count;

  // ── Known issues ──────────────────────────────────────────────────────────

  const knownIssues: KnownIssue[] = [];

  if (staleCount > 0) {
    knownIssues.push({
      severity: 'warning',
      code: 'STALE_DATA',
      message: `${staleCount} active FDIC institutions have data older than 6 months. Run /api/sync/fdic to refresh.`,
    });
  }

  const missingRaw = totalActive - withRawData;
  if (missingRaw > 0) {
    knownIssues.push({
      severity: 'warning',
      code: 'MISSING_RAW_DATA',
      message: `${missingRaw} active FDIC institutions are missing raw_data (needed for derived metric QA).`,
    });
  }

  if (totalFdic === 0) {
    knownIssues.push({
      severity: 'error',
      code: 'NO_FDIC_DATA',
      message: 'No FDIC institutions found in the database. The sync may not have run yet.',
    });
  }

  // ── Determine overall status ──────────────────────────────────────────────

  let status: QAStatusResponse['status'] = 'healthy';
  if (totalFdic === 0) {
    status = 'degraded';
  } else if (knownIssues.some((i) => i.severity === 'error')) {
    status = 'degraded';
  } else if (knownIssues.some((i) => i.severity === 'warning')) {
    status = 'healthy'; // warnings don't degrade — just informational
  }

  // ── Build response ────────────────────────────────────────────────────────

  const response: QAStatusResponse = {
    last_check: {
      // These are populated by the /api/qa/check endpoint and stored externally.
      // Without a persistent store, we return nulls here unless a check was
      // recently cached in this function instance.
      checked_at: null,
      total_checked: 0,
      pass_count: 0,
      warning_count: 0,
      error_count: 0,
      pass_rate_pct: null,
    },
    database_summary: {
      total_fdic_institutions: totalFdic,
      total_active_fdic: totalActive,
      institutions_with_raw_data: withRawData,
      stale_records_count: staleCount,
    },
    known_issues: knownIssues,
    status,
    checked_at: new Date().toISOString(),
  };

  // Store in cache
  cache.entry = {
    data: response,
    expires_at: now + CACHE_TTL_MS,
  };

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
  res.setHeader('X-Cache', 'MISS');
  return res.json(response);
});
