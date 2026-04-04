import { ExternalLink, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui';
import type { EntitySourceRecord } from '@/types/entity';
import { TerminalCard } from './EntityShell';

interface EntitySourceListProps {
  sources: EntitySourceRecord[];
}

function sourceColor(sourceKind: string) {
  if (sourceKind === 'official') return 'green';
  if (sourceKind === 'company') return 'blue';
  return 'yellow';
}

export function EntitySourceList({ sources }: EntitySourceListProps) {
  const officialCount = sources.filter((source) => source.source_kind === 'official').length;

  return (
    <TerminalCard
      title="Evidence Stack"
      subtitle="Source provenance, freshness, and evidence posture attached to this profile."
      className="border-slate-800 bg-slate-950/85 shadow-[0_18px_70px_rgba(2,6,23,0.45)]"
    >
      {sources.length > 0 ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3">
              <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Evidence records</p>
              <p className="mt-2 text-xl font-semibold text-white">{sources.length}</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3">
              <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Official anchors</p>
              <p className="mt-2 text-xl font-semibold text-white">{officialCount}</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3">
              <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Evidence posture</p>
              <p className="mt-2 text-sm font-semibold text-white">
                {officialCount > 0 ? 'Primary-source grounded' : 'Curated or company-led'}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {sources.map((source) => (
              <div
                key={`${source.authority}-${source.label}-${source.freshness ?? ''}`}
                className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4"
              >
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        color={sourceColor(source.source_kind)}
                        className="bg-slate-950 text-slate-100 ring-slate-700"
                      >
                        {source.source_kind}
                      </Badge>
                      <p className="text-sm font-semibold text-white">{source.label}</p>
                    </div>
                    <p className="text-xs text-slate-400">{source.authority}</p>
                    {source.notes && (
                      <p className="text-xs leading-relaxed text-slate-400">
                        {source.notes}
                      </p>
                    )}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 xl:w-[260px] xl:grid-cols-1">
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Confidence</p>
                      <p className="mt-1 text-xs text-slate-300">{source.confidence_label}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Freshness</p>
                      <p className="mt-1 text-xs text-slate-300">{source.freshness ?? 'No timestamp'}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-3 text-xs text-slate-400">
                  <span className="inline-flex items-center gap-1">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    provenance attached
                  </span>
                  {source.url && (
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-cyan-300 hover:text-cyan-200"
                    >
                      Open source
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-700 p-6 text-sm text-slate-400">
          No provenance records are available yet.
        </div>
      )}
    </TerminalCard>
  );
}
