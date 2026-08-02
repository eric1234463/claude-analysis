/** How the time-bucketed charts group their x-axis. */
export type Granularity = 'day' | 'week' | 'month';

export const GRANULARITIES: readonly Granularity[] = ['day', 'week', 'month'];

/** Dropdown labels. */
export const GRANULARITY_LABELS: Record<Granularity, string> = {
  day: 'Daily',
  week: 'Weekly',
  month: 'Monthly',
};

/** Adjective for a chart title — "Daily tokens". */
export const GRANULARITY_ADJECTIVE: Record<Granularity, string> = {
  day: 'Daily',
  week: 'Weekly',
  month: 'Monthly',
};

/** Noun for chart copy — "New sessions per day". */
export const GRANULARITY_NOUN: Record<Granularity, string> = {
  day: 'day',
  week: 'week',
  month: 'month',
};

/**
 * The bucket a pre-bucketed day key falls into: the day itself, the Monday of its ISO week, or its
 * `YYYY-MM` month.
 *
 * `day` is a calendar date the server already resolved in the configured zone, so this is pure
 * string and calendar arithmetic — parsing it at UTC midnight keeps the week shift from drifting a
 * day in either direction, and never re-derives a date from a timestamp.
 */
export function bucketKey(day: string, granularity: Granularity): string {
  if (granularity === 'day') return day;
  if (granularity === 'month') return day.slice(0, 7);
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}
