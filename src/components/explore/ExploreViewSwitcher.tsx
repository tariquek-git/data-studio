import { LayoutList, LayoutGrid, MapPin, BarChart2 } from 'lucide-react';
import { useExploreStore } from '@/stores/exploreStore';
import type { ViewMode } from '@/stores/exploreStore';
import { formatNumber } from '@/lib/format';

interface ExploreViewSwitcherProps {
  total: number;
  isFetching: boolean;
}

const TABS: { mode: ViewMode; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { mode: 'table', label: 'Table', Icon: LayoutList },
  { mode: 'cards', label: 'Cards', Icon: LayoutGrid },
  { mode: 'map', label: 'Map', Icon: MapPin },
  { mode: 'chart', label: 'Chart', Icon: BarChart2 },
];

export function ExploreViewSwitcher({ total, isFetching }: ExploreViewSwitcherProps) {
  const { viewMode, setViewMode } = useExploreStore();

  return (
    <div className="flex items-center justify-between gap-4">
      {/* Tab bar */}
      <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
        {TABS.map(({ mode, label, Icon }) => (
          <button
            key={mode}
            type="button"
            onClick={() => setViewMode(mode)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
              viewMode === mode
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
            }`}
            aria-pressed={viewMode === mode}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Result count */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        {isFetching && (
          <span className="inline-block w-3 h-3 border border-blue-500 border-t-transparent rounded-full animate-spin" />
        )}
        <span>
          <span className="font-semibold text-slate-800">{formatNumber(total)}</span>{' '}
          institution{total !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );
}
