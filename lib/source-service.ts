import { getSupabase } from './supabase.js';
import { SOURCE_CATALOG, SOURCE_CATEGORY_LABELS, type SourceCatalogEntry } from './source-registry.js';
import { getSourceSyncStatus } from './source-sync.js';
import type { DataSourceDetail, DataSourceSummary, DataSourceSyncJob, DataSourcesResponse } from '../src/types/data-source';

type DataSourceRow = {
  id: string;
  source_key: string;
  display_name: string;
  description: string | null;
  country: string;
  regulator_url: string | null;
  data_url: string | null;
  institution_count: number | null;
  last_synced_at: string | null;
  data_as_of: string | null;
  update_frequency: string | null;
  status: 'active' | 'pending' | 'unavailable';
  notes: string | null;
  created_at: string | null;
};

type InstitutionMetricRow = {
  source: string;
  data_as_of: string | null;
  last_synced_at: string | null;
};

type MacroMetricRow = {
  source_key: string;
  period: string | null;
};

type SyncJobRow = DataSourceSyncJob & {
  created_at?: string | null;
};

type ListSourceOptions = {
  q?: string;
  country?: string | null;
  category?: string | null;
  status?: string | null;
};

const COUNTRY_LABELS: Record<string, string> = {
  US: 'United States',
  CA: 'Canada',
  NA: 'North America',
};

function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const maybe = error as { code?: string; message?: string };
  return maybe.code === '42P01' || /relation .* does not exist/i.test(maybe.message ?? '');
}

async function safeRows<T>(promise: PromiseLike<{ data: T[] | null; error: { code?: string; message?: string } | null }>): Promise<T[]> {
  const { data, error } = await promise;
  if (error) {
    if (isMissingTableError(error)) return [];
    throw new Error(error.message ?? 'Database query failed');
  }
  return data ?? [];
}

async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { code?: string; message?: string } | null }>,
  pageSize = 1000,
  maxPages = 25
): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < maxPages; page++) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const chunk = await safeRows(fetchPage(from, to));
    if (chunk.length === 0) break;
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  return rows;
}

function coverageFallback(entry: SourceCatalogEntry) {
  switch (entry.coverage_type) {
    case 'series':
      return 'Aggregate market series';
    case 'filings':
      return 'Public filing source';
    case 'complaints':
      return 'Complaint records';
    case 'entities':
      return entry.status === 'active' ? 'Registry-backed entities' : 'Planned entity coverage';
    case 'records':
      return entry.status === 'active' ? 'Official records source' : 'Planned record coverage';
    case 'institutions':
    default:
      return entry.status === 'active' ? 'Official institution source' : 'Planned institution coverage';
  }
}

function formatCoverageLabel(recordCount: number | null, coverageType: DataSourceSummary['coverage_type'], fallback: string) {
  if (recordCount == null || recordCount <= 0) return fallback;
  const labelMap: Record<DataSourceSummary['coverage_type'], string> = {
    institutions: 'institutions',
    entities: 'entities',
    series: 'series',
    records: 'records',
    filings: 'filings',
    complaints: 'complaints',
  };
  return `${recordCount.toLocaleString()} ${labelMap[coverageType]}`;
}

function sortByNewest(values: Array<string | null | undefined>) {
  return values.filter(Boolean).sort((a, b) => String(b).localeCompare(String(a)))[0] ?? null;
}

function summarizeInstitutionMetrics(rows: InstitutionMetricRow[]) {
  const summary: Record<string, { record_count: number; data_as_of: string | null; last_synced_at: string | null }> = {};
  for (const row of rows) {
    if (!summary[row.source]) {
      summary[row.source] = { record_count: 0, data_as_of: null, last_synced_at: null };
    }
    const bucket = summary[row.source];
    bucket.record_count += 1;
    bucket.data_as_of = sortByNewest([bucket.data_as_of, row.data_as_of]);
    bucket.last_synced_at = sortByNewest([bucket.last_synced_at, row.last_synced_at]);
  }
  return summary;
}

function summarizeMacroMetrics(rows: MacroMetricRow[]) {
  const summary: Record<string, { record_count: number; data_as_of: string | null }> = {};
  for (const row of rows) {
    if (!summary[row.source_key]) {
      summary[row.source_key] = { record_count: 0, data_as_of: null };
    }
    const bucket = summary[row.source_key];
    bucket.record_count += 1;
    bucket.data_as_of = sortByNewest([bucket.data_as_of, row.period]);
  }
  return summary;
}

function latestJobs(rows: SyncJobRow[]) {
  const summary: Record<string, SyncJobRow> = {};
  for (const row of rows) {
    if (!summary[row.source]) summary[row.source] = row;
  }
  return summary;
}

function mergeEntry(entry: SourceCatalogEntry, row: DataSourceRow | undefined, institutionMetrics: Record<string, { record_count: number; data_as_of: string | null; last_synced_at: string | null }>, macroMetrics: Record<string, { record_count: number; data_as_of: string | null }>, latestJob: SyncJobRow | undefined): DataSourceDetail {
  const sync = getSourceSyncStatus(entry.source_key);
  const institutionMetric = institutionMetrics[entry.source_key];
  const macroMetric = macroMetrics[entry.source_key];
  const recordCount = institutionMetric?.record_count ?? macroMetric?.record_count ?? row?.institution_count ?? null;
  const dataAsOf = institutionMetric?.data_as_of ?? macroMetric?.data_as_of ?? row?.data_as_of ?? null;
  const lastSyncedAt = institutionMetric?.last_synced_at ?? row?.last_synced_at ?? latestJob?.completed_at ?? null;
  const loaded = recordCount != null && recordCount > 0;
  let status = row?.status ?? entry.status;

  if (loaded) status = 'active';
  if (!loaded && latestJob?.status === 'failed') status = 'unavailable';

  return {
    id: row?.id ?? entry.source_key,
    source_key: entry.source_key,
    display_name: row?.display_name ?? entry.display_name,
    description: row?.description ?? entry.description,
    country: row?.country ?? entry.country,
    country_label: COUNTRY_LABELS[row?.country ?? entry.country] ?? (row?.country ?? entry.country),
    regulator_url: row?.regulator_url ?? entry.regulator_url,
    data_url: row?.data_url ?? entry.data_url,
    update_frequency: row?.update_frequency ?? entry.update_frequency,
    status,
    notes: row?.notes ?? entry.notes,
    category: entry.category,
    category_label: SOURCE_CATEGORY_LABELS[entry.category],
    coverage_type: entry.coverage_type,
    coverage_label: formatCoverageLabel(recordCount, entry.coverage_type, coverageFallback(entry)),
    record_count: recordCount,
    institution_count: institutionMetric?.record_count ?? row?.institution_count ?? null,
    last_synced_at: lastSyncedAt,
    data_as_of: dataAsOf,
    latest_job_status: latestJob?.status ?? null,
    loaded,
    created_at: row?.created_at ?? null,
    latest_sync_job: latestJob ?? null,
    sync_supported: sync?.supported ?? false,
    sync_ready: sync?.supported ? sync.ready : null,
    sync_endpoint: sync?.endpoint ?? null,
    sync,
  };
}

async function loadRawSourceData() {
  const supabase = getSupabase();
  const [sourceRows, institutionRows, macroRows, syncRows] = await Promise.all([
    safeRows<DataSourceRow>(
      supabase
        .from('data_sources')
        .select('id, source_key, display_name, description, country, regulator_url, data_url, institution_count, last_synced_at, data_as_of, update_frequency, status, notes, created_at')
        .order('country', { ascending: true })
        .order('source_key', { ascending: true })
    ),
    fetchAllPages<InstitutionMetricRow>((from, to) =>
      supabase
        .from('institutions')
        .select('source, data_as_of, last_synced_at')
        .range(from, to)
    ),
    fetchAllPages<MacroMetricRow>((from, to) =>
      supabase
        .from('macro_series')
        .select('source_key, period')
        .range(from, to)
    ),
    safeRows<SyncJobRow>(
      supabase
        .from('sync_jobs')
        .select('source, status, records_processed, started_at, completed_at, error, created_at')
        .order('created_at', { ascending: false })
        .limit(200)
    ),
  ]);

  return { sourceRows, institutionRows, macroRows, syncRows };
}

function filterSources(sources: DataSourceDetail[], options: ListSourceOptions) {
  const q = options.q?.trim().toLowerCase();
  return sources.filter((source) => {
    if (options.country && source.country !== options.country) return false;
    if (options.category && source.category !== options.category) return false;
    if (options.status && source.status !== options.status) return false;
    if (!q) return true;
    return [
      source.source_key,
      source.display_name,
      source.description,
      source.notes,
      source.category_label,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(q));
  });
}

async function buildCatalog() {
  const { sourceRows, institutionRows, macroRows, syncRows } = await loadRawSourceData();
  const rowsByKey = new Map(sourceRows.map((row) => [row.source_key, row]));
  const institutionMetrics = summarizeInstitutionMetrics(institutionRows);
  const macroMetrics = summarizeMacroMetrics(macroRows);
  const latestBySource = latestJobs(syncRows);

  const known = SOURCE_CATALOG.map((entry) =>
    mergeEntry(entry, rowsByKey.get(entry.source_key), institutionMetrics, macroMetrics, latestBySource[entry.source_key])
  );

  const unknownRows = sourceRows
    .filter((row) => !SOURCE_CATALOG.some((entry) => entry.source_key === row.source_key))
    .map((row) => {
      const fallback: SourceCatalogEntry = {
        source_key: row.source_key,
        display_name: row.display_name,
        description: row.description ?? 'Registry row from the data_sources table.',
        country: row.country,
        regulator_url: row.regulator_url ?? '',
        data_url: row.data_url ?? row.regulator_url ?? '',
        update_frequency: row.update_frequency ?? 'quarterly',
        status: row.status,
        notes: row.notes,
        category: 'institution_registry',
        coverage_type: 'records',
      };
      return mergeEntry(fallback, row, institutionMetrics, macroMetrics, latestBySource[row.source_key]);
    });

  return [...known, ...unknownRows].sort((a, b) => {
    if (a.country !== b.country) return a.country.localeCompare(b.country);
    return a.source_key.localeCompare(b.source_key);
  });
}

export async function listSources(options: ListSourceOptions = {}): Promise<DataSourcesResponse> {
  const catalog = await buildCatalog();
  const filtered = filterSources(catalog, options);
  return {
    sources: filtered.map((source) => ({
      id: source.id,
      source_key: source.source_key,
      display_name: source.display_name,
      description: source.description,
      country: source.country,
      country_label: source.country_label,
      regulator_url: source.regulator_url,
      data_url: source.data_url,
      update_frequency: source.update_frequency,
      status: source.status,
      notes: source.notes,
      category: source.category,
      category_label: source.category_label,
      coverage_type: source.coverage_type,
      coverage_label: source.coverage_label,
      record_count: source.record_count,
      institution_count: source.institution_count,
      last_synced_at: source.last_synced_at,
      data_as_of: source.data_as_of,
      latest_job_status: source.latest_job_status,
      loaded: source.loaded,
      created_at: source.created_at,
      sync_supported: source.sync_supported,
      sync_ready: source.sync_ready,
      sync_endpoint: source.sync_endpoint,
    })),
    total: filtered.length,
    summary: {
      active: filtered.filter((source) => source.status === 'active').length,
      pending: filtered.filter((source) => source.status === 'pending').length,
      unavailable: filtered.filter((source) => source.status === 'unavailable').length,
      loaded: filtered.filter((source) => source.loaded).length,
    },
  };
}

export async function getSourceByKey(sourceKey: string): Promise<DataSourceDetail | null> {
  const catalog = await buildCatalog();
  return catalog.find((source) => source.source_key === sourceKey) ?? null;
}
