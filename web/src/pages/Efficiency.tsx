import type { AggregateStats, UsageCounts } from '../api/types';

export interface PageProps {
  stats: AggregateStats;
  series: Array<{ day: string; counts: UsageCounts }>;
}

export function Efficiency(_props: PageProps) {
  return <section data-testid="page-efficiency" />;
}
