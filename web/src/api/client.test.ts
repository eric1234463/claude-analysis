import { describe, it, expect, vi } from 'vitest';
import fixture from './__fixtures__/aggregate-stats.json';
import { AGGREGATE_STATS_KEYS, type AggregateStats } from './types';
import { fetchStats, refreshStats } from './client';

const stats = fixture as AggregateStats;

describe('fetchStats', () => {
  it('requests /api/stats and returns the parsed aggregate', async () => {
    const fake = vi.fn(async () => new Response(JSON.stringify(stats), { status: 200 }));
    const out = await fetchStats(fake as unknown as typeof fetch);
    expect(fake).toHaveBeenCalledWith('/api/stats');
    expect(Object.keys(out).sort()).toStrictEqual([...AGGREGATE_STATS_KEYS]);
    expect(out.totals.tokens.total).toBe(27438);
  });

  it('throws with the status when the response is not ok', async () => {
    const fake = vi.fn(async () => new Response('boom', { status: 503 }));
    await expect(fetchStats(fake as unknown as typeof fetch)).rejects.toThrow(/503/);
  });

  it('lets a JSON parse failure surface rather than returning a partial object', async () => {
    const fake = vi.fn(async () => new Response('{not json', { status: 200 }));
    await expect(fetchStats(fake as unknown as typeof fetch)).rejects.toThrow();
  });
});

describe('refreshStats', () => {
  it('posts to /api/stats/refresh and returns the parsed aggregate', async () => {
    const fake = vi.fn(async () => new Response(JSON.stringify(stats), { status: 200 }));
    const out = await refreshStats(fake as unknown as typeof fetch);
    expect(fake).toHaveBeenCalledWith('/api/stats/refresh', { method: 'POST' });
    expect(Object.keys(out).sort()).toStrictEqual([...AGGREGATE_STATS_KEYS]);
    expect(out.totals.tokens.total).toBe(27438);
  });

  it('throws with the status when the response is not ok', async () => {
    const fake = vi.fn(async () => new Response('boom', { status: 503 }));
    await expect(refreshStats(fake as unknown as typeof fetch)).rejects.toThrow(/503/);
  });

  it('lets a JSON parse failure surface rather than returning a partial object', async () => {
    const fake = vi.fn(async () => new Response('{not json', { status: 200 }));
    await expect(refreshStats(fake as unknown as typeof fetch)).rejects.toThrow();
  });
});
