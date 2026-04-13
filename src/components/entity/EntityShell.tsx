import type { ReactNode } from 'react';
import { Badge, Card } from '@/components/ui';

interface EntityShellProps {
  eyebrow?: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  actions?: ReactNode;
  stats?: ReactNode;
}

export function EntityShell({ eyebrow, title, subtitle, children, actions, stats }: EntityShellProps) {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-white text-slate-900">
      <div className="relative overflow-hidden border-b border-slate-200/80">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.08),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.06),_transparent_26%)]" />
        <div className="absolute inset-0 opacity-[0.08] bg-[linear-gradient(rgba(148,163,184,0.22)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.18)_1px,transparent_1px)] bg-[size:34px_34px]" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-3 max-w-4xl">
              {eyebrow && (
                <Badge color="gray" className="bg-cyan-50 text-cyan-700 ring-cyan-200">
                  {eyebrow}
                </Badge>
              )}
              <div className="space-y-2">
                <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">
                  {title}
                </h1>
                <p className="text-sm sm:text-base text-slate-700 max-w-3xl leading-relaxed">
                  {subtitle}
                </p>
              </div>
            </div>
            {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
          </div>

          {stats && <div>{stats}</div>}
        </div>
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-10">
        <div className="space-y-5">{children}</div>
      </div>
    </div>
  );
}

interface TerminalCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  titleSlot?: ReactNode;
}

export function TerminalCard({ title, subtitle, children, className = '', titleSlot }: TerminalCardProps) {
  return (
    <Card className={`relative overflow-hidden border-slate-200/80 bg-white text-slate-900 shadow-2xl shadow-slate-200/50/30 ${className}`}>
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent" />
      <div className="absolute inset-0 opacity-[0.06] bg-[linear-gradient(rgba(148,163,184,0.2)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.16)_1px,transparent_1px)] bg-[size:28px_28px]" />
      <div className="relative flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="mb-3 flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-cyan-400/80" />
            <span className="h-2 w-2 rounded-full bg-emerald-400/60" />
            <span className="h-2 w-2 rounded-full bg-amber-400/60" />
          </div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-800">
            {title}
          </h2>
          {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
        </div>
        {titleSlot}
      </div>
      <div className="relative">{children}</div>
    </Card>
  );
}
