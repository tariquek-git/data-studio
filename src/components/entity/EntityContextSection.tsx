import { ExternalLink } from 'lucide-react';
import { TerminalCard } from './EntityShell';
import type { EntityContextSection } from '@/types/entity';

interface EntityContextSectionProps {
  section: EntityContextSection;
}

const toneClasses = {
  default: 'border-slate-800 bg-slate-950/70 text-slate-100',
  positive: 'border-emerald-900/70 bg-emerald-950/30 text-emerald-100',
  caution: 'border-amber-900/70 bg-amber-950/30 text-amber-100',
  critical: 'border-rose-900/70 bg-rose-950/30 text-rose-100',
} as const;

const sectionThemes: Record<EntityContextSection['key'], { banner: string; copy: string }> = {
  identity: {
    banner: 'border-cyan-500/20 bg-cyan-500/10',
    copy: 'This is the identity layer: who the entity is, where it sits, and how it is classified.',
  },
  regulatory: {
    banner: 'border-emerald-500/20 bg-emerald-500/10',
    copy: 'Regulatory context anchors the entity in supervisory scope, charter footing, and reporting authority.',
  },
  business_model: {
    banner: 'border-amber-500/20 bg-amber-500/10',
    copy: 'Business-model context explains what the entity does in the financial stack and why that matters.',
  },
  financial: {
    banner: 'border-sky-500/20 bg-sky-500/10',
    copy: 'Financial context focuses on balance-sheet and profitability signals exposed in public data.',
  },
  relationships: {
    banner: 'border-fuchsia-500/20 bg-fuchsia-500/10',
    copy: 'Relationship context shows counterparties, sponsorship edges, and graph density around the entity.',
  },
  market: {
    banner: 'border-indigo-500/20 bg-indigo-500/10',
    copy: 'Market context places the entity inside its geography, source class, and cross-border position.',
  },
  sources: {
    banner: 'border-teal-500/20 bg-teal-500/10',
    copy: 'Source context keeps provenance and confidence visible so the profile stays evidence-led.',
  },
  ai: {
    banner: 'border-orange-500/20 bg-orange-500/10',
    copy: 'AI context summarizes what the evidence likely means, while keeping gaps explicit.',
  },
};

export function EntityContextSectionCard({ section }: EntityContextSectionProps) {
  const theme = sectionThemes[section.key];

  return (
    <TerminalCard title={section.title} subtitle={section.summary}>
      <div className={`mb-4 rounded-2xl border p-4 ${theme.banner}`}>
        <p className="text-sm leading-relaxed text-slate-100">{theme.copy}</p>
      </div>

      {section.items.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {section.items.map((item) => {
            const tone = item.tone ?? 'default';
            return (
              <div
                key={`${section.key}-${item.label}-${item.value}`}
                className={`rounded-xl border p-4 transition-colors ${toneClasses[tone]} ${item.url ? 'hover:border-slate-600' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{item.label}</p>
                    <p className="mt-2 text-sm font-medium leading-relaxed text-white">{item.value}</p>
                  </div>
                  {item.url && (
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-slate-300 hover:text-white">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-700 p-4 text-sm text-slate-400">
          No items in this section yet.
        </div>
      )}
    </TerminalCard>
  );
}
