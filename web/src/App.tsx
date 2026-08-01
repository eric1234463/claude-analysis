import type { AggregateStats, UsageCounts } from './api/types';
import type { StatsFilter } from './api/filterStats';

export interface AppDeps {
  filterStats: (stats: AggregateStats, filter: StatsFilter) => AggregateStats;
  daySeries: (stats: AggregateStats) => Array<{ day: string; counts: UsageCounts }>;
}

export interface AppProps {
  stats: AggregateStats;
  /** Defaults to the real implementations from './api/filterStats'. Injected in tests. */
  deps?: AppDeps;
}

export function App(_props: AppProps) {
  return <div data-testid="app-shell" />;
}
