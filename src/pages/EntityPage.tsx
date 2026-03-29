import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, ShieldCheck, Activity, Network, Database } from 'lucide-react';
import { Badge, Card, Skeleton } from '@/components/ui';
import type { EntityContextResponse, EntityDetail, EntityHistoryPoint, EntityRelationship, EntitySourceRecord } from '@/types/entity';
import { EntityShell } from '@/components/entity/EntityShell';
import { EntityMetricStrip } from '@/components/entity/EntityMetricStrip';
import { EntityContextSectionCard } from '@/components/entity/EntityContextSection';
import { EntityHistoryChart } from '@/components/entity/EntityHistoryChart';
import { EntityRelationshipList } from '@/components/entity/EntityRelationshipList';
import { EntitySourceList } from '@/components/entity/EntitySourceList';
import type { EntityMetricStripProps } from '@/components/entity/EntityMetricStrip';

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
      className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm font-medium text-slate-100 transition-colors hover:bg-slate-800 hover:border-slate-600"
    >
      {children}
    </Link>
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
  type MetricTone = NonNullable<EntityMetricStripProps['cards'][number]['tone']>;

  const metrics = useMemo(() => {
    if (!entity) return [];
    const historyTone: MetricTone = history.length > 0 ? 'positive' : 'caution';
    const contextTone: MetricTone = context && context.context_completeness >= 75 ? 'positive' : 'caution';
    return [
      {
        label: 'Assets',
        value: entity.metrics.total_assets != null ? `$${entity.metrics.total_assets.toLocaleString()}` : '—',
        detail: entity.data_as_of ?? 'No freshness date',
        tone: 'positive' as const,
      },
      {
        label: 'Deposits',
        value: entity.metrics.total_deposits != null ? `$${entity.metrics.total_deposits.toLocaleString()}` : '—',
        detail: entity.source_authority,
      },
      {
        label: 'History',
        value: String(history.length),
        detail: 'Quarterly observations',
        tone: historyTone,
      },
      {
        label: 'Context completeness',
        value: context ? `${context.context_completeness}%` : '—',
        detail: context ? `${context.sections.length} sections` : 'No context loaded',
        tone: contextTone,
      },
    ];
  }, [entity, context, history.length]);

  if (entityQuery.isLoading && !entity) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-slate-950 text-slate-100 px-4 py-8">
        <div className="max-w-7xl mx-auto space-y-4">
          <Skeleton className="h-12 bg-slate-800/70" />
          <Skeleton className="h-36 bg-slate-800/70" />
          <Skeleton className="h-80 bg-slate-800/70" />
        </div>
      </div>
    );
  }

  if (entityQuery.error || !entity) {
    return (
      <EntityShell
        eyebrow="Entity profile"
        title="Entity not found"
        subtitle="The entity profile could not be loaded. It may not exist yet or the source table is still missing."
        actions={
          <HeaderLinkButton to="/entities">
            <ArrowLeft className="h-4 w-4" />
            Back to search
          </HeaderLinkButton>
        }
      >
        <Card className="bg-slate-900/80 border-slate-700 text-slate-100">
          <p className="text-sm text-slate-300">Try a different entity ID or return to entity search.</p>
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
            <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4">
              <div className="flex flex-wrap gap-2">
                <Badge color={sourceTone(entity.source_kind)} className="bg-slate-800 text-slate-100 ring-slate-700">
                  {entity.source_authority}
                </Badge>
                <Badge color="gray" className="bg-slate-800 text-slate-100 ring-slate-700">
                  {entity.entity_type.replace(/_/g, ' ')}
                </Badge>
                {entity.business_roles.slice(0, 2).map((role) => (
                  <Badge key={role} color="blue" className="bg-slate-800 text-slate-100 ring-slate-700">
                    {role.replace(/_/g, ' ')}
                  </Badge>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-400">
                <div>
                  <p className="uppercase tracking-[0.2em] text-slate-500">Status</p>
                  <p className="mt-1 text-slate-100">{entity.status.replace(/_/g, ' ')}</p>
                </div>
                <div>
                  <p className="uppercase tracking-[0.2em] text-slate-500">Updated</p>
                  <p className="mt-1 text-slate-100">{entity.last_synced_at ?? entity.data_as_of ?? 'Unknown'}</p>
                </div>
                <div>
                  <p className="uppercase tracking-[0.2em] text-slate-500">Country</p>
                  <p className="mt-1 text-slate-100">{entity.country_label}</p>
                </div>
                <div>
                  <p className="uppercase tracking-[0.2em] text-slate-500">Confidence</p>
                  <p className="mt-1 text-slate-100">{entity.confidence_score != null ? `${Math.round(entity.confidence_score * 100)}%` : 'n/a'}</p>
                </div>
              </div>
            </div>
          }
        />
      }
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,0.95fr)]">
        <EntityHistoryChart history={history} />

        <Card className="bg-slate-900/80 border-slate-700 text-slate-100 shadow-2xl shadow-slate-950/30">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-200">
                Profile Facts
              </h3>
              <p className="mt-1 text-xs text-slate-400">A quick contextual read on the entity.</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ['Legal name', entity.legal_name ?? entity.name],
              ['Location', [entity.city, entity.state, entity.country_label].filter(Boolean).join(', ') || entity.country_label],
              ['Regulator', entity.regulator ?? entity.source_authority],
              ['Charter family', entity.charter_family ?? 'Not classified'],
              ['Parent / holding', entity.holding_company ?? entity.parent_name ?? 'Not loaded'],
              ['External IDs', entity.external_ids.length > 0 ? entity.external_ids.map((id) => `${id.id_type}: ${id.id_value}`).join(' · ') : 'None'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-slate-700 bg-slate-950/70 p-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</p>
                <p className="mt-1 text-sm text-slate-100 leading-snug">{value}</p>
              </div>
            ))}
          </div>
          {entity.website && (
            <a
              href={entity.website}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-cyan-300 hover:text-cyan-200"
            >
              Open website
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        {context?.sections
          .filter((section) => section.key === 'identity' || section.key === 'regulatory' || section.key === 'business_model' || section.key === 'financial')
          .map((section) => (
            <EntityContextSectionCard key={section.key} section={section} />
          ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <EntityRelationshipList relationships={relationships} />
        <EntitySourceList sources={sources} />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        {context?.sections
          .filter((section) => section.key === 'relationships' || section.key === 'market' || section.key === 'sources' || section.key === 'ai')
          .map((section) => (
            <EntityContextSectionCard key={section.key} section={section} />
          ))}
      </div>

      <Card className="bg-slate-900/80 border-slate-700 text-slate-100 shadow-2xl shadow-slate-950/30">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-200">
              At A Glance
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              This entity profile is optimized for quick context, provenance, and next-step research.
            </p>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <Activity className="h-4 w-4" />
            <Network className="h-4 w-4" />
            <Database className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-4 text-sm text-slate-300 leading-relaxed">
          {context?.sections.find((section) => section.key === 'ai')?.summary ?? entity.context_summary}
        </div>
      </Card>
    </EntityShell>
  );
}
