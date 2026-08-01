import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import type { AggregateStats, UsageCounts } from '../api/types';

export interface PageProps {
  stats: AggregateStats;
  series: Array<{ day: string; counts: UsageCounts }>;
}

const CHART_WIDTH = 600;
const CHART_HEIGHT = 300;

function errorRate(errors: number, calls: number): number {
  return calls === 0 ? 0 : errors / calls;
}

export function Tools(props: PageProps) {
  const { stats, series } = props;

  // Aggregate calls/errors per tool over the series.
  const totalsByTool = new Map<string, { calls: number; errors: number }>();
  for (const { counts } of series) {
    for (const [tool, { calls, errors }] of Object.entries(counts.tools)) {
      const prev = totalsByTool.get(tool) ?? { calls: 0, errors: 0 };
      totalsByTool.set(tool, { calls: prev.calls + calls, errors: prev.errors + errors });
    }
  }
  for (const tool of stats.tools) {
    if (!totalsByTool.has(tool)) totalsByTool.set(tool, { calls: 0, errors: 0 });
  }

  // Ranked by calls descending.
  const ranked = [...totalsByTool.entries()].sort(([, a], [, b]) => b.calls - a.calls);

  // Per-project tool call counts, from stats.days directly so all projects are covered.
  const perProject = new Map<string, number>();
  for (const projects of Object.values(stats.days)) {
    for (const [project, counts] of Object.entries(projects)) {
      perProject.set(project, (perProject.get(project) ?? 0) + counts.toolCalls);
    }
  }
  const projectRows = [...perProject.entries()].sort(([a], [b]) => a.localeCompare(b));

  return (
    <section data-testid="page-tools">
      <h2>Tools</h2>

      <div data-testid="chart-tool-calls">
        <BarChart width={CHART_WIDTH} height={CHART_HEIGHT} data={ranked.map(([tool, t]) => ({ tool, calls: t.calls }))}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="tool" />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Bar dataKey="calls" fill="#8884d8" />
        </BarChart>
      </div>

      <table data-testid="table-tool-errors">
        <thead>
          <tr>
            <th>Tool</th>
            <th>Calls</th>
            <th>Errors</th>
            <th>Error rate</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map(([tool, { calls, errors }]) => (
            <tr key={tool}>
              <td>{tool}</td>
              <td>{calls}</td>
              <td>{errors}</td>
              <td>{Math.round(errorRate(errors, calls) * 100)}%</td>
            </tr>
          ))}
        </tbody>
      </table>

      <table data-testid="table-tool-projects">
        <thead>
          <tr>
            <th>Project</th>
            <th>Tool calls</th>
          </tr>
        </thead>
        <tbody>
          {projectRows.map(([project, count]) => (
            <tr key={project}>
              <td>{project}</td>
              <td>{count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
