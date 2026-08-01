import { describe, it, expect } from 'vitest';
import fixture from './__fixtures__/aggregate-stats.json';
import { AGGREGATE_STATS_KEYS, type AggregateStats } from './types';
import { daySeries, filterStats } from './filterStats';

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
      expect(() => daySeries(stats)).not.toThrow();
    } finally {
      globalThis.Date = RealDate;
    }
  });
});

describe('daySeries', () => {
  it('is ascending by day and merges each day\'s project cells', () => {
    const series = daySeries(stats);
    expect(series.map((d) => d.day)).toStrictEqual(['2026-07-09', '2026-07-10']);
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
    const series = daySeries(merged);
    expect(series).toHaveLength(1);
    expect(series[0].counts.tokens.total).toBe(27438);
    expect(series[0].counts.sessionsStarted).toBe(2);
    expect(Object.keys(series[0].counts.models))
      .toStrictEqual(['claude-opus-4-8', 'claude-sonnet-5']);
  });

  it('returns an empty array when there are no days', () => {
    expect(daySeries({ ...stats, days: {} })).toStrictEqual([]);
  });

  it('is ascending by day even when the source object\'s keys are inserted in descending order', () => {
    const reversed: AggregateStats = {
      ...stats,
      days: {
        '2026-07-10': stats.days['2026-07-10'],
        '2026-07-09': stats.days['2026-07-09'],
      },
    };
    expect(daySeries(reversed).map((d) => d.day)).toStrictEqual(['2026-07-09', '2026-07-10']);
  });
});
