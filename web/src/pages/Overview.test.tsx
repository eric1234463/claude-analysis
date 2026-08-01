import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import fixture from '../api/__fixtures__/aggregate-stats.json';
import type { AggregateStats, UsageCounts } from '../api/types';
import { Overview, dailyMainSidechainData, dailyTokenTypeData } from './Overview';

const stats = fixture as AggregateStats;
const series: Array<{ day: string; counts: UsageCounts }> = [
  { day: '2026-07-09', counts: stats.days['2026-07-09']['-fixture-project'] },
  { day: '2026-07-10', counts: stats.days['2026-07-10']['-fixture-project-two'] },
];

const marksIn = (root: HTMLElement, testId: string) =>
  root.querySelector(`[data-testid="${testId}"]`)!.querySelectorAll('.recharts-bar-rectangle').length;

const seriesIn = (root: HTMLElement, testId: string) =>
  root.querySelector(`[data-testid="${testId}"]`)!.querySelectorAll('.recharts-bar').length;

describe('Overview', () => {
  it('renders inside its page container', () => {
    render(<Overview stats={stats} series={series} />);
    expect(screen.getByTestId('page-overview')).toBeTruthy();
  });

  it('stacks main and sidechain tokens, one segment per series per day', () => {
    const { container } = render(<Overview stats={stats} series={series} />);
    expect(seriesIn(container, 'chart-daily-tokens')).toBe(2);
    expect(marksIn(container, 'chart-daily-tokens')).toBe(4);
  });

  it('derives main/sidechain totals verbatim from the series', () => {
    expect(dailyMainSidechainData(series)).toStrictEqual([
      { day: '2026-07-09', main: 145, sidechain: 27275 },
      { day: '2026-07-10', main: 18, sidechain: 0 },
    ]);
  });

  it('derives per-type token data verbatim from the series, including zeros', () => {
    expect(dailyTokenTypeData(series)).toStrictEqual([
      { day: '2026-07-09', input: 16, output: 183, cacheRead: 21147, cacheCreation: 6074 },
      { day: '2026-07-10', input: 7, output: 11, cacheRead: 0, cacheCreation: 0 },
    ]);
  });

  it('stacks the four token types, one segment per type per day', () => {
    const { container } = render(<Overview stats={stats} series={series} />);
    expect(seriesIn(container, 'chart-daily-token-types')).toBe(4);
    expect(marksIn(container, 'chart-daily-token-types')).toBe(8);
  });

  it('labels both series so a reader can tell main from subagent', () => {
    render(<Overview stats={stats} series={series} />);
    expect(screen.getByText(/main/i)).toBeTruthy();
    expect(screen.getByText(/subagent|sidechain/i)).toBeTruthy();
  });

  it('renders the pre-bucketed day keys verbatim', () => {
    render(<Overview stats={stats} series={series} />);
    expect(screen.getAllByText('2026-07-09').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2026-07-10').length).toBeGreaterThan(0);
  });

  it('renders one sessions mark per day', () => {
    const { container } = render(<Overview stats={stats} series={series} />);
    expect(marksIn(container, 'chart-sessions-per-day')).toBe(2);
  });

  it('renders one mark per model and per project', () => {
    const { container } = render(<Overview stats={stats} series={series} />);
    expect(marksIn(container, 'chart-tokens-by-model')).toBe(2);
    expect(marksIn(container, 'chart-tokens-by-project')).toBe(2);
  });

  it('renders an empty selection without throwing', () => {
    const empty: AggregateStats = {
      ...stats,
      days: {},
      projects: [],
      models: [],
      tools: [],
      skills: [],
      agents: [],
    };
    expect(() => render(<Overview stats={empty} series={[]} />)).not.toThrow();
    expect(screen.getByTestId('page-overview')).toBeTruthy();
  });
});
