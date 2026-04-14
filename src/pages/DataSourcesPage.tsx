import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, RefreshCw, CheckCircle2, Clock, AlertCircle, Info, Database, Search } from 'lucide-react';
import { Card, Badge, Skeleton, Input, Select } from '@/components/ui';
import type { DataSourceCategory, DataSourcesResponse, DataSourceSummary } from '@/types/data-source';

async function fetchDataSources(params: {
  q: string;
  country: string;
  category: string;
}): Promise<DataSourcesResponse> {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.country !== 'all') search.set('country', params.country);
  if (params.category !== 'all') search.set('category', params.category);

  const suffix = search.toString();
  const res = await fetch(`/api/sources${suffix ? `?${suffix}` : ''}`);
  if (!res.ok) throw new Error(`Failed to load data sources (${res.status})`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const COUNTRY_FLAGS: Record<string, string> = {
  US: '🇺🇸',
  CA: '🇨🇦',
  NA: '🌐',
};

const COUNTRY_LABELS: Record<string, string> = {
  US: 'United States',
  CA: 'Canada',
};

const FREQ_LABELS: Record<string, string> = {
  realtime: 'Real-time',
  daily: 'Daily',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Annual',
};

const CATEGORY_OPTIONS: Array<{ value: 'all' | DataSourceCategory; label: string }> = [
  { value: 'all', label: 'All categories' },
  { value: 'institution_registry', label: 'Institution registries' },
  { value: 'financial_filings', label: 'Financial filings' },
  { value: 'holding_company', label: 'Holding company data' },
  { value: 'licensing_registry', label: 'Licensing registries' },
  { value: 'payments_infrastructure', label: 'Payments infrastructure' },
  { value: 'market_data', label: 'Market and macro data' },
  { value: 'community_reinvestment', label: 'CRA and community data' },
  { value: 'corporate_filings', label: 'Corporate filings' },
  { value: 'complaint_data', label: 'Complaint data' },
];

function statusBadge(status: DataSourceSummary['status']) {
  switch (status) {
    case 'active':
      return (
        <span className="inline-flex items-center gap-1 text-green-700">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Active
        </span>
      );
    case 'pending':
      return (
        <span className="inline-flex items-center gap-1 text-yellow-700">
          <Clock className="h-3.5 w-3.5" />
          Pending
        </span>
      );
    case 'unavailable':
      return (
        <span className="inline-flex items-center gap-1 text-red-700">
          <AlertCircle className="h-3.5 w-3.5" />
          Unavailable
        </span>
      );
  }
}

function formatSyncDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatCount(n: number | null) {
  if (n == null || n <= 0) return '—';
  return n.toLocaleString();
}

function categoryColor(category: DataSourceCategory) {
  switch (category) {
    case 'institution_registry':
      return 'blue';
    case 'financial_filings':
      return 'indigo';
    case 'holding_company':
      return 'purple';
    case 'licensing_registry':
      return 'orange';
    case 'payments_infrastructure':
      return 'green';
    case 'market_data':
      return 'gray';
    case 'community_reinvestment':
      return 'yellow';
    case 'corporate_filings':
      return 'red';
    case 'complaint_data':
      return 'red';
  }
}

// ---------------------------------------------------------------------------
// Skeleton row
// ---------------------------------------------------------------------------

function SkeletonRow() {
  return (
    <tr className="border-b border-surface-800">
      {[1, 2, 3, 4, 5, 6, 7].map((i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton className="h-4 w-full" />
        </td>
      ))}
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

type CountryFilter = 'all' | 'US' | 'CA';

export default function DataSourcesPage() {
  const [countryFilter, setCountryFilter] = useState<CountryFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | DataSourceCategory>('all');

  const { data, isLoading, error } = useQuery<DataSourcesResponse>({
    queryKey: ['data-sources', searchQuery, countryFilter, categoryFilter],
    queryFn: () =>
      fetchDataSources({
        q: searchQuery,
        country: countryFilter,
        category: categoryFilter,
      }),
    staleTime: 5 * 60 * 1000,
  });

  const sources = data?.sources ?? [];

  const usCounts = sources?.filter((s) => s.country === 'US').length ?? 0;
  const caCounts = sources?.filter((s) => s.country === 'CA').length ?? 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-surface-100">Data Sources</h1>
        <p className="mt-1 text-sm text-surface-500">
          Moby tracks official North American regulatory, registry, market, filings, and
          infrastructure sources here, with live ingestion status where available.
        </p>
      </div>

      {/* Provenance note */}
      <Card className="bg-primary-50 border-primary-200">
        <div className="flex gap-3">
          <Info className="h-5 w-5 text-primary-600 shrink-0 mt-0.5" />
          <div className="text-sm text-primary-800 space-y-1">
            <p className="font-medium">Data provenance and audit philosophy</p>
            <p>
              Moby is built on official public authorities first: FDIC, NCUA, FFIEC, OCC,
              the Federal Reserve, OSFI, the Bank of Canada, CIRO, FINTRAC, FinCEN, CMHC, the SEC,
              CFPB, and related public registries. Each profile and dataset maps back to a stable{' '}
              <code className="bg-primary-100 px-1 rounded text-xs">source_key</code>, so the
              product can show provenance, freshness, and integration status in one place.
            </p>
            <p>
              Sync timestamps record when we last pulled or refreshed a source-backed dataset. Some
              rows below are already loaded into the warehouse; others are tracked as planned
              official sources for the next ingestion phases.
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <div className="flex items-center gap-3">
            <Database className="h-5 w-5 text-primary-600" />
            <div>
              <p className="text-xs uppercase tracking-wide text-surface-500">Tracked Sources</p>
              <p className="text-xl font-semibold text-surface-100">{data?.total ?? 0}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <div>
              <p className="text-xs uppercase tracking-wide text-surface-500">Loaded</p>
              <p className="text-xl font-semibold text-surface-100">{data?.summary.loaded ?? 0}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5 text-yellow-600" />
            <div>
              <p className="text-xs uppercase tracking-wide text-surface-500">Pending</p>
              <p className="text-xl font-semibold text-surface-100">{data?.summary.pending ?? 0}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <RefreshCw className="h-5 w-5 text-blue-600" />
            <div>
              <p className="text-xs uppercase tracking-wide text-surface-500">Active</p>
              <p className="text-xl font-semibold text-surface-100">{data?.summary.active ?? 0}</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-500" />
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search sources, datasets, regulators, or notes"
            className="pl-9"
          />
        </div>
        <Select
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value as 'all' | DataSourceCategory)}
          options={CATEGORY_OPTIONS}
        />
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-surface-500 uppercase tracking-wide mr-1">
          Country
        </span>
        {(['all', 'US', 'CA'] as CountryFilter[]).map((c) => {
          const label =
            c === 'all'
              ? `All (${data?.total ?? 0})`
              : `${COUNTRY_FLAGS[c]} ${COUNTRY_LABELS[c]} (${c === 'US' ? usCounts : caCounts})`;
          return (
            <button
              key={c}
              onClick={() => setCountryFilter(c)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                countryFilter === c
                  ? 'bg-primary-600 text-white'
                  : 'bg-white border border-surface-600 text-surface-400 hover:bg-surface-900'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Failed to load source registry data. If the source catalog has not been seeded yet, run{' '}
          <code className="bg-red-100 px-1 rounded text-xs">node scripts/run-migration-data-sources.mjs</code>{' '}
          and refresh this page.
        </div>
      )}

      {/* Table */}
      <Card padding={false} className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-700 bg-surface-900">
                <th className="px-4 py-3 text-left font-semibold text-surface-300">Source</th>
                <th className="px-4 py-3 text-left font-semibold text-surface-300">Country</th>
                <th className="px-4 py-3 text-left font-semibold text-surface-300">Coverage</th>
                <th className="px-4 py-3 text-left font-semibold text-surface-300">Category</th>
                <th className="px-4 py-3 text-left font-semibold text-surface-300">Frequency</th>
                <th className="px-4 py-3 text-left font-semibold text-surface-300">Last Synced</th>
                <th className="px-4 py-3 text-left font-semibold text-surface-300">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-surface-300">Link</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
                : sources.map((src) => (
                    <tr
                      key={src.source_key}
                      className="border-b border-surface-800 hover:bg-surface-900 transition-colors"
                    >
                      {/* Source name + description */}
                      <td className="px-4 py-3">
                        <div className="font-medium text-surface-100">{src.display_name}</div>
                        {src.description && (
                          <div className="text-xs text-surface-500 mt-0.5 max-w-xs leading-snug">
                            {src.description}
                          </div>
                        )}
                        {src.notes && (
                          <div className="text-xs text-surface-500 mt-0.5 italic">{src.notes}</div>
                        )}
                      </td>

                      {/* Country flag */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="text-base leading-none">
                            {COUNTRY_FLAGS[src.country] ?? src.country}
                          </span>
                          <span className="text-surface-400">{src.country}</span>
                        </span>
                      </td>

                      {/* Coverage */}
                      <td className="px-4 py-3 text-surface-300">
                        <div className="font-medium tabular-nums">{src.coverage_label}</div>
                        {src.record_count != null && src.record_count > 0 && (
                          <div className="text-xs text-surface-500">
                            {formatCount(src.record_count)} tracked
                            {src.data_as_of ? ` · as of ${src.data_as_of}` : ''}
                          </div>
                        )}
                      </td>

                      {/* Category */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge color={categoryColor(src.category)}>{src.category_label}</Badge>
                      </td>

                      {/* Update frequency */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {src.update_frequency ? (
                          <Badge
                            color={
                              src.update_frequency === 'realtime'
                                ? 'green'
                                : src.update_frequency === 'daily'
                                ? 'blue'
                                : src.update_frequency === 'monthly'
                                ? 'indigo'
                                : 'gray'
                            }
                          >
                            {FREQ_LABELS[src.update_frequency] ?? src.update_frequency}
                          </Badge>
                        ) : (
                          <span className="text-surface-500">—</span>
                        )}
                      </td>

                      {/* Last synced */}
                      <td className="px-4 py-3 whitespace-nowrap text-surface-400">
                        <span className="inline-flex items-center gap-1">
                          {src.last_synced_at && (
                            <RefreshCw className="h-3 w-3 text-surface-500" />
                          )}
                          {formatSyncDate(src.last_synced_at)}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3 whitespace-nowrap text-xs font-medium">
                        {statusBadge(src.status)}
                      </td>

                      {/* View source link */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {src.data_url || src.regulator_url ? (
                          <a
                            href={src.data_url ?? src.regulator_url ?? '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary-600 hover:text-primary-700 font-medium"
                          >
                            View source
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        ) : (
                          <span className="text-surface-500">—</span>
                        )}
                      </td>
                    </tr>
                  ))}

              {!isLoading && !error && sources.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-surface-500 text-sm">
                    No data sources found for the current search and filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Footer note */}
      <p className="text-xs text-surface-500 text-center">
        Source registry data is served by{' '}
        <code className="bg-surface-800 px-1 rounded">/api/sources</code> and backed by the{' '}
        <code className="bg-surface-800 px-1 rounded">data_sources</code> table plus live sync
        metadata from the warehouse.
      </p>
    </div>
  );
}
