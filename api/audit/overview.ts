import type { VercelRequest, VercelResponse } from '@vercel/node';
import { apiHandler } from '../../lib/api-handler.js';
import { getSupabase } from '../../lib/supabase.js';

/**
 * GET /api/audit/overview
 *
 * Returns a comprehensive audit overview: sync job history, source health,
 * confidence distribution, provenance coverage, entity lineage stats.
 */
export default apiHandler({ methods: ['GET'] }, async (_req: VercelRequest, res: VercelResponse) => {
  const supabase = getSupabase();

  const safeCount = async (table: string): Promise<number> => {
    const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
    if (error) return 0;
    return count ?? 0;
  };

  const [
    // Sync job stats
    recentJobsRes,
    jobStatusRes,
    jobSourcesRes,

    // Data source health
    dataSourcesRes,

    // Entity confidence distribution
    confidenceRes,

    // Warehouse row counts
    institutionCount,
    registryCount,
    factCount,
    tagCount,
    relationshipCount,
    charterEventCount,

    // Provenance coverage — entities with data_provenance populated
    provenanceCoverageRes,

    // Facts with sync_job_id populated (lineage completeness)
    factsWithLineageRes,
    tagsWithLineageRes,
    relsWithLineageRes,

    // Source kind distribution across facts
    factSourceKindRes,

    // Confidence score distribution across facts
    factConfidenceRes,
  ] = await Promise.all([
    // Last 50 sync jobs
    supabase
      .from('sync_jobs')
      .select('id, source, status, records_processed, started_at, completed_at, error, created_at')
      .order('created_at', { ascending: false })
      .limit(50),

    // Sync job status counts
    supabase
      .from('sync_jobs')
      .select('status'),

    // Sync job source counts
    supabase
      .from('sync_jobs')
      .select('source, status, completed_at')
      .order('completed_at', { ascending: false }),

    // All data sources
    supabase
      .from('data_sources')
      .select('source_key, display_name, description, country, status, institution_count, last_synced_at, data_as_of, update_frequency, regulator_url, data_url')
      .order('source_key'),

    // Confidence distribution on registry entities
    supabase
      .from('registry_entities')
      .select('data_confidence, data_confidence_score'),

    // Counts
    safeCount('institutions'),
    safeCount('registry_entities'),
    safeCount('entity_facts'),
    safeCount('entity_tags'),
    safeCount('entity_relationships'),
    safeCount('charter_events'),

    // Provenance JSONB coverage
    supabase
      .from('registry_entities')
      .select('id', { count: 'exact', head: true })
      .not('data_provenance', 'is', null),

    // Lineage completeness: how many facts/tags/rels have sync_job_id
    supabase
      .from('entity_facts')
      .select('id', { count: 'exact', head: true })
      .not('sync_job_id', 'is', null),
    supabase
      .from('entity_tags')
      .select('id', { count: 'exact', head: true })
      .not('sync_job_id', 'is', null),
    supabase
      .from('entity_relationships')
      .select('id', { count: 'exact', head: true })
      .not('sync_job_id', 'is', null),

    // Source kind breakdown in facts
    supabase
      .from('entity_facts')
      .select('source_kind'),

    // Confidence scores in facts
    supabase
      .from('entity_facts')
      .select('confidence_score')
      .not('confidence_score', 'is', null),
  ]);

  // ── Aggregate sync job stats ──
  const allJobs = jobStatusRes.data ?? [];
  const syncJobSummary = {
    total: allJobs.length,
    completed: allJobs.filter((j: { status: string }) => j.status === 'completed').length,
    failed: allJobs.filter((j: { status: string }) => j.status === 'failed').length,
    running: allJobs.filter((j: { status: string }) => j.status === 'running').length,
    pending: allJobs.filter((j: { status: string }) => j.status === 'pending').length,
  };

  // ── Per-source last sync info ──
  const sourceJobMap = new Map<string, { source: string; lastRun: string | null; lastStatus: string; totalRuns: number; totalFailed: number }>();
  for (const j of (jobSourcesRes.data ?? []) as Array<{ source: string; status: string; completed_at: string | null }>) {
    const existing = sourceJobMap.get(j.source);
    if (!existing) {
      sourceJobMap.set(j.source, {
        source: j.source,
        lastRun: j.completed_at,
        lastStatus: j.status,
        totalRuns: 1,
        totalFailed: j.status === 'failed' ? 1 : 0,
      });
    } else {
      existing.totalRuns++;
      if (j.status === 'failed') existing.totalFailed++;
    }
  }
  const syncBySource = Array.from(sourceJobMap.values()).sort((a, b) => a.source.localeCompare(b.source));

  // ── Confidence distribution ──
  const confData = (confidenceRes.data ?? []) as Array<{ data_confidence: string | null; data_confidence_score: number | null }>;
  const confidenceDistribution = {
    high: confData.filter(r => r.data_confidence === 'high').length,
    medium: confData.filter(r => r.data_confidence === 'medium').length,
    low: confData.filter(r => r.data_confidence === 'low').length,
    unverified: confData.filter(r => r.data_confidence === 'unverified' || !r.data_confidence).length,
  };

  // Numeric confidence score histogram (buckets of 10)
  const scores = confData.map(r => r.data_confidence_score).filter((s): s is number => s !== null);
  const scoreHistogram: Array<{ bucket: string; count: number }> = [];
  for (let i = 0; i < 10; i++) {
    const lo = i * 10;
    const hi = lo + 10;
    scoreHistogram.push({
      bucket: `${lo}-${hi}`,
      count: scores.filter(s => s >= lo && (i === 9 ? s <= hi : s < hi)).length,
    });
  }

  // ── Source kind distribution in facts ──
  const factKinds = (factSourceKindRes.data ?? []) as Array<{ source_kind: string | null }>;
  const sourceKindBreakdown = {
    official: factKinds.filter(r => r.source_kind === 'official').length,
    company: factKinds.filter(r => r.source_kind === 'company').length,
    curated: factKinds.filter(r => r.source_kind === 'curated').length,
    unknown: factKinds.filter(r => !r.source_kind).length,
  };

  // ── Fact confidence score distribution ──
  const factScores = ((factConfidenceRes.data ?? []) as Array<{ confidence_score: number }>).map(r => r.confidence_score);
  const factScoreHistogram: Array<{ bucket: string; count: number }> = [];
  for (let i = 0; i < 10; i++) {
    const lo = i * 10;
    const hi = lo + 10;
    factScoreHistogram.push({
      bucket: `${lo}-${hi}`,
      count: factScores.filter(s => s >= lo && (i === 9 ? s <= hi : s < hi)).length,
    });
  }

  // ── Data source health ──
  const dataSources = (dataSourcesRes.data ?? []) as Array<{
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
  }>;

  // Compute staleness for each source
  const now = Date.now();
  const sourceHealth = dataSources.map(ds => {
    const lastSync = ds.last_synced_at ? new Date(ds.last_synced_at).getTime() : null;
    const daysSinceSync = lastSync ? Math.floor((now - lastSync) / (1000 * 60 * 60 * 24)) : null;
    let freshness: 'fresh' | 'stale' | 'very_stale' | 'never_synced' = 'never_synced';
    if (daysSinceSync !== null) {
      if (daysSinceSync <= 7) freshness = 'fresh';
      else if (daysSinceSync <= 30) freshness = 'stale';
      else freshness = 'very_stale';
    }
    return { ...ds, daysSinceSync, freshness };
  });

  // ── Lineage completeness ──
  const lineage = {
    facts: { total: factCount, withSyncJob: factsWithLineageRes.count ?? 0 },
    tags: { total: tagCount, withSyncJob: tagsWithLineageRes.count ?? 0 },
    relationships: { total: relationshipCount, withSyncJob: relsWithLineageRes.count ?? 0 },
  };

  // ── Warehouse inventory ──
  const warehouseCounts = {
    institutions: institutionCount,
    registry_entities: registryCount,
    entity_facts: factCount,
    entity_tags: tagCount,
    entity_relationships: relationshipCount,
    charter_events: charterEventCount,
  };

  const payload = {
    syncJobSummary,
    syncBySource,
    recentJobs: (recentJobsRes.data ?? []),
    sourceHealth,
    confidenceDistribution,
    scoreHistogram,
    sourceKindBreakdown,
    factScoreHistogram,
    lineage,
    warehouseCounts,
    provenanceCoverage: {
      total: registryCount,
      withProvenance: provenanceCoverageRes.count ?? 0,
    },
    generatedAt: new Date().toISOString(),
  };

  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
  return res.status(200).json(payload);
});
