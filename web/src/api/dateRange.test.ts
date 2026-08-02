import { describe, it, expect } from 'vitest';
import { DEFAULT_RANGE_DAYS, defaultDateRange, toDayKey } from './dateRange';

describe('toDayKey', () => {
  it('formats a local calendar date, not a UTC one', () => {
    // 23:30 local on the 9th is the 10th in UTC anywhere east of +00:30. The key
    // must still read as the 9th, matching how the aggregator buckets the day.
    expect(toDayKey(new Date(2026, 6, 9, 23, 30))).toBe('2026-07-09');
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
