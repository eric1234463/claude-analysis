import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import fixture from '../api/__fixtures__/aggregate-stats.json';
import type { AggregateStats, UsageCounts } from '../api/types';
import {
  Efficiency,
  cacheHitTrendData,
  throughputTrendData,
  toolErrorTrendData,
} from './Efficiency';

const stats = fixture as AggregateStats;
const series: Array<{ bucket: string; counts: UsageCounts }> = [
  { bucket: '2026-07-09', counts: stats.days['2026-07-09']['-fixture-project'] },
  { bucket: '2026-07-10', counts: stats.days['2026-07-10']['-fixture-project-two'] },
];

const metric = (id: string) => screen.getByTestId(id).textContent ?? '';

describe('Efficiency metrics', () => {
  it('renders inside its page container', () => {
    render(<Efficiency stats={stats} series={series} granularity="day" />);
    expect(screen.getByTestId('page-efficiency')).toBeTruthy();
  });

  it('computes the cache hit ratio with output tokens excluded from the denominator', () => {
    render(<Efficiency stats={stats} series={series} granularity="day" />);
    expect(metric('metric-cache-hit-ratio')).toContain('77.6%');
  });

  it('computes the tool error rate over calls', () => {
    render(<Efficiency stats={stats} series={series} granularity="day" />);
    expect(metric('metric-tool-error-rate')).toContain('25.0%');
  });

  it('computes average tokens per session from sessions started', () => {
    render(<Efficiency stats={stats} series={series} granularity="day" />);
    expect(metric('metric-avg-tokens-per-session')).toContain('13719');
  });

  it('computes the sidechain token share of all tokens', () => {
    render(<Efficiency stats={stats} series={series} granularity="day" />);
    expect(metric('metric-sidechain-share')).toContain('99.4%');
  });

  it('reports subagent runs and agent types', () => {
    render(<Efficiency stats={stats} series={series} granularity="day" />);
    expect(metric('metric-agent-runs')).toBe('1');
    expect(within(screen.getByTestId('list-agent-types')).getByText('general-purpose')).toBeTruthy();
  });

  it('shows the volume-weighted response throughput with an always-visible coverage line', () => {
    render(<Efficiency stats={stats} series={series} granularity="day" />);
    expect(metric('metric-throughput')).toContain('2.5');
    expect(metric('metric-throughput-excluded')).toContain('7');
    expect(screen.getByText(/includes queue and prompt-processing time/i)).toBeTruthy();
  });

  it('weights the headline throughput by merged token and duration sums', () => {
    const weightedStats: AggregateStats = {
      ...stats,
      totals: {
        ...stats.totals,
        // 40 tok/s for 1s plus 100 tok/s for 9s is 94 tok/s, not the naive 70 tok/s mean.
        throughput: { outputTokens: 940, durationMs: 10_000, requests: 2, excludedRequests: 0 },
      },
    };
    render(<Efficiency stats={weightedStats} series={series} granularity="day" />);
    expect(metric('metric-throughput')).toBe('94.0 tok/s');
  });

  it('ranks the most active projects by tokens', () => {
    const { container } = render(<Efficiency stats={stats} series={series} granularity="day" />);
    const chart = container.querySelector('[data-testid="chart-active-projects"]') as HTMLElement;
    expect(chart.querySelectorAll('.recharts-bar-rectangle').length).toBe(2);
    const labels = [...chart.querySelectorAll('.recharts-cartesian-axis-tick-value')]
      .map((n) => n.textContent);
    expect(labels.indexOf('-fixture-project'))
      .toBeLessThan(labels.indexOf('-fixture-project-two'));
  });

  it('derives the per-day cache hit ratio using the same formula as the scalar', () => {
    const day1Denom = 16 + 21147 + 6074;
    expect(cacheHitTrendData(series)).toStrictEqual([
      { bucket: '2026-07-09', cacheHitRatio: (21147 / day1Denom) * 100 },
      { bucket: '2026-07-10', cacheHitRatio: 0 },
    ]);
  });

  it('derives the per-day tool error rate, guarding a zero-call day', () => {
    expect(toolErrorTrendData(series)).toStrictEqual([
      { bucket: '2026-07-09', toolErrorRate: 25 },
      { bucket: '2026-07-10', toolErrorRate: 0 },
    ]);
  });

  it('derives the per-bucket throughput rate, zero-guarding empty buckets', () => {
    expect(throughputTrendData(series)).toStrictEqual([
      { bucket: '2026-07-09', throughput: 153 / 62 },
      { bucket: '2026-07-10', throughput: 0 },
    ]);
  });

  it('weights a merged bucket by volume rather than averaging its days\' ratios', () => {
    // 40% and 100% over wildly different volumes; the naive mean would be 70%.
    const bucket = { ...stats.days['2026-07-09']['-fixture-project'] };
    const merged = [{
      bucket: '2026-07-06',
      counts: {
        ...bucket,
        tokens: { ...bucket.tokens, input: 60, cacheRead: 940, cacheCreation: 0 },
      },
    }];
    expect(cacheHitTrendData(merged)[0].cacheHitRatio).toBe(94);
  });

  it('names both trends after the granularity they were rendered at', () => {
    render(<Efficiency stats={stats} series={series} granularity="week" />);
    expect(screen.getByText('Cache hit ratio per week')).toBeTruthy();
    expect(screen.getByText('Tool error rate per week')).toBeTruthy();
  });

  it('names the throughput trend after the granularity', () => {
    render(<Efficiency stats={stats} series={series} granularity="week" />);
    expect(screen.getByText('Response throughput per week')).toBeTruthy();
  });

  it('renders one mark per day in the cache hit and tool error trend charts', () => {
    const { container } = render(<Efficiency stats={stats} series={series} granularity="day" />);
    const cacheChart = container.querySelector('[data-testid="chart-cache-hit-trend"]') as HTMLElement;
    const errorChart = container.querySelector('[data-testid="chart-tool-error-trend"]') as HTMLElement;
    expect(cacheChart.querySelectorAll('.recharts-bar-rectangle').length).toBe(2);
    expect(errorChart.querySelectorAll('.recharts-bar-rectangle').length).toBe(2);
  });

  it('renders one mark per bucket in the throughput trend and one bar per model', () => {
    const { container } = render(<Efficiency stats={stats} series={series} granularity="day" />);
    const trend = container.querySelector('[data-testid="chart-throughput-trend"]') as HTMLElement;
    const models = container.querySelector('[data-testid="chart-model-throughput"]') as HTMLElement;
    expect(trend.querySelectorAll('.recharts-bar-rectangle').length).toBe(2);
    expect(models.querySelectorAll('.recharts-bar-rectangle').length).toBe(1);
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
      skillTokens: {},
      throughput: { outputTokens: 0, durationMs: 0, requests: 0, excludedRequests: 0 },
      mainThroughput: { outputTokens: 0, durationMs: 0, requests: 0, excludedRequests: 0 },
      sidechainThroughput: { outputTokens: 0, durationMs: 0, requests: 0, excludedRequests: 0 },
      modelThroughput: {},
      skillThroughput: {},
      agents: {},
    },
  };

  it('renders zeroes rather than NaN or Infinity', () => {
    const { container } = render(<Efficiency stats={empty} series={[]} granularity="day" />);
    const text = container.textContent ?? '';
    expect(text).not.toContain('NaN');
    expect(text).not.toContain('Infinity');
    expect(metric('metric-cache-hit-ratio')).toBe('0%');
    expect(metric('metric-tool-error-rate')).toBe('0%');
    expect(metric('metric-avg-tokens-per-session')).toBe('0');
    expect(metric('metric-sidechain-share')).toBe('0%');
  });

  it('renders empty trend charts without NaN or Infinity', () => {
    const { container } = render(<Efficiency stats={empty} series={[]} granularity="day" />);
    expect(container.textContent ?? '').not.toContain('NaN');
    expect(container.textContent ?? '').not.toContain('Infinity');
    expect(cacheHitTrendData([])).toStrictEqual([]);
    expect(toolErrorTrendData([])).toStrictEqual([]);
  });

  it('renders zero throughput rather than NaN or Infinity', () => {
    const { container } = render(<Efficiency stats={empty} series={[]} granularity="day" />);
    expect(container.textContent ?? '').not.toContain('NaN');
    expect(container.textContent ?? '').not.toContain('Infinity');
    expect(metric('metric-throughput')).toContain('0.0 tok/s');
    expect(throughputTrendData([])).toStrictEqual([]);
  });
});
