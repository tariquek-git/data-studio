const STORAGE_KEY = 'ds_watchlist';

export const WatchlistStore = {
  get(): number[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as number[]) : [];
    } catch {
      return [];
    }
  },

  add(cert: number): void {
    const list = this.get();
    if (!list.includes(cert)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...list, cert]));
    }
  },

  remove(cert: number): void {
    const list = this.get().filter((c) => c !== cert);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  },

  has(cert: number): boolean {
    return this.get().includes(cert);
  },

  toggle(cert: number): void {
    if (this.has(cert)) {
      this.remove(cert);
    } else {
      this.add(cert);
    }
  },

  clear(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
  },
};
