import type { VercelRequest, VercelResponse } from '@vercel/node';
import { apiHandler } from '../../lib/api-handler.js';
import { getSupabase } from '../../lib/supabase.js';

// Returns graph data (nodes + edges) for the relationship visualization.
// Supports all entity table types (institutions, registry_entities, ecosystem_entities)
// and multi-hop traversal up to depth 3.

type EntityTable = 'institutions' | 'registry_entities' | 'ecosystem_entities';

interface EntityRef {
  table: EntityTable;
  id: string;
}

interface RelationshipRow {
  id: string;
  from_entity_id: string;
  from_entity_table: string;
  to_entity_id: string;
  to_entity_table: string;
  relationship_type: string;
  relationship_label: string | null;
  confidence_score: number | null;
  active: boolean;
}

interface InstitutionRow {
  id: string;
  cert_number: number;
  name: string;
  city: string;
  state: string;
  source: string;
  charter_type: string;
  total_assets: number | null;
  roa: number | null;
}

interface RegistryEntityRow {
  id: string;
  name: string;
  entity_subtype: string | null;
  jurisdiction: string | null;
}

interface EcosystemEntityRow {
  id: string;
  name: string;
  entity_subtype: string | null;
  category: string | null;
}

interface GraphNode {
  id: string;
  entity_table: EntityTable;
  cert_number: number | null;
  name: string;
  city: string | null;
  state: string | null;
  source: string | null;
  charter_type: string | null;
  total_assets: number | null;
  roa: number | null;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  label: string | null;
  confidence: number | null;
}

const VALID_ENTITY_TABLES = new Set<string>(['institutions', 'registry_entities', 'ecosystem_entities']);

function isEntityTable(t: string): t is EntityTable {
  return VALID_ENTITY_TABLES.has(t);
}

export default apiHandler({ methods: ['GET'] }, async (req: VercelRequest, res: VercelResponse) => {
  const supabase = getSupabase();

  const relType = (req.query.type as string || '').trim() || null;
  const minAssets = req.query.min_assets ? Number(req.query.min_assets) : null;
  const limit = Math.min(500, Number(req.query.limit) || 200);
  const depth = Math.min(3, Math.max(1, Number(req.query.depth) || 1));

  // --- First hop: fetch all active relationships ---
  let relQuery = supabase
    .from('entity_relationships')
    .select('id, from_entity_id, from_entity_table, to_entity_id, to_entity_table, relationship_type, relationship_label, confidence_score, active')
    .eq('active', true)
    .order('id')
    .limit(limit);

  if (relType) relQuery = relQuery.eq('relationship_type', relType);

  const { data: firstHopRels, error: relErr } = await relQuery;
  if (relErr) throw relErr;
  if (!firstHopRels || firstHopRels.length === 0) {
    return res.json({ nodes: [], edges: [], total_nodes: 0, total_edges: 0 });
  }

  const allRels: RelationshipRow[] = firstHopRels as RelationshipRow[];

  // --- Multi-hop traversal (depth > 1) ---
  if (depth > 1) {
    // Use composite keys (entity_table:entity_id) to avoid cross-table ID collisions.
    let frontier = new Set<string>();
    for (const r of allRels) {
      frontier.add(`${r.from_entity_table}:${r.from_entity_id}`);
      frontier.add(`${r.to_entity_table}:${r.to_entity_id}`);
    }

    const seenRelIds = new Set<string>(allRels.map(r => r.id));

    for (let hop = 1; hop < depth; hop++) {
      if (frontier.size === 0) break;
      // Extract the raw IDs for the PostgREST .in() filter while keeping
      // composite-key deduplication in the frontier set.
      const frontierIds = [...new Set([...frontier].map(k => k.split(':').slice(1).join(':')))];

      const { data: hopRels, error: hopErr } = await supabase
        .from('entity_relationships')
        .select('id, from_entity_id, from_entity_table, to_entity_id, to_entity_table, relationship_type, relationship_label, confidence_score, active')
        .eq('active', true)
        .or(`from_entity_id.in.(${frontierIds.join(',')}),to_entity_id.in.(${frontierIds.join(',')})`)
        .order('id')
        .limit(limit);

      if (hopErr) throw hopErr;

      const nextFrontier = new Set<string>();
      for (const r of (hopRels ?? []) as RelationshipRow[]) {
        if (!seenRelIds.has(r.id)) {
          seenRelIds.add(r.id);
          allRels.push(r);
          nextFrontier.add(`${r.from_entity_table}:${r.from_entity_id}`);
          nextFrontier.add(`${r.to_entity_table}:${r.to_entity_id}`);
        }
      }
      frontier = nextFrontier;
    }
  }

  // --- Collect unique entity refs from all edges ---
  // Key by composite (entity_table:entity_id) to avoid cross-table UUID collisions.
  const entityRefMap = new Map<string, EntityRef>();
  for (const r of allRels) {
    if (isEntityTable(r.from_entity_table)) {
      entityRefMap.set(`${r.from_entity_table}:${r.from_entity_id}`, { table: r.from_entity_table, id: r.from_entity_id });
    }
    if (isEntityTable(r.to_entity_table)) {
      entityRefMap.set(`${r.to_entity_table}:${r.to_entity_id}`, { table: r.to_entity_table, id: r.to_entity_id });
    }
  }

  const instIds = [...entityRefMap.values()].filter(e => e.table === 'institutions').map(e => e.id);
  const regIds = [...entityRefMap.values()].filter(e => e.table === 'registry_entities').map(e => e.id);
  const ecoIds = [...entityRefMap.values()].filter(e => e.table === 'ecosystem_entities').map(e => e.id);

  // --- Load node details from all three tables ---
  // Node map is keyed by composite key (entity_table:entity_id) to prevent
  // cross-table UUID collisions. GraphNode.id also uses the composite key so
  // that D3 edge source/target references resolve correctly.
  const nodeMap = new Map<string, GraphNode>();

  if (instIds.length > 0) {
    let instQuery = supabase
      .from('institutions')
      .select('id, cert_number, name, city, state, source, charter_type, total_assets, roa')
      .in('id', instIds);
    if (minAssets != null) instQuery = instQuery.gte('total_assets', minAssets);
    const { data: insts, error: instErr } = await instQuery;
    if (instErr) throw instErr;
    for (const inst of (insts ?? []) as InstitutionRow[]) {
      const key = `institutions:${inst.id}`;
      nodeMap.set(key, {
        id: key,
        entity_table: 'institutions',
        cert_number: inst.cert_number,
        name: inst.name,
        city: inst.city,
        state: inst.state,
        source: inst.source,
        charter_type: inst.charter_type,
        total_assets: inst.total_assets,
        roa: inst.roa,
      });
    }
  }

  if (regIds.length > 0) {
    const { data: regs, error: regErr } = await supabase
      .from('registry_entities')
      .select('id, name, entity_subtype, jurisdiction')
      .in('id', regIds);
    if (regErr) throw regErr;
    for (const reg of (regs ?? []) as RegistryEntityRow[]) {
      const key = `registry_entities:${reg.id}`;
      nodeMap.set(key, {
        id: key,
        entity_table: 'registry_entities',
        cert_number: null,
        name: reg.name,
        city: null,
        state: reg.jurisdiction ?? null,
        source: null,
        charter_type: reg.entity_subtype ?? null,
        total_assets: null,
        roa: null,
      });
    }
  }

  if (ecoIds.length > 0) {
    const { data: ecos, error: ecoErr } = await supabase
      .from('ecosystem_entities')
      .select('id, name, entity_subtype, category')
      .in('id', ecoIds);
    if (ecoErr) throw ecoErr;
    for (const eco of (ecos ?? []) as EcosystemEntityRow[]) {
      const key = `ecosystem_entities:${eco.id}`;
      nodeMap.set(key, {
        id: key,
        entity_table: 'ecosystem_entities',
        cert_number: null,
        name: eco.name,
        city: null,
        state: null,
        source: eco.category ?? null,
        charter_type: eco.entity_subtype ?? null,
        total_assets: null,
        roa: null,
      });
    }
  }

  // --- Build edges, filtering to only include edges where both nodes exist ---
  // Use composite keys for source/target so they match GraphNode.id values.
  const edges: GraphEdge[] = allRels
    .filter(r =>
      nodeMap.has(`${r.from_entity_table}:${r.from_entity_id}`) &&
      nodeMap.has(`${r.to_entity_table}:${r.to_entity_id}`)
    )
    .map(r => ({
      id: r.id,
      source: `${r.from_entity_table}:${r.from_entity_id}`,
      target: `${r.to_entity_table}:${r.to_entity_id}`,
      type: r.relationship_type,
      label: r.relationship_label,
      confidence: r.confidence_score,
    }));

  // Deduplicate edges (possible from multi-hop re-fetch)
  const seenEdgeIds = new Set<string>();
  const uniqueEdges = edges.filter(e => {
    if (seenEdgeIds.has(e.id)) return false;
    seenEdgeIds.add(e.id);
    return true;
  });

  // Only keep nodes referenced by at least one edge
  const referencedNodeIds = new Set<string>();
  for (const e of uniqueEdges) {
    referencedNodeIds.add(e.source as string);
    referencedNodeIds.add(e.target as string);
  }
  const nodes = [...nodeMap.values()].filter(n => referencedNodeIds.has(n.id));

  res.json({ nodes, edges: uniqueEdges, total_nodes: nodes.length, total_edges: uniqueEdges.length });
});
