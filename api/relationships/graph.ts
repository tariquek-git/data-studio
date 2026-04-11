import type { VercelRequest, VercelResponse } from '@vercel/node';
import { apiHandler } from '../../lib/api-handler.js';
import { getSupabase } from '../../lib/supabase.js';

// Returns graph data (nodes + edges) for the relationship visualization.
// Fetches entity_relationships and the institution info for all connected nodes.

export default apiHandler({ methods: ['GET'] }, async (req: VercelRequest, res: VercelResponse) => {
  const supabase = getSupabase();

  const relType = (req.query.type as string || '').trim() || null;
  const minAssets = req.query.min_assets ? Number(req.query.min_assets) : null;
  const limit = Math.min(500, Number(req.query.limit) || 200);

  // Fetch relationships
  let relQuery = supabase
    .from('entity_relationships')
    .select('id, from_entity_id, to_entity_id, relationship_type, relationship_label, confidence_score, active')
    .eq('from_entity_table', 'institutions')
    .eq('to_entity_table', 'institutions')
    .eq('active', true)
    .limit(limit);

  if (relType) relQuery = relQuery.eq('relationship_type', relType);

  const { data: rels, error: relErr } = await relQuery;
  if (relErr) throw relErr;
  if (!rels || rels.length === 0) {
    return res.json({ nodes: [], edges: [] });
  }

  // Collect unique entity IDs
  const entityIds = new Set<string>();
  for (const r of rels) {
    entityIds.add(r.from_entity_id);
    entityIds.add(r.to_entity_id);
  }

  // Fetch institution details for all nodes
  let instQuery = supabase
    .from('institutions')
    .select('id, cert_number, name, city, state, source, charter_type, total_assets, roa')
    .in('id', [...entityIds]);

  if (minAssets != null) instQuery = instQuery.gte('total_assets', minAssets);

  const { data: insts, error: instErr } = await instQuery;
  if (instErr) throw instErr;

  const instMap = new Map((insts || []).map((i: any) => [i.id, i]));

  // Build nodes + edges, filtering to only include nodes that exist
  const nodes = (insts || []).map((inst: any) => ({
    id: inst.id,
    cert_number: inst.cert_number,
    name: inst.name,
    city: inst.city,
    state: inst.state,
    source: inst.source,
    charter_type: inst.charter_type,
    total_assets: inst.total_assets,
    roa: inst.roa,
  }));

  const edges = rels
    .filter(r => instMap.has(r.from_entity_id) && instMap.has(r.to_entity_id))
    .map(r => ({
      id: r.id,
      source: r.from_entity_id,
      target: r.to_entity_id,
      type: r.relationship_type,
      label: r.relationship_label,
      confidence: r.confidence_score,
    }));

  res.json({ nodes, edges, total_nodes: nodes.length, total_edges: edges.length });
});
