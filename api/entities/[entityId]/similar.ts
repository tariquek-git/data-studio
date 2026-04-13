import type { VercelRequest, VercelResponse } from '@vercel/node';
import { apiHandler } from '../../../lib/api-handler.js';
import { getSupabase } from '../../../lib/supabase.js';

interface SimilarInstitution {
  id: string;
  cert_number: number | null;
  name: string;
  source: string;
  city: string | null;
  state: string | null;
  total_assets: number | null;
  similarity: number;
}

interface SimilarRpcRow {
  id: string;
  cert_number: number | null;
  name: string;
  source: string;
  city: string | null;
  state: string | null;
  total_assets: number | null;
  similarity: number;
}

export default apiHandler({ methods: ['GET'] }, async (req: VercelRequest, res: VercelResponse) => {
  const entityId = String(req.query.entityId ?? '').trim();
  if (!entityId) {
    return res.status(400).json({ error: 'Missing entityId' });
  }

  const limit = Math.min(Number(req.query.limit ?? 10), 50);
  if (Number.isNaN(limit) || limit < 1) {
    return res.status(400).json({ error: 'Invalid limit' });
  }

  const supabase = getSupabase();

  // Look up the entity's embedding from institutions first, then registry_entities.
  const { data: instRow, error: instError } = await supabase
    .from('institutions')
    .select('embedding')
    .eq('id', entityId)
    .single();

  if (instError && instError.code !== 'PGRST116') {
    return res.status(500).json({ error: 'Failed to look up institution' });
  }

  let embedding: number[] | null = null;

  if (instRow?.embedding) {
    embedding = instRow.embedding as unknown as number[];
  } else {
    // Fall back to registry_entities
    const { data: regRow, error: regError } = await supabase
      .from('registry_entities')
      .select('embedding')
      .eq('id', entityId)
      .single();

    if (regError && regError.code !== 'PGRST116') {
      return res.status(500).json({ error: 'Failed to look up registry entity' });
    }

    if (regRow?.embedding) {
      embedding = regRow.embedding as unknown as number[];
    }
  }

  if (!embedding) {
    return res.json({ similar: [], embedding_available: false });
  }

  // Call the find_similar_institutions RPC (defined in 000_current.sql).
  const { data: rows, error: rpcError } = await supabase.rpc('find_similar_institutions', {
    query_embedding: embedding,
    exclude_id: entityId,
    match_count: limit,
  });

  if (rpcError) {
    return res.status(500).json({ error: `Similarity query failed: ${rpcError.message}` });
  }

  const similar: SimilarInstitution[] = (rows as SimilarRpcRow[] ?? []).map((row) => ({
    id: row.id,
    cert_number: row.cert_number,
    name: row.name,
    source: row.source,
    city: row.city,
    state: row.state,
    total_assets: row.total_assets,
    similarity: row.similarity,
  }));

  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
  return res.json({ similar, embedding_available: true });
});
