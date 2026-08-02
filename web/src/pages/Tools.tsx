import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { CircleAlert, Wrench } from 'lucide-react';
import type { AggregateStats, UsageCounts } from '../api/types';
import { Badge } from '@/components/ui/badge';
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
  AXIS_TICK,
  CHART_COLORS,
  ChartCard,
  GRID_PROPS,
  StatCard,
  TOOLTIP_PROPS,
  truncateTick,
} from '@/components/charts';
import { formatNumber } from '@/lib/format';

export interface PageProps {
  stats: AggregateStats;
  series: Array<{ day: string; counts: UsageCounts }>;
}

const SEGMENT_GAP = { stroke: 'var(--card)', strokeWidth: 2 } as const;

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

  const totalCalls = ranked.reduce((sum, [, t]) => sum + t.calls, 0);
  const totalErrors = ranked.reduce((sum, [, t]) => sum + t.errors, 0);

  return (
    <section data-testid="page-tools" className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Tool calls"
          value={formatNumber(totalCalls)}
          hint={`${ranked.length} distinct tools`}
          icon={Wrench}
        />
        <StatCard
          label="Errors"
          value={formatNumber(totalErrors)}
          hint={`${Math.round(errorRate(totalErrors, totalCalls) * 100)}% of all calls`}
          icon={CircleAlert}
        />
      </div>

      <ChartCard
        testId="chart-tool-calls"
        title="Calls by tool"
        description="Ranked by call volume"
        height={Math.max(240, ranked.length * 34)}
      >
        <BarChart
          data={ranked.map(([tool, t]) => ({ tool, calls: t.calls }))}
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
            dataKey="tool"
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={130}
            tickFormatter={truncateTick}
          />
          <Tooltip {...TOOLTIP_PROPS} />
          <Bar
            dataKey="calls"
            name="Calls"
            fill={CHART_COLORS[0]}
            radius={[0, 4, 4, 0]}
            {...SEGMENT_GAP}
          />
        </BarChart>
      </ChartCard>

      <Card>
        <CardHeader className="gap-1">
          <CardTitle className="text-sm font-medium">Reliability by tool</CardTitle>
          <CardDescription className="text-xs">
            Failure rate over the calls in this selection
          </CardDescription>
        </CardHeader>
        <CardContent className="px-2">
          <Table data-testid="table-tool-errors">
            <TableHeader>
              <TableRow>
                <TableHead>Tool</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Errors</TableHead>
                <TableHead className="text-right">Error rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ranked.map(([tool, { calls, errors }]) => {
                const rate = Math.round(errorRate(errors, calls) * 100);
                return (
                  <TableRow key={tool}>
                    <TableCell className="font-medium">{tool}</TableCell>
                    <TableCell className="tabular text-right">{calls}</TableCell>
                    <TableCell className="tabular text-right">{errors}</TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant={rate === 0 ? 'secondary' : 'destructive'}
                        className="tabular"
                      >
                        {rate}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-1">
          <CardTitle className="text-sm font-medium">Calls by project</CardTitle>
          <CardDescription className="text-xs">
            Every project in the selection, including those with none
          </CardDescription>
        </CardHeader>
        <CardContent className="px-2">
          <Table data-testid="table-tool-projects">
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead className="text-right">Tool calls</TableHead>
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
