import { useState } from 'react';
import type { AggregateStats, UsageCounts } from './api/types';
import type { StatsFilter } from './api/filterStats';
import { filterStats as realFilterStats, daySeries as realDaySeries } from './api/filterStats';
import { refreshStats as realRefreshStats } from './api/client';
import { Overview } from './pages/Overview';
import { Skills } from './pages/Skills';
import { Tools } from './pages/Tools';
import { Efficiency } from './pages/Efficiency';

export interface AppDeps {
  filterStats: (stats: AggregateStats, filter: StatsFilter) => AggregateStats;
  daySeries: (stats: AggregateStats) => Array<{ day: string; counts: UsageCounts }>;
  refreshStats: () => Promise<AggregateStats>;
}

export interface AppProps {
  stats: AggregateStats;
  /** Defaults to the real implementations from './api/filterStats'. Injected in tests. */
  deps?: AppDeps;
}

const PAGES = [
  { name: 'Overview', Component: Overview },
  { name: 'Skills', Component: Skills },
  { name: 'Tools', Component: Tools },
  { name: 'Efficiency', Component: Efficiency },
] as const;

export function App(props: AppProps) {
  const deps = props.deps ?? {
    filterStats: realFilterStats,
    daySeries: realDaySeries,
    refreshStats: realRefreshStats,
  };

  const [stats, setStats] = useState(props.stats);
  const [page, setPage] = useState<(typeof PAGES)[number]['name']>('Overview');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [projects, setProjects] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const filtered = deps.filterStats(stats, {
    from: from || undefined,
    to: to || undefined,
    projects,
  });
  const series = deps.daySeries(filtered);

  function toggleProject(project: string) {
    setProjects((prev) =>
      prev.includes(project) ? prev.filter((p) => p !== project) : [...prev, project],
    );
  }

  async function handleRefresh() {
    setRefreshing(true);
    setRefreshError(null);
    try {
      const next = await deps.refreshStats();
      setStats(next);
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : 'Refresh failed');
    } finally {
      setRefreshing(false);
    }
  }

  const { Component } = PAGES.find((p) => p.name === page)!;

  return (
    <div>
      <header>
        <div data-testid="header-scanned-files">Scanned files: {stats.scannedFiles}</div>
        <div data-testid="header-generated-at">Generated: {stats.generatedAt}</div>
        <div data-testid="header-ignored-lines">Ignored lines: {stats.ignoredLines}</div>
        {stats.malformedLines > 0 && (
          <div data-testid="header-malformed-warning" role="alert">
            Warning: {stats.malformedLines} malformed lines
          </div>
        )}
        <button type="button" onClick={handleRefresh} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
        {refreshError && (
          <div data-testid="refresh-error" role="alert">
            {refreshError}
          </div>
        )}
      </header>
      <nav>
        {PAGES.map(({ name }) => (
          <button key={name} type="button" onClick={() => setPage(name)}>
            {name}
          </button>
        ))}
      </nav>
      <div>
        <label htmlFor="from-date">From</label>
        <input
          id="from-date"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <label htmlFor="to-date">To</label>
        <input id="to-date" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <fieldset>
        {stats.projects.map((project) => (
          <label key={project}>
            <input
              type="checkbox"
              checked={projects.includes(project)}
              onChange={() => toggleProject(project)}
            />
            {project}
          </label>
        ))}
      </fieldset>
      <Component stats={filtered} series={series} />
    </div>
  );
}
