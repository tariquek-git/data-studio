import { Link } from 'react-router';

export function Footer() {
  return (
    <footer className="border-t border-surface-700/50 bg-surface-950">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Branding */}
          <div>
            <p className="text-sm font-bold text-surface-200">Nexus</p>
            <p className="text-xs mt-1 italic text-surface-600">
              Where institutions connect. Mapping the financial universe, one node at a time.
            </p>
          </div>

          {/* Research tools */}
          <div>
            <p className="text-xs font-medium mb-2 text-surface-400 uppercase tracking-wider">Research Tools</p>
            <ul className="space-y-1.5">
              <li>
                <Link to="/failures" className="text-sm text-surface-500 hover:text-primary-400 transition-colors">
                  FDIC Bank Failures
                </Link>
              </li>
              <li>
                <Link to="/analytics" className="text-sm text-surface-500 hover:text-primary-400 transition-colors">
                  Industry Analytics
                </Link>
              </li>
            </ul>
          </div>

          {/* Data sources */}
          <div>
            <p className="text-xs font-medium mb-2 text-surface-400 uppercase tracking-wider">Data Sources</p>
            <p className="text-sm text-surface-500">
              Data sourced from FDIC, NCUA, OSFI, and Bank of Canada
            </p>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-surface-700/50">
          <p className="text-xs text-center text-surface-600">
            &copy; {new Date().getFullYear()} Nexus. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
