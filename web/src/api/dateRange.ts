/** Days covered by the default selection, counting today. */
export const DEFAULT_RANGE_DAYS = 7;

/**
 * `YYYY-MM-DD` in local time. The aggregator buckets days by local calendar date,
 * so this must not go through `toISOString()`, which would shift the key by a day
 * for anyone east or west of UTC.
 */
export function toDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * The range the dashboard opens on: the last {@link DEFAULT_RANGE_DAYS} days ending
 * today, inclusive of both ends. Anchored to the calendar rather than to the newest
 * day in the data, so the window keeps meaning "recently" even when it turns up
 * nothing — the empty state, not a silently widened range, is what says so.
 */
export function defaultDateRange(now: Date): { from: string; to: string } {
  const from = new Date(now);
  from.setDate(from.getDate() - (DEFAULT_RANGE_DAYS - 1));
  return { from: toDayKey(from), to: toDayKey(now) };
}
