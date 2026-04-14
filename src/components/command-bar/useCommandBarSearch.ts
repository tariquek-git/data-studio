import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { parseSearchQuery, type ParsedSearchQuery } from '@/lib/searchParser';
import type { Institution } from '@/types/institution';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CommandBarAction {
  id: string;
  label: string;
  href: string;
  icon: 'explore' | 'compare' | 'map' | 'brim';
}

export interface AiQueryResult {
  intent: 'search' | 'compare' | 'navigate' | 'analyze';
  filters: Partial<{
    states: string[];
    sources: string[];
    charter_types: string[];
    min_assets: number;
    max_assets: number;
    min_deposits: number;
    max_deposits: number;
    has_credit_cards: boolean;
    brim_tier: string;
  }>;
  explanation: string;
  institutions?: string[];
}

export interface CommandBarSearchState {
  query: string;
  setQuery: (q: string) => void;
  institutions: Institution[];
  actions: CommandBarAction[];
  aiResult: AiQueryResult | null;
  parsedFilters: ParsedSearchQuery | null;
  isLoadingInstitutions: boolean;
  isLoadingAi: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildExploreUrl(parsed: ParsedSearchQuery): string {
  const params = new URLSearchParams();
  if (parsed.textQuery) params.set('q', parsed.textQuery);
  if (parsed.states?.length) params.set('states', parsed.states.join(','));
  if (parsed.sources?.length) params.set('source', parsed.sources.join(','));
  if (parsed.charterTypes?.length) params.set('charter_types', parsed.charterTypes.join(','));
  if (parsed.minAssets != null) params.set('min_assets', String(parsed.minAssets));
  if (parsed.maxAssets != null) params.set('max_assets', String(parsed.maxAssets));
  if (parsed.minRoa != null) params.set('min_roa', String(parsed.minRoa));
  if (parsed.maxRoa != null) params.set('max_roa', String(parsed.maxRoa));
  return `/explore?${params.toString()}`;
}

function buildExploreUrlFromAi(filters: AiQueryResult['filters'], query: string): string {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (filters.states?.length) params.set('states', filters.states.join(','));
  if (filters.sources?.length) params.set('source', filters.sources.join(','));
  if (filters.charter_types?.length) params.set('charter_types', filters.charter_types.join(','));
  if (filters.min_assets != null) params.set('min_assets', String(filters.min_assets));
  if (filters.max_assets != null) params.set('max_assets', String(filters.max_assets));
  if (filters.min_deposits != null) params.set('min_deposits', String(filters.min_deposits));
  if (filters.max_deposits != null) params.set('max_deposits', String(filters.max_deposits));
  if (filters.has_credit_cards) params.set('has_credit_cards', 'true');
  if (filters.brim_tier) params.set('brim_tier', filters.brim_tier);
  return `/explore?${params.toString()}`;
}

function describeFilters(parsed: ParsedSearchQuery): string {
  const parts: string[] = [];
  if (parsed.states?.length) parts.push(parsed.states.join(', '));
  if (parsed.charterTypes?.length) parts.push(parsed.charterTypes.map((t) => t.replace('_', ' ')).join(', '));
  if (parsed.minAssets != null && parsed.maxAssets != null) {
    const fmt = (v: number) =>
      v >= 1e12
        ? `$${(v / 1e12).toFixed(1)}T`
        : v >= 1e9
        ? `$${(v / 1e9).toFixed(1)}B`
        : v >= 1e6
        ? `$${(v / 1e6).toFixed(0)}M`
        : `$${(v / 1e3).toFixed(0)}K`;
    parts.push(`assets ~${fmt(parsed.minAssets)}–${fmt(parsed.maxAssets)}`);
  } else if (parsed.minAssets != null) {
    const fmt = (v: number) =>
      v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : `$${(v / 1e6).toFixed(0)}M`;
    parts.push(`assets >${fmt(parsed.minAssets)}`);
  } else if (parsed.maxAssets != null) {
    const fmt = (v: number) =>
      v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : `$${(v / 1e6).toFixed(0)}M`;
    parts.push(`assets <${fmt(parsed.maxAssets)}`);
  }
  if (parsed.sources?.length) parts.push(parsed.sources.join(', ').toUpperCase());
  return parts.join(' · ') || 'custom filters';
}

function isNaturalLanguage(q: string): boolean {
  const words = q.trim().split(/\s+/);
  return words.length > 3;
}

async function fetchInstitutionSearch(q: string): Promise<Institution[]> {
  const url = `/api/institutions/search?q=${encodeURIComponent(q)}&per_page=6&sort_by=total_assets&sort_dir=desc`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = (await res.json()) as { institutions?: Institution[] };
  return data.institutions ?? [];
}

async function fetchAiQuery(query: string): Promise<AiQueryResult> {
  const res = await fetch('/api/ai/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error('AI query failed');
  return res.json() as Promise<AiQueryResult>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCommandBarSearch(): CommandBarSearchState {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [debouncedAiQuery, setDebouncedAiQuery] = useState('');

  // 200ms debounce for typeahead
  const typeaheadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 500ms debounce for AI
  const aiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeaheadTimerRef.current) clearTimeout(typeaheadTimerRef.current);
    typeaheadTimerRef.current = setTimeout(() => {
      setDebouncedQuery(query);
    }, 200);
    return () => {
      if (typeaheadTimerRef.current) clearTimeout(typeaheadTimerRef.current);
    };
  }, [query]);

  useEffect(() => {
    if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    if (isNaturalLanguage(query)) {
      aiTimerRef.current = setTimeout(() => {
        setDebouncedAiQuery(query);
      }, 500);
    } else {
      setDebouncedAiQuery('');
    }
    return () => {
      if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    };
  }, [query]);

  // Tier 1: Typeahead
  const { data: institutionData, isFetching: isLoadingInstitutions } = useQuery({
    queryKey: ['command-bar-search', debouncedQuery],
    queryFn: () => fetchInstitutionSearch(debouncedQuery),
    enabled: debouncedQuery.trim().length >= 1,
    staleTime: 30_000,
    placeholderData: [],
  });

  // Tier 3: AI natural language
  const { data: aiData, isFetching: isLoadingAi } = useQuery({
    queryKey: ['command-bar-ai', debouncedAiQuery],
    queryFn: () => fetchAiQuery(debouncedAiQuery),
    enabled: debouncedAiQuery.trim().length > 0,
    staleTime: 5 * 60_000,
    retry: false,
  });

  // Tier 2: Structured filter parsing
  const parsedFilters: ParsedSearchQuery | null =
    debouncedQuery.trim().length >= 2 ? parseSearchQuery(debouncedQuery) : null;

  const hasStructuredFilters =
    parsedFilters != null &&
    (parsedFilters.states?.length ||
      parsedFilters.sources?.length ||
      parsedFilters.charterTypes?.length ||
      parsedFilters.minAssets != null ||
      parsedFilters.maxAssets != null ||
      parsedFilters.minRoa != null ||
      parsedFilters.maxRoa != null);

  // Build actions
  const actions: CommandBarAction[] = [];

  // Brim Mode quick actions — appear for whale/brim/prospect keywords or empty query
  const lowerQuery = debouncedQuery.trim().toLowerCase();
  const isBrimIntent =
    !lowerQuery ||
    /\b(brim|whale|prospect|migration|target|spear|hunt|opportunity|pipeline)\b/.test(lowerQuery);

  if (isBrimIntent) {
    if (!lowerQuery) {
      // Show Brim quick-launch when command bar first opens (no query)
      actions.push({
        id: 'brim-mode',
        label: 'Whale Hunt — enter Brim Mode (find migration targets)',
        href: '/explore?brim=1',
        icon: 'brim',
      });
    }
    if (lowerQuery && /\b(migration|target|convert)\b/.test(lowerQuery)) {
      actions.push({
        id: 'brim-migration',
        label: 'Spearfish migration targets',
        href: '/explore?brim=1&migration_targets_only=true',
        icon: 'brim',
      });
    }
    if (lowerQuery && /\b(pipeline|opportunity|opp)\b/.test(lowerQuery)) {
      actions.push({
        id: 'brim-opportunities',
        label: 'View BD opportunities pipeline',
        href: '/brim',
        icon: 'brim',
      });
    }
  }

  if (hasStructuredFilters && parsedFilters) {
    actions.push({
      id: 'explore-filters',
      label: `Open in Explore with filters: ${describeFilters(parsedFilters)}`,
      href: buildExploreUrl(parsedFilters),
      icon: 'explore',
    });
  } else if (debouncedQuery.trim().length >= 2) {
    const params = new URLSearchParams({ q: debouncedQuery });
    actions.push({
      id: 'explore-query',
      label: `Open in Explore: "${debouncedQuery}"`,
      href: `/explore?${params.toString()}`,
      icon: 'explore',
    });
  }

  if (aiData?.intent === 'compare' && aiData.institutions?.length) {
    const names = aiData.institutions.slice(0, 4).join(',');
    actions.push({
      id: 'compare',
      label: `Compare ${aiData.institutions.slice(0, 4).join(' and ')}`,
      href: `/compare?names=${encodeURIComponent(names)}`,
      icon: 'compare',
    });
  }

  if (hasStructuredFilters && parsedFilters?.states?.length) {
    actions.push({
      id: 'map',
      label: `View on map: ${parsedFilters.states.join(', ')}`,
      href: buildExploreUrl(parsedFilters).replace('/explore', '/geo'),
      icon: 'map',
    });
  }

  if (aiData) {
    const aiExploreUrl = buildExploreUrlFromAi(aiData.filters, parsedFilters?.textQuery ?? debouncedQuery);
    const hasAiFilters = Object.keys(aiData.filters).length > 0;
    if (hasAiFilters && !actions.find((a) => a.id === 'explore-filters')) {
      actions.push({
        id: 'explore-ai',
        label: 'Explore AI results',
        href: aiExploreUrl,
        icon: 'explore',
      });
    }
  }

  const institutions = institutionData ?? [];
  const aiResult = aiData ?? null;

  return {
    query,
    setQuery,
    institutions,
    actions,
    aiResult,
    parsedFilters,
    isLoadingInstitutions,
    isLoadingAi,
  };
}
