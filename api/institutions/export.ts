import type { VercelRequest, VercelResponse } from '@vercel/node';
import { apiHandler } from '../../lib/api-handler.js';
import { getSupabase } from '../../lib/supabase.js';

/**
 * CSV export for BD workflows.
 *
 * Accepts the same filter params as /api/institutions/screen (asset_min/max,
 * state, source, etc.) plus brim-specific filters:
 *   - brim_tier=A,B,C (comma-separated list of tiers to include)
 *   - brim_score_min / brim_score_max (0-100)
 *   - include_signals=true (include top 3 signals as columns)
 *
 * Returns text/csv with a header row. Reps paste this into their CRM or
 * spreadsheet — the columns are flat, no nested JSON.
 *
 * Uses the latest score_snapshots row per institution (or runs compute_brim_score
 * if no snapshot yet). Max 10,000 rows per export to keep memory sane.
 */

const MAX_ROWS = 10_000;
const ALLOWED_TIERS = new Set(['A', 'B', 'C', 'D', 'F']);

function parseNumber(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseList(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Escape a value for CSV: wrap in quotes if it contains comma, quote, or newline.
 * Double up internal quotes per RFC 4180.
 */
function csvCell(value: unknown): string {
  if (value == null) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(',');
}

interface InstitutionRow {
  id: string;
  cert_number: number;
  name: string;
  city: string | null;
  state: string | null;
  source: string | null;
  charter_type: string | null;
  regulator: string | null;
  holding_company: string | null;
  total_assets: number | null;
  total_deposits: number | null;
  total_loans: number | null;
  credit_card_loans: number | null;
  roa: number | null;
  website: string | null;
  data_as_of: string | null;
}

interface SnapshotRow {
  entity_id: string;
  score: number;
  tier: string;
  completeness: number | string;
  signals_populated: number;
  factors: { signals?: Array<{ display_name?: string; contribution?: number }> } | null;
}

export default apiHandler({ methods: ['GET'] }, async (req: VercelRequest, res: VercelResponse) => {
  const supabase = getSupabase();

  // ── Parse filters ─────────────────────────────────────────────────────────
  const assetMin = parseNumber(req.query.asset_min);
  const assetMax = parseNumber(req.query.asset_max);
  const sources = parseList(req.query.source);
  const states = parseList(req.query.state);
  const charterTypes = parseList(req.query.charter_type);
  const tierFilter = parseList(req.query.brim_tier).filter((t) => ALLOWED_TIERS.has(t));
  const scoreMin = parseNumber(req.query.brim_score_min);
  const scoreMax = parseNumber(req.query.brim_score_max);
  const includeSignals = req.query.include_signals === 'true';
  const activeOnly = req.query.active_only !== 'false';

  // ── 1. Fetch institutions matching structural filters ────────────────────
  let instQuery = supabase
    .from('institutions')
    .select(
      'id, cert_number, name, city, state, source, charter_type, regulator, holding_company, total_assets, total_deposits, total_loans, credit_card_loans, roa, website, data_as_of'
    )
    .limit(MAX_ROWS);

  if (activeOnly) instQuery = instQuery.eq('active', true);
  if (assetMin != null) instQuery = instQuery.gte('total_assets', assetMin);
  if (assetMax != null) instQuery = instQuery.lte('total_assets', assetMax);
  if (sources.length) instQuery = instQuery.in('source', sources);
  if (states.length) instQuery = instQuery.in('state', states);
  if (charterTypes.length) instQuery = instQuery.in('charter_type', charterTypes);

  const { data: institutions, error: instErr } = await instQuery;
  if (instErr) {
    console.error('Export: institutions query failed', instErr);
    return res.status(500).json({ error: 'Institutions query failed' });
  }
  const rows = (institutions ?? []) as InstitutionRow[];

  // ── 2. Fetch latest snapshot per institution (one batch query) ───────────
  const entityIds = rows.map((r) => r.id);
  const snapshotByEntity = new Map<string, SnapshotRow>();

  if (entityIds.length > 0) {
    // Get the latest snapshot_date that exists at all — avoids filtering to
    // "today" when the cron hasn't run yet.
    const { data: latestDateRow } = await supabase
      .from('score_snapshots')
      .select('snapshot_date')
      .order('snapshot_date', { ascending: false })
      .limit(1);

    const latestDate = latestDateRow?.[0]?.snapshot_date ?? null;

    if (latestDate) {
      // Paginate because .in() with large lists plus no limit caps at 1000.
      const chunkSize = 1000;
      for (let i = 0; i < entityIds.length; i += chunkSize) {
        const chunk = entityIds.slice(i, i + chunkSize);
        const { data: snaps, error: snapErr } = await supabase
          .from('score_snapshots')
          .select('entity_id, score, tier, completeness, signals_populated, factors')
          .eq('snapshot_date', latestDate)
          .in('entity_id', chunk);
        if (snapErr) {
          console.warn('Export: snapshot query error (non-fatal)', snapErr);
          continue;
        }
        for (const s of (snaps ?? []) as SnapshotRow[]) {
          snapshotByEntity.set(s.entity_id, s);
        }
      }
    }
  }

  // ── 3. Apply Brim score filters ──────────────────────────────────────────
  let filtered = rows;
  if (tierFilter.length > 0 || scoreMin != null || scoreMax != null) {
    filtered = rows.filter((r) => {
      const snap = snapshotByEntity.get(r.id);
      if (!snap) return false; // unscored institutions excluded from tier/score filters
      if (tierFilter.length && !tierFilter.includes(snap.tier)) return false;
      if (scoreMin != null && snap.score < scoreMin) return false;
      if (scoreMax != null && snap.score > scoreMax) return false;
      return true;
    });
  }

  // ── 4. Build CSV ─────────────────────────────────────────────────────────
  const header = [
    'cert_number',
    'name',
    'city',
    'state',
    'source',
    'charter_type',
    'regulator',
    'holding_company',
    'total_assets',
    'total_deposits',
    'total_loans',
    'credit_card_loans',
    'roa_pct',
    'website',
    'data_as_of',
    'brim_score',
    'brim_tier',
    'brim_completeness',
    'brim_signals_populated',
  ];
  if (includeSignals) {
    header.push('top_signal_1', 'top_signal_1_contribution');
    header.push('top_signal_2', 'top_signal_2_contribution');
    header.push('top_signal_3', 'top_signal_3_contribution');
  }

  const lines: string[] = [csvRow(header)];

  for (const r of filtered) {
    const snap = snapshotByEntity.get(r.id);
    const base: unknown[] = [
      r.cert_number,
      r.name,
      r.city ?? '',
      r.state ?? '',
      r.source ?? '',
      r.charter_type ?? '',
      r.regulator ?? '',
      r.holding_company ?? '',
      r.total_assets ?? '',
      r.total_deposits ?? '',
      r.total_loans ?? '',
      r.credit_card_loans ?? '',
      r.roa ?? '',
      r.website ?? '',
      r.data_as_of ?? '',
      snap?.score ?? '',
      snap?.tier ?? '',
      snap?.completeness ?? '',
      snap?.signals_populated ?? '',
    ];
    if (includeSignals) {
      const signals = snap?.factors?.signals ?? [];
      for (let i = 0; i < 3; i++) {
        const sig = signals[i];
        base.push(sig?.display_name ?? '', sig?.contribution ?? '');
      }
    }
    lines.push(csvRow(base));
  }

  const csv = lines.join('\n') + '\n';
  const filename = `institutions-export-${new Date().toISOString().split('T')[0]}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).send(csv);
});
