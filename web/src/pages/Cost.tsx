import { Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from 'recharts';
import { Coins, PiggyBank, Receipt } from 'lucide-react';
import type { AggregateStats, CostBreakdown, TokenTotals, UsageCounts } from '../api/types';
import type { SeriesPoint } from '../api/filterStats';
import { GRANULARITY_NOUN, type Granularity } from '../api/granularity';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AXIS_LINE,
  AXIS_TICK,
  CHART_COLORS,
  ChartCard,
  GRID_PROPS,
  LEGEND_PROPS,
  StatCard,
  TOOLTIP_PROPS,
  truncateTick,
} from '@/components/charts';
import { formatNumber, formatPercent } from '@/lib/format';

export interface PageProps {
  stats: AggregateStats;
  series: SeriesPoint[];
  granularity: Granularity;
}

const SEGMENT_GAP = { stroke: 'var(--card)', strokeWidth: 2 } as const;

const NANO_PER_USD = 1_000_000_000;

/**
 * Integer nano-USD to a display string. Exported for direct test assertions.
 *
 * Precision widens as the amount shrinks: a single turn's cache read is worth a few
 * hundred-thousandths of a dollar, so two decimals would render most of this page as
 * `$0.00`.
 */
export function formatUsd(nanoUsd: number): string {
  const usd = nanoUsd / NANO_PER_USD;
  if (usd === 0) return '$0.00';
  const magnitude = Math.abs(usd);
  const digits = magnitude >= 1 ? 2 : magnitude >= 0.01 ? 4 : 6;
  return `${usd < 0 ? '-' : ''}$${magnitude.toFixed(digits)}`;
}

/** Derived, never stored: uncachedCacheCost - cacheWrite5m - cacheWrite1h - cacheRead. */
export function netCacheSaving(cost: CostBreakdown): number {
  return cost.uncachedCacheCost - cost.cacheWrite5m - cost.cacheWrite1h - cost.cacheRead;
}

function cacheWriteCost(cost: CostBreakdown): number {
  return cost.cacheWrite5m + cost.cacheWrite1h;
}

/** Nano-USD stays integral, so every rate is rounded before it reaches formatUsd. */
function scaledRate(nanoUsd: number, tokens: number, per: number): number {
  if (!tokens) return 0;
  return Math.round((nanoUsd / tokens) * per);
}

const ZERO_TOKENS: TokenTotals = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheCreation: 0,
  cacheCreation1h: 0,
  cacheCreation5m: 0,
  total: 0,
};

export interface ModelCostRow {
  model: string;
  cost: CostBreakdown;
  tokens: TokenTotals;
  cacheWrite: number;
  netSaving: number;
  /** Nano-USD per 1M tokens of any kind. */
  costPerMTokens: number;
  /** Nano-USD per 1K output tokens. */
  costPerKOutput: number;
}

/**
 * One row per priced model, alphabetical — the same order as `stats.models`. Every figure
 * comes from `totals.modelCost` / `totals.models`; nothing is re-derived from `stats.days`.
 */
export function modelCostRows(totals: UsageCounts): ModelCostRow[] {
  return Object.keys(totals.modelCost)
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
    .map((model) => {
      const cost = totals.modelCost[model];
      const tokens = totals.models[model] ?? ZERO_TOKENS;
      return {
        model,
        cost,
        tokens,
        cacheWrite: cacheWriteCost(cost),
        netSaving: netCacheSaving(cost),
        costPerMTokens: scaledRate(cost.total, tokens.total, 1_000_000),
        costPerKOutput: scaledRate(cost.output, tokens.output, 1_000),
      };
    });
}

export function costTrendData(series: readonly SeriesPoint[]) {
  return series.map(({ bucket, counts }) => ({ bucket, cost: counts.cost.total }));
}

export function modelCostSplitData(rows: readonly ModelCostRow[]) {
  return rows.map((row) => ({
    model: row.model,
    input: row.cost.input,
    output: row.cost.output,
    cacheWrite: row.cacheWrite,
    cacheRead: row.cost.cacheRead,
  }));
}

const usdTooltip = { ...TOOLTIP_PROPS, formatter: (value: unknown) => formatUsd(Number(value)) };
const usdAxis = {
  tick: AXIS_TICK,
  axisLine: false,
  tickLine: false,
  width: 76,
  tickFormatter: (value: number) => formatUsd(value),
} as const;

export function Cost({ stats, series, granularity }: PageProps) {
  const { totals } = stats;
  const rows = modelCostRows(totals);
  const trend = costTrendData(series);
  const split = modelCostSplitData(rows);
  const totalSaving = netCacheSaving(totals.cost);

  return (
    <section data-testid="page-cost" className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Total cost"
          value={formatUsd(totals.cost.total)}
          valueTestId="metric-total-cost"
          hint="at API list price"
          icon={Receipt}
        />
        <StatCard
          label="Cost / 1M tokens"
          value={formatUsd(scaledRate(totals.cost.total, totals.tokens.total, 1_000_000))}
          valueTestId="metric-cost-per-mtokens"
          hint={`Over ${formatNumber(totals.tokens.total)} tokens`}
          icon={Coins}
        />
        <StatCard
          label="Net cache saving"
          value={formatUsd(totalSaving)}
          valueTestId="metric-net-cache-saving"
          hint="Versus paying the full input rate"
          icon={PiggyBank}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          testId="chart-cost-trend"
          title={`Spend per ${GRANULARITY_NOUN[granularity]}`}
          description="List-price spend in each bucket"
        >
          <BarChart data={trend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis dataKey="bucket" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
            <YAxis {...usdAxis} />
            <Tooltip {...usdTooltip} />
            <Bar
              dataKey="cost"
              name="Cost"
              fill={CHART_COLORS[0]}
              minPointSize={1}
              radius={[4, 4, 0, 0]}
              {...SEGMENT_GAP}
            />
          </BarChart>
        </ChartCard>

        <ChartCard
          testId="chart-model-cost-split"
          title="Cost by model"
          description="Where each model's spend went"
          height={Math.max(240, split.length * 44)}
        >
          <BarChart
            data={split}
            layout="vertical"
            margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
          >
            <CartesianGrid {...GRID_PROPS} vertical horizontal={false} />
            <XAxis
              type="number"
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value: number) => formatUsd(value)}
            />
            <YAxis
              type="category"
              dataKey="model"
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              width={150}
              tickFormatter={truncateTick}
            />
            <Tooltip {...usdTooltip} />
            <Legend {...LEGEND_PROPS} />
            <Bar dataKey="input" stackId="cost" name="Input" fill={CHART_COLORS[0]} {...SEGMENT_GAP} />
            <Bar dataKey="output" stackId="cost" name="Output" fill={CHART_COLORS[1]} {...SEGMENT_GAP} />
            <Bar
              dataKey="cacheWrite"
              stackId="cost"
              name="Cache write"
              fill={CHART_COLORS[2]}
              {...SEGMENT_GAP}
            />
            <Bar
              dataKey="cacheRead"
              stackId="cost"
              name="Cache read"
              fill={CHART_COLORS[3]}
              radius={[0, 4, 4, 0]}
              {...SEGMENT_GAP}
            />
          </BarChart>
        </ChartCard>
      </div>

      <Card>
        <CardHeader className="gap-1">
          <CardTitle className="text-sm font-medium">Spend by model</CardTitle>
          <CardDescription className="text-xs">
            Cache write covers both TTLs — the 5-minute and the 1-hour writes.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-2">
          <Table data-testid="table-model-cost">
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead className="text-right">Input</TableHead>
                <TableHead className="text-right">Output</TableHead>
                <TableHead className="text-right">Cache write</TableHead>
                <TableHead className="text-right">Cache read</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.model} data-testid={`model-cost-row-${row.model}`}>
                  <TableCell className="font-mono text-xs">{row.model}</TableCell>
                  <TableCell
                    data-testid={`model-cost-input-${row.model}`}
                    className="tabular text-right"
                  >
                    {formatUsd(row.cost.input)}
                  </TableCell>
                  <TableCell
                    data-testid={`model-cost-output-${row.model}`}
                    className="tabular text-right"
                  >
                    {formatUsd(row.cost.output)}
                  </TableCell>
                  <TableCell
                    data-testid={`model-cost-cache-write-${row.model}`}
                    className="tabular text-right"
                  >
                    {formatUsd(row.cacheWrite)}
                  </TableCell>
                  <TableCell
                    data-testid={`model-cost-cache-read-${row.model}`}
                    className="tabular text-right"
                  >
                    {formatUsd(row.cost.cacheRead)}
                  </TableCell>
                  <TableCell
                    data-testid={`model-cost-total-${row.model}`}
                    className="tabular text-right"
                  >
                    {formatUsd(row.cost.total)}
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-xs text-muted-foreground">
                    No priced tokens in this selection.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-1">
          <CardTitle className="text-sm font-medium">Is each model earning its rate?</CardTitle>
          <CardDescription className="text-xs">
            A model costing more of the bill than it produced tokens is the expensive one.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-2">
          <Table data-testid="table-model-value">
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead className="text-right">Cost share</TableHead>
                <TableHead className="text-right">Token share</TableHead>
                <TableHead className="text-right">Cost / 1M tokens</TableHead>
                <TableHead className="text-right">Cost / 1K output</TableHead>
                <TableHead className="text-right">Output share</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.model} data-testid={`model-value-row-${row.model}`}>
                  <TableCell className="font-mono text-xs">{row.model}</TableCell>
                  <TableCell
                    data-testid={`model-cost-share-${row.model}`}
                    className="tabular text-right"
                  >
                    {formatPercent(row.cost.total, totals.cost.total)}
                  </TableCell>
                  <TableCell
                    data-testid={`model-token-share-${row.model}`}
                    className="tabular text-right"
                  >
                    {formatPercent(row.tokens.total, totals.tokens.total)}
                  </TableCell>
                  <TableCell
                    data-testid={`model-cost-per-mtokens-${row.model}`}
                    className="tabular text-right"
                  >
                    {formatUsd(row.costPerMTokens)}
                  </TableCell>
                  <TableCell
                    data-testid={`model-cost-per-koutput-${row.model}`}
                    className="tabular text-right"
                  >
                    {formatUsd(row.costPerKOutput)}
                  </TableCell>
                  <TableCell
                    data-testid={`model-output-share-${row.model}`}
                    className="tabular text-right text-muted-foreground"
                  >
                    {formatPercent(row.tokens.output, row.tokens.total)}
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-xs text-muted-foreground">
                    No priced tokens in this selection.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-1">
          <CardTitle className="text-sm font-medium">Cache economics by model</CardTitle>
          <CardDescription className="text-xs">
            The saving is what the cached tokens would have cost at the full input rate, less
            what the writes and reads actually cost. A negative figure means the cache did not
            pay for itself.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-2">
          <Table data-testid="table-model-cache">
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead className="text-right">Cache write</TableHead>
                <TableHead className="text-right">Cache read</TableHead>
                <TableHead className="text-right">At full input rate</TableHead>
                <TableHead className="text-right">Net saving</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.model} data-testid={`model-cache-row-${row.model}`}>
                  <TableCell className="font-mono text-xs">{row.model}</TableCell>
                  <TableCell
                    data-testid={`model-cache-write-${row.model}`}
                    className="tabular text-right"
                  >
                    {formatUsd(row.cacheWrite)}
                  </TableCell>
                  <TableCell
                    data-testid={`model-cache-read-${row.model}`}
                    className="tabular text-right"
                  >
                    {formatUsd(row.cost.cacheRead)}
                  </TableCell>
                  <TableCell
                    data-testid={`model-uncached-cost-${row.model}`}
                    className="tabular text-right text-muted-foreground"
                  >
                    {formatUsd(row.cost.uncachedCacheCost)}
                  </TableCell>
                  <TableCell
                    data-testid={`model-net-saving-${row.model}`}
                    className="tabular text-right"
                  >
                    {formatUsd(row.netSaving)}
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-xs text-muted-foreground">
                    No priced tokens in this selection.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </section>
  );
}
