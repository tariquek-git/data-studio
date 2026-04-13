import { Link, useLocation } from 'react-router';

export function Footer() {
  const location = useLocation();
  const isTerminalRoute = location.pathname.startsWith('/entities');

  return (
    <footer className={`border-t ${
      isTerminalRoute ? 'border-slate-800 bg-slate-950 text-slate-100' : 'border-surface-200 bg-white'
    }`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Branding */}
          <div>
            <p className={`text-sm font-bold ${isTerminalRoute ? 'text-white' : 'text-surface-900'}`}>Moby-Data</p>
            <p className={`text-xs mt-1 italic ${isTerminalRoute ? 'text-slate-500' : 'text-surface-400'}`}>
              "Thar she blows!" — Hunt whales. Spearfish prospects. Land the big catch.
            </p>
          </div>

          {/* Research tools */}
          <div>
            <p className={`text-sm font-medium mb-2 ${isTerminalRoute ? 'text-slate-200' : 'text-surface-700'}`}>Research Tools</p>
            <ul className="space-y-1.5">
              <li>
                <Link
                  to="/failures"
                  className={`text-sm transition-colors ${
                    isTerminalRoute
                      ? 'text-slate-400 hover:text-cyan-300'
                      : 'text-surface-500 hover:text-primary-600'
                  }`}
                >
                  FDIC Bank Failures
                </Link>
              </li>
              <li>
                <Link
                  to="/analytics"
                  className={`text-sm transition-colors ${
                    isTerminalRoute
                      ? 'text-slate-400 hover:text-cyan-300'
                      : 'text-surface-500 hover:text-primary-600'
                  }`}
                >
                  Industry Analytics
                </Link>
              </li>
            </ul>
          </div>

          {/* Data sources */}
          <div>
            <p className={`text-sm font-medium mb-2 ${isTerminalRoute ? 'text-slate-200' : 'text-surface-700'}`}>Data Sources</p>
            <p className={`text-sm ${isTerminalRoute ? 'text-slate-400' : 'text-surface-500'}`}>
              Data sourced from FDIC, NCUA, OSFI, and Bank of Canada
            </p>
          </div>
        </div>

        <div className={`mt-8 pt-6 border-t ${isTerminalRoute ? 'border-slate-800' : 'border-surface-100'}`}>
          <p className={`text-xs text-center ${isTerminalRoute ? 'text-slate-500' : 'text-surface-400'}`}>
            &copy; {new Date().getFullYear()} Moby-Data. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
