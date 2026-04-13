import type { ReactNode } from 'react';
import { Badge } from '@/components/ui';

interface MetricCard {
  label: string;
  value: string;
  tone?: 'positive' | 'caution' | 'critical' | 'default';
  detail?: string;
}

const toneClasses: Record<NonNullable<MetricCard['tone']>, string> = {
  default: 'bg-slate-100/80 text-slate-900 ring-slate-200/70',
  positive: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  caution: 'bg-amber-50 text-amber-700 ring-amber-200',
  critical: 'bg-rose-50 text-rose-700 ring-rose-200',
};

export interface EntityMetricStripProps {
  cards: MetricCard[];
  rightSlot?: ReactNode;
}

export function EntityMetricStrip({ cards, rightSlot }: EntityMetricStripProps) {
  const gridClass = cards.length >= 5 ? 'sm:grid-cols-2 xl:grid-cols-5' : 'sm:grid-cols-2 xl:grid-cols-4';

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className={`grid gap-3 ${gridClass}`}>
        {cards.map((card) => (
          <div
            key={card.label}
            className={`rounded-2xl border p-4 backdrop-blur ${toneClasses[card.tone ?? 'default']}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{card.label}</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">{card.value}</p>
                {card.detail && <p className="mt-1 text-xs text-slate-600">{card.detail}</p>}
              </div>
              <Badge color="gray" className="bg-white text-slate-700 ring-slate-200/70">
                live
              </Badge>
            </div>
          </div>
        ))}
      </div>
      {rightSlot && <div className="self-stretch">{rightSlot}</div>}
    </div>
  );
}
