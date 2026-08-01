import type { AggregateStats } from './types';

export async function fetchStats(fetchImpl: typeof fetch = globalThis.fetch): Promise<AggregateStats> {
  const res = await fetchImpl('/api/stats');
  if (!res.ok) {
    throw new Error(`fetchStats failed: ${res.status}`);
  }
  return (await res.json()) as AggregateStats;
}

export async function refreshStats(fetchImpl: typeof fetch = globalThis.fetch): Promise<AggregateStats> {
  const res = await fetchImpl('/api/stats/refresh', { method: 'POST' });
  if (!res.ok) {
    throw new Error(`refreshStats failed: ${res.status}`);
  }
  return (await res.json()) as AggregateStats;
}
