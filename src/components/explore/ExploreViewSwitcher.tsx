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
    <div className="flex items-center gap-4">
      {/* Tab bar */}
      <div className="flex items-center rounded-lg overflow-hidden border border-surface-700/50 bg-surface-800/50">
        {TABS.map(({ mode, label, Icon }) => (
          <button
            key={mode}
            type="button"
            onClick={() => setViewMode(mode)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors ${
              viewMode === mode
                ? 'bg-primary-500/20 text-primary-300'
                : 'text-surface-500 hover:text-surface-200 hover:bg-surface-700/50'
            }`}
            aria-pressed={viewMode === mode}
            title={label}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Result count */}
      <div className="flex items-center gap-2 text-xs text-surface-500">
        {isFetching && (
          <span className="inline-block w-3 h-3 border border-primary-400 border-t-transparent rounded-full animate-spin" />
        )}
        <span>
          <span className="font-semibold font-mono text-surface-200">{formatNumber(total)}</span>{' '}
          results
        </span>
      </div>
    </div>
  );
}
