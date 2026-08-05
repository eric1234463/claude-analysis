import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { Bot, CircleAlert, Gauge, Layers, Split } from 'lucide-react';
import type { AggregateStats, ThroughputCounts, UsageCounts } from '../api/types';
import type { SeriesPoint } from '../api/filterStats';
import { GRANULARITY_NOUN, type Granularity } from '../api/granularity';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AXIS_LINE,
  AXIS_TICK,
  CHART_COLORS,
  ChartCard,
  GRID_PROPS,
  StatCard,
  TOOLTIP_PROPS,
  formatTooltipNumber,
  formatTooltipPercent,
  truncateTick,
} from '@/components/charts';
import { formatCompact, formatNumber, formatPercent } from '@/lib/format';

export interface PageProps {
  stats: AggregateStats;
  series: SeriesPoint[];
  granularity: Granularity;
}

const SEGMENT_GAP = { stroke: 'var(--card)', strokeWidth: 2 } as const;

function formatInteger(numerator: number, denominator: number): string {
  if (!denominator) return '0';
  return `${Math.round(numerator / denominator)}`;
}

function safeRatio(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return (numerator / denominator) * 100;
}

function throughputRate(outputTokens: number, durationMs: number): number {
  if (durationMs === 0) return 0;
  return outputTokens / (durationMs / 1000);
}

/**
 * Rate trends divide *after* the bucket's counts were merged, so a week or month is weighted by
 * volume rather than being the mean of its days' ratios — a quiet Sunday cannot swing the week.
 */
export function cacheHitTrendData(series: readonly SeriesPoint[]) {
  return series.map(({ bucket, counts }) => ({
    bucket,
    cacheHitRatio: safeRatio(
      counts.tokens.cacheRead,
      counts.tokens.input + counts.tokens.cacheRead + counts.tokens.cacheCreation,
    ),
  }));
}

export function toolErrorTrendData(series: readonly SeriesPoint[]) {
  return series.map(({ bucket, counts }) => ({
    bucket,
    toolErrorRate: safeRatio(counts.toolErrors, counts.toolCalls),
  }));
}

export function throughputTrendData(series: readonly SeriesPoint[]) {
  return series.map(({ bucket, counts }) => ({
    bucket,
    throughput: throughputRate(counts.throughput.outputTokens, counts.throughput.durationMs),
  }));
}

function sortedThroughputEntries(entries: Readonly<Record<string, ThroughputCounts>>) {
  return Object.entries(entries).sort(([left], [right]) => (
    left < right ? -1 : left > right ? 1 : 0
  ));
}

export function modelThroughputData(entries: Readonly<Record<string, ThroughputCounts>>) {
  return sortedThroughputEntries(entries).map(([model, counts]) => ({
    model,
    throughput: throughputRate(counts.outputTokens, counts.durationMs),
  }));
}

export function laneThroughputData(
  totals: Pick<UsageCounts, 'mainThroughput' | 'sidechainThroughput'>,
) {
  return [
    {
      lane: 'Main',
      throughput: throughputRate(
        totals.mainThroughput.outputTokens,
        totals.mainThroughput.durationMs,
      ),
    },
    {
      lane: 'Sidechain',
      throughput: throughputRate(
        totals.sidechainThroughput.outputTokens,
        totals.sidechainThroughput.durationMs,
      ),
    },
  ];
}

export function skillThroughputData(entries: Readonly<Record<string, ThroughputCounts>>) {
  return sortedThroughputEntries(entries).map(([skill, counts]) => ({
    skill,
    throughput: throughputRate(counts.outputTokens, counts.durationMs),
  }));
}

export function projectThroughputData(days: AggregateStats['days']) {
  const projectSums = new Map<string, Pick<ThroughputCounts, 'outputTokens' | 'durationMs'>>();

  for (const dayCells of Object.values(days)) {
    for (const [project, counts] of Object.entries(dayCells)) {
      const previous = projectSums.get(project) ?? { outputTokens: 0, durationMs: 0 };
      projectSums.set(project, {
        outputTokens: previous.outputTokens + counts.throughput.outputTokens,
        durationMs: previous.durationMs + counts.throughput.durationMs,
      });
    }
  }

  return [...projectSums.entries()]
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([project, counts]) => ({
      project,
      throughput: throughputRate(counts.outputTokens, counts.durationMs),
    }));
}

const percentTooltip = { ...TOOLTIP_PROPS, formatter: formatTooltipPercent };

/** Shared axis config for the two rate trends, so both read on the same 0–100 scale. */
const percentAxis = {
  tick: AXIS_TICK,
  axisLine: false,
  tickLine: false,
  width: 44,
  domain: [0, 100],
  tickFormatter: (value: number) => `${value}%`,
} as const;

export function Efficiency({ stats, series, granularity }: PageProps) {
  const { totals } = stats;

  const cacheHitRatio = formatPercent(
    totals.tokens.cacheRead,
    totals.tokens.input + totals.tokens.cacheRead + totals.tokens.cacheCreation,
  );
  const toolErrorRate = formatPercent(totals.toolErrors, totals.toolCalls);
  const avgTokensPerSession = formatInteger(totals.tokens.total, totals.sessionsStarted);
  const sidechainShare = formatPercent(totals.sidechainTokens.total, totals.tokens.total);
  const throughput = throughputRate(
    totals.throughput.outputTokens,
    totals.throughput.durationMs,
  );
  const throughputRequestCount = totals.throughput.requests + totals.throughput.excludedRequests;

  const agentTypes = stats.agents.map((name) => ({
    name,
    runs: totals.agents[name]?.runs ?? 0,
    tokens: totals.agents[name]?.tokens.total ?? 0,
  }));

  const projectTokens = new Map<string, number>();
  for (const dayCells of Object.values(stats.days)) {
    for (const [project, counts] of Object.entries(dayCells)) {
      projectTokens.set(project, (projectTokens.get(project) ?? 0) + counts.tokens.total);
    }
  }
  const activeProjects = [...projectTokens.entries()]
    .map(([project, tokens]) => ({ project, tokens }))
    .sort((a, b) => b.tokens - a.tokens);

  const cacheHitTrend = cacheHitTrendData(series);
  const toolErrorTrend = toolErrorTrendData(series);
  const throughputTrend = throughputTrendData(series);
  const modelThroughput = modelThroughputData(totals.modelThroughput);
  const laneThroughput = laneThroughputData(totals);
  const skillThroughput = skillThroughputData(totals.skillThroughput);
  const projectThroughput = projectThroughputData(stats.days);

  return (
    <section data-testid="page-efficiency" className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Card>
          <CardContent className="px-5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Response throughput
              </span>
              <Gauge className="size-4 shrink-0 text-muted-foreground" />
            </div>
            <div
              data-testid="metric-throughput"
              className="tabular mt-2 text-2xl leading-none font-semibold"
            >
              {throughput.toFixed(1)} tok/s
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Includes queue and prompt-processing time
            </p>
            <p
              data-testid="metric-throughput-excluded"
              className="mt-1 text-xs text-muted-foreground"
            >
              {formatNumber(totals.throughput.excludedRequests)} of{' '}
              {formatNumber(throughputRequestCount)} requests excluded
            </p>
          </CardContent>
        </Card>
        <StatCard
          label="Cache hit ratio"
          value={cacheHitRatio}
          valueTestId="metric-cache-hit-ratio"
          hint="Cache reads of all read tokens"
          icon={Gauge}
        />
        <StatCard
          label="Tool error rate"
          value={toolErrorRate}
          valueTestId="metric-tool-error-rate"
          hint="Failed calls of all calls"
          icon={CircleAlert}
        />
        <StatCard
          label="Tokens / session"
          value={avgTokensPerSession}
          valueTestId="metric-avg-tokens-per-session"
          hint="Mean over sessions started"
          icon={Layers}
        />
        <StatCard
          label="Subagent share"
          value={sidechainShare}
          valueTestId="metric-sidechain-share"
          hint="Of all tokens spent"
          icon={Split}
        />
        <StatCard
          label="Subagent runs"
          value={formatNumber(totals.agentRuns)}
          valueTestId="metric-agent-runs"
          hint={`${agentTypes.length} agent types`}
          icon={Bot}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          testId="chart-throughput-trend"
          title={`Response throughput per ${GRANULARITY_NOUN[granularity]}`}
          description="Output tokens per end-to-end response second"
        >
          <BarChart data={throughputTrend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis dataKey="bucket" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={44} />
            <Tooltip {...TOOLTIP_PROPS} />
            <Bar
              dataKey="throughput"
              name="Response throughput (tok/s)"
              fill={CHART_COLORS[0]}
              minPointSize={1}
              radius={[4, 4, 0, 0]}
              {...SEGMENT_GAP}
            />
          </BarChart>
        </ChartCard>

        <ChartCard
          testId="chart-lane-throughput"
          title="Response throughput by lane"
          description="Main and sidechain end-to-end rates"
          height={Math.max(240, laneThroughput.length * 34)}
        >
          <BarChart
            data={laneThroughput}
            layout="vertical"
            margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
          >
            <CartesianGrid {...GRID_PROPS} vertical horizontal={false} />
            <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} />
            <YAxis
              type="category"
              dataKey="lane"
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              width={140}
            />
            <Tooltip {...TOOLTIP_PROPS} formatter={formatTooltipNumber} />
            <Bar
              dataKey="throughput"
              name="Response throughput (tok/s)"
              fill={CHART_COLORS[1]}
              minPointSize={1}
              radius={[0, 4, 4, 0]}
              {...SEGMENT_GAP}
            />
          </BarChart>
        </ChartCard>

        <ChartCard
          testId="chart-skill-throughput"
          title="Response throughput by skill"
          description="Volume-weighted end-to-end rate"
          height={Math.max(240, skillThroughput.length * 34)}
        >
          <BarChart
            data={skillThroughput}
            layout="vertical"
            margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
          >
            <CartesianGrid {...GRID_PROPS} vertical horizontal={false} />
            <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} />
            <YAxis
              type="category"
              dataKey="skill"
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              width={140}
              tickFormatter={truncateTick}
            />
            <Tooltip {...TOOLTIP_PROPS} formatter={formatTooltipNumber} />
            <Bar
              dataKey="throughput"
              name="Response throughput (tok/s)"
              fill={CHART_COLORS[2]}
              minPointSize={1}
              radius={[0, 4, 4, 0]}
              {...SEGMENT_GAP}
            />
          </BarChart>
        </ChartCard>

        <ChartCard
          testId="chart-project-throughput"
          title="Response throughput by project"
          description="Merged across selected days before deriving the rate"
          height={Math.max(240, projectThroughput.length * 34)}
        >
          <BarChart
            data={projectThroughput}
            layout="vertical"
            margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
          >
            <CartesianGrid {...GRID_PROPS} vertical horizontal={false} />
            <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} />
            <YAxis
              type="category"
              dataKey="project"
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              width={140}
              tickFormatter={truncateTick}
            />
            <Tooltip {...TOOLTIP_PROPS} formatter={formatTooltipNumber} />
            <Bar
              dataKey="throughput"
              name="Response throughput (tok/s)"
              fill={CHART_COLORS[3]}
              minPointSize={1}
              radius={[0, 4, 4, 0]}
              {...SEGMENT_GAP}
            />
          </BarChart>
        </ChartCard>

        <ChartCard
          testId="chart-model-throughput"
          title="Response throughput by model"
          description="Volume-weighted end-to-end rate"
          height={Math.max(240, modelThroughput.length * 34)}
        >
          <BarChart
            data={modelThroughput}
            layout="vertical"
            margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
          >
            <CartesianGrid {...GRID_PROPS} vertical horizontal={false} />
            <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} />
            <YAxis
              type="category"
              dataKey="model"
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              width={140}
              tickFormatter={truncateTick}
            />
            <Tooltip {...TOOLTIP_PROPS} />
            <Bar
              dataKey="throughput"
              name="Response throughput (tok/s)"
              fill={CHART_COLORS[0]}
              radius={[0, 4, 4, 0]}
              {...SEGMENT_GAP}
            />
          </BarChart>
        </ChartCard>

        <ChartCard
          testId="chart-cache-hit-trend"
          title={`Cache hit ratio per ${GRANULARITY_NOUN[granularity]}`}
          description="Higher is cheaper"
        >
          <BarChart data={cacheHitTrend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis dataKey="bucket" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
            <YAxis {...percentAxis} />
            <Tooltip {...percentTooltip} />
            <Bar
              dataKey="cacheHitRatio"
              name="Cache hit %"
              fill={CHART_COLORS[2]}
              minPointSize={1}
              radius={[4, 4, 0, 0]}
              {...SEGMENT_GAP}
            />
          </BarChart>
        </ChartCard>

        <ChartCard
          testId="chart-tool-error-trend"
          title={`Tool error rate per ${GRANULARITY_NOUN[granularity]}`}
          description="Lower is better"
        >
          <BarChart data={toolErrorTrend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis dataKey="bucket" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
            <YAxis {...percentAxis} />
            <Tooltip {...percentTooltip} />
            <Bar
              dataKey="toolErrorRate"
              name="Tool error %"
              fill={CHART_COLORS[4]}
              minPointSize={1}
              radius={[4, 4, 0, 0]}
              {...SEGMENT_GAP}
            />
          </BarChart>
        </ChartCard>
      </div>

      <ChartCard
        testId="chart-active-projects"
        title="Most active projects"
        description="Total tokens, ranked"
        height={Math.max(240, activeProjects.length * 34)}
      >
        <BarChart
          data={activeProjects}
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
          <Tooltip {...TOOLTIP_PROPS} formatter={formatTooltipNumber} />
          <Bar
            dataKey="tokens"
            name="Tokens"
            fill={CHART_COLORS[0]}
            radius={[0, 4, 4, 0]}
            {...SEGMENT_GAP}
          />
        </BarChart>
      </ChartCard>

      <Card>
        <CardHeader className="gap-1">
          <CardTitle className="text-sm font-medium">Subagents by type</CardTitle>
          <CardDescription className="text-xs">Runs and tokens attributed to each</CardDescription>
        </CardHeader>
        <CardContent className="px-5">
          <ul data-testid="list-agent-types" className="divide-y divide-border">
            {agentTypes.map((agent) => (
              <li
                key={agent.name}
                className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
              >
                <span className="font-mono text-xs">{agent.name}</span>
                <span className="tabular text-xs text-muted-foreground">
                  {formatNumber(agent.runs)} runs · {formatNumber(agent.tokens)} tokens
                </span>
              </li>
            ))}
            {agentTypes.length === 0 && (
              <li className="py-3 text-xs text-muted-foreground">
                No subagents ran in this selection.
              </li>
            )}
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}
