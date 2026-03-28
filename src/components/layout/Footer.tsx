import { ExternalLink } from 'lucide-react';

export function Footer() {
  return (
    <footer className="border-t border-surface-200 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Branding */}
          <div>
            <p className="text-sm font-medium text-surface-900">Fintech Commons Data Studio</p>
            <p className="mt-1 text-sm text-surface-500">
              Part of the Fintech Commons ecosystem
            </p>
          </div>

          {/* Links */}
          <div>
            <p className="text-sm font-medium text-surface-700 mb-2">Ecosystem</p>
            <ul className="space-y-1.5">
              <li>
                <a
                  href="https://fintechcommons.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-surface-500 hover:text-primary-600 transition-colors"
                >
                  fintechcommons.com <ExternalLink className="h-3 w-3" />
                </a>
              </li>
              <li>
                <a
                  href="https://fintechcommons.com/card-studio"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-surface-500 hover:text-primary-600 transition-colors"
                >
                  Card Studio <ExternalLink className="h-3 w-3" />
                </a>
              </li>
              <li>
                <a
                  href="https://fintechcommons.com/flow-of-funds"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-surface-500 hover:text-primary-600 transition-colors"
                >
                  Flow of Funds <ExternalLink className="h-3 w-3" />
                </a>
              </li>
            </ul>
          </div>

          {/* Data sources */}
          <div>
            <p className="text-sm font-medium text-surface-700 mb-2">Data Sources</p>
            <p className="text-sm text-surface-500">
              Data sourced from FDIC, NCUA, OSFI, and Bank of Canada
            </p>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-surface-100">
          <p className="text-xs text-surface-400 text-center">
            &copy; {new Date().getFullYear()} Fintech Commons. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
