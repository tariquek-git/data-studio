/**
 * QA validation endpoint — compares stored institution data against live FDIC API.
 *
 * GET /api/qa/check?cert={certNumber}   — check one institution by FDIC cert
 * GET /api/qa/check?sample=20           — check a random sample of N institutions
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { apiHandler } from '../../lib/api-handler.js';
import { getSupabase } from '../../lib/supabase.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FdicFinancialsRaw {
  CERT: number;
  ASSET: number;    // thousands
  DEP: number;      // thousands
  NETLOANS: number; // thousands
  EQ: number;       // thousands
  NETINC: number;   // thousands
  ROA: number;      // already a percentage
  ROE: number;      // already a percentage
  INTINC: number;   // thousands
  NONII: number;    // thousands
  EINTEXP: number;  // thousands
  ELNANTR: number;  // thousands (total noninterest expense)
  ERNAST: number;   // thousands (earning assets — NIM denominator)
  NIMY: number;     // already a percentage (FDIC pre-computed NIM)
  NUMEMP: number;
  OFFDOM: number;
  REPDTE: string;
}

export type CheckSeverity = 'ok' | 'warning' | 'error' | 'info';

export interface FieldCheck {
  field: string;
  label: string;
  stored_value: number | null;
  fdic_value: number | null;
  pct_diff: number | null;   // (stored - fdic) / fdic * 100
  severity: CheckSeverity;
  message: string;
}

export interface SanityCheck {
  check: string;
  value: number | null;
  passed: boolean;
  severity: CheckSeverity;
  message: string;
}

export interface DerivedMetric {
  metric: string;
  label: string;
  formula: string;
  computed_value: number | null;
  stored_value: number | null;
  pct_diff: number | null;
  severity: CheckSeverity;
  step_by_step: string;
}

export interface InstitutionQAResult {
  cert_number: number;
  name: string;
  data_as_of: string | null;
  fdic_report_date: string | null;
  overall_severity: CheckSeverity;
  error?: string;
  field_checks: FieldCheck[];
  derived_metrics: DerivedMetric[];
  sanity_checks: SanityCheck[];
  fdic_sdi_url: string;
  checked_at: string;
}

export interface QACheckResponse {
  mode: 'single' | 'sample';
  total_checked: number;
  pass_count: number;
  warning_count: number;
  error_count: number;
  results: InstitutionQAResult[];
  checked_at: string;
}

// ─── FDIC fetch ───────────────────────────────────────────────────────────────

const FDIC_FIELDS = [
  'CERT', 'ASSET', 'DEP', 'NETLOANS', 'EQ', 'NETINC',
  'ROA', 'ROE', 'INTINC', 'NONII', 'EINTEXP', 'ELNANTR',
  'ERNAST', 'NIMY',
  'NUMEMP', 'OFFDOM', 'REPDTE',
].join(',');

async function fetchFdicFinancials(cert: number): Promise<FdicFinancialsRaw | null> {
  const url =
    `https://banks.data.fdic.gov/api/financials` +
    `?filters=CERT:${cert}` +
    `&fields=${FDIC_FIELDS}` +
    `&sort_by=REPDTE&sort_order=DESC&limit=1`;

  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) return null;

  const json = await res.json() as { data?: Array<{ data: FdicFinancialsRaw }> };
  if (!json.data || json.data.length === 0) return null;

  return json.data[0].data;
}

// ─── Comparison helpers ───────────────────────────────────────────────────────

function pctDiff(stored: number | null, reference: number | null): number | null {
  if (stored == null || reference == null || reference === 0) return null;
  return ((stored - reference) / Math.abs(reference)) * 100;
}

function severityFromPctDiff(diff: number | null): CheckSeverity {
  if (diff == null) return 'info';
  const abs = Math.abs(diff);
  if (abs > 5) return 'error';
  if (abs > 1) return 'warning';
  return 'ok';
}

function buildFieldCheck(
  field: string,
  label: string,
  storedValue: number | null,
  fdicRawThousands: number | null,
): FieldCheck {
  const fdicDollars = fdicRawThousands != null ? fdicRawThousands * 1000 : null;
  const diff = pctDiff(storedValue, fdicDollars);
  const severity = severityFromPctDiff(diff);

  let message: string;
  if (storedValue == null) {
    message = 'No stored value';
  } else if (fdicDollars == null) {
    message = 'FDIC value not available';
  } else if (severity === 'ok') {
    message = `Within 1% of FDIC (${diff != null ? diff.toFixed(2) : '?'}%)`;
  } else {
    message = `${Math.abs(diff ?? 0).toFixed(1)}% ${(diff ?? 0) > 0 ? 'above' : 'below'} FDIC value`;
  }

  return { field, label, stored_value: storedValue, fdic_value: fdicDollars, pct_diff: diff, severity, message };
}

function buildRatioCheck(
  field: string,
  label: string,
  storedValue: number | null,
  fdicValue: number | null, // already a percentage from FDIC
): FieldCheck {
  const diff = pctDiff(storedValue, fdicValue);
  const severity = severityFromPctDiff(diff);

  let message: string;
  if (storedValue == null) {
    message = 'No stored value';
  } else if (fdicValue == null) {
    message = 'FDIC value not available';
  } else if (severity === 'ok') {
    message = `Within 1% of FDIC (diff: ${diff != null ? diff.toFixed(2) : '?'}%)`;
  } else {
    message = `${Math.abs(diff ?? 0).toFixed(2)}pp ${(diff ?? 0) > 0 ? 'above' : 'below'} FDIC`;
  }

  return { field, label, stored_value: storedValue, fdic_value: fdicValue, pct_diff: diff, severity, message };
}

// ─── Derived metrics ──────────────────────────────────────────────────────────

function computeDerivedMetrics(
  inst: Record<string, unknown>,
  f: FdicFinancialsRaw,
): DerivedMetric[] {
  const rawData = (inst.raw_data as Record<string, unknown> | null) ?? {};

  // Helper to pull raw_data field (stored in thousands, convert to dollars)
  const raw = (key: string): number | null => {
    const v = rawData[key];
    return v != null ? Number(v) * 1000 : null;
  };

  const intInc = f.INTINC * 1000;
  const eIntExp = f.EINTEXP * 1000;
  const nonII = f.NONII * 1000;
  const elNaTr = f.ELNANTR * 1000;
  const asset = f.ASSET * 1000;
  // Use earning assets (ERNAST) for NIM denominator per CFA standard; fall back to total assets
  const ernast = f.ERNAST > 0 ? f.ERNAST * 1000 : asset;
  // Use FDIC pre-computed NIMY (uses avg earning assets) if available
  const nim_computed: number | null = f.NIMY > 0 ? f.NIMY : (ernast > 0 ? ((intInc - eIntExp) / ernast) * 100 : null);

  const nim_numerator = intInc - eIntExp;
  // Stored value: prefer NIMY raw field, then ERNAST-based, then ASSET-based
  const nim_stored_nimy = raw('NIMY');
  const nim_stored_intInc = raw('INTINC');
  const nim_stored_eIntExp = raw('EINTEXP');
  const nim_stored_ernast = raw('ERNAST');
  const nim_stored_asset = raw('ASSET') ?? (inst.total_assets as number | null);
  const nim_ea = nim_stored_ernast ?? nim_stored_asset;
  const nim_stored: number | null =
    nim_stored_nimy != null
      ? nim_stored_nimy / 1000  // undo extra ×1000 from raw() helper
      : nim_stored_intInc != null && nim_stored_eIntExp != null && nim_ea != null && nim_ea > 0
        ? ((nim_stored_intInc - nim_stored_eIntExp) / nim_ea) * 100
        : null;

  const effDenom = nim_numerator + nonII;
  const eff_computed = effDenom !== 0 ? (elNaTr / effDenom) * 100 : null;
  const eff_stored_intInc = raw('INTINC');
  const eff_stored_eIntExp = raw('EINTEXP');
  const eff_stored_nonII = raw('NONII');
  const eff_stored_elNaTr = raw('ELNANTR');
  const eff_denom_stored =
    eff_stored_intInc != null && eff_stored_eIntExp != null && eff_stored_nonII != null
      ? (eff_stored_intInc - eff_stored_eIntExp) + eff_stored_nonII
      : null;
  const eff_stored: number | null =
    eff_stored_elNaTr != null && eff_denom_stored != null && eff_denom_stored !== 0
      ? (eff_stored_elNaTr / eff_denom_stored) * 100
      : null;

  const ltd_netLoans = f.NETLOANS * 1000;
  const ltd_dep = f.DEP * 1000;
  const ltd_computed = ltd_dep > 0 ? (ltd_netLoans / ltd_dep) * 100 : null;
  const ltd_stored_loans = inst.total_loans as number | null;
  const ltd_stored_dep = inst.total_deposits as number | null;
  const ltd_stored: number | null =
    ltd_stored_loans != null && ltd_stored_dep != null && ltd_stored_dep > 0
      ? (ltd_stored_loans / ltd_stored_dep) * 100
      : null;

  function metricSeverity(d: number | null): CheckSeverity {
    return severityFromPctDiff(d);
  }

  return [
    {
      metric: 'nim',
      label: 'Net Interest Margin (NIM)',
      formula: 'NIMY (FDIC pre-computed, avg earning assets) — or (INTINC - EINTEXP) / ERNAST × 100',
      computed_value: nim_computed,
      stored_value: nim_stored,
      pct_diff: pctDiff(nim_stored, nim_computed),
      severity: metricSeverity(pctDiff(nim_stored, nim_computed)),
      step_by_step:
        nim_computed != null
          ? f.NIMY > 0
            ? `NIMY (FDIC pre-computed) = ${nim_computed.toFixed(3)}%`
            : `($${(intInc / 1e6).toFixed(1)}M INTINC - $${(eIntExp / 1e6).toFixed(1)}M EINTEXP) / $${(ernast / 1e9).toFixed(2)}B ERNAST × 100 = ${nim_computed.toFixed(3)}%`
          : 'Could not compute — missing FDIC data',
    },
    {
      metric: 'efficiency_ratio',
      label: 'Efficiency Ratio',
      formula: 'Non-Interest Expense / (Net Interest Income + Non-Interest Income) × 100',
      computed_value: eff_computed,
      stored_value: eff_stored,
      pct_diff: pctDiff(eff_stored, eff_computed),
      severity: metricSeverity(pctDiff(eff_stored, eff_computed)),
      step_by_step:
        eff_computed != null
          ? `$${(elNaTr / 1e6).toFixed(1)}M ELNANTR / ($${(nim_numerator / 1e6).toFixed(1)}M NIM + $${(nonII / 1e6).toFixed(1)}M NONII) × 100 = ${eff_computed.toFixed(2)}%`
          : 'Could not compute — missing FDIC data',
    },
    {
      metric: 'loan_to_deposit',
      label: 'Loan-to-Deposit Ratio',
      formula: 'Net Loans / Total Deposits × 100',
      computed_value: ltd_computed,
      stored_value: ltd_stored,
      pct_diff: pctDiff(ltd_stored, ltd_computed),
      severity: metricSeverity(pctDiff(ltd_stored, ltd_computed)),
      step_by_step:
        ltd_computed != null
          ? `$${(ltd_netLoans / 1e9).toFixed(2)}B NETLOANS / $${(ltd_dep / 1e9).toFixed(2)}B DEP × 100 = ${ltd_computed.toFixed(2)}%`
          : 'Could not compute — missing FDIC data',
    },
  ];
}

// ─── Sanity checks ────────────────────────────────────────────────────────────

function runSanityChecks(
  inst: Record<string, unknown>,
  f: FdicFinancialsRaw,
): SanityCheck[] {
  const checks: SanityCheck[] = [];

  // ROA reasonable? (H.8-calibrated: 0–1.5% normal, >3% hard flag; source: FDIC QBP Q4 2025)
  const roa = inst.roa as number | null;
  checks.push({
    check: 'roa_range',
    value: roa,
    passed: roa != null && roa >= -1 && roa <= 3,
    severity: roa == null ? 'info' : roa != null && (roa < -1 || roa > 3) ? 'error' : roa != null && (roa < 0 || roa > 1.5) ? 'warning' : 'ok',
    message:
      roa == null
        ? 'ROA not stored'
        : roa >= 0 && roa <= 1.5
        ? `ROA ${roa.toFixed(2)}% is within normal range (0–1.5%)`
        : roa > 1.5 && roa <= 3
        ? `ROA ${roa.toFixed(2)}% is elevated — verify business model (credit card, specialty charter?)`
        : roa > 3
        ? `ROA ${roa.toFixed(2)}% exceeds hard-flag threshold (>3%) — validate data`
        : roa < -1
        ? `ROA ${roa.toFixed(2)}% is critically negative — validate for one-time charges`
        : `ROA ${roa.toFixed(2)}% is below normal range`,
  });

  // ROE reasonable? (Fed H.8 calibrated: 5–15% normal, >40% hard flag)
  const roe = inst.roi as number | null;
  checks.push({
    check: 'roe_range',
    value: roe,
    passed: roe != null && roe >= -20 && roe <= 40,
    severity: roe == null ? 'info' : roe != null && (roe < -20 || roe > 40) ? 'error' : roe != null && (roe < 0 || roe > 25) ? 'warning' : 'ok',
    message:
      roe == null
        ? 'ROE not stored'
        : roe >= 0 && roe <= 25
        ? `ROE ${roe.toFixed(2)}% is within normal range (0–25%)`
        : roe > 25 && roe <= 40
        ? `ROE ${roe.toFixed(2)}% is elevated — check equity base for thin capital`
        : roe > 40
        ? `ROE ${roe.toFixed(2)}% exceeds hard-flag threshold (>40%) — validate equity denominator`
        : `ROE ${roe.toFixed(2)}% is negative — review for losses`,
  });

  // Equity positive?
  const eq = inst.equity_capital as number | null;
  checks.push({
    check: 'positive_equity',
    value: eq,
    passed: eq != null && eq > 0,
    severity: eq == null ? 'info' : eq > 0 ? 'ok' : 'error',
    message:
      eq == null
        ? 'Equity capital not stored'
        : eq > 0
        ? `Equity capital is positive ($${(eq / 1e6).toFixed(1)}M)`
        : `Negative equity capital — distressed institution ($${(eq / 1e6).toFixed(1)}M)`,
  });

  // NIM (H.8-calibrated post-2022: 2.5–4.5% normal, >7% hard flag; credit card banks legitimately 6–8%)
  // Use NIMY (FDIC pre-computed, avg earning assets) if available; else ERNAST-based; else total assets fallback
  const nim_ea = f.ERNAST > 0 ? f.ERNAST : f.ASSET;
  const nim = f.NIMY > 0 ? f.NIMY : (nim_ea > 0 ? ((f.INTINC - f.EINTEXP) / nim_ea) * 100 : null);
  checks.push({
    check: 'nim_range',
    value: nim,
    passed: nim != null && nim >= 1 && nim <= 7,
    severity: nim == null ? 'info' : nim != null && (nim < 1 || nim > 7) ? 'error' : nim != null && (nim < 2.5 || nim > 4.5) ? 'warning' : 'ok',
    message:
      nim == null
        ? 'Cannot compute NIM from FDIC data'
        : nim >= 2.5 && nim <= 4.5
        ? `NIM ${nim.toFixed(2)}% is within normal range (2.5%–4.5%)`
        : nim > 4.5 && nim <= 7
        ? `NIM ${nim.toFixed(2)}% is elevated — typical of credit card or subprime lenders`
        : nim > 7
        ? `NIM ${nim.toFixed(2)}% exceeds hard-flag threshold (>7%) — validate data`
        : `NIM ${nim.toFixed(2)}% is below normal range — custody/online bank?`,
  });

  // Loan-to-deposit 10%–200%?
  const ltd = f.DEP > 0 ? (f.NETLOANS / f.DEP) * 100 : null;
  checks.push({
    check: 'loan_to_deposit_range',
    value: ltd,
    passed: ltd != null && ltd >= 10 && ltd <= 200,
    severity: ltd == null ? 'info' : ltd >= 10 && ltd <= 200 ? 'ok' : 'warning',
    message:
      ltd == null
        ? 'Cannot compute loan-to-deposit from FDIC data'
        : ltd >= 10 && ltd <= 200
        ? `Loan-to-deposit ${ltd.toFixed(1)}% is within normal range (10%–200%)`
        : `Loan-to-deposit ${ltd.toFixed(1)}% is outside normal range (10%–200%)`,
  });

  // Data freshness — within last 6 months?
  const dataAsOf = inst.data_as_of as string | null;
  let freshnessPass = false;
  if (dataAsOf) {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    freshnessPass = new Date(dataAsOf) >= sixMonthsAgo;
  }
  checks.push({
    check: 'data_freshness',
    value: null,
    passed: freshnessPass,
    severity: dataAsOf == null ? 'info' : freshnessPass ? 'ok' : 'warning',
    message: dataAsOf
      ? freshnessPass
        ? `Data is current (as of ${dataAsOf})`
        : `Data may be stale — last updated ${dataAsOf}`
      : 'No data_as_of date recorded',
  });

  return checks;
}

// ─── Roll-up severity ─────────────────────────────────────────────────────────

function rollupSeverity(
  fieldChecks: FieldCheck[],
  derivedMetrics: DerivedMetric[],
  sanityChecks: SanityCheck[],
): CheckSeverity {
  const all: CheckSeverity[] = [
    ...fieldChecks.map((c) => c.severity),
    ...derivedMetrics.map((m) => m.severity),
    ...sanityChecks.map((s) => s.severity),
  ];
  if (all.includes('error')) return 'error';
  if (all.includes('warning')) return 'warning';
  return 'ok';
}

// ─── Single institution QA ────────────────────────────────────────────────────

async function checkInstitution(
  inst: Record<string, unknown>,
): Promise<InstitutionQAResult> {
  const cert = inst.cert_number as number;
  const name = inst.name as string;
  const dataAsOf = inst.data_as_of as string | null;
  const checkedAt = new Date().toISOString();
  const fdicSdiUrl = `https://banks.data.fdic.gov/api/summary?filters=CERT:${cert}&fields=CERT,INSTNAME&sort_by=REPDTE&sort_order=DESC&limit=1`;

  let fdic: FdicFinancialsRaw | null;
  try {
    fdic = await fetchFdicFinancials(cert);
  } catch {
    return {
      cert_number: cert,
      name,
      data_as_of: dataAsOf,
      fdic_report_date: null,
      overall_severity: 'error',
      error: 'Failed to fetch FDIC data',
      field_checks: [],
      derived_metrics: [],
      sanity_checks: [],
      fdic_sdi_url: fdicSdiUrl,
      checked_at: checkedAt,
    };
  }

  if (!fdic) {
    return {
      cert_number: cert,
      name,
      data_as_of: dataAsOf,
      fdic_report_date: null,
      overall_severity: 'error',
      error: 'No FDIC financials found for this cert',
      field_checks: [],
      derived_metrics: [],
      sanity_checks: [],
      fdic_sdi_url: fdicSdiUrl,
      checked_at: checkedAt,
    };
  }

  const fieldChecks: FieldCheck[] = [
    buildFieldCheck('total_assets', 'Total Assets', inst.total_assets as number | null, fdic.ASSET),
    buildFieldCheck('total_deposits', 'Total Deposits', inst.total_deposits as number | null, fdic.DEP),
    buildFieldCheck('total_loans', 'Net Loans', inst.total_loans as number | null, fdic.NETLOANS),
    buildFieldCheck('equity_capital', 'Equity Capital', inst.equity_capital as number | null, fdic.EQ),
    buildFieldCheck('net_income', 'Net Income', inst.net_income as number | null, fdic.NETINC),
    buildRatioCheck('roa', 'Return on Assets (ROA)', inst.roa as number | null, fdic.ROA),
    buildRatioCheck('roi', 'Return on Equity (ROE)', inst.roi as number | null, fdic.ROE),
  ];

  const derivedMetrics = computeDerivedMetrics(inst, fdic);
  const sanityChecks = runSanityChecks(inst, fdic);
  const overallSeverity = rollupSeverity(fieldChecks, derivedMetrics, sanityChecks);

  return {
    cert_number: cert,
    name,
    data_as_of: dataAsOf,
    fdic_report_date: fdic.REPDTE ?? null,
    overall_severity: overallSeverity,
    field_checks: fieldChecks,
    derived_metrics: derivedMetrics,
    sanity_checks: sanityChecks,
    fdic_sdi_url: fdicSdiUrl,
    checked_at: checkedAt,
  };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default apiHandler({ methods: ['GET'] }, async (req: VercelRequest, res: VercelResponse) => {
  const supabase = getSupabase();

  const certParam = req.query.cert as string | undefined;
  const sampleParam = req.query.sample as string | undefined;

  let institutions: Record<string, unknown>[] = [];
  let mode: 'single' | 'sample' = 'single';

  if (certParam) {
    // Single institution lookup
    const cert = Number(certParam);
    if (!cert || isNaN(cert)) {
      return res.status(400).json({ error: 'Invalid cert parameter — must be a numeric FDIC cert number' });
    }

    const { data, error } = await supabase
      .from('institutions')
      .select('*')
      .eq('cert_number', cert)
      .eq('source', 'fdic')
      .single();

    if (error || !data) {
      return res.status(404).json({ error: `Institution with cert ${cert} not found in database` });
    }

    institutions = [data as Record<string, unknown>];
    mode = 'single';
  } else if (sampleParam) {
    // Random sample
    const n = Math.min(50, Math.max(1, Number(sampleParam) || 20));
    if (isNaN(n)) {
      return res.status(400).json({ error: 'Invalid sample parameter — must be a number' });
    }

    // Supabase doesn't have a built-in RANDOM() — use a random offset heuristic
    const { count } = await supabase
      .from('institutions')
      .select('*', { count: 'exact', head: true })
      .eq('source', 'fdic')
      .eq('active', true);

    const total = count ?? 0;
    const offset = total > n ? Math.floor(Math.random() * (total - n)) : 0;

    const { data, error } = await supabase
      .from('institutions')
      .select('*')
      .eq('source', 'fdic')
      .eq('active', true)
      .range(offset, offset + n - 1);

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch sample from database' });
    }

    institutions = (data ?? []) as Record<string, unknown>[];
    mode = 'sample';
  } else {
    return res.status(400).json({
      error: 'Provide ?cert={certNumber} or ?sample={n}',
      examples: ['/api/qa/check?cert=3511', '/api/qa/check?sample=20'],
    });
  }

  // Run checks in parallel (cap concurrency at 5 to avoid FDIC rate limits)
  const CONCURRENCY = 5;
  const results: InstitutionQAResult[] = [];

  for (let i = 0; i < institutions.length; i += CONCURRENCY) {
    const batch = institutions.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(checkInstitution));
    results.push(...batchResults);
  }

  const passCount = results.filter((r) => r.overall_severity === 'ok').length;
  const warningCount = results.filter((r) => r.overall_severity === 'warning').length;
  const errorCount = results.filter((r) => r.overall_severity === 'error').length;

  const response: QACheckResponse = {
    mode,
    total_checked: results.length,
    pass_count: passCount,
    warning_count: warningCount,
    error_count: errorCount,
    results,
    checked_at: new Date().toISOString(),
  };

  // No caching — always fresh for QA
  res.setHeader('Cache-Control', 'no-store');
  return res.json(response);
});
