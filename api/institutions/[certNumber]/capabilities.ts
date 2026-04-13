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

/**
 * GET /api/institutions/{certNumber}/capabilities
 *
 * Returns capability data for a specific institution.
 * Returns null fields wrapped in a capabilities object if no record exists yet —
 * most banks will not have data until the sync scripts populate them.
 */
export default apiHandler({ methods: ['GET'] }, async (req: VercelRequest, res: VercelResponse) => {
  const supabase = getSupabase();

  const certNumber = parseCertNumber(req.query.certNumber);
  if (certNumber == null) {
    return res.status(400).json({ error: 'Invalid cert_number parameter' });
  }

  // Confirm the institution exists
  const { data: institution, error: instError } = await supabase
    .from('institutions')
    .select('cert_number, name, state')
    .eq('cert_number', certNumber)
    .single();

  if (instError || !institution) {
    return res.status(404).json({ error: 'Institution not found' });
  }

  // Fetch capabilities (may not exist yet)
  const { data: capabilities, error: capError } = await supabase
    .from('bank_capabilities')
    .select('*')
    .eq('cert_number', certNumber)
    .maybeSingle();

  if (capError) {
    console.error('Capabilities fetch error:', capError);
    return res.status(500).json({ error: 'Failed to fetch capabilities' });
  }

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  return res.json({
    cert_number: certNumber,
    institution_name: institution.name,
    institution_state: institution.state,
    // Return the row if it exists, otherwise return a null-filled shell so
    // callers always get a consistent shape.
    capabilities: capabilities ?? {
      cert_number: certNumber,
      fed_master_account: null,
      fedwire_participant: null,
      nacha_odfi: null,
      nacha_rdfi: null,
      swift_member: null,
      visa_principal: null,
      mastercard_principal: null,
      amex_issuer: null,
      issues_credit_cards: null,
      issues_debit_cards: null,
      issues_prepaid: null,
      issues_commercial_cards: null,
      baas_platform: null,
      baas_partners: null,
      card_program_manager: null,
      treasury_management: null,
      sweep_accounts: null,
      lockbox_services: null,
      data_source: null,
      confidence: null,
      notes: null,
      source_urls: null,
      verified_at: null,
      created_at: null,
      updated_at: null,
    },
  });
});
