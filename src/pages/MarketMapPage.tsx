import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, TrendingUp, BarChart2 } from 'lucide-react';
import { BubbleChart } from '@/components/market/BubbleChart';
import { Card, Skeleton } from '@/components/ui';
import { formatPercent, formatNumber } from '@/lib/format';

const SIZE_BUCKETS = [
  { value: '', label: 'All Sizes' },
  { value: 'mega', label: 'Mega ($250B+)' },
  { value: 'large', label: 'Large ($10B+)' },
  { value: 'regional', label: 'Regional ($1B+)' },
  { value: 'community', label: 'Community ($100M+)' },
  { value: 'small', label: 'Small (<$100M)' },
];

const CHARTER_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'savings', label: 'Savings' },
  { value: 'savings_association', label: 'Savings Assoc.' },
];

interface MarketMapData {
  institutions: any[];
  count: number;
  stats: {
    median_roa: number;
    mean_roa: number;
    median_roi: number;
    mean_roi: number;
  };
}

async function fetchMarketMap(sizeBucket: string, charterType: string): Promise<MarketMapData> {
  const params = new URLSearchParams();
  if (sizeBucket) params.set('size_bucket', sizeBucket);
  if (charterType) params.set('charter_type', charterType);
  const res = await fetch(`/api/analytics/market-map?${params}`);
  if (!res.ok) throw new Error('Failed to load market map');
  return res.json();
}

export default function MarketMapPage() {
  const [sizeBucket, setSizeBucket] = useState('');
  const [charterType, setCharterType] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['market-map', sizeBucket, charterType],
    queryFn: () => fetchMarketMap(sizeBucket, charterType),
    staleTime: 10 * 60 * 1000,
  });

  const stats = data?.stats;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Market Map</h1>
          <p className="mt-1 text-sm text-surface-500">
            Every FDIC-insured bank plotted by profitability. X = ROA, Y = ROE, size = total assets.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 shrink-0">
          <select
            value={sizeBucket}
            onChange={e => setSizeBucket(e.target.value)}
            className="text-sm border border-surface-300 rounded-lg px-3 py-2 bg-white text-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {SIZE_BUCKETS.map(b => (
              <option key={b.value} value={b.value}>{b.label}</option>
            ))}
          </select>
          <select
            value={charterType}
            onChange={e => setCharterType(e.target.value)}
            className="text-sm border border-surface-300 rounded-lg px-3 py-2 bg-white text-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {CHARTER_TYPES.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Quadrant labels */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: Activity, label: 'High ROA + High ROE', desc: 'Efficient capital generators', color: 'bg-green-50 text-green-700 border-green-200' },
          { icon: TrendingUp, label: 'High ROA + Low ROE', desc: 'Asset-rich, equity-light', color: 'bg-blue-50 text-blue-700 border-blue-200' },
          { icon: BarChart2, label: 'Low ROA + High ROE', desc: 'Leveraged performers', color: 'bg-amber-50 text-amber-700 border-amber-200' },
          { icon: Activity, label: 'Low ROA + Low ROE', desc: 'Underperformers or distressed', color: 'bg-red-50 text-red-700 border-red-200' },
        ].map(q => {
          const Icon = q.icon;
          return (
            <div key={q.label} className={`rounded-xl border p-3 ${q.color}`}>
              <div className="flex items-center gap-2 mb-1">
                <Icon className="h-4 w-4" />
                <span className="text-xs font-semibold">{q.label}</span>
              </div>
              <p className="text-xs opacity-75">{q.desc}</p>
            </div>
          );
        })}
      </div>

      {/* Stat pills */}
      {stats && (
        <div className="flex flex-wrap gap-4">
          {[
            { label: 'Median ROA', value: formatPercent(stats.median_roa) },
            { label: 'Mean ROA', value: formatPercent(stats.mean_roa) },
            { label: 'Median ROE', value: formatPercent(stats.median_roi) },
            { label: 'Mean ROE', value: formatPercent(stats.mean_roi) },
            { label: 'Institutions', value: formatNumber(data?.count ?? 0) },
          ].map(s => (
            <div key={s.label} className="flex items-center gap-2 bg-surface-50 border border-surface-200 rounded-full px-4 py-1.5">
              <span className="text-xs text-surface-500">{s.label}</span>
              <span className="text-sm font-semibold text-surface-900">{s.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Chart */}
      <Card className="overflow-hidden">
        {isLoading ? (
          <Skeleton className="h-[560px] w-full" />
        ) : data ? (
          <BubbleChart institutions={data.institutions} stats={data.stats} />
        ) : (
          <div className="h-64 flex items-center justify-center text-surface-500 text-sm">
            Failed to load data
          </div>
        )}
      </Card>

      {/* Insight callouts */}
      <div className="bg-gradient-to-r from-primary-50 to-cyan-50 border border-primary-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-primary-900 mb-2">How to read this chart</h3>
        <ul className="text-sm text-primary-800 space-y-1.5">
          <li>• <strong>Upper-right quadrant:</strong> High ROA + High ROE — top performers generating strong returns on both assets and equity.</li>
          <li>• <strong>Bubble size</strong> represents total assets on a logarithmic scale — mega banks (JPMorgan, BofA) appear as large circles.</li>
          <li>• <strong>Dashed lines</strong> show industry median ROA and ROE — anything above and to the right outperforms.</li>
          <li>• <strong>Red lines at zero</strong> indicate the break-even point — bubbles in the lower-left quadrant are losing money.</li>
          <li>• <strong>Click any bubble</strong> to view the full institution profile with financial details and peer comparison.</li>
        </ul>
      </div>
    </div>
  );
}
