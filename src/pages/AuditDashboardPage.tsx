import { useQuery } from '@tanstack/react-query';
import {
  ShieldCheck, Database, RefreshCw, AlertTriangle, CheckCircle2,
  XCircle, Clock, TrendingUp, FileText, Link2, ChevronDown, ChevronRight,
  Activity, Layers, Eye, Zap,
} from 'lucide-react';
import { Fragment, useState } from 'react';

/* ─── Types ─── */

interface SyncJob {
  id: string;
  source: string;
  status: string;
  records_processed: number;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
  created_at: string;
}

interface SyncBySource {
  source: string;
  lastRun: string | null;
  lastStatus: string;
  totalRuns: number;
  totalFailed: number;
}

interface SourceHealth {
  source_key: string;
  display_name: string;
  description: string | null;
  country: string;
  status: string;
  institution_count: number | null;
  last_synced_at: string | null;
  data_as_of: string | null;
  update_frequency: string | null;
  regulator_url: string | null;
  data_url: string | null;
  daysSinceSync: number | null;
  freshness: 'fresh' | 'stale' | 'very_stale' | 'never_synced';
  record_count?: number | null;
  avg_confidence?: number | null;
  low_confidence_records?: number | null;
  missing_provenance_records?: number | null;
  recommendation?: string | null;
  issues?: string[];
  reasoned?: boolean;
}

interface HistogramBucket {
  bucket: string;
  count: number;
}

interface AdminSourceConfidence {
  total_records: number;
  scored_records: number;
  missing_score_records: number;
  with_provenance_records: number;
  missing_provenance_records: number;
  high_confidence_records: number;
  medium_confidence_records: number;
  low_confidence_records: number;
  unverified_records: number;
  avg_score: number | null;
}

interface AdminSourceSyncRun {
  source: string;
  status: string | null;
  records_processed: number | null;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
  created_at: string | null;
}

interface AdminSourceHealthRecord {
  source_key: string;
  display_name: string;
  description: string | null;
  country: string;
  category_label: string;
  status: string;
  loaded: boolean;
  coverage_type: string;
  coverage_label: string;
  record_count: number | null;
  institution_count: number | null;
  update_frequency: string | null;
  data_as_of: string | null;
  last_synced_at: string | null;
  regulator_url: string | null;
  data_url: string | null;
  latest_job_status: string | null;
  sync_supported: boolean;
  sync_ready: boolean | null;
  sync_endpoint: string | null;
  sync: {
    supported: boolean;
    ready: boolean;
    endpoint: string | null;
    execution_kind: string;
    script_path: string | null;
    supports_dry_run: boolean;
    requirements: Array<{
      code: string;
      label: string;
      ready: boolean;
      optional: boolean;
    }>;
    notes: string[];
  } | null;
  sync_last_run: AdminSourceSyncRun | null;
  confidence: AdminSourceConfidence;
  issues: string[];
  blockers: string[];
  recommendation: string;
}

interface AdminHealthSummary {
  total_sources: number;
  active_sources: number;
  pending_sources: number;
  unavailable_sources: number;
  loaded_sources: number;
  ready_sync_sources: number;
  blocked_sync_sources: number;
  sources_with_low_confidence: number;
  sources_with_missing_provenance: number;
  registry_records_total: number;
  registry_records_with_score: number;
  registry_records_with_provenance: number;
  overall_audibility_score: number;
}

interface AdminHealthResponse {
  generated_at: string;
  filters: {
    q: string | null;
    status: string | null;
    source_key: string | null;
    min_confidence: number | null;
    issues_only: boolean;
  };
  summary: AdminHealthSummary;
  sources: AdminSourceHealthRecord[];
}

interface LineageTable {
  total: number;
  withSyncJob: number;
}

interface AuditOverview {
  syncJobSummary: {
    total: number;
    completed: number;
    failed: number;
    running: number;
    pending: number;
  };
  syncBySource: SyncBySource[];
  recentJobs: SyncJob[];
  sourceHealth: SourceHealth[];
  confidenceDistribution: {
    high: number;
    medium: number;
    low: number;
    unverified: number;
  };
  scoreHistogram: HistogramBucket[];
  sourceKindBreakdown: {
    official: number;
    company: number;
    curated: number;
    unknown: number;
  };
  factScoreHistogram: HistogramBucket[];
  lineage: {
    facts: LineageTable;
    tags: LineageTable;
    relationships: LineageTable;
  };
  warehouseCounts: Record<string, number>;
  provenanceCoverage: {
    total: number;
    withProvenance: number;
  };
  generatedAt: string;
}

/* ─── Helpers ─── */

function pct(n: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((n / total) * 100)}%`;
}

function ago(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const ms = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function freshnessFromLastSync(lastSyncedAt: string | null): SourceHealth['freshness'] {
  if (!lastSyncedAt) return 'never_synced';

  const ms = Date.now() - new Date(lastSyncedAt).getTime();
  const daysSinceSync = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (daysSinceSync <= 7) return 'fresh';
  if (daysSinceSync <= 30) return 'stale';
  return 'very_stale';
}

function mapAdminSourcesToDisplay(sources: AdminSourceHealthRecord[]): SourceHealth[] {
  return sources.map((source) => {
    const daysSinceSync = source.last_synced_at ? Math.floor((Date.now() - new Date(source.last_synced_at).getTime()) / (1000 * 60 * 60 * 24)) : null;
    return {
      source_key: source.source_key,
      display_name: source.display_name,
      description: source.description,
      country: source.country,
      status: source.sync_ready === false ? 'unavailable' : source.status,
      institution_count: source.institution_count,
      last_synced_at: source.last_synced_at,
      data_as_of: source.data_as_of,
      update_frequency: source.update_frequency,
      regulator_url: source.regulator_url,
      data_url: source.data_url,
      daysSinceSync,
      freshness: freshnessFromLastSync(source.last_synced_at),
      record_count: source.record_count,
      avg_confidence: source.confidence.avg_score,
      low_confidence_records: source.confidence.low_confidence_records,
      missing_provenance_records: source.confidence.missing_provenance_records,
      recommendation: source.recommendation,
      issues: [...source.issues],
      reasoned: true,
    };
  });
}

function freshnessColor(f: SourceHealth['freshness']): string {
  switch (f) {
    case 'fresh': return 'text-emerald-600 bg-emerald-50';
    case 'stale': return 'text-amber-600 bg-amber-50';
    case 'very_stale': return 'text-red-600 bg-red-50';
    case 'never_synced': return 'text-surface-500 bg-surface-900';
  }
}

function statusIcon(status: string) {
  switch (status) {
    case 'completed': return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    case 'failed': return <XCircle className="h-4 w-4 text-red-500" />;
    case 'running': return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />;
    default: return <Clock className="h-4 w-4 text-surface-500" />;
  }
}

function confidenceColor(level: string): string {
  switch (level) {
    case 'high': return 'bg-emerald-500';
    case 'medium': return 'bg-amber-500';
    case 'low': return 'bg-red-500';
    default: return 'bg-surface-600';
  }
}

/* ─── Components ─── */

function StatCard({ label, value, icon: Icon, sub, color = 'text-surface-100' }: {
  label: string;
  value: string | number;
  icon: typeof Database;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-surface-700 p-4 flex items-start gap-3">
      <div className="p-2 rounded-lg bg-surface-900">
        <Icon className={`h-5 w-5 ${color}`} />
      </div>
      <div className="min-w-0">
        <p className="text-sm text-surface-500">{label}</p>
        <p className={`text-2xl font-semibold ${color}`}>{typeof value === 'number' ? value.toLocaleString() : value}</p>
        {sub && <p className="text-xs text-surface-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function ConfidenceBar({ distribution }: { distribution: AuditOverview['confidenceDistribution'] }) {
  const total = distribution.high + distribution.medium + distribution.low + distribution.unverified;
  if (total === 0) return <p className="text-sm text-surface-500">No entities</p>;

  const segments = [
    { key: 'high', label: 'High', count: distribution.high, color: 'bg-emerald-500' },
    { key: 'medium', label: 'Medium', count: distribution.medium, color: 'bg-amber-500' },
    { key: 'low', label: 'Low', count: distribution.low, color: 'bg-red-500' },
    { key: 'unverified', label: 'Unverified', count: distribution.unverified, color: 'bg-surface-600' },
  ];

  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden mb-3">
        {segments.map(s => (
          s.count > 0 && (
            <div
              key={s.key}
              className={`${s.color} transition-all`}
              style={{ width: `${(s.count / total) * 100}%` }}
              title={`${s.label}: ${s.count} (${pct(s.count, total)})`}
            />
          )
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {segments.map(s => (
          <div key={s.key} className="flex items-center gap-1.5">
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${s.color}`} />
            <span className="text-surface-400">{s.label}</span>
            <span className="font-medium text-surface-200">{s.count.toLocaleString()}</span>
            <span className="text-surface-500">({pct(s.count, total)})</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScoreHistogram({ data, label }: { data: HistogramBucket[]; label: string }) {
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div>
      <p className="text-sm font-medium text-surface-300 mb-2">{label}</p>
      <div className="flex items-end gap-1 h-24">
        {data.map(d => (
          <div key={d.bucket} className="flex-1 flex flex-col items-center gap-1">
            <div
              className="w-full bg-primary-500 rounded-t transition-all"
              style={{ height: `${Math.max((d.count / max) * 100, 2)}%` }}
              title={`${d.bucket}: ${d.count}`}
            />
            <span className="text-[10px] text-surface-500 leading-none">{d.bucket.split('-')[0]}</span>
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-surface-500 mt-1">
        <span>Low confidence</span>
        <span>High confidence</span>
      </div>
    </div>
  );
}

function LineageCompleteness({ lineage }: { lineage: AuditOverview['lineage'] }) {
  const tables = [
    { label: 'Facts', ...lineage.facts },
    { label: 'Tags', ...lineage.tags },
    { label: 'Relationships', ...lineage.relationships },
  ];

  return (
    <div className="space-y-3">
      {tables.map(t => {
        const ratio = t.total > 0 ? (t.withSyncJob / t.total) * 100 : 0;
        return (
          <div key={t.label}>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-surface-400">{t.label}</span>
              <span className="font-medium text-surface-200">
                {t.withSyncJob.toLocaleString()} / {t.total.toLocaleString()}
                <span className="text-surface-500 ml-1">({Math.round(ratio)}%)</span>
              </span>
            </div>
            <div className="h-2 bg-surface-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  ratio >= 80 ? 'bg-emerald-500' : ratio >= 50 ? 'bg-amber-500' : 'bg-red-500'
                }`}
                style={{ width: `${ratio}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SourceKindPie({ breakdown }: { breakdown: AuditOverview['sourceKindBreakdown'] }) {
  const total = breakdown.official + breakdown.company + breakdown.curated + breakdown.unknown;
  const segments = [
    { label: 'Official', count: breakdown.official, color: 'bg-emerald-500' },
    { label: 'Company', count: breakdown.company, color: 'bg-blue-500' },
    { label: 'Curated', count: breakdown.curated, color: 'bg-violet-500' },
    { label: 'Unknown', count: breakdown.unknown, color: 'bg-surface-600' },
  ];

  return (
    <div className="space-y-3">
      <div className="flex h-3 rounded-full overflow-hidden">
        {segments.map(s => (
          s.count > 0 && (
            <div key={s.label} className={`${s.color}`} style={{ width: `${(s.count / total) * 100}%` }} />
          )
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        {segments.map(s => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${s.color}`} />
            <span className="text-surface-400">{s.label}</span>
            <span className="font-medium">{s.count.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SourceHealthTable({ sources }: { sources: SourceHealth[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-surface-700 text-left">
            <th className="pb-2 font-medium text-surface-500 w-6" />
            <th className="pb-2 font-medium text-surface-500">Source</th>
            <th className="pb-2 font-medium text-surface-500">Country</th>
            <th className="pb-2 font-medium text-surface-500">Status</th>
            <th className="pb-2 font-medium text-surface-500 text-right">Records</th>
            <th className="pb-2 font-medium text-surface-500">Last Sync</th>
            <th className="pb-2 font-medium text-surface-500">Freshness</th>
            <th className="pb-2 font-medium text-surface-500">Frequency</th>
          </tr>
        </thead>
        <tbody>
          {sources.map(s => (
            <Fragment key={s.source_key}>
              <tr
                className="border-b border-surface-800 hover:bg-surface-900 cursor-pointer"
                onClick={() => setExpanded(expanded === s.source_key ? null : s.source_key)}
              >
                <td className="py-2.5">
                  {expanded === s.source_key
                    ? <ChevronDown className="h-3.5 w-3.5 text-surface-500" />
                    : <ChevronRight className="h-3.5 w-3.5 text-surface-500" />
                  }
                </td>
                <td className="py-2.5">
                  <div className="font-medium text-surface-200">{s.display_name}</div>
                  <div className="text-xs text-surface-500">{s.source_key}</div>
                </td>
                <td className="py-2.5 text-surface-400">{s.country}</td>
                <td className="py-2.5">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    s.status === 'active' ? 'bg-emerald-50 text-emerald-700' :
                    s.status === 'pending' ? 'bg-amber-50 text-amber-700' :
                    'bg-red-50 text-red-700'
                  }`}>
                    {s.status}
                  </span>
                </td>
                <td className="py-2.5 text-right tabular-nums text-surface-300">
                  {s.institution_count?.toLocaleString() ?? '—'}
                </td>
                <td className="py-2.5 text-surface-400">{ago(s.last_synced_at)}</td>
                <td className="py-2.5">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${freshnessColor(s.freshness)}`}>
                    {s.freshness.replace('_', ' ')}
                  </span>
                </td>
                <td className="py-2.5 text-surface-500">{s.update_frequency ?? '—'}</td>
              </tr>
              {expanded === s.source_key && (
                <tr key={`${s.source_key}-detail`} className="bg-surface-900">
                  <td />
                  <td colSpan={7} className="py-3 px-4">
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      {s.description && (
                        <div className="col-span-2">
                          <span className="text-surface-500">Description:</span>{' '}
                          <span className="text-surface-300">{s.description}</span>
                        </div>
                      )}
                      {s.data_as_of && (
                        <div>
                          <span className="text-surface-500">Data as of:</span>{' '}
                          <span className="text-surface-300">{new Date(s.data_as_of).toLocaleDateString()}</span>
                        </div>
                      )}
                      {s.reasoned && (
                        <>
                          <div>
                            <span className="text-surface-500">Avg confidence:</span>{' '}
                            <span className="text-surface-300">
                              {s.avg_confidence == null ? 'N/A' : `${s.avg_confidence}`}
                            </span>
                          </div>
                          <div>
                            <span className="text-surface-500">Low confidence records:</span>{' '}
                            <span className="text-surface-300">{s.low_confidence_records ?? 0}</span>
                          </div>
                          <div>
                            <span className="text-surface-500">Missing provenance records:</span>{' '}
                            <span className="text-surface-300">{s.missing_provenance_records ?? 0}</span>
                          </div>
                        </>
                      )}
                      {s.record_count != null && (
                        <div>
                          <span className="text-surface-500">Registry rows:</span>{' '}
                          <span className="text-surface-300">{s.record_count.toLocaleString()}</span>
                        </div>
                      )}
                      {s.issues && s.issues.length > 0 && (
                        <div className="col-span-2">
                          <span className="text-surface-500">Reasoning / issues:</span>{' '}
                          <ul className="mt-1 space-y-1 list-disc list-inside">
                            {s.issues.map((issue) => (
                              <li key={issue} className="text-surface-300">
                                {issue}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {s.recommendation && (
                        <div className="col-span-2">
                          <span className="text-surface-500">Recommendation:</span>{' '}
                          <span className="text-surface-300">{s.recommendation}</span>
                        </div>
                      )}
                      {s.daysSinceSync !== null && (
                        <div>
                          <span className="text-surface-500">Days since sync:</span>{' '}
                          <span className={`font-medium ${s.daysSinceSync > 30 ? 'text-red-600' : s.daysSinceSync > 7 ? 'text-amber-600' : 'text-emerald-600'}`}>
                            {s.daysSinceSync}
                          </span>
                        </div>
                      )}
                      {s.regulator_url && (
                        <div className="flex items-center gap-1">
                          <Link2 className="h-3 w-3 text-surface-500" />
                          <a href={s.regulator_url} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">
                            Regulator site
                          </a>
                        </div>
                      )}
                      {s.data_url && (
                        <div className="flex items-center gap-1">
                          <Link2 className="h-3 w-3 text-surface-500" />
                          <a href={s.data_url} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">
                            Data endpoint
                          </a>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SyncJobTimeline({ jobs }: { jobs: SyncJob[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? jobs : jobs.slice(0, 15);

  return (
    <div>
      <div className="space-y-1">
        {visible.map(j => (
          <div key={j.id} className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-surface-900 text-sm">
            {statusIcon(j.status)}
            <span className="font-medium text-surface-300 w-40 truncate">{j.source}</span>
            <span className="text-surface-500 tabular-nums">{j.records_processed.toLocaleString()} records</span>
            <span className="text-surface-500 ml-auto text-xs">{ago(j.completed_at ?? j.created_at)}</span>
            {j.error && (
              <span className="text-red-500 text-xs max-w-48 truncate" title={j.error}>
                {j.error}
              </span>
            )}
          </div>
        ))}
      </div>
      {jobs.length > 15 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mt-2 text-sm text-primary-600 hover:text-primary-700 font-medium"
        >
          {showAll ? 'Show less' : `Show all ${jobs.length} jobs`}
        </button>
      )}
    </div>
  );
}

function SyncBySourceTable({ sources }: { sources: SyncBySource[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-surface-700 text-left">
            <th className="pb-2 font-medium text-surface-500">Source</th>
            <th className="pb-2 font-medium text-surface-500">Last Status</th>
            <th className="pb-2 font-medium text-surface-500">Last Run</th>
            <th className="pb-2 font-medium text-surface-500 text-right">Total Runs</th>
            <th className="pb-2 font-medium text-surface-500 text-right">Failed</th>
            <th className="pb-2 font-medium text-surface-500 text-right">Success Rate</th>
          </tr>
        </thead>
        <tbody>
          {sources.map(s => {
            const successRate = s.totalRuns > 0 ? ((s.totalRuns - s.totalFailed) / s.totalRuns) * 100 : 0;
            return (
              <tr key={s.source} className="border-b border-surface-800 hover:bg-surface-900">
                <td className="py-2 font-medium text-surface-200">{s.source}</td>
                <td className="py-2">{statusIcon(s.lastStatus)}</td>
                <td className="py-2 text-surface-400">{ago(s.lastRun)}</td>
                <td className="py-2 text-right tabular-nums text-surface-300">{s.totalRuns}</td>
                <td className="py-2 text-right tabular-nums">
                  <span className={s.totalFailed > 0 ? 'text-red-600 font-medium' : 'text-surface-500'}>
                    {s.totalFailed}
                  </span>
                </td>
                <td className="py-2 text-right tabular-nums">
                  <span className={`font-medium ${
                    successRate >= 95 ? 'text-emerald-600' : successRate >= 80 ? 'text-amber-600' : 'text-red-600'
                  }`}>
                    {Math.round(successRate)}%
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Page ─── */

type Tab = 'overview' | 'sources' | 'lineage' | 'sync';

export default function AuditDashboardPage() {
  const [tab, setTab] = useState<Tab>('overview');
  const adminToken = import.meta.env.VITE_ADMIN_API_TOKEN;

  const { data, isLoading, error } = useQuery<AuditOverview>({
    queryKey: ['audit-overview'],
    queryFn: async () => {
      const res = await fetch('/api/audit/overview');
      if (!res.ok) throw new Error('Failed to load audit data');
      return res.json();
    },
    staleTime: 60_000,
  });

  const {
    data: adminData,
    isLoading: isAdminLoading,
    error: adminError,
  } = useQuery<AdminHealthResponse>({
    queryKey: ['admin-data-health'],
    queryFn: async () => {
      const headers: HeadersInit = {};
      if (typeof adminToken === 'string' && adminToken) {
        headers.Authorization = `Bearer ${adminToken}`;
      }

      const res = await fetch('/api/admin/data-health', { headers });
      if (!res.ok) throw new Error('Failed to load admin data health source metrics');
      return res.json() as Promise<AdminHealthResponse>;
    },
    staleTime: 60_000,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-3 mb-8">
          <ShieldCheck className="h-7 w-7 text-primary-600" />
          <h1 className="text-2xl font-bold text-surface-100">Data Audit</h1>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-surface-700 p-4 h-24 animate-pulse">
              <div className="h-4 w-20 bg-surface-800 rounded mb-2" />
              <div className="h-8 w-16 bg-surface-800 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-3 mb-8">
          <ShieldCheck className="h-7 w-7 text-red-500" />
          <h1 className="text-2xl font-bold text-surface-100">Data Audit</h1>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">
          Failed to load audit data. Make sure the database is accessible.
        </div>
      </div>
    );
  }

  const sourceHealthRows = adminData?.sources && adminData.sources.length > 0
    ? mapAdminSourcesToDisplay(adminData.sources)
    : data.sourceHealth;
  const hasAdminSourceHealth = Boolean(adminData?.sources && adminData.sources.length > 0);

  const tabs: Array<{ key: Tab; label: string; icon: typeof Database }> = [
    { key: 'overview', label: 'Overview', icon: Eye },
    { key: 'sources', label: 'Source Health', icon: Activity },
    { key: 'lineage', label: 'Lineage & Provenance', icon: Layers },
    { key: 'sync', label: 'Sync History', icon: Zap },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-7 w-7 text-primary-600" />
          <div>
            <h1 className="text-2xl font-bold text-surface-100">Data Audit & Traceability</h1>
            <p className="text-sm text-surface-500">
              Where every data point comes from, when it was last verified, and why
            </p>
          </div>
        </div>
        <div className="text-xs text-surface-500">
          Generated {new Date(data.generatedAt).toLocaleString()}
          {hasAdminSourceHealth && adminData && (
            <span className="ml-2">· Admin score {adminData.summary.overall_audibility_score.toFixed(1)}</span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-surface-700">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-surface-500 hover:text-surface-300'
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══ Overview Tab ═══ */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {/* Top stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total Institutions"
              value={data.warehouseCounts.institutions}
              icon={Database}
              sub={`+ ${data.warehouseCounts.registry_entities.toLocaleString()} registry entities`}
            />
            <StatCard
              label="Entity Facts"
              value={data.warehouseCounts.entity_facts}
              icon={FileText}
              sub={`${data.warehouseCounts.entity_tags.toLocaleString()} tags, ${data.warehouseCounts.entity_relationships.toLocaleString()} relationships`}
            />
            <StatCard
              label="Sync Jobs Run"
              value={data.syncJobSummary.total}
              icon={RefreshCw}
              sub={`${data.syncJobSummary.failed} failed (${pct(data.syncJobSummary.failed, data.syncJobSummary.total)} failure rate)`}
              color={data.syncJobSummary.failed > 0 ? 'text-amber-600' : 'text-surface-100'}
            />
            <StatCard
              label="Data Sources"
              value={data.sourceHealth.length}
              icon={TrendingUp}
              sub={`${data.sourceHealth.filter(s => s.freshness === 'fresh').length} fresh, ${data.sourceHealth.filter(s => s.freshness === 'very_stale').length} very stale`}
            />
          </div>

          {/* Confidence + Source kind */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-surface-700 p-5">
              <h3 className="font-semibold text-surface-200 mb-4 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary-500" />
                Entity Confidence Distribution
              </h3>
              <ConfidenceBar distribution={data.confidenceDistribution} />
            </div>
            <div className="bg-white rounded-xl border border-surface-700 p-5">
              <h3 className="font-semibold text-surface-200 mb-4 flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary-500" />
                Fact Source Classification
              </h3>
              <SourceKindPie breakdown={data.sourceKindBreakdown} />
            </div>
          </div>

          {/* Confidence histograms */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-surface-700 p-5">
              <ScoreHistogram data={data.scoreHistogram} label="Entity Confidence Scores" />
            </div>
            <div className="bg-white rounded-xl border border-surface-700 p-5">
              <ScoreHistogram data={data.factScoreHistogram} label="Fact Confidence Scores" />
            </div>
          </div>

          {/* Provenance + Lineage summary */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-surface-700 p-5">
              <h3 className="font-semibold text-surface-200 mb-4 flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary-500" />
                Provenance Coverage
              </h3>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-surface-400">Entities with provenance metadata</span>
                    <span className="font-medium">
                      {data.provenanceCoverage.withProvenance} / {data.provenanceCoverage.total}
                    </span>
                  </div>
                  <div className="h-3 bg-surface-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary-500 rounded-full"
                      style={{ width: `${data.provenanceCoverage.total > 0 ? (data.provenanceCoverage.withProvenance / data.provenanceCoverage.total) * 100 : 0}%` }}
                    />
                  </div>
                  <p className="text-xs text-surface-500 mt-2">
                    Provenance tracks which data source contributed each field, when it was fetched, and the confidence level
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-surface-700 p-5">
              <h3 className="font-semibold text-surface-200 mb-4 flex items-center gap-2">
                <Link2 className="h-4 w-4 text-primary-500" />
                Sync Job Lineage
              </h3>
              <LineageCompleteness lineage={data.lineage} />
              <p className="text-xs text-surface-500 mt-3">
                Rows linked to a sync job have full traceability: who ran it, when, how many records, success/failure
              </p>
            </div>
          </div>

          {/* Warehouse inventory */}
          <div className="bg-white rounded-xl border border-surface-700 p-5">
            <h3 className="font-semibold text-surface-200 mb-4 flex items-center gap-2">
              <Database className="h-4 w-4 text-primary-500" />
              Warehouse Inventory
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {Object.entries(data.warehouseCounts).map(([table, count]) => (
                <div key={table} className="text-center p-3 rounded-lg bg-surface-900">
                  <p className="text-lg font-semibold text-surface-200">{count.toLocaleString()}</p>
                  <p className="text-xs text-surface-500 mt-0.5">{table.replace(/_/g, ' ')}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ Source Health Tab ═══ */}
      {tab === 'sources' && (
        <div className="space-y-6">
          {/* Alert banner for stale sources */}
          {sourceHealthRows.some(s => s.freshness === 'very_stale') && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-amber-800">Stale data sources detected</p>
                <p className="text-sm text-amber-700 mt-1">
                  {sourceHealthRows.filter(s => s.freshness === 'very_stale').length} source(s) have not been synced in over 30 days.
                  Data from these sources may be outdated.
                </p>
              </div>
            </div>
          )}
          {adminError && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
              Advanced source confidence and reasoning are unavailable in this view. Showing legacy source metrics.
            </div>
          )}
          {isAdminLoading && !hasAdminSourceHealth && (
            <div className="bg-surface-900 border border-surface-700 rounded-xl p-4 text-sm text-surface-500">
              Loading source confidence metadata from /api/admin/data-health...
            </div>
          )}
          <div className="bg-white rounded-xl border border-surface-700 p-5">
            <h3 className="font-semibold text-surface-200 mb-4">
              Data Source Registry ({sourceHealthRows.length} sources)
            </h3>
            <SourceHealthTable sources={sourceHealthRows} />
          </div>
        </div>
      )}

      {/* ═══ Lineage Tab ═══ */}
      {tab === 'lineage' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-surface-700 p-5">
              <h3 className="font-semibold text-surface-200 mb-4">Provenance Coverage</h3>
              <div className="mb-4">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-surface-400">Registry entities with provenance</span>
                  <span className="font-medium">
                    {pct(data.provenanceCoverage.withProvenance, data.provenanceCoverage.total)}
                  </span>
                </div>
                <div className="h-3 bg-surface-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary-500 rounded-full"
                    style={{ width: `${data.provenanceCoverage.total > 0 ? (data.provenanceCoverage.withProvenance / data.provenanceCoverage.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
              <div className="bg-surface-900 rounded-lg p-4 text-sm space-y-2">
                <p className="font-medium text-surface-300">What provenance tracks:</p>
                <ul className="text-surface-400 space-y-1 list-disc list-inside">
                  <li><code className="text-xs bg-surface-700 px-1 rounded">source_key</code> — which data source (FDIC, NCUA, OSFI, etc.)</li>
                  <li><code className="text-xs bg-surface-700 px-1 rounded">source_url</code> — exact API endpoint or file URL</li>
                  <li><code className="text-xs bg-surface-700 px-1 rounded">fetched_at</code> — when the data was retrieved</li>
                  <li><code className="text-xs bg-surface-700 px-1 rounded">sync_job_id</code> — FK to the sync job that created it</li>
                  <li><code className="text-xs bg-surface-700 px-1 rounded">confidence</code> — 0-100 numeric score</li>
                  <li><code className="text-xs bg-surface-700 px-1 rounded">conflicts</code> — when sources disagree on a value</li>
                </ul>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-surface-700 p-5">
              <h3 className="font-semibold text-surface-200 mb-4">Sync Job Lineage Completeness</h3>
              <LineageCompleteness lineage={data.lineage} />
              <div className="bg-surface-900 rounded-lg p-4 text-sm mt-4 space-y-2">
                <p className="font-medium text-surface-300">Traceability chain:</p>
                <div className="flex items-center gap-2 text-xs text-surface-400">
                  <span className="bg-primary-100 text-primary-700 px-2 py-1 rounded font-mono">data_sources</span>
                  <span>→</span>
                  <span className="bg-primary-100 text-primary-700 px-2 py-1 rounded font-mono">sync_jobs</span>
                  <span>→</span>
                  <span className="bg-primary-100 text-primary-700 px-2 py-1 rounded font-mono">entity_facts</span>
                </div>
                <p className="text-surface-500 text-xs mt-2">
                  Every fact, tag, and relationship can be traced back to the specific sync job that created it,
                  which links to the data source, the timestamp, and the number of records processed.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-surface-700 p-5">
              <h3 className="font-semibold text-surface-200 mb-4">Entity Confidence Scores</h3>
              <ConfidenceBar distribution={data.confidenceDistribution} />
              <div className="mt-4">
                <ScoreHistogram data={data.scoreHistogram} label="Score distribution (0-100)" />
              </div>
            </div>
            <div className="bg-white rounded-xl border border-surface-700 p-5">
              <h3 className="font-semibold text-surface-200 mb-4">Fact Confidence Scores</h3>
              <SourceKindPie breakdown={data.sourceKindBreakdown} />
              <div className="mt-4">
                <ScoreHistogram data={data.factScoreHistogram} label="Score distribution (0-100)" />
              </div>
            </div>
          </div>

          {/* Calculation methodology */}
          <div className="bg-white rounded-xl border border-surface-700 p-5">
            <h3 className="font-semibold text-surface-200 mb-4 flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary-500" />
              Scoring Methodology
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
              <div>
                <h4 className="font-medium text-surface-200 mb-2">Confidence Levels</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className={`w-3 h-3 rounded-full ${confidenceColor('high')}`} />
                    <span className="text-surface-300"><strong>High</strong> — Official regulatory data (FDIC, NCUA, OSFI)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`w-3 h-3 rounded-full ${confidenceColor('medium')}`} />
                    <span className="text-surface-300"><strong>Medium</strong> — Company-reported or curated data</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`w-3 h-3 rounded-full ${confidenceColor('low')}`} />
                    <span className="text-surface-300"><strong>Low</strong> — Inferred or estimated values</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`w-3 h-3 rounded-full ${confidenceColor('unverified')}`} />
                    <span className="text-surface-300"><strong>Unverified</strong> — Not yet validated</span>
                  </div>
                </div>
              </div>
              <div>
                <h4 className="font-medium text-surface-200 mb-2">Source Priority</h4>
                <p className="text-surface-400 mb-2">When multiple sources disagree, priority is:</p>
                <ol className="list-decimal list-inside space-y-1 text-surface-300">
                  <li><code className="text-xs bg-surface-800 px-1 rounded">official</code> — Regulator filings (FDIC call reports, NCUA 5300)</li>
                  <li><code className="text-xs bg-surface-800 px-1 rounded">company</code> — Self-reported by the institution</li>
                  <li><code className="text-xs bg-surface-800 px-1 rounded">curated</code> — Research, agent scripts, human curation</li>
                </ol>
              </div>
              <div>
                <h4 className="font-medium text-surface-200 mb-2">Brim Opportunity Scores</h4>
                <p className="text-surface-400 mb-2">Composite score (0-100) from 5 signals:</p>
                <ul className="space-y-1 text-surface-300">
                  <li><strong>30pts</strong> — Too big for agent program</li>
                  <li><strong>25pts</strong> — Post-merger integration window</li>
                  <li><strong>20pts</strong> — Portfolio acquirer pattern</li>
                  <li><strong>20pts</strong> — Outgrowing current program</li>
                  <li><strong>15pts</strong> — Core conversion opportunity</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Sync History Tab ═══ */}
      {tab === 'sync' && (
        <div className="space-y-6">
          {/* Per-source summary */}
          <div className="bg-white rounded-xl border border-surface-700 p-5">
            <h3 className="font-semibold text-surface-200 mb-4">Sync Performance by Source</h3>
            <SyncBySourceTable sources={data.syncBySource} />
          </div>

          {/* Recent job timeline */}
          <div className="bg-white rounded-xl border border-surface-700 p-5">
            <h3 className="font-semibold text-surface-200 mb-4">Recent Sync Jobs</h3>
            <SyncJobTimeline jobs={data.recentJobs} />
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard
              label="Completed"
              value={data.syncJobSummary.completed}
              icon={CheckCircle2}
              color="text-emerald-600"
            />
            <StatCard
              label="Failed"
              value={data.syncJobSummary.failed}
              icon={XCircle}
              color={data.syncJobSummary.failed > 0 ? 'text-red-600' : 'text-surface-500'}
            />
            <StatCard
              label="Running"
              value={data.syncJobSummary.running}
              icon={RefreshCw}
              color="text-blue-600"
            />
            <StatCard
              label="Pending"
              value={data.syncJobSummary.pending}
              icon={Clock}
              color="text-surface-500"
            />
          </div>
        </div>
      )}
    </div>
  );
}
