import { CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { Card } from '@/components/ui';
import type { Institution } from '@/types/institution';

interface StrengthsFlagsProps {
  institution: Institution;
  raw: Record<string, unknown> | null;
}

function getRaw(raw: Record<string, unknown> | null, field: string): number | null {
  if (!raw || raw[field] == null) return null;
  const v = Number(raw[field]);
  return isNaN(v) ? null : v * 1000;
}

interface Flag {
  text: string;
}

function FlagItem({ text, type }: { text: string; type: 'green' | 'amber' | 'red' }) {
  const styles = {
    green: { icon: CheckCircle, iconClass: 'text-green-500', textClass: 'text-green-800', rowClass: 'bg-green-50' },
    amber: { icon: AlertTriangle, iconClass: 'text-amber-500', textClass: 'text-amber-800', rowClass: 'bg-amber-50' },
    red:   { icon: XCircle,       iconClass: 'text-red-500',   textClass: 'text-red-800',   rowClass: 'bg-red-50'   },
  }[type];
  const Icon = styles.icon;
  return (
    <li className={`flex items-start gap-2 rounded-lg px-3 py-2 ${styles.rowClass}`}>
      <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${styles.iconClass}`} />
      <span className={`text-xs font-medium ${styles.textClass}`}>{text}</span>
    </li>
  );
}

function Section({
  title, flags, type, emptyText,
}: {
  title: string;
  flags: Flag[];
  type: 'green' | 'amber' | 'red';
  emptyText: string;
}) {
  const headerStyles = {
    green: 'text-green-700 bg-green-50 border-green-200',
    amber: 'text-amber-700 bg-amber-50 border-amber-200',
    red:   'text-red-700   bg-red-50   border-red-200',
  }[type];

  return (
    <div>
      <div className={`flex items-center justify-between px-3 py-1.5 rounded-lg border mb-2 ${headerStyles}`}>
        <span className="text-xs font-semibold">{title}</span>
        <span className="text-xs font-bold">{flags.length}</span>
      </div>
      {flags.length > 0 ? (
        <ul className="space-y-1.5">
          {flags.map((f, i) => (
            <FlagItem key={i} text={f.text} type={type} />
          ))}
        </ul>
      ) : (
        <p className="text-xs text-surface-400 px-3 py-2">{emptyText}</p>
      )}
    </div>
  );
}

export function StrengthsFlags({ institution, raw }: StrengthsFlagsProps) {
  const roa       = institution.roa;
  const netIncome = institution.net_income;
  const INTINC    = getRaw(raw, 'INTINC');
  const EINTEXP   = getRaw(raw, 'EINTEXP');
  const ASSET     = institution.total_assets;
  const NETLOANS  = institution.total_loans;
  const DEP       = institution.total_deposits;
  const ELNANTR   = getRaw(raw, 'ELNANTR');
  const NONII     = getRaw(raw, 'NONII');
  const NCLNLS    = getRaw(raw, 'NCLNLS');
  const EQ        = institution.equity_capital;

  const nim: number | null =
    INTINC != null && EINTEXP != null && ASSET
      ? ((INTINC - EINTEXP) / ASSET) * 100
      : null;

  const efficiencyRatio: number | null =
    ELNANTR != null && INTINC != null && EINTEXP != null && NONII != null
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

  const loanToDeposit: number | null =
    NETLOANS != null && DEP
      ? (NETLOANS / DEP) * 100
      : null;

  const hasCreditCards =
    institution.credit_card_loans != null && institution.credit_card_loans > 0;

  const green: Flag[] = [];
  const amber: Flag[] = [];
  const red: Flag[] = [];

  // ── Green flags ──────────────────────────────────────────────────────────────
  if (roa != null && roa > 1.2)
    green.push({ text: 'Above-average profitability' });
  if (nim != null && nim > 3.5)
    green.push({ text: 'Strong interest spread' });
  if (efficiencyRatio != null && efficiencyRatio < 55)
    green.push({ text: 'Highly efficient operations' });
  if (chargeOffRate != null && chargeOffRate < 0.3)
    green.push({ text: 'Excellent asset quality' });
  if (equityRatio != null && equityRatio > 12)
    green.push({ text: 'Well-capitalized buffer' });
  if (loanToDeposit != null && loanToDeposit < 75)
    green.push({ text: 'Conservative liquidity position' });
  if (hasCreditCards)
    green.push({ text: 'Diversified revenue (CC program)' });

  // ── Red flags ────────────────────────────────────────────────────────────────
  if (roa != null && roa < 0.5)
    red.push({ text: 'Below-peer profitability' });
  if (nim != null && nim < 2)
    red.push({ text: 'Compressed interest spread' });
  if (efficiencyRatio != null && efficiencyRatio > 75)
    red.push({ text: 'High operating cost ratio' });
  if (chargeOffRate != null && chargeOffRate > 1)
    red.push({ text: 'Elevated credit losses' });
  if (equityRatio != null && equityRatio < 8)
    red.push({ text: 'Near regulatory minimum' });
  if (loanToDeposit != null && loanToDeposit > 90)
    red.push({ text: 'Aggressive lending stance' });
  if (netIncome != null && netIncome < 0)
    red.push({ text: 'Operating at a loss' });

  // ── Amber flags ───────────────────────────────────────────────────────────────
  if (roa != null && roa >= 0.5 && roa <= 0.8)
    amber.push({ text: 'Profitability below peer median' });
  if (efficiencyRatio != null && efficiencyRatio >= 65 && efficiencyRatio <= 75)
    amber.push({ text: 'Efficiency improvement needed' });

  const totalFlags = green.length + amber.length + red.length;

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-surface-700">Strengths &amp; Risks</h3>
        <span className="text-xs text-surface-400">{totalFlags} signal{totalFlags !== 1 ? 's' : ''} detected</span>
      </div>

      <div className="space-y-4">
        <Section
          title="Strengths"
          flags={green}
          type="green"
          emptyText="No notable strengths flagged."
        />
        <Section
          title="Watch"
          flags={amber}
          type="amber"
          emptyText="No watch items."
        />
        <Section
          title="Risks"
          flags={red}
          type="red"
          emptyText="No risk flags detected."
        />
      </div>
    </Card>
  );
}
