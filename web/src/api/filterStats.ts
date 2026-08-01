import type { AggregateStats, UsageCounts } from './types';

export interface StatsFilter {
  from?: string;
  to?: string;
  projects?: readonly string[];
}

export function filterStats(_stats: AggregateStats, _filter: StatsFilter): AggregateStats {
  throw new Error('not implemented');
}

export function daySeries(_stats: AggregateStats): Array<{ day: string; counts: UsageCounts }> {
  throw new Error('not implemented');
}
