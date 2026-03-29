import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { Card } from '@/components/ui';
import type { Institution } from '@/types/institution';

interface AnomalyFlagsProps {
  institution: Institution;
  raw: Record<string, unknown> | null;
}

type Severity = 'info' | 'warning' | 'critical';

interface Anomaly {
  severity: Severity;
  message: string;
  detail: string;
}

interface Benchmarks {
  institution_count: number;
  roa: { mean: number | null; median: number | null; p25: number | null; p75: number | null };
  roe: { mean: number | null; median: number | null; p25: number | null; p75: number | null };
  equity_ratio: { mean: number | null; median: number | null };
  loan_to_deposit: { mean: number | null; median: number | null };
}

function getRaw(raw: Record<string, unknown> | null, field: string): number | null {
  if (!raw || raw[field] == null) return null;
  const v = Number(raw[field]);
  return isNaN(v) ? null : v * 1000; // FDIC values in thousands
}

async function fetchBenchmarks(): Promise<Benchmarks> {
  const res = await fetch('/api/analytics/benchmarks');
  if (!res.ok) throw new Error('Failed to load benchmarks');
  return res.json();
}

export function AnomalyFlags({ institution, raw }: AnomalyFlagsProps) {
  const { data: benchmarks } = useQuery({
    queryKey: ['industry-benchmarks'],
    queryFn: fetchBenchmarks,
    staleTime: 2 * 60 * 60 * 1000, // 2 hours
  });

  if (!benchmarks) return null;

  const anomalies: Anomaly[] = [];

  // 1. ROA anomaly
  const roa = institution.roa;
  if (roa != null) {
    if (benchmarks.roa.p75 != null && roa > benchmarks.roa.p75 * 2) {
      anomalies.push({
        severity: 'warning',
        message: 'Unusually high ROA vs. peers',
        detail: `ROA of ${roa.toFixed(2)}% is more than 2× the 75th percentile (${benchmarks.roa.p75.toFixed(2)}%) — verify loan mix or one-time items.`,
      });
    } else if (benchmarks.roa.p25 != null && roa < benchmarks.roa.p25 * 0.5 && roa < 0) {
      anomalies.push({
        severity: 'critical',
        message: 'Negative ROA — operating at a loss',
        detail: `ROA of ${roa.toFixed(2)}% indicates the institution is consuming capital, which raises solvency concerns over time.`,
      });
    }
  }

  // 2. Efficiency ratio from raw_data
  const ELNANTR = getRaw(raw, 'ELNANTR');
  const INTINC = getRaw(raw, 'INTINC');
  const EINTEXP = getRaw(raw, 'EINTEXP');
  const NONII = getRaw(raw, 'NONII');
  const netRevenue = INTINC != null && EINTEXP != null && NONII != null
    ? INTINC - EINTEXP + NONII
    : null;
  const efficiencyRatio = ELNANTR != null && netRevenue != null && netRevenue > 0
    ? (ELNANTR / netRevenue) * 100
    : null;
  if (efficiencyRatio != null && efficiencyRatio > 90) {
    anomalies.push({
      severity: 'warning',
      message: 'Very high cost structure (>90% efficiency ratio)',
      detail: `Efficiency ratio of ${efficiencyRatio.toFixed(1)}% means nearly all revenue is consumed by operating costs — leaving little margin for losses or reinvestment.`,
    });
  }

  // 3. Equity ratio
  const equity = institution.equity_capital;
  const assets = institution.total_assets;
  const equityRatio = equity != null && assets != null && assets > 0
    ? equity / assets
    : null;
  if (equityRatio != null) {
    if (equityRatio < 0.05) {
      anomalies.push({
        severity: 'critical',
        message: 'Low capital ratio (<5%) — regulatory minimum risk',
        detail: `Equity ratio of ${(equityRatio * 100).toFixed(1)}% is below the 5% threshold that regulators typically require for well-capitalized status.`,
      });
    } else if (equityRatio > 0.20) {
      anomalies.push({
        severity: 'info',
        message: 'Very high capital ratio — possible overcapitalized',
        detail: `Equity ratio of ${(equityRatio * 100).toFixed(1)}% is well above the industry norm, suggesting capital may be underdeployed relative to peers.`,
      });
    }
  }

  // 4. Loan concentration: real estate
  const LNRE = getRaw(raw, 'LNRE');
  if (LNRE != null && assets != null && assets > 0) {
    const reConcentration = LNRE / assets;
    if (reConcentration > 0.60) {
      anomalies.push({
        severity: 'warning',
        message: 'Heavy real estate loan concentration (>60% of assets)',
        detail: `Real estate loans represent ${(reConcentration * 100).toFixed(1)}% of total assets, concentrating credit risk in a single sector subject to cyclical downturns.`,
      });
    }
  }

  // 5. CC portfolio concentration
  const ccLoans = institution.credit_card_loans;
  if (ccLoans != null && assets != null && assets > 0) {
    const ccConcentration = ccLoans / assets;
    if (ccConcentration > 0.30) {
      anomalies.push({
        severity: 'warning',
        message: 'High credit card concentration (>30% of assets)',
        detail: `Credit card loans at ${(ccConcentration * 100).toFixed(1)}% of assets indicate elevated unsecured consumer credit risk compared to typical community banks.`,
      });
    }
  }

  // 6. NIM outlier
  const rawNIMY = raw ? Number(raw['NIMY']) : NaN;
  const nim = !isNaN(rawNIMY) && rawNIMY != null ? rawNIMY : null;
  if (nim != null) {
    if (nim > 6) {
      anomalies.push({
        severity: 'info',
        message: 'NIM above 6% is unusual — verify loan mix',
        detail: `NIM of ${nim.toFixed(2)}% is well above typical bank ranges (2–4%), which may reflect a high-yield consumer or credit card portfolio, or a data anomaly.`,
      });
    } else if (nim < 1 && institution.source === 'fdic') {
      anomalies.push({
        severity: 'warning',
        message: 'Very low NIM for a deposit-taking institution',
        detail: `NIM of ${nim.toFixed(2)}% is unusually low for an FDIC-insured institution, suggesting compressed lending spreads or significant interest expense relative to income.`,
      });
    }
  }

  if (anomalies.length === 0) return null;

  const severityOrder: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
  const sorted = [...anomalies].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  const severityConfig: Record<Severity, {
    bg: string;
    border: string;
    badgeBg: string;
    badgeText: string;
    icon: React.ElementType;
  }> = {
    critical: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      badgeBg: 'bg-red-100',
      badgeText: 'text-red-700',
      icon: AlertTriangle,
    },
    warning: {
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      badgeBg: 'bg-amber-100',
      badgeText: 'text-amber-700',
      icon: AlertCircle,
    },
    info: {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      badgeBg: 'bg-blue-100',
      badgeText: 'text-blue-700',
      icon: Info,
    },
  };

  return (
    <Card>
      <h3 className="text-sm font-semibold text-surface-700 mb-3 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        Statistical Flags
        <span className="text-xs font-normal text-surface-400 ml-1">
          {sorted.length} anomaly{sorted.length !== 1 ? 'ies' : ''} detected vs. industry benchmarks
        </span>
      </h3>
      <div className="flex flex-wrap gap-2">
        {sorted.map((anomaly, i) => {
          const cfg = severityConfig[anomaly.severity];
          const Icon = cfg.icon;
          return (
            <div
              key={i}
              className={`group relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium cursor-default ${cfg.badgeBg} ${cfg.badgeText} ${cfg.border}`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {anomaly.message}
              {/* Tooltip */}
              <div className={`absolute bottom-full left-0 mb-2 z-10 hidden group-hover:block w-64 rounded-lg border p-3 shadow-lg text-xs ${cfg.bg} ${cfg.border}`}>
                <p className={`font-semibold mb-1 ${cfg.badgeText}`}>{anomaly.message}</p>
                <p className="text-surface-600 leading-relaxed">{anomaly.detail}</p>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-surface-400 mt-3 border-t border-surface-100 pt-3">
        Flags are statistical heuristics vs. industry benchmarks — not regulatory assessments. Hover each flag for detail.
      </p>
    </Card>
  );
}
