import { Badge } from '@/components/ui';
import type { EntitySourceRecord } from '@/types/entity';
import { TerminalCard } from './EntityShell';

interface EntitySourceListProps {
  sources: EntitySourceRecord[];
}

export function EntitySourceList({ sources }: EntitySourceListProps) {
  return (
    <TerminalCard
      title="Source Provenance"
      subtitle="Official, company, and curated evidence attached to this profile."
    >
      {sources.length > 0 ? (
        <div className="space-y-3">
          {sources.map((source) => (
            <div
              key={`${source.authority}-${source.label}-${source.freshness ?? ''}`}
              className="rounded-xl border border-slate-700 bg-slate-950/70 p-4"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      color={source.source_kind === 'official' ? 'green' : source.source_kind === 'company' ? 'blue' : 'yellow'}
                      className="bg-slate-800 text-slate-100 ring-slate-700"
                    >
                      {source.source_kind}
                    </Badge>
                    <p className="text-sm font-semibold text-white">{source.label}</p>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{source.authority}</p>
                </div>
                <div className="text-right text-xs text-slate-500">
                  <p>{source.confidence_label}</p>
                  <p>{source.freshness ?? 'No freshness timestamp'}</p>
                </div>
              </div>
              {source.notes && (
                <p className="mt-3 text-xs leading-relaxed text-slate-400">
                  {source.notes}
                </p>
              )}
              {source.url && (
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex text-xs font-medium text-cyan-300 hover:text-cyan-200"
                >
                  Open source
                </a>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-700 p-6 text-sm text-slate-400">
          No provenance records are available yet.
        </div>
      )}
    </TerminalCard>
  );
}
