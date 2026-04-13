import { Target } from 'lucide-react';
import { formatNumber } from '@/lib/format';
import type { Institution } from '@/types/institution';

interface BrimAnalyticsPanelProps {
  institutions: Institution[];
  total: number;
}

const TIER_COLORS: Record<string, string> = {
  A: 'bg-emerald-500',
  B: 'bg-blue-500',
  C: 'bg-amber-500',
  D: 'bg-slate-400',
  F: 'bg-slate-200',
};

const TIER_TEXT: Record<string, string> = {
  A: 'text-emerald-700',
  B: 'text-blue-700',
  C: 'text-amber-700',
  D: 'text-slate-600',
  F: 'text-slate-400',
};

const MIGRATION_PROGRAMS = ['ELAN', 'TCM', 'ICBA', 'PSCU', 'FIS', 'TOTAL SYSTEM'];

export function BrimAnalyticsPanel({ institutions, total }: BrimAnalyticsPanelProps) {
  // Tier distribution
  const tierCounts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const inst of institutions) {
    const tier = inst.brim_tier ?? 'F';
    if (tier in tierCounts) tierCounts[tier]++;
  }

  // Top migration targets (ELAN/PSCU/etc with highest brim_score)
  const migrationTargets = institutions
    .filter((inst) => {
      const ap = (inst.agent_bank_program ?? '').toUpperCase();
      return MIGRATION_PROGRAMS.some((p) => ap.includes(p));
    })
    .sort((a, b) => (b.brim_score ?? 0) - (a.brim_score ?? 0))
    .slice(0, 5);

  // Opportunity pipeline counts
  const migrationCount = institutions.filter((inst) => {
    const ap = (inst.agent_bank_program ?? '').toUpperCase();
    return MIGRATION_PROGRAMS.some((p) => ap.includes(p));
  }).length;

  const inHouseCount = institutions.filter((inst) => {
    const hasCards = (inst.credit_card_loans ?? 0) > 0 || inst.issues_credit_cards === true;
    const noAgent = !inst.agent_bank_program || inst.agent_bank_program.trim() === '';
    return hasCards && noAgent;
  }).length;

  const sweetSpotCount = institutions.filter((inst) => {
    const assetSize = inst.total_assets ?? 0;
    const roa = inst.roa ?? 0;
    const hasCards = (inst.credit_card_loans ?? 0) > 0 || inst.issues_credit_cards === true;
    return assetSize >= 500_000_000 && assetSize <= 20_000_000_000 && roa > 1.0 && hasCards;
  }).length;

  // Core processor breakdown
  const processorCounts: Record<string, number> = {};
  for (const inst of institutions) {
    const proc = inst.core_processor ?? 'Unknown';
    processorCounts[proc] = (processorCounts[proc] ?? 0) + 1;
  }
  const topProcessors = Object.entries(processorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const maxProcCount = topProcessors[0]?.[1] ?? 1;

  const maxTierCount = Math.max(...Object.values(tierCounts), 1);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-2 border-b border-violet-100">
        <Target className="h-3.5 w-3.5 text-violet-600" />
        <h2 className="text-xs font-semibold text-violet-700 uppercase tracking-wider">Brim Pipeline</h2>
        <span className="ml-auto text-xs text-slate-400">{formatNumber(total)} total</span>
      </div>

      {/* Opportunity Pipeline */}
      <div className="px-4 space-y-2">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Opportunity Pipeline</h3>
        <PipelineRow label="Migration Targets" count={migrationCount} color="bg-amber-500" />
        <PipelineRow label="In-House Candidates" count={inHouseCount} color="bg-emerald-500" />
        <PipelineRow label="Sweet Spot" count={sweetSpotCount} color="bg-violet-500" />
      </div>

      {/* Tier Distribution */}
      <div className="px-4 border-t border-slate-100 pt-3 space-y-2">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tier Distribution</h3>
        {(['A', 'B', 'C', 'D', 'F'] as const).map((tier) => (
          <div key={tier}>
            <div className="flex items-center justify-between text-xs mb-0.5">
              <span className={`font-semibold ${TIER_TEXT[tier]}`}>Tier {tier}</span>
              <span className="font-medium text-slate-700">{formatNumber(tierCounts[tier] ?? 0)}</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-1.5 rounded-full ${TIER_COLORS[tier]}`}
                style={{ width: `${((tierCounts[tier] ?? 0) / maxTierCount) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Top Migration Targets */}
      {migrationTargets.length > 0 && (
        <div className="px-4 border-t border-slate-100 pt-3 space-y-1.5">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Top Migration Targets</h3>
          {migrationTargets.map((inst) => (
            <div key={inst.cert_number} className="flex items-center justify-between gap-1">
              <span className="text-xs text-slate-700 truncate flex-1">{inst.name}</span>
              <span className="text-xs font-bold text-amber-700 shrink-0">
                {inst.brim_score ?? '—'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Core Processor Breakdown */}
      {topProcessors.length > 0 && (
        <div className="px-4 border-t border-slate-100 pt-3 pb-4 space-y-2">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Core Processors</h3>
          {topProcessors.map(([proc, count]) => (
            <div key={proc}>
              <div className="flex items-center justify-between text-xs mb-0.5">
                <span className="text-slate-600 truncate">{proc}</span>
                <span className="font-medium text-slate-800">{formatNumber(count)}</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-1.5 bg-violet-400 rounded-full"
                  style={{ width: `${(count / maxProcCount) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PipelineRow({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full shrink-0 ${color}`} />
        <span className="text-xs text-slate-600">{label}</span>
      </div>
      <span className="text-xs font-semibold text-slate-800">{formatNumber(count)}</span>
    </div>
  );
}
