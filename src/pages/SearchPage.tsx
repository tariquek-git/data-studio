import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Filter, ChevronLeft, ChevronRight, LayoutList, LayoutGrid, Download } from 'lucide-react';
import { SearchBar } from '@/components/search/SearchBar';
import { FilterPanel } from '@/components/search/FilterPanel';
import { ResultsTable } from '@/components/search/ResultsTable';
import { ResultsCards } from '@/components/search/ResultsCards';
import { QuickStats } from '@/components/search/QuickStats';
import { Button, Skeleton } from '@/components/ui';
import { useSearchStore } from '@/stores/searchStore';
import { exportSearchResultsToExcel } from '@/lib/export';
import type { SearchFilters, SearchResult, SortField } from '@/types/filters';

async function fetchInstitutions(filters: SearchFilters): Promise<SearchResult> {
  const params = new URLSearchParams();
  if (filters.query) params.set('q', filters.query);
  if (filters.states.length) params.set('states', filters.states.join(','));
  if (filters.source.length) params.set('source', filters.source.join(','));
  if (filters.charter_types.length) params.set('charter_types', filters.charter_types.join(','));
  if (filters.min_assets != null) params.set('min_assets', String(filters.min_assets));
  if (filters.max_assets != null) params.set('max_assets', String(filters.max_assets));
  if (filters.min_deposits != null) params.set('min_deposits', String(filters.min_deposits));
  if (filters.max_deposits != null) params.set('max_deposits', String(filters.max_deposits));
  if (filters.min_roa != null) params.set('min_roa', String(filters.min_roa));
  if (filters.max_roa != null) params.set('max_roa', String(filters.max_roa));
  if (filters.min_roi != null) params.set('min_roi', String(filters.min_roi));
  if (filters.max_roi != null) params.set('max_roi', String(filters.max_roi));
  if (filters.has_credit_card_program != null)
    params.set('has_credit_card_program', String(filters.has_credit_card_program));
  params.set('sort_by', filters.sort_by);
  params.set('sort_dir', filters.sort_dir);
  params.set('page', String(filters.page));
  params.set('per_page', String(filters.per_page));

  const res = await fetch(`/api/institutions/search?${params}`);
  if (!res.ok) throw new Error('Search failed');
  return res.json();
}

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const { filters, setFilters, resetFilters } = useSearchStore();

  // Sync URL params to store on mount
  useEffect(() => {
    const q = searchParams.get('q');
    const states = searchParams.get('states');
    const source = searchParams.get('source');
    const minAssets = searchParams.get('min_assets');
    const hasCc = searchParams.get('has_credit_card_program');

    const partial: Partial<SearchFilters> = {};
    if (q) partial.query = q;
    if (states) partial.states = states.split(',');
    if (source) partial.source = source.split(',') as SearchFilters['source'];
    if (minAssets) partial.min_assets = Number(minAssets);
    if (hasCc === 'true') partial.has_credit_card_program = true;

    if (Object.keys(partial).length > 0) {
      setFilters(partial);
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ['institutions', filters],
    queryFn: () => fetchInstitutions(filters),
    placeholderData: (prev) => prev,
  });

  const handleQueryChange = useCallback(
    (query: string) => {
      setFilters({ query });
      const newParams = new URLSearchParams(searchParams);
      if (query) {
        newParams.set('q', query);
      } else {
        newParams.delete('q');
      }
      setSearchParams(newParams, { replace: true });
    },
    [setFilters, searchParams, setSearchParams],
  );

  const handleSort = useCallback(
    (field: SortField) => {
      if (filters.sort_by === field) {
        setFilters({ sort_dir: filters.sort_dir === 'asc' ? 'desc' : 'asc' });
      } else {
        setFilters({ sort_by: field, sort_dir: 'desc' });
      }
    },
    [filters.sort_by, filters.sort_dir, setFilters],
  );

  const totalPages = data ? Math.ceil(data.total / filters.per_page) : 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex gap-6">
        {/* Sidebar */}
        <aside
          className={`shrink-0 transition-all duration-200 ${
            sidebarOpen ? 'w-64' : 'w-0 overflow-hidden'
          }`}
        >
          <div className="sticky top-20 bg-white rounded-xl border border-surface-200 shadow-sm p-4">
            <FilterPanel
              filters={filters}
              onChange={setFilters}
              onClear={resetFilters}
            />
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Top bar */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-lg border border-surface-300 text-surface-500 hover:text-surface-700 hover:bg-surface-50 md:hidden"
              aria-label="Toggle filters"
            >
              <Filter className="h-4 w-4" />
            </button>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="hidden md:flex items-center gap-1.5 px-3 py-2 rounded-lg border border-surface-300 text-sm text-surface-600 hover:text-surface-800 hover:bg-surface-50"
            >
              <Filter className="h-4 w-4" />
              {sidebarOpen ? 'Hide Filters' : 'Show Filters'}
            </button>
            <SearchBar
              value={filters.query}
              onChange={(q) => setFilters({ query: q })}
              onSubmit={handleQueryChange}
              className="flex-1"
            />
            {/* View toggle */}
            <div className="flex items-center rounded-lg border border-surface-300 overflow-hidden shrink-0">
              <button
                onClick={() => setViewMode('table')}
                className={`p-2 transition-colors ${viewMode === 'table' ? 'bg-primary-600 text-white' : 'bg-white text-surface-500 hover:bg-surface-50'}`}
                aria-label="Table view"
              >
                <LayoutList className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('cards')}
                className={`p-2 transition-colors ${viewMode === 'cards' ? 'bg-primary-600 text-white' : 'bg-white text-surface-500 hover:bg-surface-50'}`}
                aria-label="Card view"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>

            {/* Export Results */}
            <Button
              variant="secondary"
              size="sm"
              disabled={!data?.institutions?.length}
              onClick={() => exportSearchResultsToExcel(data?.institutions ?? [])}
              title="Export current results to Excel"
              className="shrink-0"
            >
              <Download className="h-4 w-4" />
              Export Results
            </Button>
          </div>

          {/* Quick stats */}
          <QuickStats aggregations={data?.aggregations ?? null} total={data?.total ?? 0} />

          {/* Results */}
          {isLoading && !data ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-16">
              <p className="text-red-600 text-sm">
                Failed to load results. Please try again.
              </p>
            </div>
          ) : viewMode === 'table' ? (
            <ResultsTable
              institutions={data?.institutions ?? []}
              sortBy={filters.sort_by}
              sortDir={filters.sort_dir}
              onSort={handleSort}
            />
          ) : (
            <ResultsCards institutions={data?.institutions ?? []} />
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-sm text-surface-500">
                Page {filters.page} of {totalPages} ({data?.total ?? 0} results)
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={filters.page <= 1}
                  onClick={() => setFilters({ page: filters.page - 1 })}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={filters.page >= totalPages}
                  onClick={() => setFilters({ page: filters.page + 1 })}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
