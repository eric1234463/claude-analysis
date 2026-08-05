import { describe, it, expect } from 'vitest';
import fixture from './__fixtures__/aggregate-stats.json';
import { AGGREGATE_STATS_KEYS, type AggregateStats } from './types';
import { usageSeries, filterStats } from './filterStats';

const stats = fixture as AggregateStats;
const zero = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, total: 0 };

describe('filterStats', () => {
  it('returns a value deep-equal to the input for an empty filter', () => {
    expect(filterStats(stats, {})).toStrictEqual(stats);
  });

  it('always returns exactly the eleven declared top-level keys', () => {
    for (const f of [{}, { from: '2026-07-09', to: '2026-07-09' }, { from: '2030-01-01' }]) {
      expect(Object.keys(filterStats(stats, f)).sort()).toStrictEqual([...AGGREGATE_STATS_KEYS]);
    }
  });

  it('narrows by day key and re-sums the totals', () => {
    const out = filterStats(stats, { from: '2026-07-09', to: '2026-07-09' });
    expect(Object.keys(out.days)).toStrictEqual(['2026-07-09']);
    expect(out.totals.tokens.total).toBe(27420);
    expect(out.totals.sessionsStarted).toBe(1);
    expect(out.totals.toolCalls).toBe(4);
  });

  it('drops dimensions that appear only in excluded cells', () => {
    const out = filterStats(stats, { from: '2026-07-09', to: '2026-07-09' });
    expect(out.projects).toStrictEqual(['-fixture-project']);
    expect(out.models).toStrictEqual(['claude-opus-4-8']);
    expect(Object.keys(out.totals.models)).toStrictEqual(['claude-opus-4-8']);
  });

  it('narrows by project on the other axis', () => {
    const out = filterStats(stats, { projects: ['-fixture-project-two'] });
    expect(Object.keys(out.days)).toStrictEqual(['2026-07-10']);
    expect(out.totals.tokens.total).toBe(18);
    expect(out.models).toStrictEqual(['claude-sonnet-5']);
    expect(out.tools).toStrictEqual([]);
    expect(out.skills).toStrictEqual([]);
    expect(out.agents).toStrictEqual([]);
    expect(out.totals.agentRuns).toBe(0);
  });

  it('carries skillTokens through the filter and drops it with its cell', () => {
    expect(filterStats(stats, {}).totals.skillTokens).toStrictEqual({
      brainstorming: { input: 4, output: 160, cacheRead: 21047, cacheCreation: 6069, total: 27280 },
    });
    expect(filterStats(stats, { projects: ['-fixture-project-two'] }).totals.skillTokens)
      .toStrictEqual({});
    expect(filterStats(stats, { from: '2030-01-01' }).totals.skillTokens).toStrictEqual({});
  });

  it('sums skillTokens across cells rather than overwriting one with another', () => {
    const cell = stats.days['2026-07-09']['-fixture-project'];
    const doubled: AggregateStats = {
      ...stats,
      days: { '2026-07-09': { '-a': cell, '-b': cell } },
    };
    expect(filterStats(doubled, {}).totals.skillTokens.brainstorming)
      .toStrictEqual({ input: 8, output: 320, cacheRead: 42094, cacheCreation: 12138, total: 54560 });
  });

  it('applies date and project together', () => {
    expect(
      Object.keys(filterStats(stats, { from: '2026-07-09', to: '2026-07-09',
        projects: ['-fixture-project-two'] }).days),
    ).toStrictEqual([]);
    const both = filterStats(stats, { from: '2026-07-10', projects: ['-fixture-project-two'] });
    expect(both.totals.tokens.total).toBe(18);
  });

  it('zeroes everything for an out-of-range filter and keeps the scan counters', () => {
    const out = filterStats(stats, { from: '2030-01-01' });
    expect(out.days).toStrictEqual({});
    expect(out.projects).toStrictEqual([]);
    expect(out.totals.tokens).toStrictEqual(zero);
    expect(out.totals.mainTokens).toStrictEqual(zero);
    expect(out.totals.sidechainTokens).toStrictEqual(zero);
    expect(out.totals.sessionsStarted).toBe(0);
    expect(out.totals.models).toStrictEqual({});
    expect(out.generatedAt).toBe(stats.generatedAt);
    expect(out.scannedFiles).toBe(3);
    expect(out.malformedLines).toBe(3);
    expect(out.ignoredLines).toBe(5);
  });

  it('does not mutate its input', () => {
    const snapshot = structuredClone(stats);
    filterStats(stats, { from: '2026-07-09', to: '2026-07-09' });
    filterStats(stats, { projects: ['-fixture-project'] });
    expect(stats).toStrictEqual(snapshot);
  });

  it('treats an empty projects array as "match all", not "match nothing"', () => {
    expect(filterStats(stats, { projects: [] })).toStrictEqual(stats);
  });

  it('never constructs a Date — day keys are compared as strings', () => {
    const RealDate = globalThis.Date;
    // @ts-expect-error deliberately hostile stub
    globalThis.Date = function () { throw new Error('filterStats must not construct a Date'); };
    try {
      expect(() => filterStats(stats, { from: '2026-07-09', to: '2026-07-10' })).not.toThrow();
      // Day granularity short-circuits in bucketKey; week is the one that does calendar maths.
      expect(() => usageSeries(stats, 'day')).not.toThrow();
    } finally {
      globalThis.Date = RealDate;
    }
  });
});

describe('usageSeries', () => {
  it('is ascending by day and merges each day\'s project cells', () => {
    const series = usageSeries(stats, 'day');
    expect(series.map((d) => d.bucket)).toStrictEqual(['2026-07-09', '2026-07-10']);
    expect(series[0].counts.tokens.total).toBe(27420);
    expect(series[0].counts.sessionsStarted).toBe(1);
    expect(series[1].counts.tokens.total).toBe(18);
  });

  it('merges multiple projects within one day into a single counts object', () => {
    const merged: AggregateStats = {
      ...stats,
      days: {
        '2026-07-09': {
          '-fixture-project': stats.days['2026-07-09']['-fixture-project'],
          '-fixture-project-two': stats.days['2026-07-10']['-fixture-project-two'],
        },
      },
    };
    const series = usageSeries(merged, 'day');
    expect(series).toHaveLength(1);
    expect(series[0].counts.tokens.total).toBe(27438);
    expect(series[0].counts.sessionsStarted).toBe(2);
    expect(Object.keys(series[0].counts.models))
      .toStrictEqual(['claude-opus-4-8', 'claude-sonnet-5']);
  });

  it('returns an empty array when there are no days', () => {
    expect(usageSeries({ ...stats, days: {} }, 'day')).toStrictEqual([]);
  });

  it('is ascending by day even when the source object\'s keys are inserted in descending order', () => {
    const reversed: AggregateStats = {
      ...stats,
      days: {
        '2026-07-10': stats.days['2026-07-10'],
        '2026-07-09': stats.days['2026-07-09'],
      },
    };
    expect(usageSeries(reversed, 'day').map((d) => d.bucket)).toStrictEqual(['2026-07-09', '2026-07-10']);
  });

  it('collapses the two fixture days into one week bucket, summing their counts', () => {
    const series = usageSeries(stats, 'week');
    expect(series.map((d) => d.bucket)).toStrictEqual(['2026-07-06']);
    // 27,420 on the 9th plus 18 on the 10th.
    expect(series[0].counts.tokens.total).toBe(27438);
    expect(series[0].counts.sessionsStarted).toBe(2);
  });

  it('collapses them into one month bucket keyed YYYY-MM', () => {
    const series = usageSeries(stats, 'month');
    expect(series.map((d) => d.bucket)).toStrictEqual(['2026-07']);
    expect(series[0].counts.tokens.total).toBe(27438);
  });

  it('keeps days in different weeks apart, and orders the buckets ascending', () => {
    const spread: AggregateStats = {
      ...stats,
      days: {
        // A Thursday and the following Monday: same month, adjacent but distinct weeks.
        '2026-07-13': stats.days['2026-07-10'],
        '2026-07-09': stats.days['2026-07-09'],
      },
    };
    expect(usageSeries(spread, 'week').map((d) => d.bucket))
      .toStrictEqual(['2026-07-06', '2026-07-13']);
    expect(usageSeries(spread, 'month').map((d) => d.bucket)).toStrictEqual(['2026-07']);
  });
});

describe('throughput merging', () => {
  it('sums all four fields across the fixture through the real merge', () => {
    const merged = filterStats(stats, {});
    expect(merged.totals.throughput)
      .toStrictEqual({ outputTokens: 153, durationMs: 62000, requests: 1, excludedRequests: 7 });
    expect(merged.totals.mainThroughput)
      .toStrictEqual({ outputTokens: 0, durationMs: 0, requests: 0, excludedRequests: 6 });
    expect(merged.totals.modelThroughput).toStrictEqual({
      'claude-opus-4-8': { outputTokens: 153, durationMs: 62000, requests: 1, excludedRequests: 0 },
    });
    expect(merged.totals.skillThroughput).toStrictEqual({
      brainstorming: { outputTokens: 153, durationMs: 62000, requests: 1, excludedRequests: 0 },
    });
  });

  it('drops excluded-day cells from totals when filtered out', () => {
    const byDate = filterStats(stats, { from: '2026-07-10' });
    expect(byDate.totals.throughput)
      .toStrictEqual({ outputTokens: 0, durationMs: 0, requests: 0, excludedRequests: 1 });
    const byProject = filterStats(stats, { projects: ['-fixture-project-two'] });
    expect(byProject.totals.throughput)
      .toStrictEqual({ outputTokens: 0, durationMs: 0, requests: 0, excludedRequests: 1 });
  });

  it('buckets a week by summing, so the rate is volume-weighted, not a mean of day rates', () => {
    const days = usageSeries(stats, 'day');
    expect(days.map(({ counts }) => counts.throughput)).toStrictEqual([
      { outputTokens: 153, durationMs: 62000, requests: 1, excludedRequests: 6 },
      { outputTokens: 0, durationMs: 0, requests: 0, excludedRequests: 1 },
    ]);
    const [week] = usageSeries(stats, 'week');
    expect(week.bucket).toBe('2026-07-06');
    expect(week.counts.throughput)
      .toStrictEqual({ outputTokens: 153, durationMs: 62000, requests: 1, excludedRequests: 7 });
    const [month] = usageSeries(stats, 'month');
    expect(month.counts.throughput)
      .toStrictEqual({ outputTokens: 153, durationMs: 62000, requests: 1, excludedRequests: 7 });
  });

  it('union-merges model entries when two cells share a model', () => {
    const dayOne = stats.days['2026-07-09']['-fixture-project'];
    const clash: AggregateStats = {
      ...stats,
      days: {
        '2026-07-09': { '-a': dayOne },
        '2026-07-10': { '-b': { ...dayOne } },
      },
    };
    const merged = filterStats(clash, {});
    expect(merged.totals.modelThroughput['claude-opus-4-8'])
      .toStrictEqual({ outputTokens: 306, durationMs: 124000, requests: 2, excludedRequests: 0 });
  });
});
