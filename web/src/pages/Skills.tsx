import { Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from 'recharts';
import type { AggregateStats, UsageCounts } from '../api/types';

export interface PageProps {
  stats: AggregateStats;
  series: Array<{ day: string; counts: UsageCounts }>;
}

const CHART_WIDTH = 600;
const CHART_HEIGHT = 300;

/** Monday (UTC) of the ISO week containing `day` (a local-time calendar date, e.g. '2026-07-09'). */
function weekKey(day: string): string {
  const d = new Date(day + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export function Skills(props: PageProps) {
  const { stats, series } = props;

  // Weekly trend of total skill invocations.
  const trendByWeek = new Map<string, number>();
  for (const { day, counts } of series) {
    const week = weekKey(day);
    trendByWeek.set(week, (trendByWeek.get(week) ?? 0) + counts.skillInvocations);
  }
  const trendData = [...trendByWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, invocations]) => ({ week, invocations }));

  // Per-key counts, aggregated over the series. Key is `${source}|${name}` inside counts.skills.
  const countsByKey = new Map<string, number>();
  for (const { counts } of series) {
    for (const [key, count] of Object.entries(counts.skills)) {
      countsByKey.set(key, (countsByKey.get(key) ?? 0) + count);
    }
  }

  // stats.skills gives the sorted SkillKey[] naming every skill/command present in this selection.
  const rowsByName = new Map<string, { 'skill-tool': number; 'slash-command': number }>();
  for (const { name } of stats.skills) {
    if (!rowsByName.has(name)) rowsByName.set(name, { 'skill-tool': 0, 'slash-command': 0 });
  }
  for (const [key, count] of countsByKey) {
    // Split on the first '|' only: a slash-command name can itself contain '|'.
    const sep = key.indexOf('|');
    const source = key.slice(0, sep) as 'skill-tool' | 'slash-command';
    const name = key.slice(sep + 1);
    if (!rowsByName.has(name)) rowsByName.set(name, { 'skill-tool': 0, 'slash-command': 0 });
    rowsByName.get(name)![source] = count;
  }
  const countData = [...rowsByName.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, counts]) => ({ name, ...counts }));

  // Per-project skill counts, from stats.days directly (not series, so all projects are covered).
  const perProject = new Map<string, number>();
  for (const projects of Object.values(stats.days)) {
    for (const [project, counts] of Object.entries(projects)) {
      perProject.set(project, (perProject.get(project) ?? 0) + counts.skillInvocations);
    }
  }
  const projectRows = [...perProject.entries()].sort(([a], [b]) => a.localeCompare(b));

  return (
    <section data-testid="page-skills">
      <h2>Skills</h2>

      <div data-testid="chart-skill-trend">
        <BarChart width={CHART_WIDTH} height={CHART_HEIGHT} data={trendData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="week" />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Bar dataKey="invocations" fill="#8884d8" />
        </BarChart>
      </div>

      <div data-testid="chart-skill-counts">
        <BarChart width={CHART_WIDTH} height={CHART_HEIGHT} data={countData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Legend />
          <Bar dataKey="skill-tool" fill="#8884d8" />
          <Bar dataKey="slash-command" fill="#82ca9d" />
        </BarChart>
      </div>

      <table data-testid="table-skill-projects">
        <thead>
          <tr>
            <th>Project</th>
            <th>Skill invocations</th>
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
