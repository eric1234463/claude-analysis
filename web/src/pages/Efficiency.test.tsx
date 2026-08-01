import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import fixture from '../api/__fixtures__/aggregate-stats.json';
import type { AggregateStats, UsageCounts } from '../api/types';
import { Efficiency } from './Efficiency';

const stats = fixture as AggregateStats;
const series: Array<{ day: string; counts: UsageCounts }> = [
  { day: '2026-07-09', counts: stats.days['2026-07-09']['-fixture-project'] },
  { day: '2026-07-10', counts: stats.days['2026-07-10']['-fixture-project-two'] },
];

const metric = (id: string) => screen.getByTestId(id).textContent ?? '';

describe('Efficiency metrics', () => {
  it('renders inside its page container', () => {
    render(<Efficiency stats={stats} series={series} />);
    expect(screen.getByTestId('page-efficiency')).toBeTruthy();
  });

  it('computes the cache hit ratio with output tokens excluded from the denominator', () => {
    render(<Efficiency stats={stats} series={series} />);
    expect(metric('metric-cache-hit-ratio')).toContain('77.6%');
  });

  it('computes the tool error rate over calls', () => {
    render(<Efficiency stats={stats} series={series} />);
    expect(metric('metric-tool-error-rate')).toContain('25.0%');
  });

  it('computes average tokens per session from sessions started', () => {
    render(<Efficiency stats={stats} series={series} />);
    expect(metric('metric-avg-tokens-per-session')).toContain('13719');
  });

  it('computes the sidechain token share of all tokens', () => {
    render(<Efficiency stats={stats} series={series} />);
    expect(metric('metric-sidechain-share')).toContain('99.4%');
  });

  it('reports subagent runs and agent types', () => {
    render(<Efficiency stats={stats} series={series} />);
    expect(metric('metric-agent-runs')).toContain('1');
    expect(within(screen.getByTestId('list-agent-types')).getByText('general-purpose')).toBeTruthy();
  });

  it('ranks the most active projects by tokens', () => {
    const { container } = render(<Efficiency stats={stats} series={series} />);
    const chart = container.querySelector('[data-testid="chart-active-projects"]') as HTMLElement;
    expect(chart.querySelectorAll('.recharts-bar-rectangle').length).toBe(2);
    const labels = [...chart.querySelectorAll('.recharts-cartesian-axis-tick-value')]
      .map((n) => n.textContent);
    expect(labels.indexOf('-fixture-project'))
      .toBeLessThan(labels.indexOf('-fixture-project-two'));
  });
});

describe('Efficiency with nothing selected', () => {
  const empty: AggregateStats = {
    ...stats,
    days: {},
    projects: [],
    models: [],
    tools: [],
    skills: [],
    agents: [],
    totals: {
      tokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, total: 0 },
      mainTokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, total: 0 },
      sidechainTokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, total: 0 },
      sessionsStarted: 0,
      toolCalls: 0,
      toolErrors: 0,
      skillInvocations: 0,
      agentRuns: 0,
      models: {},
      tools: {},
      skills: {},
      agents: {},
    },
  };

  it('renders zeroes rather than NaN or Infinity', () => {
    const { container } = render(<Efficiency stats={empty} series={[]} />);
    const text = container.textContent ?? '';
    expect(text).not.toContain('NaN');
    expect(text).not.toContain('Infinity');
    expect(metric('metric-cache-hit-ratio')).toContain('0');
    expect(metric('metric-tool-error-rate')).toContain('0');
    expect(metric('metric-avg-tokens-per-session')).toContain('0');
    expect(metric('metric-sidechain-share')).toContain('0');
  });
});
