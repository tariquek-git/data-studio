import type { VercelRequest, VercelResponse } from '@vercel/node';
import { apiHandler } from '../../lib/api-handler.js';
import { getSupabase } from '../../lib/supabase.js';

const FDIC_API = 'https://banks.data.fdic.gov/api';

const FIELDS = [
  // Core institution fields
  'CERT', 'REPDTE', 'INSTNAME', 'CITY', 'STALP', 'ZIP', 'COUNTY',
  'ASSET', 'DEP', 'NETLOANS', 'EQ', 'NETINC', 'ROA', 'ROE',
  'OFFDOM', 'NAMEHCR', 'HCTMULT', 'BKCLASS', 'WEBADDR', 'ESTYMD',
  'REGAGENT', 'LATITUDE', 'LONGITUDE', 'NUMEMP', 'LNCRCD',
  'STNAME', 'ACTIVE',
  // Income statement fields (for Sankey / Waterfall visualizations)
  'INTINC',   // Interest income
  'NONII',    // Non-interest income
  'EINTEXP',  // Interest expense
  'ELNATR',   // Non-interest expense
  'ELNANTR',  // Provision for loan losses
  // Asset breakdown fields (for $1-of-assets treemap)
  'SC',       // Securities
  'LNRE',     // Real estate loans
  'LNCI',     // Commercial & industrial loans
  'LNCON',    // Consumer loans
  'LNAG',     // Agricultural loans
  // Charge-offs
  'NCLNLS',   // Net charge-offs
].join(',');

export default apiHandler({ methods: ['POST'] }, async (req: VercelRequest, res: VercelResponse) => {
  // Verify cron secret
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const supabase = getSupabase();

  // Create sync job record
  const { data: job } = await supabase
    .from('sync_jobs')
    .insert({ source: 'fdic', status: 'running', started_at: new Date().toISOString() })
    .select()
    .single();

  try {
    // Determine the latest FDIC reporting date
    const latestRes = await fetch(
      `${FDIC_API}/financials?fields=REPDTE&sort_by=REPDTE&sort_order=DESC&limit=1`
    );
    if (!latestRes.ok) {
      throw new Error(`FDIC API returned ${latestRes.status} when fetching latest date`);
    }
    const latestData = await latestRes.json();
    const latestDate = latestData.data?.[0]?.data?.REPDTE;

    if (!latestDate) {
      throw new Error('Could not determine latest FDIC reporting date');
    }

    // Fetch all institutions for the latest reporting period (paginated)
    let offset = 0;
    const limit = 10000;
    let allRecords: any[] = [];

    while (true) {
      const url = `${FDIC_API}/financials?filters=REPDTE:${latestDate}&fields=${FIELDS}&limit=${limit}&offset=${offset}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`FDIC API returned ${response.status} at offset ${offset}`);
      }
      const data = await response.json();

      if (!data.data || data.data.length === 0) break;
      allRecords = allRecords.concat(data.data);

      if (data.data.length < limit) break;
      offset += limit;
    }

    // Map FDIC records to our institutions schema
    const institutions = allRecords.map((record: any) => {
      const d = record.data;
      return {
        cert_number: Number(d.CERT),
        source: 'fdic' as const,
        name: d.INSTNAME || '',
        city: d.CITY || null,
        state: d.STALP || null,
        zip: d.ZIP || null,
        county: d.COUNTY || null,
        latitude: d.LATITUDE ? Number(d.LATITUDE) : null,
        longitude: d.LONGITUDE ? Number(d.LONGITUDE) : null,
        website: d.WEBADDR || null,
        established_date: d.ESTYMD || null,
        regulator: d.REGAGENT || null,
        holding_company: d.NAMEHCR || null,
        holding_company_id: d.HCTMULT || null,
        total_assets: d.ASSET ? Number(d.ASSET) * 1000 : null,
        total_deposits: d.DEP ? Number(d.DEP) * 1000 : null,
        total_loans: d.NETLOANS ? Number(d.NETLOANS) * 1000 : null,
        num_branches: d.OFFDOM ? Number(d.OFFDOM) : null,
        num_employees: d.NUMEMP ? Number(d.NUMEMP) : null,
        roi: d.ROE ? Number(d.ROE) : null,
        roa: d.ROA ? Number(d.ROA) : null,
        equity_capital: d.EQ ? Number(d.EQ) * 1000 : null,
        net_income: d.NETINC ? Number(d.NETINC) * 1000 : null,
        credit_card_loans: d.LNCRCD ? Number(d.LNCRCD) * 1000 : null,
        charter_type: mapCharterType(d.BKCLASS),
        active: d.ACTIVE !== '0',
        data_as_of: formatRepdteToDate(latestDate),
        last_synced_at: new Date().toISOString(),
      };
    });

    // Upsert into institutions table in batches of 500
    let processed = 0;
    const errors: string[] = [];

    for (let i = 0; i < institutions.length; i += 500) {
      const batch = institutions.slice(i, i + 500);
      const { error } = await supabase
        .from('institutions')
        .upsert(batch, { onConflict: 'cert_number' });

      if (error) {
        errors.push(`Batch at offset ${i}: ${error.message}`);
        continue;
      }
      processed += batch.length;
    }

    if (errors.length > 0 && processed === 0) {
      throw new Error(`All batches failed. First error: ${errors[0]}`);
    }

    // Build financial_history records keyed by cert_number
    const historyRecords = allRecords.map((record: any) => {
      const d = record.data;
      return {
        cert_number: Number(d.CERT),
        period: formatRepdteToDate(latestDate),
        total_assets: d.ASSET ? Number(d.ASSET) * 1000 : null,
        total_deposits: d.DEP ? Number(d.DEP) * 1000 : null,
        total_loans: d.NETLOANS ? Number(d.NETLOANS) * 1000 : null,
        net_income: d.NETINC ? Number(d.NETINC) * 1000 : null,
        equity_capital: d.EQ ? Number(d.EQ) * 1000 : null,
        roa: d.ROA ? Number(d.ROA) : null,
        roi: d.ROE ? Number(d.ROE) : null,
        credit_card_loans: d.LNCRCD ? Number(d.LNCRCD) * 1000 : null,
      };
    });

    // Upsert financial_history in batches (on cert_number + period conflict)
    let historyProcessed = 0;
    for (let i = 0; i < historyRecords.length; i += 500) {
      const batch = historyRecords.slice(i, i + 500);
      const { error } = await supabase
        .from('financial_history')
        .upsert(batch, { onConflict: 'cert_number,period' });

      if (error) {
        console.error(`Financial history batch error at offset ${i}:`, error.message);
        continue;
      }
      historyProcessed += batch.length;
    }

    // Update sync job as completed
    await supabase
      .from('sync_jobs')
      .update({
        status: 'completed',
        records_processed: processed,
        completed_at: new Date().toISOString(),
      })
      .eq('id', job?.id);

    return res.json({
      success: true,
      records_processed: processed,
      history_records_processed: historyProcessed,
      reporting_date: latestDate,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('FDIC sync failed:', error);

    // Update sync job with error
    if (job?.id) {
      await supabase
        .from('sync_jobs')
        .update({
          status: 'failed',
          error: error.message,
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.id);
    }

    throw error;
  }
});

function mapCharterType(bkclass: string | null): string {
  switch (bkclass) {
    case 'N':
    case 'SM':
    case 'NM':
      return 'commercial';
    case 'SB':
      return 'savings';
    case 'SA':
      return 'savings_association';
    case 'OI':
      return 'other';
    default:
      return 'other';
  }
}

function formatRepdteToDate(repdte: string): string {
  // FDIC format: YYYYMMDD -> YYYY-MM-DD
  if (repdte.length === 8) {
    return `${repdte.slice(0, 4)}-${repdte.slice(4, 6)}-${repdte.slice(6, 8)}`;
  }
  return repdte;
}
