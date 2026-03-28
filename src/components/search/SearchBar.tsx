import { useRef, useEffect, useCallback, type FormEvent } from 'react';
import { Search, X } from 'lucide-react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchBar({
  value,
  onChange,
  onSubmit,
  placeholder = 'Search banks, credit unions, holding companies...',
  className = '',
}: SearchBarProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedChange = useCallback(
    (val: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        onSubmit(val);
      }, 300);
    },
    [onSubmit],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function handleChange(val: string) {
    onChange(val);
    debouncedChange(val);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (timerRef.current) clearTimeout(timerRef.current);
    onSubmit(value);
  }

  return (
    <form onSubmit={handleSubmit} className={`relative ${className}`}>
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-surface-400 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-10 pr-10 py-2.5 rounded-lg border border-surface-300 bg-white text-sm text-surface-900 placeholder:text-surface-400 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 focus:outline-none"
      />
      {value && (
        <button
          type="button"
          onClick={() => handleChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded text-surface-400 hover:text-surface-600"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </form>
  );
}
