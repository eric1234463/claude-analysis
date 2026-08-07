import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import fixture from '../api/__fixtures__/aggregate-stats.json';
import type { AggregateStats, CostBreakdown, UsageCounts } from '../api/types';
import { Cost, costTrendData, formatUsd, modelCostRows, netCacheSaving } from './Cost';

const stats = fixture as AggregateStats;
const series: Array<{ bucket: string; counts: UsageCounts }> = [
  { bucket: '2026-07-09', counts: stats.days['2026-07-09']['-fixture-project'] },
  { bucket: '2026-07-10', counts: stats.days['2026-07-10']['-fixture-project-two'] },
];

const OPUS = 'claude-opus-4-8';
const SONNET = 'claude-sonnet-5';

const metric = (id: string) => screen.getByTestId(id).textContent ?? '';

function zeroCost(): CostBreakdown {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite5m: 0,
    cacheWrite1h: 0,
    total: 0,
    uncachedCacheCost: 0,
    unpricedTokens: 0,
  };
}

describe('Cost headline', () => {
  it('renders inside its page container', () => {
    render(<Cost stats={stats} series={series} granularity="day" />);
    expect(screen.getByTestId('page-cost')).toBeTruthy();
  });

  it('shows the selection total as USD', () => {
    render(<Cost stats={stats} series={series} granularity="day" />);
    // 68,326,250 nano-USD
    expect(metric('metric-total-cost')).toBe(formatUsd(68_326_250));
    expect(metric('metric-total-cost')).toBe('$0.0683');
  });

  it('footnotes that every figure is at API list price', () => {
    render(<Cost stats={stats} series={series} granularity="day" />);
    expect(screen.getByText(/at API list price/i)).toBeTruthy();
  });

  it('titles the spend trend with the chosen granularity and plots the buckets it is handed', () => {
    render(<Cost stats={stats} series={series} granularity="week" />);
    expect(screen.getByText('Spend per week')).toBeTruthy();
    expect(costTrendData(series)).toStrictEqual([
      { bucket: '2026-07-09', cost: 68_202_250 },
      { bucket: '2026-07-10', cost: 124_000 },
    ]);
  });
});

describe('Cost per model', () => {
  it('splits each model into input, output, cache write and cache read', () => {
    render(<Cost stats={stats} series={series} granularity="day" />);
    expect(metric(`model-cost-input-${OPUS}`)).toBe('$0.000080');
    expect(metric(`model-cost-output-${OPUS}`)).toBe('$0.004575');
    // cache write is both TTLs together: 12,943,750 + 40,030,000
    expect(metric(`model-cost-cache-write-${OPUS}`)).toBe(formatUsd(52_973_750));
    expect(metric(`model-cost-cache-write-${OPUS}`)).toBe('$0.0530');
    expect(metric(`model-cost-cache-read-${OPUS}`)).toBe(formatUsd(10_573_500));
    expect(metric(`model-cost-cache-read-${OPUS}`)).toBe('$0.0106');
    expect(metric(`model-cost-total-${OPUS}`)).toBe('$0.0682');
  });

  it('shows cost share against token share, and cost per 1M tokens', () => {
    render(<Cost stats={stats} series={series} granularity="day" />);
    expect(metric(`model-cost-share-${OPUS}`)).toBe('99.8%');
    expect(metric(`model-token-share-${OPUS}`)).toBe('99.9%');
    // 68,202,250 nano-USD over 27,420 tokens, scaled to 1M tokens
    const perMillion = formatUsd(Math.round((68_202_250 / 27_420) * 1_000_000));
    expect(metric(`model-cost-per-mtokens-${OPUS}`)).toBe(perMillion);
    expect(perMillion).toBe('$2.49');
  });

  it('reports the net cache saving against the uncached counterfactual', () => {
    render(<Cost stats={stats} series={series} granularity="day" />);
    // 136,105,000 - 40,030,000 - 12,943,750 - 10,573,500
    expect(metric(`model-net-saving-${OPUS}`)).toBe(formatUsd(72_557_750));
    expect(metric(`model-net-saving-${OPUS}`)).toBe('$0.0726');
  });

  it('renders a model that never touched the cache without a divide-by-nothing', () => {
    render(<Cost stats={stats} series={series} granularity="day" />);
    expect(netCacheSaving(stats.totals.modelCost[SONNET])).toBe(0);
    expect(metric(`model-net-saving-${SONNET}`)).toBe('$0.00');
    expect(metric(`model-cache-write-${SONNET}`)).toBe('$0.00');
    expect(metric(`model-cache-read-${SONNET}`)).toBe('$0.00');
    expect(metric(`model-net-saving-${SONNET}`)).not.toContain('NaN');
  });

  it('prices output yield from the model cost, not the blended total', () => {
    render(<Cost stats={stats} series={series} granularity="day" />);
    // 4,575,000 nano-USD of output over 183 output tokens, scaled to 1K tokens
    const perThousand = formatUsd(Math.round((4_575_000 / 183) * 1_000));
    expect(metric(`model-cost-per-koutput-${OPUS}`)).toBe(perThousand);
    expect(perThousand).toBe('$0.0250');
    expect(metric(`model-output-share-${OPUS}`)).toBe('0.7%');
  });

  it('orders the per-model rows alphabetically by model', () => {
    render(<Cost stats={stats} series={series} granularity="day" />);
    const rows = within(screen.getByTestId('table-model-cost')).getAllByTestId(/^model-cost-row-/);
    expect(rows.map((row) => row.getAttribute('data-testid'))).toStrictEqual([
      `model-cost-row-${OPUS}`,
      `model-cost-row-${SONNET}`,
    ]);
  });

  it('orders rows alphabetically for more models than the fixture carries', () => {
    const totals: UsageCounts = {
      ...stats.totals,
      modelCost: {
        'claude-sonnet-5': { ...zeroCost(), total: 3 },
        'claude-haiku-9': { ...zeroCost(), total: 1 },
        'claude-opus-4-8': { ...zeroCost(), total: 2 },
      },
    };
    expect(modelCostRows(totals).map((row) => row.model)).toStrictEqual([
      'claude-haiku-9',
      'claude-opus-4-8',
      'claude-sonnet-5',
    ]);
  });

  it('never surfaces unpriced tokens', () => {
    const { container } = render(<Cost stats={stats} series={series} granularity="day" />);
    expect(container.textContent?.toLowerCase()).not.toContain('unpriced');
  });
});

describe('formatUsd', () => {
  it('renders sub-cent, whole-dollar and zero values without losing them', () => {
    expect(formatUsd(4_500_000)).toBe('$0.004500');
    expect(formatUsd(2_000_000_000)).toBe('$2.00');
    expect(formatUsd(0)).toBe('$0.00');
  });
});

describe('netCacheSaving', () => {
  it('goes negative when cache writes outweigh the reads they saved', () => {
    const cost: CostBreakdown = {
      ...zeroCost(),
      cacheRead: 1_000,
      cacheWrite5m: 5_000,
      cacheWrite1h: 4_000,
      uncachedCacheCost: 2_000,
    };
    expect(netCacheSaving(cost)).toBe(-8_000);
  });
});

describe('Cost with an empty selection', () => {
  it('renders zeroes rather than NaN when nothing was spent', () => {
    const empty: AggregateStats = {
      ...stats,
      models: [],
      totals: { ...stats.totals, cost: zeroCost(), modelCost: {}, models: {} },
    };
    const { container } = render(<Cost stats={empty} series={[]} granularity="day" />);
    expect(metric('metric-total-cost')).toBe('$0.00');
    expect(container.textContent).not.toContain('NaN');
    expect(
      within(screen.getByTestId('table-model-cost')).queryAllByTestId(/^model-cost-row-/),
    ).toHaveLength(0);
  });
});
