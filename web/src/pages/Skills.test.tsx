import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import fixture from '../api/__fixtures__/aggregate-stats.json';
import type { AggregateStats, UsageCounts } from '../api/types';
import { Skills } from './Skills';

const stats = fixture as AggregateStats;
const series: Array<{ bucket: string; counts: UsageCounts }> = [
  { bucket: '2026-07-09', counts: stats.days['2026-07-09']['-fixture-project'] },
  { bucket: '2026-07-10', counts: stats.days['2026-07-10']['-fixture-project-two'] },
];

describe('Skills page', () => {
  it('renders inside its page container', () => {
    render(<Skills stats={stats} series={series} granularity="day" />);
    expect(screen.getByTestId('page-skills')).toBeTruthy();
  });

  it('keeps skill-tool and slash-command as separate series', () => {
    const { container } = render(<Skills stats={stats} series={series} granularity="day" />);
    const counts = container.querySelector('[data-testid="chart-skill-counts"]')!;
    expect(counts.querySelectorAll('.recharts-bar').length).toBe(2);
    expect(screen.getByText(/skill-tool/i)).toBeTruthy();
    expect(screen.getByText(/slash-command/i)).toBeTruthy();
  });

  it('lists your own skills and drops Claude Code built-ins entirely', () => {
    render(<Skills stats={stats} series={series} granularity="day" />);
    expect(screen.getAllByText('brainstorming').length).toBeGreaterThan(0);
    expect(screen.queryByText('/context')).toBeNull();
  });

  it('counts only your own skills, so the headline matches the rows on screen', () => {
    const { container } = render(<Skills stats={stats} series={series} granularity="day" />);
    // The fixture holds two invocations: brainstorming and the built-in /context.
    expect(stats.totals.skillInvocations).toBe(2);
    expect(screen.getByTestId('stat-skill-invocations').textContent).toBe('1');
    expect(screen.getByTestId('stat-skill-distinct').textContent).toBe('1');
    // The per-project table drops the built-in from its total too.
    const projects = container.querySelector('[data-testid="table-skill-projects"]')!;
    const row = [...projects.querySelectorAll('tbody tr')]
      .find((r) => r.querySelector('td')?.textContent === '-fixture-project')!;
    expect(row.querySelectorAll('td')[1].textContent).toBe('1');
  });

  it('drops the regex fragments the <command-name> scrape lifts out of prose', () => {
    const noise: UsageCounts = {
      ...stats.days['2026-07-09']['-fixture-project'],
      skills: { 'skill-tool|brainstorming': 1, 'slash-command|X': 4, 'slash-command|(.*?)': 2 },
    };
    const { container } = render(
      <Skills
        stats={{ ...stats, days: { '2026-07-09': { '-p': noise } } }}
        series={[{ bucket: '2026-07-09', counts: noise }]}
        granularity="day"
      />,
    );
    const rows = [...container.querySelectorAll('[data-testid="table-skill-usage"] tbody tr')]
      .map((r) => r.querySelector('td')?.textContent);
    expect(rows).toStrictEqual(['brainstorming']);
  });

  it('plots the buckets it was handed rather than re-binning them itself', () => {
    const { container } = render(<Skills stats={stats} series={series} granularity="day" />);
    const trend = container.querySelector('[data-testid="chart-skill-trend"]')!;
    expect(within(trend as HTMLElement).getByText('2026-07-09')).toBeTruthy();
    expect(within(trend as HTMLElement).getByText('2026-07-10')).toBeTruthy();
    expect(screen.getByText('Invocations per day')).toBeTruthy();
  });

  it('names the trend after the granularity it was rendered at', () => {
    render(<Skills stats={stats} series={series} granularity="month" />);
    expect(screen.getByText('Invocations per month')).toBeTruthy();
  });

  it('shows per-project skill counts', () => {
    const { container } = render(<Skills stats={stats} series={series} granularity="day" />);
    const table = container.querySelector('[data-testid="table-skill-projects"]')!;
    expect(within(table as HTMLElement).getByText('-fixture-project')).toBeTruthy();
  });

  it('shows attributed tokens per skill, and a dash where nothing was attributed', () => {
    const { container } = render(<Skills stats={stats} series={series} granularity="day" />);
    const table = container.querySelector('[data-testid="table-skill-usage"]')!;
    const cellsOf = (name: string) =>
      [...table.querySelectorAll('tbody tr')]
        .find((r) => r.querySelector('td')?.textContent === name)!
        .querySelectorAll('td');

    // brainstorming: output 160 + cacheCreation 6069 = 6,229; total 27,280 including cache reads.
    expect(cellsOf('brainstorming')[2].textContent).toBe('6,229');
    expect(cellsOf('brainstorming')[3].textContent).toBe('27,280');
  });

  it('dashes a skill that was invoked without carrying an attribution', () => {
    const cell: UsageCounts = {
      ...stats.days['2026-07-09']['-fixture-project'],
      skills: { 'slash-command|/writing-plans': 1 },
      skillTokens: {},
    };
    const { container } = render(
      <Skills
        stats={{ ...stats, days: { '2026-07-09': { '-p': cell } }, skills: [] }}
        series={[{ bucket: '2026-07-09', counts: cell }]}
        granularity="day"
      />,
    );
    const cells = [...container.querySelectorAll('[data-testid="table-skill-usage"] tbody tr')]
      .find((r) => r.querySelector('td')?.textContent === '/writing-plans')!
      .querySelectorAll('td');
    expect(cells[1].textContent).toBe('1');
    expect(cells[2].textContent).toBe('—');
  });

  it('headlines output + cache writes rather than the cache-read-dominated total', () => {
    render(<Skills stats={stats} series={series} granularity="day" />);
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
    const tok = (output: number, cacheCreation: number) => ({
      input: 0, output, cacheRead: 900, cacheCreation,
      cacheCreation1h: cacheCreation, cacheCreation5m: 0,
      total: output + cacheCreation + 900,
    });

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
    const rankedSeries = [{ bucket: '2026-07-09', counts: cell }];
    const names = (container: HTMLElement, testId: string) =>
      [...container.querySelectorAll(`[data-testid="${testId}"] tbody tr`)]
        .map((r) => r.querySelector('td')?.textContent);

    it('orders the usage table by invocations, most-used first', () => {
      const { container } = render(<Skills stats={ranked} series={rankedSeries} granularity="day" />);
      expect(names(container, 'table-skill-usage')).toStrictEqual(['common', '/mid', 'rare']);
    });

    it('re-orders by tokens when that column is chosen, surfacing the costly rare skill', () => {
      const { container } = render(<Skills stats={ranked} series={rankedSeries} granularity="day" />);
      fireEvent.click(screen.getByRole('button', { name: /tokens/i }));
      expect(names(container, 'table-skill-usage')).toStrictEqual(['rare', 'common', '/mid']);
    });

    it('orders the invocations chart by frequency rather than alphabetically', () => {
      const { container } = render(<Skills stats={ranked} series={rankedSeries} granularity="day" />);
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
      const { container } = render(<Skills stats={twoProjects} series={rankedSeries} granularity="day" />);
      expect(names(container, 'table-skill-projects')).toStrictEqual(['-zzz-busy', '-aaa-quiet']);
    });
  });

  it('renders an empty selection without throwing and without NaN', () => {
    const empty: AggregateStats = {
      ...stats, days: {}, projects: [], models: [], tools: [], skills: [], agents: [],
    };
    const { container } = render(<Skills stats={empty} series={[]} granularity="day" />);
    expect(screen.getByTestId('page-skills')).toBeTruthy();
    expect(container.textContent ?? '').not.toContain('NaN');
  });
});
