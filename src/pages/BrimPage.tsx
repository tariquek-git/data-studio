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
  D: { bg: 'bg-surface-900', text: 'text-surface-400', border: 'border-surface-700' },
  F: { bg: 'bg-surface-900', text: 'text-surface-500', border: 'border-surface-800' },
};

async function fetchBrimTargets(tier: string, minScore: number, vendor: string): Promise<BrimInstitution[]> {
  const params = new URLSearchParams({
    per_page: '100',
    sort_by: 'total_assets',
    sort_dir: 'desc',
    ...(tier !== 'ALL' ? { brim_tier: tier } : {}),
    ...(minScore > 0 ? { min_brim_score: String(minScore) } : {}),
    ...(vendor !== 'ALL' ? { agent_bank_vendor: vendor } : {}),
  });
  const res = await fetch(`/api/institutions/search?${params}`);
  if (!res.ok) throw new Error('Failed to fetch');
  const data = await res.json();
  return data.institutions;
}

// Agent-bank vendors Brim cares about. Label + filter value. These correspond
// to the fact_value_text values we write to signal.agent_bank_dependency
// (which also land in bank_capabilities.agent_bank_program).
const AGENT_BANK_VENDORS = [
  { value: 'ALL',            label: 'All vendors',        hint: '' },
  { value: 'fnbo',           label: 'FNBO',               hint: 'First Bankcard' },
  { value: 'elan_financial', label: 'Elan',               hint: 'U.S. Bank agent' },
  { value: 'tcm_bank',       label: 'TCM Bank',           hint: 'ICBA Payments' },
  { value: 'corserv',        label: 'CorServ',            hint: 'CaaS platform' },
  { value: 'in_house',       label: 'In-house',           hint: 'Self-issued' },
];

export default function BrimPage() {
  // Default to showing B+C combined for the initial view — that's the
  // actionable target set. Power users can switch to A-only or ALL.
  const [selectedTier, setSelectedTier] = useState<string>('ALL');
  const [minScore, setMinScore] = useState(25);  // C-threshold; filters out F-tier noise
  const [selectedVendor, setSelectedVendor] = useState<string>('ALL');
  const parentRef = useRef<HTMLDivElement>(null);

  const { data: institutions = [], isLoading } = useQuery({
    queryKey: ['brim-targets', selectedTier, minScore, selectedVendor],
    queryFn: () => fetchBrimTargets(selectedTier, minScore, selectedVendor),
  });

  const rowVirtualizer = useVirtualizer({
    count: institutions.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 10,
  });

  const { data: tierData } = useQuery({
    queryKey: ['brim-tier-counts'],
    queryFn: async () => {
      const res = await fetch('/api/analytics/brim-tiers');
      if (!res.ok) throw new Error('Failed to fetch tier counts');
      return res.json() as Promise<{ counts: Record<string, number>; total: number }>;
    },
    staleTime: 5 * 60 * 1000,
  });
  const tierCounts = tierData?.counts ?? { A: 0, B: 0, C: 0, D: 0, F: 0 };

  return (
    <div className="min-h-screen bg-surface-900">
      {/* Header */}
      <div className="bg-white border-b border-surface-700 px-6 py-5">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-1">
            <Target className="w-6 h-6 text-violet-600" />
            <h1 className="text-xl font-semibold text-surface-100">Brim BD Intelligence</h1>
          </div>
          <p className="text-sm text-surface-400">
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
                    : 'bg-white text-surface-400 border-surface-700 hover:border-surface-600'
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
            <label className="text-xs text-surface-400">Min score</label>
            <input
              type="range"
              min={0}
              max={80}
              step={5}
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="w-24"
            />
            <span className="text-xs font-mono text-surface-100 w-6">{minScore}</span>
          </div>
        </div>

        {/* Agent-bank vendor filter — surface our card-program research in a
            single click. 'All vendors' shows everything; clicking FNBO/Elan/
            TCM/CorServ/in_house narrows to banks on that platform. */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-xs font-medium text-surface-400 uppercase tracking-wide mr-1">
            Agent bank
          </span>
          {AGENT_BANK_VENDORS.map(({ value, label, hint }) => {
            const active = selectedVendor === value;
            return (
              <button
                key={value}
                onClick={() => setSelectedVendor(value)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-all inline-flex items-center gap-1.5 ${
                  active
                    ? 'bg-violet-600 text-white border-violet-600'
                    : 'bg-white text-surface-500 border-surface-700 hover:border-surface-600'
                }`}
                title={hint}
              >
                {label}
                {hint && (
                  <span className={`text-[10px] ${active ? 'opacity-80' : 'opacity-50'}`}>
                    {hint}
                  </span>
                )}
              </button>
            );
          })}
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
            <div key={label} className="bg-white border border-surface-700 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-0.5">
                <Icon className="w-3.5 h-3.5 text-surface-500" />
                <span className="text-xs text-surface-400">{label}</span>
              </div>
              <div className="text-lg font-semibold text-surface-100">{value}</div>
            </div>
          ))}
        </div>

        {/* Virtual scroll table */}
        <div className="bg-white border border-surface-700 rounded-lg overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_60px_140px_110px_100px_80px_80px_130px] gap-0 border-b border-surface-700 bg-surface-900 px-4 py-2 text-xs font-medium text-surface-400 uppercase tracking-wide">
            <div>Institution</div>
            <div className="text-right">State</div>
            <div className="text-right">Assets</div>
            <div className="text-right">Card Portfolio</div>
            <div className="text-right">ROA</div>
            <div className="text-center">Score</div>
            <div className="text-center">Tier</div>
            <div>Vendor</div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center h-48 text-surface-400 text-sm">
              Loading…
            </div>
          ) : institutions.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-surface-400 text-sm">
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
                      className="grid grid-cols-[1fr_60px_140px_110px_100px_80px_80px_130px] gap-0 px-4 items-center border-b border-surface-800 hover:bg-surface-900 transition-colors"
                    >
                      <div className="truncate">
                        <Link
                          to={`/institution/${inst.cert_number}`}
                          className="text-sm font-medium text-surface-100 hover:text-violet-700 truncate"
                        >
                          {inst.name}
                        </Link>
                        <div className="text-xs text-surface-500">{inst.city}</div>
                      </div>
                      <div className="text-right text-xs text-surface-400 font-mono">{inst.state}</div>
                      <div className="text-right text-sm font-mono text-surface-100">
                        {inst.total_assets ? formatCurrency(inst.total_assets) : '—'}
                      </div>
                      <div className="text-right text-sm font-mono text-surface-400">
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
                      <div className="text-center text-sm font-bold text-surface-100">
                        {inst.brim_score ?? '—'}
                      </div>
                      <div className="flex justify-center">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-semibold border ${colors.bg} ${colors.text} ${colors.border}`}
                        >
                          {tier}
                        </span>
                      </div>
                      <div className="text-xs truncate">
                        {inst.agent_bank_program ? (
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-medium ${
                              inst.agent_bank_program === 'in_house'
                                ? 'bg-surface-800 text-surface-400'
                                : 'bg-violet-50 text-violet-700 border border-violet-200'
                            }`}
                            title={`Agent bank: ${inst.agent_bank_program}`}
                          >
                            {inst.agent_bank_program === 'in_house'
                              ? 'in-house'
                              : inst.agent_bank_program
                                  .replace('_financial', '')
                                  .replace('_bank', '')
                                  .replace('_', ' ')}
                          </span>
                        ) : inst.core_processor ? (
                          <span className="text-surface-500" title={`Core: ${inst.core_processor}`}>
                            core: {inst.core_processor}
                          </span>
                        ) : (
                          <span className="text-surface-700">—</span>
                        )}
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
