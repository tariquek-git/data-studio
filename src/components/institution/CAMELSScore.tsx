import { Card } from '@/components/ui';
import type { Institution } from '@/types/institution';

interface CAMELSScoreProps {
  institution: Institution;
  raw: Record<string, unknown> | null;
}

function getRaw(raw: Record<string, unknown> | null, field: string): number | null {
  if (!raw || raw[field] == null) return null;
  const v = Number(raw[field]);
  return isNaN(v) ? null : v * 1000;
}

type Score = 1 | 2 | 3 | 4 | 5;

interface Component {
  id: string;
  label: string;
  fullLabel: string;
  score: Score | null;
  basis: string;
}

function scoreColor(s: Score): string {
  if (s <= 2) return 'bg-green-500';
  if (s === 3) return 'bg-amber-400';
  return 'bg-red-500';
}

function scoreTextColor(s: Score): string {
  if (s <= 2) return 'text-green-700';
  if (s === 3) return 'text-amber-700';
  return 'text-red-700';
}

function scoreBgColor(s: Score): string {
  if (s <= 2) return 'bg-green-50';
  if (s === 3) return 'bg-amber-50';
  return 'bg-red-50';
}

function scoreLabel(s: Score): string {
  const labels: Record<Score, string> = {
    1: 'Excellent',
    2: 'Good',
    3: 'Adequate',
    4: 'Marginal',
    5: 'Critical',
  };
  return labels[s];
}

// Capital: Equity/Assets
function capitalScore(equityRatio: number | null): Score | null {
  if (equityRatio == null) return null;
  if (equityRatio > 12)  return 1;
  if (equityRatio >= 10) return 2;
  if (equityRatio >= 8)  return 3;
  if (equityRatio >= 6)  return 4;
  return 5;
}

// Asset Quality: Charge-off rate
function assetScore(coRate: number | null): Score | null {
  if (coRate == null) return null;
  if (coRate < 0.2)  return 1;
  if (coRate < 0.5)  return 2;
  if (coRate < 1)    return 3;
  if (coRate < 2)    return 4;
  return 5;
}

// Management: Efficiency ratio
function mgmtScore(eff: number | null): Score | null {
  if (eff == null) return null;
  if (eff < 50)  return 1;
  if (eff < 60)  return 2;
  if (eff < 70)  return 3;
  if (eff < 80)  return 4;
  return 5;
}

// Earnings: ROA
function earningsScore(roa: number | null): Score | null {
  if (roa == null) return null;
  if (roa > 1.5)  return 1;
  if (roa >= 1)   return 2;
  if (roa >= 0.5) return 3;
  if (roa >= 0)   return 4;
  return 5;
}

// Liquidity: Loan-to-deposit
function liquidityScore(ltd: number | null): Score | null {
  if (ltd == null) return null;
  if (ltd < 60)   return 1;
  if (ltd < 75)   return 2;
  if (ltd < 85)   return 3;
  if (ltd < 95)   return 4;
  return 5;
}

// Sensitivity: NIM
function sensitivityScore(nim: number | null): Score | null {
  if (nim == null) return null;
  if (nim > 3.5)  return 1;
  if (nim >= 3)   return 2;
  if (nim >= 2.5) return 3;
  if (nim >= 2)   return 4;
  return 5;
}

function ComponentRow({ comp }: { comp: Component }) {
  if (comp.score == null) {
    return (
      <div className="flex items-center gap-3 py-2">
        <div className="w-6 text-center">
          <span className="text-xs font-bold text-surface-300">{comp.id}</span>
        </div>
        <div className="w-24 shrink-0">
          <p className="text-xs font-medium text-surface-500">{comp.fullLabel}</p>
        </div>
        <div className="flex-1 h-2.5 rounded-full bg-surface-100" />
        <span className="text-xs text-surface-300 w-16 text-right">No data</span>
      </div>
    );
  }

  const pct = ((comp.score - 1) / 4) * 100; // score 1-5 → 0-100%

  return (
    <div className={`flex items-center gap-3 py-2 px-2 rounded-lg ${scoreBgColor(comp.score)}`}>
      <div className="w-6 text-center shrink-0">
        <span className={`text-xs font-bold ${scoreTextColor(comp.score)}`}>{comp.id}</span>
      </div>
      <div className="w-24 shrink-0">
        <p className="text-xs font-semibold text-surface-700">{comp.fullLabel}</p>
        <p className="text-xs text-surface-400">{comp.basis}</p>
      </div>
      <div className="flex-1">
        <div className="h-2.5 rounded-full bg-surface-200 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${scoreColor(comp.score)}`}
            style={{ width: `${Math.max(8, pct)}%` }}
          />
        </div>
      </div>
      <div className="w-20 text-right shrink-0">
        <span className={`text-xs font-bold ${scoreTextColor(comp.score)}`}>
          {comp.score} — {scoreLabel(comp.score)}
        </span>
      </div>
    </div>
  );
}

export function CAMELSScore({ institution, raw }: CAMELSScoreProps) {
  const INTINC   = getRaw(raw, 'INTINC');
  const EINTEXP  = getRaw(raw, 'EINTEXP');
  const ASSET    = institution.total_assets;
  const NETLOANS = institution.total_loans;
  const DEP      = institution.total_deposits;
  const ELNANTR  = getRaw(raw, 'ELNANTR');
  const NONII    = getRaw(raw, 'NONII');
  const NCLNLS   = getRaw(raw, 'NCLNLS');
  const EQ       = institution.equity_capital;
  const roa      = institution.roa;
  const ERNAST   = getRaw(raw, 'ERNAST');
  const NIMY     = getRaw(raw, 'NIMY');

  const equityRatio: number | null =
    EQ != null && ASSET ? (EQ / ASSET) * 100 : null;

  const chargeOffRate: number | null =
    NCLNLS != null && NETLOANS ? (NCLNLS / NETLOANS) * 100 : null;

  const efficiencyRatio: number | null =
    ELNANTR != null && INTINC != null && EINTEXP != null && NONII != null
      ? ( ELNANTR / (INTINC - EINTEXP + NONII)) * 100
      : null;

  const loanToDeposit: number | null =
    NETLOANS != null && DEP ? (NETLOANS / DEP) * 100 : null;

  // NIM: prefer FDIC pre-computed NIMY (uses avg earning assets), else compute from ERNAST
  const nim: number | null = (() => {
    if (NIMY != null) return NIMY / 1000; // NIMY stored as % × 1000 via getRaw; undo extra ×1000
    const ea = ERNAST ?? ASSET;
    if (INTINC != null && EINTEXP != null && ea) return ((INTINC - EINTEXP) / ea) * 100;
    return null;
  })();

  const components: Component[] = [
    {
      id: 'C',
      label: 'Capital',
      fullLabel: 'Capital',
      score: capitalScore(equityRatio),
      basis: 'Equity / Assets',
    },
    {
      id: 'A',
      label: 'Asset Quality',
      fullLabel: 'Asset Quality',
      score: assetScore(chargeOffRate),
      basis: 'Charge-off Rate',
    },
    {
      id: 'M',
      label: 'Management',
      fullLabel: 'Management',
      score: mgmtScore(efficiencyRatio),
      basis: 'Efficiency Ratio',
    },
    {
      id: 'E',
      label: 'Earnings',
      fullLabel: 'Earnings',
      score: earningsScore(roa),
      basis: 'Return on Assets',
    },
    {
      id: 'L',
      label: 'Liquidity',
      fullLabel: 'Liquidity',
      score: liquidityScore(loanToDeposit),
      basis: 'Loan / Deposit',
    },
    {
      id: 'S',
      label: 'Sensitivity',
      fullLabel: 'Sensitivity',
      score: sensitivityScore(nim),
      basis: 'Net Interest Margin',
    },
  ];

  const scoredComponents = components.filter((c) => c.score != null) as (Component & { score: Score })[];
  const compositeScore: number | null =
    scoredComponents.length > 0
      ? scoredComponents.reduce((sum, c) => sum + c.score, 0) / scoredComponents.length
      : null;

  const compositeRounded = compositeScore != null ? Math.round(compositeScore * 10) / 10 : null;
  const compositeScoreLabel =
    compositeScore == null ? null :
    compositeScore <= 1.5 ? 'Excellent' :
    compositeScore <= 2.5 ? 'Good' :
    compositeScore <= 3.5 ? 'Adequate' :
    compositeScore <= 4.5 ? 'Marginal' : 'Critical';

  const compositeColor =
    compositeScore == null ? 'text-surface-400' :
    compositeScore <= 2 ? 'text-green-700' :
    compositeScore <= 3 ? 'text-amber-700' : 'text-red-700';

  return (
    <Card>
      <div className="flex items-start justify-between mb-4 gap-4">
        <div>
          <h3 className="text-sm font-semibold text-surface-700">Approximate CAMELS Rating</h3>
          <p className="text-xs text-surface-400 mt-0.5">1 = Best, 5 = Worst</p>
        </div>
        {compositeRounded != null && (
          <div className="text-right shrink-0">
            <p className={`text-3xl font-bold ${compositeColor}`}>{compositeRounded.toFixed(1)}</p>
            <p className={`text-xs font-medium ${compositeColor}`}>{compositeScoreLabel}</p>
          </div>
        )}
      </div>

      <div className="space-y-1.5 mb-4">
        {components.map((comp) => (
          <ComponentRow key={comp.id} comp={comp} />
        ))}
      </div>

      {/* Score legend */}
      <div className="flex flex-wrap gap-3 mb-4">
        {[
          { color: 'bg-green-500', label: '1–2 Healthy' },
          { color: 'bg-amber-400', label: '3 Adequate' },
          { color: 'bg-red-500',   label: '4–5 Concern' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5 text-xs text-surface-500">
            <span className={`w-2.5 h-2.5 rounded-full ${color} inline-block`} />
            {label}
          </div>
        ))}
      </div>

      <div className="border-t border-surface-100 pt-3">
        <p className="text-xs text-surface-400 italic">
          This is an approximation from public FDIC data. Official CAMELS ratings are confidential
          and assigned by regulators following on-site examinations.
        </p>
      </div>
    </Card>
  );
}
