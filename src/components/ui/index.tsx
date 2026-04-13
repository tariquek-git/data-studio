import { Component, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, type ReactNode, type ErrorInfo } from 'react';
export { WatchlistButton } from './WatchlistButton';

/* ─── Button ─── */

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    'bg-primary-500 text-white hover:bg-primary-400 focus-visible:ring-primary-500 shadow-sm shadow-primary-500/20',
  secondary:
    'bg-surface-800 text-surface-200 border border-surface-600 hover:bg-surface-700 hover:border-surface-500 focus-visible:ring-primary-500',
  ghost:
    'text-surface-300 hover:text-surface-100 hover:bg-surface-800 focus-visible:ring-primary-500',
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1.5 text-xs',
  md: 'px-3.5 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-900 disabled:opacity-50 disabled:pointer-events-none ${buttonVariants[variant]} ${buttonSizes[size]} ${className}`}
      {...props}
    />
  );
}

/* ─── Badge ─── */

type BadgeColor = 'blue' | 'green' | 'red' | 'yellow' | 'gray' | 'purple' | 'indigo' | 'orange';

interface BadgeProps {
  children: ReactNode;
  color?: BadgeColor;
  className?: string;
}

const badgeColors: Record<BadgeColor, string> = {
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  yellow: 'bg-amber-50 text-amber-700 ring-amber-200',
  gray: 'bg-slate-100 text-slate-600 ring-slate-200',
  purple: 'bg-purple-50 text-purple-700 ring-purple-200',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  orange: 'bg-orange-50 text-orange-700 ring-orange-200',
};

export function Badge({ children, color = 'gray', className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${badgeColors[color]} ${className}`}
    >
      {children}
    </span>
  );
}

/* ─── Card ─── */

interface CardProps {
  children: ReactNode;
  className?: string;
  padding?: boolean;
}

export function Card({ children, className = '', padding = true }: CardProps) {
  return (
    <div
      className={`bg-surface-800/60 backdrop-blur rounded-xl border border-surface-700/50 ${padding ? 'p-5' : ''} ${className}`}
    >
      {children}
    </div>
  );
}

/* ─── Skeleton ─── */

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded-md bg-surface-700 ${className}`}
    />
  );
}

/* ─── SectionErrorBoundary ─── */

interface SectionErrorBoundaryProps {
  children: ReactNode;
  section?: string;
}

interface SectionErrorBoundaryState {
  hasError: boolean;
  errorMessage: string | null;
}

export class SectionErrorBoundary extends Component<SectionErrorBoundaryProps, SectionErrorBoundaryState> {
  constructor(props: SectionErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: null };
  }

  static getDerivedStateFromError(error: Error): SectionErrorBoundaryState {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[SectionErrorBoundary${this.props.section ? `: ${this.props.section}` : ''}]`, error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center">
          <p className="text-sm font-medium text-red-600">
            {this.props.section ? `${this.props.section} failed to load` : 'Something went wrong'}
          </p>
          <p className="mt-1 text-xs text-red-500/70">{this.state.errorMessage}</p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, errorMessage: null })}
            className="mt-3 text-xs font-medium text-red-600 hover:text-red-500 underline"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ─── Input ─── */

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  wrapperClassName?: string;
}

export function Input({ className = '', wrapperClassName, ...props }: InputProps) {
  const input = (
    <input
      className={`block w-full rounded-lg border border-surface-600 bg-surface-800 px-3.5 py-2 text-sm text-surface-100 placeholder:text-surface-400 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 focus:outline-none disabled:opacity-50 ${className}`}
      {...props}
    />
  );
  if (wrapperClassName) {
    return <div className={wrapperClassName}>{input}</div>;
  }
  return input;
}

/* ─── Select ─── */

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: { value: string; label: string }[];
}

export function Select({ options, className = '', ...props }: SelectProps) {
  return (
    <select
      className={`block w-full rounded-lg border border-surface-600 bg-surface-800 px-3.5 py-2 text-sm text-surface-100 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 focus:outline-none disabled:opacity-50 ${className}`}
      {...props}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
