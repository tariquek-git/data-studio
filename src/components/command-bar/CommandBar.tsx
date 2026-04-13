import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type KeyboardEvent,
} from 'react';
import { useNavigate } from 'react-router';
import { Search, Compass, GitCompare, Map, Sparkles, X } from 'lucide-react';
import { useCommandBar } from './CommandBarProvider';
import { useCommandBarSearch, type CommandBarAction } from './useCommandBarSearch';
import type { Institution } from '@/types/institution';

// ─── Suggested queries ────────────────────────────────────────────────────────

const SUGGESTED_QUERIES = [
  'Banks in Texas over $1B',
  'BaaS sponsor banks',
  'Credit card issuers in California',
  'Largest credit unions',
  'Compare TD Bank and RBC',
];

// ─── Formatting helpers ───────────────────────────────────────────────────────

function formatAssets(v: number | null): string {
  if (v == null) return '—';
  if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${(v / 1e3).toFixed(0)}K`;
}

function sourceLabel(source: string): string {
  return source.toUpperCase();
}

// ─── Action icon ─────────────────────────────────────────────────────────────

function ActionIcon({ icon }: { icon: CommandBarAction['icon'] }) {
  const cls = 'h-4 w-4 shrink-0 text-blue-500';
  if (icon === 'compare') return <GitCompare className={cls} />;
  if (icon === 'map') return <Map className={cls} />;
  return <Compass className={cls} />;
}

// ─── Result item types for unified keyboard nav ───────────────────────────────

type NavItem =
  | { type: 'institution'; index: number; institution: Institution }
  | { type: 'action'; index: number; action: CommandBarAction };

// ─── Main Component ───────────────────────────────────────────────────────────

export function CommandBar() {
  const { isOpen, close } = useCommandBar();
  const navigate = useNavigate();
  const {
    query,
    setQuery,
    institutions,
    actions,
    aiResult,
    isLoadingInstitutions,
    isLoadingAi,
  } = useCommandBarSearch();

  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [showAi, setShowAi] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Reset state when opened/closed
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(-1);
      setShowAi(false);
      // Focus input on next tick so transition doesn't fight focus
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [isOpen, setQuery]);

  // Animate AI insight in when it arrives
  useEffect(() => {
    if (aiResult) {
      setShowAi(true);
    } else {
      setShowAi(false);
    }
  }, [aiResult]);

  // Build flat list of navigable items
  const navItems: NavItem[] = [
    ...institutions.map((institution, index) => ({
      type: 'institution' as const,
      index,
      institution,
    })),
    ...actions.map((action, index) => ({
      type: 'action' as const,
      index: institutions.length + index,
      action,
    })),
  ];

  const totalItems = navItems.length;

  const selectItem = useCallback(
    (item: NavItem) => {
      if (item.type === 'institution') {
        navigate(`/institution/${item.institution.cert_number}`);
        close();
      } else {
        navigate(item.action.href);
        close();
      }
    },
    [navigate, close]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % Math.max(totalItems, 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => (i <= 0 ? totalItems - 1 : i - 1));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < totalItems) {
          const item = navItems[selectedIndex];
          if (item) selectItem(item);
        } else if (query.trim()) {
          const params = new URLSearchParams({ q: query });
          navigate(`/explore?${params.toString()}`);
          close();
        }
      }
    },
    [close, totalItems, selectedIndex, navItems, selectItem, query, navigate]
  );

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(-1);
  }, [institutions.length, actions.length]);

  // Focus trap: keep focus inside modal
  useEffect(() => {
    if (!isOpen) return;
    function handleFocusTrap(e: FocusEvent) {
      if (!listRef.current) return;
      if (!listRef.current.contains(e.target as Node) &&
          !inputRef.current?.contains(e.target as Node)) {
        inputRef.current?.focus();
      }
    }
    document.addEventListener('focusin', handleFocusTrap);
    return () => document.removeEventListener('focusin', handleFocusTrap);
  }, [isOpen]);

  if (!isOpen) return null;

  const hasResults = institutions.length > 0 || actions.length > 0;

  return (
    <div
      ref={backdropRef}
      className="command-bar-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === backdropRef.current) close();
      }}
    >
      <div
        className="command-bar-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Search"
      >
        {/* Input area */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100">
          <Search className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search institutions, ask a question..."
            aria-label="Search institutions"
            autoComplete="off"
            spellCheck={false}
            className="flex-1 text-lg bg-transparent outline-none text-slate-900 placeholder:text-slate-400"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          {(isLoadingInstitutions || isLoadingAi) && (
            <div
              className="h-4 w-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin"
              aria-label="Loading"
            />
          )}
        </div>

        {/* Suggested query pills */}
        {!query && (
          <div className="px-4 py-3 flex gap-2 overflow-x-auto scrollbar-hide">
            {SUGGESTED_QUERIES.map((sq) => (
              <button
                key={sq}
                onClick={() => setQuery(sq)}
                className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition-colors"
              >
                {sq}
              </button>
            ))}
          </div>
        )}

        {/* Results */}
        {hasResults && (
          <div
            ref={listRef}
            className="overflow-y-auto max-h-96"
            role="listbox"
            aria-label="Search results"
          >
            {/* Institution results */}
            {institutions.length > 0 && (
              <div className="py-1">
                <div className="px-4 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Institutions
                </div>
                {institutions.map((inst, idx) => {
                  const isSelected = selectedIndex === idx;
                  return (
                    <button
                      key={inst.cert_number}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        navigate(`/institution/${inst.cert_number}`);
                        close();
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-slate-900 truncate">
                          {inst.name}
                        </div>
                        <div className="text-sm text-slate-500 truncate">
                          {[inst.city, inst.state].filter(Boolean).join(', ')}
                          {inst.total_assets != null && (
                            <span className="ml-2">{formatAssets(inst.total_assets)}</span>
                          )}
                        </div>
                      </div>
                      {inst.source && (
                        <span className="shrink-0 text-xs font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                          {sourceLabel(inst.source)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Action rows */}
            {actions.length > 0 && (
              <div className="py-1 border-t border-slate-100">
                <div className="px-4 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Actions
                </div>
                {actions.map((action, idx) => {
                  const flatIndex = institutions.length + idx;
                  const isSelected = selectedIndex === flatIndex;
                  return (
                    <button
                      key={action.id}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        navigate(action.href);
                        close();
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <ActionIcon icon={action.icon} />
                      <span className="text-blue-600 font-medium text-sm truncate">
                        {action.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* AI Insight section */}
        {aiResult?.explanation && (
          <div
            className={`mx-4 mb-3 mt-1 rounded-xl p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 transition-all duration-300 ${
              showAi ? 'command-bar-ai-visible' : 'command-bar-ai-hidden'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-blue-500 shrink-0" aria-hidden="true" />
              <span className="text-xs font-semibold text-blue-700 uppercase tracking-wider">
                AI Insight
              </span>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed">
              {aiResult.explanation}
            </p>
            {Object.keys(aiResult.filters).length > 0 && (
              <button
                onClick={() => {
                  const params = new URLSearchParams({ q: query });
                  if (aiResult.filters.states?.length)
                    params.set('states', aiResult.filters.states.join(','));
                  if (aiResult.filters.charter_types?.length)
                    params.set('charter_types', aiResult.filters.charter_types.join(','));
                  if (aiResult.filters.min_assets != null)
                    params.set('min_assets', String(aiResult.filters.min_assets));
                  if (aiResult.filters.max_assets != null)
                    params.set('max_assets', String(aiResult.filters.max_assets));
                  navigate(`/explore?${params.toString()}`);
                  close();
                }}
                className="mt-3 text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors"
              >
                Explore results →
              </button>
            )}
          </div>
        )}

        {/* Empty state */}
        {query.trim().length >= 1 && !hasResults && !isLoadingInstitutions && (
          <div className="px-4 py-8 text-center text-slate-400 text-sm">
            No results for &ldquo;{query}&rdquo;
          </div>
        )}

        {/* Footer: keyboard hints */}
        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-slate-100 text-xs text-slate-400">
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-mono text-xs">↑↓</kbd>
            {' '}navigate
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-mono text-xs">↵</kbd>
            {' '}select
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-mono text-xs">Esc</kbd>
            {' '}close
          </span>
        </div>
      </div>
    </div>
  );
}
