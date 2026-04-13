import type { ReactNode } from 'react';
import { startTransition, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  Building2,
  ChevronLeft,
  ChevronRight,
  Database,
  Globe2,
  Network,
  Search,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Workflow,
} from 'lucide-react';
import { Badge, Button, Card, Input, Select, Skeleton } from '@/components/ui';
import { EntityFacetRail } from '@/components/entity/EntityFacetRail';
import { formatCurrency, formatPercent } from '@/lib/format';
import type {
  EntityContextResponse,
  EntityHistoryPoint,
  EntityProfileKind,
  EntityRelationship,
  EntitySearchResponse,
  EntitySourceRecord,
  EntitySummary,
} from '@/types/entity';

type CountryFilter = 'all' | 'US' | 'CA' | 'NA';

type ReadinessResponse = {
  overall_status: 'blocked' | 'in_progress' | 'ready';
  warehouse: {
    status: 'blocked' | 'ready';
    ready_tables?: number;
    total_tables?: number;
  };
  sources: {
    loaded: number;
    active: number;
    pending: number;
    unavailable: number;
    sync_ready: number;
    sync_blocked: number;
    top_loaded: Array<{
      source_key: string;
      display_name: string;
      record_count: number | null;
      data_as_of: string | null;
    }>;
    blocked_syncs: Array<{
      source_key: string;
      missing_requirements: Array<{ label: string }>;
    }>;
  };
};

type SourceCatalogResponse = {
  sources: Array<{
    source_key: string;
    display_name: string;
    category_label: string;
    record_count: number | null;
    coverage_label: string;
    loaded: boolean;
    sync_ready: boolean | null;
    data_as_of: string | null;
  }>;
};

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

const PROFILE_KIND_OPTIONS: Array<{ value: 'all' | EntityProfileKind; label: string }> = [
  { value: 'all', label: 'All profiles' },
  { value: 'regulated_institution', label: 'Regulated institutions' },
  { value: 'registry_entity', label: 'Registry entities' },
];

const COUNTRY_OPTIONS: Array<{ value: CountryFilter; label: string }> = [
  { value: 'all', label: 'All countries' },
  { value: 'US', label: 'United States' },
  { value: 'CA', label: 'Canada' },
  { value: 'NA', label: 'North America' },
];

function sourceBadgeColor(sourceKind: string) {
  if (sourceKind === 'official') return 'green';
  if (sourceKind === 'company') return 'blue';
  return 'yellow';
}

function profileTone(profileKind: EntityProfileKind) {
  switch (profileKind) {
    case 'regulated_institution':
      return 'green';
    case 'registry_entity':
      return 'blue';
  }
}

async function fetchEntities(params: Record<string, string | number | undefined>): Promise<EntitySearchResponse> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== '') search.set(key, String(value));
  }
  const res = await fetch(`/api/entities/search?${search}`);
  if (!res.ok) throw new Error('Failed to load entity search');
  return res.json();
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}`);
  return res.json();
}

function formatSeriesValue(value: number, unit: string | null) {
  if (unit === 'percent') return `${value.toFixed(2)}%`;
  if (unit === 'fx') return value.toFixed(4);
  return value.toLocaleString();
}

function formatSeriesDelta(value: number | null, unit: string | null) {
  if (value == null) return 'flat';
  const prefix = value > 0 ? '+' : '';
  if (unit === 'percent') return `${prefix}${value.toFixed(2)} pts`;
  if (unit === 'fx') return `${prefix}${value.toFixed(4)}`;
  return `${prefix}${value.toFixed(2)}`;
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

  return [...grouped.entries()].slice(0, 4).map(([seriesKey, bucket]) => ({
    series_key: seriesKey,
    display_name: bucket[0].display_name,
    period: bucket[0].period,
    value: bucket[0].value,
    unit: bucket[0].unit,
    delta: bucket[1] ? bucket[0].value - bucket[1].value : null,
  }));
}

function SummaryTile({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-200/50">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{label}</p>
          <p className="mt-2 text-xl font-semibold text-slate-900">{value}</p>
          <p className="mt-1 text-xs text-slate-400">{detail}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-cyan-600">{icon}</div>
      </div>
    </div>
  );
}

function ResultSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <Skeleton key={index} className="h-28 bg-slate-50/70" />
      ))}
    </div>
  );
}

function IntelligenceRow({
  entity,
  focused,
  onFocus,
}: {
  entity: EntitySummary;
  focused: boolean;
  onFocus: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onFocus}
      className={`group w-full rounded-2xl border px-4 py-4 text-left transition-all ${
        focused
          ? 'border-cyan-400/60 bg-cyan-500/10 shadow-2xl shadow-cyan-950/20'
          : 'border-slate-200 bg-white hover:border-slate-200 hover:bg-slate-50/90'
      }`}
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,0.9fr)_190px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold text-slate-900">{entity.name}</h3>
            <Badge color={profileTone(entity.profile_kind)} className="bg-slate-50 text-slate-900 ring-slate-200">
              {entity.profile_kind.replace(/_/g, ' ')}
            </Badge>
            <Badge color={sourceBadgeColor(entity.source_kind)} className="bg-slate-50 text-slate-900 ring-slate-200">
              {entity.source_authority}
            </Badge>
            <Badge color="gray" className="bg-slate-50 text-slate-700 ring-slate-200">
              {entity.status.replace(/_/g, ' ')}
            </Badge>
          </div>
          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate-700">{entity.context_summary}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
            <span>{entity.country_label}</span>
            <span>{[entity.city, entity.state].filter(Boolean).join(', ') || 'Location pending'}</span>
            <span>{entity.regulator ?? entity.source_authority}</span>
            {entity.charter_family && <span>{entity.charter_family.replace(/_/g, ' ')}</span>}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Business model</p>
            <p className="mt-1 text-sm text-slate-900">
              {entity.business_roles.length > 0
                ? entity.business_roles.slice(0, 2).map((role) => role.replace(/_/g, ' ')).join(', ')
                : entity.entity_type.replace(/_/g, ' ')}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Confidence</p>
            <p className="mt-1 text-sm text-slate-900">
              {entity.confidence_score != null ? `${Math.round(entity.confidence_score * 100)}%` : 'n/a'}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Assets</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{formatCurrency(entity.metrics.total_assets)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Deposits</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{formatCurrency(entity.metrics.total_deposits)}</p>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Freshness</p>
              <p className="mt-1 text-xs text-slate-700">{entity.data_as_of ?? entity.last_synced_at ?? 'Unknown'}</p>
            </div>
            <Link
              to={`/entities/${entity.id}`}
              onClick={(event) => event.stopPropagation()}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-cyan-600 transition-colors hover:border-cyan-500/50 hover:text-cyan-500"
            >
              Open
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </button>
  );
}

function PreviewPanel({
  entity,
  context,
  history,
  relationships,
  sources,
  loading,
}: {
  entity: EntitySummary | null;
  context: EntityContextResponse | undefined;
  history: EntityHistoryPoint[];
  relationships: EntityRelationship[];
  sources: EntitySourceRecord[];
  loading: boolean;
}) {
  const regulatory = context?.sections.find((section) => section.key === 'regulatory');
  const businessModel = context?.sections.find((section) => section.key === 'business_model');
  const market = context?.sections.find((section) => section.key === 'market');
  const ai = context?.sections.find((section) => section.key === 'ai');

  return (
    <div className="space-y-4 xl:sticky xl:top-24">
      <Card className="border-slate-200 bg-white text-slate-900 shadow-2xl shadow-slate-200/50">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-cyan-600/80">Context preview</p>
            <h2 className="mt-2 text-lg font-semibold text-slate-900">
              {entity?.name ?? 'Select an entity'}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-700">
              {entity?.context_summary ?? 'Pick a row to see regulatory, financial, and relationship context before drilling in.'}
            </p>
          </div>
          <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-3 text-cyan-600">
            <Sparkles className="h-5 w-5" />
          </div>
        </div>

        {entity && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge color={profileTone(entity.profile_kind)} className="bg-slate-50 text-slate-900 ring-slate-200">
              {entity.profile_kind.replace(/_/g, ' ')}
            </Badge>
            <Badge color="gray" className="bg-slate-50 text-slate-700 ring-slate-200">
              {entity.regulator ?? entity.source_authority}
            </Badge>
            {entity.charter_family && (
              <Badge color="gray" className="bg-slate-50 text-slate-700 ring-slate-200">
                {entity.charter_family.replace(/_/g, ' ')}
              </Badge>
            )}
          </div>
        )}
      </Card>

      <Card className="border-slate-200 bg-slate-50/80 text-slate-900">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 bg-slate-50/70" />
            <Skeleton className="h-20 bg-slate-50/70" />
            <Skeleton className="h-20 bg-slate-50/70" />
          </div>
        ) : entity ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              {[
                { label: 'Relationships', value: relationships.length.toLocaleString() },
                { label: 'Sources', value: sources.length.toLocaleString() },
                { label: 'History', value: history.length.toLocaleString() },
                { label: 'ROA', value: formatPercent(entity.metrics.roa) },
              ].map((metric) => (
                <div key={metric.label} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{metric.label}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{metric.value}</p>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              {[
                regulatory,
                businessModel,
                market,
              ]
                .filter(Boolean)
                .map((section) => (
                  <div key={section!.key} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{section!.title}</p>
                    <p className="mt-2 text-sm leading-relaxed text-slate-800">{section!.summary}</p>
                    <div className="mt-3 space-y-2">
                      {section!.items.slice(0, 3).map((item) => (
                        <div key={`${section!.key}-${item.label}`} className="flex items-start justify-between gap-3 text-sm">
                          <span className="text-slate-400">{item.label}</span>
                          <span className="text-right text-slate-900">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Why it matters</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-800">{ai?.summary ?? entity.context_summary}</p>
            </div>

            <Link
              to={`/entities/${entity.id}`}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm font-medium text-cyan-700 transition-colors hover:bg-cyan-100"
            >
              Open full entity terminal
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-400">
            Select an entity to preview its regulatory environment, business model, market posture, and evidence trail.
          </div>
        )}
      </Card>
    </div>
  );
}

export default function EntitiesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [focusedEntityId, setFocusedEntityId] = useState('');
  const deferredQuery = useDeferredValue(query);
  const country = (searchParams.get('country') as CountryFilter) ?? 'all';
  const profileKind = (searchParams.get('profile_kind') as 'all' | EntityProfileKind) ?? 'all';
  const businessRole = searchParams.get('business_role') ?? '';
  const regulator = searchParams.get('regulator') ?? '';
  const charterFamily = searchParams.get('charter_family') ?? '';
  const sourceAuthority = searchParams.get('source_authority') ?? '';
  const status = searchParams.get('status') ?? '';
  const page = Number(searchParams.get('page') ?? 1);
  const view = searchParams.get('view') === 'cards' ? 'cards' : 'terminal';

  const params = useMemo(() => ({
    q: deferredQuery,
    country,
    profile_kind: profileKind,
    business_role: businessRole,
    regulator,
    charter_family: charterFamily,
    source_authority: sourceAuthority,
    status,
    page: Math.max(1, page),
    per_page: 20,
  }), [businessRole, charterFamily, country, deferredQuery, page, profileKind, regulator, sourceAuthority, status]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['entities', params],
    queryFn: () => fetchEntities(params),
    placeholderData: (prev) => prev,
  });
  const readinessQuery = useQuery({
    queryKey: ['data-readiness'],
    queryFn: () => fetchJson<ReadinessResponse>('/api/qa/data-readiness'),
    staleTime: 60_000,
  });
  const sourcesQuery = useQuery({
    queryKey: ['sources-active'],
    queryFn: () => fetchJson<SourceCatalogResponse>('/api/sources?status=active'),
    staleTime: 5 * 60 * 1000,
  });
  const macroQuery = useQuery({
    queryKey: ['series', 'boc'],
    queryFn: () => fetchJson<MacroSeriesResponse>('/api/series/search?source_key=boc&country=CA&limit=32'),
    staleTime: 15 * 60 * 1000,
  });

  const entities = data?.entities ?? [];
  const totalPages = data ? Math.ceil(data.total / data.per_page) : 0;
  const previewEntityId = focusedEntityId || entities[0]?.id || '';
  const previewEntity = useMemo(
    () => entities.find((entity) => entity.id === previewEntityId) ?? entities[0] ?? null,
    [entities, previewEntityId]
  );

  useEffect(() => {
    if (!entities.length) {
      setFocusedEntityId('');
      return;
    }

    if (!focusedEntityId || !entities.some((entity) => entity.id === focusedEntityId)) {
      startTransition(() => setFocusedEntityId(entities[0].id));
    }
  }, [entities, focusedEntityId]);

  const previewContextQuery = useQuery({
    queryKey: ['entity-context-preview', previewEntityId],
    queryFn: () => fetchJson<EntityContextResponse>(`/api/entities/${previewEntityId}/context`),
    enabled: !!previewEntityId,
  });
  const previewHistoryQuery = useQuery({
    queryKey: ['entity-history-preview', previewEntityId],
    queryFn: () => fetchJson<{ history: EntityHistoryPoint[] }>(`/api/entities/${previewEntityId}/history`),
    enabled: !!previewEntityId,
  });
  const previewRelationshipsQuery = useQuery({
    queryKey: ['entity-relationships-preview', previewEntityId],
    queryFn: () => fetchJson<{ relationships: EntityRelationship[] }>(`/api/entities/${previewEntityId}/relationships`),
    enabled: !!previewEntityId,
  });
  const previewSourcesQuery = useQuery({
    queryKey: ['entity-sources-preview', previewEntityId],
    queryFn: () => fetchJson<{ sources: EntitySourceRecord[] }>(`/api/entities/${previewEntityId}/sources`),
    enabled: !!previewEntityId,
  });

  function updateParam(next: Record<string, string | number | undefined>) {
    const nextParams = new URLSearchParams(searchParams);
    const nextQuery = 'q' in next ? String(next.q ?? '') : query;
    if (nextQuery) nextParams.set('q', nextQuery);
    else nextParams.delete('q');

    for (const [key, value] of Object.entries(next)) {
      if (value == null || value === '') nextParams.delete(key);
      else nextParams.set(key, String(value));
    }
    if ('q' in next || 'country' in next || 'profile_kind' in next || 'business_role' in next || 'regulator' in next || 'charter_family' in next || 'source_authority' in next || 'status' in next) {
      nextParams.set('page', '1');
    }
    startTransition(() => {
      setSearchParams(nextParams, { replace: true });
    });
  }

  const loadedProfileKinds = Object.values(data?.aggregations.by_profile_kind ?? {}).filter((value) => value > 0).length;
  const regulatorCount = Object.keys(data?.aggregations.by_regulator ?? {}).length;
  const sourceAuthorityCount = Object.keys(data?.aggregations.by_source_key ?? {}).length;
  const roleCount = Object.keys(data?.aggregations.by_business_role ?? {}).length;
  const macroSignals = useMemo(() => groupMacroSignals(macroQuery.data?.series ?? []), [macroQuery.data?.series]);
  const activeSources = useMemo(
    () =>
      (sourcesQuery.data?.sources ?? [])
        .filter((source) => source.loaded)
        .sort((a, b) => (b.record_count ?? 0) - (a.record_count ?? 0))
        .slice(0, 4),
    [sourcesQuery.data?.sources]
  );

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-white text-slate-900">
      <div className="relative overflow-hidden border-b border-slate-200">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(8,145,178,0.08),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(245,158,11,0.06),_transparent_24%)]" />
        <div className="relative mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-4xl space-y-3">
              <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-600/80">North American banking intelligence terminal</p>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
                Search in context, not just by name.
              </h1>
              <p className="max-w-3xl text-sm leading-relaxed text-slate-700 sm:text-base">
                Navigate banks, credit unions, PSPs, and MSBs with regulatory posture, business model, source authority, and relationship context already in view.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryTile
                label="Coverage"
                value={String(data?.total ?? 0)}
                detail="Entities in the current lens"
                icon={<Database className="h-5 w-5" />}
              />
              <SummaryTile
                label="Profile classes"
                value={String(loadedProfileKinds)}
                detail="Distinct entity profile types"
                icon={<Building2 className="h-5 w-5" />}
              />
              <SummaryTile
                label="Regulators"
                value={String(regulatorCount)}
                detail="Authorities represented in scope"
                icon={<Network className="h-5 w-5" />}
              />
              <SummaryTile
                label="Role tags"
                value={String(roleCount)}
                detail={`${sourceAuthorityCount} source authorities in view`}
                icon={<Sparkles className="h-5 w-5" />}
              />
            </div>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(340px,0.95fr)]">
            <Card className="border-slate-200 bg-slate-50/75 text-slate-900 shadow-2xl shadow-slate-950/30">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.24em] text-cyan-600/80">Market backdrop</p>
                  <h2 className="mt-2 text-lg font-semibold text-slate-900">Bank of Canada macro pulse</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Cross-border money movement context for Canada-facing entities, PSPs, and sponsor-bank research.
                  </p>
                </div>
                <Globe2 className="h-5 w-5 text-cyan-600" />
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {macroQuery.isLoading && macroSignals.length === 0 ? (
                  Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={index} className="h-28 bg-slate-50/70" />
                  ))
                ) : macroSignals.length > 0 ? (
                  macroSignals.map((signal) => (
                    <div key={signal.series_key} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{signal.display_name}</p>
                          <p className="mt-2 text-lg font-semibold text-slate-900">{formatSeriesValue(signal.value, signal.unit)}</p>
                          <p className="mt-1 text-xs text-slate-400">{signal.period}</p>
                        </div>
                        <div className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${
                          signal.delta == null
                            ? 'bg-slate-50 text-slate-700'
                            : signal.delta > 0
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-amber-50 text-amber-700'
                        }`}>
                          {signal.delta == null ? null : signal.delta > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                          {formatSeriesDelta(signal.delta, signal.unit)}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 p-5 text-sm leading-relaxed text-slate-400 sm:col-span-2">
                    No Bank of Canada series are loaded yet. Once <code>macro_series</code> is populated, this panel becomes the live macro lens for Canada-facing profiles.
                  </div>
                )}
              </div>
            </Card>

            <Card className="border-slate-200 bg-slate-50/75 text-slate-900 shadow-2xl shadow-slate-950/30">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.24em] text-emerald-600/80">Data posture</p>
                  <h2 className="mt-2 text-lg font-semibold text-slate-900">Warehouse and source readiness</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    What is loaded, what can sync right now, and where the coverage edge is strongest.
                  </p>
                </div>
                <Workflow className="h-5 w-5 text-emerald-600" />
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Warehouse</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">{readinessQuery.data?.warehouse.status ?? 'loading'}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {readinessQuery.data
                      ? `${readinessQuery.data.warehouse.ready_tables ?? 0}/${readinessQuery.data.warehouse.total_tables ?? 0} tables visible`
                      : 'Checking entity warehouse'}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Runnable syncs</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">{readinessQuery.data?.sources.sync_ready ?? '—'}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {readinessQuery.data
                      ? `${readinessQuery.data.sources.sync_blocked} blocked by files or credentials`
                      : 'Inspecting source prerequisites'}
                  </p>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {activeSources.length > 0 ? (
                  activeSources.map((source) => (
                    <div key={source.source_key} className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-slate-900">{source.display_name}</p>
                          <p className="text-xs text-slate-500">{source.category_label} · {source.coverage_label}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-cyan-600">{source.record_count?.toLocaleString() ?? '—'}</p>
                          <p className="text-xs text-slate-500">{source.data_as_of ?? 'Freshness pending'}</p>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-400">
                    Active source coverage will appear here once the source catalog loads.
                  </div>
                )}
              </div>
              <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-3">
                <div className="text-sm text-slate-700">
                  Source catalog and sync surfaces are now part of the search workflow.
                </div>
                <Link
                  to="/sources"
                  className="inline-flex items-center gap-1 text-sm font-medium text-cyan-600 transition-colors hover:text-cyan-500"
                >
                  Open sources
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </Card>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)_360px]">
          <EntityFacetRail
            total={data?.total ?? 0}
            aggregations={data?.aggregations ?? {
              by_country: {},
              by_profile_kind: { regulated_institution: 0, registry_entity: 0 },
              by_source_key: {},
              by_regulator: {},
              by_charter_family: {},
              by_business_role: {},
              by_status: {},
            }}
            filters={{
              country,
              profileKind,
              businessRole,
              regulator,
              charterFamily,
              sourceAuthority,
              status,
            }}
            onUpdate={updateParam}
          />

          <div className="space-y-5">
            <Card className="border-slate-200 bg-slate-50/80 text-slate-900 shadow-2xl shadow-slate-950/30">
              <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_180px_210px_auto]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') updateParam({ q: query });
                    }}
                    placeholder="Search by name, regulator, geography, or context summary"
                    className="pl-9 !border-slate-200 !bg-white !text-slate-900 placeholder:!text-slate-500"
                  />
                </div>
                <Select
                  value={country}
                  onChange={(event) => updateParam({ country: event.target.value })}
                  options={COUNTRY_OPTIONS}
                  className="!border-slate-200 !bg-white !text-slate-900"
                />
                <Select
                  value={profileKind}
                  onChange={(event) => updateParam({ profile_kind: event.target.value })}
                  options={PROFILE_KIND_OPTIONS}
                  className="!border-slate-200 !bg-white !text-slate-900"
                />
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="!border-slate-200 !bg-white !text-slate-900 hover:!bg-slate-50"
                    onClick={() => updateParam({ q: query })}
                  >
                    Search
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="!border-slate-200 !bg-white !text-slate-900 hover:!bg-slate-50"
                    onClick={() => updateParam({ view: view === 'cards' ? 'terminal' : 'cards' })}
                  >
                    {view === 'cards' ? 'Terminal' : 'Cards'}
                  </Button>
                </div>
              </div>
            </Card>

            {error && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                Failed to load entity search.
              </div>
            )}

            <Card className="border-slate-200 bg-slate-50/70 text-slate-900">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Live screening board</p>
                  <p className="mt-1 text-sm text-slate-700">
                    Rank entities by size, scan context, then preview before drilling in.
                  </p>
                </div>
                <p className="text-xs text-slate-500">
                  {data?.total ?? 0} results
                </p>
              </div>

              {isLoading && !data ? (
                <ResultSkeleton />
              ) : view === 'cards' ? (
                <div className="grid gap-4 lg:grid-cols-2">
                  {entities.map((entity) => (
                    <div key={entity.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-slate-900">{entity.name}</h3>
                        <Badge color={profileTone(entity.profile_kind)} className="bg-slate-50 text-slate-900 ring-slate-200">
                          {entity.profile_kind.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm text-slate-700">{entity.context_summary}</p>
                      <div className="mt-4 flex items-center justify-between gap-3">
                        <div className="text-xs text-slate-500">
                          <p>{entity.regulator ?? entity.source_authority}</p>
                          <p>{formatCurrency(entity.metrics.total_assets)}</p>
                        </div>
                        <Link to={`/entities/${entity.id}`} className="text-sm font-medium text-cyan-600 hover:text-cyan-500">
                          Open profile
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {entities.map((entity) => (
                    <IntelligenceRow
                      key={entity.id}
                      entity={entity}
                      focused={previewEntityId === entity.id}
                      onFocus={() => setFocusedEntityId(entity.id)}
                    />
                  ))}
                </div>
              )}

              {!isLoading && entities.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-slate-400">
                  No entities found for the current search.
                </div>
              )}
            </Card>

            {totalPages > 1 && (
              <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                <p className="text-sm text-slate-700">
                  Page {data?.page ?? 1} of {totalPages} · {data?.total ?? 0} results
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="!border-slate-200 !bg-white !text-slate-900"
                    disabled={page <= 1}
                    onClick={() => updateParam({ page: page - 1 })}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Prev
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="!border-slate-200 !bg-white !text-slate-900"
                    disabled={page >= totalPages}
                    onClick={() => updateParam({ page: page + 1 })}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>

          <PreviewPanel
            entity={previewEntity}
            context={previewContextQuery.data}
            history={previewHistoryQuery.data?.history ?? []}
            relationships={previewRelationshipsQuery.data?.relationships ?? []}
            sources={previewSourcesQuery.data?.sources ?? []}
            loading={
              previewContextQuery.isLoading ||
              previewHistoryQuery.isLoading ||
              previewRelationshipsQuery.isLoading ||
              previewSourcesQuery.isLoading
            }
          />
        </div>
      </div>
    </div>
  );
}
