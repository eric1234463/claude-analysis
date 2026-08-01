import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import fixture from '../api/__fixtures__/aggregate-stats.json';
import type { AggregateStats, UsageCounts } from '../api/types';
import { Overview } from './Overview';

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
