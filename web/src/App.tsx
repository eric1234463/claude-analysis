import { useState } from 'react';
import type { AggregateStats, UsageCounts } from './api/types';
import type { StatsFilter } from './api/filterStats';
import { filterStats as realFilterStats, daySeries as realDaySeries } from './api/filterStats';
import { Overview } from './pages/Overview';
import { Skills } from './pages/Skills';
import { Tools } from './pages/Tools';
import { Efficiency } from './pages/Efficiency';

export interface AppDeps {
  filterStats: (stats: AggregateStats, filter: StatsFilter) => AggregateStats;
  daySeries: (stats: AggregateStats) => Array<{ day: string; counts: UsageCounts }>;
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
  const { stats } = props;
  const deps = props.deps ?? { filterStats: realFilterStats, daySeries: realDaySeries };

  const [page, setPage] = useState<(typeof PAGES)[number]['name']>('Overview');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [projects, setProjects] = useState<string[]>([]);

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

  const { Component } = PAGES.find((p) => p.name === page)!;

  return (
    <div>
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
