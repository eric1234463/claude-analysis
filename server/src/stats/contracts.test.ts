import { describe, it, expect } from 'vitest';
import {
  AGGREGATE_STATS_KEYS,
  APP_CONFIG,
  STATS_PIPELINE,
  type AggregateStats,
} from './contracts';

describe('AGGREGATE_STATS_KEYS', () => {
  it('is exactly the eleven declared top-level keys, sorted', () => {
    expect([...AGGREGATE_STATS_KEYS]).toStrictEqual([
      'agents', 'days', 'generatedAt', 'ignoredLines', 'malformedLines', 'models',
      'projects', 'scannedFiles', 'skills', 'tools', 'totals',
    ]);
  });

  it('is sorted ascending and free of duplicates', () => {
    const keys = [...AGGREGATE_STATS_KEYS];
    expect(keys).toStrictEqual([...keys].sort());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('matches the keys of a minimal AggregateStats value', () => {
    const empty: AggregateStats = {
      generatedAt: '2026-08-01T00:00:00.000Z',
      scannedFiles: 0,
      malformedLines: 0,
      ignoredLines: 0,
      days: {},
      projects: [],
      models: [],
      tools: [],
      skills: [],
      agents: [],
      totals: {
        tokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, cacheCreation1h: 0, cacheCreation5m: 0, total: 0 },
        mainTokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, cacheCreation1h: 0, cacheCreation5m: 0, total: 0 },
        sidechainTokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, cacheCreation1h: 0, cacheCreation5m: 0, total: 0 },
        sessionsStarted: 0,
        toolCalls: 0,
        toolErrors: 0,
        skillInvocations: 0,
        agentRuns: 0,
        models: {},
        tools: {},
        skills: {},
        skillTokens: {},
        throughput: { outputTokens: 0, durationMs: 0, requests: 0, excludedRequests: 0 },
        mainThroughput: { outputTokens: 0, durationMs: 0, requests: 0, excludedRequests: 0 },
        sidechainThroughput: { outputTokens: 0, durationMs: 0, requests: 0, excludedRequests: 0 },
        modelThroughput: {},
        skillThroughput: {},
        agents: {},
        cost: {
          input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0,
          total: 0, uncachedCacheCost: 0, unpricedTokens: 0,
        },
        modelCost: {},
      },
    };
    expect(Object.keys(empty).sort()).toStrictEqual([...AGGREGATE_STATS_KEYS]);
  });
});

describe('injection tokens', () => {
  it('are the exact literals every consumer will reference', () => {
    expect(STATS_PIPELINE).toBe('STATS_PIPELINE');
    expect(APP_CONFIG).toBe('APP_CONFIG');
  });
});
