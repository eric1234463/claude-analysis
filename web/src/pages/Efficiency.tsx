import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import type { AggregateStats, UsageCounts } from '../api/types';

export interface PageProps {
  stats: AggregateStats;
  series: Array<{ day: string; counts: UsageCounts }>;
  width?: number;
  height?: number;
}

function formatPercent(numerator: number, denominator: number): string {
  if (!denominator) return '0%';
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function formatInteger(numerator: number, denominator: number): string {
  if (!denominator) return '0';
  return `${Math.round(numerator / denominator)}`;
}

function safeRatio(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return (numerator / denominator) * 100;
}

export function cacheHitTrendData(series: Array<{ day: string; counts: UsageCounts }>) {
  return series.map(({ day, counts }) => ({
    day,
    cacheHitRatio: safeRatio(
      counts.tokens.cacheRead,
      counts.tokens.input + counts.tokens.cacheRead + counts.tokens.cacheCreation,
    ),
  }));
}

export function toolErrorTrendData(series: Array<{ day: string; counts: UsageCounts }>) {
  return series.map(({ day, counts }) => ({
    day,
    toolErrorRate: safeRatio(counts.toolErrors, counts.toolCalls),
  }));
}

export function Efficiency({ stats, series, width = 600, height = 300 }: PageProps) {
  const { totals } = stats;

  const cacheHitRatio = formatPercent(
    totals.tokens.cacheRead,
    totals.tokens.input + totals.tokens.cacheRead + totals.tokens.cacheCreation,
  );
  const toolErrorRate = formatPercent(totals.toolErrors, totals.toolCalls);
  const avgTokensPerSession = formatInteger(totals.tokens.total, totals.sessionsStarted);
  const sidechainShare = formatPercent(totals.sidechainTokens.total, totals.tokens.total);

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

  return (
    <section data-testid="page-efficiency">
      <div data-testid="metric-cache-hit-ratio">{cacheHitRatio}</div>
      <div data-testid="metric-tool-error-rate">{toolErrorRate}</div>
      <div data-testid="metric-avg-tokens-per-session">{avgTokensPerSession}</div>
      <div data-testid="metric-sidechain-share">{sidechainShare}</div>
      <div data-testid="metric-agent-runs">{totals.agentRuns}</div>
      <ul data-testid="list-agent-types">
        {agentTypes.map((agent) => (
          <li key={agent.name}>
            <span>{agent.name}</span>: {agent.runs} runs, {agent.tokens} tokens
          </li>
        ))}
      </ul>
      <div data-testid="chart-active-projects">
        <BarChart width={width} height={height} data={activeProjects} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" />
          <YAxis type="category" dataKey="project" />
          <Bar dataKey="tokens" fill="#8884d8" />
        </BarChart>
      </div>
      <div data-testid="chart-cache-hit-trend">
        <p>Cache hit ratio per day</p>
        <BarChart width={width} height={height} data={cacheHitTrend}>
          <XAxis dataKey="day" />
          <YAxis />
          <Bar dataKey="cacheHitRatio" name="Cache hit %" fill="#55a868" minPointSize={1} />
        </BarChart>
      </div>
      <div data-testid="chart-tool-error-trend">
        <p>Tool error rate per day</p>
        <BarChart width={width} height={height} data={toolErrorTrend}>
          <XAxis dataKey="day" />
          <YAxis />
          <Bar dataKey="toolErrorRate" name="Tool error %" fill="#c44e52" minPointSize={1} />
        </BarChart>
      </div>
    </section>
  );
}
