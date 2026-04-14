import { getSupabase } from './supabase.js';
import { validateProvenance } from './provenance.js';
import { listSources } from './source-service.js';
import { listSourceSyncStatuses } from './source-sync.js';
import type { DataSourceSummary, DataSourceSyncRequirement, DataSourceSyncCapability } from '../src/types/data-source.js';

const DEFAULT_PAGE_SIZE = 1000;
const MAX_PAGES = 40;
const LOW_CONFIDENCE_THRESHOLD = 45;
const MIN_RECORD_COVERAGE_FOR_AUDIT = 10;

type RegistryEntityRow = {
  id: string;
  source_key: string | null;
  name: string | null;
  status: string | null;
  data_confidence: string | null;
  data_confidence_score: number | null;
  data_provenance: unknown;
  data_as_of: string | null;
  last_synced_at: string | null;
};

type CachedSourceSync = {
  supported: boolean;
  ready: boolean;
  endpoint: string | null;
  execution_kind: DataSourceSyncCapability['execution_kind'];
  script_path: string | null;
  supports_dry_run: boolean;
  requirements: DataSourceSyncRequirement[];
  notes: string[];
};

export interface AdminDataHealthSyncRun {
  source: string;
  status: string | null;
  records_processed: number | null;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
  created_at: string | null;
}

export interface AdminDataHealthEvidenceRecord {
  id: string;
  name: string;
  status: string | null;
  data_confidence: string | null;
  confidence_score: number | null;
  has_provenance: boolean;
  data_as_of: string | null;
  last_synced_at: string | null;
  reason: string;
}

export interface AdminDataHealthConfidenceSummary {
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
  min_score: number | null;
  max_score: number | null;
  audibility_score: number;
  low_confidence_examples: AdminDataHealthEvidenceRecord[];
  missing_provenance_examples: AdminDataHealthEvidenceRecord[];
}

export interface AdminDataHealthSourceRecord {
  source_key: string;
  display_name: string;
  description: string | null;
  country: string;
  category_label: string;
  status: DataSourceSummary['status'];
  loaded: boolean;
  coverage_type: DataSourceSummary['coverage_type'];
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
  sync: CachedSourceSync | null;
  sync_last_run: AdminDataHealthSyncRun | null;
  confidence: AdminDataHealthConfidenceSummary;
  issues: string[];
  blockers: string[];
  recommendation: string;
}

export interface AdminDataHealthSummary {
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

export interface AdminDataHealthResponse {
  generated_at: string;
  filters: {
    q: string | null;
    status: string | null;
    source_key: string | null;
    min_confidence: number | null;
    issues_only: boolean;
  };
  summary: AdminDataHealthSummary;
  sources: AdminDataHealthSourceRecord[];
}

interface AdminDataHealthFilters {
  q?: string;
  status?: string | null;
  sourceKey?: string | null;
  minConfidence?: number | null;
  issuesOnly?: boolean;
}

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
  pageSize = DEFAULT_PAGE_SIZE,
  maxPages = MAX_PAGES,
): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const chunk = await safeRows(fetchPage(from, to));
    if (chunk.length === 0) break;
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  return rows;
}

function normalizeScore(value: unknown): number | null {
  if (value == null || typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value <= 1) return Math.round(value * 100);
  if (value <= 100) return Math.round(value);
  return null;
}

function hasProvenance(raw: unknown): boolean {
  try {
    const parsed = validateProvenance(raw);
    return parsed.sources.length > 0;
  } catch {
    return false;
  }
}

function bucketDefault(): AdminDataHealthConfidenceSummary {
  return {
    total_records: 0,
    scored_records: 0,
    missing_score_records: 0,
    with_provenance_records: 0,
    missing_provenance_records: 0,
    high_confidence_records: 0,
    medium_confidence_records: 0,
    low_confidence_records: 0,
    unverified_records: 0,
    avg_score: null,
    min_score: null,
    max_score: null,
    audibility_score: 0,
    low_confidence_examples: [],
    missing_provenance_examples: [],
  };
}

function buildConfidenceBucket(rows: RegistryEntityRow[]): Record<string, AdminDataHealthConfidenceSummary> {
  const buckets = new Map<string, AdminDataHealthConfidenceSummary>();
  const scoreSums = new Map<string, number>();
  const lowExamples = new Map<string, AdminDataHealthEvidenceRecord[]>();
  const missingProvExamples = new Map<string, AdminDataHealthEvidenceRecord[]>();

  for (const row of rows) {
    const key = row.source_key?.trim() ?? 'unknown';
    const bucket = buckets.get(key) ?? bucketDefault();
    if (!buckets.has(key)) {
      buckets.set(key, bucket);
    }

    bucket.total_records += 1;

    const score = normalizeScore(row.data_confidence_score);
    const sourceHasProvenance = hasProvenance(row.data_provenance);

    if (sourceHasProvenance) {
      bucket.with_provenance_records += 1;
    } else {
      bucket.missing_provenance_records += 1;
    }

    if (score == null) {
      bucket.missing_score_records += 1;
    } else {
      bucket.scored_records += 1;
      scoreSums.set(key, (scoreSums.get(key) ?? 0) + score);
      bucket.min_score = bucket.min_score == null || score < bucket.min_score ? score : bucket.min_score;
      bucket.max_score = bucket.max_score == null || score > bucket.max_score ? score : bucket.max_score;
      if (score >= 75) {
        bucket.high_confidence_records += 1;
      } else if (score >= 55) {
        bucket.medium_confidence_records += 1;
      } else {
        bucket.low_confidence_records += 1;
      }
    }

    if ((row.data_confidence || '').toLowerCase() === 'unverified') {
      bucket.unverified_records += 1;
    }

    const evidence: AdminDataHealthEvidenceRecord = {
      id: row.id,
      name: row.name?.trim() || 'Unnamed entity',
      status: row.status,
      data_confidence: row.data_confidence,
      confidence_score: score,
      has_provenance: sourceHasProvenance,
      data_as_of: row.data_as_of,
      last_synced_at: row.last_synced_at,
      reason:
        !sourceHasProvenance
          ? 'No provenance source list'
          : score == null
            ? 'Missing confidence score'
            : score < LOW_CONFIDENCE_THRESHOLD
              ? 'Low confidence score'
              : 'Needs manual check',
    };

    if (score != null && score < LOW_CONFIDENCE_THRESHOLD) {
      const list = lowExamples.get(key) ?? [];
      if (list.length < 12) {
        list.push(evidence);
      }
      lowExamples.set(key, list);
    }

    if (!sourceHasProvenance) {
      const list = missingProvExamples.get(key) ?? [];
      if (list.length < 12) {
        list.push(evidence);
      }
      missingProvExamples.set(key, list);
    }
  }

  const result = new Map<string, AdminDataHealthConfidenceSummary>();
  for (const [key, bucket] of buckets) {
    if (bucket.scored_records > 0) {
      const total = scoreSums.get(key) ?? 0;
      bucket.avg_score = Math.round(total / bucket.scored_records);
    }

    const coverage = bucket.total_records > 0 ? bucket.with_provenance_records / bucket.total_records : 0;
    const quality = bucket.scored_records > 0 ? bucket.scored_records / bucket.total_records : 0;
    bucket.audibility_score = Math.round((coverage * 60 + quality * 40) * 100) / 100;

    bucket.low_confidence_examples = (lowExamples.get(key) ?? [])
      .sort((a, b) => (a.confidence_score ?? 1000) - (b.confidence_score ?? 1000))
      .slice(0, 6);

    bucket.missing_provenance_examples = (missingProvExamples.get(key) ?? [])
      .sort((a, b) => (a.confidence_score ?? 1000) - (b.confidence_score ?? 1000))
      .slice(0, 6);

    result.set(key, bucket);
  }

  return Object.fromEntries(result);
}

function determineRecommendation(source: DataSourceSummary, sync: CachedSourceSync | null, confidence: AdminDataHealthConfidenceSummary) {
  const warnings: string[] = [];

  if (source.status === 'unavailable') {
    warnings.push('Data source is marked unavailable.');
  }
  if (!source.loaded) {
    warnings.push('No records are loaded yet; schedule a sync to populate the source data.');
  }
  if (source.status === 'pending') {
    warnings.push('Source status is pending and may need additional setup steps.');
  }
  if (!sync?.ready && sync && sync.requirements.some((req) => !req.ready && !req.optional)) {
    warnings.push('Sync prerequisites are not fully met.');
  }
  if (confidence.total_records > MIN_RECORD_COVERAGE_FOR_AUDIT && confidence.audibility_score < 60) {
    warnings.push('Low audibility score: many records are missing confidence or provenance tags.');
  }
  if (confidence.avg_score != null && confidence.avg_score < 55) {
    warnings.push('Average confidence score is in low range.');
  }

  return warnings.length ? warnings.join(' ') : 'All checks passing; ready for normal use.';
}

function makeDefaultFilterFlags(filters: AdminDataHealthFilters) {
  return {
    q: filters.q?.trim() || null,
    status: filters.status?.trim() || null,
    source_key: filters.sourceKey?.trim() || null,
    min_confidence: typeof filters.minConfidence === 'number' ? filters.minConfidence : null,
    issues_only: Boolean(filters.issuesOnly),
  };
}

async function loadSourceRegistryAuditRows(sourceKey?: string | null): Promise<RegistryEntityRow[]> {
  const supabase = getSupabase();
  const safeSourceKey = sourceKey?.trim();
  return fetchAllPages<RegistryEntityRow>((from, to) => {
    let query = supabase
      .from('registry_entities')
      .select('id, source_key, name, status, data_confidence, data_confidence_score, data_provenance, data_as_of, last_synced_at')
      .range(from, to)
      .order('source_key', { ascending: true })
      .order('name', { ascending: true });

    if (safeSourceKey) {
      query = query.eq('source_key', safeSourceKey);
    }

    return query;
  });
}

async function buildSourceAndRequirementMap() {
  const syncStatuses = listSourceSyncStatuses();
  const syncByKey = new Map<string, CachedSourceSync>();
  const requirementsByKey = new Map<string, DataSourceSyncRequirement[]>();

  for (const sync of syncStatuses) {
    syncByKey.set(sync.source_key, {
      supported: sync.supported,
      ready: sync.ready,
      endpoint: sync.endpoint,
      execution_kind: sync.execution_kind,
      script_path: sync.script_path,
      supports_dry_run: sync.supports_dry_run,
      requirements: sync.requirements,
      notes: sync.notes,
    });
    requirementsByKey.set(sync.source_key, sync.requirements);
  }

  return { syncByKey, requirementsByKey };
}

async function buildSyncJobMap(): Promise<Record<string, AdminDataHealthSyncRun | null>> {
  const supabase = getSupabase();
  const allJobs = await safeRows(
    supabase
      .from('sync_jobs')
      .select('source, status, records_processed, started_at, completed_at, error, created_at')
      .order('created_at', { ascending: false })
      .limit(250)
  );

  const seen = new Set<string>();
  const map = new Map<string, AdminDataHealthSyncRun>();
  for (const job of allJobs) {
    if (!seen.has(job.source)) {
      seen.add(job.source);
      map.set(job.source, {
        source: job.source,
        status: job.status,
        records_processed: job.records_processed,
        started_at: job.started_at,
        completed_at: job.completed_at,
        error: job.error,
        created_at: job.created_at,
      });
    }
  }

  return Object.fromEntries(map);
}

function clamp(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

export async function buildAdminDataHealth(filters: AdminDataHealthFilters = {}): Promise<AdminDataHealthResponse> {
  const [sourceCatalog, registryRows, syncJobsBySource] = await Promise.all([
    listSources({
      q: filters.q?.trim() || '',
      status: filters.status ?? null,
    }),
    loadSourceRegistryAuditRows(filters.sourceKey),
    buildSyncJobMap(),
  ]);

  const sourceSyncs = await buildSourceAndRequirementMap();
  const confidenceBySource = buildConfidenceBucket(registryRows);

  const sourceRows: AdminDataHealthSourceRecord[] = sourceCatalog.sources.map((source) => {
    const sync = sourceSyncs.syncByKey.get(source.source_key) ?? null;
    const requirements = sourceSyncs.requirementsByKey.get(source.source_key) ?? [];
    const syncRun = syncJobsBySource[source.source_key] ?? null;
    const confidence = confidenceBySource[source.source_key] ?? bucketDefault();

    const blockers = requirements
      .filter((req) => !req.ready && !req.optional)
      .map((req) => `${req.code}: ${req.label}`);

    const issues = [...blockers];
    if (!source.loaded) issues.push('No rows currently loaded for this source.');
    if (sync?.ready === false) issues.push('Sync prerequisites are not met.');

    return {
      source_key: source.source_key,
      display_name: source.display_name,
      description: source.description,
      country: source.country,
      category_label: source.category_label,
      status: source.status,
      loaded: source.loaded,
      coverage_type: source.coverage_type,
      coverage_label: source.coverage_label,
      record_count: source.record_count,
      institution_count: source.institution_count,
      update_frequency: source.update_frequency,
      data_as_of: source.data_as_of,
      last_synced_at: source.last_synced_at,
      regulator_url: source.regulator_url,
      data_url: source.data_url,
      latest_job_status: source.latest_job_status,
      sync_supported: source.sync_supported,
      sync_ready: source.sync_ready,
      sync_endpoint: source.sync_endpoint,
      sync,
      sync_last_run: syncRun,
      confidence,
      issues,
      blockers,
      recommendation: determineRecommendation(source, sync, confidence),
    };
  });

  const filteredSources = sourceRows.filter((source) => {
    if (filters.sourceKey && source.source_key !== filters.sourceKey) {
      return false;
    }

    if (typeof filters.minConfidence === 'number') {
      if (source.confidence.avg_score == null) return false;
      if (source.confidence.avg_score < filters.minConfidence) return false;
    }

    if (filters.issuesOnly && source.issues.length === 0) {
      return false;
    }

    return true;
  });

  const blockedSyncs = filteredSources.filter((source) => source.sync_ready === false).length;
  const loadedSources = filteredSources.filter((source) => source.loaded).length;
  const allConfRecords = filteredSources.reduce(
    (acc, source) => {
      acc.withScore += source.confidence.scored_records;
      acc.withProvenance += source.confidence.with_provenance_records;
      acc.total += source.confidence.total_records;
      return acc;
    },
    { withScore: 0, withProvenance: 0, total: 0 }
  );

  const summary: AdminDataHealthSummary = {
    total_sources: filteredSources.length,
    active_sources: filteredSources.filter((source) => source.status === 'active').length,
    pending_sources: filteredSources.filter((source) => source.status === 'pending').length,
    unavailable_sources: filteredSources.filter((source) => source.status === 'unavailable').length,
    loaded_sources: loadedSources,
    ready_sync_sources: filteredSources.length - blockedSyncs,
    blocked_sync_sources: blockedSyncs,
    sources_with_low_confidence: filteredSources.filter((source) => source.confidence.low_confidence_records > 0).length,
    sources_with_missing_provenance: filteredSources.filter((source) => source.confidence.missing_provenance_records > 0).length,
    registry_records_total: allConfRecords.total,
    registry_records_with_score: allConfRecords.withScore,
    registry_records_with_provenance: allConfRecords.withProvenance,
    overall_audibility_score: clamp(
      filteredSources.length > 0
        ? filteredSources.reduce((sum, source) => sum + source.confidence.audibility_score, 0) / filteredSources.length
        : 0,
      0,
      100
    ),
  };

  return {
    generated_at: new Date().toISOString(),
    filters: makeDefaultFilterFlags(filters),
    summary,
    sources: filteredSources.sort((a, b) => a.source_key.localeCompare(b.source_key)),
  };
}
