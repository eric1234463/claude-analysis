import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import fixture from '../api/__fixtures__/aggregate-stats.json';
import type { AggregateStats, UsageCounts } from '../api/types';
import { Skills } from './Skills';

const stats = fixture as AggregateStats;
const series: Array<{ day: string; counts: UsageCounts }> = [
  { day: '2026-07-09', counts: stats.days['2026-07-09']['-fixture-project'] },
  { day: '2026-07-10', counts: stats.days['2026-07-10']['-fixture-project-two'] },
];

describe('Skills page', () => {
  it('renders inside its page container', () => {
    render(<Skills stats={stats} series={series} />);
    expect(screen.getByTestId('page-skills')).toBeTruthy();
  });

  it('keeps skill-tool and slash-command as separate series', () => {
    const { container } = render(<Skills stats={stats} series={series} />);
    const counts = container.querySelector('[data-testid="chart-skill-counts"]')!;
    expect(counts.querySelectorAll('.recharts-bar').length).toBe(2);
    expect(screen.getByText(/skill-tool/i)).toBeTruthy();
    expect(screen.getByText(/slash-command/i)).toBeTruthy();
  });

  it('lists both invocations without merging the built-in into the skill ranking', () => {
    render(<Skills stats={stats} series={series} />);
    expect(screen.getAllByText('brainstorming').length).toBeGreaterThan(0);
    expect(screen.getAllByText('/context').length).toBeGreaterThan(0);
  });

  it('bins the trend by week, so both fixture days collapse into one bin', () => {
    const { container } = render(<Skills stats={stats} series={series} />);
    const trend = container.querySelector('[data-testid="chart-skill-trend"]')!;
    expect(within(trend as HTMLElement).getByText('2026-07-06')).toBeTruthy();
    expect(within(trend as HTMLElement).queryByText('2026-07-09')).toBeNull();
    expect(within(trend as HTMLElement).queryByText('2026-07-10')).toBeNull();
  });

  it('shows per-project skill counts', () => {
    const { container } = render(<Skills stats={stats} series={series} />);
    const table = container.querySelector('[data-testid="table-skill-projects"]')!;
    expect(within(table as HTMLElement).getByText('-fixture-project')).toBeTruthy();
  });

  it('shows attributed tokens per skill, and a dash where nothing was attributed', () => {
    const { container } = render(<Skills stats={stats} series={series} />);
    const table = container.querySelector('[data-testid="table-skill-usage"]')!;
    const cellsOf = (name: string) =>
      [...table.querySelectorAll('tbody tr')]
        .find((r) => r.querySelector('td')?.textContent === name)!
        .querySelectorAll('td');

    // brainstorming: output 160 + cacheCreation 6069 = 6,229; total 27,280 including cache reads.
    expect(cellsOf('brainstorming')[2].textContent).toBe('6,229');
    expect(cellsOf('brainstorming')[3].textContent).toBe('27,280');
    // /context is a built-in: invoked, but never carries an attribution.
    expect(cellsOf('/context')[1].textContent).toBe('1');
    expect(cellsOf('/context')[2].textContent).toBe('—');
  });

  it('headlines output + cache writes rather than the cache-read-dominated total', () => {
    render(<Skills stats={stats} series={series} />);
    expect(screen.getByTestId('stat-skill-tokens').textContent).toBe('6.2K');
  });

  describe('ranking', () => {
    const counts = (skills: Record<string, number>, skillTokens: UsageCounts['skillTokens']):
    UsageCounts => ({
      ...stats.days['2026-07-10']['-fixture-project-two'],
      skillInvocations: Object.values(skills).reduce((a, b) => a + b, 0),
      skills,
      skillTokens,
    });
    const tok = (output: number, cacheCreation: number) =>
      ({ input: 0, output, cacheRead: 900, cacheCreation, total: output + cacheCreation + 900 });

    // `rare` is used once but is by far the most expensive; `common` is the opposite.
    const cell = counts(
      { 'skill-tool|common': 5, 'skill-tool|rare': 1, 'slash-command|/mid': 3 },
      { common: tok(10, 5), rare: tok(4000, 1000) },
    );
    const ranked: AggregateStats = {
      ...stats,
      days: { '2026-07-09': { '-p': cell } },
      skills: [
        { name: 'common', source: 'skill-tool' },
        { name: 'rare', source: 'skill-tool' },
        { name: '/mid', source: 'slash-command' },
      ],
    };
    const rankedSeries = [{ day: '2026-07-09', counts: cell }];
    const names = (container: HTMLElement, testId: string) =>
      [...container.querySelectorAll(`[data-testid="${testId}"] tbody tr`)]
        .map((r) => r.querySelector('td')?.textContent);

    it('orders the usage table by invocations, most-used first', () => {
      const { container } = render(<Skills stats={ranked} series={rankedSeries} />);
      expect(names(container, 'table-skill-usage')).toStrictEqual(['common', '/mid', 'rare']);
    });

    it('re-orders by tokens when that column is chosen, surfacing the costly rare skill', () => {
      const { container } = render(<Skills stats={ranked} series={rankedSeries} />);
      fireEvent.click(screen.getByRole('button', { name: /tokens/i }));
      expect(names(container, 'table-skill-usage')).toStrictEqual(['rare', 'common', '/mid']);
    });

    it('orders the invocations chart by frequency rather than alphabetically', () => {
      const { container } = render(<Skills stats={ranked} series={rankedSeries} />);
      const chart = container.querySelector('[data-testid="chart-skill-counts"]')!;
      const ticks = [...chart.querySelectorAll('.recharts-cartesian-axis-tick-value')]
        .map((t) => t.textContent)
        .filter((t) => t && ['common', 'rare', '/mid'].includes(t));
      expect(ticks).toStrictEqual(['common', '/mid', 'rare']);
    });

    it('orders the project table by count, busiest project first', () => {
      // Named so that frequency order and alphabetical order disagree.
      const twoProjects: AggregateStats = {
        ...ranked,
        days: { '2026-07-09': { '-aaa-quiet': counts({ 'skill-tool|x': 1 }, {}), '-zzz-busy': cell } },
      };
      const { container } = render(<Skills stats={twoProjects} series={rankedSeries} />);
      expect(names(container, 'table-skill-projects')).toStrictEqual(['-zzz-busy', '-aaa-quiet']);
    });
  });

  it('renders an empty selection without throwing and without NaN', () => {
    const empty: AggregateStats = {
      ...stats, days: {}, projects: [], models: [], tools: [], skills: [], agents: [],
    };
    const { container } = render(<Skills stats={empty} series={[]} />);
    expect(screen.getByTestId('page-skills')).toBeTruthy();
    expect(container.textContent ?? '').not.toContain('NaN');
  });
});
