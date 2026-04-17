import type { VercelRequest, VercelResponse } from '@vercel/node';
import { apiHandler } from '../../../lib/api-handler.js';
import { getSupabase } from '../../../lib/supabase.js';

function parseCertNumber(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

interface ScoredSignalRow {
  fact_type: string;
  display_name: string;
  category: string;
  contribution: number;
  raw_weight: number;
  freshness: number;
  confidence: number;
  observed_at: string | null;
  source_kind: string;
  source_url: string | null;
  value_text: string | null;
  value_number: number | null;
  disqualifier: boolean;
}

interface ComputeBrimScoreRow {
  score: number;
  tier: string;
  factors: {
    signals: ScoredSignalRow[];
    disqualifiers: string[];
    raw_score: number;
    max_possible: number;
    disqualified: boolean;
    signals_populated?: number;
    signals_possible?: number;
    completeness?: number;
  };
  computed_at: string;
}

interface SnapshotRow {
  snapshot_date: string;
  score: number;
  tier: string;
}

/**
 * GET /api/institutions/:certNumber/signals
 *
 * Returns the Brim signal breakdown for a single institution: total score,
 * tier, and the per-signal contributions that make up the score. The "why"
 * behind every prospect ranking — used by the BrimSignalBreakdown UI panel.
 */
export default apiHandler({ methods: ['GET'] }, async (req: VercelRequest, res: VercelResponse) => {
  const certNumber = parseCertNumber(req.query.certNumber);
  if (certNumber == null) return res.status(400).json({ error: 'Invalid cert number' });

  const supabase = getSupabase();

  // Resolve cert_number → institution UUID
  const { data: inst, error: instErr } = await supabase
    .from('institutions')
    .select('id, name, cert_number')
    .eq('cert_number', certNumber)
    .maybeSingle();

  if (instErr) return res.status(500).json({ error: instErr.message });
  if (!inst) return res.status(404).json({ error: 'Institution not found' });

  // Call the SQL scoring function
  const { data: scoreRows, error: scoreErr } = await supabase.rpc('compute_brim_score', {
    p_entity_table: 'institutions',
    p_entity_id: inst.id,
  });

  if (scoreErr) return res.status(500).json({ error: scoreErr.message });

  const scoreRow = Array.isArray(scoreRows) && scoreRows.length > 0 ? (scoreRows[0] as ComputeBrimScoreRow) : null;

  if (!scoreRow) {
    return res.status(200).json({
      institution: { id: inst.id, name: inst.name, cert_number: inst.cert_number },
      score: 0,
      tier: 'F',
      signals: [],
      disqualifiers: [],
      disqualified: false,
      completeness: 0,
      signals_populated: 0,
      signals_possible: 0,
      previous: null,
      computed_at: new Date().toISOString(),
    });
  }

  // Pull the two most recent snapshots for this institution to compute a
  // week-over-week delta. Absent if fewer than 2 snapshots exist yet.
  const { data: snapRows } = await supabase
    .from('score_snapshots')
    .select('snapshot_date, score, tier')
    .eq('entity_table', 'institutions')
    .eq('entity_id', inst.id)
    .order('snapshot_date', { ascending: false })
    .limit(2);

  const snapshots = (snapRows ?? []) as SnapshotRow[];
  // The most recent snapshot is the "current" one; the one before it is "prev".
  // If only one snapshot exists or none, previous is null.
  const previous = snapshots.length >= 2
    ? { snapshot_date: snapshots[1].snapshot_date, score: snapshots[1].score, tier: snapshots[1].tier }
    : null;

  return res.status(200).json({
    institution: { id: inst.id, name: inst.name, cert_number: inst.cert_number },
    score: scoreRow.score,
    tier: scoreRow.tier,
    signals: scoreRow.factors.signals ?? [],
    disqualifiers: scoreRow.factors.disqualifiers ?? [],
    disqualified: scoreRow.factors.disqualified ?? false,
    raw_score: scoreRow.factors.raw_score,
    max_possible: scoreRow.factors.max_possible,
    completeness: scoreRow.factors.completeness ?? 0,
    signals_populated: scoreRow.factors.signals_populated ?? 0,
    signals_possible: scoreRow.factors.signals_possible ?? 0,
    previous,
    computed_at: scoreRow.computed_at,
  });
});
