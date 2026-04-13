import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { useExploreStore } from '@/stores/exploreStore';
import type { ExploreFilters, ViewMode } from '@/stores/exploreStore';

/**
 * Bidirectional sync between exploreStore and URL search params.
 * - On mount: reads URL params → hydrates store
 * - On filter change: updates URL (debounced 300ms)
 */
export function useExploreURL() {
  const [searchParams, setSearchParams] = useSearchParams();
  const store = useExploreStore();
  const hydratedRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate store from URL on mount (once)
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    const partial: Partial<ExploreFilters> & { viewMode?: ViewMode; sortBy?: string; sortDir?: 'asc' | 'desc'; page?: number; brimMode?: boolean } = {};

    const q = searchParams.get('q');
    if (q) partial.query = q;

    const country = searchParams.get('country');
    if (country) partial.country = country;

    const sources = searchParams.get('sources');
    if (sources) partial.sources = sources.split(',').filter(Boolean);

    const states = searchParams.get('states');
    if (states) partial.states = states.split(',').filter(Boolean);

    const charterTypes = searchParams.get('charter_types');
    if (charterTypes) partial.charterTypes = charterTypes.split(',').filter(Boolean);

    const assetMin = searchParams.get('asset_min');
    if (assetMin) partial.assetMin = Number(assetMin);

    const assetMax = searchParams.get('asset_max');
    if (assetMax) partial.assetMax = Number(assetMax);

    const depositMin = searchParams.get('deposit_min');
    if (depositMin) partial.depositMin = Number(depositMin);

    const depositMax = searchParams.get('deposit_max');
    if (depositMax) partial.depositMax = Number(depositMax);

    const roaMin = searchParams.get('roa_min');
    if (roaMin) partial.roaMin = Number(roaMin);

    const roaMax = searchParams.get('roa_max');
    if (roaMax) partial.roaMax = Number(roaMax);

    const hasCreditCards = searchParams.get('has_credit_cards');
    if (hasCreditCards === 'true') partial.hasCreditCards = true;

    const brimTier = searchParams.get('brim_tier');
    if (brimTier) partial.brimTier = brimTier;

    const view = searchParams.get('view') as ViewMode | null;
    if (view && ['table', 'cards', 'map', 'chart'].includes(view)) {
      partial.viewMode = view;
    }

    const page = searchParams.get('page');
    if (page) partial.page = Number(page);

    const sortBy = searchParams.get('sort_by');
    if (sortBy) partial.sortBy = sortBy;

    const sortDir = searchParams.get('sort_dir');
    if (sortDir === 'asc' || sortDir === 'desc') partial.sortDir = sortDir;

    const brim = searchParams.get('brim');
    if (brim === '1') partial.brimMode = true;

    // Handle working set from URL
    const ws = searchParams.get('ws');
    if (ws) {
      const certNumbers = ws.split(',').filter(Boolean).map(Number).filter(n => !isNaN(n));
      certNumbers.forEach(certNumber => {
        store.addToWorkingSet({ certNumber, name: `#${certNumber}` });
      });
    }

    if (Object.keys(partial).length > 0) {
      const { viewMode, sortBy: sb, sortDir: sd, page: pg, brimMode: bm, ...filters } = partial;
      if (Object.keys(filters).length > 0) store.setFilters(filters);
      if (viewMode) store.setViewMode(viewMode);
      if (sb && sd) store.setSort(sb, sd);
      if (pg) store.setPage(pg);
      if (bm) {
        // Activate brim mode with defaults (same as toggleBrimMode from OFF→ON)
        store.toggleBrimMode();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync store to URL (debounced)
  useEffect(() => {
    if (!hydratedRef.current) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams();

      if (store.query) params.set('q', store.query);
      if (store.country) params.set('country', store.country);
      if (store.sources.length) params.set('sources', store.sources.join(','));
      if (store.states.length) params.set('states', store.states.join(','));
      if (store.charterTypes.length) params.set('charter_types', store.charterTypes.join(','));
      if (store.assetMin != null) params.set('asset_min', String(store.assetMin));
      if (store.assetMax != null) params.set('asset_max', String(store.assetMax));
      if (store.depositMin != null) params.set('deposit_min', String(store.depositMin));
      if (store.depositMax != null) params.set('deposit_max', String(store.depositMax));
      if (store.roaMin != null) params.set('roa_min', String(store.roaMin));
      if (store.roaMax != null) params.set('roa_max', String(store.roaMax));
      if (store.hasCreditCards) params.set('has_credit_cards', 'true');
      if (store.brimTier) params.set('brim_tier', store.brimTier);
      if (store.brimMode) params.set('brim', '1');
      if (store.viewMode !== 'table') params.set('view', store.viewMode);
      if (store.page > 1) params.set('page', String(store.page));
      if (store.sortBy !== 'total_assets') params.set('sort_by', store.sortBy);
      if (store.sortDir !== 'desc') params.set('sort_dir', store.sortDir);
      if (store.workingSet.length > 0) {
        params.set('ws', store.workingSet.map((w) => w.certNumber).join(','));
      }

      setSearchParams(params, { replace: true });
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [
    store.query,
    store.country,
    store.sources,
    store.states,
    store.charterTypes,
    store.assetMin,
    store.assetMax,
    store.depositMin,
    store.depositMax,
    store.roaMin,
    store.roaMax,
    store.hasCreditCards,
    store.brimTier,
    store.brimMode,
    store.viewMode,
    store.page,
    store.sortBy,
    store.sortDir,
    store.workingSet,
    setSearchParams,
  ]);
}
