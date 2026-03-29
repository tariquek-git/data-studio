import { useState, useCallback } from 'react';
import { WatchlistStore } from '@/lib/watchlist';

export function useWatchlist() {
  const [watchlist, setWatchlist] = useState<number[]>(() => WatchlistStore.get());

  const refresh = useCallback(() => {
    setWatchlist(WatchlistStore.get());
  }, []);

  const add = useCallback(
    (cert: number) => {
      WatchlistStore.add(cert);
      refresh();
    },
    [refresh],
  );

  const remove = useCallback(
    (cert: number) => {
      WatchlistStore.remove(cert);
      refresh();
    },
    [refresh],
  );

  const toggle = useCallback(
    (cert: number) => {
      WatchlistStore.toggle(cert);
      refresh();
    },
    [refresh],
  );

  const has = useCallback(
    (cert: number) => watchlist.includes(cert),
    [watchlist],
  );

  const isWatching = has;

  const clear = useCallback(() => {
    WatchlistStore.clear();
    refresh();
  }, [refresh]);

  return { watchlist, add, remove, toggle, has, isWatching, clear };
}
