import { useState } from 'react';
import { ChevronDown, ChevronRight, X, Target, Zap } from 'lucide-react';
import { Input } from '@/components/ui';
import { useExploreStore, type ExploreFilters } from '@/stores/exploreStore';
import { US_STATES, CA_PROVINCES } from '@/types/filters';

const SOURCES = [
  { value: 'fdic', label: 'FDIC Banks (US)' },
  { value: 'ncua', label: 'NCUA Credit Unions (US)' },
  { value: 'osfi', label: 'OSFI (Canada)' },
  { value: 'rpaa', label: 'RPAA PSPs (Canada)' },
  { value: 'ciro', label: 'CIRO Dealers (Canada)' },
  { value: 'fintrac', label: 'FINTRAC MSBs (Canada)' },
  { value: 'fincen', label: 'FinCEN MSBs (US)' },
] as const;

const CHARTER_TYPES = [
  { value: 'commercial', label: 'Commercial' },
  { value: 'savings', label: 'Savings' },
  { value: 'savings_association', label: 'Savings Association' },
  { value: 'credit_union', label: 'Credit Union' },
] as const;

const BRIM_TIERS = ['A', 'B', 'C', 'D', 'F'] as const;

const CRA_RATINGS = [
  { value: 1, label: 'Outstanding' },
  { value: 2, label: 'Satisfactory' },
  { value: 3, label: 'Needs to Improve' },
  { value: 4, label: 'Substantial Non-Compliance' },
] as const;

const PRESET_SCREENS: { label: string; filters: Partial<ExploreFilters> }[] = [
  {
    label: 'Community Bank Partners',
    filters: { assetMin: 100000, assetMax: 10000000, sources: ['fdic'], charterTypes: ['commercial'], hasCreditCards: false },
  },
  {
    label: 'CC Issuer Targets',
    filters: { hasCreditCards: true, assetMin: 500000 },
  },
  {
    label: 'Canadian PSPs',
    filters: { sources: ['rpaa'], country: 'CA' },
  },
  {
    label: 'Top Performers',
    filters: { roaMin: 1.5, assetMin: 1000000 },
  },
  {
    label: 'Growth Banks',
    filters: { assetMin: 500000, assetMax: 50000000, roaMin: 0.8 },
  },
];

const CORE_PROCESSORS = ['Fiserv', 'Jack Henry', 'FIS', 'NCR', 'Other'] as const;
const AGENT_PROGRAMS = ['ELAN', 'PSCU', 'ICBA', 'TCM', 'None', 'Other'] as const;

function FilterSection({
  title,
  defaultOpen = false,
  badge,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  badge?: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-surface-700/30 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full py-2.5 text-xs font-semibold text-surface-500 uppercase tracking-wider hover:text-surface-300 transition-colors"
      >
        <span className="flex items-center gap-2">
          {title}
          {badge != null && badge > 0 && (
            <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-primary-500/20 text-primary-400 text-[10px] font-bold">
              {badge}
            </span>
          )}
        </span>
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-surface-500" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-surface-500" />
        )}
      </button>
      {open && <div className="pb-3 space-y-1.5">{children}</div>}
    </div>
  );
}

function CheckItem({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-surface-800/60 cursor-pointer transition-colors">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-3.5 w-3.5 rounded border-surface-600 bg-surface-800 text-primary-500 focus:ring-primary-500 focus:ring-offset-0"
      />
      <span className="text-xs text-surface-300">{label}</span>
    </label>
  );
}

export function ExploreFilterSidebar() {
  const store = useExploreStore();
  const [stateSearch, setStateSearch] = useState('');
  const { brimMode } = store;
  const allRegions = [
    ...US_STATES.map((s) => ({ code: s.code, name: s.name })),
    ...CA_PROVINCES.map((p) => ({ code: p.code, name: p.name })),
  ];

  const filteredRegions = stateSearch
    ? allRegions.filter(
        (r) =>
          r.name.toLowerCase().includes(stateSearch.toLowerCase()) ||
          r.code.toLowerCase().includes(stateSearch.toLowerCase()),
      )
    : allRegions;

  function toggleSource(value: string) {
    const next = store.sources.includes(value)
      ? store.sources.filter((s) => s !== value)
      : [...store.sources, value];
    store.setFilter('sources', next);
  }

  function toggleState(code: string) {
    const next = store.states.includes(code)
      ? store.states.filter((s) => s !== code)
      : [...store.states, code];
    store.setFilter('states', next);
  }

  function toggleCharterType(value: string) {
    const next = store.charterTypes.includes(value)
      ? store.charterTypes.filter((t) => t !== value)
      : [...store.charterTypes, value];
    store.setFilter('charterTypes', next);
  }

  function toggleBrimTierFilter(tier: string) {
    const next = store.brimTiers.includes(tier)
      ? store.brimTiers.filter((t) => t !== tier)
      : [...store.brimTiers, tier];
    store.setFilter('brimTiers', next);
  }

  function toggleCoreProcessor(proc: string) {
    const next = store.coreProcessors.includes(proc)
      ? store.coreProcessors.filter((p) => p !== proc)
      : [...store.coreProcessors, proc];
    store.setFilter('coreProcessors', next);
  }

  function toggleAgentProgram(prog: string) {
    const next = store.agentPrograms.includes(prog)
      ? store.agentPrograms.filter((p) => p !== prog)
      : [...store.agentPrograms, prog];
    store.setFilter('agentPrograms', next);
  }

  function toggleCraRating(value: number) {
    const next = store.craRating.includes(value)
      ? store.craRating.filter((r) => r !== value)
      : [...store.craRating, value];
    store.setFilter('craRating', next);
  }

  const activeFilterCount =
    store.sources.length +
    store.states.length +
    store.charterTypes.length +
    (store.assetMin != null ? 1 : 0) +
    (store.assetMax != null ? 1 : 0) +
    (store.depositMin != null ? 1 : 0) +
    (store.depositMax != null ? 1 : 0) +
    (store.roaMin != null ? 1 : 0) +
    (store.roaMax != null ? 1 : 0) +
    (store.roeMin != null ? 1 : 0) +
    (store.roeMax != null ? 1 : 0) +
    (store.equityRatioMin != null ? 1 : 0) +
    (store.ldrMin != null ? 1 : 0) +
    (store.ldrMax != null ? 1 : 0) +
    store.craRating.length +
    (store.hasCreditCards ? 1 : 0) +
    (store.brimTier != null ? 1 : 0) +
    (store.country != null ? 1 : 0) +
    (store.minBrimScore != null ? 1 : 0) +
    store.brimTiers.length +
    store.coreProcessors.length +
    store.agentPrograms.length +
    (store.excludeBdExclusions ? 1 : 0) +
    (store.migrationTargetsOnly ? 1 : 0);

  return (
    <div className="h-full flex flex-col">
      {/* Brim Mode header indicator */}
      {brimMode && (
        <div className="px-4 py-2 bg-violet-50 border-b border-violet-200 flex items-center gap-2">
          <Target className="h-3.5 w-3.5 text-violet-600 shrink-0" />
          <span className="text-xs font-semibold text-violet-600 uppercase tracking-wider">Brim Intelligence</span>
        </div>
      )}

      {/* Search input */}
      <div className="px-4 pt-4 pb-3">
        <Input
          type="search"
          placeholder="Search institutions..."
          value={store.query}
          onChange={(e) => store.setFilter('query', e.target.value)}
          className="text-sm"
        />
      </div>

      {/* Country quick-filter */}
      <div className="px-4 pb-3 flex gap-1.5">
        {([{ label: 'All', value: null }, { label: 'US', value: 'US' }, { label: 'Canada', value: 'CA' }] as const).map((opt) => (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => store.setFilter('country', opt.value)}
            className={`flex-1 px-2 py-1 rounded-full text-xs font-medium border transition-colors ${
              store.country === opt.value
                ? 'bg-primary-500/20 text-primary-300 border-primary-500/30'
                : 'text-surface-400 border-surface-700 hover:border-primary-500/30 hover:text-primary-400'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex-1 overflow-y-auto px-4 space-y-0">
        {/* Preset Screens */}
        {!brimMode && (
          <div className="pb-3 border-b border-surface-700/30">
            <p className="text-[10px] font-semibold text-surface-500 uppercase tracking-wider py-2">Quick Screens</p>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_SCREENS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    store.clearFilters();
                    store.setFilters(preset.filters);
                  }}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium border border-surface-700 text-surface-400 hover:border-cyan-300 hover:text-cyan-600 transition-colors"
                >
                  <Zap className="h-3 w-3" />
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Brim Intelligence prospect filters — only shown in Brim Mode */}
        {brimMode && (
          <div className="mb-2 border border-violet-200 rounded-lg bg-violet-50/50 px-3 py-2.5 space-y-3">
            <p className="text-[10px] font-semibold text-violet-600 uppercase tracking-wider">
              Prospect Filters
            </p>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-surface-400">Min Brim Score</label>
                <span className="text-xs font-mono font-semibold text-violet-600">
                  {store.minBrimScore ?? 0}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={store.minBrimScore ?? 0}
                onChange={(e) =>
                  store.setFilter('minBrimScore', Number(e.target.value) || null)
                }
                className="w-full accent-violet-500"
              />
            </div>

            <div>
              <p className="text-xs text-surface-500 mb-1">Tier</p>
              <div className="flex gap-1 flex-wrap">
                {(['A', 'B', 'C', 'D'] as const).map((tier) => (
                  <button
                    key={tier}
                    type="button"
                    onClick={() => toggleBrimTierFilter(tier)}
                    className={`px-2 py-0.5 rounded text-xs font-semibold border transition-colors ${
                      store.brimTiers.includes(tier)
                        ? 'bg-violet-100 text-violet-600 border-violet-300'
                        : 'text-surface-400 border-surface-700 hover:border-violet-300'
                    }`}
                  >
                    {tier}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs text-surface-500 mb-1">Core Processor</p>
              <div className="space-y-0.5">
                {CORE_PROCESSORS.map((proc) => (
                  <CheckItem
                    key={proc}
                    label={proc}
                    checked={store.coreProcessors.includes(proc)}
                    onChange={() => toggleCoreProcessor(proc)}
                  />
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs text-surface-500 mb-1">Agent Program</p>
              <div className="space-y-0.5">
                {AGENT_PROGRAMS.map((prog) => (
                  <CheckItem
                    key={prog}
                    label={prog}
                    checked={store.agentPrograms.includes(prog)}
                    onChange={() => toggleAgentProgram(prog)}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <CheckItem
                label="Exclude existing clients"
                checked={store.excludeBdExclusions}
                onChange={() =>
                  store.setFilter('excludeBdExclusions', !store.excludeBdExclusions)
                }
              />
              <CheckItem
                label="Migration targets only"
                checked={store.migrationTargetsOnly}
                onChange={() =>
                  store.setFilter('migrationTargetsOnly', !store.migrationTargetsOnly)
                }
              />
            </div>
          </div>
        )}

        <FilterSection title="Source" defaultOpen badge={store.sources.length}>
          {SOURCES.map((src) => (
            <CheckItem
              key={src.value}
              label={src.label}
              checked={store.sources.includes(src.value)}
              onChange={() => toggleSource(src.value)}
            />
          ))}
        </FilterSection>

        <FilterSection title="Charter Type" badge={store.charterTypes.length}>
          {CHARTER_TYPES.map((ct) => (
            <CheckItem
              key={ct.value}
              label={ct.label}
              checked={store.charterTypes.includes(ct.value)}
              onChange={() => toggleCharterType(ct.value)}
            />
          ))}
        </FilterSection>

        <FilterSection
          title="State / Province"
          badge={store.states.length}
        >
          <Input
            type="text"
            placeholder="Search states..."
            value={stateSearch}
            onChange={(e) => setStateSearch(e.target.value)}
            className="text-xs !py-1.5 mb-1"
          />
          <div className="max-h-40 overflow-y-auto space-y-0.5">
            {filteredRegions.map((region) => (
              <CheckItem
                key={region.code}
                label={`${region.name} (${region.code})`}
                checked={store.states.includes(region.code)}
                onChange={() => toggleState(region.code)}
              />
            ))}
          </div>
        </FilterSection>

        <FilterSection
          title="Total Assets"
          badge={(store.assetMin != null ? 1 : 0) + (store.assetMax != null ? 1 : 0)}
        >
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              placeholder="Min ($)"
              value={store.assetMin ?? ''}
              onChange={(e) =>
                store.setFilter('assetMin', e.target.value ? Number(e.target.value) : null)
              }
              className="text-xs !py-1.5"
            />
            <Input
              type="number"
              placeholder="Max ($)"
              value={store.assetMax ?? ''}
              onChange={(e) =>
                store.setFilter('assetMax', e.target.value ? Number(e.target.value) : null)
              }
              className="text-xs !py-1.5"
            />
          </div>
        </FilterSection>

        <FilterSection
          title="Total Deposits"
          badge={(store.depositMin != null ? 1 : 0) + (store.depositMax != null ? 1 : 0)}
        >
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              placeholder="Min ($)"
              value={store.depositMin ?? ''}
              onChange={(e) =>
                store.setFilter('depositMin', e.target.value ? Number(e.target.value) : null)
              }
              className="text-xs !py-1.5"
            />
            <Input
              type="number"
              placeholder="Max ($)"
              value={store.depositMax ?? ''}
              onChange={(e) =>
                store.setFilter('depositMax', e.target.value ? Number(e.target.value) : null)
              }
              className="text-xs !py-1.5"
            />
          </div>
        </FilterSection>

        <FilterSection
          title="ROA (%)"
          badge={(store.roaMin != null ? 1 : 0) + (store.roaMax != null ? 1 : 0)}
        >
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              step="0.01"
              placeholder="Min"
              value={store.roaMin ?? ''}
              onChange={(e) =>
                store.setFilter('roaMin', e.target.value ? Number(e.target.value) : null)
              }
              className="text-xs !py-1.5"
            />
            <Input
              type="number"
              step="0.01"
              placeholder="Max"
              value={store.roaMax ?? ''}
              onChange={(e) =>
                store.setFilter('roaMax', e.target.value ? Number(e.target.value) : null)
              }
              className="text-xs !py-1.5"
            />
          </div>
        </FilterSection>

        <FilterSection
          title="ROE (%)"
          badge={(store.roeMin != null ? 1 : 0) + (store.roeMax != null ? 1 : 0)}
        >
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              step="0.01"
              placeholder="Min"
              value={store.roeMin ?? ''}
              onChange={(e) =>
                store.setFilter('roeMin', e.target.value ? Number(e.target.value) : null)
              }
              className="text-xs !py-1.5"
            />
            <Input
              type="number"
              step="0.01"
              placeholder="Max"
              value={store.roeMax ?? ''}
              onChange={(e) =>
                store.setFilter('roeMax', e.target.value ? Number(e.target.value) : null)
              }
              className="text-xs !py-1.5"
            />
          </div>
        </FilterSection>

        <FilterSection
          title="Equity / Assets (%)"
          badge={store.equityRatioMin != null ? 1 : 0}
        >
          <Input
            type="number"
            step="0.1"
            placeholder="Min %"
            value={store.equityRatioMin ?? ''}
            onChange={(e) =>
              store.setFilter('equityRatioMin', e.target.value ? Number(e.target.value) : null)
            }
            className="text-xs !py-1.5"
          />
        </FilterSection>

        <FilterSection
          title="Loan-to-Deposit (%)"
          badge={(store.ldrMin != null ? 1 : 0) + (store.ldrMax != null ? 1 : 0)}
        >
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              step="0.1"
              placeholder="Min %"
              value={store.ldrMin ?? ''}
              onChange={(e) =>
                store.setFilter('ldrMin', e.target.value ? Number(e.target.value) : null)
              }
              className="text-xs !py-1.5"
            />
            <Input
              type="number"
              step="0.1"
              placeholder="Max %"
              value={store.ldrMax ?? ''}
              onChange={(e) =>
                store.setFilter('ldrMax', e.target.value ? Number(e.target.value) : null)
              }
              className="text-xs !py-1.5"
            />
          </div>
        </FilterSection>

        <FilterSection title="CRA Rating" badge={store.craRating.length}>
          {CRA_RATINGS.map((cra) => (
            <CheckItem
              key={cra.value}
              label={cra.label}
              checked={store.craRating.includes(cra.value)}
              onChange={() => toggleCraRating(cra.value)}
            />
          ))}
        </FilterSection>

        <FilterSection title="Card Capabilities" badge={(store.hasCreditCards ? 1 : 0) + (store.brimTier != null ? 1 : 0)}>
          <CheckItem
            label="Has credit card program"
            checked={store.hasCreditCards}
            onChange={() => store.setFilter('hasCreditCards', !store.hasCreditCards)}
          />
          <div className="mt-2">
            <p className="text-xs text-surface-500 mb-1.5">Brim tier</p>
            <div className="flex gap-1.5 flex-wrap">
              {BRIM_TIERS.map((tier) => (
                <button
                  key={tier}
                  type="button"
                  onClick={() => store.setFilter('brimTier', store.brimTier === tier ? null : tier)}
                  className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors ${
                    store.brimTier === tier
                      ? 'bg-primary-500/20 text-primary-300 border-primary-500/30'
                      : 'text-surface-400 border-surface-700 hover:border-primary-500/30'
                  }`}
                >
                  {tier}
                </button>
              ))}
            </div>
          </div>
        </FilterSection>
      </div>

      {/* Clear all */}
      {activeFilterCount > 0 && (
        <div className="px-4 pb-4 pt-3 border-t border-surface-700/50">
          <button
            type="button"
            onClick={() => store.clearFilters()}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-surface-700 text-xs text-surface-400 hover:text-red-500 hover:border-red-300 transition-colors"
          >
            <X className="h-3 w-3" />
            Clear All ({activeFilterCount})
          </button>
        </div>
      )}
    </div>
  );
}
