import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import fixture from '../api/__fixtures__/aggregate-stats.json';
import type { AggregateStats, CostBreakdown, TokenTotals, UsageCounts } from '../api/types';
import {
  Cost,
  costTrendData,
  formatUsd,
  modelCostRows,
  modelCostSplitData,
  netCacheSaving,
} from './Cost';

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

function tokenTotals(total: number, output: number): TokenTotals {
  return {
    input: 0,
    output,
    cacheRead: 0,
    cacheCreation: 0,
    cacheCreation1h: 0,
    cacheCreation5m: 0,
    total,
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

  it('shows the blended rate and the net saving beside the total', () => {
    render(<Cost stats={stats} series={series} granularity="day" />);
    // 68,326,250 nano-USD over the 27,438 priced tokens (27,420 Opus + 18 Sonnet)
    expect(metric('metric-cost-per-mtokens')).toBe(
      formatUsd(Math.round((68_326_250 / 27_438) * 1_000_000)),
    );
    expect(metric('metric-cost-per-mtokens')).toBe('$2.49');
    // 136,105,000 - 40,030,000 - 12,943,750 - 10,573,500 — the saving, never the counterfactual
    expect(metric('metric-net-cache-saving')).toBe(formatUsd(72_557_750));
    expect(metric('metric-net-cache-saving')).toBe('$0.0726');
    expect(metric('metric-net-cache-saving')).not.toBe(formatUsd(136_105_000));
  });

  it('divides by priced tokens only, so synthetic turns cannot dilute the rate', () => {
    // Ten times the tokens in `tokens.total`, none of them in `models`: `<synthetic>` turns and
    // tokens from a model with no rate row cost nothing, so they belong in neither denominator.
    const diluted: AggregateStats = {
      ...stats,
      totals: {
        ...stats.totals,
        tokens: { ...stats.totals.tokens, total: stats.totals.tokens.total * 10 },
      },
    };
    render(<Cost stats={diluted} series={series} granularity="day" />);
    expect(metric('metric-cost-per-mtokens')).toBe('$2.49');
    expect(metric('metric-cost-per-mtokens')).not.toBe('$0.2490');
    expect(metric(`model-token-share-${OPUS}`)).toBe('99.9%');
    expect(metric(`model-token-share-${OPUS}`)).not.toBe('10.0%');
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

  it('feeds the stacked chart the same split, both cache TTLs in one segment', () => {
    // recharts draws nothing measurable at jsdom's zero width, so the chart's data is only
    // ever provable here — asserting the rendered SVG would prove nothing.
    expect(modelCostSplitData(modelCostRows(stats.totals))).toStrictEqual([
      {
        model: OPUS,
        input: 80_000,
        output: 4_575_000,
        cacheWrite: 12_943_750 + 40_030_000,
        cacheRead: 10_573_500,
      },
      { model: SONNET, input: 14_000, output: 110_000, cacheWrite: 0, cacheRead: 0 },
    ]);
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

  it('renders a cache that never paid for itself as a negative saving', () => {
    const LOSSY = 'claude-lossy-1';
    const lossy: AggregateStats = {
      ...stats,
      models: [LOSSY],
      totals: {
        ...stats.totals,
        modelCost: {
          [LOSSY]: {
            ...zeroCost(),
            cacheRead: 1_000_000,
            cacheWrite5m: 5_000_000,
            cacheWrite1h: 4_000_000,
            total: 10_000_000,
            uncachedCacheCost: 2_000_000,
          },
        },
        models: { [LOSSY]: tokenTotals(1_000, 100) },
      },
    };
    // 2,000,000 - 5,000,000 - 4,000,000 - 1,000,000
    expect(netCacheSaving(lossy.totals.modelCost[LOSSY])).toBe(-8_000_000);
    render(<Cost stats={lossy} series={[]} granularity="day" />);
    expect(metric(`model-net-saving-${LOSSY}`)).toBe('-$0.008000');
  });

  it('guards the rate divisions for a model priced but absent from the token index', () => {
    const GHOST = 'claude-ghost-1';
    const ghost: AggregateStats = {
      ...stats,
      models: [],
      totals: {
        ...stats.totals,
        cost: { ...zeroCost(), total: 5_000_000 },
        modelCost: { [GHOST]: { ...zeroCost(), total: 5_000_000 } },
        models: {},
      },
    };
    const [row] = modelCostRows(ghost.totals);
    expect(row.costPerMTokens).toBe(0);
    expect(row.costPerKOutput).toBe(0);
    const { container } = render(<Cost stats={ghost} series={[]} granularity="day" />);
    expect(metric(`model-cost-per-mtokens-${GHOST}`)).toBe('$0.00');
    expect(metric(`model-cost-per-koutput-${GHOST}`)).toBe('$0.00');
    expect(metric('metric-cost-per-mtokens')).toBe('$0.00');
    expect(container.textContent).not.toContain('NaN');
    expect(container.textContent).not.toContain('Infinity');
  });

  it('rounds every rate to whole nano-USD, in both directions', () => {
    const totals: UsageCounts = {
      ...stats.totals,
      modelCost: {
        // 1 over 3 tokens is 333,333.33 per 1M and 333.33 per 1K output — rounds down.
        'model-down': { ...zeroCost(), output: 1, total: 1 },
        // 2 over 3 tokens is 666,666.66 per 1M and 666.66 per 1K output — rounds up.
        'model-up': { ...zeroCost(), output: 2, total: 2 },
      },
      models: {
        'model-down': tokenTotals(3, 3),
        'model-up': tokenTotals(3, 3),
      },
    };
    const [down, up] = modelCostRows(totals);
    expect(down.costPerMTokens).toBe(333_333);
    expect(down.costPerKOutput).toBe(333);
    expect(up.costPerMTokens).toBe(666_667);
    expect(up.costPerKOutput).toBe(667);
    for (const row of [down, up]) {
      expect(Number.isInteger(row.costPerMTokens)).toBe(true);
      expect(Number.isInteger(row.costPerKOutput)).toBe(true);
    }
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

  it('keeps the minus sign in every precision band', () => {
    expect(formatUsd(-8_000)).toBe('-$0.000008');
    expect(formatUsd(-52_973_750)).toBe('-$0.0530');
    expect(formatUsd(-2_000_000_000)).toBe('-$2.00');
  });

  it('changes precision band exactly at the dollar and at the cent', () => {
    expect(formatUsd(1_000_000_000)).toBe('$1.00');
    expect(formatUsd(990_000_000)).toBe('$0.9900');
    expect(formatUsd(10_000_000)).toBe('$0.0100');
    expect(formatUsd(5_000_000)).toBe('$0.005000');
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
