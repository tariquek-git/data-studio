import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';
import { Target, CreditCard, TrendingUp, Building2 } from 'lucide-react';
import { formatCurrency, formatPercent } from '@/lib/format';
import { Link } from 'react-router';

interface BrimInstitution {
  id: string;
  cert_number: number;
  name: string;
  city: string;
  state: string;
  source: string;
  charter_type: string;
  total_assets: number | null;
  roa: number | null;
  credit_card_loans: number | null;
  card_portfolio_size: number | null;
  brim_score: number | null;
  brim_tier: string | null;
  core_processor: string | null;
  agent_bank_program: string | null;
}

const TIER_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  A: { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200' },
  B: { bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200' },
  C: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  D: { bg: 'bg-surface-50', text: 'text-content-secondary', border: 'border-surface-200' },
  F: { bg: 'bg-surface-50', text: 'text-content-tertiary', border: 'border-surface-100' },
};

async function fetchBrimTargets(tier: string, minScore: number): Promise<BrimInstitution[]> {
  const params = new URLSearchParams({
    per_page: '100',
    sort_by: 'total_assets',
    sort_dir: 'desc',
    ...(tier !== 'ALL' ? { brim_tier: tier } : {}),
    ...(minScore > 0 ? { min_brim_score: String(minScore) } : {}),
  });
  const res = await fetch(`/api/institutions/search?${params}`);
  if (!res.ok) throw new Error('Failed to fetch');
  const data = await res.json();
  return data.institutions;
}

export default function BrimPage() {
  const [selectedTier, setSelectedTier] = useState<string>('B');
  const [minScore, setMinScore] = useState(0);
  const parentRef = useRef<HTMLDivElement>(null);

  const { data: institutions = [], isLoading } = useQuery({
    queryKey: ['brim-targets', selectedTier, minScore],
    queryFn: () => fetchBrimTargets(selectedTier, minScore),
  });

  const rowVirtualizer = useVirtualizer({
    count: institutions.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 10,
  });

  const tierCounts = { A: 15, B: 412, C: 3159, D: 4465, F: 648 };

  return (
    <div className="min-h-screen bg-surface-50">
      {/* Header */}
      <div className="bg-white border-b border-surface-200 px-6 py-5">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-1">
            <Target className="w-6 h-6 text-violet-600" />
            <h1 className="text-xl font-semibold text-content-primary">Brim BD Intelligence</h1>
          </div>
          <p className="text-sm text-content-secondary">
            {institutions.length.toLocaleString()} institutions scored for Brim card program fit.
            Tier A = highest fit. Excludes existing Brim clients.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Tier filter pills */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {['ALL', 'A', 'B', 'C', 'D'].map((tier) => {
            const colors = tier === 'ALL' ? null : TIER_COLORS[tier];
            const active = selectedTier === tier;
            return (
              <button
                key={tier}
                onClick={() => setSelectedTier(tier)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
                  active
                    ? colors
                      ? `${colors.bg} ${colors.text} ${colors.border}`
                      : 'bg-violet-600 text-white border-violet-600'
                    : 'bg-white text-content-secondary border-surface-200 hover:border-surface-300'
                }`}
              >
                {tier === 'ALL' ? 'All tiers' : `Tier ${tier}`}
                {tier !== 'ALL' && (
                  <span className="ml-1.5 opacity-60 text-xs">
                    {tierCounts[tier as keyof typeof tierCounts]?.toLocaleString()}
                  </span>
                )}
              </button>
            );
          })}
          <div className="flex items-center gap-2 ml-auto">
            <label className="text-xs text-content-secondary">Min score</label>
            <input
              type="range"
              min={0}
              max={80}
              step={5}
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="w-24"
            />
            <span className="text-xs font-mono text-content-primary w-6">{minScore}</span>
          </div>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {[
            { label: 'Matching institutions', value: institutions.length.toLocaleString(), icon: Building2 },
            {
              label: 'Total card portfolio',
              value: formatCurrency(
                institutions.reduce((s, i) => s + (i.card_portfolio_size ?? i.credit_card_loans ?? 0), 0)
              ),
              icon: CreditCard,
            },
            {
              label: 'Avg assets',
              value: formatCurrency(
                institutions.length > 0
                  ? institutions.reduce((s, i) => s + (i.total_assets ?? 0), 0) / institutions.length
                  : 0
              ),
              icon: TrendingUp,
            },
            {
              label: 'Avg ROA',
              value:
                institutions.filter((i) => i.roa != null).length > 0
                  ? formatPercent(
                      institutions.filter((i) => i.roa != null).reduce((s, i) => s + (i.roa ?? 0), 0) /
                        institutions.filter((i) => i.roa != null).length
                    )
                  : '—',
              icon: TrendingUp,
            },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="bg-white border border-surface-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-0.5">
                <Icon className="w-3.5 h-3.5 text-content-tertiary" />
                <span className="text-xs text-content-secondary">{label}</span>
              </div>
              <div className="text-lg font-semibold text-content-primary">{value}</div>
            </div>
          ))}
        </div>

        {/* Virtual scroll table */}
        <div className="bg-white border border-surface-200 rounded-lg overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_60px_140px_110px_100px_80px_80px_100px] gap-0 border-b border-surface-200 bg-surface-50 px-4 py-2 text-xs font-medium text-content-secondary uppercase tracking-wide">
            <div>Institution</div>
            <div className="text-right">State</div>
            <div className="text-right">Assets</div>
            <div className="text-right">Card Portfolio</div>
            <div className="text-right">ROA</div>
            <div className="text-center">Score</div>
            <div className="text-center">Tier</div>
            <div>Core</div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center h-48 text-content-secondary text-sm">
              Loading…
            </div>
          ) : institutions.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-content-secondary text-sm">
              No institutions match these filters.
            </div>
          ) : (
            <div ref={parentRef} className="overflow-auto" style={{ height: '560px' }}>
              <div
                style={{
                  height: `${rowVirtualizer.getTotalSize()}px`,
                  position: 'relative',
                }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const inst = institutions[virtualRow.index];
                  const tier = inst.brim_tier ?? 'F';
                  const colors = TIER_COLORS[tier] ?? TIER_COLORS['F'];
                  return (
                    <div
                      key={virtualRow.key}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                      className="grid grid-cols-[1fr_60px_140px_110px_100px_80px_80px_100px] gap-0 px-4 items-center border-b border-surface-100 hover:bg-surface-50 transition-colors"
                    >
                      <div className="truncate">
                        <Link
                          to={`/institutions/${inst.cert_number}`}
                          className="text-sm font-medium text-content-primary hover:text-violet-700 truncate"
                        >
                          {inst.name}
                        </Link>
                        <div className="text-xs text-content-tertiary">{inst.city}</div>
                      </div>
                      <div className="text-right text-xs text-content-secondary font-mono">{inst.state}</div>
                      <div className="text-right text-sm font-mono text-content-primary">
                        {inst.total_assets ? formatCurrency(inst.total_assets) : '—'}
                      </div>
                      <div className="text-right text-sm font-mono text-content-secondary">
                        {(inst.card_portfolio_size ?? inst.credit_card_loans)
                          ? formatCurrency(inst.card_portfolio_size ?? inst.credit_card_loans ?? 0)
                          : '—'}
                      </div>
                      <div
                        className={`text-right text-sm font-mono ${
                          inst.roa != null && inst.roa < 0 ? 'text-red-600' : 'text-green-700'
                        }`}
                      >
                        {inst.roa != null ? formatPercent(inst.roa) : '—'}
                      </div>
                      <div className="text-center text-sm font-bold text-content-primary">
                        {inst.brim_score ?? '—'}
                      </div>
                      <div className="flex justify-center">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-semibold border ${colors.bg} ${colors.text} ${colors.border}`}
                        >
                          {tier}
                        </span>
                      </div>
                      <div className="text-xs text-content-secondary truncate">
                        {inst.core_processor ?? inst.agent_bank_program ?? '—'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
