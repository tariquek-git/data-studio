import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { Menu, X, Database, ExternalLink } from 'lucide-react';
import { useWatchlist } from '@/hooks/useWatchlist';

const NAV_LINKS = [
  { to: '/search', label: 'Search' },
  { to: '/screen', label: 'Screener' },
  { to: '/compare', label: 'Compare' },
  { to: '/market', label: 'Market Map' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/sources', label: 'Sources' },
];

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { watchlist } = useWatchlist();

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-surface-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 shrink-0">
            <Database className="h-6 w-6 text-primary-600" />
            <span className="text-lg font-semibold text-surface-900">
              Fintech Commons
            </span>
            <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary-100 text-primary-700">
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
                    ? 'bg-primary-50 text-primary-700'
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
                  ? 'bg-primary-50 text-primary-700'
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
            <a
              href="https://fintechcommons.com"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-primary-600 hover:text-primary-700 hover:bg-primary-50 transition-colors"
            >
              fintechcommons.com
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </nav>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 rounded-lg text-surface-500 hover:text-surface-700 hover:bg-surface-100"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <div className="md:hidden border-t border-surface-200 bg-white">
          <nav className="px-4 py-3 space-y-1">
            {NAV_LINKS.map(link => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setMobileOpen(false)}
                className={`block px-3 py-2 rounded-lg text-sm font-medium ${
                  location.pathname === link.to
                    ? 'bg-primary-50 text-primary-700'
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
                  ? 'bg-primary-50 text-primary-700'
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
            <a
              href="https://fintechcommons.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-primary-600 hover:bg-primary-50"
            >
              fintechcommons.com
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </nav>
        </div>
      )}
    </header>
  );
}
