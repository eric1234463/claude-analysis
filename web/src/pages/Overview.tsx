import { Bar, BarChart, XAxis, YAxis } from 'recharts';
import type { AggregateStats, UsageCounts } from '../api/types';

export interface PageProps {
  stats: AggregateStats;
  series: Array<{ day: string; counts: UsageCounts }>;
  width?: number;
  height?: number;
}

export function dailyMainSidechainData(series: Array<{ day: string; counts: UsageCounts }>) {
  return series.map(({ day, counts }) => ({
    day,
    main: counts.mainTokens.total,
    sidechain: counts.sidechainTokens.total,
  }));
}

export function dailyTokenTypeData(series: Array<{ day: string; counts: UsageCounts }>) {
  return series.map(({ day, counts }) => ({
    day,
    input: counts.tokens.input,
    output: counts.tokens.output,
    cacheRead: counts.tokens.cacheRead,
    cacheCreation: counts.tokens.cacheCreation,
  }));
}

export function Overview({ stats, series, width = 600, height = 300 }: PageProps) {
  const dailyTokensData = dailyMainSidechainData(series);
  const dailyTokenTypesData = dailyTokenTypeData(series);

  const sessionsData = series.map(({ day, counts }) => ({
    day,
    sessions: counts.sessionsStarted,
  }));

  const modelData = Object.entries(stats.totals.models).map(([model, totals]) => ({
    model,
    tokens: totals.total,
  }));

  const projectData = stats.projects.map((project) => {
    let tokens = 0;
    for (const dayCounts of Object.values(stats.days)) {
      tokens += dayCounts[project]?.tokens.total ?? 0;
    }
    return { project, tokens };
  });

  return (
    <section data-testid="page-overview">
      <div data-testid="chart-daily-tokens">
        <p>Daily tokens: main vs subagent</p>
        <BarChart width={width} height={height} data={dailyTokensData}>
          <XAxis dataKey="day" />
          <YAxis />
          <Bar dataKey="main" name="Main" stackId="tokens" fill="#4c72b0" minPointSize={1} />
          <Bar dataKey="sidechain" name="Subagent" stackId="tokens" fill="#dd8452" minPointSize={1} />
        </BarChart>
      </div>

      <div data-testid="chart-daily-token-types">
        <p>Daily tokens by type</p>
        <BarChart width={width} height={height} data={dailyTokenTypesData}>
          <XAxis dataKey="day" />
          <YAxis />
          <Bar dataKey="input" name="Input" stackId="tokenTypes" fill="#4c72b0" minPointSize={1} />
          <Bar dataKey="output" name="Output" stackId="tokenTypes" fill="#dd8452" minPointSize={1} />
          <Bar dataKey="cacheRead" name="Cache read" stackId="tokenTypes" fill="#55a868" minPointSize={1} />
          <Bar
            dataKey="cacheCreation"
            name="Cache creation"
            stackId="tokenTypes"
            fill="#c44e52"
            minPointSize={1}
          />
        </BarChart>
      </div>

      <div data-testid="chart-sessions-per-day">
        <p>Sessions started per day</p>
        <BarChart width={width} height={height} data={sessionsData}>
          <XAxis dataKey="day" />
          <YAxis />
          <Bar dataKey="sessions" name="Sessions" fill="#55a868" />
        </BarChart>
      </div>

      <div data-testid="chart-tokens-by-model">
        <p>Tokens by model</p>
        <BarChart width={width} height={height} data={modelData}>
          <XAxis dataKey="model" />
          <YAxis />
          <Bar dataKey="tokens" name="Tokens" fill="#c44e52" />
        </BarChart>
      </div>

      <div data-testid="chart-tokens-by-project">
        <p>Tokens by project</p>
        <BarChart width={width} height={height} data={projectData}>
          <XAxis dataKey="project" />
          <YAxis />
          <Bar dataKey="tokens" name="Tokens" fill="#8172b2" />
        </BarChart>
      </div>
    </section>
  );
}
