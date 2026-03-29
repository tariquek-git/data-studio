import { useDeferredValue, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ChevronLeft, ChevronRight, Search, SlidersHorizontal, Building2, Network, Database } from 'lucide-react';
import { Badge, Button, Card, Input, Select, Skeleton } from '@/components/ui';
import type { EntityProfileKind, EntitySearchResponse, EntitySummary } from '@/types/entity';

type CountryFilter = 'all' | 'US' | 'CA' | 'NA';

const PROFILE_KIND_OPTIONS: Array<{ value: 'all' | EntityProfileKind; label: string }> = [
  { value: 'all', label: 'All entity types' },
  { value: 'regulated_institution', label: 'Regulated institutions' },
  { value: 'registry_entity', label: 'Registry-backed entities' },
  { value: 'ecosystem_entity', label: 'Ecosystem entities' },
];

const COUNTRY_OPTIONS: Array<{ value: CountryFilter; label: string }> = [
  { value: 'all', label: 'All countries' },
  { value: 'US', label: 'United States' },
  { value: 'CA', label: 'Canada' },
  { value: 'NA', label: 'North America' },
];

const BUSINESS_ROLE_OPTIONS = [
  { value: '', label: 'All roles' },
  { value: 'sponsor_bank', label: 'Sponsor bank' },
  { value: 'payment_service_provider', label: 'Payment service provider' },
  { value: 'money_services_business', label: 'Money services business' },
  { value: 'dealer_firm', label: 'Dealer firm' },
  { value: 'card_issuer', label: 'Card issuer' },
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
    case 'ecosystem_entity':
      return 'purple';
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

function SummaryTile({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4 shadow-2xl shadow-slate-950/30">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{label}</p>
          <p className="mt-2 text-xl font-semibold text-white">{value}</p>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-950 p-2 text-slate-300">{icon}</div>
      </div>
    </div>
  );
}

function ResultRow({
  entity,
  variant,
}: {
  entity: EntitySummary;
  variant: 'card' | 'table';
}) {
  return (
    <Link
      to={`/entities/${entity.id}`}
      className={
        variant === 'card'
          ? 'group block rounded-2xl border border-slate-700 bg-slate-900/80 p-5 hover:border-cyan-500/60 hover:bg-slate-900 transition-all shadow-lg shadow-slate-950/20'
          : 'group block rounded-2xl border border-slate-700 bg-slate-900/80 p-4 hover:border-cyan-500/60 hover:bg-slate-900 transition-all shadow-lg shadow-slate-950/20'
      }
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-white group-hover:text-cyan-300 truncate">
              {entity.name}
            </h3>
            <Badge color={profileTone(entity.profile_kind)} className="bg-slate-800 text-slate-100 ring-slate-700">
              {entity.profile_kind.replace(/_/g, ' ')}
            </Badge>
            <Badge color={sourceBadgeColor(entity.source_kind)} className="bg-slate-800 text-slate-100 ring-slate-700">
              {entity.source_authority}
            </Badge>
          </div>
          <p className="mt-2 text-sm text-slate-400 line-clamp-2">{entity.context_summary}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span>{entity.country_label}</span>
            <span>{[entity.city, entity.state].filter(Boolean).join(', ') || 'No location loaded'}</span>
            <span>{entity.regulator ?? 'No regulator loaded'}</span>
            {entity.business_roles.length > 0 && <span>{entity.business_roles.map((role) => role.replace(/_/g, ' ')).join(', ')}</span>}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Assets</p>
          <p className="mt-1 text-sm font-semibold text-white">
            {entity.metrics.total_assets != null ? `$${entity.metrics.total_assets.toLocaleString()}` : '—'}
          </p>
          <p className="mt-4 text-xs uppercase tracking-[0.2em] text-slate-500">Updated</p>
          <p className="mt-1 text-sm text-slate-300">{entity.data_as_of ?? entity.last_synced_at ?? 'Unknown'}</p>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
        <span>Confidence {entity.confidence_score != null ? `${Math.round(entity.confidence_score * 100)}%` : 'n/a'}</span>
        <span className="inline-flex items-center gap-1 text-cyan-300 group-hover:text-cyan-200">
          Open profile
          <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </Link>
  );
}

function ResultsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-28 bg-slate-800/70" />
      ))}
    </div>
  );
}

export default function EntitiesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const deferredQuery = useDeferredValue(query);
  const country = (searchParams.get('country') as CountryFilter) ?? 'all';
  const profileKind = (searchParams.get('profile_kind') as 'all' | EntityProfileKind) ?? 'all';
  const businessRole = searchParams.get('business_role') ?? '';
  const page = Number(searchParams.get('page') ?? 1);
  const view = searchParams.get('view') === 'cards' ? 'cards' : 'table';

  const params = useMemo(() => ({
    q: deferredQuery,
    country,
    profile_kind: profileKind,
    business_role: businessRole,
    page: Math.max(1, page),
    per_page: 20,
  }), [deferredQuery, country, profileKind, businessRole, page]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['entities', params],
    queryFn: () => fetchEntities(params),
    placeholderData: (prev) => prev,
  });

  const entities = data?.entities ?? [];
  const totalPages = data ? Math.ceil(data.total / data.per_page) : 0;
  const loadedKinds =
    (data?.aggregations.by_profile_kind.regulated_institution ?? 0) +
    (data?.aggregations.by_profile_kind.registry_entity ?? 0) +
    (data?.aggregations.by_profile_kind.ecosystem_entity ?? 0);

  function updateParam(next: Record<string, string | number | undefined>) {
    const nextParams = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(next)) {
      if (value == null || value === '') nextParams.delete(key);
      else nextParams.set(key, String(value));
    }
    if ('q' in next) nextParams.set('page', '1');
    setSearchParams(nextParams, { replace: true });
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-950 text-slate-100">
      <div className="relative overflow-hidden border-b border-slate-800">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.18),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.12),_transparent_28%),linear-gradient(180deg,_rgba(2,6,23,0.98),_rgba(15,23,42,1))]" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-4xl space-y-2">
              <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-300/80">North American entity terminal</p>
              <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white">
                Entity Search
              </h1>
              <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                Search regulated institutions, registry-backed entities, and ecosystem companies in one place, with source-aware profiles and live context.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="!bg-slate-900 !text-slate-100 !border-slate-700 hover:!bg-slate-800"
                onClick={() => updateParam({ view: view === 'cards' ? 'table' : 'cards' })}
              >
                <SlidersHorizontal className="h-4 w-4" />
                {view === 'cards' ? 'Table view' : 'Card view'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="!bg-slate-900 !text-slate-100 !border-slate-700 hover:!bg-slate-800"
                onClick={() => {
                  setQuery('');
                  setSearchParams(new URLSearchParams(), { replace: true });
                }}
              >
                Clear filters
              </Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <SummaryTile label="Entities" value={String(data?.total ?? 0)} icon={<Network className="h-5 w-5" />} />
            <SummaryTile label="Country split" value={`${data?.aggregations.by_country.US ?? 0} / ${data?.aggregations.by_country.CA ?? 0}`} icon={<Building2 className="h-5 w-5" />} />
            <SummaryTile
              label="Loaded kinds"
              value={String(loadedKinds)}
              icon={<Database className="h-5 w-5" />}
            />
            <SummaryTile label="Signals" value={businessRole ? businessRole.replace(/_/g, ' ') : 'all roles'} icon={<Search className="h-5 w-5" />} />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
        <Card className="bg-slate-900/80 border-slate-700 text-slate-100 shadow-2xl shadow-slate-950/30">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_180px_220px_220px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') updateParam({ q: query });
                }}
                placeholder="Search by name, city, regulator, source, or context"
                className="pl-9 !bg-slate-950 !border-slate-700 !text-slate-100 placeholder:!text-slate-500"
              />
            </div>
            <Select
              value={country}
              onChange={(event) => updateParam({ country: event.target.value })}
              options={COUNTRY_OPTIONS}
              className="!bg-slate-950 !border-slate-700 !text-slate-100"
            />
            <Select
              value={profileKind}
              onChange={(event) => updateParam({ profile_kind: event.target.value })}
              options={PROFILE_KIND_OPTIONS}
              className="!bg-slate-950 !border-slate-700 !text-slate-100"
            />
            <Select
              value={businessRole}
              onChange={(event) => updateParam({ business_role: event.target.value })}
              options={BUSINESS_ROLE_OPTIONS}
              className="!bg-slate-950 !border-slate-700 !text-slate-100"
            />
          </div>
        </Card>

        {error && (
          <div className="rounded-2xl border border-rose-900/70 bg-rose-950/50 p-4 text-sm text-rose-200">
            Failed to load entity search.
          </div>
        )}

        {isLoading && !data ? (
          <ResultsSkeleton />
        ) : (
          <div className={view === 'cards' ? 'grid gap-4 lg:grid-cols-2' : 'space-y-3'}>
            {entities.map((entity) => (
              <ResultRow
                key={entity.id}
                entity={entity}
                variant={view === 'cards' ? 'card' : 'table'}
              />
            ))}

            {!isLoading && entities.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/60 p-8 text-center text-slate-400">
                No entities found for the current search.
              </div>
            )}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-3">
            <p className="text-sm text-slate-300">
              Page {data?.page ?? 1} of {totalPages} · {data?.total ?? 0} results
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="!bg-slate-950 !text-slate-100 !border-slate-700"
                disabled={page <= 1}
                onClick={() => updateParam({ page: page - 1 })}
              >
                <ChevronLeft className="h-4 w-4" />
                Prev
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="!bg-slate-950 !text-slate-100 !border-slate-700"
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
    </div>
  );
}
