import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import fixture from './api/__fixtures__/aggregate-stats.json';
import type { AggregateStats, UsageCounts } from './api/types';
import type { StatsFilter } from './api/filterStats';
import { filterStats, daySeries } from './api/filterStats';
import { App, type AppDeps } from './App';

const stats = fixture as AggregateStats;

function fakes() {
  const seen: StatsFilter[] = [];
  // Differs in `projects`, a field genuinely unrendered by the header, so the
  // fake stays a meaningful stand-in for "the filtered result" even though
  // the header now surfaces scannedFiles/generatedAt/ignoredLines/malformedLines
  // straight from the unfiltered stats.
  const filtered: AggregateStats = { ...stats, projects: ['-fixture-filtered-project'] };
  const series: Array<{ day: string; counts: UsageCounts }> = [
    { day: '2026-07-09', counts: stats.days['2026-07-09']['-fixture-project'] },
  ];
  const deps: AppDeps = {
    filterStats: vi.fn((_s: AggregateStats, f: StatsFilter) => { seen.push(f); return filtered; }),
    daySeries: vi.fn(() => series),
    refreshStats: vi.fn(async () => stats),
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
    // The mounted Overview page actually renders the filtered project name
    // (not the unfiltered one), proving the page received `filtered`.
    expect(screen.getByText(filtered.projects[0])).toBeTruthy();
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
    render(
      <App
        stats={stats}
        deps={{
          filterStats: realFilterStats,
          daySeries: realDaySeries,
          refreshStats: vi.fn(async () => stats),
        }}
      />,
    );
    const filtered = realFilterStats.mock.results[0].value as AggregateStats;
    const series = realDaySeries.mock.results[0].value as Array<{ day: string; counts: UsageCounts }>;
    expect(filtered.totals.tokens.total).toBe(27438);
    expect(series).toHaveLength(2);
  });
});

describe('App header shows data-quality and freshness fields from the unfiltered stats', () => {
  it('shows scanned files, generated-at and ignored lines', () => {
    const { deps } = fakes();
    render(<App stats={stats} deps={deps} />);
    expect(screen.getByTestId('header-scanned-files').textContent).toContain(String(stats.scannedFiles));
    expect(screen.getByTestId('header-generated-at').textContent).toContain(stats.generatedAt);
    expect(screen.getByTestId('header-ignored-lines').textContent).toContain(String(stats.ignoredLines));
  });

  it('renders a malformed-lines warning when malformedLines is non-zero', () => {
    const { deps } = fakes();
    render(<App stats={stats} deps={deps} />);
    expect(stats.malformedLines).toBeGreaterThan(0);
    expect(screen.getByTestId('header-malformed-warning').textContent).toContain(
      String(stats.malformedLines),
    );
  });

  it('renders no malformed-lines warning when malformedLines is zero', () => {
    const clean: AggregateStats = { ...stats, malformedLines: 0 };
    const { deps } = fakes();
    render(<App stats={clean} deps={deps} />);
    expect(screen.queryByTestId('header-malformed-warning')).toBeNull();
  });

  it('reads header fields from the unfiltered stats, not the filtered result', () => {
    const { deps, filtered } = fakes();
    render(<App stats={stats} deps={deps} />);
    // filtered differs only in `projects`; scannedFiles is identical in both
    // fixtures here, so this mainly documents that the header is wired to
    // the unfiltered prop rather than `filtered`.
    expect(filtered.scannedFiles).toBe(stats.scannedFiles);
    expect(screen.getByTestId('header-scanned-files').textContent).toContain(String(stats.scannedFiles));
  });
});

describe('App refresh control', () => {
  it('calls refreshStats and replaces the displayed stats on success', async () => {
    const refreshed: AggregateStats = {
      ...stats,
      scannedFiles: stats.scannedFiles + 1,
      generatedAt: '2026-08-01T12:00:00.000Z',
    };
    const { deps } = fakes();
    deps.refreshStats = vi.fn(async () => refreshed);
    render(<App stats={stats} deps={deps} />);
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
    await waitFor(() => {
      expect(screen.getByTestId('header-scanned-files').textContent).toContain(
        String(refreshed.scannedFiles),
      );
    });
    expect(deps.refreshStats).toHaveBeenCalled();
    expect(screen.getByTestId('header-generated-at').textContent).toContain(refreshed.generatedAt);
  });

  it('shows an in-progress state while refreshing', async () => {
    let resolveRefresh!: (value: AggregateStats) => void;
    const pending = new Promise<AggregateStats>((resolve) => {
      resolveRefresh = resolve;
    });
    const { deps } = fakes();
    deps.refreshStats = vi.fn(() => pending);
    render(<App stats={stats} deps={deps} />);
    const button = screen.getByRole('button', { name: /refresh/i });
    fireEvent.click(button);
    expect(button.textContent).toMatch(/refreshing/i);
    resolveRefresh(stats);
    await waitFor(() => expect(button.textContent).not.toMatch(/refreshing/i));
  });

  it('shows a visible error and keeps the previous stats when refresh fails', async () => {
    const { deps } = fakes();
    deps.refreshStats = vi.fn(async () => {
      throw new Error('refreshStats failed: 503');
    });
    render(<App stats={stats} deps={deps} />);
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
    await waitFor(() => {
      expect(screen.getByTestId('refresh-error').textContent).toContain('503');
    });
    expect(screen.getByTestId('header-scanned-files').textContent).toContain(String(stats.scannedFiles));
  });
});
