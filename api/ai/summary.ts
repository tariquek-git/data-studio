import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { apiHandler } from '../../lib/api-handler.js';
import { getSupabase } from '../../lib/supabase.js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const CACHE_TTL_DAYS = 7;

function getRaw(raw: Record<string, unknown> | null, field: string): number | null {
  if (!raw || raw[field] == null) return null;
  const v = Number(raw[field]);
  return isNaN(v) ? null : v;
}

function fmt(v: number | null, decimals = 2): string {
  if (v == null) return 'N/A';
  return v.toFixed(decimals);
}

export default apiHandler({ methods: ['POST'] }, async (req: VercelRequest, res: VercelResponse) => {
  const body = req.body as { certNumber?: unknown };
  const certNumber = Number(body?.certNumber);

  if (!certNumber || isNaN(certNumber)) {
    return res.status(400).json({ error: 'Invalid certNumber' });
  }

  const supabase = getSupabase();

  // ------------------------------------------------------------------
  // 1. Check cache in ai_summaries table
  // ------------------------------------------------------------------
  const { data: cached } = await supabase
    .from('ai_summaries')
    .select('summary, generated_at')
    .eq('cert_number', certNumber)
    .single();

  if (cached) {
    const generatedAt = new Date(cached.generated_at);
    const ageMs = Date.now() - generatedAt.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);

    if (ageDays <= CACHE_TTL_DAYS) {
      res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600');
      return res.json({
        summary: cached.summary,
        generated_at: cached.generated_at,
        cached: true,
      });
    }
  }

  // ------------------------------------------------------------------
  // 2. Fetch institution data
  // ------------------------------------------------------------------
  const { data: institution, error } = await supabase
    .from('institutions')
    .select('*')
    .eq('cert_number', certNumber)
    .single();

  if (error || !institution) {
    return res.status(404).json({ error: 'Institution not found' });
  }

  const raw = institution.raw_data as Record<string, unknown> | null;

  // Pull metrics — raw FDIC fields are plain ratios/percents, not thousands
  const name: string = institution.name ?? 'This institution';
  const totalAssets: number | null = institution.total_assets;
  const roa: number | null = institution.roa;           // already a percent (e.g. 1.2)
  const roe: number | null = institution.roi;           // already a percent
  const nim: number | null = getRaw(raw, 'NIMY');       // Net Interest Margin % from FDIC
  const elnantr: number | null = getRaw(raw, 'ELNANTR'); // Efficiency ratio from FDIC (%)
  const charterType: string = institution.charter_type ?? 'bank';
  const stateVal: string = institution.state ?? '';
  const numBranches: number | null = institution.num_branches;

  const equityRatio =
    institution.total_assets && institution.equity_capital
      ? ((institution.equity_capital / institution.total_assets) * 100)
      : null;

  const loanToDeposit =
    institution.total_loans && institution.total_deposits
      ? ((institution.total_loans / institution.total_deposits) * 100)
      : null;

  // Format total assets for the prompt
  const assetStr =
    totalAssets == null
      ? 'unknown total assets'
      : totalAssets >= 1e9
      ? `$${(totalAssets / 1e9).toFixed(1)}B in total assets`
      : totalAssets >= 1e6
      ? `$${(totalAssets / 1e6).toFixed(0)}M in total assets`
      : `$${(totalAssets / 1e3).toFixed(0)}K in total assets`;

  const locationStr = [stateVal, charterType].filter(Boolean).join(', ');
  const branchStr = numBranches != null ? `, ${numBranches} branch${numBranches === 1 ? '' : 'es'}` : '';

  const prompt = `You are a bank analyst. Write a concise 2-paragraph analyst brief for ${name}, a ${locationStr} institution with ${assetStr}${branchStr}.

First paragraph: financial health assessment based on ROA ${fmt(roa)}%, ROE ${fmt(roe)}%, NIM ${fmt(nim)}%, efficiency ratio ${fmt(elnantr)}%, equity ratio ${fmt(equityRatio)}%, loan-to-deposit ratio ${fmt(loanToDeposit)}%.

Second paragraph: notable characteristics, strengths, and any areas of watch based on the metrics above. Be specific, professional, and concise. No fluff.`;

  // ------------------------------------------------------------------
  // 3. Generate with Claude
  // ------------------------------------------------------------------
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlock = message.content.find((b) => b.type === 'text');
  const summary = textBlock?.type === 'text' ? textBlock.text : '';
  const generatedAt = new Date().toISOString();

  // ------------------------------------------------------------------
  // 4. Upsert into ai_summaries cache table
  // ------------------------------------------------------------------
  await supabase.from('ai_summaries').upsert(
    {
      cert_number: certNumber,
      summary,
      generated_at: generatedAt,
      model: 'claude-haiku-4-5-20251001',
      source: 'api',
    },
    { onConflict: 'cert_number' }
  );

  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600');
  return res.json({ summary, generated_at: generatedAt, cached: false });
});
