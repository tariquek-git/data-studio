import { create } from 'zustand';
import type { SearchFilters, SearchAggregations } from '@/types/filters';
import type { Institution } from '@/types/institution';
import { DEFAULT_FILTERS } from '@/types/filters';

interface SearchState {
  filters: SearchFilters;
  results: Institution[];
  total: number;
  aggregations: SearchAggregations | null;
  loading: boolean;
  error: string | null;
  setFilters: (filters: Partial<SearchFilters>) => void;
  resetFilters: () => void;
  setResults: (results: Institution[], total: number, aggs: SearchAggregations) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useSearchStore = create<SearchState>((set) => ({
  filters: DEFAULT_FILTERS,
  results: [],
  total: 0,
  aggregations: null,
  loading: false,
  error: null,
  setFilters: (partial) =>
    set((s) => ({ filters: { ...s.filters, ...partial, page: partial.page ?? 1 } })),
  resetFilters: () =>
    set({ filters: DEFAULT_FILTERS, results: [], total: 0, aggregations: null }),
  setResults: (results, total, aggregations) =>
    set({ results, total, aggregations, loading: false, error: null }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),
}));
