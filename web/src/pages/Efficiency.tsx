import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import type { AggregateStats, UsageCounts } from '../api/types';

export interface PageProps {
  stats: AggregateStats;
  series: Array<{ day: string; counts: UsageCounts }>;
}

function formatPercent(numerator: number, denominator: number): string {
  if (!denominator) return '0%';
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function formatInteger(numerator: number, denominator: number): string {
  if (!denominator) return '0';
  return `${Math.round(numerator / denominator)}`;
}

export function Efficiency({ stats, width = 600, height = 300 }: PageProps) {
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
    </section>
  );
}
