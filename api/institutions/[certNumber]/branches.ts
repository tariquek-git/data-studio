import type { VercelRequest, VercelResponse } from '@vercel/node';
import { apiHandler } from '../../../lib/api-handler.js';
import { getSupabase } from '../../../lib/supabase.js';

/**
 * GET /api/institutions/:certNumber/branches
 *
 * Returns all branches for a specific FDIC-insured institution.
 * Branch data comes from the FDIC Summary of Deposits (SOD) sync.
 */
export default apiHandler({ methods: ['GET'] }, async (req: VercelRequest, res: VercelResponse) => {
  const supabase = getSupabase();
  const { certNumber } = req.query;

  const cert = parseInt(String(certNumber), 10);
  if (isNaN(cert)) {
    return res.status(400).json({ error: 'Invalid cert number' });
  }

  const { data, error } = await supabase
    .from('branches')
    .select('branch_number, branch_name, city, state, zip, latitude, longitude, total_deposits, established_date, data_as_of')
    .eq('cert_number', cert)
    .order('total_deposits', { ascending: false, nullsFirst: false });

  if (error) throw error;

  const branches = (data ?? []).map(row => ({
    branch_number: row.branch_number,
    branch_name: row.branch_name,
    city: row.city,
    state: row.state,
    zip: row.zip,
    latitude: row.latitude,
    longitude: row.longitude,
    deposits: row.total_deposits,
    established_date: row.established_date,
    data_as_of: row.data_as_of,
  }));

  const note = branches.length === 0
    ? 'No branch data found. Run the branch sync script to load FDIC Summary of Deposits data.'
    : null;

  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
  return res.json({ branches, ...(note ? { note } : {}) });
});
