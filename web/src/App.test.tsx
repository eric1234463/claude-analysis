import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import fixture from './api/__fixtures__/aggregate-stats.json';
import type { AggregateStats, UsageCounts } from './api/types';
import type { StatsFilter } from './api/filterStats';
import { filterStats, usageSeries } from './api/filterStats';
import { App, type AppDeps } from './App';

const stats = fixture as AggregateStats;

/** Inside the fixture's day range (2026-07-09 / 2026-07-10), so the 7-day default covers it. */
const NOW = new Date(2026, 6, 10);

function fakes() {
  const seen: StatsFilter[] = [];
  // Differs in `projects`, a field genuinely unrendered by the header, so the
  // fake stays a meaningful stand-in for "the filtered result" even though
  // the header now surfaces scannedFiles/generatedAt/ignoredLines/malformedLines
  // straight from the unfiltered stats.
  const filtered: AggregateStats = { ...stats, projects: ['-fixture-filtered-project'] };
  const series: Array<{ bucket: string; counts: UsageCounts }> = [
    { bucket: '2026-07-09', counts: stats.days['2026-07-09']['-fixture-project'] },
  ];
  const deps: AppDeps = {
    filterStats: vi.fn((_s: AggregateStats, f: StatsFilter) => { seen.push(f); return filtered; }),
    usageSeries: vi.fn(() => series),
    refreshStats: vi.fn(async () => stats),
    now: () => NOW,
  };
  return { deps, seen, filtered, series };
}

/** Five projects on distinct days, so the filter card has something to collapse. */
const manyProjects: AggregateStats = {
  ...stats,
  projects: ['p-newest', 'p-older', 'p-oldest', 'p-second', 'p-third'],
  days: {
    '2026-07-05': { 'p-oldest': stats.totals },
    '2026-07-06': { 'p-older': stats.totals },
    '2026-07-07': { 'p-third': stats.totals },
    '2026-07-08': { 'p-second': stats.totals },
    '2026-07-09': { 'p-newest': stats.totals },
  },
};

describe('App navigation', () => {
  it('mounts Overview by default', () => {
    const { deps } = fakes();
    render(<App stats={stats} deps={deps} />);
    expect(screen.getByTestId('page-overview')).toBeTruthy();
    expect(screen.queryByTestId('page-skills')).toBeNull();
  });

  it('offers all six pages', () => {
    const { deps } = fakes();
    render(<App stats={stats} deps={deps} />);
    for (const name of ['Overview', 'Cost', 'Skills', 'Tools', 'Sessions', 'Efficiency']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
  });

  it('lists the pages in tab order, with Sessions beside Overview', () => {
    const { deps } = fakes();
    render(<App stats={stats} deps={deps} />);
    const nav = screen.getByRole('navigation', { name: 'Dashboard sections' });
    expect(within(nav).getAllByRole('button').map((tab) => tab.textContent)).toStrictEqual([
      'Overview',
      'Sessions',
      'Cost',
      'Skills',
      'Tools',
      'Efficiency',
    ]);
  });

  it('subtitles each page with its own description', () => {
    const { deps } = fakes();
    render(<App stats={stats} deps={deps} />);
    // Scoped to the paragraph under the h1: page bodies repeat some of this copy, so an
    // unscoped text match would pass even with two subtitles transposed.
    const subtitle = () =>
      screen.getByRole('heading', { level: 1 }).nextElementSibling?.textContent ?? '';
    const pages: Array<[string, RegExp]> = [
      ['Overview', /token volume/i],
      ['Cost', /api list price/i],
      ['Skills', /built-ins are excluded/i],
      ['Tools', /tool call volume/i],
      ['Sessions', /one row per session/i],
      ['Efficiency', /cache reuse/i],
    ];
    for (const [name, copy] of pages) {
      fireEvent.click(screen.getByRole('button', { name }));
      expect(subtitle()).toMatch(copy);
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

  it('mounts the Sessions page and unmounts Overview when Sessions is picked', () => {
    const { deps } = fakes();
    render(<App stats={stats} deps={deps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sessions' }));
    expect(screen.getByTestId('page-sessions')).toBeTruthy();
    expect(screen.queryByTestId('page-overview')).toBeNull();
  });

  it('mounts the Cost page and unmounts Overview when Cost is picked', () => {
    const { deps } = fakes();
    render(<App stats={stats} deps={deps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cost' }));
    expect(screen.getByTestId('page-cost')).toBeTruthy();
    expect(screen.queryByTestId('page-overview')).toBeNull();
  });
});

describe('App filtering delegates to the injected layer', () => {
  it('passes the filtered stats and the derived series to the mounted page', () => {
    const { deps, filtered, series } = fakes();
    render(<App stats={stats} deps={deps} />);
    expect(deps.filterStats).toHaveBeenCalled();
    expect(deps.usageSeries).toHaveBeenCalledWith(filtered, 'day');
    expect(series).toHaveLength(1);
    // The mounted Overview page actually renders the filtered project name
    // (not the unfiltered one), proving the page received `filtered`.
    expect(screen.getByText(filtered.projects[0])).toBeTruthy();
  });

  it('writes the From input into the `from` bound, leaving `to` alone', () => {
    const { deps, seen } = fakes();
    render(<App stats={stats} deps={deps} />);
    // Must differ from the default `from` (2026-07-04), or fireEvent.change is a no-op.
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-07-09' } });
    const last = seen[seen.length - 1];
    expect(last.from).toBe('2026-07-09');
    expect(last.to).toBe('2026-07-10');
    expect((screen.getByLabelText('From') as HTMLInputElement).value).toBe('2026-07-09');
    expect((screen.getByLabelText('To') as HTMLInputElement).value).toBe('2026-07-10');
  });

  it('writes the To input into the `to` bound, leaving `from` alone', () => {
    const { deps, seen } = fakes();
    render(<App stats={stats} deps={deps} />);
    // Must differ from the default `to` (2026-07-10), or fireEvent.change is a no-op.
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-07-08' } });
    const last = seen[seen.length - 1];
    expect(last.from).toBe('2026-07-04');
    expect(last.to).toBe('2026-07-08');
    expect((screen.getByLabelText('From') as HTMLInputElement).value).toBe('2026-07-04');
    expect((screen.getByLabelText('To') as HTMLInputElement).value).toBe('2026-07-08');
  });

  it('guards each date input against crossing the other bound', () => {
    const { deps } = fakes();
    render(<App stats={stats} deps={deps} />);
    const fromInput = screen.getByLabelText('From') as HTMLInputElement;
    const toInput = screen.getByLabelText('To') as HTMLInputElement;
    expect(fromInput.max).toBe('2026-07-10');
    expect(fromInput.min).toBe('');
    expect(toInput.min).toBe('2026-07-04');
    expect(toInput.max).toBe('');
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

  it('collapses to the three most recently used projects and expands on demand', () => {
    const { deps } = fakes();
    render(<App stats={manyProjects} deps={deps} />);
    expect(screen.getByLabelText('p-newest')).toBeTruthy();
    expect(screen.getByLabelText('p-second')).toBeTruthy();
    expect(screen.getByLabelText('p-third')).toBeTruthy();
    expect(screen.queryByLabelText('p-older')).toBeNull();
    expect(screen.queryByLabelText('p-oldest')).toBeNull();

    fireEvent.click(screen.getByText('Show all (2 more)'));
    expect(screen.getByLabelText('p-oldest')).toBeTruthy();

    fireEvent.click(screen.getByText('Show fewer'));
    expect(screen.queryByLabelText('p-oldest')).toBeNull();
  });

  it('keeps a selected project visible after the list collapses again', () => {
    const { deps } = fakes();
    render(<App stats={manyProjects} deps={deps} />);
    fireEvent.click(screen.getByText('Show all (2 more)'));
    fireEvent.click(screen.getByLabelText('p-oldest'));
    fireEvent.click(screen.getByText('Show fewer'));
    // Still on screen and still checked, or the filter would be stuck on with no
    // way to switch it off.
    expect(screen.getByLabelText('p-oldest').getAttribute('data-state')).toBe('checked');
  });
});

describe('App granularity', () => {
  it('opens on daily', () => {
    const { deps } = fakes();
    render(<App stats={stats} deps={deps} />);
    expect((screen.getByLabelText('Group by') as HTMLSelectElement).value).toBe('day');
  });

  it('offers all three groupings', () => {
    const { deps } = fakes();
    render(<App stats={stats} deps={deps} />);
    const options = [...(screen.getByLabelText('Group by') as HTMLSelectElement).options];
    expect(options.map((o) => o.value)).toStrictEqual(['day', 'week', 'month']);
    expect(options.map((o) => o.textContent)).toStrictEqual(['Daily', 'Weekly', 'Monthly']);
  });

  it('re-derives the series at the chosen granularity', () => {
    const { deps, filtered } = fakes();
    render(<App stats={stats} deps={deps} />);
    fireEvent.change(screen.getByLabelText('Group by'), { target: { value: 'month' } });
    expect(deps.usageSeries).toHaveBeenLastCalledWith(filtered, 'month');
  });

  it('carries the granularity into the page so its chart copy follows', () => {
    const { deps } = fakes();
    render(<App stats={stats} deps={deps} />);
    expect(screen.getByText('Daily tokens')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Group by'), { target: { value: 'week' } });
    expect(screen.getByText('Weekly tokens')).toBeTruthy();
  });
});

describe('App default date range', () => {
  it('opens on the seven days ending today, and shows that range in the inputs', () => {
    const { deps, seen } = fakes();
    render(<App stats={stats} deps={deps} />);
    expect(seen[0].from).toBe('2026-07-04');
    expect(seen[0].to).toBe('2026-07-10');
    expect((screen.getByLabelText('From') as HTMLInputElement).value).toBe('2026-07-04');
    expect((screen.getByLabelText('To') as HTMLInputElement).value).toBe('2026-07-10');
  });

  it('does not slide the range forward when the clock advances mid-session', () => {
    const { deps, seen } = fakes();
    let current = NOW;
    deps.now = () => current;
    render(<App stats={stats} deps={deps} />);
    current = new Date(2026, 6, 20);
    fireEvent.click(screen.getByRole('button', { name: 'Tools' }));
    const last = seen[seen.length - 1];
    expect(last.from).toBe('2026-07-04');
    expect(last.to).toBe('2026-07-10');
  });
});

describe('App integration with the real filtering layer', () => {
  function renderReal(now: Date) {
    const realFilterStats = vi.fn(filterStats);
    const realUsageSeries = vi.fn(usageSeries);
    render(
      <App
        stats={stats}
        deps={{
          filterStats: realFilterStats,
          usageSeries: realUsageSeries,
          refreshStats: vi.fn(async () => stats),
          now: () => now,
        }}
      />,
    );
    return { realFilterStats, realUsageSeries };
  }

  it('renders the data inside the default range', () => {
    const { realFilterStats, realUsageSeries } = renderReal(NOW);
    const filtered = realFilterStats.mock.results[0].value as AggregateStats;
    const series = realUsageSeries.mock.results[0].value as Array<{ bucket: string; counts: UsageCounts }>;
    expect(filtered.totals.tokens.total).toBe(27438);
    expect(series).toHaveLength(2);
    expect(screen.getByTestId('page-overview')).toBeTruthy();
  });

  it('shows an empty state instead of empty charts when the range predates the data', () => {
    renderReal(new Date(2026, 7, 2));
    expect(screen.queryByTestId('page-overview')).toBeNull();
    expect(screen.getByText(/no activity in this range/i)).toBeTruthy();
  });

  it('recovers from the empty state by clearing the range to all time', () => {
    renderReal(new Date(2026, 7, 2));
    fireEvent.click(screen.getByRole('button', { name: /show all time/i }));
    expect(screen.getByTestId('page-overview')).toBeTruthy();
    expect((screen.getByLabelText('From') as HTMLInputElement).value).toBe('');
  });

  it('widens past the default range through the real filtering layer', () => {
    renderReal(new Date(2026, 7, 2));
    expect(screen.queryByTestId('page-overview')).toBeNull();
    fireEvent.change(screen.getByLabelText('Range'), { target: { value: 'last90' } });
    expect(screen.getByTestId('page-overview')).toBeTruthy();
    expect((screen.getByLabelText('From') as HTMLInputElement).value).toBe('2026-05-05');
  });

  it('reads all time, not custom, after the empty state clears the range', () => {
    renderReal(new Date(2026, 7, 2));
    fireEvent.click(screen.getByRole('button', { name: /show all time/i }));
    expect((screen.getByLabelText('Range') as HTMLSelectElement).value).toBe('all');
  });

  it('names the two bounds in order in the empty-state message', () => {
    renderReal(new Date(2026, 7, 2));
    expect(screen.getByText(/between 2026-07-27 and 2026-08-02/)).toBeTruthy();
  });

  it('says nothing has been parsed, with no widen button, when the range is unbounded and still empty', () => {
    const empty: AggregateStats = { ...stats, days: {} };
    render(
      <App
        stats={empty}
        deps={{ filterStats, usageSeries, refreshStats: vi.fn(async () => empty), now: () => NOW }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /show all time/i }));
    expect(screen.getByText(/no transcripts have been parsed yet/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /show all time/i })).toBeNull();
  });

  it('still describes a half-open range rather than claiming nothing was parsed', () => {
    const empty: AggregateStats = { ...stats, days: {} };
    render(
      <App
        stats={empty}
        deps={{ filterStats, usageSeries, refreshStats: vi.fn(async () => empty), now: () => NOW }}
      />,
    );
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '' } });
    expect(screen.getByText(/nothing was recorded between 2026-07-04 and today/i)).toBeTruthy();
    expect(screen.queryByText(/no transcripts have been parsed yet/i)).toBeNull();
  });
});

describe('App date range presets', () => {
  it('offers the four selectable presets and opens on the last seven days', () => {
    const { deps, seen } = fakes();
    render(<App stats={stats} deps={deps} />);
    const select = screen.getByLabelText('Range') as HTMLSelectElement;
    expect(select.value).toBe('last7');
    const options = [...select.options];
    expect(options.map((o) => o.value)).toStrictEqual(['last7', 'last30', 'last90', 'all']);
    expect(options.map((o) => o.textContent)).toStrictEqual([
      'Last 7 days',
      'Last 30 days',
      'Last 90 days',
      'All time',
    ]);
    expect(seen[0].from).toBe('2026-07-04');
    expect(seen[0].to).toBe('2026-07-10');
  });

  it('rewrites both bounds and both inputs when a wider preset is chosen', () => {
    const { deps, seen } = fakes();
    render(<App stats={stats} deps={deps} />);
    fireEvent.change(screen.getByLabelText('Range'), { target: { value: 'last30' } });
    const last = seen[seen.length - 1];
    expect(last.from).toBe('2026-06-11');
    expect(last.to).toBe('2026-07-10');
    expect((screen.getByLabelText('From') as HTMLInputElement).value).toBe('2026-06-11');
    expect((screen.getByLabelText('To') as HTMLInputElement).value).toBe('2026-07-10');
  });

  it('clears both bounds for all time', () => {
    const { deps, seen } = fakes();
    render(<App stats={stats} deps={deps} />);
    fireEvent.change(screen.getByLabelText('Range'), { target: { value: 'all' } });
    const last = seen[seen.length - 1];
    expect(last.from).toBeUndefined();
    expect(last.to).toBeUndefined();
    expect((screen.getByLabelText('From') as HTMLInputElement).value).toBe('');
  });

  it('reads custom once a date is edited by hand', () => {
    const { deps } = fakes();
    render(<App stats={stats} deps={deps} />);
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-07-09' } });
    const select = screen.getByLabelText('Range') as HTMLSelectElement;
    expect(select.value).toBe('custom');
    // Ordered and exact: Custom is appended after the presets, never spliced in front.
    expect([...select.options].map((o) => o.value)).toStrictEqual([
      'last7',
      'last30',
      'last90',
      'all',
      'custom',
    ]);
    expect([...select.options].map((o) => o.textContent)).toStrictEqual([
      'Last 7 days',
      'Last 30 days',
      'Last 90 days',
      'All time',
      'Custom',
    ]);
  });

  it('keeps reading last7 when the clock advances mid-session', () => {
    const { deps } = fakes();
    let current = new Date(2026, 6, 10);
    deps.now = () => current;
    render(<App stats={stats} deps={deps} />);
    current = new Date(2026, 6, 20);
    fireEvent.click(screen.getByRole('button', { name: 'Tools' }));
    expect((screen.getByLabelText('Range') as HTMLSelectElement).value).toBe('last7');
  });

  it('writes a preset window from the frozen clock, not a fresh read', () => {
    const { deps, seen } = fakes();
    let current = new Date(2026, 6, 10);
    deps.now = () => current;
    render(<App stats={stats} deps={deps} />);
    current = new Date(2026, 6, 20);
    fireEvent.change(screen.getByLabelText('Range'), { target: { value: 'last30' } });
    const last = seen[seen.length - 1];
    expect(last.from).toBe('2026-06-11');
    expect(last.to).toBe('2026-07-10');
    expect((screen.getByLabelText('Range') as HTMLSelectElement).value).toBe('last30');
  });

  it('gives the Range and Group by selects the same shared styling', () => {
    const { deps } = fakes();
    render(<App stats={stats} deps={deps} />);
    const range = screen.getByLabelText('Range') as HTMLSelectElement;
    const groupBy = screen.getByLabelText('Group by') as HTMLSelectElement;
    expect(range.className).toBe(groupBy.className);
    expect(range.className).toContain('appearance-none');
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
