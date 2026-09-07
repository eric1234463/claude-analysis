/**
 * End-to-end pricing: raw JSONL -> parseTranscript -> aggregate, with NO injected rate lookup.
 *
 * Every other cost test in the repo supplies a stand-in for the rate table, so a rename or a
 * re-dating of the real table would leave them all green. These cases bind the real `rateFor`
 * through the real `aggregate` by going in at the entry point a caller uses and passing only two
 * arguments, so the default parameter is what resolves every figure below.
 *
 * Expected money is computed here from the PUBLISHED USD-per-MTok rates and the published cache
 * multipliers, never pasted from a run of the code.
 */
import { describe, it, expect } from 'vitest';
import type { TokenUsage, TranscriptFile } from './contracts';
import { parseTranscript } from './parser';
import { aggregate } from './aggregator';
import { fileCacheKey } from './file-cache';
import { loadConfig } from './config';

const AT = '2026-08-01T00:00:00.000Z';

/** The zone the server actually runs in, not a literal -- day keys must follow the real config. */
const TIME_ZONE = loadConfig({}).timeZone;

const TRANSCRIPT: TranscriptFile = {
  path: '/transcripts/-fixture-project/session-cost.jsonl',
  project: '-fixture-project',
  kind: 'main',
  sessionId: 'session-cost',
  mtimeMs: 1_700_000_000_000,
  size: 4_096,
};

interface RawUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_creation?: {
    ephemeral_1h_input_tokens?: number;
    ephemeral_5m_input_tokens?: number;
  };
  speed?: string;
}

/** One raw `type: "assistant"` line, exactly as Claude Code writes it. */
const assistantLine = (
  requestId: string,
  timestamp: string,
  model: string,
  usage: RawUsage,
): string => JSON.stringify({
  type: 'assistant',
  requestId,
  timestamp,
  sessionId: 's-cost',
  message: { role: 'assistant', model, usage },
});

/** The whole real stack, with NO third argument -- the default `rateFor` does the pricing. */
const price = (...lines: string[]) =>
  aggregate([parseTranscript(TRANSCRIPT, lines.join('\n').split('\n'), TIME_ZONE)], AT);

/** 12:00 in Asia/Hong_Kong and still the same calendar date at UTC, so the bucketed day key is
 *  `day` under the configured zone without depending on which side of midnight it falls. */
const noonOn = (day: string) => `${day}T04:00:00.000Z`;

/** Published nano-USD per token for a USD-per-MTok pair, with the three cache rates derived from
 *  input by the published multipliers: cache read 0.1x, 5m write 1.25x, 1h write 2x. */
const published = (inputUsdPerMTok: number, outputUsdPerMTok: number) => {
  const input = inputUsdPerMTok * 1000;
  return {
    input,
    output: outputUsdPerMTok * 1000,
    cacheRead: input * 0.1,
    cacheWrite5m: input * 1.25,
    cacheWrite1h: input * 2,
  };
};

/** What the five priced components sum to for `usage` at `rate`. */
const expectedTotal = (rate: ReturnType<typeof published>, usage: TokenUsage) =>
  usage.input * rate.input
  + usage.output * rate.output
  + usage.cacheRead * rate.cacheRead
  + usage.cacheCreation5m * rate.cacheWrite5m
  + usage.cacheCreation1h * rate.cacheWrite1h;

/** The headline sample, matching the shared web fixture's opus-4-8 line. */
const SAMPLE_RAW: RawUsage = {
  input_tokens: 16,
  output_tokens: 183,
  cache_read_input_tokens: 21147,
  cache_creation_input_tokens: 6074,
  cache_creation: { ephemeral_1h_input_tokens: 4003, ephemeral_5m_input_tokens: 2071 },
};

/** The same numbers as the parser resolves them: the nested parts explain the flat total exactly. */
const SAMPLE_PARSED: TokenUsage = {
  input: 16,
  output: 183,
  cacheRead: 21147,
  cacheCreation: 6074,
  cacheCreation1h: 4003,
  cacheCreation5m: 2071,
};

const COST_FIELDS = [
  'input', 'output', 'cacheRead', 'cacheWrite5m', 'cacheWrite1h',
  'total', 'uncachedCacheCost', 'unpricedTokens',
] as const;

describe('cost through the real pipeline and the real rate table', () => {
  it('prices an Opus 4.8 turn against the committed table, field by field', () => {
    const stats = price(assistantLine('r1', noonOn('2026-07-09'), 'claude-opus-4-8', SAMPLE_RAW));

    expect(Object.keys(stats.days)).toStrictEqual(['2026-07-09']);
    expect(stats.totals.cost).toStrictEqual({
      input: 80_000, // 16 x 5000
      output: 4_575_000, // 183 x 25000
      cacheRead: 10_573_500, // 21147 x 500
      cacheWrite5m: 12_943_750, // 2071 x 6250
      cacheWrite1h: 40_030_000, // 4003 x 10000
      total: 68_202_250,
      uncachedCacheCost: 136_105_000, // (4003 + 2071 + 21147) x 5000
      unpricedTokens: 0,
    });
    // Independently: the same figure derived from the published $5 / $25 per MTok rates.
    expect(stats.totals.cost.total)
      .toBe(expectedTotal(published(5, 25), SAMPLE_PARSED));
    expect(stats.totals.modelCost['claude-opus-4-8']).toStrictEqual(stats.totals.cost);
  });

  it('prices both sides of the Sonnet 5 2026-09-01 boundary from the published rates', () => {
    // Two separate runs, so each assertion is bound to one specific day key. Swapping the two
    // dates therefore swaps which figure each run must match, instead of cancelling out.
    const intro = price(
      assistantLine('r-intro', noonOn('2026-08-31'), 'claude-sonnet-5', SAMPLE_RAW),
    );
    const standard = price(
      assistantLine('r-std', noonOn('2026-09-01'), 'claude-sonnet-5', SAMPLE_RAW),
    );

    expect(Object.keys(intro.days)).toStrictEqual(['2026-08-31']);
    expect(Object.keys(standard.days)).toStrictEqual(['2026-09-01']);

    // $2 / $10 per MTok up to and including 2026-08-31; $3 / $15 from 2026-09-01.
    expect(intro.totals.cost.total).toBe(expectedTotal(published(2, 10), SAMPLE_PARSED));
    expect(standard.totals.cost.total).toBe(expectedTotal(published(3, 15), SAMPLE_PARSED));
    expect(standard.totals.cost.total).not.toBe(intro.totals.cost.total);
    // Structural cross-check: every rate scales 3/2 across the boundary, cache rates included.
    expect(standard.totals.cost.total).toBe(intro.totals.cost.total * 1.5);
    expect(intro.totals.cost.unpricedTokens).toBe(0);
    expect(standard.totals.cost.unpricedTokens).toBe(0);
  });

  it('prices a fast Opus 5 request at exactly double the standard one', () => {
    const standard = price(
      assistantLine('r-s', noonOn('2026-07-09'), 'claude-opus-5', SAMPLE_RAW),
    );
    const fast = price(
      assistantLine('r-f', noonOn('2026-07-09'), 'claude-opus-5', { ...SAMPLE_RAW, speed: 'fast' }),
    );

    expect(standard.totals.cost.total).toBe(expectedTotal(published(5, 25), SAMPLE_PARSED));
    expect(fast.totals.cost.total).toBe(expectedTotal(published(10, 50), SAMPLE_PARSED));
    for (const field of COST_FIELDS) {
      expect(fast.totals.cost[field]).toBe(standard.totals.cost[field] * 2);
    }
  });

  it('prices an absent nested split entirely at the 5-minute rate', () => {
    // No `cache_creation` object at all: C-1 attributes the unexplained remainder to 5m, the
    // cheaper TTL, so an unknown split understates spend rather than pricing it at zero.
    const stats = price(assistantLine('r-flat', noonOn('2026-07-09'), 'claude-opus-4-8', {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 1000,
    }));
    const rate = published(5, 25);

    expect(stats.totals.tokens.cacheCreation5m).toBe(1000);
    expect(stats.totals.tokens.cacheCreation1h).toBe(0);
    expect(stats.totals.cost.cacheWrite5m).toBe(1000 * rate.cacheWrite5m); // 6_250_000
    expect(stats.totals.cost.cacheWrite1h).toBe(0);
    expect(stats.totals.cost.total).toBe(1000 * rate.cacheWrite5m);
    expect(stats.totals.cost.uncachedCacheCost).toBe(1000 * rate.input); // 5_000_000
  });

  it('leaves an unknown model unpriced but visible', () => {
    const stats = price(assistantLine('r-unknown', noonOn('2026-07-09'), 'claude-nonexistent-9', {
      input_tokens: 5,
      output_tokens: 6,
      cache_read_input_tokens: 7,
      cache_creation_input_tokens: 8,
    }));
    const unpriced = {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite5m: 0,
      cacheWrite1h: 0,
      total: 0,
      uncachedCacheCost: 0,
      unpricedTokens: 26, // 5 + 6 + 7 + 8
    };

    expect(stats.totals.cost).toStrictEqual(unpriced);
    expect(stats.totals.modelCost).toStrictEqual({ 'claude-nonexistent-9': unpriced });
    expect(stats.models).toStrictEqual(['claude-nonexistent-9']);
  });

  it('keys the file cache at v4, so entries written before ParsedFile.session miss once', () => {
    expect(fileCacheKey(
      { path: '/transcripts/-p/s.jsonl', mtimeMs: 1234, size: 56 },
      'Asia/Hong_Kong',
    )).toBe('/transcripts/-p/s.jsonl:1234:56:Asia/Hong_Kong:v4');
  });
});
