import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area, Cell,
} from 'recharts';
import { Building2, DollarSign, Map, Award, TrendingUp, Activity, Layers, Table2 } from 'lucide-react';
import { Card, Skeleton } from '@/components/ui';
import { DistributionChart } from '@/components/analytics/DistributionChart';
import { AssetConcentration } from '@/components/analytics/AssetConcentration';
import { Leaderboard } from '@/components/analytics/Leaderboard';
import { CorrelationHeatmap } from '@/components/analytics/CorrelationHeatmap';
import { StateMetricGrid } from '@/components/analytics/StateMetricGrid';
import { RatesStrip } from '@/components/analytics/RatesStrip';
import { CMHCSnapshot } from '@/components/analytics/CMHCSnapshot';
import { formatNumber, formatCurrency, formatPercent } from '@/lib/format';

interface AnalyticsOverview {
  total_institutions: number;
  total_by_source: Record<string, number>;
  total_by_country: Record<string, number>;
  total_assets_sum: number;
  avg_assets: number;
  by_state: { state: string; count: number; total_assets: number }[];
  by_regulator: Record<string, number>;
  total_by_charter_type: Record<string, number>;
  source_registry?: {
    tracked: number;
    active: number;
    pending: number;
    unavailable: number;
  };
}

interface DistributionData {
  roa: { histogram: any[]; mean: number; std: number; p25: number; p50: number; p75: number; count: number };
  roi: { histogram: any[]; mean: number; std: number; p25: number; p50: number; p75: number; count: number };
  loan_to_deposit: { histogram: any[]; mean: number; p50: number; count: number };
}

interface LeaderboardData {
  concentration: {
    total: number;
    top1_pct: number; top5_pct: number; top10_pct: number; top25_pct: number;
    top_institutions: any[];
  };
}

interface CorrelationData {
  matrix: number[][];
  metrics: string[];
  count: number;
}

interface StateMetricsData {
  states: any[];
}

async function fetchOverview(): Promise<AnalyticsOverview> {
  const res = await fetch('/api/analytics/overview');
  if (!res.ok) throw new Error('Failed to load analytics');
  return res.json();
}
async function fetchDistribution(): Promise<DistributionData> {
  const res = await fetch('/api/analytics/distribution');
  if (!res.ok) throw new Error('Failed to load distribution');
  return res.json();
}
async function fetchLeaderboardData(): Promise<LeaderboardData> {
  const res = await fetch('/api/analytics/leaderboard?metric=total_assets&limit=10');
  if (!res.ok) throw new Error('Failed to load');
  return res.json();
}
async function fetchCorrelation(): Promise<CorrelationData> {
  const res = await fetch('/api/analytics/correlation');
  if (!res.ok) throw new Error('Failed to load correlation data');
  return res.json();
}
async function fetchStateMetrics(): Promise<StateMetricsData> {
  const res = await fetch('/api/analytics/state-metrics');
  if (!res.ok) throw new Error('Failed to load state metrics');
  return res.json();
}

const CHARTER_COLORS: Record<string, string> = {
  commercial: '#2563eb',
  savings: '#7c3aed',
  savings_association: '#0891b2',
  other: '#64748b',
};

type TabId = 'overview' | 'distribution' | 'concentration' | 'leaderboard' | 'correlations' | 'state-grid';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <Building2 className="w-4 h-4" /> },
  { id: 'distribution', label: 'Distributions', icon: <Activity className="w-4 h-4" /> },
  { id: 'concentration', label: 'Concentration', icon: <DollarSign className="w-4 h-4" /> },
  { id: 'leaderboard', label: 'Leaderboard', icon: <Award className="w-4 h-4" /> },
  { id: 'correlations', label: 'Correlations', icon: <Layers className="w-4 h-4" /> },
  { id: 'state-grid', label: 'State Grid', icon: <Table2 className="w-4 h-4" /> },
];

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  const { data: overview, isLoading: ovLoading } = useQuery({
    queryKey: ['analytics-overview'],
    queryFn: fetchOverview,
    staleTime: 10 * 60 * 1000,
  });
  const { data: distData, isLoading: distLoading } = useQuery({
    queryKey: ['analytics-distribution'],
    queryFn: fetchDistribution,
    enabled: activeTab === 'distribution',
    staleTime: 30 * 60 * 1000,
  });
  const { data: lbData, isLoading: lbLoading } = useQuery({
    queryKey: ['analytics-leaderboard-concentration'],
    queryFn: fetchLeaderboardData,
    enabled: activeTab === 'concentration',
    staleTime: 30 * 60 * 1000,
  });
  const { data: corrData, isLoading: corrLoading } = useQuery({
    queryKey: ['analytics-correlation'],
    queryFn: fetchCorrelation,
    enabled: activeTab === 'correlations',
    staleTime: 30 * 60 * 1000,
  });
  const { data: stateData, isLoading: stateLoading } = useQuery({
    queryKey: ['analytics-state-metrics'],
    queryFn: fetchStateMetrics,
    enabled: activeTab === 'state-grid',
    staleTime: 30 * 60 * 1000,
  });

  const summaryStats = overview
    ? [
        { label: 'Tracked Institutions', value: formatNumber(overview.total_institutions), icon: Building2, color: 'text-blue-600', bg: 'bg-blue-50' },
        { label: 'Total Banking Assets', value: formatCurrency(overview.total_assets_sum), icon: DollarSign, color: 'text-green-600', bg: 'bg-green-50' },
        { label: 'Active Source Feeds', value: formatNumber(overview.source_registry?.active ?? Object.keys(overview.total_by_source).length), icon: TrendingUp, color: 'text-purple-600', bg: 'bg-purple-50' },
        { label: 'States / Provinces', value: formatNumber(overview.by_state.length), icon: Map, color: 'text-cyan-600', bg: 'bg-cyan-50' },
      ]
    : [];

  // Detect Canadian institutions from overview data
  const hasCanadianInstitutions =
    !!overview &&
    ((overview.total_by_source?.osfi ?? 0) > 0 ||
      (overview.total_by_source?.rpaa ?? 0) > 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Live Canadian Rates Strip */}
      <RatesStrip />

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Industry Analytics</h1>
          <p className="mt-1 text-sm text-surface-500">
            North American financial-infrastructure analytics across banks, credit unions, registries,
            and source-backed market context.
          </p>
        </div>
        <Link
          to="/market"
          className="hidden sm:flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
        >
          <Activity className="h-4 w-4" />
          Market Map
        </Link>
      </div>

      {/* Summary KPIs */}
      {ovLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : overview && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {summaryStats.map(stat => {
            const Icon = stat.icon;
            return (
              <Card key={stat.label}>
                <div className="flex items-center gap-3">
                  <div className={`flex items-center justify-center h-10 w-10 rounded-xl ${stat.bg} shrink-0`}>
                    <Icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                  <div>
                    <p className="text-xs text-surface-500">{stat.label}</p>
                    <p className="text-xl font-bold text-surface-900">{stat.value}</p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-surface-200 overflow-x-auto">
        <nav className="flex gap-1 -mb-px min-w-max">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-surface-500 hover:text-surface-700 hover:border-surface-300'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab: Overview */}
      {activeTab === 'overview' && overview && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <h3 className="text-base font-semibold text-surface-900 mb-4">Charter Type Breakdown</h3>
              <div className="space-y-3">
                {Object.entries(overview.total_by_charter_type)
                  .sort((a, b) => b[1] - a[1])
                  .map(([type, count]) => {
                    const total = Object.values(overview.total_by_charter_type).reduce((a, b) => a + b, 0);
                    const pct = (count / total) * 100;
                    return (
                      <div key={type}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium text-surface-700 capitalize">{type.replace(/_/g, ' ')}</span>
                          <span className="text-surface-500">{formatNumber(count)} ({formatPercent(pct, 0)})</span>
                        </div>
                        <div className="h-2.5 bg-surface-100 rounded-full overflow-hidden">
                          <div
                            className="h-2.5 rounded-full transition-all"
                            style={{ width: `${pct}%`, backgroundColor: CHARTER_COLORS[type] || '#64748b' }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </Card>

            <Card>
              <h3 className="text-base font-semibold text-surface-900 mb-4">Primary Regulator</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={Object.entries(overview.by_regulator)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 6)
                    .map(([reg, count]) => ({ reg, count }))}
                  layout="vertical"
                  margin={{ top: 0, right: 20, left: 10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis type="category" dataKey="reg" tick={{ fontSize: 11, fill: '#64748b' }} width={45} />
                  <Tooltip
                    formatter={(v: unknown) => [formatNumber(v as number), 'Institutions']}
                    contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {Object.entries(overview.by_regulator)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 6)
                      .map((_, i) => (
                        <Cell key={i} fill={['#2563eb', '#7c3aed', '#0891b2', '#16a34a', '#ea580c', '#64748b'][i]} />
                      ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          <Card>
            <h3 className="text-base font-semibold text-surface-900 mb-4">Institutions by State</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={overview.by_state.slice(0, 20)}
                margin={{ top: 5, right: 10, left: 0, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="state" tick={{ fontSize: 10, fill: '#64748b' }} angle={-45} textAnchor="end" />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip
                  formatter={(v: unknown) => [formatNumber(v as number), 'Institutions']}
                  contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                />
                <Bar dataKey="count" fill="#2563eb" radius={[3, 3, 0, 0]} fillOpacity={0.8} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <h3 className="text-base font-semibold text-surface-900 mb-1">Total Assets by State (Top 20)</h3>
            <p className="text-xs text-surface-400 mb-4">New York and North Carolina dominate due to mega-bank headquarters</p>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart
                data={[...overview.by_state]
                  .sort((a, b) => b.total_assets - a.total_assets)
                  .slice(0, 20)}
                margin={{ top: 5, right: 10, left: 0, bottom: 20 }}
              >
                <defs>
                  <linearGradient id="assetsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="state" tick={{ fontSize: 10, fill: '#64748b' }} angle={-45} textAnchor="end" />
                <YAxis
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  tickFormatter={v => formatCurrency(v)}
                  width={70}
                />
                <Tooltip
                  formatter={(v: unknown) => [formatCurrency(v as number), 'Total Assets']}
                  contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                />
                <Area type="monotone" dataKey="total_assets" stroke="#2563eb" fill="url(#assetsGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          {/* Canadian Market section — only when Canadian institutions are present */}
          <CMHCSnapshot showForCanadian={hasCanadianInstitutions} />
        </div>
      )}

      {/* Tab: Distributions */}
      {activeTab === 'distribution' && (
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
            <p className="text-sm text-blue-800">
              <strong>How to read:</strong> These histograms show how {formatNumber(distData?.roa?.count ?? 0)} FDIC-insured banks
              cluster across key profitability metrics. The dashed lines mark the 25th percentile, median, and 75th percentile.
              A healthy community bank typically has ROA of 0.8–1.3% and ROE of 8–12%.
            </p>
          </div>

          {distLoading ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Skeleton className="h-72" />
              <Skeleton className="h-72" />
            </div>
          ) : distData ? (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <h3 className="text-base font-semibold text-surface-900 mb-4">Return on Assets (ROA) Distribution</h3>
                  <DistributionChart
                    data={distData.roa.histogram}
                    mean={distData.roa.mean}
                    p25={distData.roa.p25}
                    p50={distData.roa.p50}
                    p75={distData.roa.p75}
                    label="ROA"
                    color="#2563eb"
                  />
                  <div className="mt-4 grid grid-cols-3 gap-3 pt-4 border-t border-surface-100">
                    {[
                      { label: 'Underperformers (<0.5%)', pct: distData.roa.histogram.filter((b: any) => b.max <= 0.5).reduce((s: number, b: any) => s + b.count, 0) },
                      { label: 'Average (0.5–1.5%)', pct: distData.roa.histogram.filter((b: any) => b.min >= 0.5 && b.max <= 1.5).reduce((s: number, b: any) => s + b.count, 0) },
                      { label: 'Top performers (>1.5%)', pct: distData.roa.histogram.filter((b: any) => b.min >= 1.5).reduce((s: number, b: any) => s + b.count, 0) },
                    ].map(b => (
                      <div key={b.label} className="text-center">
                        <p className="text-lg font-bold text-surface-900">{formatNumber(b.pct)}</p>
                        <p className="text-xs text-surface-400 mt-0.5">{b.label}</p>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card>
                  <h3 className="text-base font-semibold text-surface-900 mb-4">Return on Equity (ROE) Distribution</h3>
                  <DistributionChart
                    data={distData.roi.histogram}
                    mean={distData.roi.mean}
                    p25={distData.roi.p25}
                    p50={distData.roi.p50}
                    p75={distData.roi.p75}
                    label="ROE"
                    color="#7c3aed"
                  />
                  <div className="mt-4 grid grid-cols-3 gap-3 pt-4 border-t border-surface-100">
                    {[
                      { label: 'Negative ROE', pct: distData.roi.histogram.filter((b: any) => b.max <= 0).reduce((s: number, b: any) => s + b.count, 0) },
                      { label: 'Mid (0–15%)', pct: distData.roi.histogram.filter((b: any) => b.min >= 0 && b.max <= 15).reduce((s: number, b: any) => s + b.count, 0) },
                      { label: 'Strong (>15%)', pct: distData.roi.histogram.filter((b: any) => b.min >= 15).reduce((s: number, b: any) => s + b.count, 0) },
                    ].map(b => (
                      <div key={b.label} className="text-center">
                        <p className="text-lg font-bold text-surface-900">{formatNumber(b.pct)}</p>
                        <p className="text-xs text-surface-400 mt-0.5">{b.label}</p>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>

              <Card>
                <h3 className="text-base font-semibold text-surface-900 mb-1">Loan-to-Deposit Ratio Distribution</h3>
                <p className="text-xs text-surface-400 mb-4">
                  Measures how much of a bank's deposits are deployed as loans. Too high (&gt;90%) = liquidity risk; too low = inefficient use of funds.
                </p>
                <DistributionChart
                  data={distData.loan_to_deposit.histogram}
                  mean={distData.loan_to_deposit.mean}
                  p25={distData.loan_to_deposit.mean - 10}
                  p50={distData.loan_to_deposit.p50}
                  p75={distData.loan_to_deposit.mean + 10}
                  label="Loan-to-Deposit Ratio"
                  unit="%"
                  color="#0891b2"
                />
              </Card>
            </>
          ) : null}
        </div>
      )}

      {/* Tab: Concentration */}
      {activeTab === 'concentration' && (
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4">
            <p className="text-sm text-amber-900">
              <strong>The Concentration Problem:</strong> The U.S. banking system is highly concentrated — a handful of "too big to fail"
              banks hold the majority of assets, while thousands of community banks compete for the remainder.
              This is the banking equivalent of wealth inequality.
            </p>
          </div>

          {lbLoading ? (
            <Skeleton className="h-96 w-full" />
          ) : lbData?.concentration ? (
            <Card>
              <h3 className="text-base font-semibold text-surface-900 mb-6">U.S. Banking Asset Concentration</h3>
              <AssetConcentration data={lbData.concentration} />
            </Card>
          ) : null}
        </div>
      )}

      {/* Tab: Leaderboard */}
      {activeTab === 'leaderboard' && (
        <div className="space-y-4">
          <div className="bg-surface-50 border border-surface-200 rounded-xl p-4">
            <p className="text-sm text-surface-600">
              Rankings filtered to banks with $500M+ in assets. Switch metrics and sort direction to explore best and worst performers.
            </p>
          </div>
          <Card>
            <h3 className="text-base font-semibold text-surface-900 mb-4">Institution Rankings</h3>
            <Leaderboard />
          </Card>
        </div>
      )}

      {/* Tab: Correlations */}
      {activeTab === 'correlations' && (
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 rounded-xl p-4">
            <p className="text-sm text-indigo-900">
              Pearson correlation coefficients between key financial metrics across all FDIC-insured banks. Strong
              correlations reveal structural relationships in banking profitability.
            </p>
          </div>

          {corrLoading ? (
            <Skeleton className="h-96 w-full" />
          ) : corrData ? (
            <>
              <Card>
                <h3 className="text-base font-semibold text-surface-900 mb-1">Metric Correlation Matrix</h3>
                <p className="text-xs text-surface-400 mb-5">
                  Based on {formatNumber(corrData.count)} institutions with complete data
                </p>
                <CorrelationHeatmap
                  matrix={corrData.matrix}
                  metrics={corrData.metrics}
                  count={corrData.count}
                />
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <p className="text-sm font-semibold text-blue-900 mb-1">ROA and ROE: highly correlated</p>
                  <p className="text-sm text-blue-800">
                    ROA and ROE typically show a strong positive correlation (r &asymp; 0.85), but large banks can sustain high
                    ROE with lower ROA by using leverage — equity multipliers above 10&times; allow mega-banks to amplify
                    returns on thin asset margins.
                  </p>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                  <p className="text-sm font-semibold text-purple-900 mb-1">Size and profitability</p>
                  <p className="text-sm text-purple-800">
                    Log Assets vs ROA often shows a weak or near-zero correlation — being large does not guarantee
                    profitability. Many mega-banks have lower ROA than well-run community banks; scale confers cost advantages
                    but also regulatory burdens and lower-margin business mix.
                  </p>
                </div>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* Tab: State Grid */}
      {activeTab === 'state-grid' && (
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-4">
            <p className="text-sm text-green-900">
              State-level averages across{' '}
              {stateData
                ? formatNumber(stateData.states.reduce((s: number, r: any) => s + r.institution_count, 0))
                : '…'}{' '}
              institutions. Color = percentile rank within the dataset. Only states with at least 5 active institutions are shown.
            </p>
          </div>

          {stateLoading ? (
            <Skeleton className="h-[600px] w-full" />
          ) : stateData ? (
            <Card padding={false} className="overflow-hidden">
              <div className="px-5 pt-5 pb-3 border-b border-surface-100">
                <h3 className="text-base font-semibold text-surface-900">State × Metric Heatmap</h3>
                <p className="text-xs text-surface-400 mt-0.5">
                  Rows sorted by avg ROA (highest first). Hover a cell for its percentile rank.
                </p>
              </div>
              <div className="p-5">
                <StateMetricGrid states={stateData.states} />
              </div>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
