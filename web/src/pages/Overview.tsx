import { Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from 'recharts';
import { Coins, MessagesSquare, Wrench, Zap } from 'lucide-react';
import type { AggregateStats } from '../api/types';
import type { SeriesPoint } from '../api/filterStats';
import { GRANULARITY_ADJECTIVE, GRANULARITY_NOUN, type Granularity } from '../api/granularity';
import {
  AXIS_LINE,
  AXIS_TICK,
  CHART_COLORS,
  ChartCard,
  GRID_PROPS,
  LEGEND_PROPS,
  StatCard,
  TOOLTIP_PROPS,
  formatTooltipNumber,
  truncateTick,
} from '@/components/charts';
import { formatCompact, formatNumber, formatPercent } from '@/lib/format';

export interface PageProps {
  stats: AggregateStats;
  series: SeriesPoint[];
  granularity: Granularity;
}

export function mainSidechainData(series: readonly SeriesPoint[]) {
  return series.map(({ bucket, counts }) => ({
    bucket,
    main: counts.mainTokens.total,
    sidechain: counts.sidechainTokens.total,
  }));
}

export function tokenTypeData(series: readonly SeriesPoint[]) {
  return series.map(({ bucket, counts }) => ({
    bucket,
    input: counts.tokens.input,
    output: counts.tokens.output,
    cacheRead: counts.tokens.cacheRead,
    cacheCreation: counts.tokens.cacheCreation,
  }));
}

/** Separates stacked segments and adjacent bars with a 2px gap in the surface colour. */
const SEGMENT_GAP = { stroke: 'var(--card)', strokeWidth: 2 } as const;

const tokenTooltip = { ...TOOLTIP_PROPS, formatter: formatTooltipNumber };

export function Overview({ stats, series, granularity }: PageProps) {
  const tokensData = mainSidechainData(series);
  const tokenTypesData = tokenTypeData(series);

  const sessionsData = series.map(({ bucket, counts }) => ({
    bucket,
    sessions: counts.sessionsStarted,
  }));

  const modelData = Object.entries(stats.totals.models)
    .map(([model, totals]) => ({ model, tokens: totals.total }))
    .sort((a, b) => b.tokens - a.tokens);

  const projectData = stats.projects
    .map((project) => {
      let tokens = 0;
      for (const dayCounts of Object.values(stats.days)) {
        tokens += dayCounts[project]?.tokens.total ?? 0;
      }
      return { project, tokens };
    })
    .sort((a, b) => b.tokens - a.tokens);

  const { totals } = stats;
  const cacheDenominator =
    totals.tokens.input + totals.tokens.cacheRead + totals.tokens.cacheCreation;

  return (
    <section data-testid="page-overview" className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total tokens"
          value={formatCompact(totals.tokens.total)}
          hint={`${formatNumber(totals.tokens.total)} across the selection`}
          icon={Coins}
        />
        <StatCard
          label="Sessions"
          value={formatNumber(totals.sessionsStarted)}
          hint="Started in this range"
          icon={MessagesSquare}
        />
        <StatCard
          label="Tool calls"
          value={formatNumber(totals.toolCalls)}
          hint={`${formatNumber(totals.toolErrors)} returned an error`}
          icon={Wrench}
        />
        <StatCard
          label="Cache hit rate"
          value={formatPercent(totals.tokens.cacheRead, cacheDenominator)}
          hint="Cache reads of all read tokens"
          icon={Zap}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          testId="chart-daily-tokens"
          title={`${GRANULARITY_ADJECTIVE[granularity]} tokens`}
          description="Split by execution context"
          className="lg:col-span-2"
        >
          <BarChart data={tokensData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis dataKey="bucket" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
            <YAxis
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              width={48}
              tickFormatter={formatCompact}
            />
            <Tooltip {...tokenTooltip} />
            <Legend {...LEGEND_PROPS} />
            <Bar
              dataKey="main"
              name="Main"
              stackId="tokens"
              fill={CHART_COLORS[0]}
              minPointSize={1}
              {...SEGMENT_GAP}
            />
            <Bar
              dataKey="sidechain"
              name="Subagent"
              stackId="tokens"
              fill={CHART_COLORS[1]}
              minPointSize={1}
              radius={[4, 4, 0, 0]}
              {...SEGMENT_GAP}
            />
          </BarChart>
        </ChartCard>

        <ChartCard
          testId="chart-daily-token-types"
          title={`${GRANULARITY_ADJECTIVE[granularity]} tokens by type`}
          description="Input, output and cache traffic"
          className="lg:col-span-2"
        >
          <BarChart data={tokenTypesData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis dataKey="bucket" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
            <YAxis
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              width={48}
              tickFormatter={formatCompact}
            />
            <Tooltip {...tokenTooltip} />
            <Legend {...LEGEND_PROPS} />
            <Bar
              dataKey="input"
              name="Input"
              stackId="tokenTypes"
              fill={CHART_COLORS[0]}
              minPointSize={1}
              {...SEGMENT_GAP}
            />
            <Bar
              dataKey="output"
              name="Output"
              stackId="tokenTypes"
              fill={CHART_COLORS[1]}
              minPointSize={1}
              {...SEGMENT_GAP}
            />
            <Bar
              dataKey="cacheRead"
              name="Cache read"
              stackId="tokenTypes"
              fill={CHART_COLORS[2]}
              minPointSize={1}
              {...SEGMENT_GAP}
            />
            <Bar
              dataKey="cacheCreation"
              name="Cache creation"
              stackId="tokenTypes"
              fill={CHART_COLORS[3]}
              minPointSize={1}
              radius={[4, 4, 0, 0]}
              {...SEGMENT_GAP}
            />
          </BarChart>
        </ChartCard>

        <ChartCard
          testId="chart-sessions-per-day"
          title="Sessions started"
          description={`New sessions per ${GRANULARITY_NOUN[granularity]}`}
        >
          <BarChart data={sessionsData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis dataKey="bucket" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
            <Tooltip {...TOOLTIP_PROPS} />
            <Bar
              dataKey="sessions"
              name="Sessions"
              fill={CHART_COLORS[2]}
              radius={[4, 4, 0, 0]}
              {...SEGMENT_GAP}
            />
          </BarChart>
        </ChartCard>

        <ChartCard testId="chart-tokens-by-model" title="Tokens by model" description="Ranked by volume">
          <BarChart
            data={modelData}
            layout="vertical"
            margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
          >
            <CartesianGrid {...GRID_PROPS} vertical horizontal={false} />
            <XAxis
              type="number"
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              tickFormatter={formatCompact}
            />
            <YAxis
              type="category"
              dataKey="model"
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              width={140}
              tickFormatter={truncateTick}
            />
            <Tooltip {...tokenTooltip} />
            <Bar
              dataKey="tokens"
              name="Tokens"
              fill={CHART_COLORS[3]}
              radius={[0, 4, 4, 0]}
              {...SEGMENT_GAP}
            />
          </BarChart>
        </ChartCard>

        <ChartCard
          testId="chart-tokens-by-project"
          title="Tokens by project"
          description="Ranked by volume"
          className="lg:col-span-2"
        >
          <BarChart
            data={projectData}
            layout="vertical"
            margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
          >
            <CartesianGrid {...GRID_PROPS} vertical horizontal={false} />
            <XAxis
              type="number"
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              tickFormatter={formatCompact}
            />
            <YAxis
              type="category"
              dataKey="project"
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              width={220}
              tickFormatter={truncateTick}
            />
            <Tooltip {...tokenTooltip} />
            <Bar
              dataKey="tokens"
              name="Tokens"
              fill={CHART_COLORS[4]}
              radius={[0, 4, 4, 0]}
              {...SEGMENT_GAP}
            />
          </BarChart>
        </ChartCard>
      </div>
    </section>
  );
}
