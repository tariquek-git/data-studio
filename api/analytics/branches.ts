import type { VercelRequest, VercelResponse } from '@vercel/node';
import { apiHandler } from '../../lib/api-handler.js';
import { getSupabase } from '../../lib/supabase.js';

/**
 * GET /api/analytics/branches
 *
 * Query params:
 *   cert  - FDIC cert number: returns all branches for that institution
 *   state - Two-letter state code: returns all branches in that state (max 2000)
 *   (none) - Returns hexbin aggregation by 0.5-degree lat/lng grid for heatmap
 */
export default apiHandler({ methods: ['GET'] }, async (req: VercelRequest, res: VercelResponse) => {
  const supabase = getSupabase();
  const { cert, state, limit: limitParam } = req.query;

  // --- Specific institution ---
  if (cert) {
    const certNumber = parseInt(String(cert), 10);
    if (isNaN(certNumber)) {
      return res.status(400).json({ error: 'Invalid cert number' });
    }

    const { data, error } = await supabase
      .from('branches')
      .select('cert_number, branch_name, city, state, latitude, longitude, total_deposits')
      .eq('cert_number', certNumber)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .order('branch_name');

    if (error) throw error;

    const branches = (data ?? []).map(row => ({
      cert_number: row.cert_number,
      branch_name: row.branch_name,
      city: row.city,
      state: row.state,
      lat: row.latitude,
      lng: row.longitude,
      deposits: row.total_deposits,
    }));

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
    return res.json({ branches });
  }

  // --- Specific state ---
  if (state) {
    const stateCode = String(state).toUpperCase().slice(0, 2);
    const maxLimit = Math.min(parseInt(String(limitParam ?? '2000'), 10), 2000);

    const { data, error } = await supabase
      .from('branches')
      .select('cert_number, branch_name, city, state, latitude, longitude, total_deposits')
      .eq('state', stateCode)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .limit(maxLimit)
      .order('total_deposits', { ascending: false });

    if (error) throw error;

    const branches = (data ?? []).map(row => ({
      cert_number: row.cert_number,
      branch_name: row.branch_name,
      city: row.city,
      state: row.state,
      lat: row.latitude,
      lng: row.longitude,
      deposits: row.total_deposits,
    }));

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
    return res.json({ branches });
  }

  // --- Hexbin aggregation (no filter) ---
  // Fetch all branches with coordinates in batches, then aggregate client-side.
  // For production scale, this could be moved to a Postgres function.
  const GRID_SIZE = 0.5; // degrees

  const { data: allBranches, error: allError, count } = await supabase
    .from('branches')
    .select('latitude, longitude, total_deposits', { count: 'exact' })
    .not('latitude', 'is', null)
    .not('longitude', 'is', null);

  if (allError) throw allError;

  const totalBranches = count ?? 0;

  // Aggregate into 0.5-degree grid cells
  const hexMap = new Map<string, { lat: number; lng: number; count: number; total_deposits: number }>();

  for (const row of allBranches ?? []) {
    const lat = row.latitude as number;
    const lng = row.longitude as number;
    // Snap to nearest 0.5-degree grid center
    const gridLat = Math.round(lat / GRID_SIZE) * GRID_SIZE;
    const gridLng = Math.round(lng / GRID_SIZE) * GRID_SIZE;
    const key = `${gridLat},${gridLng}`;

    const existing = hexMap.get(key);
    if (existing) {
      existing.count += 1;
      existing.total_deposits += Number(row.total_deposits) || 0;
    } else {
      hexMap.set(key, {
        lat: gridLat,
        lng: gridLng,
        count: 1,
        total_deposits: Number(row.total_deposits) || 0,
      });
    }
  }

  const hexbins = Array.from(hexMap.values()).sort((a, b) => b.count - a.count);

  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=172800');
  return res.json({ hexbins, total_branches: totalBranches });
});
