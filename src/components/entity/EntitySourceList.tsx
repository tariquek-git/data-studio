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
      className="border-slate-200 bg-white shadow-xl shadow-slate-200/50"
    >
      {sources.length > 0 ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
              <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Evidence records</p>
              <p className="mt-2 text-xl font-semibold text-slate-900">{sources.length}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
              <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Official anchors</p>
              <p className="mt-2 text-xl font-semibold text-slate-900">{officialCount}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
              <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Evidence posture</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {officialCount > 0 ? 'Primary-source grounded' : 'Curated or company-led'}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {sources.map((source) => (
              <div
                key={`${source.authority}-${source.label}-${source.freshness ?? ''}`}
                className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4"
              >
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        color={sourceColor(source.source_kind)}
                        className="bg-white text-slate-900 ring-slate-200"
                      >
                        {source.source_kind}
                      </Badge>
                      <p className="text-sm font-semibold text-slate-900">{source.label}</p>
                    </div>
                    <p className="text-xs text-slate-500">{source.authority}</p>
                    {source.notes && (
                      <p className="text-xs leading-relaxed text-slate-500">
                        {source.notes}
                      </p>
                    )}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 xl:w-[260px] xl:grid-cols-1">
                    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Confidence</p>
                      <p className="mt-1 text-xs text-slate-700">{source.confidence_label}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Freshness</p>
                      <p className="mt-1 text-xs text-slate-700">{source.freshness ?? 'No timestamp'}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    provenance attached
                  </span>
                  {source.url && (
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-cyan-600 hover:text-cyan-600"
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
        <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">
          No provenance records are available yet.
        </div>
      )}
    </TerminalCard>
  );
}
