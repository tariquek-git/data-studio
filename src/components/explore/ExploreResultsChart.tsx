import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import type { ValueType } from 'recharts/types/component/DefaultTooltipContent';
import { formatCurrency, formatNumber } from '@/lib/format';
import type { Institution } from '@/types/institution';
import type { SearchAggregations } from '@/types/filters';

function fmtCount(value: ValueType | undefined): [string, string] {
  return [formatNumber(typeof value === 'number' ? value : null), 'Institutions'];
}

function fmtAssets(value: ValueType | undefined): [string, string] {
  return [formatCurrency(typeof value === 'number' ? value : null), 'Total Assets'];
}

interface ExploreResultsChartProps {
  institutions: Institution[];
  aggregations: SearchAggregations | null;
}

function buildHistogram(institutions: Institution[]) {
  const buckets = [
    { label: '<$100M', min: 0, max: 100e6, count: 0 },
    { label: '$100M–$1B', min: 100e6, max: 1e9, count: 0 },
    { label: '$1B–$10B', min: 1e9, max: 10e9, count: 0 },
    { label: '$10B–$50B', min: 10e9, max: 50e9, count: 0 },
    { label: '$50B–$250B', min: 50e9, max: 250e9, count: 0 },
    { label: '$250B+', min: 250e9, max: Infinity, count: 0 },
  ];

  for (const inst of institutions) {
    if (inst.total_assets == null) continue;
    const bucket = buckets.find((b) => inst.total_assets! >= b.min && inst.total_assets! < b.max);
    if (bucket) bucket.count++;
  }

  return buckets;
}

function buildLeaderboard(institutions: Institution[]) {
  return [...institutions]
    .filter((i) => i.total_assets != null)
    .sort((a, b) => (b.total_assets ?? 0) - (a.total_assets ?? 0))
    .slice(0, 10)
    .map((i) => ({
      name: (i.name || i.holding_company || `#${i.cert_number}`).slice(0, 24),
      assets: i.total_assets ?? 0,
    }));
}

function buildStateDistribution(aggregations: SearchAggregations | null) {
  if (!aggregations) return [];
  return Object.entries(aggregations.by_state)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([state, count]) => ({ state, count }));
}

const CHART_COLORS = ['#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe', '#eff6ff', '#1d4ed8', '#1e40af', '#1e3a8a'];

export function ExploreResultsChart({ institutions, aggregations }: ExploreResultsChartProps) {
  const histogram = buildHistogram(institutions);
  const leaderboard = buildLeaderboard(institutions);
  const stateData = buildStateDistribution(aggregations);

  return (
    <div className="space-y-6">
      {/* Asset distribution histogram */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-800 mb-4">Asset Size Distribution</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={histogram} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: '#64748b' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#64748b' }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip
              formatter={fmtCount}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {histogram.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top 10 by assets */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">Top 10 by Total Assets</h3>
          {leaderboard.length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center">No data available</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={leaderboard}
                layout="vertical"
                margin={{ top: 4, right: 60, bottom: 4, left: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={(v: number) => formatCurrency(v)}
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  width={120}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={fmtAssets}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                />
                <Bar dataKey="assets" fill="#2563eb" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* State distribution */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">Top States by Count</h3>
          {stateData.length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center">No data available</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={stateData}
                margin={{ top: 4, right: 8, bottom: 4, left: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="state"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                />
                <Tooltip
                  formatter={fmtCount}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                />
                <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
