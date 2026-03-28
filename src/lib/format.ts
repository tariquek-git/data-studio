export function formatCurrency(value: number | null): string {
  if (value == null) return '\u2014';
  const abs = Math.abs(value);
  if (abs >= 1e12) return `$${(value / 1e12).toFixed(1)}T`;
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toLocaleString()}`;
}

export function formatNumber(value: number | null): string {
  if (value == null) return '\u2014';
  return value.toLocaleString();
}

export function formatPercent(value: number | null, decimals = 2): string {
  if (value == null) return '\u2014';
  return `${value.toFixed(decimals)}%`;
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '\u2014';
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
}
