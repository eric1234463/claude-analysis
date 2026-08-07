import { describe, it, expect } from 'vitest';
import fixture from './__fixtures__/aggregate-stats.json';
import {
  AGGREGATE_STATS_KEYS,
  type AggregateStats,
  type CostBreakdown,
  type ThroughputCounts,
  type TokenTotals,
  type UsageCounts,
} from './types';
import { usageSeries, filterStats } from './filterStats';

const stats = fixture as AggregateStats;
const zero = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, cacheCreation1h: 0, cacheCreation5m: 0, total: 0 };

/**
 * Hand-built cells for the cost cases, deliberately not the shared fixture: these assertions
 * state their own arithmetic, so a fixture edit cannot make them vacuous.
 */
function tokens(over: Partial<TokenTotals> = {}): TokenTotals {
  return { ...zero, ...over };
}

function throughput(over: Partial<ThroughputCounts> = {}): ThroughputCounts {
  return { outputTokens: 0, durationMs: 0, requests: 0, excludedRequests: 0, ...over };
}

function cost(over: Partial<CostBreakdown> = {}): CostBreakdown {
  return {
    input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0,
    total: 0, uncachedCacheCost: 0, unpricedTokens: 0, ...over,
  };
}

function cell(over: Partial<UsageCounts> = {}): UsageCounts {
  return {
    tokens: tokens(),
    mainTokens: tokens(),
    sidechainTokens: tokens(),
    sessionsStarted: 0,
    toolCalls: 0,
    toolErrors: 0,
    skillInvocations: 0,
    agentRuns: 0,
    models: {},
    tools: {},
    skills: {},
    skillTokens: {},
    agents: {},
    throughput: throughput(),
    mainThroughput: throughput(),
    sidechainThroughput: throughput(),
    modelThroughput: {},
    skillThroughput: {},
    cost: cost(),
    modelCost: {},
    ...over,
  };
}

function statsWith(days: Record<string, Record<string, UsageCounts>>): AggregateStats {
  return {
    generatedAt: '2026-08-01T00:00:00.000Z',
    scannedFiles: 0,
    malformedLines: 0,
    ignoredLines: 0,
    days,
    projects: [],
    models: [],
    tools: [],
    skills: [],
    agents: [],
    totals: cell(),
  };
}

// Every field distinct between the two cells, and cacheWrite5m !== cacheWrite1h within each,
// so a dropped, hardcoded or transposed field cannot survive the sum.
const costA = cost({
  input: 100, output: 200, cacheRead: 300, cacheWrite5m: 400, cacheWrite1h: 500,
  total: 1500, uncachedCacheCost: 900, unpricedTokens: 7,
});
const costB = cost({
  input: 1, output: 2, cacheRead: 3, cacheWrite5m: 40, cacheWrite1h: 5000,
  total: 5046, uncachedCacheCost: 60, unpricedTokens: 11,
});
const costSum = cost({
  input: 101, output: 202, cacheRead: 303, cacheWrite5m: 440, cacheWrite1h: 5500,
  total: 6546, uncachedCacheCost: 960, unpricedTokens: 18,
});

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
      brainstorming: {
        input: 4, output: 160, cacheRead: 21047, cacheCreation: 6069,
        cacheCreation1h: 4000, cacheCreation5m: 2069, total: 27280,
      },
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
      .toStrictEqual({
        input: 8, output: 320, cacheRead: 42094, cacheCreation: 12138,
        cacheCreation1h: 8000, cacheCreation5m: 4138, total: 54560,
      });
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

describe('cost merging', () => {
  it('sums every CostBreakdown field across two cells', () => {
    const merged = filterStats(
      statsWith({ '2026-07-09': { '-a': cell({ cost: costA }), '-b': cell({ cost: costB }) } }),
      {},
    );
    expect(merged.totals.cost).toStrictEqual(costSum);
  });

  it('merges unpricedTokens like every other field rather than dropping it', () => {
    const merged = filterStats(
      statsWith({ '2026-07-09': { '-a': cell({ cost: costA }), '-b': cell({ cost: costB }) } }),
      {},
    );
    expect(merged.totals.cost.unpricedTokens).toBe(18);
  });

  it('merges modelCost per key, summing shared models and keeping single-cell ones', () => {
    const sonnet = cost({ input: 11, output: 22, total: 33, unpricedTokens: 1 });
    const haiku = cost({ input: 5, cacheWrite1h: 6, total: 11, uncachedCacheCost: 9 });
    const merged = filterStats(
      statsWith({
        '2026-07-09': {
          '-a': cell({ cost: costA, modelCost: { opus: costA, sonnet } }),
          '-b': cell({ cost: costB, modelCost: { opus: costB, haiku } }),
        },
      }),
      {},
    );
    expect(merged.totals.modelCost).toStrictEqual({ opus: costSum, sonnet, haiku });
  });

  it('excludes the cost of a cell outside the date range', () => {
    const source = statsWith({
      '2026-07-09': { '-a': cell({ cost: costA, modelCost: { opus: costA } }) },
      '2026-07-20': { '-a': cell({ cost: costB, modelCost: { sonnet: costB } }) },
    });
    const out = filterStats(source, { from: '2026-07-09', to: '2026-07-09' });
    expect(out.totals.cost).toStrictEqual(costA);
    expect(out.totals.modelCost).toStrictEqual({ opus: costA });
  });

  it('excludes the cost of a cell whose project is not selected', () => {
    const source = statsWith({
      '2026-07-09': {
        '-a': cell({ cost: costA, modelCost: { opus: costA } }),
        '-b': cell({ cost: costB, modelCost: { sonnet: costB } }),
      },
    });
    const out = filterStats(source, { projects: ['-a'] });
    expect(out.totals.cost).toStrictEqual(costA);
    expect(out.totals.modelCost).toStrictEqual({ opus: costA });
  });

  it('totals every cell\'s cost when the filter selects everything', () => {
    const source = statsWith({
      '2026-07-09': { '-a': cell({ cost: costA }) },
      '2026-07-20': { '-b': cell({ cost: costB }) },
    });
    expect(filterStats(source, {}).totals.cost).toStrictEqual(costSum);
  });

  it('yields an all-zero breakdown and an empty modelCost for a selection with no days', () => {
    const source = statsWith({
      '2026-07-09': { '-a': cell({ cost: costA, modelCost: { opus: costA } }) },
    });
    const out = filterStats(source, { from: '2030-01-01' });
    expect(out.totals.cost).toStrictEqual(cost());
    expect(out.totals.modelCost).toStrictEqual({});
  });

  it('sums cost into one bucket for two days of the same ISO week', () => {
    const source = statsWith({
      '2026-07-09': { '-a': cell({ cost: costA }) },
      '2026-07-10': { '-a': cell({ cost: costB }) },
    });
    const series = usageSeries(source, 'week');
    expect(series.map((p) => p.bucket)).toStrictEqual(['2026-07-06']);
    expect(series[0].counts.cost.total).toBe(6546);
    expect(series[0].counts.cost).toStrictEqual(costSum);
  });

  it('keeps cost in separate buckets across a month boundary', () => {
    const source = statsWith({
      '2026-07-31': { '-a': cell({ cost: costA }) },
      '2026-08-03': { '-a': cell({ cost: costB }) },
    });
    const series = usageSeries(source, 'month');
    expect(series.map((p) => p.bucket)).toStrictEqual(['2026-07', '2026-08']);
    expect(series.map((p) => p.counts.cost.total)).toStrictEqual([1500, 5046]);
  });
});

describe('cache-creation split merging (F-1)', () => {
  it('sums cacheCreation1h and cacheCreation5m without disturbing total', () => {
    const a = tokens({
      input: 10, output: 20, cacheRead: 30, cacheCreation: 40,
      cacheCreation1h: 30, cacheCreation5m: 10, total: 100,
    });
    const b = tokens({
      input: 1, output: 2, cacheRead: 3, cacheCreation: 4,
      cacheCreation1h: 1, cacheCreation5m: 3, total: 10,
    });
    const merged = filterStats(
      statsWith({
        '2026-07-09': {
          '-a': cell({ tokens: a, models: { opus: a } }),
          '-b': cell({ tokens: b, models: { opus: b } }),
        },
      }),
      {},
    ).totals;

    expect(merged.tokens).toStrictEqual(tokens({
      input: 11, output: 22, cacheRead: 33, cacheCreation: 44,
      cacheCreation1h: 31, cacheCreation5m: 13, total: 110,
    }));
    // `total` stays the sum of the four summed fields — the split is carried alongside, not into it.
    expect(merged.tokens.total)
      .toBe(merged.tokens.input + merged.tokens.output + merged.tokens.cacheRead + merged.tokens.cacheCreation);
    expect(merged.models.opus.cacheCreation1h).toBe(31);
    expect(merged.models.opus.cacheCreation5m).toBe(13);
  });
});
