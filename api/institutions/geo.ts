import type { VercelRequest, VercelResponse } from '@vercel/node';
import { apiHandler } from '../../lib/api-handler.js';
import { getSupabase } from '../../lib/supabase.js';

// Returns up to 5,000 geocoded institutions for the map view.
// Intentionally lightweight — only returns fields needed for map pins.

export default apiHandler({ methods: ['GET'] }, async (req: VercelRequest, res: VercelResponse) => {
  const supabase = getSupabase();

  const source = (req.query.source as string || '').split(',').filter(Boolean);
  const state = (req.query.state as string || '').split(',').filter(Boolean);
  const charterType = (req.query.charter_type as string || '').split(',').filter(Boolean);
  const minAssets = req.query.min_assets ? Number(req.query.min_assets) : null;
  const maxAssets = req.query.max_assets ? Number(req.query.max_assets) : null;

  let query = supabase
    .from('institutions')
    .select(`
      id,
      cert_number,
      name,
      city,
      state,
      source,
      charter_type,
      total_assets,
      roa,
      latitude,
      longitude,
      bank_capabilities (brim_score, brim_tier)
    `)
    .eq('active', true)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .order('total_assets', { ascending: false, nullsFirst: false })
    .limit(5000);

  if (source.length > 0) query = query.in('source', source);
  if (state.length > 0) query = query.in('state', state);
  if (charterType.length > 0) query = query.in('charter_type', charterType);
  if (minAssets != null) query = query.gte('total_assets', minAssets);
  if (maxAssets != null) query = query.lte('total_assets', maxAssets);

  const { data, error, count } = await query;
  if (error) throw error;

  const institutions = (data || []).map((row: any) => {
    const cap = Array.isArray(row.bank_capabilities) ? row.bank_capabilities[0] : row.bank_capabilities;
    return {
      id: row.id,
      cert_number: row.cert_number,
      name: row.name,
      city: row.city,
      state: row.state,
      source: row.source,
      charter_type: row.charter_type,
      total_assets: row.total_assets,
      roa: row.roa,
      latitude: row.latitude,
      longitude: row.longitude,
      brim_score: cap?.brim_score ?? null,
      brim_tier: cap?.brim_tier ?? null,
    };
  });

  res.json({ institutions, total: institutions.length });
});
