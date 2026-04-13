import { Star } from 'lucide-react';
import { useWatchlist } from '@/hooks/useWatchlist';

interface WatchlistButtonProps {
  certNumber: number;
  size?: 'sm' | 'md';
}

export function WatchlistButton({ certNumber, size = 'md' }: WatchlistButtonProps) {
  const { toggle, isWatching } = useWatchlist();
  const watching = isWatching(certNumber);

  const sizeClasses = size === 'sm'
    ? 'p-1 rounded'
    : 'p-2 rounded-lg';

  const iconSize = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(certNumber);
      }}
      title={watching ? 'Remove from watchlist' : 'Add to watchlist'}
      aria-label={watching ? 'Remove from watchlist' : 'Add to watchlist'}
      className={`inline-flex items-center justify-center transition-colors ${sizeClasses} ${
        watching
          ? 'text-amber-600 hover:text-amber-500'
          : 'text-surface-300 hover:text-amber-600'
      }`}
    >
      <Star
        className={iconSize}
        fill={watching ? 'currentColor' : 'none'}
        strokeWidth={watching ? 0 : 1.5}
      />
    </button>
  );
}
