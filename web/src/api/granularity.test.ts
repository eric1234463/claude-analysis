import { describe, it, expect } from 'vitest';
import { bucketKey } from './granularity';

describe('bucketKey', () => {
  it('returns the day key untouched at day granularity', () => {
    expect(bucketKey('2026-07-09', 'day')).toBe('2026-07-09');
  });

  it('truncates to YYYY-MM at month granularity', () => {
    expect(bucketKey('2026-07-09', 'month')).toBe('2026-07');
    expect(bucketKey('2026-12-31', 'month')).toBe('2026-12');
  });

  it('snaps to the Monday of the ISO week', () => {
    // 2026-07-09 is a Thursday; 2026-07-06 is its Monday.
    expect(bucketKey('2026-07-09', 'week')).toBe('2026-07-06');
    expect(bucketKey('2026-07-06', 'week')).toBe('2026-07-06');
  });

  it('treats Sunday as the end of its week, not the start of the next', () => {
    // 2026-07-12 is a Sunday and belongs to the week beginning 2026-07-06.
    expect(bucketKey('2026-07-12', 'week')).toBe('2026-07-06');
    expect(bucketKey('2026-07-13', 'week')).toBe('2026-07-13');
  });

  it('crosses month and year boundaries backwards when the week straddles one', () => {
    // 2026-01-01 is a Thursday, so its week begins in the previous December.
    expect(bucketKey('2026-01-01', 'week')).toBe('2025-12-29');
    expect(bucketKey('2026-03-02', 'week')).toBe('2026-03-02');
  });

  it('is stable across every day of a week, so no boundary can drift by one', () => {
    // Mon–Sun of one week must all resolve to that Monday. A local-midnight parse instead of a
    // UTC one would shear one end of this range off on a machine east or west of UTC.
    const week = ['06', '07', '08', '09', '10', '11', '12']
      .map((d) => bucketKey(`2026-07-${d}`, 'week'));
    expect(new Set(week)).toStrictEqual(new Set(['2026-07-06']));
  });
});
