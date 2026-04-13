import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Globe2,
  Network,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Workflow,
} from 'lucide-react';
import { Badge, Card, Skeleton } from '@/components/ui';
import { formatCurrency, formatPercent } from '@/lib/format';
import type {
  EntityContextResponse,
  EntityDetail,
  EntityHistoryPoint,
  EntityRelationship,
  EntitySourceRecord,
} from '@/types/entity';
import { EntityShell } from '@/components/entity/EntityShell';
import { EntityMetricStrip } from '@/components/entity/EntityMetricStrip';
import { EntityContextSectionCard } from '@/components/entity/EntityContextSection';
import { EntityHistoryChart } from '@/components/entity/EntityHistoryChart';
import { EntityRelationshipList } from '@/components/entity/EntityRelationshipList';
import { EntitySourceList } from '@/components/entity/EntitySourceList';
import type { EntityMetricStripProps } from '@/components/entity/EntityMetricStrip';

type MacroSeriesResponse = {
  series: Array<{
    series_key: string;
    display_name: string;
    period: string;
    value: number;
    unit: string | null;
  }>;
};

type MacroSignal = {
  series_key: string;
  display_name: string;
  period: string;
  value: number;
  unit: string | null;
  delta: number | null;
};

function HeaderLinkButton({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-100 hover:border-slate-200"
    >
      {children}
    </Link>
  );
}

function InsightCard({
  eyebrow,
  title,
  summary,
  children,
  icon,
}: {
  eyebrow: string;
  title: string;
  summary: string;
  children: ReactNode;
  icon: ReactNode;
}) {
  return (
    <Card className="border-slate-200 bg-slate-50/80 text-slate-900 shadow-2xl shadow-slate-200/50">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">{eyebrow}</p>
          <h3 className="mt-2 text-lg font-semibold text-slate-900">{title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-500">{summary}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3 text-cyan-600">{icon}</div>
      </div>
      {children}
    </Card>
  );
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}`);
  return res.json();
}

function sourceTone(sourceKind: string) {
  if (sourceKind === 'official') return 'green';
  if (sourceKind === 'company') return 'blue';
  return 'yellow';
}

function toneByDelta(delta: number | null) {
  if (delta == null) return 'bg-slate-50 text-slate-700';
  return delta > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700';
}

function formatSeriesValue(value: number, unit: string | null) {
  if (unit === 'percent') return `${value.toFixed(2)}%`;
  if (unit === 'fx') return value.toFixed(4);
  return value.toLocaleString();
}

function formatSeriesDelta(delta: number | null, unit: string | null) {
  if (delta == null) return 'flat';
  const prefix = delta > 0 ? '+' : '';
  if (unit === 'percent') return `${prefix}${delta.toFixed(2)} pts`;
  if (unit === 'fx') return `${prefix}${delta.toFixed(4)}`;
  return `${prefix}${delta.toFixed(2)}`;
}

function groupMacroSignals(rows: MacroSeriesResponse['series']): MacroSignal[] {
  const grouped = new Map<string, MacroSeriesResponse['series']>();

  [...rows]
    .sort((a, b) => b.period.localeCompare(a.period))
    .forEach((row) => {
      const bucket = grouped.get(row.series_key) ?? [];
      bucket.push(row);
      grouped.set(row.series_key, bucket);
    });

  return [...grouped.entries()].slice(0, 3).map(([seriesKey, bucket]) => ({
    series_key: seriesKey,
    display_name: bucket[0].display_name,
    period: bucket[0].period,
    value: bucket[0].value,
    unit: bucket[0].unit,
    delta: bucket[1] ? bucket[0].value - bucket[1].value : null,
  }));
}

function searchLink(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  return `/entities?${search.toString()}`;
}

export default function EntityPage() {
  const { entityId = '' } = useParams();

  const entityQuery = useQuery({
    queryKey: ['entity', entityId],
    queryFn: () => fetchJson<{ entity: EntityDetail }>(`/api/entities/${entityId}`),
    enabled: !!entityId,
  });
  const contextQuery = useQuery({
    queryKey: ['entity-context', entityId],
    queryFn: () => fetchJson<EntityContextResponse>(`/api/entities/${entityId}/context`),
    enabled: !!entityId,
  });
  const historyQuery = useQuery({
    queryKey: ['entity-history', entityId],
    queryFn: () => fetchJson<{ history: EntityHistoryPoint[] }>(`/api/entities/${entityId}/history`),
    enabled: !!entityId,
  });
  const relationshipsQuery = useQuery({
    queryKey: ['entity-relationships', entityId],
    queryFn: () => fetchJson<{ relationships: EntityRelationship[] }>(`/api/entities/${entityId}/relationships`),
    enabled: !!entityId,
  });
  const sourcesQuery = useQuery({
    queryKey: ['entity-sources', entityId],
    queryFn: () => fetchJson<{ sources: EntitySourceRecord[] }>(`/api/entities/${entityId}/sources`),
    enabled: !!entityId,
  });

  const entity = entityQuery.data?.entity;
  const context = contextQuery.data;
  const history = historyQuery.data?.history ?? [];
  const relationships = relationshipsQuery.data?.relationships ?? [];
  const sources = sourcesQuery.data?.sources ?? [];

  const macroQuery = useQuery({
    queryKey: ['entity-macro', entity?.country],
    queryFn: () => fetchJson<MacroSeriesResponse>(`/api/series/search?country=${entity?.country}&limit=24`),
    enabled: entity?.country === 'CA',
    staleTime: 15 * 60 * 1000,
  });

  const macroSignals = useMemo(() => groupMacroSignals(macroQuery.data?.series ?? []), [macroQuery.data?.series]);
  const contextByKey = useMemo(
    () => new Map((context?.sections ?? []).map((section) => [section.key, section])),
    [context?.sections]
  );
  const sourceBreakdown = useMemo(() => ({
    official: sources.filter((source) => source.source_kind === 'official').length,
    company: sources.filter((source) => source.source_kind === 'company').length,
    curated: sources.filter((source) => source.source_kind === 'curated').length,
  }), [sources]);
  const activeRelationships = relationships.filter((relationship) => relationship.active).length;
  const latestHistory = history[0] ?? null;
  const previousHistory = history[1] ?? null;
  const depositDelta =
    latestHistory?.total_deposits != null && previousHistory?.total_deposits != null
      ? latestHistory.total_deposits - previousHistory.total_deposits
      : null;

  type MetricTone = NonNullable<EntityMetricStripProps['cards'][number]['tone']>;

  const metrics = useMemo(() => {
    if (!entity) return [];
    const contextTone: MetricTone = context && context.context_completeness >= 75 ? 'positive' : 'caution';
    const relationshipTone: MetricTone = activeRelationships > 0 ? 'positive' : 'caution';
    const evidenceTone: MetricTone = sourceBreakdown.official > 0 ? 'positive' : 'caution';

    return [
      {
        label: 'Assets',
        value: formatCurrency(entity.metrics.total_assets),
        detail: entity.data_as_of ?? 'No freshness date',
        tone: (entity.metrics.total_assets != null ? 'positive' : 'default') as MetricTone,
      },
      {
        label: 'Deposits',
        value: formatCurrency(entity.metrics.total_deposits),
        detail: depositDelta != null ? `${formatCurrency(depositDelta)} vs prior point` : 'Historical delta pending',
        tone: (depositDelta != null ? (depositDelta >= 0 ? 'positive' : 'caution') : 'default') as MetricTone,
      },
      {
        label: 'Graph edges',
        value: String(relationships.length),
        detail: `${activeRelationships} active counterparties`,
        tone: relationshipTone,
      },
      {
        label: 'Evidence',
        value: `${sourceBreakdown.official}/${sources.length}`,
        detail: 'Official records / total references',
        tone: evidenceTone,
      },
      {
        label: 'Context',
        value: context ? `${context.context_completeness}%` : '—',
        detail: context ? `${context.sections.length} sections loaded` : 'No context loaded',
        tone: contextTone,
      },
    ] satisfies EntityMetricStripProps['cards'];
  }, [activeRelationships, context, depositDelta, entity, relationships.length, sourceBreakdown.official, sources.length]);

  const drillLinks = useMemo(() => {
    if (!entity) return [];

    return [
      {
        label: 'Same jurisdiction + profile type',
        to: searchLink({ country: entity.country, profile_kind: entity.profile_kind }),
      },
      {
        label: 'Same regulator',
        to: searchLink({ regulator: entity.regulator ?? entity.source_authority }),
      },
      entity.charter_family
        ? {
            label: 'Same charter family',
            to: searchLink({ charter_family: entity.charter_family }),
          }
        : null,
      entity.business_roles[0]
        ? {
            label: 'Same business role',
            to: searchLink({ business_role: entity.business_roles[0] }),
          }
        : null,
      {
        label: 'Same source authority',
        to: searchLink({ source_authority: entity.source_authority }),
      },
    ].filter(Boolean) as Array<{ label: string; to: string }>;
  }, [entity]);

  if (entityQuery.isLoading && !entity) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-white px-4 py-8 text-slate-900">
        <div className="mx-auto max-w-7xl space-y-4">
          <Skeleton className="h-12 bg-slate-50/70" />
          <Skeleton className="h-36 bg-slate-50/70" />
          <Skeleton className="h-80 bg-slate-50/70" />
        </div>
      </div>
    );
  }

  if (entityQuery.error || !entity) {
    return (
      <EntityShell
        eyebrow="Entity terminal"
        title="Entity not found"
        subtitle="The entity profile could not be loaded. It may not exist yet, or the source table is still missing from the live backend."
        actions={
          <HeaderLinkButton to="/entities">
            <ArrowLeft className="h-4 w-4" />
            Back to search
          </HeaderLinkButton>
        }
      >
        <Card className="border-slate-200 bg-slate-50/80 text-slate-900">
          <p className="text-sm text-slate-700">Try a different entity ID or return to the entity search terminal.</p>
        </Card>
      </EntityShell>
    );
  }

  return (
    <EntityShell
      eyebrow={`${entity.profile_kind.replace(/_/g, ' ')} · ${entity.country_label}`}
      title={entity.name}
      subtitle={entity.context_summary}
      actions={
        <>
          <HeaderLinkButton to="/entities">
            <ArrowLeft className="h-4 w-4" />
            Search
          </HeaderLinkButton>
          {entity.cert_number != null && (
            <HeaderLinkButton to={`/institution/${entity.cert_number}`}>
              <ShieldCheck className="h-4 w-4" />
              Legacy profile
            </HeaderLinkButton>
          )}
        </>
      }
      stats={
        <EntityMetricStrip
          cards={metrics}
          rightSlot={
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="flex flex-wrap gap-2">
                <Badge color={sourceTone(entity.source_kind)} className="bg-slate-100 text-slate-900 ring-slate-700">
                  {entity.source_authority}
                </Badge>
                <Badge color="gray" className="bg-slate-100 text-slate-900 ring-slate-700">
                  {entity.entity_type.replace(/_/g, ' ')}
                </Badge>
                {entity.business_roles.slice(0, 2).map((role) => (
                  <Badge key={role} color="blue" className="bg-slate-100 text-slate-900 ring-slate-700">
                    {role.replace(/_/g, ' ')}
                  </Badge>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-500">
                <div>
                  <p className="uppercase tracking-[0.2em] text-slate-500">Status</p>
                  <p className="mt-1 text-slate-900">{entity.status.replace(/_/g, ' ')}</p>
                </div>
                <div>
                  <p className="uppercase tracking-[0.2em] text-slate-500">Updated</p>
                  <p className="mt-1 text-slate-900">{entity.last_synced_at ?? entity.data_as_of ?? 'Unknown'}</p>
                </div>
                <div>
                  <p className="uppercase tracking-[0.2em] text-slate-500">Country</p>
                  <p className="mt-1 text-slate-900">{entity.country_label}</p>
                </div>
                <div>
                  <p className="uppercase tracking-[0.2em] text-slate-500">Confidence</p>
                  <p className="mt-1 text-slate-900">{entity.confidence_score != null ? `${Math.round(entity.confidence_score * 100)}%` : 'n/a'}</p>
                </div>
              </div>
            </div>
          }
        />
      }
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.95fr)]">
        <EntityHistoryChart history={history} />

        <div className="space-y-5">
          <InsightCard
            eyebrow="Command brief"
            title="Why this profile matters"
            summary={contextByKey.get('ai')?.summary ?? entity.context_summary}
            icon={<Sparkles className="h-5 w-5" />}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ['Legal name', entity.legal_name ?? entity.name],
                ['Location', [entity.city, entity.state, entity.country_label].filter(Boolean).join(', ') || entity.country_label],
                ['Regulator', entity.regulator ?? entity.source_authority],
                ['Parent / holding', entity.holding_company ?? entity.parent_name ?? 'Not loaded'],
                ['External IDs', entity.external_ids.length > 0 ? entity.external_ids.map((id) => `${id.id_type}: ${id.id_value}`).join(' · ') : 'None'],
                ['Tags', entity.tags.length > 0 ? entity.tags.slice(0, 4).map((tag) => `${tag.tag_key}: ${tag.tag_value}`).join(' · ') : 'No tags loaded'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-slate-200 bg-white/80 p-3">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</p>
                  <p className="mt-1 text-sm leading-snug text-slate-900">{value}</p>
                </div>
              ))}
            </div>
            {entity.website && (
              <a
                href={entity.website}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-cyan-600 hover:text-cyan-600"
              >
                Open website
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </InsightCard>

          <InsightCard
            eyebrow="Evidence posture"
            title="Source stack"
            summary="Official records should dominate when available, with company and curated layers clearly separated."
            icon={<Workflow className="h-5 w-5" />}
          >
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: 'Official', value: sourceBreakdown.official },
                { label: 'Company', value: sourceBreakdown.company },
                { label: 'Curated', value: sourceBreakdown.curated },
              ].map((bucket) => (
                <div key={bucket.label} className="rounded-xl border border-slate-200 bg-white/80 p-3">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{bucket.label}</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{bucket.value}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-xl border border-slate-200 bg-white/80 p-3">
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Evidence summary</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">
                {sourceBreakdown.official > 0
                  ? 'This profile already has primary-source backing in the attached provenance set.'
                  : 'This profile still leans on curated or secondary context and should be treated as partially verified.'}
              </p>
            </div>
          </InsightCard>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <InsightCard
          eyebrow="Regulatory environment"
          title={contextByKey.get('regulatory')?.title ?? 'Regulatory context'}
          summary={contextByKey.get('regulatory')?.summary ?? 'Primary authority and charter posture for this entity.'}
          icon={<ShieldCheck className="h-5 w-5" />}
        >
          <div className="space-y-3">
            {(contextByKey.get('regulatory')?.items ?? []).map((item) => (
              <div key={item.label} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white/80 px-3 py-3 text-sm">
                <span className="text-slate-500">{item.label}</span>
                <span className="text-right text-slate-900">{item.value}</span>
              </div>
            ))}
          </div>
        </InsightCard>

        <InsightCard
          eyebrow="Network position"
          title="Relationship posture"
          summary={contextByKey.get('relationships')?.summary ?? 'Structured connections to counterparties, partners, and parent entities.'}
          icon={<Network className="h-5 w-5" />}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white/80 p-3">
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Active edges</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{activeRelationships}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white/80 p-3">
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Counterparties</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{relationships.length}</p>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {relationships.slice(0, 3).map((relationship) => (
              <div key={relationship.id} className="rounded-xl border border-slate-200 bg-white/80 px-3 py-3">
                <p className="text-sm font-medium text-slate-900">
                  {relationship.relationship_label ?? relationship.relationship_type.replace(/_/g, ' ')}
                </p>
                <p className="mt-1 text-xs text-slate-500">{relationship.counterparty.name}</p>
              </div>
            ))}
            {relationships.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                Relationship enrichment is still sparse for this profile.
              </div>
            )}
          </div>
        </InsightCard>

        <InsightCard
          eyebrow="Drill commands"
          title="Move up and down the graph"
          summary="Jump to peer universes and adjacent slices of the market without losing context."
          icon={<ArrowRight className="h-5 w-5" />}
        >
          <div className="space-y-2">
            {drillLinks.map((link) => (
              <Link
                key={link.label}
                to={link.to}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white/80 px-3 py-3 text-sm transition-colors hover:border-cyan-500/50 hover:text-cyan-500"
              >
                <span>{link.label}</span>
                <ArrowRight className="h-4 w-4 text-cyan-600" />
              </Link>
            ))}
          </div>
        </InsightCard>
      </div>

      {macroSignals.length > 0 && (
        <InsightCard
          eyebrow="Macro overlay"
          title="Canada market backdrop"
          summary="Local rates and FX context surfaced from Bank of Canada series already loaded into the warehouse."
          icon={<Globe2 className="h-5 w-5" />}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            {macroSignals.map((signal) => (
              <div key={signal.series_key} className="rounded-xl border border-slate-200 bg-white/80 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{signal.display_name}</p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">{formatSeriesValue(signal.value, signal.unit)}</p>
                    <p className="mt-1 text-xs text-slate-500">{signal.period}</p>
                  </div>
                  <div className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${toneByDelta(signal.delta)}`}>
                    {signal.delta == null ? null : signal.delta > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                    {formatSeriesDelta(signal.delta, signal.unit)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </InsightCard>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        {(context?.sections ?? [])
          .filter((section) => section.key === 'identity' || section.key === 'business_model' || section.key === 'financial' || section.key === 'market')
          .map((section) => (
            <EntityContextSectionCard key={section.key} section={section} />
          ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <EntityRelationshipList relationships={relationships} />
        <EntitySourceList sources={sources} />
      </div>

      <InsightCard
        eyebrow="Terminal summary"
        title="At a glance"
        summary="Quick operating read on balance-sheet momentum, context completeness, and verification posture."
        icon={<Activity className="h-5 w-5" />}
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'ROA / ROE', value: `${formatPercent(entity.metrics.roa)} / ${formatPercent(entity.metrics.roi)}` },
            { label: 'Latest point', value: latestHistory?.period ?? 'No history loaded' },
            { label: 'Deposits delta', value: formatCurrency(depositDelta) },
            { label: 'Context sections', value: context ? String(context.sections.length) : '0' },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-slate-200 bg-white/80 p-3">
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{item.label}</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{item.value}</p>
            </div>
          ))}
        </div>
      </InsightCard>
    </EntityShell>
  );
}
