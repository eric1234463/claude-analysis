import { describe, it, expect } from 'vitest';
import {
  AGGREGATE_STATS_KEYS,
  type AggregateStats,
  type ParsedFile,
  type TokenUsage,
  type UsageEvent,
} from './contracts';
import { aggregate } from './aggregator';

const AT = '2026-08-01T00:00:00.000Z';
const usage = (input: number, output: number, cacheRead = 0, cacheCreation = 0): TokenUsage =>
  ({ input, output, cacheRead, cacheCreation, cacheCreation1h: 0, cacheCreation5m: 0 });

/** Spelt out by field, so a cache-creation split can never be transposed positionally. */
const splitUsage = (overrides: Partial<TokenUsage> = {}): TokenUsage => ({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheCreation: 0,
  cacheCreation1h: 0,
  cacheCreation5m: 0,
  ...overrides,
});

const file = (events: UsageEvent[], malformedLines = 0, ignoredLines = 0): ParsedFile =>
  ({ events, malformedLines, ignoredLines });

const tokenEvent = (
  overrides: Partial<Extract<UsageEvent, { kind: 'token' }>> = {},
): Extract<UsageEvent, { kind: 'token' }> => ({
  kind: 'token',
  day: '2026-08-05',
  project: '-p',
  model: 'claude-opus-5',
  dedupeKey: overrides.dedupeKey ?? 'r1',
  usage: usage(1, 500),
  isSidechain: false,
  durationMs: 5000,
  speed: 'standard',
  ...overrides,
});

/** The day/project cell every `tokenEvent()` lands in. */
const defaultCell = (stats: AggregateStats) => stats.days['2026-08-05']['-p'];
const throughputCell = defaultCell;

const mainFile = file(
  [
    { kind: 'session-start', day: '2026-07-09', project: '-a', sessionId: 's1' },
    { kind: 'token', day: '2026-07-09', project: '-a', model: 'claude-opus-4-8',
      dedupeKey: 'r1', usage: usage(10, 20, 100, 5), isSidechain: false, speed: 'standard' },
    { kind: 'token', day: '2026-07-09', project: '-a', model: '<synthetic>',
      dedupeKey: 'u1', usage: usage(5, 5), isSidechain: false, speed: 'standard' },
    { kind: 'tool-call', day: '2026-07-09', project: '-a', tool: 'Bash', isSidechain: false },
    { kind: 'tool-error', day: '2026-07-09', project: '-a', tool: 'Bash', isSidechain: false },
    { kind: 'tool-call', day: '2026-07-09', project: '-a', tool: 'Read', isSidechain: false },
    { kind: 'skill', day: '2026-07-09', project: '-a', name: 'brainstorming',
      source: 'skill-tool', isSidechain: false },
    { kind: 'skill', day: '2026-07-09', project: '-a', name: '/context',
      source: 'slash-command', isSidechain: false },
  ],
  3,
  4,
);

const sideFile = file([
  { kind: 'agent-run', day: '2026-07-09', project: '-a', agentType: 'general-purpose' },
  { kind: 'token', day: '2026-07-09', project: '-a', model: 'claude-opus-4-8', dedupeKey: 'r2',
    usage: usage(2, 153, 21047, 6069), isSidechain: true, speed: 'standard',
    agentId: 'a1', agentType: 'general-purpose' },
]);

const otherFile = file(
  [
    { kind: 'session-start', day: '2026-07-10', project: '-b', sessionId: 's2' },
    { kind: 'token', day: '2026-07-10', project: '-b', model: 'claude-sonnet-5', dedupeKey: 'r3',
      usage: usage(7, 11), isSidechain: false, speed: 'standard' },
  ],
  0,
  1,
);

const all = () => aggregate([mainFile, sideFile, otherFile], AT);

describe('shape and file accounting', () => {
  it('emits exactly the eleven declared top-level keys', () => {
    expect(Object.keys(all()).sort()).toStrictEqual([...AGGREGATE_STATS_KEYS]);
  });

  it('reports the file count and the summed line counters', () => {
    const s = all();
    expect(s.generatedAt).toBe(AT);
    expect(s.scannedFiles).toBe(3);
    expect(s.malformedLines).toBe(3);
    expect(s.ignoredLines).toBe(5);
  });
});

describe('the day x project fact table', () => {
  it('places every event in its day/project cell', () => {
    const s = all();
    expect(Object.keys(s.days)).toStrictEqual(['2026-07-09', '2026-07-10']);
    expect(Object.keys(s.days['2026-07-09'])).toStrictEqual(['-a']);
    expect(Object.keys(s.days['2026-07-10'])).toStrictEqual(['-b']);
  });

  it('splits main and sidechain tokens and keeps their sum in tokens', () => {
    const cell = all().days['2026-07-09']['-a'];
    expect(cell.mainTokens).toStrictEqual({
      input: 15, output: 25, cacheRead: 100,
      cacheCreation: 5, cacheCreation1h: 0, cacheCreation5m: 0, total: 145,
    });
    expect(cell.sidechainTokens).toStrictEqual({
      input: 2, output: 153, cacheRead: 21047,
      cacheCreation: 6069, cacheCreation1h: 0, cacheCreation5m: 0, total: 27271,
    });
    expect(cell.tokens).toStrictEqual({
      input: 17, output: 178, cacheRead: 21147,
      cacheCreation: 6074, cacheCreation1h: 0, cacheCreation5m: 0, total: 27416,
    });
  });

  it('rolls totals up as the sum of every cell', () => {
    const s = all();
    expect(s.totals.tokens).toStrictEqual({
      input: 24, output: 189, cacheRead: 21147,
      cacheCreation: 6074, cacheCreation1h: 0, cacheCreation5m: 0, total: 27434,
    });
    expect(s.totals.sessionsStarted).toBe(2);
    expect(s.totals.toolCalls).toBe(2);
    expect(s.totals.toolErrors).toBe(1);
    expect(s.totals.skillInvocations).toBe(2);
    expect(s.totals.agentRuns).toBe(1);
  });
});

describe('dimensions', () => {
  it('excludes <synthetic> from models but keeps its tokens in the totals', () => {
    const s = all();
    expect(s.models).toStrictEqual(['claude-opus-4-8', 'claude-sonnet-5']);
    expect(Object.keys(s.totals.models)).toStrictEqual(['claude-opus-4-8', 'claude-sonnet-5']);
    expect(Object.keys(s.days['2026-07-09']['-a'].models)).toStrictEqual(['claude-opus-4-8']);
    expect(s.totals.tokens.input).toBe(24);
  });

  it('counts tool calls and errors independently', () => {
    expect(all().totals.tools).toStrictEqual({
      Bash: { calls: 1, errors: 1 },
      Read: { calls: 1, errors: 0 },
    });
    expect(all().tools).toStrictEqual(['Bash', 'Read']);
  });

  it('keys skills by source and name, and lists them sorted', () => {
    const s = all();
    expect(s.totals.skills)
      .toStrictEqual({ 'skill-tool|brainstorming': 1, 'slash-command|/context': 1 });
    expect(s.skills).toStrictEqual([
      { name: 'brainstorming', source: 'skill-tool' },
      { name: '/context', source: 'slash-command' },
    ]);
  });

  it('rolls agent runs and sidechain tokens up per agentType', () => {
    const s = all();
    expect(s.agents).toStrictEqual(['general-purpose']);
    expect(s.totals.agents).toStrictEqual({
      'general-purpose': {
        runs: 1,
        tokens: {
          input: 2, output: 153, cacheRead: 21047,
          cacheCreation: 6069, cacheCreation1h: 0, cacheCreation5m: 0, total: 27271,
        },
      },
    });
  });

  it('lists projects sorted and derived from the cells', () => {
    expect(all().projects).toStrictEqual(['-a', '-b']);
  });

  it('rolls token events up per attributed skill, merging main and sidechain under one bare name', () => {
    const s = aggregate([file([
      { kind: 'token', day: '2026-07-09', project: '-a', model: 'claude-opus-4-8',
        dedupeKey: 'r1', usage: usage(1, 4), isSidechain: false, speed: 'standard',
        skill: 'brainstorming' },
      { kind: 'token', day: '2026-07-09', project: '-a', model: 'claude-opus-4-8',
        dedupeKey: 'r2', usage: usage(2, 153, 21047, 6069), isSidechain: true, speed: 'standard',
        agentType: 'general-purpose', skill: 'brainstorming' },
      { kind: 'token', day: '2026-07-09', project: '-a', model: 'claude-opus-4-8',
        dedupeKey: 'r3', usage: usage(9, 9), isSidechain: false, speed: 'standard',
        skill: 'writing-plans' },
      // Unattributed: counted in tokens, absent from skillTokens.
      { kind: 'token', day: '2026-07-09', project: '-a', model: 'claude-opus-4-8',
        dedupeKey: 'r4', usage: usage(100, 100), isSidechain: false, speed: 'standard' },
    ])], AT);

    expect(s.totals.skillTokens).toStrictEqual({
      brainstorming: {
        input: 3, output: 157, cacheRead: 21047,
        cacheCreation: 6069, cacheCreation1h: 0, cacheCreation5m: 0, total: 27276,
      },
      'writing-plans': {
        input: 9, output: 9, cacheRead: 0,
        cacheCreation: 0, cacheCreation1h: 0, cacheCreation5m: 0, total: 18,
      },
    });
    // The unattributed turn is still in tokens, so skillTokens never has to sum to it.
    expect(s.totals.tokens.input).toBe(112);
  });

  it('leaves skillTokens empty when nothing was attributed', () => {
    expect(all().totals.skillTokens).toStrictEqual({});
  });
});

describe('throughput aggregation', () => {
  it('accumulates an eligible main event into throughput, mainThroughput and modelThroughput', () => {
    const stats = aggregate([file([tokenEvent()])], AT);
    const expected = {
      outputTokens: 500,
      durationMs: 5000,
      requests: 1,
      excludedRequests: 0,
    };

    expect(throughputCell(stats).throughput).toStrictEqual(expected);
    expect(throughputCell(stats).mainThroughput).toStrictEqual(expected);
    expect(throughputCell(stats).sidechainThroughput).toStrictEqual({
      outputTokens: 0,
      durationMs: 0,
      requests: 0,
      excludedRequests: 0,
    });
    expect(throughputCell(stats).modelThroughput).toStrictEqual({ 'claude-opus-5': expected });
    expect(throughputCell(stats).skillThroughput).toStrictEqual({});
  });

  it('credits an eligible sidechain event with a skill to sidechain and skill cells', () => {
    const stats = aggregate([
      file([tokenEvent({ isSidechain: true, skill: 'brainstorming' })]),
    ], AT);

    expect(throughputCell(stats).sidechainThroughput.requests).toBe(1);
    expect(throughputCell(stats).mainThroughput.requests).toBe(0);
    expect(throughputCell(stats).skillThroughput.brainstorming).toStrictEqual({
      outputTokens: 500,
      durationMs: 5000,
      requests: 1,
      excludedRequests: 0,
    });
  });

  it('excludes each ineligible kind without creating model or skill entries', () => {
    const stats = aggregate([file([
      tokenEvent({ dedupeKey: 'a', durationMs: undefined, skill: 'no-bracket' }),
      tokenEvent({
        dedupeKey: 'b',
        usage: usage(1, 50),
        skill: 'below-floor',
      }),
      tokenEvent({ dedupeKey: 'c', model: '<synthetic>', skill: 'synthetic' }),
    ])], AT);

    expect(throughputCell(stats).throughput).toStrictEqual({
      outputTokens: 0,
      durationMs: 0,
      requests: 0,
      excludedRequests: 3,
    });
    expect(throughputCell(stats).modelThroughput).toStrictEqual({});
    expect(throughputCell(stats).skillThroughput).toStrictEqual({});
  });

  it('accepts an event exactly at the minimum output-token threshold', () => {
    const stats = aggregate([file([tokenEvent({ usage: usage(1, 100) })])], AT);

    expect(throughputCell(stats).throughput).toStrictEqual({
      outputTokens: 100,
      durationMs: 5000,
      requests: 1,
      excludedRequests: 0,
    });
  });

  it('holds the requests plus exclusions identity in day cells and totals', () => {
    const stats = aggregate([file([
      tokenEvent({ dedupeKey: 'a' }),
      tokenEvent({ dedupeKey: 'b', durationMs: undefined }),
      tokenEvent({ dedupeKey: 'c', isSidechain: true }),
    ])], AT);
    const dayCell = throughputCell(stats);

    expect(dayCell.throughput.requests + dayCell.throughput.excludedRequests).toBe(3);
    expect(stats.totals.throughput.requests + stats.totals.throughput.excludedRequests).toBe(3);
    expect(
      stats.totals.mainThroughput.requests
      + stats.totals.mainThroughput.excludedRequests
      + stats.totals.sidechainThroughput.requests
      + stats.totals.sidechainThroughput.excludedRequests,
    ).toBe(3);
  });

  it('leaves throughput cells zeroed when a file contains no token events', () => {
    const stats = aggregate([file([
      { kind: 'session-start', day: '2026-08-05', project: '-p', sessionId: 's1' },
    ])], AT);
    const zero = { outputTokens: 0, durationMs: 0, requests: 0, excludedRequests: 0 };

    expect(throughputCell(stats).throughput).toStrictEqual(zero);
    expect(throughputCell(stats).mainThroughput).toStrictEqual(zero);
    expect(throughputCell(stats).sidechainThroughput).toStrictEqual(zero);
    expect(throughputCell(stats).modelThroughput).toStrictEqual({});
    expect(throughputCell(stats).skillThroughput).toStrictEqual({});
  });

  it('sorts modelThroughput and skillThroughput keys like every other record', () => {
    const stats = aggregate([file([
      tokenEvent({ dedupeKey: 'a', model: 'zeta-model', skill: 'zeta-skill' }),
      tokenEvent({ dedupeKey: 'b', model: 'alpha-model', skill: 'alpha-skill' }),
    ])], AT);

    expect(Object.keys(throughputCell(stats).modelThroughput))
      .toStrictEqual(['alpha-model', 'zeta-model']);
    expect(Object.keys(throughputCell(stats).skillThroughput))
      .toStrictEqual(['alpha-skill', 'zeta-skill']);
  });
});

describe('cost pricing', () => {
  /** Stand-in for C-5's rate table: two rows, `undefined` for anything else, never throws.
   *  The tests must not depend on the real table's contents. */
  const fakeRateFor = (model: string, _day: string, speed: 'standard' | 'fast') => {
    if (model === 'test-model') {
      return { input: 1000, output: 2000, cacheRead: 100, cacheWrite5m: 1250, cacheWrite1h: 2000 };
    }
    if (model === 'test-model-fast' && speed === 'fast') {
      return { input: 2000, output: 4000, cacheRead: 200, cacheWrite5m: 2500, cacheWrite1h: 4000 };
    }
    return undefined;
  };

  /** Same rates, tripled from 2026-09-01 — proves `event.day` reaches the lookup. */
  const dayVaryingRateFor = (model: string, day: string, _speed: 'standard' | 'fast') => {
    if (model !== 'test-model') return undefined;
    const scale = day >= '2026-09-01' ? 3 : 1;
    return {
      input: 1000 * scale,
      output: 2000 * scale,
      cacheRead: 100 * scale,
      cacheWrite5m: 1250 * scale,
      cacheWrite1h: 2000 * scale,
    };
  };

  const ZERO_COST = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite5m: 0,
    cacheWrite1h: 0,
    total: 0,
    uncachedCacheCost: 0,
    unpricedTokens: 0,
  };

  /** 10 in, 20 out, 30 cache read, 90 cache creation split 40 (1h) / 50 (5m). */
  const SAMPLE = splitUsage({
    input: 10,
    output: 20,
    cacheRead: 30,
    cacheCreation: 90,
    cacheCreation1h: 40,
    cacheCreation5m: 50,
  });

  const SAMPLE_COST = {
    input: 10_000, // 10 x 1000
    output: 40_000, // 20 x 2000
    cacheRead: 3_000, // 30 x 100
    cacheWrite5m: 62_500, // 50 x 1250
    cacheWrite1h: 80_000, // 40 x 2000
    total: 195_500,
    uncachedCacheCost: 120_000, // (40 + 50 + 30) x 1000
    unpricedTokens: 0,
  };

  const priced = (overrides: Partial<Extract<UsageEvent, { kind: 'token' }>> = {}) =>
    tokenEvent({ model: 'test-model', usage: SAMPLE, ...overrides });

  it('prices a single event into the cell and its model entry', () => {
    const stats = aggregate([file([priced()])], AT, fakeRateFor);

    expect(defaultCell(stats).cost).toStrictEqual(SAMPLE_COST);
    expect(defaultCell(stats).modelCost).toStrictEqual({ 'test-model': SAMPLE_COST });
  });

  it('keeps cost.total equal to the sum of its five components', () => {
    const { cost } = defaultCell(aggregate([file([priced()])], AT, fakeRateFor));

    expect(cost.total).toBe(
      cost.input + cost.output + cost.cacheRead + cost.cacheWrite5m + cost.cacheWrite1h,
    );
  });

  it('keeps cost equal to the sum over modelCost, field by field, for a two-model cell', () => {
    const stats = aggregate([file([
      priced({ dedupeKey: 'a' }),
      priced({
        dedupeKey: 'b',
        model: 'test-model-fast',
        speed: 'fast',
        usage: splitUsage({
          input: 3, output: 4, cacheRead: 5,
          cacheCreation: 13, cacheCreation1h: 6, cacheCreation5m: 7,
        }),
      }),
    ])], AT, fakeRateFor);
    const { cost, modelCost } = defaultCell(stats);

    expect(Object.keys(modelCost)).toStrictEqual(['test-model', 'test-model-fast']);
    for (const field of Object.keys(ZERO_COST) as (keyof typeof ZERO_COST)[]) {
      expect(cost[field]).toBe(modelCost['test-model'][field] + modelCost['test-model-fast'][field]);
    }
    expect(cost.total).toBe(modelCost['test-model'].total + modelCost['test-model-fast'].total);
  });

  it('routes event.speed to the lookup, so the fast row costs double the standard one', () => {
    const standard = defaultCell(
      aggregate([file([priced({ speed: 'standard' })])], AT, fakeRateFor),
    ).cost;
    const fast = defaultCell(
      aggregate(
        [file([priced({ model: 'test-model-fast', speed: 'fast' })])],
        AT,
        fakeRateFor,
      ),
    ).cost;

    expect(standard).toStrictEqual(SAMPLE_COST);
    for (const field of Object.keys(ZERO_COST) as (keyof typeof ZERO_COST)[]) {
      expect(fast[field]).toBe(standard[field] * 2);
    }
  });

  it('routes event.day to the lookup, so identical tokens on two days cost differently', () => {
    const stats = aggregate([file([
      priced({ dedupeKey: 'a', day: '2026-08-05' }),
      priced({ dedupeKey: 'b', day: '2026-09-05' }),
    ])], AT, dayVaryingRateFor);
    const before = stats.days['2026-08-05']['-p'].cost;
    const after = stats.days['2026-09-05']['-p'].cost;

    expect(before).toStrictEqual(SAMPLE_COST);
    expect(after.total).not.toBe(before.total);
    for (const field of Object.keys(ZERO_COST) as (keyof typeof ZERO_COST)[]) {
      expect(after[field]).toBe(before[field] * 3);
    }
  });

  it('counts an unpriced model as unpricedTokens and still gives it a modelCost entry', () => {
    const stats = aggregate([file([priced({ model: 'unknown-model' })])], AT, fakeRateFor);
    // 10 + 20 + 30 + 90 -- the flat cacheCreation, not the split.
    const unpriced = { ...ZERO_COST, unpricedTokens: 150 };

    expect(defaultCell(stats).cost).toStrictEqual(unpriced);
    expect(defaultCell(stats).modelCost).toStrictEqual({ 'unknown-model': unpriced });
    expect(stats.totals.cost).toStrictEqual(unpriced);
  });

  it('excludes <synthetic> from cost and from modelCost even with non-zero tokens', () => {
    const stats = aggregate([file([priced({
      model: '<synthetic>',
      usage: splitUsage({
        input: 999, output: 7, cacheRead: 5,
        cacheCreation: 11, cacheCreation1h: 4, cacheCreation5m: 7,
      }),
    })])], AT, fakeRateFor);

    expect(defaultCell(stats).cost).toStrictEqual(ZERO_COST);
    expect(defaultCell(stats).modelCost).toStrictEqual({});
    expect(stats.totals.cost).toStrictEqual(ZERO_COST);
    expect(stats.totals.modelCost).toStrictEqual({});
    // The tokens themselves are still counted -- only the money is excluded.
    expect(defaultCell(stats).tokens.input).toBe(999);
  });

  it('keeps sibling cells separate and sums them into totals.cost', () => {
    const stats = aggregate([file([
      priced({ dedupeKey: 'a', project: '-a', usage: splitUsage({ input: 10 }) }),
      priced({ dedupeKey: 'b', project: '-b', usage: splitUsage({ input: 1 }) }),
    ])], AT, fakeRateFor);

    expect(stats.days['2026-08-05']['-a'].cost)
      .toStrictEqual({ ...ZERO_COST, input: 10_000, total: 10_000 });
    expect(stats.days['2026-08-05']['-b'].cost)
      .toStrictEqual({ ...ZERO_COST, input: 1_000, total: 1_000 });
    expect(stats.totals.cost).toStrictEqual({ ...ZERO_COST, input: 11_000, total: 11_000 });
  });

  it('leaves every cache figure at zero for an event with no cache activity', () => {
    const stats = aggregate(
      [file([priced({ usage: splitUsage({ input: 10, output: 20 }) })])],
      AT,
      fakeRateFor,
    );

    expect(defaultCell(stats).cost).toStrictEqual({
      ...ZERO_COST,
      input: 10_000,
      output: 40_000,
      total: 50_000,
    });
  });

  it('bases uncachedCacheCost on the split, not on the flat cacheCreation field', () => {
    // The splits sum ABOVE the flat field, so the two bases disagree: 8 + 9 = 17, not 10.
    const stats = aggregate([file([priced({
      usage: splitUsage({ cacheCreation: 10, cacheCreation1h: 8, cacheCreation5m: 9 }),
    })])], AT, fakeRateFor);

    expect(defaultCell(stats).cost.uncachedCacheCost).toBe(17_000);
  });

  it('sorts modelCost keys like every other record, matching models', () => {
    const stats = aggregate([file([
      priced({ dedupeKey: 'a', model: 'zeta-model' }),
      priced({ dedupeKey: 'b', model: 'test-model' }),
      priced({ dedupeKey: 'c', model: 'alpha-model' }),
    ])], AT, fakeRateFor);

    expect(Object.keys(defaultCell(stats).modelCost))
      .toStrictEqual(['alpha-model', 'test-model', 'zeta-model']);
    expect(Object.keys(defaultCell(stats).modelCost))
      .toStrictEqual(Object.keys(defaultCell(stats).models));
    expect(Object.keys(stats.totals.modelCost))
      .toStrictEqual(['alpha-model', 'test-model', 'zeta-model']);
  });

  it('prices via the real rate table when called with two arguments', () => {
    const stats = aggregate([file([tokenEvent({ model: 'claude-opus-5', speed: 'standard' })])], AT);
    const { cost, modelCost } = defaultCell(stats);

    expect(cost.unpricedTokens).toBe(0);
    expect(cost.input).toBeGreaterThan(0);
    expect(cost.output).toBeGreaterThan(0);
    expect(cost.total).toBe(
      cost.input + cost.output + cost.cacheRead + cost.cacheWrite5m + cost.cacheWrite1h,
    );
    expect(modelCost['claude-opus-5']).toStrictEqual(cost);
  });

  it('carries the cache-creation split into TokenTotals without changing total', () => {
    const stats = aggregate([file([
      priced({ dedupeKey: 'a' }),
      priced({
        dedupeKey: 'b',
        usage: splitUsage({
          input: 1, output: 2, cacheRead: 3,
          cacheCreation: 9, cacheCreation1h: 4, cacheCreation5m: 5,
        }),
      }),
    ])], AT, fakeRateFor);
    // total stays input + output + cacheRead + cacheCreation -- the split must not be added again.
    const expected = {
      input: 11,
      output: 22,
      cacheRead: 33,
      cacheCreation: 99,
      cacheCreation1h: 44,
      cacheCreation5m: 55,
      total: 165,
    };

    expect(defaultCell(stats).tokens).toStrictEqual(expected);
    expect(defaultCell(stats).mainTokens).toStrictEqual(expected);
    expect(defaultCell(stats).models['test-model']).toStrictEqual(expected);
  });
});

describe('determinism', () => {
  it('emits keys in ascending order regardless of event order', () => {
    const shuffled = aggregate([otherFile, sideFile, mainFile], AT);
    expect(Object.keys(shuffled.days)).toStrictEqual(['2026-07-09', '2026-07-10']);
    expect(shuffled.projects).toStrictEqual(['-a', '-b']);
    expect(shuffled.models).toStrictEqual(['claude-opus-4-8', 'claude-sonnet-5']);
    expect(shuffled.totals).toStrictEqual(all().totals);
  });

  it('returns a valid empty aggregate for no files', () => {
    const s = aggregate([], AT);
    expect(Object.keys(s).sort()).toStrictEqual([...AGGREGATE_STATS_KEYS]);
    expect(s.scannedFiles).toBe(0);
    expect(s.days).toStrictEqual({});
    expect(s.projects).toStrictEqual([]);
    expect(s.totals.tokens).toStrictEqual({
      input: 0, output: 0, cacheRead: 0,
      cacheCreation: 0, cacheCreation1h: 0, cacheCreation5m: 0, total: 0,
    });
  });

  it('sorts agents, skills, and every nested map, even with an adversarially-ordered fixture', () => {
    // Second project '-z' in the same day as '-a' below, inserted (via file order) before it.
    const fileZ = file([
      { kind: 'token', day: '2026-07-09', project: '-z', model: 'zzz-model', dedupeKey: 'dz1',
        usage: usage(1, 1), isSidechain: false, speed: 'standard' },
      { kind: 'tool-call', day: '2026-07-09', project: '-z', tool: 'Zulu', isSidechain: false },
    ]);

    // Baseline project '-a': establishes the 'general-purpose' agentType and the
    // 'brainstorming' skill, both of which the third file below will precede alphabetically.
    const fileA = file([
      { kind: 'token', day: '2026-07-09', project: '-a', model: 'aaa-model', dedupeKey: 'da1',
        usage: usage(1, 1), isSidechain: false, speed: 'standard' },
      { kind: 'tool-call', day: '2026-07-09', project: '-a', tool: 'Bash', isSidechain: false },
      { kind: 'skill', day: '2026-07-09', project: '-a', name: 'brainstorming',
        source: 'skill-tool', isSidechain: false },
      { kind: 'agent-run', day: '2026-07-09', project: '-a', agentType: 'general-purpose' },
    ]);

    // Third file: its agentType and skill both sort BEFORE fileA's, but are inserted AFTER it.
    const fileThird = file([
      { kind: 'agent-run', day: '2026-07-09', project: '-a', agentType: 'aa-agent' },
      { kind: 'skill', day: '2026-07-09', project: '-a', name: 'apple',
        source: 'skill-tool', isSidechain: false },
    ]);

    const out = aggregate([fileZ, fileA, fileThird], AT);
    const skillSortKey = (s: { source: string; name: string }) => `${s.source}|${s.name}`;

    // Each collection must equal its own sorted copy -- self-checking, no hardcoded order.
    expect(out.agents).toStrictEqual([...out.agents].sort());
    expect(out.skills.map(skillSortKey)).toStrictEqual([...out.skills.map(skillSortKey)].sort());
    expect(Object.keys(out.totals.tools)).toStrictEqual([...Object.keys(out.totals.tools)].sort());
    expect(Object.keys(out.totals.models)).toStrictEqual([...Object.keys(out.totals.models)].sort());
    expect(Object.keys(out.days['2026-07-09']))
      .toStrictEqual([...Object.keys(out.days['2026-07-09'])].sort());
  });
});
