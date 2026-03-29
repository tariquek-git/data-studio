import { useState, useCallback } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { Badge, Button, Input, Skeleton } from '@/components/ui';
import { exportSearchResultsToExcel } from '@/lib/export';
import { formatCurrency, formatPercent } from '@/lib/format';
import { US_STATES, CA_PROVINCES } from '@/types/filters';
import type { Institution } from '@/types/institution';

// ─── Types ─────────────────────────────────────────────────────────────────

interface ScreenerFilters {
  asset_min: string;
  asset_max: string;
  deposit_min: string;
  deposit_max: string;
  roa_min: string;
  roa_max: string;
  roe_min: string;
  roe_max: string;
  equity_ratio_min: string;
  loan_to_deposit_min: string;
  loan_to_deposit_max: string;
  cc_program: '' | 'true' | 'false';
  cc_min: string;
  deposit_growth_min: string;
  cra_rating: number[];
  source: string[];
  charter_type: string[];
  state: string[];
  active_only: boolean;
  sort_by: string;
  sort_order: 'asc' | 'desc';
}

interface ScreenerResult {
  institutions: Institution[];
  total_count: number;
  offset: number;
  limit: number;
  applied_filters: Record<string, unknown>;
}

const DEFAULT_FILTERS: ScreenerFilters = {
  asset_min: '',
  asset_max: '',
  deposit_min: '',
  deposit_max: '',
  roa_min: '',
  roa_max: '',
  roe_min: '',
  roe_max: '',
  equity_ratio_min: '',
  loan_to_deposit_min: '',
  loan_to_deposit_max: '',
  cc_program: '',
  cc_min: '',
  deposit_growth_min: '',
  cra_rating: [],
  source: [],
  charter_type: [],
  state: [],
  active_only: true,
  sort_by: 'total_assets',
  sort_order: 'desc',
};

// ─── Preset screens ─────────────────────────────────────────────────────────

interface Preset {
  label: string;
  emoji: string;
  description: string;
  filters: Partial<ScreenerFilters>;
}

const PRESETS: Preset[] = [
  {
    label: 'Community Bank Partners',
    emoji: '🏦',
    description: 'FDIC banks $100M–$10B, profitable',
    filters: {
      source: ['fdic'],
      asset_min: '100000000',
      asset_max: '10000000000',
      roa_min: '0',
      active_only: true,
    },
  },
  {
    label: 'CC Issuer Targets',
    emoji: '💳',
    description: 'FDIC $500M–$50B, no CC program, ROA>0.5',
    filters: {
      source: ['fdic'],
      asset_min: '500000000',
      asset_max: '50000000000',
      cc_program: 'false',
      roa_min: '0.5',
      active_only: true,
    },
  },
  {
    label: 'Canadian PSPs',
    emoji: '🍁',
    description: 'RPAA, CIRO, and FinTRAC registered entities',
    filters: {
      source: ['rpaa', 'ciro', 'fintrac'],
    },
  },
  {
    label: 'Top Performers',
    emoji: '⭐',
    description: 'ROA>1.5%, ROE>12%, active',
    filters: {
      roa_min: '1.5',
      roe_min: '12',
      active_only: true,
    },
  },
  {
    label: 'Growth Banks',
    emoji: '📈',
    description: 'Deposit growth YoY ≥5%, assets >$100M',
    filters: {
      deposit_growth_min: '5',
      asset_min: '100000000',
      active_only: true,
    },
  },
];

// ─── Asset size presets ──────────────────────────────────────────────────────

const ASSET_PRESETS = [
  { label: 'Any', min: '', max: '' },
  { label: '<$100M', min: '', max: '100000000' },
  { label: '$100M–$1B', min: '100000000', max: '1000000000' },
  { label: '$1B–$10B', min: '1000000000', max: '10000000000' },
  { label: '$10B–$50B', min: '10000000000', max: '50000000000' },
  { label: '$50B+', min: '50000000000', max: '' },
];

// ─── Source / charter options ────────────────────────────────────────────────

const SOURCE_OPTIONS = [
  { value: 'fdic', label: 'FDIC' },
  { value: 'ncua', label: 'NCUA' },
  { value: 'osfi', label: 'OSFI' },
  { value: 'rpaa', label: 'RPAA' },
  { value: 'ciro', label: 'CIRO' },
  { value: 'fintrac', label: 'FinTRAC' },
  { value: 'fincen', label: 'FinCEN' },
];

const CHARTER_OPTIONS = [
  { value: 'commercial', label: 'Commercial Bank' },
  { value: 'savings', label: 'Savings Bank' },
  { value: 'savings_association', label: 'Savings Association' },
  { value: 'credit_union', label: 'Credit Union' },
];

const CRA_OPTIONS = [
  { value: 1, label: 'Outstanding' },
  { value: 2, label: 'Satisfactory' },
  { value: 3, label: 'Needs to Improve' },
  { value: 4, label: 'Substantial Non-Compliance' },
];

const SORT_OPTIONS = [
  { value: 'total_assets', label: 'Total Assets' },
  { value: 'total_deposits', label: 'Total Deposits' },
  { value: 'roa', label: 'ROA' },
  { value: 'roi', label: 'ROE' },
  { value: 'net_income', label: 'Net Income' },
  { value: 'credit_card_loans', label: 'CC Receivables' },
];

const ALL_STATES = [...US_STATES, ...CA_PROVINCES];

// ─── Fetch ───────────────────────────────────────────────────────────────────

async function runScreen(filters: ScreenerFilters, offset: number): Promise<ScreenerResult> {
  const params = new URLSearchParams();

  if (filters.asset_min)          params.set('asset_min', filters.asset_min);
  if (filters.asset_max)          params.set('asset_max', filters.asset_max);
  if (filters.deposit_min)        params.set('deposit_min', filters.deposit_min);
  if (filters.deposit_max)        params.set('deposit_max', filters.deposit_max);
  if (filters.roa_min)            params.set('roa_min', filters.roa_min);
  if (filters.roa_max)            params.set('roa_max', filters.roa_max);
  if (filters.roe_min)            params.set('roe_min', filters.roe_min);
  if (filters.roe_max)            params.set('roe_max', filters.roe_max);
  if (filters.equity_ratio_min)   params.set('equity_ratio_min', filters.equity_ratio_min);
  if (filters.loan_to_deposit_min) params.set('loan_to_deposit_min', filters.loan_to_deposit_min);
  if (filters.loan_to_deposit_max) params.set('loan_to_deposit_max', filters.loan_to_deposit_max);
  if (filters.cc_program)         params.set('cc_program', filters.cc_program);
  if (filters.cc_min)             params.set('cc_min', filters.cc_min);
  if (filters.deposit_growth_min) params.set('deposit_growth_min', filters.deposit_growth_min);
  if (filters.cra_rating.length)  params.set('cra_rating', filters.cra_rating.join(','));
  if (filters.source.length)      params.set('source', filters.source.join(','));
  if (filters.charter_type.length) params.set('charter_type', filters.charter_type.join(','));
  if (filters.state.length)       params.set('state', filters.state.join(','));
  params.set('active_only', String(filters.active_only));
  params.set('sort_by', filters.sort_by);
  params.set('sort_order', filters.sort_order);
  params.set('limit', '50');
  params.set('offset', String(offset));

  const res = await fetch(`/api/institutions/screen?${params}`);
  if (!res.ok) throw new Error('Screen request failed');
  return res.json();
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold text-surface-500 uppercase tracking-wide mb-2 mt-4 first:mt-0">
      {children}
    </p>
  );
}

function ToggleChip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
        selected
          ? 'bg-primary-600 text-white border-primary-600'
          : 'bg-white text-surface-600 border-surface-300 hover:bg-surface-50'
      }`}
    >
      {children}
    </button>
  );
}

function sourceBadgeColor(source: string): 'blue' | 'green' | 'purple' | 'indigo' | 'orange' | 'gray' {
  const map: Record<string, 'blue' | 'green' | 'purple' | 'indigo' | 'orange' | 'gray'> = {
    fdic: 'blue',
    ncua: 'green',
    osfi: 'indigo',
    rpaa: 'purple',
    ciro: 'orange',
    fintrac: 'gray',
    fincen: 'gray',
  };
  return map[source] ?? 'gray';
}

function craBadge(raw_data: Record<string, unknown> | null) {
  if (!raw_data) return null;
  const rating = Number(raw_data['CRARA']);
  if (!rating) return null;
  const configs: Record<number, { label: string; color: 'green' | 'blue' | 'yellow' | 'red' }> = {
    1: { label: 'Outstanding', color: 'green' },
    2: { label: 'Satisfactory', color: 'blue' },
    3: { label: 'Needs Improve', color: 'yellow' },
    4: { label: 'Non-Compliance', color: 'red' },
  };
  const cfg = configs[rating];
  if (!cfg) return null;
  return <Badge color={cfg.color}>{cfg.label}</Badge>;
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function ScreenerPage() {
  const [draftFilters, setDraftFilters] = useState<ScreenerFilters>(DEFAULT_FILTERS);
  const [activeFilters, setActiveFilters] = useState<ScreenerFilters | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasRun, setHasRun] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['screener', activeFilters, offset],
    queryFn: () => runScreen(activeFilters!, offset),
    enabled: activeFilters !== null,
    placeholderData: (prev) => prev,
  });

  const handleRunScreen = useCallback(() => {
    setOffset(0);
    setActiveFilters({ ...draftFilters });
    setHasRun(true);
  }, [draftFilters]);

  const handleReset = useCallback(() => {
    setDraftFilters(DEFAULT_FILTERS);
    setActiveFilters(null);
    setOffset(0);
    setHasRun(false);
  }, []);

  const applyPreset = useCallback((preset: Preset) => {
    const next = { ...DEFAULT_FILTERS, ...preset.filters };
    setDraftFilters(next);
    setOffset(0);
    setActiveFilters(next);
    setHasRun(true);
  }, []);

  const updateFilter = useCallback(<K extends keyof ScreenerFilters>(
    key: K,
    value: ScreenerFilters[K],
  ) => {
    setDraftFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const toggleArrayItem = useCallback((
    key: 'source' | 'charter_type' | 'state',
    value: string,
  ) => {
    setDraftFilters((prev) => {
      const arr = prev[key] as string[];
      return {
        ...prev,
        [key]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value],
      };
    });
  }, []);

  const toggleCraRating = useCallback((rating: number) => {
    setDraftFilters((prev) => ({
      ...prev,
      cra_rating: prev.cra_rating.includes(rating)
        ? prev.cra_rating.filter((r) => r !== rating)
        : [...prev.cra_rating, rating],
    }));
  }, []);

  const setAssetPreset = useCallback((min: string, max: string) => {
    setDraftFilters((prev) => ({ ...prev, asset_min: min, asset_max: max }));
  }, []);

  const totalPages = data ? Math.ceil(data.total_count / 50) : 0;
  const currentPage = Math.floor(offset / 50) + 1;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Page header */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-surface-900">Bank Prospect Screener</h1>
        <p className="text-sm text-surface-500 mt-1">
          Find financial institutions matching your criteria — for partnership, acquisition, or competitive analysis.
        </p>
      </div>

      {/* Preset screens */}
      <div className="flex flex-wrap gap-2 mb-6">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => applyPreset(preset)}
            title={preset.description}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-surface-300 bg-white text-sm font-medium text-surface-700 hover:bg-primary-50 hover:border-primary-300 hover:text-primary-700 transition-colors shadow-sm"
          >
            <span>{preset.emoji}</span>
            {preset.label}
          </button>
        ))}
      </div>

      <div className="flex gap-6 items-start">
        {/* ── Left sidebar: filter form ── */}
        <aside className="w-64 shrink-0">
          <div className="sticky top-20 bg-white rounded-xl border border-surface-200 shadow-sm p-4 space-y-1 max-h-[calc(100vh-120px)] overflow-y-auto">

            {/* 1. Size */}
            <SectionLabel>Size</SectionLabel>
            <div className="flex flex-wrap gap-1 mb-2">
              {ASSET_PRESETS.map((p) => (
                <ToggleChip
                  key={p.label}
                  selected={draftFilters.asset_min === p.min && draftFilters.asset_max === p.max}
                  onClick={() => setAssetPreset(p.min, p.max)}
                >
                  {p.label}
                </ToggleChip>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-surface-500 mb-1 block">Assets min ($)</label>
                <Input
                  type="number"
                  placeholder="e.g. 100000000"
                  value={draftFilters.asset_min}
                  onChange={(e) => updateFilter('asset_min', e.target.value)}
                  className="text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-surface-500 mb-1 block">Assets max ($)</label>
                <Input
                  type="number"
                  placeholder="e.g. 1000000000"
                  value={draftFilters.asset_max}
                  onChange={(e) => updateFilter('asset_max', e.target.value)}
                  className="text-xs"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <label className="text-xs text-surface-500 mb-1 block">Deposits min ($)</label>
                <Input
                  type="number"
                  placeholder="optional"
                  value={draftFilters.deposit_min}
                  onChange={(e) => updateFilter('deposit_min', e.target.value)}
                  className="text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-surface-500 mb-1 block">Deposits max ($)</label>
                <Input
                  type="number"
                  placeholder="optional"
                  value={draftFilters.deposit_max}
                  onChange={(e) => updateFilter('deposit_max', e.target.value)}
                  className="text-xs"
                />
              </div>
            </div>

            {/* 2. Performance */}
            <SectionLabel>Performance</SectionLabel>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-surface-500 mb-1 block">ROA min (%)</label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="e.g. 0.5"
                  value={draftFilters.roa_min}
                  onChange={(e) => updateFilter('roa_min', e.target.value)}
                  className="text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-surface-500 mb-1 block">ROA max (%)</label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="optional"
                  value={draftFilters.roa_max}
                  onChange={(e) => updateFilter('roa_max', e.target.value)}
                  className="text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-surface-500 mb-1 block">ROE min (%)</label>
                <Input
                  type="number"
                  step="1"
                  placeholder="e.g. 8"
                  value={draftFilters.roe_min}
                  onChange={(e) => updateFilter('roe_min', e.target.value)}
                  className="text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-surface-500 mb-1 block">ROE max (%)</label>
                <Input
                  type="number"
                  step="1"
                  placeholder="optional"
                  value={draftFilters.roe_max}
                  onChange={(e) => updateFilter('roe_max', e.target.value)}
                  className="text-xs"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-surface-500 mb-1 block">Equity/Assets min (%)</label>
                <Input
                  type="number"
                  step="0.5"
                  placeholder="e.g. 8"
                  value={draftFilters.equity_ratio_min}
                  onChange={(e) => updateFilter('equity_ratio_min', e.target.value)}
                  className="text-xs"
                />
              </div>
            </div>

            {/* 3. Lending */}
            <SectionLabel>Lending</SectionLabel>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-surface-500 mb-1 block">LDR min (%)</label>
                <Input
                  type="number"
                  step="1"
                  placeholder="e.g. 60"
                  value={draftFilters.loan_to_deposit_min}
                  onChange={(e) => updateFilter('loan_to_deposit_min', e.target.value)}
                  className="text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-surface-500 mb-1 block">LDR max (%)</label>
                <Input
                  type="number"
                  step="1"
                  placeholder="e.g. 100"
                  value={draftFilters.loan_to_deposit_max}
                  onChange={(e) => updateFilter('loan_to_deposit_max', e.target.value)}
                  className="text-xs"
                />
              </div>
            </div>
            <div className="mt-2">
              <label className="text-xs text-surface-500 mb-1 block">CC Program</label>
              <div className="flex gap-2">
                {[
                  { val: '' as const, label: 'Any' },
                  { val: 'true' as const, label: 'Has CC' },
                  { val: 'false' as const, label: 'No CC' },
                ].map((opt) => (
                  <ToggleChip
                    key={opt.val}
                    selected={draftFilters.cc_program === opt.val}
                    onClick={() => updateFilter('cc_program', opt.val)}
                  >
                    {opt.label}
                  </ToggleChip>
                ))}
              </div>
            </div>
            {draftFilters.cc_program === 'true' && (
              <div className="mt-2">
                <label className="text-xs text-surface-500 mb-1 block">CC Receivables min ($)</label>
                <Input
                  type="number"
                  placeholder="e.g. 1000000"
                  value={draftFilters.cc_min}
                  onChange={(e) => updateFilter('cc_min', e.target.value)}
                  className="text-xs"
                />
              </div>
            )}

            {/* 4. Growth */}
            <SectionLabel>Growth</SectionLabel>
            <div>
              <label className="text-xs text-surface-500 mb-1 block">Deposit Growth YoY min (%)</label>
              <Input
                type="number"
                step="1"
                placeholder="e.g. 5"
                value={draftFilters.deposit_growth_min}
                onChange={(e) => updateFilter('deposit_growth_min', e.target.value)}
                className="text-xs"
              />
              <p className="text-xs text-surface-400 mt-1">Requires financial history data</p>
            </div>

            {/* 5. Regulatory */}
            <SectionLabel>Regulatory</SectionLabel>
            <div>
              <label className="text-xs text-surface-500 mb-1.5 block">CRA Rating</label>
              <div className="space-y-1">
                {CRA_OPTIONS.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded border-surface-300 text-primary-600 focus:ring-primary-500"
                      checked={draftFilters.cra_rating.includes(opt.value)}
                      onChange={() => toggleCraRating(opt.value)}
                    />
                    <span className="text-xs text-surface-700">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="mt-3">
              <label className="text-xs text-surface-500 mb-1.5 block">Data Source</label>
              <div className="flex flex-wrap gap-1">
                {SOURCE_OPTIONS.map((opt) => (
                  <ToggleChip
                    key={opt.value}
                    selected={draftFilters.source.includes(opt.value)}
                    onClick={() => toggleArrayItem('source', opt.value)}
                  >
                    {opt.label}
                  </ToggleChip>
                ))}
              </div>
            </div>

            {/* 6. Geography */}
            <SectionLabel>Geography</SectionLabel>
            <div className="max-h-36 overflow-y-auto border border-surface-200 rounded-lg p-2 space-y-0.5">
              {ALL_STATES.map((s) => (
                <label key={s.code} className="flex items-center gap-2 cursor-pointer py-0.5">
                  <input
                    type="checkbox"
                    className="rounded border-surface-300 text-primary-600 focus:ring-primary-500"
                    checked={draftFilters.state.includes(s.code)}
                    onChange={() => toggleArrayItem('state', s.code)}
                  />
                  <span className="text-xs text-surface-700">{s.code} — {s.name}</span>
                </label>
              ))}
            </div>

            {/* 7. Type */}
            <SectionLabel>Institution Type</SectionLabel>
            <div className="flex flex-wrap gap-1">
              {CHARTER_OPTIONS.map((opt) => (
                <ToggleChip
                  key={opt.value}
                  selected={draftFilters.charter_type.includes(opt.value)}
                  onClick={() => toggleArrayItem('charter_type', opt.value)}
                >
                  {opt.label}
                </ToggleChip>
              ))}
            </div>

            {/* Active only */}
            <div className="mt-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded border-surface-300 text-primary-600 focus:ring-primary-500"
                  checked={draftFilters.active_only}
                  onChange={(e) => updateFilter('active_only', e.target.checked)}
                />
                <span className="text-xs text-surface-700">Active institutions only</span>
              </label>
            </div>

            {/* Actions */}
            <div className="pt-4 space-y-2 border-t border-surface-100 mt-4">
              <Button
                variant="primary"
                size="md"
                className="w-full"
                onClick={handleRunScreen}
              >
                <Search className="h-4 w-4" />
                Run Screen
              </Button>
              <button
                type="button"
                onClick={handleReset}
                className="w-full text-xs text-surface-500 hover:text-surface-700 flex items-center justify-center gap-1 py-1"
              >
                <RotateCcw className="h-3 w-3" />
                Reset all filters
              </button>
            </div>
          </div>
        </aside>

        {/* ── Right: results ── */}
        <div className="flex-1 min-w-0">
          {/* Results header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              {hasRun && (
                <span className="text-sm font-medium text-surface-900">
                  {isLoading
                    ? 'Searching…'
                    : error
                    ? 'Error loading results'
                    : `${(data?.total_count ?? 0).toLocaleString()} institutions match`}
                </span>
              )}
              {!hasRun && (
                <span className="text-sm text-surface-500 flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4" />
                  Set filters and click Run Screen
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* Sort */}
              {hasRun && (
                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-surface-500 whitespace-nowrap">Sort by</label>
                  <select
                    value={draftFilters.sort_by}
                    onChange={(e) => updateFilter('sort_by', e.target.value)}
                    className="text-xs border border-surface-300 rounded-lg px-2 py-1.5 text-surface-700 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  >
                    {SORT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <select
                    value={draftFilters.sort_order}
                    onChange={(e) => updateFilter('sort_order', e.target.value as 'asc' | 'desc')}
                    className="text-xs border border-surface-300 rounded-lg px-2 py-1.5 text-surface-700 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  >
                    <option value="desc">Desc</option>
                    <option value="asc">Asc</option>
                  </select>
                </div>
              )}
              <Button
                variant="secondary"
                size="sm"
                disabled={!data?.institutions?.length}
                onClick={() => exportSearchResultsToExcel(data?.institutions ?? [])}
                className="shrink-0"
              >
                <Download className="h-4 w-4" />
                Export to Excel
              </Button>
            </div>
          </div>

          {/* Results table */}
          {isLoading && !data ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-20 bg-white rounded-xl border border-surface-200">
              <p className="text-red-600 text-sm font-medium">Failed to load results. Please try again.</p>
            </div>
          ) : !hasRun ? (
            <div className="text-center py-24 bg-white rounded-xl border border-surface-200 border-dashed">
              <SlidersHorizontal className="h-10 w-10 text-surface-300 mx-auto mb-3" />
              <p className="text-surface-500 font-medium">Choose a preset or configure filters</p>
              <p className="text-surface-400 text-sm mt-1">Then click Run Screen to find matching institutions</p>
            </div>
          ) : data?.institutions.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-xl border border-surface-200">
              <p className="text-surface-600 font-medium">No institutions match your criteria</p>
              <p className="text-surface-400 text-sm mt-2">Try relaxing some filters — for example, widen the asset range or remove a performance requirement.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-surface-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-surface-200 bg-surface-50">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wide">Institution</th>
                      <th className="text-left px-3 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wide">Source</th>
                      <th className="text-left px-3 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wide">State</th>
                      <th className="text-right px-3 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wide">Total Assets</th>
                      <th className="text-right px-3 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wide">Deposits</th>
                      <th className="text-right px-3 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wide">ROA</th>
                      <th className="text-right px-3 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wide">ROE</th>
                      <th className="text-right px-3 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wide">CC Recv.</th>
                      <th className="text-left px-3 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wide">CRA</th>
                      <th className="text-center px-3 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wide">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100">
                    {data?.institutions.map((inst) => (
                      <tr key={inst.id} className="hover:bg-surface-50 transition-colors">
                        <td className="px-4 py-3">
                          <Link
                            to={`/institution/${inst.cert_number}`}
                            className="font-medium text-primary-700 hover:text-primary-900 hover:underline"
                          >
                            {inst.name}
                          </Link>
                          {inst.city && (
                            <p className="text-xs text-surface-400 mt-0.5">{inst.city}</p>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <Badge color={sourceBadgeColor(inst.source)}>
                            {inst.source.toUpperCase()}
                          </Badge>
                        </td>
                        <td className="px-3 py-3 text-surface-600">{inst.state ?? '—'}</td>
                        <td className="px-3 py-3 text-right font-mono text-surface-800">
                          {formatCurrency(inst.total_assets)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-surface-600">
                          {formatCurrency(inst.total_deposits)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono">
                          <span className={inst.roa != null && inst.roa > 0 ? 'text-green-700' : 'text-surface-500'}>
                            {formatPercent(inst.roa)}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right font-mono">
                          <span className={inst.roi != null && inst.roi > 0 ? 'text-green-700' : 'text-surface-500'}>
                            {formatPercent(inst.roi)}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-surface-600">
                          {inst.credit_card_loans ? formatCurrency(inst.credit_card_loans) : '—'}
                        </td>
                        <td className="px-3 py-3">
                          {craBadge(inst.raw_data)}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <Badge color={inst.active ? 'green' : 'gray'}>
                            {inst.active ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-sm text-surface-500">
                Page {currentPage} of {totalPages} &middot; {(data?.total_count ?? 0).toLocaleString()} total
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={offset === 0}
                  onClick={() => {
                    const newOffset = Math.max(0, offset - 50);
                    setOffset(newOffset);
                  }}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => {
                    setOffset(offset + 50);
                  }}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
