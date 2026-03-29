import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, Award } from 'lucide-react';
import { formatCurrency, formatPercent, formatNumber } from '@/lib/format';
import { Skeleton } from '@/components/ui';

const METRICS = [
  { value: 'roa', label: 'ROA', format: (v: number) => formatPercent(v), desc: 'Return on Assets' },
  { value: 'roi', label: 'ROE', format: (v: number) => formatPercent(v), desc: 'Return on Equity' },
  { value: 'total_assets', label: 'Total Assets', format: (v: number) => formatCurrency(v), desc: 'Largest Banks' },
  { value: 'net_income', label: 'Net Income', format: (v: number) => formatCurrency(v), desc: 'Most Profitable' },
  { value: 'credit_card_loans', label: 'CC Portfolio', format: (v: number) => formatCurrency(v), desc: 'Largest CC Programs' },
  { value: 'num_branches', label: 'Branches', format: (v: number) => formatNumber(v), desc: 'Most Branches' },
];

interface LeaderboardInstitution {
  cert_number: number;
  name: string;
  state: string | null;
  charter_type: string | null;
  total_assets: number | null;
  roa: number | null;
  roi: number | null;
  net_income: number | null;
  num_branches: number | null;
  credit_card_loans: number | null;
}

interface LeaderboardData {
  metric: string;
  institutions: LeaderboardInstitution[];
}

async function fetchLeaderboard(metric: string, order: 'asc' | 'desc'): Promise<LeaderboardData> {
  const params = new URLSearchParams({ metric, order, limit: '15', min_assets: '500000000' });
  const res = await fetch(`/api/analytics/leaderboard?${params}`);
  if (!res.ok) throw new Error('Failed to load leaderboard');
  return res.json();
}

export function Leaderboard() {
  const [metric, setMetric] = useState('roa');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');

  const { data, isLoading } = useQuery({
    queryKey: ['leaderboard', metric, order],
    queryFn: () => fetchLeaderboard(metric, order),
    staleTime: 5 * 60 * 1000,
  });

  const metaDef = METRICS.find(m => m.value === metric)!;
  const getValue = (inst: LeaderboardInstitution) => {
    const map: Record<string, number | null> = {
      roa: inst.roa,
      roi: inst.roi,
      total_assets: inst.total_assets,
      net_income: inst.net_income,
      credit_card_loans: inst.credit_card_loans,
      num_branches: inst.num_branches,
    };
    return map[metric] ?? null;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-1.5">
          {METRICS.map(m => (
            <button
              key={m.value}
              onClick={() => setMetric(m.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                metric === m.value
                  ? 'bg-primary-600 text-white'
                  : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setOrder(o => o === 'desc' ? 'asc' : 'desc')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-100 text-surface-600 hover:bg-surface-200 transition-colors"
        >
          {order === 'desc' ? <TrendingDown className="h-3.5 w-3.5" /> : <TrendingUp className="h-3.5 w-3.5" />}
          {order === 'desc' ? 'Top performers' : 'Bottom performers'}
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-surface-200">
          <table className="min-w-full">
            <thead>
              <tr className="bg-surface-50 border-b border-surface-200">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-surface-500 uppercase w-10">#</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-surface-500 uppercase">Institution</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-surface-500 uppercase">{metaDef.label}</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-surface-500 uppercase hidden sm:table-cell">Assets</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-surface-500 uppercase hidden md:table-cell">State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {(data?.institutions || []).map((inst, i) => {
                const value = getValue(inst);
                const isPositive = value != null && (['roa', 'roi', 'net_income'].includes(metric) ? value >= 0 : true);
                return (
                  <tr key={inst.cert_number} className="hover:bg-primary-50/40 transition-colors">
                    <td className="px-4 py-3">
                      {i < 3 ? (
                        <Award className={`h-4 w-4 ${i === 0 ? 'text-amber-500' : i === 1 ? 'text-slate-400' : 'text-amber-700'}`} />
                      ) : (
                        <span className="text-xs text-surface-400">{i + 1}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to={`/institution/${inst.cert_number}`}
                        className="text-sm font-medium text-primary-700 hover:underline block"
                      >
                        {inst.name}
                      </Link>
                      <span className="text-xs text-surface-400">
                        {inst.charter_type?.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-right text-sm font-mono font-semibold ${
                      ['roa', 'roi', 'net_income'].includes(metric)
                        ? isPositive ? 'text-green-700' : 'text-red-600'
                        : 'text-surface-900'
                    }`}>
                      {value != null ? metaDef.format(value) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-mono text-surface-600 hidden sm:table-cell">
                      {formatCurrency(inst.total_assets)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-surface-500 hidden md:table-cell">
                      {inst.state ?? '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-surface-400">Filtered to institutions with $500M+ in assets · FDIC Q4 2025</p>
    </div>
  );
}
