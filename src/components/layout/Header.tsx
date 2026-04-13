import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router';
import { Menu, X, Search, Bookmark, ChevronDown, Network, BarChart3, Compass, Database, FileCheck, Layers } from 'lucide-react';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useCommandBar } from '@/components/command-bar/CommandBarProvider';

function WhaleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 C12 5, 10 5, 10 7" />
      <path d="M14 2 C14 4, 12 5, 12 7" />
      <ellipse cx="12" cy="14" rx="9" ry="6" fill="currentColor" opacity="0.15" />
      <path d="M3 14 C3 10, 7 8, 13 8 C18 8, 21 10, 21 14 C21 18, 17 20, 12 20 C7 20, 3 18, 3 14Z" />
      <circle cx="17" cy="13" r="1" fill="currentColor" />
      <path d="M3 14 C1 11, 1 9, 3 8" />
      <path d="M3 14 C1 17, 1 19, 3 20" />
      <path d="M19 15.5 C17 16, 14 16, 12 15.5" />
    </svg>
  );
}

const PRIMARY_NAV = [
  { to: '/explore', label: 'Explore', Icon: Compass },
  { to: '/analytics', label: 'Analytics', Icon: BarChart3 },
  { to: '/graph', label: 'Graph', Icon: Network },
  { to: '/entities', label: 'Entities', Icon: Layers },
];

const MORE_NAV = [
  { to: '/sources', label: 'Data Sources', Icon: Database },
  { to: '/audit', label: 'Audit', Icon: FileCheck },
];

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const { watchlist } = useWatchlist();
  const { open: openCommandBar } = useCommandBar();

  // Close "more" dropdown on outside click
  useEffect(() => {
    if (!moreOpen) return;
    function handleClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [moreOpen]);

  // Close "more" dropdown on route change
  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  const isMoreActive = MORE_NAV.some(l => location.pathname === l.to);

  return (
    <header className="sticky top-0 z-50 bg-surface-900/80 backdrop-blur-xl border-b border-surface-700/50">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center h-14 gap-1">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 shrink-0 group mr-6">
            <WhaleIcon className="h-6 w-6 text-primary-400 group-hover:text-primary-300 transition-colors" />
            <span className="text-base font-bold tracking-tight text-surface-100">
              Moby
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-0.5 flex-1">
            {PRIMARY_NAV.map(({ to, label, Icon }) => (
              <Link
                key={to}
                to={to}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
                  location.pathname === to || (to === '/explore' && location.pathname.startsWith('/explore'))
                    ? 'bg-primary-500/15 text-primary-300'
                    : 'text-surface-400 hover:text-surface-200 hover:bg-surface-800/80'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </Link>
            ))}

            {/* More dropdown */}
            <div className="relative" ref={moreRef}>
              <button
                type="button"
                onClick={() => setMoreOpen(!moreOpen)}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
                  isMoreActive
                    ? 'bg-primary-500/15 text-primary-300'
                    : 'text-surface-500 hover:text-surface-200 hover:bg-surface-800/80'
                }`}
              >
                More
                <ChevronDown className={`h-3 w-3 transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
              </button>
              {moreOpen && (
                <div className="absolute top-full left-0 mt-1.5 w-44 rounded-xl bg-surface-800 border border-surface-700/50 shadow-xl shadow-black/10 py-1.5 z-50">
                  {MORE_NAV.map(({ to, label, Icon }) => (
                    <Link
                      key={to}
                      to={to}
                      className={`flex items-center gap-2.5 px-3.5 py-2 text-sm transition-colors ${
                        location.pathname === to
                          ? 'text-primary-300 bg-primary-500/10'
                          : 'text-surface-300 hover:text-surface-100 hover:bg-surface-700/50'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5 text-surface-500" />
                      {label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </nav>

          {/* Right-side utilities */}
          <div className="hidden md:flex items-center gap-1.5 ml-auto">
            {/* Watchlist icon */}
            <Link
              to="/watchlist"
              className={`relative inline-flex items-center justify-center h-8 w-8 rounded-lg transition-colors ${
                location.pathname === '/watchlist'
                  ? 'bg-primary-500/15 text-primary-300'
                  : 'text-surface-400 hover:text-surface-200 hover:bg-surface-800'
              }`}
              title="Watchlist"
            >
              <Bookmark className="h-4 w-4" />
              {watchlist.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center h-4 min-w-[1rem] rounded-full bg-amber-500/90 text-[10px] font-bold text-white px-1">
                  {watchlist.length}
                </span>
              )}
            </Link>

            {/* Search trigger */}
            <button
              onClick={openCommandBar}
              aria-label="Open search (Cmd+K)"
              className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm transition-all border border-surface-700 text-surface-500 hover:text-surface-200 hover:border-surface-600 hover:bg-surface-800"
            >
              <Search className="h-3.5 w-3.5" />
              <kbd className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-surface-800 text-surface-500 border border-surface-700">
                ⌘K
              </kbd>
            </button>
          </div>

          {/* Mobile: search + menu */}
          <div className="flex md:hidden items-center gap-1 ml-auto">
            <button
              onClick={openCommandBar}
              className="p-2 rounded-lg text-surface-400 hover:text-surface-100 hover:bg-surface-800"
              aria-label="Search"
            >
              <Search className="h-5 w-5" />
            </button>
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="p-2 rounded-lg text-surface-400 hover:text-surface-100 hover:bg-surface-800"
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <div className="md:hidden border-t border-surface-700/50 bg-surface-900/95 backdrop-blur-xl">
          <nav className="px-4 py-3 space-y-1">
            {[...PRIMARY_NAV, ...MORE_NAV].map(({ to, label, Icon }) => (
              <Link
                key={to}
                to={to}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium ${
                  location.pathname === to
                    ? 'bg-primary-500/15 text-primary-300'
                    : 'text-surface-400 hover:text-surface-100 hover:bg-surface-800'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
            <Link
              to="/watchlist"
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium ${
                location.pathname === '/watchlist'
                  ? 'bg-primary-500/15 text-primary-300'
                  : 'text-surface-400 hover:text-surface-100 hover:bg-surface-800'
              }`}
            >
              <Bookmark className="h-4 w-4" />
              Watchlist
              {watchlist.length > 0 && (
                <span className="inline-flex items-center justify-center rounded-full bg-amber-50 text-amber-600 text-[10px] font-bold px-1.5 py-0.5 min-w-[1.25rem]">
                  {watchlist.length}
                </span>
              )}
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
