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

/** The windows a user can pick outright. `custom` is derived, never offered. */
export type SelectableRangePreset = 'last7' | 'last30' | 'last90' | 'all';

/** Every state the Range control can display, including the derived one. */
export type RangePreset = SelectableRangePreset | 'custom';

/**
 * Dropdown order, rendered as-is by the Range select — this array *is* the menu, so
 * reordering it reorders the UI.
 */
export const RANGE_PRESETS: readonly SelectableRangePreset[] = ['last7', 'last30', 'last90', 'all'];

/**
 * Labels live beside the vocabulary so the select and any read-back of the current
 * window can never disagree on wording. `custom` is keyed here but not in
 * {@link RANGE_PRESETS}: it needs a label to display, not a menu entry to choose.
 */
export const RANGE_PRESET_LABELS: Record<RangePreset, string> = {
  last7: 'Last 7 days',
  last30: 'Last 30 days',
  last90: 'Last 90 days',
  all: 'All time',
  custom: 'Custom',
};

/** The preset the dashboard opens on — the same window {@link defaultDateRange} returns. */
export const DEFAULT_RANGE_PRESET: SelectableRangePreset = 'last7';

/**
 * Window lengths in days, counting today. `last7` borrows
 * {@link DEFAULT_RANGE_DAYS} so the default preset and the default range cannot drift.
 */
const PRESET_DAYS: Record<Exclude<SelectableRangePreset, 'all'>, number> = {
  last7: DEFAULT_RANGE_DAYS,
  last30: 30,
  last90: 90,
};

/**
 * The day-key pair a preset stands for. One place owns this arithmetic so the Range
 * select never re-derives a date: both ends are inclusive with `now` counted as one of
 * the N days, and `all` clears both bounds because empty strings are what the app
 * already reads as unbounded. Keys go through {@link toDayKey} for the timezone reason
 * documented there.
 */
export function presetRange(
  preset: SelectableRangePreset,
  now: Date,
): { from: string; to: string } {
  if (preset === 'all') {
    return { from: '', to: '' };
  }
  const days = PRESET_DAYS[preset];
  const from = new Date(now);
  from.setDate(from.getDate() - (days - 1));
  return { from: toDayKey(from), to: toDayKey(now) };
}

/**
 * Which preset a range reads back as, so the select can show "Last 30 days" instead of
 * "Custom" for a window it just produced. Empty bounds are answered before the scan
 * because that pair means All time no matter what the clock says. A hand-typed range
 * that happens to land on a preset window reads as that preset — accepted, since the
 * two are indistinguishable by then and the preset is the friendlier label.
 */
export function matchPreset(range: { from: string; to: string }, now: Date): RangePreset {
  if (range.from === '' && range.to === '') {
    return 'all';
  }
  for (const preset of RANGE_PRESETS) {
    const candidate = presetRange(preset, now);
    if (candidate.from === range.from && candidate.to === range.to) {
      return preset;
    }
  }
  return 'custom';
}

/**
 * The range the dashboard opens on: the last {@link DEFAULT_RANGE_DAYS} days ending
 * today, inclusive of both ends. Anchored to the calendar rather than to the newest
 * day in the data, so the window keeps meaning "recently" even when it turns up
 * nothing — the empty state, not a silently widened range, is what says so.
 */
export function defaultDateRange(now: Date): { from: string; to: string } {
  return presetRange(DEFAULT_RANGE_PRESET, now);
}
