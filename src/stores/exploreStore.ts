import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ViewMode = 'table' | 'cards' | 'map' | 'chart';

export interface WorkingSetItem {
  certNumber: number;
  name: string;
}

export interface ExploreFilters {
  query: string;
  country: string | null;
  sources: string[];
  states: string[];
  charterTypes: string[];
  assetMin: number | null;
  assetMax: number | null;
  depositMin: number | null;
  depositMax: number | null;
  roaMin: number | null;
  roaMax: number | null;
  hasCreditCards: boolean;
  brimTier: string | null;
  // Brim Mode filters
  minBrimScore: number | null;
  brimTiers: string[];
  coreProcessors: string[];
  agentPrograms: string[];
  excludeBdExclusions: boolean;
  migrationTargetsOnly: boolean;
}

export interface ExploreState extends ExploreFilters {
  // View
  viewMode: ViewMode;
  sortBy: string;
  sortDir: 'asc' | 'desc';
  page: number;
  perPage: number;

  // Working set (persisted in sessionStorage)
  workingSet: WorkingSetItem[];

  // Analytics panel open/closed
  analyticsPanelOpen: boolean;

  // Brim Mode
  brimMode: boolean;

  // Actions
  setFilter: (key: keyof ExploreFilters, value: ExploreFilters[keyof ExploreFilters]) => void;
  setFilters: (partial: Partial<ExploreFilters>) => void;
  clearFilters: () => void;
  setViewMode: (mode: ViewMode) => void;
  setPage: (page: number) => void;
  setSort: (by: string, dir: 'asc' | 'desc') => void;
  addToWorkingSet: (inst: WorkingSetItem) => void;
  removeFromWorkingSet: (certNumber: number) => void;
  clearWorkingSet: () => void;
  setAnalyticsPanelOpen: (open: boolean) => void;
  toggleBrimMode: () => void;
}

const DEFAULT_FILTERS: ExploreFilters = {
  query: '',
  country: null,
  sources: [],
  states: [],
  charterTypes: [],
  assetMin: null,
  assetMax: null,
  depositMin: null,
  depositMax: null,
  roaMin: null,
  roaMax: null,
  hasCreditCards: false,
  brimTier: null,
  minBrimScore: null,
  brimTiers: [],
  coreProcessors: [],
  agentPrograms: [],
  excludeBdExclusions: false,
  migrationTargetsOnly: false,
};

const BRIM_MODE_DEFAULTS: Partial<ExploreFilters> = {
  minBrimScore: 50,
  excludeBdExclusions: true,
};

// Separate store for working set using sessionStorage persistence
interface WorkingSetStore {
  workingSet: WorkingSetItem[];
  addToWorkingSet: (inst: WorkingSetItem) => void;
  removeFromWorkingSet: (certNumber: number) => void;
  clearWorkingSet: () => void;
}

export const useWorkingSetStore = create<WorkingSetStore>()(
  persist(
    (set) => ({
      workingSet: [],
      addToWorkingSet: (inst) =>
        set((s) => {
          if (s.workingSet.some((w) => w.certNumber === inst.certNumber)) return s;
          return { workingSet: [...s.workingSet, inst] };
        }),
      removeFromWorkingSet: (certNumber) =>
        set((s) => ({ workingSet: s.workingSet.filter((w) => w.certNumber !== certNumber) })),
      clearWorkingSet: () => set({ workingSet: [] }),
    }),
    {
      name: 'explore-working-set',
      storage: {
        getItem: (name) => {
          const str = sessionStorage.getItem(name);
          return str ? JSON.parse(str) : null;
        },
        setItem: (name, value) => sessionStorage.setItem(name, JSON.stringify(value)),
        removeItem: (name) => sessionStorage.removeItem(name),
      },
    },
  ),
);

const BRIM_CLEAR_FILTERS: Partial<ExploreFilters> = {
  minBrimScore: null,
  brimTiers: [],
  coreProcessors: [],
  agentPrograms: [],
  excludeBdExclusions: false,
  migrationTargetsOnly: false,
};

export const useExploreStore = create<ExploreState>()((set) => ({
  ...DEFAULT_FILTERS,

  viewMode: 'table',
  sortBy: 'total_assets',
  sortDir: 'desc',
  page: 1,
  perPage: 25,

  workingSet: [],
  analyticsPanelOpen: true,
  brimMode: false,

  setFilter: (key, value) =>
    set((s) => ({ ...s, [key]: value, page: 1 })),

  setFilters: (partial) =>
    set((s) => ({ ...s, ...partial, page: 1 })),

  clearFilters: () => set((s) => ({ ...s, ...DEFAULT_FILTERS, page: 1 })),

  setViewMode: (mode) => set({ viewMode: mode }),

  setPage: (page) => set({ page }),

  setSort: (by, dir) => set({ sortBy: by, sortDir: dir, page: 1 }),

  addToWorkingSet: (inst) =>
    set((s) => {
      if (s.workingSet.some((w) => w.certNumber === inst.certNumber)) return s;
      return { workingSet: [...s.workingSet, inst] };
    }),

  removeFromWorkingSet: (certNumber) =>
    set((s) => ({ workingSet: s.workingSet.filter((w) => w.certNumber !== certNumber) })),

  clearWorkingSet: () => set({ workingSet: [] }),

  setAnalyticsPanelOpen: (open) => set({ analyticsPanelOpen: open }),

  toggleBrimMode: () =>
    set((s) => {
      if (!s.brimMode) {
        // Turning ON: apply Brim defaults + switch sort to brim_score desc
        return {
          ...s,
          brimMode: true,
          ...BRIM_MODE_DEFAULTS,
          sortBy: 'brim_score',
          sortDir: 'desc' as const,
          page: 1,
        };
      } else {
        // Turning OFF: clear Brim-specific filters, restore default sort
        return {
          ...s,
          brimMode: false,
          ...BRIM_CLEAR_FILTERS,
          sortBy: 'total_assets',
          sortDir: 'desc' as const,
          page: 1,
        };
      }
    }),
}));
