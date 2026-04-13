import { useNavigate } from 'react-router';
import { X, GitCompare, Download } from 'lucide-react';
import { useExploreStore } from '@/stores/exploreStore';
import { exportSearchResultsToExcel } from '@/lib/export';
import type { Institution } from '@/types/institution';

interface ExploreWorkingSetProps {
  allInstitutions: Institution[];
}

export function ExploreWorkingSet({ allInstitutions }: ExploreWorkingSetProps) {
  const store = useExploreStore();
  const navigate = useNavigate();

  const { workingSet } = store;

  if (workingSet.length === 0) return null;

  function handleCompare() {
    const certNums = workingSet.map((w) => w.certNumber).join(',');
    navigate(`/compare?certs=${certNums}`);
  }

  function handleExport() {
    const toExport = allInstitutions.filter((i) =>
      workingSet.some((w) => w.certNumber === i.cert_number),
    );
    exportSearchResultsToExcel(toExport);
  }

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 bg-surface-900/95 backdrop-blur-xl border-t border-surface-700/50 shadow-lg shadow-black/10 px-4 py-3"
      style={{ animation: 'slideUp 200ms ease-out' }}
    >
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
      <div className="max-w-7xl mx-auto flex items-center gap-3 flex-wrap">
        <span className="text-xs font-semibold text-surface-500 uppercase tracking-wider shrink-0">
          Working Set
        </span>

        {/* Chips */}
        <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
          {workingSet.map((item) => (
            <span
              key={item.certNumber}
              className="inline-flex items-center gap-1 bg-primary-500/15 text-primary-300 rounded-full px-3 py-1 text-xs font-medium border border-primary-500/20"
            >
              {item.name}
              <button
                type="button"
                onClick={() => store.removeFromWorkingSet(item.certNumber)}
                className="ml-0.5 hover:text-primary-100 transition-colors"
                aria-label={`Remove ${item.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCompare}
            disabled={workingSet.length < 2}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-500 text-white text-xs font-medium hover:bg-primary-400 transition-colors disabled:opacity-40 disabled:pointer-events-none shadow-sm shadow-primary-500/20"
          >
            <GitCompare className="h-3.5 w-3.5" />
            Compare
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-surface-700 text-xs font-medium text-surface-300 hover:text-surface-100 hover:bg-surface-800 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </button>
          <button
            type="button"
            onClick={() => store.clearWorkingSet()}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-surface-700 text-xs font-medium text-surface-500 hover:text-red-500 hover:border-red-500/30 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}
