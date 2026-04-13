import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { Menu, X, Database, Search } from 'lucide-react';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useCommandBar } from '@/components/command-bar/CommandBarProvider';

const NAV_LINKS = [
  { to: '/explore', label: 'Explore' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/brim', label: 'Brim BD' },
  { to: '/compare', label: 'Compare' },
  { to: '/geo', label: 'Geo Map' },
  { to: '/graph', label: 'Graph' },
  { to: '/entities', label: 'Entities' },
  { to: '/sources', label: 'Sources' },
];

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { watchlist } = useWatchlist();
  const { open: openCommandBar } = useCommandBar();
  const isTerminalRoute = location.pathname.startsWith('/entities');

  return (
    <header className={`sticky top-0 z-50 backdrop-blur border-b ${
      isTerminalRoute
        ? 'bg-slate-950/90 border-slate-800'
        : 'bg-white/95 border-surface-200'
    }`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 shrink-0">
            <Database className={`h-6 w-6 ${isTerminalRoute ? 'text-cyan-400' : 'text-primary-600'}`} />
            <span className={`text-lg font-semibold ${isTerminalRoute ? 'text-white' : 'text-surface-900'}`}>
              Data Studio
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map(link => (
              <Link
                key={link.to}
                to={link.to}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  location.pathname === link.to
                    ? isTerminalRoute
                      ? 'bg-cyan-950/70 text-cyan-200'
                      : 'bg-primary-50 text-primary-700'
                    : isTerminalRoute
                      ? 'text-slate-300 hover:text-white hover:bg-slate-900'
                      : 'text-surface-600 hover:text-surface-900 hover:bg-surface-100'
                }`}
              >
                {link.label}
              </Link>
            ))}
            <Link
              to="/watchlist"
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                location.pathname === '/watchlist'
                  ? isTerminalRoute
                    ? 'bg-cyan-950/70 text-cyan-200'
                    : 'bg-primary-50 text-primary-700'
                  : isTerminalRoute
                    ? 'text-slate-300 hover:text-white hover:bg-slate-900'
                    : 'text-surface-600 hover:text-surface-900 hover:bg-surface-100'
              }`}
            >
              Watchlist
              {watchlist.length > 0 && (
                <span className="inline-flex items-center justify-center rounded-full bg-amber-100 text-amber-700 text-xs font-medium px-1.5 py-0.5 min-w-[1.25rem]">
                  {watchlist.length}
                </span>
              )}
            </Link>
          </nav>

          {/* Command Bar trigger */}
          <button
            onClick={openCommandBar}
            aria-label="Open search (Cmd+K)"
            className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors border ${
              isTerminalRoute
                ? 'border-slate-700 text-slate-400 hover:text-white hover:bg-slate-900'
                : 'border-surface-200 text-surface-500 hover:text-surface-700 hover:bg-surface-50'
            }`}
          >
            <Search className="h-3.5 w-3.5" />
            <span>Search</span>
            <kbd className={`ml-1 px-1.5 py-0.5 rounded text-xs font-mono ${
              isTerminalRoute ? 'bg-slate-800 text-slate-400' : 'bg-surface-100 text-surface-500'
            }`}>
              ⌘K
            </kbd>
          </button>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className={`md:hidden p-2 rounded-lg ${
              isTerminalRoute
                ? 'text-slate-400 hover:text-white hover:bg-slate-900'
                : 'text-surface-500 hover:text-surface-700 hover:bg-surface-100'
            }`}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <div className={`md:hidden border-t ${
          isTerminalRoute ? 'border-slate-800 bg-slate-950' : 'border-surface-200 bg-white'
        }`}>
          <nav className="px-4 py-3 space-y-1">
            {NAV_LINKS.map(link => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setMobileOpen(false)}
                className={`block px-3 py-2 rounded-lg text-sm font-medium ${
                  location.pathname === link.to
                    ? isTerminalRoute
                      ? 'bg-cyan-950/70 text-cyan-200'
                      : 'bg-primary-50 text-primary-700'
                    : isTerminalRoute
                      ? 'text-slate-300 hover:text-white hover:bg-slate-900'
                      : 'text-surface-600 hover:text-surface-900 hover:bg-surface-100'
                }`}
              >
                {link.label}
              </Link>
            ))}
            <Link
              to="/watchlist"
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
                location.pathname === '/watchlist'
                  ? isTerminalRoute
                    ? 'bg-cyan-950/70 text-cyan-200'
                    : 'bg-primary-50 text-primary-700'
                  : isTerminalRoute
                    ? 'text-slate-300 hover:text-white hover:bg-slate-900'
                    : 'text-surface-600 hover:text-surface-900 hover:bg-surface-100'
              }`}
            >
              Watchlist
              {watchlist.length > 0 && (
                <span className="inline-flex items-center justify-center rounded-full bg-amber-100 text-amber-700 text-xs font-medium px-1.5 py-0.5 min-w-[1.25rem]">
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
