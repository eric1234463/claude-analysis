import { describe, it, expect } from 'vitest';
import type { AggregateStats, UsageCounts } from './types';
import { recentProjects, RECENT_PROJECT_LIMIT } from './recentProjects';

const cell = {} as UsageCounts;

function days(map: Record<string, string[]>): AggregateStats['days'] {
  return Object.fromEntries(
    Object.entries(map).map(([day, projects]) => [
      day,
      Object.fromEntries(projects.map((p) => [p, cell])),
    ]),
  );
}

describe('recentProjects', () => {
  it('orders by the last day a project saw activity, newest first', () => {
    const ordered = recentProjects(
      days({
        '2026-07-01': ['old', 'mid', 'new'],
        '2026-07-05': ['mid', 'new'],
        '2026-07-09': ['new'],
      }),
    );
    expect(ordered).toStrictEqual(['new', 'mid', 'old']);
  });

  it('does not depend on the insertion order of the day keys', () => {
    const ordered = recentProjects(
      days({ '2026-07-09': ['new'], '2026-07-01': ['old'], '2026-07-05': ['mid'] }),
    );
    expect(ordered).toStrictEqual(['new', 'mid', 'old']);
  });

  it('breaks ties on the same last day by name', () => {
    expect(recentProjects(days({ '2026-07-09': ['b', 'a', 'c'] }))).toStrictEqual(['a', 'b', 'c']);
  });

  it('returns every project, not just the head the card shows', () => {
    const all = ['p1', 'p2', 'p3', 'p4', 'p5'];
    expect(recentProjects(days({ '2026-07-09': all })).length).toBeGreaterThan(
      RECENT_PROJECT_LIMIT,
    );
  });

  it('reaches the same set as the aggregator publishes in `projects`', () => {
    const input = days({ '2026-07-01': ['a', 'b'], '2026-07-09': ['b', 'c'] });
    expect([...recentProjects(input)].sort()).toStrictEqual(['a', 'b', 'c']);
  });

  it('is empty for an empty aggregate', () => {
    expect(recentProjects({})).toStrictEqual([]);
  });
});
