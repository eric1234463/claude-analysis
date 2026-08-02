import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from 'recharts';
import { Coins, Layers, Sparkles } from 'lucide-react';
import type { AggregateStats } from '../api/types';
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
import { formatCompact, formatNumber } from '@/lib/format';
import { isPersonalSkill } from '../api/builtinSkills';

export interface PageProps {
  stats: AggregateStats;
  series: SeriesPoint[];
  granularity: Granularity;
}

const SEGMENT_GAP = { stroke: 'var(--card)', strokeWidth: 2 } as const;

/** Split a `${source}|${name}` key on the first '|' — a slash-command name can itself contain one. */
function splitKey(key: string): { source: 'skill-tool' | 'slash-command'; name: string } {
  const sep = key.indexOf('|');
  return { source: key.slice(0, sep) as 'skill-tool' | 'slash-command', name: key.slice(sep + 1) };
}

/**
 * Invocations in one cell, counting only skills you wrote. `counts.skillInvocations` is unusable
 * here: it is pre-summed over every name, built-ins included, so it would disagree with the rows.
 */
function personalInvocations(skills: Record<string, number>): number {
  let total = 0;
  for (const [key, count] of Object.entries(skills)) {
    if (isPersonalSkill(splitKey(key).name)) total += count;
  }
  return total;
}

/** The columns the usage table can be ordered by. All sort descending. */
type SortKey = 'invocations' | 'tokens';

function SortableHead(props: { label: string; active: boolean; onClick: () => void }) {
  const { label, active, onClick } = props;
  return (
    <TableHead className="text-right">
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={`hover:text-foreground ${active ? 'text-foreground' : ''}`}
      >
        {label}
        {active ? ' ↓' : ''}
      </button>
    </TableHead>
  );
}

export function Skills(props: PageProps) {
  const { stats, series, granularity } = props;
  const [sortBy, setSortBy] = useState<SortKey>('invocations');

  // Trend of total skill invocations, on whatever bucket the series was built at.
  const trendData = series.map(({ bucket, counts }) => ({
    bucket,
    invocations: personalInvocations(counts.skills),
  }));

  // Per-key counts, aggregated over the series. Key is `${source}|${name}` inside counts.skills.
  // Claude Code's own skills and slash commands are dropped throughout this page — the tab is for
  // the skills you wrote, and /context or /compact would otherwise dominate every ranking.
  const countsByKey = new Map<string, number>();
  for (const { counts } of series) {
    for (const [key, count] of Object.entries(counts.skills)) {
      if (!isPersonalSkill(splitKey(key).name)) continue;
      countsByKey.set(key, (countsByKey.get(key) ?? 0) + count);
    }
  }

  // stats.skills gives the sorted SkillKey[] naming every skill/command present in this selection.
  const rowsByName = new Map<string, { 'skill-tool': number; 'slash-command': number }>();
  for (const { name } of stats.skills) {
    if (!isPersonalSkill(name)) continue;
    if (!rowsByName.has(name)) rowsByName.set(name, { 'skill-tool': 0, 'slash-command': 0 });
  }
  for (const [key, count] of countsByKey) {
    const { source, name } = splitKey(key);
    if (!rowsByName.has(name)) rowsByName.set(name, { 'skill-tool': 0, 'slash-command': 0 });
    rowsByName.get(name)![source] = count;
  }
  // Ranked by how often each name was used; name breaks ties so the order stays stable.
  const countData = [...rowsByName.entries()]
    .map(([name, counts]) => ({ name, ...counts }))
    .sort((a, b) =>
      (b['skill-tool'] + b['slash-command']) - (a['skill-tool'] + a['slash-command'])
      || a.name.localeCompare(b.name));

  // Tokens spent inside each skill, keyed on the bare name — `attributionSkill` records no
  // source, so unlike `counts.skills` these cannot be split by how the skill was triggered.
  const tokensByName = new Map<string, { weight: number; total: number }>();
  for (const { counts } of series) {
    for (const [name, totals] of Object.entries(counts.skillTokens)) {
      if (!isPersonalSkill(name)) continue;
      const prev = tokensByName.get(name) ?? { weight: 0, total: 0 };
      // `weight` is output + cacheCreation: the skill's own footprint. Plain `total` is dominated
      // by cacheRead, which scales with how long the session ran, not with what the skill did.
      tokensByName.set(name, {
        weight: prev.weight + totals.output + totals.cacheCreation,
        total: prev.total + totals.total,
      });
    }
  }

  // Union of both: across a filtered range a skill can be invoked with its usage-bearing turns out
  // of view, or carry attributed tokens whose invocation fell on an earlier day.
  const usageRows = [...new Set([...rowsByName.keys(), ...tokensByName.keys()])]
    .map((name) => {
      const counts = rowsByName.get(name);
      const tokens = tokensByName.get(name);
      return {
        name,
        invocations: counts ? counts['skill-tool'] + counts['slash-command'] : 0,
        weight: tokens?.weight ?? null,
        total: tokens?.total ?? null,
      };
    })
    .sort((a, b) =>
      (sortBy === 'tokens' ? (b.weight ?? -1) - (a.weight ?? -1) : b.invocations - a.invocations)
      || a.name.localeCompare(b.name));

  // Per-project skill counts, from stats.days directly (not series, so all projects are covered).
  const perProject = new Map<string, number>();
  for (const projects of Object.values(stats.days)) {
    for (const [project, counts] of Object.entries(projects)) {
      perProject.set(project, (perProject.get(project) ?? 0) + personalInvocations(counts.skills));
    }
  }
  const projectRows = [...perProject.entries()]
    .sort(([aName, aCount], [bName, bCount]) => bCount - aCount || aName.localeCompare(bName));

  const totalInvocations = [...countsByKey.values()].reduce((sum, count) => sum + count, 0);
  const attributedWeight = [...tokensByName.values()].reduce((sum, t) => sum + t.weight, 0);

  return (
    <section data-testid="page-skills" className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Invocations"
          value={formatNumber(totalInvocations)}
          valueTestId="stat-skill-invocations"
          hint="Across the selected range"
          icon={Sparkles}
        />
        <StatCard
          label="Distinct entries"
          value={formatNumber(countData.length)}
          valueTestId="stat-skill-distinct"
          hint="Your skills used at least once"
          icon={Layers}
        />
        <StatCard
          label="Skill tokens"
          value={formatCompact(attributedWeight)}
          valueTestId="stat-skill-tokens"
          hint="Output + cache writes on turns inside a skill"
          icon={Coins}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          testId="chart-skill-trend"
          title={`Invocations per ${GRANULARITY_NOUN[granularity]}`}
          description="Your skills only, built-ins excluded"
        >
          <BarChart data={trendData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis dataKey="bucket" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
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
          <CardTitle className="text-sm font-medium">Usage and cost by name</CardTitle>
          <CardDescription className="text-xs">
            Tokens are attributed to the skill that was active for the turn, subagents included.
            Both trigger paths share one row — the attribution records no source.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-2">
          <Table data-testid="table-skill-usage">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <SortableHead
                  label="Invocations"
                  active={sortBy === 'invocations'}
                  onClick={() => setSortBy('invocations')}
                />
                <SortableHead
                  label="Tokens"
                  active={sortBy === 'tokens'}
                  onClick={() => setSortBy('tokens')}
                />
                <TableHead className="text-right">Total w/ cache reads</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usageRows.map((row) => (
                <TableRow key={row.name}>
                  <TableCell className="font-mono text-xs">{row.name}</TableCell>
                  <TableCell className="tabular text-right">{row.invocations}</TableCell>
                  <TableCell className="tabular text-right">
                    {row.weight === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      formatNumber(row.weight)
                    )}
                  </TableCell>
                  <TableCell className="tabular text-right text-muted-foreground">
                    {row.total === null ? '—' : formatNumber(row.total)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

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
