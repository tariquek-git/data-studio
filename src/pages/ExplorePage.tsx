import { Suspense, lazy, useState } from 'react';
import { useSearchParams } from 'react-router';
import { LayoutList, SlidersHorizontal } from 'lucide-react';

const SearchPage = lazy(() => import('./SearchPage'));
const ScreenerPage = lazy(() => import('./ScreenerPage'));

type ExploreMode = 'search' | 'screener';

function Loading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="animate-spin h-8 w-8 border-2 border-primary-600 border-t-transparent rounded-full" />
    </div>
  );
}

export default function ExplorePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialMode: ExploreMode = searchParams.get('mode') === 'screener' ? 'screener' : 'search';
  const [mode, setMode] = useState<ExploreMode>(initialMode);

  function switchMode(next: ExploreMode) {
    setMode(next);
    const p = new URLSearchParams(searchParams);
    if (next === 'screener') {
      p.set('mode', 'screener');
    } else {
      p.delete('mode');
    }
    setSearchParams(p, { replace: true });
  }

  return (
    <div>
      {/* Tab bar — matched to page max-w container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-1 border-b border-surface-200 pt-4">
          <button
            onClick={() => switchMode('search')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              mode === 'search'
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-surface-500 hover:text-surface-800 hover:border-surface-300'
            }`}
          >
            <LayoutList className="h-4 w-4" />
            Search
          </button>
          <button
            onClick={() => switchMode('screener')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              mode === 'screener'
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-surface-500 hover:text-surface-800 hover:border-surface-300'
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Screener
          </button>
        </div>
      </div>

      {/* Sub-page content — each brings its own max-w / padding */}
      <Suspense fallback={<Loading />}>
        <div className={mode !== 'search' ? 'hidden' : undefined}>
          <SearchPage />
        </div>
        <div className={mode !== 'screener' ? 'hidden' : undefined}>
          <ScreenerPage />
        </div>
      </Suspense>
    </div>
  );
}
