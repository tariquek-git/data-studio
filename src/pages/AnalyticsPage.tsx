import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area, Cell,
} from 'recharts';
import {
  Building2,
  DollarSign,
  Map,
  Award,
  TrendingUp,
  Activity,
  Layers,
  Table2,
  ArrowUpRight,
  Globe2,
  ShieldCheck,
  Signal,
  Database,
  Sparkles,
  Landmark,
  BarChart2,
} from 'lucide-react';
import { Badge, Card, Skeleton } from '@/components/ui';
import { DistributionChart } from '@/components/analytics/DistributionChart';
import { AssetConcentration } from '@/components/analytics/AssetConcentration';
import { Leaderboard } from '@/components/analytics/Leaderboard';
import { CorrelationHeatmap } from '@/components/analytics/CorrelationHeatmap';
import { StateMetricGrid } from '@/components/analytics/StateMetricGrid';
import { RatesStrip } from '@/components/analytics/RatesStrip';
import { CMHCSnapshot } from '@/components/analytics/CMHCSnapshot';
import { BubbleChart } from '@/components/market/BubbleChart';
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
  source_posture?: Array<{
    source_key: string;
    status: string;
    institution_count: number | null;
    data_as_of: string | null;
    last_synced_at: string | null;
  }>;
  warehouse_summary?: {
    registry_entities: number | null;
    entity_relationships: number | null;
    charter_events: number | null;
    failure_events: number | null;
    macro_series: number | null;
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

interface MarketMapInstitution {
  cert_number: number;
  name: string;
  state: string | null;
  charter_type: string | null;
  total_assets: number;
  roa: number;
  roi: number;
  num_branches: number | null;
  size_bucket: string;
  bubble_r: number;
}

interface MarketMapData {
  institutions: MarketMapInstitution[];
  count: number;
  stats: {
    median_roa: number;
    mean_roa: number;
    median_roi: number;
    mean_roi: number;
  };
}

const MM_SIZE_BUCKETS = [
  { value: '', label: 'All Sizes' },
  { value: 'mega', label: 'Mega ($250B+)' },
  { value: 'large', label: 'Large ($10B+)' },
  { value: 'regional', label: 'Regional ($1B+)' },
  { value: 'community', label: 'Community ($100M+)' },
  { value: 'small', label: 'Small (<$100M)' },
];

const MM_CHARTER_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'savings', label: 'Savings' },
  { value: 'savings_association', label: 'Savings Assoc.' },
];

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

async function fetchMarketMap(sizeBucket: string, charterType: string): Promise<MarketMapData> {
  const params = new URLSearchParams();
  if (sizeBucket) params.set('size_bucket', sizeBucket);
  if (charterType) params.set('charter_type', charterType);
  const res = await fetch(`/api/analytics/market-map?${params}`);
  if (!res.ok) throw new Error('Failed to load market map');
  return res.json();
}

const CHARTER_COLORS: Record<string, string> = {
  commercial: '#2563eb',
  savings: '#7c3aed',
  savings_association: '#0891b2',
  other: '#64748b',
};

type TabId = 'overview' | 'distribution' | 'concentration' | 'leaderboard' | 'correlations' | 'state-grid' | 'market-map';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <Building2 className="w-4 h-4" /> },
  { id: 'distribution', label: 'Distributions', icon: <Activity className="w-4 h-4" /> },
  { id: 'concentration', label: 'Concentration', icon: <DollarSign className="w-4 h-4" /> },
  { id: 'leaderboard', label: 'Leaderboard', icon: <Award className="w-4 h-4" /> },
  { id: 'correlations', label: 'Correlations', icon: <Layers className="w-4 h-4" /> },
  { id: 'state-grid', label: 'State Grid', icon: <Table2 className="w-4 h-4" /> },
  { id: 'market-map', label: 'Market Map', icon: <BarChart2 className="w-4 h-4" /> },
];

function formatCompactShare(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toLocaleString();
}

function sortedEntries(record: Record<string, number>, limit?: number) {
  return Object.entries(record)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit ?? undefined);
}

function sumEntries(record: Record<string, number>) {
  return Object.values(record).reduce((sum, value) => sum + value, 0);
}

function terminalTone(index: number) {
  return ['text-cyan-600', 'text-emerald-600', 'text-amber-600', 'text-sky-600', 'text-violet-600'][index % 5];
}

function TerminalStatCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = 'text-cyan-600',
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: string;
}) {
  return (
    <Card className="!border-slate-200 !bg-slate-50/80 !text-slate-900 !shadow-2xl !shadow-slate-200/50">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
          <p className="mt-1 text-xs text-slate-400">{detail}</p>
        </div>
        <div className={`rounded-2xl border border-slate-200 bg-white p-2.5 ${tone}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

function SourceBar({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: string;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-medium text-slate-800">{label}</span>
        <span className="font-mono text-slate-400">
          {formatCompactShare(value)} · {pct.toFixed(1)}%
        </span>
      </div>
      <div className="h-2.5 rounded-full bg-slate-100/80 overflow-hidden">
        <div
          className={`h-full rounded-full ${tone}`}
          style={{ width: `${Math.max(pct, value > 0 ? 2 : 0)}%` }}
        />
      </div>
    </div>
  );
}

function ContextPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.22em] text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

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

  const [mmSizeBucket, setMmSizeBucket] = useState('');
  const [mmCharterType, setMmCharterType] = useState('');
  const { data: mmData, isLoading: mmLoading } = useQuery({
    queryKey: ['analytics-market-map', mmSizeBucket, mmCharterType],
    queryFn: () => fetchMarketMap(mmSizeBucket, mmCharterType),
    enabled: activeTab === 'market-map',
    staleTime: 10 * 60 * 1000,
  });

  const totalSourceFeeds = overview?.source_registry?.tracked ?? Object.keys(overview?.total_by_source ?? {}).length;
  const activeSourceFeeds = overview?.source_registry?.active ?? 0;
  const pendingSourceFeeds = overview?.source_registry?.pending ?? 0;
  const unavailableSourceFeeds = overview?.source_registry?.unavailable ?? 0;
  const sourceEntries = sortedEntries(overview?.total_by_source ?? {}, 6);
  const countryEntries = sortedEntries(overview?.total_by_country ?? {}, 4);
  const totalCountries = Object.keys(overview?.total_by_country ?? {}).length;
  const topSourcePosture = [...(overview?.source_posture ?? [])]
    .sort((a, b) => (b.institution_count ?? 0) - (a.institution_count ?? 0))
    .slice(0, 5);
  const warehouseCards = overview?.warehouse_summary
    ? [
        { label: 'Registry', value: overview.warehouse_summary.registry_entities, tone: 'text-cyan-600' },
        { label: 'Relationships', value: overview.warehouse_summary.entity_relationships, tone: 'text-violet-600' },
        { label: 'Charter events', value: overview.warehouse_summary.charter_events, tone: 'text-amber-600' },
        { label: 'Failures', value: overview.warehouse_summary.failure_events, tone: 'text-rose-600' },
        { label: 'Macro series', value: overview.warehouse_summary.macro_series, tone: 'text-sky-600' },
      ]
    : [];

  const summaryStats = overview
    ? [
        { label: 'Tracked Institutions', value: formatNumber(overview.total_institutions), icon: Building2, detail: 'US + Canada regulated coverage', tone: 'text-cyan-600' },
        { label: 'Total Banking Assets', value: formatCurrency(overview.total_assets_sum), icon: DollarSign, detail: 'Aggregated across active institutions', tone: 'text-emerald-600' },
        { label: 'Active Source Feeds', value: formatNumber(activeSourceFeeds || totalSourceFeeds), icon: TrendingUp, detail: `${pendingSourceFeeds} queued · ${unavailableSourceFeeds} unavailable`, tone: 'text-amber-600' },
        { label: 'States / Provinces', value: formatNumber(overview.by_state.length), icon: Map, detail: `${totalCountries} countries represented`, tone: 'text-violet-600' },
      ]
    : [];

  // Detect Canadian institutions from overview data
  const hasCanadianInstitutions =
    !!overview &&
    ((overview.total_by_source?.osfi ?? 0) > 0 ||
      (overview.total_by_source?.rpaa ?? 0) > 0);

  return (
    <div className="relative min-h-screen overflow-hidden bg-white text-slate-900">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.08),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(59,130,246,0.06),_transparent_26%)]" />
      <div className="absolute inset-0 opacity-[0.08] bg-[linear-gradient(rgba(148,163,184,0.22)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.18)_1px,transparent_1px)] bg-[size:36px_36px]" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Command center header */}
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge color="gray" className="bg-cyan-50 text-cyan-700 ring-cyan-200">
                Bloomberg-style analytics terminal
              </Badge>
              <Badge color="green" className="bg-emerald-50 text-emerald-700 ring-emerald-200">
                live source posture
              </Badge>
              <Badge color="blue" className="bg-sky-50 text-sky-700 ring-sky-200">
                U.S. + Canada
              </Badge>
            </div>

            <div className="space-y-3">
              <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900">
                Industry Analytics
              </h1>
              <p className="max-w-3xl text-sm sm:text-base text-slate-700 leading-relaxed">
                A command-center view of North American financial infrastructure, with source-backed coverage,
                regulator context, market concentration, and the signals that matter for banking and fintech diligence.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                to="/entities"
                className="inline-flex items-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-3.5 py-2 text-sm font-medium text-cyan-700 transition-colors hover:bg-cyan-100"
              >
                <Database className="h-4 w-4" />
                Entity terminal
              </Link>
              <Link
                to="/market"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2 text-sm font-medium text-slate-900 transition-colors hover:border-slate-300 hover:bg-slate-100"
              >
                <ArrowUpRight className="h-4 w-4" />
                Market map
              </Link>
              <Link
                to="/sources"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2 text-sm font-medium text-slate-900 transition-colors hover:border-slate-300 hover:bg-slate-100"
              >
                <Signal className="h-4 w-4" />
                Source registry
              </Link>
            </div>
          </div>

          <Card className="!border-slate-200 !bg-slate-50/80 !text-slate-900 !shadow-2xl !shadow-slate-200/50">
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.25em] text-slate-400">Coverage posture</p>
                  <p className="mt-1 text-xl font-semibold text-slate-900">Official feeds + curated signals</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-2 text-cyan-600">
                  <ShieldCheck className="h-5 w-5" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <ContextPill label="Tracked sources" value={`${formatNumber(totalSourceFeeds)} feeds`} />
                <ContextPill label="Active sources" value={`${formatNumber(activeSourceFeeds)} live`} />
                <ContextPill label="Queued sources" value={`${formatNumber(pendingSourceFeeds)} pending`} />
                <ContextPill label="Countries" value={`${formatNumber(totalCountries || 0)} in scope`} />
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Signal summary</p>
                <div className="mt-3 grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-sm text-slate-400">Institutions</p>
                    <p className="text-lg font-semibold text-slate-900">{formatNumber(overview?.total_institutions ?? null)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-400">Assets</p>
                    <p className="text-lg font-semibold text-slate-900">{formatCurrency(overview?.total_assets_sum ?? null)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-400">States / provinces</p>
                    <p className="text-lg font-semibold text-slate-900">{formatNumber(overview?.by_state.length ?? null)}</p>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>

        <RatesStrip />

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
          <Card className="!border-slate-200 !bg-slate-50/80 !text-slate-900">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.25em] text-slate-400">Coverage mix</p>
                <h2 className="mt-1 text-lg font-semibold text-slate-900">Source concentration and geography</h2>
              </div>
              <Badge color="gray" className="bg-white text-slate-700 ring-slate-200/80">
                official + curated
              </Badge>
            </div>

            <div className="mt-4 space-y-5">
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Top source feeds</span>
                  <span>Share of tracked institutions</span>
                </div>
                {sourceEntries.length > 0 ? (
                  <div className="space-y-3">
                    {sourceEntries.map(([source, count], idx) => (
                      <SourceBar
                        key={source}
                        label={source.replace(/_/g, ' ')}
                        value={count}
                        total={overview?.total_institutions ?? count}
                        tone={terminalTone(idx)}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">Source coverage appears once overview data loads.</p>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200/80 bg-white p-3">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-slate-400">
                    <Globe2 className="h-4 w-4 text-cyan-600" />
                    Geography mix
                  </div>
                  <div className="mt-3 space-y-2.5">
                    {countryEntries.map(([country, count], idx) => (
                      <SourceBar
                        key={country}
                        label={country === 'US' ? 'United States' : country === 'CA' ? 'Canada' : country}
                        value={count}
                        total={sumEntries(overview?.total_by_country ?? {})}
                        tone={terminalTone(idx + 1)}
                      />
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200/80 bg-white p-3">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-slate-400">
                    <Landmark className="h-4 w-4 text-emerald-600" />
                    Watchpoints
                  </div>
                  <div className="mt-3 space-y-3 text-sm text-slate-700">
                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2">
                      {activeSourceFeeds > 0
                        ? `${formatNumber(activeSourceFeeds)} active feeds are live; ${formatNumber(unavailableSourceFeeds)} are unavailable.`
                        : 'Active source status will appear once the overview query resolves.'}
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2">
                      The dashboard is optimized for drill-up/drill-down research across regulated entities.
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2">
                      Use the entity terminal to compare institution context, history, source posture, and relationship depth.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <Card className="!border-slate-200 !bg-slate-50/80 !text-slate-900">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.25em] text-slate-400">Command deck</p>
                <h2 className="mt-1 text-lg font-semibold text-slate-900">Fast paths</h2>
              </div>
              <Sparkles className="h-5 w-5 text-amber-600" />
            </div>

            <div className="mt-4 grid gap-3">
              <Link
                to="/entities"
                className="group rounded-2xl border border-slate-200 bg-white p-3 transition-colors hover:border-cyan-500/40 hover:bg-slate-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Entity intelligence</p>
                    <p className="mt-1 text-xs text-slate-400">
                      Drill into banks, credit unions, and registries with contextual rails.
                    </p>
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-slate-400 transition-colors group-hover:text-cyan-600" />
                </div>
              </Link>
              <Link
                to="/analytics"
                className="group rounded-2xl border border-slate-200 bg-white p-3 transition-colors hover:border-emerald-500/40 hover:bg-slate-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Market analytics</p>
                    <p className="mt-1 text-xs text-slate-400">
                      Explore concentration, correlations, state heatmaps, and distribution views.
                    </p>
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-slate-400 transition-colors group-hover:text-emerald-600" />
                </div>
              </Link>
              <Link
                to="/sources"
                className="group rounded-2xl border border-slate-200 bg-white p-3 transition-colors hover:border-violet-500/40 hover:bg-slate-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Source registry</p>
                    <p className="mt-1 text-xs text-slate-400">
                      See official feeds, queued sources, and the current coverage posture.
                    </p>
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-slate-400 transition-colors group-hover:text-violet-600" />
                </div>
              </Link>
            </div>
          </Card>
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
                <TerminalStatCard
                  key={stat.label}
                  label={stat.label}
                  value={stat.value}
                  detail={stat.detail}
                  icon={Icon}
                  tone={stat.tone}
                />
              );
            })}
          </div>
        )}

        {overview && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)]">
            <Card className="!border-slate-200 !bg-slate-50/80 !text-slate-900">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.25em] text-slate-400">Freshness board</p>
                  <h2 className="mt-1 text-lg font-semibold text-slate-900">Top loaded sources</h2>
                </div>
                <Signal className="h-5 w-5 text-cyan-600" />
              </div>
              <div className="mt-4 space-y-3">
                {topSourcePosture.length > 0 ? topSourcePosture.map((source) => (
                  <div key={source.source_key} className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{source.source_key.replace(/_/g, ' ')}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {source.status.toUpperCase()}
                        {source.data_as_of ? ` · data as of ${source.data_as_of}` : ''}
                        {source.last_synced_at ? ` · synced ${new Date(source.last_synced_at).toLocaleDateString('en-US')}` : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-semibold ${terminalTone(0)}`}>{formatCompactShare(source.institution_count ?? 0)}</p>
                      <p className="text-xs text-slate-500">records</p>
                    </div>
                  </div>
                )) : (
                  <p className="text-sm text-slate-400">Source freshness will populate as the registry sync metadata fills in.</p>
                )}
              </div>
            </Card>

            <Card className="!border-slate-200 !bg-slate-50/80 !text-slate-900">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.25em] text-slate-400">Warehouse layers</p>
                  <h2 className="mt-1 text-lg font-semibold text-slate-900">Context model depth</h2>
                </div>
                <Database className="h-5 w-5 text-emerald-600" />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {warehouseCards.map((card) => (
                  <div key={card.label} className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">{card.label}</p>
                    <p className={`mt-2 text-xl font-semibold ${card.tone}`}>{formatNumber(card.value ?? 0)}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* Tabs */}
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50/80 p-1 shadow-2xl shadow-slate-200/50">
          <nav className="flex gap-1 min-w-max">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-cyan-100 text-cyan-900 shadow-sm'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
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
              <div className="mb-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-surface-500">Entity mix</p>
                <h3 className="mt-1 text-base font-semibold text-surface-100">Charter Type Breakdown</h3>
              </div>
              <div className="space-y-3">
                {Object.entries(overview.total_by_charter_type)
                  .sort((a, b) => b[1] - a[1])
                  .map(([type, count]) => {
                    const total = Object.values(overview.total_by_charter_type).reduce((a, b) => a + b, 0);
                    const pct = (count / total) * 100;
                    return (
                      <div key={type}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium text-surface-300 capitalize">{type.replace(/_/g, ' ')}</span>
                          <span className="text-surface-500">{formatNumber(count)} ({formatPercent(pct, 0)})</span>
                        </div>
                        <div className="h-2.5 bg-surface-800 rounded-full overflow-hidden">
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
              <div className="mb-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-surface-500">Regulatory context</p>
                <h3 className="mt-1 text-base font-semibold text-surface-100">Primary Regulator</h3>
              </div>
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
            <div className="mb-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-surface-500">Geographic footprint</p>
              <h3 className="mt-1 text-base font-semibold text-surface-100">Institutions by State</h3>
            </div>
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
            <div className="mb-1">
              <p className="text-[11px] uppercase tracking-[0.22em] text-surface-500">Asset geography</p>
              <h3 className="text-base font-semibold text-surface-100">Total Assets by State (Top 20)</h3>
            </div>
            <p className="text-xs text-surface-500 mb-4">New York and North Carolina dominate due to mega-bank headquarters</p>
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
          <div className="bg-cyan-50 border border-cyan-200 rounded-2xl p-4">
            <p className="text-sm text-cyan-800">
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
                  <h3 className="text-base font-semibold text-surface-100 mb-4">Return on Assets (ROA) Distribution</h3>
                  <DistributionChart
                    data={distData.roa.histogram}
                    mean={distData.roa.mean}
                    p25={distData.roa.p25}
                    p50={distData.roa.p50}
                    p75={distData.roa.p75}
                    label="ROA"
                    color="#2563eb"
                  />
                  <div className="mt-4 grid grid-cols-3 gap-3 pt-4 border-t border-surface-800">
                    {[
                      { label: 'Underperformers (<0.5%)', pct: distData.roa.histogram.filter((b: any) => b.max <= 0.5).reduce((s: number, b: any) => s + b.count, 0) },
                      { label: 'Average (0.5–1.5%)', pct: distData.roa.histogram.filter((b: any) => b.min >= 0.5 && b.max <= 1.5).reduce((s: number, b: any) => s + b.count, 0) },
                      { label: 'Top performers (>1.5%)', pct: distData.roa.histogram.filter((b: any) => b.min >= 1.5).reduce((s: number, b: any) => s + b.count, 0) },
                    ].map(b => (
                      <div key={b.label} className="text-center">
                        <p className="text-lg font-bold text-surface-100">{formatNumber(b.pct)}</p>
                        <p className="text-xs text-surface-500 mt-0.5">{b.label}</p>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card>
                  <h3 className="text-base font-semibold text-surface-100 mb-4">Return on Equity (ROE) Distribution</h3>
                  <DistributionChart
                    data={distData.roi.histogram}
                    mean={distData.roi.mean}
                    p25={distData.roi.p25}
                    p50={distData.roi.p50}
                    p75={distData.roi.p75}
                    label="ROE"
                    color="#7c3aed"
                  />
                  <div className="mt-4 grid grid-cols-3 gap-3 pt-4 border-t border-surface-800">
                    {[
                      { label: 'Negative ROE', pct: distData.roi.histogram.filter((b: any) => b.max <= 0).reduce((s: number, b: any) => s + b.count, 0) },
                      { label: 'Mid (0–15%)', pct: distData.roi.histogram.filter((b: any) => b.min >= 0 && b.max <= 15).reduce((s: number, b: any) => s + b.count, 0) },
                      { label: 'Strong (>15%)', pct: distData.roi.histogram.filter((b: any) => b.min >= 15).reduce((s: number, b: any) => s + b.count, 0) },
                    ].map(b => (
                      <div key={b.label} className="text-center">
                        <p className="text-lg font-bold text-surface-100">{formatNumber(b.pct)}</p>
                        <p className="text-xs text-surface-500 mt-0.5">{b.label}</p>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>

              <Card>
                <h3 className="text-base font-semibold text-surface-100 mb-1">Loan-to-Deposit Ratio Distribution</h3>
                <p className="text-xs text-surface-500 mb-4">
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
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <p className="text-sm text-amber-800">
              <strong>The Concentration Problem:</strong> The U.S. banking system is highly concentrated — a handful of "too big to fail"
              banks hold the majority of assets, while thousands of community banks compete for the remainder.
              This is the banking equivalent of wealth inequality.
            </p>
          </div>

          {lbLoading ? (
            <Skeleton className="h-96 w-full" />
          ) : lbData?.concentration ? (
            <Card>
              <h3 className="text-base font-semibold text-surface-100 mb-6">U.S. Banking Asset Concentration</h3>
              <AssetConcentration data={lbData.concentration} />
            </Card>
          ) : null}
        </div>
      )}

      {/* Tab: Leaderboard */}
      {activeTab === 'leaderboard' && (
        <div className="space-y-4">
          <div className="bg-slate-50/70 border border-slate-200 rounded-2xl p-4">
            <p className="text-sm text-slate-700">
              Rankings filtered to banks with $500M+ in assets. Switch metrics and sort direction to explore best and worst performers.
            </p>
          </div>
          <Card>
            <h3 className="text-base font-semibold text-surface-100 mb-4">Institution Rankings</h3>
            <Leaderboard />
          </Card>
        </div>
      )}

      {/* Tab: Correlations */}
      {activeTab === 'correlations' && (
        <div className="space-y-6">
          <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4">
            <p className="text-sm text-indigo-800">
              Pearson correlation coefficients between key financial metrics across all FDIC-insured banks. Strong
              correlations reveal structural relationships in banking profitability.
            </p>
          </div>

          {corrLoading ? (
            <Skeleton className="h-96 w-full" />
          ) : corrData ? (
            <>
              <Card>
                <h3 className="text-base font-semibold text-surface-100 mb-1">Metric Correlation Matrix</h3>
                <p className="text-xs text-surface-500 mb-5">
                  Based on {formatNumber(corrData.count)} institutions with complete data
                </p>
                <CorrelationHeatmap
                  matrix={corrData.matrix}
                  metrics={corrData.metrics}
                  count={corrData.count}
                />
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-50/70 border border-slate-200 rounded-2xl p-4">
                  <p className="text-sm font-semibold text-cyan-700 mb-1">ROA and ROE: highly correlated</p>
                  <p className="text-sm text-slate-700">
                    ROA and ROE typically show a strong positive correlation (r &asymp; 0.85), but large banks can sustain high
                    ROE with lower ROA by using leverage — equity multipliers above 10&times; allow mega-banks to amplify
                    returns on thin asset margins.
                  </p>
                </div>
                <div className="bg-slate-50/70 border border-slate-200 rounded-2xl p-4">
                  <p className="text-sm font-semibold text-violet-700 mb-1">Size and profitability</p>
                  <p className="text-sm text-slate-700">
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
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
            <p className="text-sm text-emerald-800">
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
              <div className="px-5 pt-5 pb-3 border-b border-surface-800">
                <h3 className="text-base font-semibold text-surface-100">State × Metric Heatmap</h3>
                <p className="text-xs text-surface-500 mt-0.5">
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

      {/* Tab: Market Map */}
      {activeTab === 'market-map' && (
        <div className="space-y-6">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={mmSizeBucket}
              onChange={e => setMmSizeBucket(e.target.value)}
              className="text-sm border border-surface-600 rounded-lg px-3 py-2 bg-white text-surface-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {MM_SIZE_BUCKETS.map(b => (
                <option key={b.value} value={b.value}>{b.label}</option>
              ))}
            </select>
            <select
              value={mmCharterType}
              onChange={e => setMmCharterType(e.target.value)}
              className="text-sm border border-surface-600 rounded-lg px-3 py-2 bg-white text-surface-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {MM_CHARTER_TYPES.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            {mmData && (
              <div className="flex flex-wrap gap-3 ml-1">
                {[
                  { label: 'Median ROA', value: formatPercent(mmData.stats.median_roa) },
                  { label: 'Mean ROA', value: formatPercent(mmData.stats.mean_roa) },
                  { label: 'Median ROE', value: formatPercent(mmData.stats.median_roi) },
                  { label: 'Institutions', value: formatNumber(mmData.count) },
                ].map(s => (
                  <div key={s.label} className="flex items-center gap-2 bg-surface-900 border border-surface-700 rounded-full px-3 py-1">
                    <span className="text-xs text-surface-500">{s.label}</span>
                    <span className="text-sm font-semibold text-surface-100">{s.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quadrant legend */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { icon: TrendingUp, label: 'High ROA + High ROE', desc: 'Efficient capital generators', color: 'bg-green-50 text-green-700 border-green-200' },
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

          {/* Chart */}
          <Card className="overflow-hidden">
            {mmLoading ? (
              <Skeleton className="h-[560px] w-full" />
            ) : mmData ? (
              <BubbleChart institutions={mmData.institutions} stats={mmData.stats} />
            ) : (
              <div className="h-64 flex items-center justify-center text-surface-500 text-sm">
                Failed to load data
              </div>
            )}
          </Card>

          {/* How-to */}
          <div className="bg-gradient-to-r from-primary-50 to-cyan-50 border border-primary-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-primary-900 mb-2">How to read this chart</h3>
            <ul className="text-sm text-primary-800 space-y-1.5">
              <li>• <strong>Upper-right quadrant:</strong> High ROA + High ROE — top performers generating strong returns on both assets and equity.</li>
              <li>• <strong>Bubble size</strong> represents total assets on a logarithmic scale.</li>
              <li>• <strong>Dashed lines</strong> show industry median ROA and ROE.</li>
              <li>• <strong>Click any bubble</strong> to view the full institution profile.</li>
            </ul>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
