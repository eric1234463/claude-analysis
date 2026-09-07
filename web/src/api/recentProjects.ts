import type { AggregateStats } from './types';

/** Project chips the filter card shows before you expand the rest. */
export const RECENT_PROJECT_LIMIT = 3;

/**
 * Every project ordered by the last day it saw activity, newest first, ties broken by
 * name so the order is stable across refreshes.
 *
 * Derived from the *unfiltered* `days` on purpose: "recent" means recent in the whole
 * history, so narrowing the date range never reshuffles the chips out from under a
 * click. The projects reached here are the same set as `stats.projects` — the
 * aggregator builds that list from these same cells — only in a different order.
 */
export function recentProjects(days: AggregateStats['days']): string[] {
  const lastDay = new Map<string, string>();
  for (const [dayKey, cells] of Object.entries(days)) {
    for (const project of Object.keys(cells)) {
      const seen = lastDay.get(project);
      if (seen === undefined || dayKey > seen) lastDay.set(project, dayKey);
    }
  }
  return [...lastDay]
    .sort(([aName, aDay], [bName, bDay]) => bDay.localeCompare(aDay) || aName.localeCompare(bName))
    .map(([project]) => project);
}
