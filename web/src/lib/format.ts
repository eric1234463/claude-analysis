const FULL = new Intl.NumberFormat('en-US');
const COMPACT = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

/** Grouped digits, for tooltips and tables where the exact value matters. */
export function formatNumber(value: number): string {
  return FULL.format(value);
}

/** Short form for axis ticks and stat tiles, where width matters more than precision. */
export function formatCompact(value: number): string {
  return COMPACT.format(value);
}

export function formatPercent(numerator: number, denominator: number): string {
  if (!denominator) return '0%';
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}
