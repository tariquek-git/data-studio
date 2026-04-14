import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useExploreStore } from '@/stores/exploreStore';
import type { SearchResult } from '@/types/filters';

async function fetchExploreResults(params: URLSearchParams): Promise<SearchResult> {
  const res = await fetch(`/api/institutions/search?${params}`);
  if (!res.ok) throw new Error('Search failed');
  return res.json();
}

export function useExploreResults() {
  const store = useExploreStore();

  const params = new URLSearchParams();

  if (store.query) params.set('q', store.query);
  if (store.country) params.set('country', store.country);
  if (store.sources.length) params.set('source', store.sources.join(','));
  if (store.states.length) params.set('states', store.states.join(','));
  if (store.charterTypes.length) params.set('charter_types', store.charterTypes.join(','));
  if (store.assetMin != null) params.set('min_assets', String(store.assetMin));
  if (store.assetMax != null) params.set('max_assets', String(store.assetMax));
  if (store.depositMin != null) params.set('min_deposits', String(store.depositMin));
  if (store.depositMax != null) params.set('max_deposits', String(store.depositMax));
  if (store.roaMin != null) params.set('min_roa', String(store.roaMin));
  if (store.roaMax != null) params.set('max_roa', String(store.roaMax));
  if (store.roeMin != null) params.set('min_roi', String(store.roeMin));
  if (store.roeMax != null) params.set('max_roi', String(store.roeMax));
  if (store.equityRatioMin != null) params.set('equity_ratio_min', String(store.equityRatioMin));
  if (store.ldrMin != null) params.set('ldr_min', String(store.ldrMin));
  if (store.ldrMax != null) params.set('ldr_max', String(store.ldrMax));
  if (store.craRating.length) params.set('cra_rating', store.craRating.join(','));
  if (store.hasCreditCards) params.set('has_credit_cards', 'true');
  if (store.minBrimScore != null) params.set('min_brim_score', String(store.minBrimScore));
  // Merge single brimTier and multi-select brimTiers into one param, deduped
  {
    const tiers = [
      ...(store.brimTier ? [store.brimTier] : []),
      ...store.brimTiers,
    ].filter((v, i, arr) => arr.indexOf(v) === i);
    if (tiers.length) params.set('brim_tier', tiers.join(','));
  }
  if (store.excludeBdExclusions) params.set('exclude_bd_exclusions', 'true');
  if (store.migrationTargetsOnly) params.set('migration_targets_only', 'true');
  params.set('sort_by', store.sortBy);
  params.set('sort_dir', store.sortDir);
  params.set('page', String(store.page));
  params.set('per_page', String(store.perPage));

  const queryKey = [
    'explore',
    store.query,
    store.country,
    store.sources.join(','),
    store.states.join(','),
    store.charterTypes.join(','),
    store.assetMin,
    store.assetMax,
    store.depositMin,
    store.depositMax,
    store.roaMin,
    store.roaMax,
    store.roeMin,
    store.roeMax,
    store.equityRatioMin,
    store.ldrMin,
    store.ldrMax,
    store.craRating.join(','),
    store.hasCreditCards,
    store.brimTier,
    store.minBrimScore,
    store.brimTiers.join(','),
    store.excludeBdExclusions,
    store.migrationTargetsOnly,
    store.sortBy,
    store.sortDir,
    store.page,
    store.perPage,
  ];

  const result = useQuery({
    queryKey,
    queryFn: () => fetchExploreResults(params),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  return {
    data: result.data?.institutions ?? [],
    total: result.data?.total ?? 0,
    page: result.data?.page ?? store.page,
    perPage: result.data?.per_page ?? store.perPage,
    aggregations: result.data?.aggregations ?? null,
    isLoading: result.isLoading,
    isFetching: result.isFetching,
    error: result.error,
  };
}
