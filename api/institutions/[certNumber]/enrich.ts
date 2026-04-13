import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EnrichmentData {
  cra: CRAData | null;
  enforcement: EnforcementAction[];
  sec: SECData | null;
  wiki: WikiData | null;
  rssd_id: number | null;
}

interface CRAData {
  rating: string;
  rating_code: number;
  exam_date: string | null;
  source_url: string;
}

interface EnforcementAction {
  date: string;
  type: string;
  active: boolean;
  termination_date: string | null;
  penalty_amount: number | null;
}

interface SECData {
  entity_name: string;
  cik: string;
  ticker: string | null;
  exchange: string | null;
  edgar_url: string;
  recent_filings: Array<{ form: string; date: string; url: string }>;
}

interface WikiData {
  title: string;
  extract: string;
  thumbnail: string | null;
  url: string;
}

// ---------------------------------------------------------------------------
// Source fetchers
// ---------------------------------------------------------------------------

const CRA_LABELS: Record<number, string> = {
  1: 'Outstanding',
  2: 'Satisfactory',
  3: 'Needs to Improve',
  4: 'Substantial Non-Compliance',
};

async function fetchCRAandRSSD(cert: number): Promise<{ cra: CRAData | null; rssd_id: number | null }> {
  try {
    const url = `https://banks.data.fdic.gov/api/institutions?filters=CERT:${cert}&fields=CERT,CRARA,CRADATE,RSSDID&limit=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { cra: null, rssd_id: null };
    const json = await res.json();
    const row = json.data?.[0]?.data;
    if (!row) return { cra: null, rssd_id: null };

    const code = Number(row.CRARA);
    const cra: CRAData | null = code > 0 ? {
      rating: CRA_LABELS[code] ?? 'Unknown',
      rating_code: code,
      exam_date: row.CRADATE || null,
      source_url: `https://www.ffiec.gov/craratings/`,
    } : null;

    const rssd_id = row.RSSDID ? Number(row.RSSDID) : null;
    return { cra, rssd_id };
  } catch {
    return { cra: null, rssd_id: null };
  }
}

async function fetchWarehouseCRAandRSSD(cert: number): Promise<{ cra: CRAData | null; rssd_id: number | null }> {
  const { data: institution, error: institutionError } = await supabase
    .from('institutions')
    .select('id')
    .eq('cert_number', cert)
    .maybeSingle();

  if (institutionError || !institution?.id) {
    return { cra: null, rssd_id: null };
  }

  const [externalIdRes, craFactRes] = await Promise.all([
    supabase
      .from('entity_external_ids')
      .select('id_value')
      .eq('entity_table', 'institutions')
      .eq('entity_id', institution.id)
      .eq('id_type', 'rssd_id')
      .order('is_primary', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('entity_facts')
      .select('fact_value_text, fact_value_number, fact_value_json, source_url, observed_at')
      .eq('entity_table', 'institutions')
      .eq('entity_id', institution.id)
      .eq('fact_key', 'cra_rating')
      .order('observed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const rssd_id = externalIdRes.data?.id_value ? Number(externalIdRes.data.id_value) : null;
  const fact = craFactRes.data;
  const cra = fact ? {
    rating: String(fact.fact_value_text ?? 'Unknown'),
    rating_code: Number(fact.fact_value_number ?? 0),
    exam_date: typeof fact.fact_value_json?.exam_date === 'string' ? fact.fact_value_json.exam_date : null,
    source_url: String(fact.source_url ?? 'https://www.ffiec.gov/craratings/'),
  } : null;

  return { cra, rssd_id };
}

async function fetchEnforcement(cert: number): Promise<EnforcementAction[]> {
  try {
    const url = `https://banks.data.fdic.gov/api/enforcement?filters=CERT:${cert}&fields=CERT,INSTNAME,INITDATE,ENFORMACT,TERMDATE,CITYPENAL&limit=10&sort_by=INITDATE&sort_order=DESC`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const json = await res.json();
    if (!json.data?.length) return [];

    return json.data.map((item: { data: Record<string, unknown> }) => {
      const d = item.data;
      const penalty = d.CITYPENAL ? Number(d.CITYPENAL) * 1000 : null;
      return {
        date: String(d.INITDATE || ''),
        type: String(d.ENFORMACT || 'Enforcement Action'),
        active: !d.TERMDATE,
        termination_date: d.TERMDATE ? String(d.TERMDATE) : null,
        penalty_amount: penalty && penalty > 0 ? penalty : null,
      };
    });
  } catch {
    return [];
  }
}

async function fetchWarehouseEnforcement(cert: number): Promise<EnforcementAction[]> {
  const { data: institution, error: institutionError } = await supabase
    .from('institutions')
    .select('id')
    .eq('cert_number', cert)
    .maybeSingle();

  if (institutionError || !institution?.id) return [];

  const { data, error } = await supabase
    .from('entity_facts')
    .select('fact_value_text, fact_value_number, fact_value_json, observed_at')
    .eq('entity_table', 'institutions')
    .eq('entity_id', institution.id)
    .eq('fact_key', 'fdic_enforcement_action')
    .order('observed_at', { ascending: false })
    .limit(10);

  if (error || !data?.length) return [];

  return data.map((row) => ({
    date: typeof row.fact_value_json?.init_date === 'string'
      ? row.fact_value_json.init_date
      : String(row.observed_at ?? ''),
    type: String(row.fact_value_text ?? row.fact_value_json?.action_type ?? 'Enforcement Action'),
    active: !row.fact_value_json?.termination_date,
    termination_date: typeof row.fact_value_json?.termination_date === 'string'
      ? row.fact_value_json.termination_date
      : null,
    penalty_amount: row.fact_value_number != null ? Number(row.fact_value_number) : null,
  }));
}

async function fetchSECData(institutionName: string, holdingCompanyName: string | null): Promise<SECData | null> {
  // Try holding company name first (more likely to have SEC filings), then bank name
  const candidates = [holdingCompanyName, institutionName].filter(Boolean) as string[];

  for (const name of candidates) {
    try {
      // EDGAR full-text search for recent 10-K filings by this company name
      const encoded = encodeURIComponent(`"${name}"`);
      const url = `https://efts.sec.gov/LATEST/search-index?q=${encoded}&forms=10-K&dateRange=custom&startdt=2023-01-01&enddt=2026-12-31`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(6000),
        headers: { 'User-Agent': 'DataStudio research-bot' },
      });
      if (!res.ok) continue;

      const json = await res.json();
      const hits = json.hits?.hits;
      if (!hits?.length) continue;

      // Pick the best match: prefer exact name match
      const hit = hits.find((h: { _source: { entity_name: string } }) =>
        h._source.entity_name.toLowerCase().includes(name.toLowerCase().split(' ')[0])
      ) ?? hits[0];

      const src = hit._source;
      if (!src) continue;

      const cik = String(src.entity_id || src.file_num?.split('-')[0] || '').replace(/^0+/, '');
      if (!cik) continue;

      // Fetch company details from EDGAR submissions API
      const paddedCik = cik.padStart(10, '0');
      const subRes = await fetch(`https://data.sec.gov/submissions/CIK${paddedCik}.json`, {
        signal: AbortSignal.timeout(5000),
        headers: { 'User-Agent': 'DataStudio research-bot' },
      });

      let ticker: string | null = null;
      let exchange: string | null = null;
      let recentFilings: Array<{ form: string; date: string; url: string }> = [];

      if (subRes.ok) {
        const sub = await subRes.json();
        ticker = sub.tickers?.[0] ?? null;
        exchange = sub.exchanges?.[0] ?? null;

        // Get the 5 most recent 10-K and 10-Q filings
        const forms: string[] = sub.filings?.recent?.form ?? [];
        const dates: string[] = sub.filings?.recent?.filingDate ?? [];
        const accNums: string[] = sub.filings?.recent?.accessionNumber ?? [];

        for (let i = 0; i < forms.length && recentFilings.length < 5; i++) {
          if (['10-K', '10-Q', '20-F', '40-F'].includes(forms[i])) {
            const acc = accNums[i]?.replace(/-/g, '');
            recentFilings.push({
              form: forms[i],
              date: dates[i],
              url: `https://www.sec.gov/Archives/edgar/data/${cik}/${acc}/`,
            });
          }
        }

        return {
          entity_name: sub.name ?? name,
          cik: paddedCik,
          ticker,
          exchange,
          edgar_url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${paddedCik}&type=10-K&dateb=&owner=include&count=10`,
          recent_filings: recentFilings,
        };
      }

      // Fallback: return what we know from the search hit
      return {
        entity_name: src.entity_name ?? name,
        cik: paddedCik,
        ticker: null,
        exchange: null,
        edgar_url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${paddedCik}&type=10-K&dateb=&owner=include&count=10`,
        recent_filings: [],
      };
    } catch {
      continue;
    }
  }

  return null;
}

async function fetchWikipedia(institutionName: string): Promise<WikiData | null> {
  // Clean up the name for Wikipedia lookup
  const searchName = institutionName
    .replace(/,?\s*(N\.?A\.?|F\.?S\.?B\.?|F\.?C\.?U\.?|Credit Union|Bank|Trust Co\.?)\.?\s*$/i, '')
    .trim();

  try {
    const encoded = encodeURIComponent(searchName);
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'DataStudio research-bot' },
    });
    if (!res.ok) return null;

    const json = await res.json();
    // Filter out disambiguation pages and non-financial articles
    if (json.type === 'disambiguation') return null;
    if (!json.extract || json.extract.length < 50) return null;

    // Trim extract to ~300 chars (2-3 sentences)
    let extract = json.extract;
    const sentences = extract.match(/[^.!?]+[.!?]+/g) ?? [];
    extract = sentences.slice(0, 3).join(' ').trim();
    if (extract.length > 400) extract = extract.slice(0, 397) + '…';

    return {
      title: json.title,
      extract,
      thumbnail: json.thumbnail?.source ?? null,
      url: json.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encoded}`,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { certNumber } = req.query;
  const cert = Number(certNumber);
  if (!cert || isNaN(cert)) return res.status(400).json({ error: 'Invalid cert number' });

  // Only enrich FDIC/NCUA institutions (US deposit-takers with regulatory data)
  const { data: institution, error } = await supabase
    .from('institutions')
    .select('name, legal_name, source, raw_data, website')
    .eq('cert_number', cert)
    .single();

  if (error || !institution) return res.status(404).json({ error: 'Institution not found' });

  // Only US deposit-takers have enforcement/CRA/SEC data
  const isFDIC = institution.source === 'fdic';
  const isNorthAmerican = ['fdic', 'ncua'].includes(institution.source);

  const holdingCompany = (institution.raw_data as Record<string, unknown> | null)?.NAMEHCR as string | null ?? null;

  // Fetch all sources in parallel
  const [warehouseCraResult, warehouseEnforcement, sec, wiki] = await Promise.all([
    isFDIC ? fetchWarehouseCRAandRSSD(cert) : Promise.resolve({ cra: null, rssd_id: null }),
    isFDIC ? fetchWarehouseEnforcement(cert) : Promise.resolve([]),
    isNorthAmerican ? fetchSECData(institution.name, holdingCompany) : Promise.resolve(null),
    fetchWikipedia(institution.legal_name ?? institution.name),
  ]);

  const craResult =
    warehouseCraResult.cra || warehouseCraResult.rssd_id
      ? warehouseCraResult
      : isFDIC
        ? await fetchCRAandRSSD(cert)
        : { cra: null, rssd_id: null };

  const enforcement =
    warehouseEnforcement.length > 0
      ? warehouseEnforcement
      : isFDIC
        ? await fetchEnforcement(cert)
        : [];

  const result: EnrichmentData = {
    cra: craResult.cra,
    enforcement,
    sec,
    wiki,
    rssd_id: craResult.rssd_id,
  };

  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600');
  return res.status(200).json(result);
}
