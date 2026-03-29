import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, RefreshCw, CheckCircle2, Clock, AlertCircle, Info } from 'lucide-react';
import { Card, Badge, Skeleton } from '@/components/ui';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DataSource {
  id: string;
  source_key: string;
  display_name: string;
  description: string | null;
  country: string;
  regulator_url: string | null;
  data_url: string | null;
  institution_count: number;
  last_synced_at: string | null;
  data_as_of: string | null;
  update_frequency: string | null;
  status: 'active' | 'pending' | 'unavailable';
  notes: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Fetch helper — reads directly from Supabase via the client-side anon key
// ---------------------------------------------------------------------------

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

async function fetchDataSources(): Promise<DataSource[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/data_sources?select=*&order=country.asc,source_key.asc`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    }
  );
  if (!res.ok) throw new Error(`Failed to load data sources (${res.status})`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const COUNTRY_FLAGS: Record<string, string> = {
  US: '🇺🇸',
  CA: '🇨🇦',
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
};

function statusBadge(status: DataSource['status']) {
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

function formatCount(n: number) {
  if (!n) return '—';
  return n.toLocaleString();
}

// ---------------------------------------------------------------------------
// Skeleton row
// ---------------------------------------------------------------------------

function SkeletonRow() {
  return (
    <tr className="border-b border-surface-100">
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

  const { data: sources, isLoading, error } = useQuery<DataSource[]>({
    queryKey: ['data-sources'],
    queryFn: fetchDataSources,
    staleTime: 5 * 60 * 1000,
  });

  const filtered = (sources ?? []).filter(
    (s) => countryFilter === 'all' || s.country === countryFilter
  );

  const usCounts = sources?.filter((s) => s.country === 'US').length ?? 0;
  const caCounts = sources?.filter((s) => s.country === 'CA').length ?? 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-surface-900">Data Sources</h1>
        <p className="mt-1 text-sm text-surface-500">
          Every institution record in Data Studio traces back to one of the regulatory sources
          listed below.
        </p>
      </div>

      {/* Provenance note */}
      <Card className="bg-primary-50 border-primary-200">
        <div className="flex gap-3">
          <Info className="h-5 w-5 text-primary-600 shrink-0 mt-0.5" />
          <div className="text-sm text-primary-800 space-y-1">
            <p className="font-medium">Data provenance and audit philosophy</p>
            <p>
              Data Studio only stores data that originates from official government registries and
              regulatory bodies — FDIC, NCUA, OSFI, the Bank of Canada RPAA registry, CIRO,
              FINTRAC, and Statistics Canada / CMHC aggregates. Each institution record carries a{' '}
              <code className="bg-primary-100 px-1 rounded text-xs">source</code> key that maps
              directly to the rows in this table, making every data point fully auditable. No
              third-party data vendors are used.
            </p>
            <p>
              Financial figures are stored as reported by the source (FDIC amounts are in thousands
              at source; we multiply by 1,000 on ingest). Sync timestamps record when data was last
              pulled, not when the regulator published it.
            </p>
          </div>
        </div>
      </Card>

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-surface-500 uppercase tracking-wide mr-1">
          Country
        </span>
        {(['all', 'US', 'CA'] as CountryFilter[]).map((c) => {
          const label =
            c === 'all'
              ? `All (${(sources ?? []).length})`
              : `${COUNTRY_FLAGS[c]} ${COUNTRY_LABELS[c]} (${c === 'US' ? usCounts : caCounts})`;
          return (
            <button
              key={c}
              onClick={() => setCountryFilter(c)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                countryFilter === c
                  ? 'bg-primary-600 text-white'
                  : 'bg-white border border-surface-300 text-surface-600 hover:bg-surface-50'
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
          Failed to load data sources. The{' '}
          <code className="bg-red-100 px-1 rounded text-xs">data_sources</code> table may not
          exist yet — run{' '}
          <code className="bg-red-100 px-1 rounded text-xs">
            node scripts/run-migration-data-sources.mjs
          </code>{' '}
          to create and seed it.
        </div>
      )}

      {/* Table */}
      <Card padding={false} className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-200 bg-surface-50">
                <th className="px-4 py-3 text-left font-semibold text-surface-700">Source</th>
                <th className="px-4 py-3 text-left font-semibold text-surface-700">Country</th>
                <th className="px-4 py-3 text-right font-semibold text-surface-700">
                  Institutions
                </th>
                <th className="px-4 py-3 text-left font-semibold text-surface-700">Frequency</th>
                <th className="px-4 py-3 text-left font-semibold text-surface-700">Last Synced</th>
                <th className="px-4 py-3 text-left font-semibold text-surface-700">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-surface-700">Link</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
                : filtered.map((src) => (
                    <tr
                      key={src.source_key}
                      className="border-b border-surface-100 hover:bg-surface-50 transition-colors"
                    >
                      {/* Source name + description */}
                      <td className="px-4 py-3">
                        <div className="font-medium text-surface-900">{src.display_name}</div>
                        {src.description && (
                          <div className="text-xs text-surface-500 mt-0.5 max-w-xs leading-snug">
                            {src.description}
                          </div>
                        )}
                        {src.notes && (
                          <div className="text-xs text-surface-400 mt-0.5 italic">{src.notes}</div>
                        )}
                      </td>

                      {/* Country flag */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="text-base leading-none">
                            {COUNTRY_FLAGS[src.country] ?? src.country}
                          </span>
                          <span className="text-surface-600">{src.country}</span>
                        </span>
                      </td>

                      {/* Institution count */}
                      <td className="px-4 py-3 text-right tabular-nums text-surface-700">
                        {formatCount(src.institution_count)}
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
                          <span className="text-surface-400">—</span>
                        )}
                      </td>

                      {/* Last synced */}
                      <td className="px-4 py-3 whitespace-nowrap text-surface-600">
                        <span className="inline-flex items-center gap-1">
                          {src.last_synced_at && (
                            <RefreshCw className="h-3 w-3 text-surface-400" />
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
                        {src.regulator_url ? (
                          <a
                            href={src.regulator_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary-600 hover:text-primary-700 font-medium"
                          >
                            View source
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        ) : (
                          <span className="text-surface-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}

              {!isLoading && !error && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-surface-400 text-sm">
                    No data sources found for the selected filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Footer note */}
      <p className="text-xs text-surface-400 text-center">
        Source records are maintained in the{' '}
        <code className="bg-surface-100 px-1 rounded">data_sources</code> table in Supabase.
        To add a new source, run the migration script and add a row with the appropriate{' '}
        <code className="bg-surface-100 px-1 rounded">source_key</code>.
      </p>
    </div>
  );
}
