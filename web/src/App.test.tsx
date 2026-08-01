import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import fixture from './api/__fixtures__/aggregate-stats.json';
import type { AggregateStats, UsageCounts } from './api/types';
import type { StatsFilter } from './api/filterStats';
import { filterStats, daySeries } from './api/filterStats';
import { App, type AppDeps } from './App';

const stats = fixture as AggregateStats;

function fakes() {
  const seen: StatsFilter[] = [];
  const filtered: AggregateStats = { ...stats, scannedFiles: 99 };
  const series: Array<{ day: string; counts: UsageCounts }> = [
    { day: '2026-07-09', counts: stats.days['2026-07-09']['-fixture-project'] },
  ];
  const deps: AppDeps = {
    filterStats: vi.fn((_s: AggregateStats, f: StatsFilter) => { seen.push(f); return filtered; }),
    daySeries: vi.fn(() => series),
  };
  return { deps, seen, filtered, series };
}

describe('App navigation', () => {
  it('mounts Overview by default', () => {
    const { deps } = fakes();
    render(<App stats={stats} deps={deps} />);
    expect(screen.getByTestId('page-overview')).toBeTruthy();
    expect(screen.queryByTestId('page-skills')).toBeNull();
  });

  it('offers all four pages', () => {
    const { deps } = fakes();
    render(<App stats={stats} deps={deps} />);
    for (const name of ['Overview', 'Skills', 'Tools', 'Efficiency']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
  });

  it('switches the mounted page and unmounts the previous one', () => {
    const { deps } = fakes();
    render(<App stats={stats} deps={deps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Efficiency' }));
    expect(screen.getByTestId('page-efficiency')).toBeTruthy();
    expect(screen.queryByTestId('page-overview')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tools' }));
    expect(screen.getByTestId('page-tools')).toBeTruthy();
    expect(screen.queryByTestId('page-efficiency')).toBeNull();
  });
});

describe('App filtering delegates to the injected layer', () => {
  it('passes the filtered stats and the derived series to the mounted page', () => {
    const { deps, filtered, series } = fakes();
    render(<App stats={stats} deps={deps} />);
    expect(deps.filterStats).toHaveBeenCalled();
    expect(deps.daySeries).toHaveBeenCalledWith(filtered);
    expect(series).toHaveLength(1);
  });

  it('sends the current date range on every date change', () => {
    const { deps, seen } = fakes();
    render(<App stats={stats} deps={deps} />);
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-07-09' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-07-10' } });
    const last = seen[seen.length - 1];
    expect(last.from).toBe('2026-07-09');
    expect(last.to).toBe('2026-07-10');
  });

  it('sends the selected project keys', () => {
    const { deps, seen } = fakes();
    render(<App stats={stats} deps={deps} />);
    fireEvent.click(screen.getByLabelText('-fixture-project-two'));
    const last = seen[seen.length - 1];
    expect(last.projects).toStrictEqual(['-fixture-project-two']);
  });

  it('derives project options from the unfiltered input, not the filtered result', () => {
    const { deps } = fakes();
    render(<App stats={stats} deps={deps} />);
    expect(screen.getByLabelText('-fixture-project')).toBeTruthy();
    expect(screen.getByLabelText('-fixture-project-two')).toBeTruthy();
  });
});

describe('App integration with the real filtering layer', () => {
  it('renders the full unfiltered data on first render, with no dates entered', () => {
    const realFilterStats = vi.fn(filterStats);
    const realDaySeries = vi.fn(daySeries);
    render(<App stats={stats} deps={{ filterStats: realFilterStats, daySeries: realDaySeries }} />);
    const filtered = realFilterStats.mock.results[0].value as AggregateStats;
    const series = realDaySeries.mock.results[0].value as Array<{ day: string; counts: UsageCounts }>;
    expect(filtered.totals.tokens.total).toBe(27438);
    expect(series).toHaveLength(2);
  });
});
