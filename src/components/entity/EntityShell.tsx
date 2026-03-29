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
    <div className="min-h-[calc(100vh-4rem)] bg-slate-950 text-slate-100">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(45,212,191,0.14),_transparent_32%),radial-gradient(circle_at_top_right,_rgba(59,130,246,0.12),_transparent_26%),linear-gradient(180deg,_rgba(2,6,23,0.96),_rgba(15,23,42,1))]" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-3 max-w-4xl">
              {eyebrow && (
                <Badge color="gray" className="bg-slate-900 text-slate-300 ring-slate-700/60">
                  {eyebrow}
                </Badge>
              )}
              <div className="space-y-2">
                <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">
                  {title}
                </h1>
                <p className="text-sm sm:text-base text-slate-300 max-w-3xl leading-relaxed">
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
}

export function TerminalCard({ title, subtitle, children, className = '' }: TerminalCardProps) {
  return (
    <Card className={`bg-slate-900/80 border-slate-700 text-slate-100 shadow-2xl shadow-slate-950/30 ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-200">
            {title}
          </h2>
          {subtitle && <p className="mt-1 text-xs text-slate-400">{subtitle}</p>}
        </div>
      </div>
      {children}
    </Card>
  );
}
