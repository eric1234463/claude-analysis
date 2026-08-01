import { describe, it, expect } from 'vitest';
import fixture from './__fixtures__/aggregate-stats.json';
import { AGGREGATE_STATS_KEYS, type AggregateStats } from './types';

// `as AggregateStats` and not `const stats: AggregateStats = fixture` on purpose: TypeScript widens the
// JSON's literal "skill-tool" to `string`, which a direct annotation rejects. The assertion still has
// teeth — it fails to compile on a missing required key or a wrong value type. Do not "fix" this to a
// direct annotation; it will break the Final Gate's type check.
const stats = fixture as AggregateStats;

describe('web AggregateStats declaration', () => {
  it('declares exactly the eleven sorted top-level keys', () => {
    expect([...AGGREGATE_STATS_KEYS]).toStrictEqual([
      'agents', 'days', 'generatedAt', 'ignoredLines', 'malformedLines', 'models',
      'projects', 'scannedFiles', 'skills', 'tools', 'totals',
    ]);
  });

  it('the fixture aggregate carries exactly those keys', () => {
    expect(Object.keys(stats).sort()).toStrictEqual([...AGGREGATE_STATS_KEYS]);
  });

  it('the fixture matches the hand-computed C-12 headline numbers', () => {
    expect(stats.scannedFiles).toBe(3);
    expect(stats.malformedLines).toBe(3);
    expect(stats.ignoredLines).toBe(5);
    expect(stats.totals.tokens.total).toBe(27438);
    expect(stats.totals.mainTokens.total).toBe(163);
    expect(stats.totals.sidechainTokens.total).toBe(27275);
    expect(stats.totals.sessionsStarted).toBe(2);
  });

  it('is bucketed by local day, not UTC, and counts one session per main file', () => {
    expect(Object.keys(stats.days)).toStrictEqual(['2026-07-09', '2026-07-10']);
    expect(stats.days['2026-07-09']['-fixture-project'].sessionsStarted).toBe(1);
    expect(stats.days['2026-07-09']['-fixture-project'].tokens.total).toBe(27420);
  });
});
