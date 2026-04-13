import { useState, Suspense, lazy } from 'react';
import { SlidersHorizontal, X, Target } from 'lucide-react';
import { useExploreURL } from '@/hooks/useExploreURL';
import { useExploreResults } from '@/hooks/useExploreResults';
import { useExploreStore } from '@/stores/exploreStore';
import { ExploreFilterSidebar } from '@/components/explore/ExploreFilterSidebar';
import { ExploreViewSwitcher } from '@/components/explore/ExploreViewSwitcher';
import { ExploreResultsTable } from '@/components/explore/ExploreResultsTable';
import { ExploreResultsCards } from '@/components/explore/ExploreResultsCards';
import { ExploreAnalyticsPanel } from '@/components/explore/ExploreAnalyticsPanel';
import { ExploreWorkingSet } from '@/components/explore/ExploreWorkingSet';
import { Skeleton, SectionErrorBoundary } from '@/components/ui';

// Lazy-load heavy views
const ExploreResultsMap = lazy(() =>
  import('@/components/explore/ExploreResultsMap').then((m) => ({ default: m.ExploreResultsMap })),
);
const ExploreResultsChart = lazy(() =>
  import('@/components/explore/ExploreResultsChart').then((m) => ({ default: m.ExploreResultsChart })),
);

function ResultsLoadingState() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-10 w-full" />
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}

export default function ExplorePage() {
  // Sync URL ↔ store
  useExploreURL();

  const store = useExploreStore();
  const { data, total, aggregations, isLoading, isFetching, error } = useExploreResults();
  const { brimMode, toggleBrimMode } = store;

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <>
      {/* Full-height layout container */}
      <div className={`flex h-[calc(100vh-56px)] overflow-hidden${brimMode ? ' border-t-2 border-violet-300' : ''}`}>
        {/* ── Left: Filter Sidebar (desktop) ── */}
        <aside className="hidden lg:flex w-72 shrink-0 flex-col bg-surface-900 border-r border-surface-700/50 overflow-hidden">
          <ExploreFilterSidebar />
        </aside>

        {/* ── Mobile slide-over sidebar ── */}
        {mobileSidebarOpen && (
          <div className="fixed inset-0 z-50 flex lg:hidden">
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setMobileSidebarOpen(false)}
            />
            <div className="relative z-10 w-80 max-w-full bg-surface-900 shadow-xl shadow-black/40 flex flex-col">
              <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-surface-700/50">
                <h2 className="text-sm font-semibold text-surface-100">Filters</h2>
                <button
                  type="button"
                  onClick={() => setMobileSidebarOpen(false)}
                  className="p-1 rounded text-surface-400 hover:text-surface-200"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <ExploreFilterSidebar />
              </div>
            </div>
          </div>
        )}

        {/* ── Center: Results area ── */}
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden bg-surface-950">
          {/* Top bar */}
          <div className="shrink-0 bg-surface-900/80 backdrop-blur border-b border-surface-700/50 px-4 sm:px-6 py-2.5 flex items-center gap-3">
            {/* Mobile filter toggle */}
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              className="lg:hidden inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-surface-700 text-sm text-surface-400 hover:text-surface-200 hover:bg-surface-800"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filters
            </button>

            <ExploreViewSwitcher total={total} isFetching={isFetching} />

            {/* Brim Mode Toggle */}
            <button
              type="button"
              onClick={toggleBrimMode}
              className={`ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                brimMode
                  ? 'bg-violet-100 text-violet-700 border-violet-300 shadow-sm shadow-violet-200'
                  : 'text-surface-500 border-surface-700 hover:border-violet-300 hover:text-violet-600 hover:bg-violet-50'
              }`}
              title={brimMode ? 'Exit Brim Mode' : 'Enter Brim Mode — find card issuing prospects'}
            >
              <Target className="h-3.5 w-3.5" />
              BRIM
            </button>
          </div>

          {/* Scrollable results */}
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4" style={{ paddingBottom: store.workingSet.length > 0 ? '72px' : undefined }}>
            {error ? (
              <div className="text-center py-16">
                <p className="text-red-600 text-sm">Failed to load results. Please try again.</p>
              </div>
            ) : isLoading && data.length === 0 ? (
              <ResultsLoadingState />
            ) : store.viewMode === 'table' ? (
              <ExploreResultsTable institutions={data} total={total} isLoading={isLoading} />
            ) : store.viewMode === 'cards' ? (
              <ExploreResultsCards institutions={data} />
            ) : store.viewMode === 'map' ? (
              <SectionErrorBoundary section="Map">
                <Suspense fallback={<ResultsLoadingState />}>
                  <ExploreResultsMap institutions={data} isLoading={isFetching} />
                </Suspense>
              </SectionErrorBoundary>
            ) : (
              <SectionErrorBoundary section="Chart">
                <Suspense fallback={<ResultsLoadingState />}>
                  <ExploreResultsChart institutions={data} aggregations={aggregations} />
                </Suspense>
              </SectionErrorBoundary>
            )}
          </div>
        </main>

        {/* ── Right: Analytics Panel (desktop) ── */}
        <div className="hidden lg:flex shrink-0">
          <ExploreAnalyticsPanel total={total} aggregations={aggregations} institutions={data} />
        </div>
      </div>

      {/* ── Sticky Working Set bar ── */}
      <ExploreWorkingSet allInstitutions={data} />
    </>
  );
}
