import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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

  it('renders an empty selection without throwing and without NaN', () => {
    const empty: AggregateStats = {
      ...stats, days: {}, projects: [], models: [], tools: [], skills: [], agents: [],
    };
    const { container } = render(<Skills stats={empty} series={[]} />);
    expect(screen.getByTestId('page-skills')).toBeTruthy();
    expect(container.textContent ?? '').not.toContain('NaN');
  });
});
