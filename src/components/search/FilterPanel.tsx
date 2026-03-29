import { useState } from 'react';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import type { SearchFilters } from '@/types/filters';
import { US_STATES, CA_PROVINCES } from '@/types/filters';

// Asset size quick-filter presets (values in dollars, null = no bound)
const ASSET_SIZE_PRESETS = [
  { label: 'All Sizes', min: null, max: null },
  { label: '< $1B',     min: null,        max: 1_000_000_000 },
  { label: '$1B–$10B',  min: 1_000_000_000, max: 10_000_000_000 },
  { label: '$10B–$50B', min: 10_000_000_000, max: 50_000_000_000 },
  { label: '> $50B',    min: 50_000_000_000, max: null },
] as const;

interface FilterPanelProps {
  filters: SearchFilters;
  onChange: (filters: Partial<SearchFilters>) => void;
  onClear: () => void;
}

function FilterSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-surface-100 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full py-3 text-sm font-medium text-surface-700 hover:text-surface-900"
      >
        {title}
        {open ? (
          <ChevronDown className="h-4 w-4 text-surface-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-surface-400" />
        )}
      </button>
      {open && <div className="pb-3 space-y-2">{children}</div>}
    </div>
  );
}

export function FilterPanel({ filters, onChange, onClear }: FilterPanelProps) {
  const [stateSearch, setStateSearch] = useState('');

  // Determine which asset size preset is currently active (if any)
  function activePresetIndex(): number {
    return ASSET_SIZE_PRESETS.findIndex(
      (p) => p.min === filters.min_assets && p.max === filters.max_assets,
    );
  }

  function applyAssetPreset(min: number | null, max: number | null) {
    onChange({ min_assets: min, max_assets: max });
  }

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

  function toggleState(code: string) {
    const states = filters.states.includes(code)
      ? filters.states.filter((s) => s !== code)
      : [...filters.states, code];
    onChange({ states });
  }

  function toggleSource(src: SearchFilters['source'][number]) {
    const source = filters.source.includes(src)
      ? filters.source.filter((s) => s !== src)
      : [...filters.source, src];
    onChange({ source });
  }

  function toggleCharterType(type: string) {
    const charter_types = filters.charter_types.includes(type)
      ? filters.charter_types.filter((t) => t !== type)
      : [...filters.charter_types, type];
    onChange({ charter_types });
  }

  const hasFilters =
    filters.country !== null ||
    filters.states.length > 0 ||
    filters.source.length > 0 ||
    filters.charter_types.length > 0 ||
    filters.min_assets !== null ||
    filters.max_assets !== null ||
    filters.min_deposits !== null ||
    filters.max_deposits !== null ||
    filters.min_roa !== null ||
    filters.max_roa !== null ||
    filters.min_roi !== null ||
    filters.max_roi !== null ||
    filters.has_credit_card_program !== null;

  const COUNTRY_OPTIONS: { label: string; value: 'US' | 'CA' | null }[] = [
    { label: 'All', value: null },
    { label: '🇺🇸 United States', value: 'US' },
    { label: '🇨🇦 Canada', value: 'CA' },
  ];

  return (
    <div className="space-y-0">
      <div className="flex items-center justify-between pb-2 mb-1 border-b border-surface-200">
        <h3 className="text-sm font-semibold text-surface-900">Filters</h3>
        {hasFilters && (
          <button
            onClick={onClear}
            className="inline-flex items-center gap-1 text-xs text-surface-500 hover:text-red-600 transition-colors"
          >
            <X className="h-3 w-3" />
            Clear all
          </button>
        )}
      </div>

      {/* Country quick-filter */}
      <div className="flex gap-1.5 pb-3 border-b border-surface-100">
        {COUNTRY_OPTIONS.map((opt) => (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => onChange({ country: opt.value })}
            className={`flex-1 px-2 py-1 rounded-full text-xs font-medium border transition-colors ${
              filters.country === opt.value
                ? 'bg-primary-600 text-white border-primary-600'
                : 'bg-white text-surface-600 border-surface-300 hover:border-primary-400 hover:text-primary-700'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* State / Province */}
      <FilterSection title="State / Province" defaultOpen>
        <Input
          type="text"
          placeholder="Search states..."
          value={stateSearch}
          onChange={(e) => setStateSearch(e.target.value)}
          className="text-xs !py-1.5"
        />
        <div className="max-h-48 overflow-y-auto space-y-0.5 mt-1">
          {filteredRegions.map((region) => (
            <label
              key={region.code}
              className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-surface-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={filters.states.includes(region.code)}
                onChange={() => toggleState(region.code)}
                className="h-3.5 w-3.5 rounded border-surface-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-xs text-surface-700">
                {region.name}{' '}
                <span className="text-surface-400">({region.code})</span>
              </span>
            </label>
          ))}
        </div>
      </FilterSection>

      {/* Source */}
      <FilterSection title="Source" defaultOpen>
        {(['fdic', 'ncua', 'osfi', 'rpaa', 'ciro', 'fintrac', 'fincen'] as const).map((src) => (
          <label
            key={src}
            className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-surface-50 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={filters.source.includes(src)}
              onChange={() => toggleSource(src)}
              className="h-3.5 w-3.5 rounded border-surface-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-xs text-surface-700">
              {src === 'fdic'
                ? 'FDIC Banks (US)'
                : src === 'ncua'
                  ? 'NCUA Credit Unions (US)'
                  : src === 'osfi'
                    ? 'OSFI (Canada)'
                    : src === 'rpaa'
                      ? 'RPAA PSPs (Canada)'
                      : src === 'ciro'
                        ? 'CIRO Dealers (Canada)'
                        : src === 'fintrac'
                          ? 'FINTRAC MSBs (Canada)'
                          : 'FinCEN MSBs (US)'}
            </span>
          </label>
        ))}
      </FilterSection>

      {/* Charter Type */}
      <FilterSection title="Charter Type">
        {['commercial', 'savings', 'savings_association', 'credit_union'].map((type) => (
          <label
            key={type}
            className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-surface-50 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={filters.charter_types.includes(type)}
              onChange={() => toggleCharterType(type)}
              className="h-3.5 w-3.5 rounded border-surface-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-xs text-surface-700 capitalize">
              {type.replace(/_/g, ' ')}
            </span>
          </label>
        ))}
      </FilterSection>

      {/* Asset Range */}
      <FilterSection title="Total Assets">
        {/* Quick-select size pills */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          {ASSET_SIZE_PRESETS.map((preset, i) => {
            const isActive = activePresetIndex() === i;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyAssetPreset(preset.min, preset.max)}
                className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                  isActive
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-white text-surface-600 border-surface-300 hover:border-primary-400 hover:text-primary-700'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
        {/* Custom min/max inputs */}
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="number"
            placeholder="Min ($)"
            value={filters.min_assets ?? ''}
            onChange={(e) =>
              onChange({ min_assets: e.target.value ? Number(e.target.value) : null })
            }
            className="text-xs !py-1.5"
          />
          <Input
            type="number"
            placeholder="Max ($)"
            value={filters.max_assets ?? ''}
            onChange={(e) =>
              onChange({ max_assets: e.target.value ? Number(e.target.value) : null })
            }
            className="text-xs !py-1.5"
          />
        </div>
      </FilterSection>

      {/* Deposit Range */}
      <FilterSection title="Total Deposits">
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="number"
            placeholder="Min ($)"
            value={filters.min_deposits ?? ''}
            onChange={(e) =>
              onChange({ min_deposits: e.target.value ? Number(e.target.value) : null })
            }
            className="text-xs !py-1.5"
          />
          <Input
            type="number"
            placeholder="Max ($)"
            value={filters.max_deposits ?? ''}
            onChange={(e) =>
              onChange({ max_deposits: e.target.value ? Number(e.target.value) : null })
            }
            className="text-xs !py-1.5"
          />
        </div>
      </FilterSection>

      {/* ROA Range */}
      <FilterSection title="ROA (%)">
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="number"
            step="0.01"
            placeholder="Min"
            value={filters.min_roa ?? ''}
            onChange={(e) =>
              onChange({ min_roa: e.target.value ? Number(e.target.value) : null })
            }
            className="text-xs !py-1.5"
          />
          <Input
            type="number"
            step="0.01"
            placeholder="Max"
            value={filters.max_roa ?? ''}
            onChange={(e) =>
              onChange({ max_roa: e.target.value ? Number(e.target.value) : null })
            }
            className="text-xs !py-1.5"
          />
        </div>
      </FilterSection>

      {/* ROE Range */}
      <FilterSection title="ROE (%)">
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="number"
            step="0.01"
            placeholder="Min"
            value={filters.min_roi ?? ''}
            onChange={(e) =>
              onChange({ min_roi: e.target.value ? Number(e.target.value) : null })
            }
            className="text-xs !py-1.5"
          />
          <Input
            type="number"
            step="0.01"
            placeholder="Max"
            value={filters.max_roi ?? ''}
            onChange={(e) =>
              onChange({ max_roi: e.target.value ? Number(e.target.value) : null })
            }
            className="text-xs !py-1.5"
          />
        </div>
      </FilterSection>

      {/* Credit Card Program */}
      <FilterSection title="Credit Card Program">
        <label className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-surface-50 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.has_credit_card_program === true}
            onChange={(e) =>
              onChange({ has_credit_card_program: e.target.checked ? true : null })
            }
            className="h-3.5 w-3.5 rounded border-surface-300 text-primary-600 focus:ring-primary-500"
          />
          <span className="text-xs text-surface-700">Has credit card program</span>
        </label>
      </FilterSection>

      {/* Apply */}
      <div className="pt-3">
        <Button variant="primary" size="sm" className="w-full">
          Apply Filters
        </Button>
      </div>
    </div>
  );
}
