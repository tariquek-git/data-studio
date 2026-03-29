import type { ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, ReactNode } from 'react';

/* ─── Button ─── */

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    'bg-primary-600 text-white hover:bg-primary-700 focus-visible:ring-primary-500 shadow-sm',
  secondary:
    'bg-white text-surface-700 border border-surface-300 hover:bg-surface-50 focus-visible:ring-primary-500 shadow-sm',
  ghost:
    'text-surface-600 hover:text-surface-900 hover:bg-surface-100 focus-visible:ring-primary-500',
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
      className={`inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ${buttonVariants[variant]} ${buttonSizes[size]} ${className}`}
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
  blue: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  green: 'bg-green-50 text-green-700 ring-green-600/20',
  red: 'bg-red-50 text-red-700 ring-red-600/20',
  yellow: 'bg-yellow-50 text-yellow-700 ring-yellow-600/20',
  gray: 'bg-surface-100 text-surface-600 ring-surface-500/20',
  purple: 'bg-purple-50 text-purple-700 ring-purple-600/20',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
  orange: 'bg-orange-50 text-orange-700 ring-orange-600/20',
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
      className={`bg-white rounded-xl border border-surface-200 shadow-sm ${padding ? 'p-5' : ''} ${className}`}
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
      className={`animate-pulse rounded-md bg-surface-200 ${className}`}
    />
  );
}

/* ─── Input ─── */

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Wrapping class for the outer div if needed */
  wrapperClassName?: string;
}

export function Input({ className = '', wrapperClassName, ...props }: InputProps) {
  const input = (
    <input
      className={`block w-full rounded-lg border border-surface-300 bg-white px-3.5 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 focus:outline-none disabled:opacity-50 ${className}`}
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
      className={`block w-full rounded-lg border border-surface-300 bg-white px-3.5 py-2 text-sm text-surface-900 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 focus:outline-none disabled:opacity-50 ${className}`}
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
