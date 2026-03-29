import { ExternalLink } from 'lucide-react';
import { TerminalCard } from './EntityShell';
import type { EntityContextSection } from '@/types/entity';

interface EntityContextSectionProps {
  section: EntityContextSection;
}

const sectionTone = ['default', 'positive', 'caution', 'critical'] as const;
type SectionTone = (typeof sectionTone)[number];

const toneClasses: Record<SectionTone, string> = {
  default: 'bg-slate-800 text-slate-100 ring-slate-700',
  positive: 'bg-emerald-950 text-emerald-200 ring-emerald-800',
  caution: 'bg-amber-950 text-amber-200 ring-amber-800',
  critical: 'bg-rose-950 text-rose-200 ring-rose-800',
};

export function EntityContextSectionCard({ section }: EntityContextSectionProps) {
  return (
    <TerminalCard title={section.title} subtitle={section.summary}>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {section.items.length > 0 ? (
          section.items.map((item) => {
            const tone = item.tone ?? 'default';
            return (
              <div
                key={`${section.key}-${item.label}-${item.value}`}
                className={`rounded-xl border p-3 ${toneClasses[tone]} ${item.url ? 'hover:border-slate-400 transition-colors' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
                      {item.label}
                    </p>
                    <p className="mt-1 text-sm font-medium leading-snug text-white">{item.value}</p>
                  </div>
                  {item.url && (
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-slate-300 hover:text-white">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="rounded-xl border border-dashed border-slate-700 p-4 text-sm text-slate-400">
            No items in this section yet.
          </div>
        )}
      </div>
    </TerminalCard>
  );
}
