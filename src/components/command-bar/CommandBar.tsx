import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type KeyboardEvent,
} from 'react';
import { useNavigate } from 'react-router';
import { Search, Compass, GitCompare, Map, Sparkles, Target, X } from 'lucide-react';
import { useCommandBar } from './CommandBarProvider';
import { useCommandBarSearch, type CommandBarAction } from './useCommandBarSearch';
import type { Institution } from '@/types/institution';

// ─── Suggested queries ────────────────────────────────────────────────────────

const SUGGESTED_QUERIES = [
  'Banks in Texas over $1B',
  'BaaS sponsor banks',
  'Migration targets',
  'Credit card issuers in California',
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
  const cls = 'h-4 w-4 shrink-0';
  if (icon === 'brim') return <Target className={`${cls} text-violet-500`} />;
  if (icon === 'compare') return <GitCompare className={`${cls} text-blue-500`} />;
  if (icon === 'map') return <Map className={`${cls} text-blue-500`} />;
  return <Compass className={`${cls} text-blue-500`} />;
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
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-surface-700/50">
          <Search className="h-5 w-5 shrink-0 text-surface-400" aria-hidden="true" />
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
            className="flex-1 text-lg bg-transparent outline-none text-surface-100 placeholder:text-surface-500"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 rounded text-surface-400 hover:text-surface-200 hover:bg-surface-700"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          {(isLoadingInstitutions || isLoadingAi) && (
            <div
              className="h-4 w-4 rounded-full border-2 border-primary-400 border-t-transparent animate-spin"
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
                className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium bg-surface-700 text-surface-300 hover:bg-surface-600 hover:text-surface-100 transition-colors"
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
                <div className="px-4 py-1.5 text-xs font-semibold text-surface-500 uppercase tracking-wider">
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
                        isSelected ? 'bg-primary-500/15' : 'hover:bg-surface-700/50'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-surface-100 truncate">
                          {inst.name}
                        </div>
                        <div className="text-sm text-surface-400 truncate">
                          {[inst.city, inst.state].filter(Boolean).join(', ')}
                          {inst.total_assets != null && (
                            <span className="ml-2 text-primary-400">{formatAssets(inst.total_assets)}</span>
                          )}
                        </div>
                      </div>
                      {inst.source && (
                        <span className="shrink-0 text-xs font-medium px-1.5 py-0.5 rounded bg-surface-700 text-surface-400">
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
              <div className="py-1 border-t border-surface-700/50">
                <div className="px-4 py-1.5 text-xs font-semibold text-surface-500 uppercase tracking-wider">
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
                        isSelected ? 'bg-primary-500/15' : 'hover:bg-surface-700/50'
                      }`}
                    >
                      <ActionIcon icon={action.icon} />
                      <span className={`font-medium text-sm truncate ${
                        action.icon === 'brim' ? 'text-violet-600' : 'text-primary-400'
                      }`}>
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
            className={`mx-4 mb-3 mt-1 rounded-xl p-4 bg-gradient-to-r from-primary-500/10 to-violet-500/10 border border-primary-500/20 transition-all duration-300 ${
              showAi ? 'command-bar-ai-visible' : 'command-bar-ai-hidden'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-primary-400 shrink-0" aria-hidden="true" />
              <span className="text-xs font-semibold text-primary-300 uppercase tracking-wider">
                AI Insight
              </span>
            </div>
            <p className="text-sm text-surface-200 leading-relaxed">
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
                className="mt-3 text-sm font-semibold text-primary-400 hover:text-primary-300 transition-colors"
              >
                Explore results →
              </button>
            )}
          </div>
        )}

        {/* Empty state */}
        {query.trim().length >= 1 && !hasResults && !isLoadingInstitutions && (
          <div className="px-4 py-8 text-center text-surface-500 text-sm">
            No results for &ldquo;{query}&rdquo;
          </div>
        )}

        {/* Footer: keyboard hints */}
        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-surface-700/50 text-xs text-surface-500">
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-surface-700 text-surface-400 font-mono text-xs">↑↓</kbd>
            {' '}navigate
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-surface-700 text-surface-400 font-mono text-xs">↵</kbd>
            {' '}select
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-surface-700 text-surface-400 font-mono text-xs">Esc</kbd>
            {' '}close
          </span>
        </div>
      </div>
    </div>
  );
}
