import type { VercelRequest, VercelResponse } from '@vercel/node';
import { apiHandler } from '../../lib/api-handler.js';
import { getSupabase } from '../../lib/supabase.js';

function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const maybe = error as { code?: string; message?: string };
  return maybe.code === '42P01' || /relation .* does not exist/i.test(maybe.message ?? '');
}

export default apiHandler({ methods: ['GET'] }, async (req: VercelRequest, res: VercelResponse) => {
  const supabase = getSupabase();
  const q = String(req.query.q ?? '').trim().toLowerCase();
  const relationshipType = String(req.query.relationship_type ?? '').trim();
  const activeOnly = req.query.active !== 'false';
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));

  const { data, error } = await supabase
    .from('entity_relationships')
    .select('id, relationship_type, relationship_label, active, effective_start, effective_end, source_kind, source_url, confidence_score, notes, from_entity_table, from_entity_id, to_entity_table, to_entity_id')
    .limit(limit * 4);

  if (error) {
    if (isMissingTableError(error)) {
      return res.json({ relationships: [], total: 0 });
    }
    throw error;
  }

  const relationships = (data ?? []).filter((row) => {
    if (activeOnly && row.active === false) return false;
    if (relationshipType && row.relationship_type !== relationshipType) return false;
    if (!q) return true;
    return [
      row.relationship_type,
      row.relationship_label,
      row.notes,
      row.from_entity_table,
      row.to_entity_table,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(q));
  });

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
  return res.json({
    relationships: relationships.slice(0, limit),
    total: relationships.length,
  });
});
