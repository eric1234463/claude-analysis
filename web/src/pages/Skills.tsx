import { Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from 'recharts';
import { Layers, Sparkles } from 'lucide-react';
import type { AggregateStats, UsageCounts } from '../api/types';
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
import { formatNumber } from '@/lib/format';

export interface PageProps {
  stats: AggregateStats;
  series: Array<{ day: string; counts: UsageCounts }>;
}

/** Monday (UTC) of the ISO week containing `day` (a local-time calendar date, e.g. '2026-07-09'). */
function weekKey(day: string): string {
  const d = new Date(day + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

const SEGMENT_GAP = { stroke: 'var(--card)', strokeWidth: 2 } as const;

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

  const totalInvocations = series.reduce((sum, { counts }) => sum + counts.skillInvocations, 0);

  return (
    <section data-testid="page-skills" className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Invocations"
          value={formatNumber(totalInvocations)}
          hint="Across the selected range"
          icon={Sparkles}
        />
        <StatCard
          label="Distinct entries"
          value={formatNumber(countData.length)}
          hint="Skills and commands used at least once"
          icon={Layers}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          testId="chart-skill-trend"
          title="Invocations per week"
          description="Binned to the Monday of each ISO week"
        >
          <BarChart data={trendData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis dataKey="week" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
            <YAxis
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              width={36}
              allowDecimals={false}
            />
            <Tooltip {...TOOLTIP_PROPS} />
            <Bar
              dataKey="invocations"
              name="Invocations"
              fill={CHART_COLORS[0]}
              radius={[4, 4, 0, 0]}
              {...SEGMENT_GAP}
            />
          </BarChart>
        </ChartCard>

        <ChartCard
          testId="chart-skill-counts"
          title="Invocations by name"
          description="Counted separately by how each was triggered"
          height={Math.max(240, countData.length * 34)}
        >
          <BarChart
            data={countData}
            layout="vertical"
            margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
          >
            <CartesianGrid {...GRID_PROPS} vertical horizontal={false} />
            <XAxis
              type="number"
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              width={150}
              tickFormatter={truncateTick}
            />
            <Tooltip {...TOOLTIP_PROPS} />
            <Legend {...LEGEND_PROPS} />
            <Bar
              dataKey="skill-tool"
              fill={CHART_COLORS[0]}
              radius={[0, 4, 4, 0]}
              {...SEGMENT_GAP}
            />
            <Bar
              dataKey="slash-command"
              fill={CHART_COLORS[2]}
              radius={[0, 4, 4, 0]}
              {...SEGMENT_GAP}
            />
          </BarChart>
        </ChartCard>
      </div>

      <Card>
        <CardHeader className="gap-1">
          <CardTitle className="text-sm font-medium">Invocations by project</CardTitle>
          <CardDescription className="text-xs">
            Every project in the selection, including those with none
          </CardDescription>
        </CardHeader>
        <CardContent className="px-2">
          <Table data-testid="table-skill-projects">
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead className="text-right">Skill invocations</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projectRows.map(([project, count]) => (
                <TableRow key={project}>
                  <TableCell className="font-mono text-xs">{project}</TableCell>
                  <TableCell className="tabular text-right">{count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </section>
  );
}
