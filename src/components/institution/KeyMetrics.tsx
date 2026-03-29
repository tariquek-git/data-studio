import { Info } from 'lucide-react';
import { Card } from '@/components/ui';
import { formatPercent } from '@/lib/format';
import type { Institution } from '@/types/institution';

interface KeyMetricsProps {
  raw: Record<string, unknown> | null;
  institution: Institution;
}

function getRaw(raw: Record<string, unknown> | null, field: string): number | null {
  if (!raw || raw[field] == null) return null;
  const v = Number(raw[field]);
  return isNaN(v) ? null : v * 1000; // FDIC values in thousands
}

type ColorClass = 'green' | 'amber' | 'red' | 'blue';

interface MetricConfig {
  label: string;
  value: number | null;
  color: ColorClass;
  info: string;
  benchmark: string;
}

function nimColor(v: number): ColorClass {
  if (v < 2) return 'red';
  if (v <= 4) return 'green';
  return 'amber'; // > 4.5% credit card outlier
}

function efficiencyColor(v: number): ColorClass {
  if (v < 50) return 'green';
  if (v < 65) return 'blue' as ColorClass;
  if (v < 80) return 'amber';
  return 'red';
}

function cofColor(v: number): ColorClass {
  if (v < 1) return 'green';
  if (v <= 2.5) return 'amber';
  return 'red';
}

function chargeOffColor(v: number): ColorClass {
  if (v < 0.3) return 'green';
  if (v <= 1) return 'amber';
  return 'red';
}

function equityColor(v: number): ColorClass {
  if (v < 8) return 'red';
  if (v <= 12) return 'green';
  return 'blue' as ColorClass;
}

const colorStyles: Record<ColorClass, { dot: string; text: string; bg: string }> = {
  green: { dot: 'bg-green-500', text: 'text-green-700', bg: 'bg-green-50' },
  amber: { dot: 'bg-amber-400', text: 'text-amber-700', bg: 'bg-amber-50' },
  red:   { dot: 'bg-red-500',   text: 'text-red-700',   bg: 'bg-red-50'   },
  blue:  { dot: 'bg-blue-500',  text: 'text-blue-700',  bg: 'bg-blue-50'  },
};

const colorLabels: Record<ColorClass, string> = {
  green: 'Healthy',
  amber: 'Watch',
  red:   'Concern',
  blue:  'Strong',
};

function MetricCard({ label, value, color, info, benchmark }: MetricConfig) {
  const styles = colorStyles[color];
  return (
    <div className={`rounded-xl border border-surface-200 p-4 ${styles.bg}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-xs font-semibold text-surface-600 leading-tight">{label}</span>
        <div className="group relative shrink-0">
          <Info className="h-3.5 w-3.5 text-surface-400 cursor-help mt-0.5" />
          <div className="absolute right-0 top-5 z-10 hidden group-hover:block w-52 bg-surface-900 text-white text-xs rounded-lg p-2.5 shadow-lg">
            <p className="mb-1">{info}</p>
            <p className="text-surface-300">Benchmark: {benchmark}</p>
          </div>
        </div>
      </div>
      {value != null ? (
        <>
          <p className={`text-2xl font-bold ${styles.text}`}>
            {formatPercent(value, 2)}
          </p>
          <div className="flex items-center gap-1.5 mt-2">
            <span className={`w-2 h-2 rounded-full ${styles.dot} shrink-0`} />
            <span className={`text-xs font-medium ${styles.text}`}>{colorLabels[color]}</span>
          </div>
          <p className="text-xs text-surface-400 mt-1">{benchmark}</p>
        </>
      ) : (
        <p className="text-sm text-surface-400 mt-1">Data not available</p>
      )}
    </div>
  );
}

export function KeyMetrics({ raw, institution }: KeyMetricsProps) {
  // Pull raw FDIC fields (already multiplied by 1000 via getRaw)
  const INTINC   = getRaw(raw, 'INTINC');
  const EINTEXP  = getRaw(raw, 'EINTEXP');
  const ASSET    = institution.total_assets;
  const NETLOANS = institution.total_loans;
  const SC       = getRaw(raw, 'SC');
  const DEP      = institution.total_deposits;
  const ELNANTR  = getRaw(raw, 'ELNANTR');
  const NONII    = getRaw(raw, 'NONII');
  const NCLNLS   = getRaw(raw, 'NCLNLS');
  const EQ       = institution.equity_capital;
  // CFA-standard fields: use earning assets for NIM, NPAM for Texas Ratio
  const ERNAST   = getRaw(raw, 'ERNAST');  // Earning assets (loans + securities + interest-bearing deposits)
  const NIMY     = getRaw(raw, 'NIMY');    // FDIC pre-computed NIM (uses avg earning assets) — stored as % already, divide by 100

  // NIM: use FDIC pre-computed NIMY if available (already uses avg earning assets),
  // else compute from ERNAST, else fall back to ASSET (documented underestimate)
  const nim: number | null = (() => {
    if (NIMY != null) return NIMY / 1000; // NIMY stored as % × 1000 via getRaw; undo extra ×1000
    const ea = ERNAST ?? ASSET;
    if (INTINC != null && EINTEXP != null && ea) return ((INTINC - EINTEXP) / ea) * 100;
    return null;
  })();

  // Net Interest Spread: yield on earning assets minus cost of deposits
  // Use ERNAST as earning asset denominator (CFA standard)
  const netInterestSpread: number | null = (() => {
    const ea = ERNAST ?? (NETLOANS != null && SC != null ? NETLOANS + SC : null);
    if (INTINC != null && ea && EINTEXP != null && DEP)
      return (INTINC / ea) * 100 - (EINTEXP / DEP) * 100;
    return null;
  })();

  const costOfFunds: number | null =
    EINTEXP != null && DEP
      ? (EINTEXP / DEP) * 100
      : null;

  const efficiencyRatio: number | null =
    ELNANTR != null && ELNANTR > 0 && INTINC != null && EINTEXP != null && NONII != null
      ? ( ELNANTR / (INTINC - EINTEXP + NONII)) * 100
      : null;

  const chargeOffRate: number | null =
    NCLNLS != null && NETLOANS
      ? (NCLNLS / NETLOANS) * 100
      : null;

  const equityRatio: number | null =
    EQ != null && ASSET
      ? (EQ / ASSET) * 100
      : null;

  const metrics: MetricConfig[] = [
    {
      label: 'Net Interest Margin (NIM)',
      value: nim,
      color: nim != null ? nimColor(nim) : 'amber',
      info: 'Net interest income (interest earned minus interest paid) as a % of earning assets. Uses FDIC pre-computed NIMY (avg earning assets) when available.',
      benchmark: '< 2% = concern, 2–4% = healthy, > 4.5% = outlier (CC banks)',
    },
    {
      label: 'Net Interest Spread',
      value: netInterestSpread,
      color: netInterestSpread != null ? nimColor(netInterestSpread) : 'amber',
      info: 'Yield on earning assets minus cost of funds. Measures the spread between what the bank earns and pays.',
      benchmark: 'Higher is better; typically 2–4%',
    },
    {
      label: 'Cost of Funds',
      value: costOfFunds,
      color: costOfFunds != null ? cofColor(costOfFunds) : 'amber',
      info: 'Interest expense as a % of total deposits. Measures how much it costs the bank to raise funding.',
      benchmark: '< 1% = green, 1–2.5% = watch, > 2.5% = concern',
    },
    {
      label: 'Efficiency Ratio',
      value: efficiencyRatio,
      color: efficiencyRatio != null ? efficiencyColor(efficiencyRatio) : 'amber',
      info: 'Non-interest expense as % of net revenue. Lower = more efficient. Below 50% is excellent.',
      benchmark: '< 50% excellent, 50–65% good, 65–80% average, > 80% poor',
    },
    {
      label: 'Net Charge-off Rate',
      value: chargeOffRate,
      color: chargeOffRate != null ? chargeOffColor(chargeOffRate) : 'amber',
      info: 'Net charge-offs (loans written off minus recoveries) as % of net loans. Measures credit loss experience.',
      benchmark: '< 0.3% = excellent, 0.3–1% = watch, > 1% = elevated',
    },
    {
      label: 'Equity Ratio (Leverage)',
      value: equityRatio,
      color: equityRatio != null ? equityColor(equityRatio) : 'amber',
      info: 'Equity capital as % of total assets. Simple leverage measure — higher means more cushion against losses.',
      benchmark: '< 8% = near minimum, 8–12% = adequate, > 12% = well-capitalized',
    },
  ];

  return (
    <Card>
      <h3 className="text-sm font-semibold text-surface-700 mb-4">Key Performance Metrics</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {metrics.map((m) => (
          <MetricCard key={m.label} {...m} />
        ))}
      </div>
    </Card>
  );
}
