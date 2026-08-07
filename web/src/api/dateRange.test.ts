import { describe, it, expect } from 'vitest';
import {
  DEFAULT_RANGE_DAYS,
  DEFAULT_RANGE_PRESET,
  RANGE_PRESETS,
  RANGE_PRESET_LABELS,
  defaultDateRange,
  matchPreset,
  presetRange,
  toDayKey,
} from './dateRange';

describe('toDayKey', () => {
  it('formats a local calendar date, not a UTC one', () => {
    // 00:30 local on the 10th is still the 9th in UTC anywhere east of +00:30, so a
    // `toISOString()` implementation would report the 9th here. The key must read as
    // the 10th, matching how the aggregator buckets the day.
    expect(toDayKey(new Date(2026, 6, 10, 0, 30))).toBe('2026-07-10');
  });

  it('formats a local calendar date across month and year boundaries, not a UTC one', () => {
    // The case above only pins the day: 00:30 local on 07-10 is 07-09 in UTC, same year
    // and month, so a UTC year or month would still read correctly there. On 01-01 the
    // UTC instant is 2025-12-31, which puts all three components in disagreement at once.
    expect(toDayKey(new Date(2026, 0, 1, 0, 30))).toBe('2026-01-01');
    expect(toDayKey(new Date(2026, 6, 1, 0, 30))).toBe('2026-07-01');
  });

  it('zero-pads single-digit months and days', () => {
    expect(toDayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('defaultDateRange', () => {
  it('spans seven days inclusive, ending today', () => {
    expect(defaultDateRange(new Date(2026, 7, 2))).toStrictEqual({
      from: '2026-07-27',
      to: '2026-08-02',
    });
    expect(DEFAULT_RANGE_DAYS).toBe(7);
  });

  it('crosses a month boundary backwards', () => {
    expect(defaultDateRange(new Date(2026, 7, 3))).toStrictEqual({
      from: '2026-07-28',
      to: '2026-08-03',
    });
  });

  it('crosses a year boundary backwards', () => {
    expect(defaultDateRange(new Date(2026, 0, 3))).toStrictEqual({
      from: '2025-12-28',
      to: '2026-01-03',
    });
  });

  it('does not mutate the date it is given', () => {
    const now = new Date(2026, 7, 2);
    defaultDateRange(now);
    expect(toDayKey(now)).toBe('2026-08-02');
  });
});

describe('range presets', () => {
  it('offers the four selectable presets in dropdown order, and never offers custom', () => {
    expect(RANGE_PRESETS).toStrictEqual(['last7', 'last30', 'last90', 'all']);
    expect(RANGE_PRESETS).not.toContain('custom');
    expect(RANGE_PRESET_LABELS.custom).toBe('Custom');
    expect(DEFAULT_RANGE_PRESET).toBe('last7');
  });

  it('labels every preset, selectable or derived', () => {
    expect(RANGE_PRESET_LABELS).toStrictEqual({
      last7: 'Last 7 days',
      last30: 'Last 30 days',
      last90: 'Last 90 days',
      all: 'All time',
      custom: 'Custom',
    });
  });
});

describe('presetRange', () => {
  it('spans each window inclusively, counting today', () => {
    const now = new Date(2026, 6, 10);
    expect(presetRange('last7', now)).toStrictEqual({ from: '2026-07-04', to: '2026-07-10' });
    expect(presetRange('last30', now)).toStrictEqual({ from: '2026-06-11', to: '2026-07-10' });
    expect(presetRange('last90', now)).toStrictEqual({ from: '2026-04-12', to: '2026-07-10' });
  });

  it('crosses a year boundary backwards', () => {
    const now = new Date(2026, 0, 3);
    expect(presetRange('last30', now)).toStrictEqual({ from: '2025-12-05', to: '2026-01-03' });
    expect(presetRange('last90', now)).toStrictEqual({ from: '2025-10-06', to: '2026-01-03' });
  });

  it('uses the local calendar date, not the UTC one', () => {
    // 00:30 local is still the previous day in UTC anywhere east of +00:30, and that
    // holds for both ends of the window, so a `toISOString()` implementation shifts
    // every key here one day earlier.
    const now = new Date(2026, 6, 10, 0, 30);
    expect(presetRange('last7', now)).toStrictEqual({ from: '2026-07-04', to: '2026-07-10' });
    expect(presetRange('last90', now)).toStrictEqual({ from: '2026-04-12', to: '2026-07-10' });
  });

  it('uses the local year and month at a year boundary, not the UTC ones', () => {
    // 00:30 local on 01-01 is 2025-12-31 in UTC, so a UTC year or month shows up in `to`
    // here where the same-month case above cannot see it.
    const now = new Date(2026, 0, 1, 0, 30);
    expect(presetRange('last7', now)).toStrictEqual({ from: '2025-12-26', to: '2026-01-01' });
  });

  it('clears both bounds for all time, whatever the clock says', () => {
    expect(presetRange('all', new Date(2026, 6, 10))).toStrictEqual({ from: '', to: '' });
    expect(presetRange('all', new Date(2020, 0, 1))).toStrictEqual({ from: '', to: '' });
  });

  it('does not mutate the date it is given', () => {
    const now = new Date(2026, 6, 10);
    presetRange('last90', now);
    expect(toDayKey(now)).toBe('2026-07-10');
  });

  it('leaves the exact instant it is given untouched, clock time included', () => {
    // The day-key check above cannot see a clock-time mutation such as `setHours(0,0,0,0)`,
    // which leaves every returned key correct. App holds one frozen `Date` and hands that
    // same instance to every call, so a normalised time would propagate to all of them.
    const now = new Date(2026, 6, 10, 13, 45, 30, 500);
    const before = now.getTime();
    presetRange('last90', now);
    expect(now.getTime()).toBe(before);
  });

  it('agrees with defaultDateRange on the seven-day window', () => {
    const now = new Date(2026, 6, 10);
    expect(presetRange(DEFAULT_RANGE_PRESET, now)).toStrictEqual(defaultDateRange(now));
  });
});

describe('matchPreset', () => {
  const NOW = new Date(2026, 6, 10);

  it('round-trips every selectable preset', () => {
    for (const preset of RANGE_PRESETS) {
      expect(matchPreset(presetRange(preset, NOW), NOW)).toBe(preset);
    }
  });

  it('reads empty bounds as all time, not custom', () => {
    expect(matchPreset({ from: '', to: '' }, NOW)).toBe('all');
  });

  it('reads an arbitrary window as custom', () => {
    expect(matchPreset({ from: '2026-07-09', to: '2026-07-10' }, NOW)).toBe('custom');
  });

  it('reads a half-open window as custom, not all time', () => {
    expect(matchPreset({ from: '2026-07-04', to: '' }, NOW)).toBe('custom');
    expect(matchPreset({ from: '', to: '2026-07-10' }, NOW)).toBe('custom');
  });

  it('reads a window one day off a preset as custom', () => {
    expect(matchPreset({ from: '2026-07-03', to: '2026-07-10' }, NOW)).toBe('custom');
    expect(matchPreset({ from: '2026-07-04', to: '2026-07-09' }, NOW)).toBe('custom');
  });

  it('does not mutate the date it is given', () => {
    const now = new Date(2026, 6, 10);
    matchPreset({ from: '2026-07-04', to: '2026-07-10' }, now);
    expect(toDayKey(now)).toBe('2026-07-10');
  });

  it('leaves the exact instant it is given untouched, clock time included', () => {
    const now = new Date(2026, 6, 10, 13, 45, 30, 500);
    const before = now.getTime();
    matchPreset({ from: '2026-07-04', to: '2026-07-10' }, now);
    expect(now.getTime()).toBe(before);
  });
});
