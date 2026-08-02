import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import fixture from '../api/__fixtures__/aggregate-stats.json';
import type { AggregateStats, UsageCounts } from '../api/types';
import { Tools } from './Tools';

const stats = fixture as AggregateStats;
const series: Array<{ bucket: string; counts: UsageCounts }> = [
  { bucket: '2026-07-09', counts: stats.days['2026-07-09']['-fixture-project'] },
  { bucket: '2026-07-10', counts: stats.days['2026-07-10']['-fixture-project-two'] },
];

describe('Tools page', () => {
  it('renders inside its page container', () => {
    render(<Tools stats={stats} series={series} granularity="day" />);
    expect(screen.getByTestId('page-tools')).toBeTruthy();
  });

  it('renders one call mark per tool', () => {
    const { container } = render(<Tools stats={stats} series={series} granularity="day" />);
    const chart = container.querySelector('[data-testid="chart-tool-calls"]')!;
    expect(chart.querySelectorAll('.recharts-bar-rectangle').length).toBe(4);
  });

  it('shows a 100% error rate for Bash and 0% for the tools that never failed', () => {
    const { container } = render(<Tools stats={stats} series={series} granularity="day" />);
    const table = container.querySelector('[data-testid="table-tool-errors"]') as HTMLElement;
    const bashRow = within(table).getByText('Bash').closest('tr') as HTMLElement;
    expect(within(bashRow).getByText('100%')).toBeTruthy();
    const readRow = within(table).getByText('Read').closest('tr') as HTMLElement;
    expect(within(readRow).getByText('0%')).toBeTruthy();
  });

  it('shows per-project tool counts', () => {
    const { container } = render(<Tools stats={stats} series={series} granularity="day" />);
    const table = container.querySelector('[data-testid="table-tool-projects"]')!;
    expect(within(table as HTMLElement).getByText('-fixture-project')).toBeTruthy();
  });

  it('renders an empty selection without throwing and without NaN', () => {
    const empty: AggregateStats = {
      ...stats, days: {}, projects: [], models: [], tools: [], skills: [], agents: [],
    };
    const { container } = render(<Tools stats={empty} series={[]} granularity="day" />);
    expect(screen.getByTestId('page-tools')).toBeTruthy();
    expect(container.textContent ?? '').not.toContain('NaN');
  });

  it('shows a 0% error rate for a tool with zero calls, never NaN', () => {
    const zeroCallStats: AggregateStats = {
      ...stats,
      tools: [...stats.tools, 'Write'],
    };
    const zeroCallSeries = [
      {
        bucket: '2026-07-09',
        counts: {
          ...stats.days['2026-07-09']['-fixture-project'],
          tools: { ...stats.days['2026-07-09']['-fixture-project'].tools, Write: { calls: 0, errors: 0 } },
        },
      },
      series[1],
    ];
    const { container } = render(<Tools stats={zeroCallStats} series={zeroCallSeries} granularity="day" />);
    const table = container.querySelector('[data-testid="table-tool-errors"]') as HTMLElement;
    const writeRow = within(table).getByText('Write').closest('tr') as HTMLElement;
    expect(within(writeRow).getByText('0%')).toBeTruthy();
    expect(container.textContent ?? '').not.toContain('NaN');
  });

  it('ranks a tool with more calls first', () => {
    const bumpedSeries = [
      {
        bucket: '2026-07-09',
        counts: {
          ...stats.days['2026-07-09']['-fixture-project'],
          tools: { ...stats.days['2026-07-09']['-fixture-project'].tools, Read: { calls: 5, errors: 0 } },
        },
      },
      series[1],
    ];
    const { container } = render(<Tools stats={stats} series={bumpedSeries} granularity="day" />);
    const table = container.querySelector('[data-testid="table-tool-errors"]') as HTMLElement;
    const firstDataRow = table.querySelectorAll('tbody tr')[0];
    expect(within(firstDataRow as HTMLElement).getByText('Read')).toBeTruthy();
  });
});
