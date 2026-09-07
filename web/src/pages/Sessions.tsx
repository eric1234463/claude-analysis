import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from 'recharts';
import { Bot, Clock, MessagesSquare, Wrench } from 'lucide-react';
import type { AggregateStats, SessionRecord } from '../api/types';
import type { SeriesPoint } from '../api/filterStats';
import type { Granularity } from '../api/granularity';
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
  LEGEND_PROPS,
  StatCard,
  TOOLTIP_PROPS,
  formatTooltipNumber,
  truncateTick,
} from '@/components/charts';
import { formatCompact, formatNumber } from '@/lib/format';
import { formatUsd } from './Cost';

export interface PageProps {
  stats: AggregateStats;
  series: SeriesPoint[];
  /** Part of the shared page contract. A session is not time-bucketed, so it goes unused. */
  granularity: Granularity;
}

const SEGMENT_GAP = { stroke: 'var(--card)', strokeWidth: 2 } as const;

/** How many sessions the chart ranks. The table below it is never truncated. */
const CHART_ROWS = 12;

/** How many tools a row names before it collapses the rest into a `+n` badge. */
const TOOLS_PER_ROW = 3;

/** The columns the table can be ordered by. All sort descending. */
type SortKey = 'tokens' | 'toolCalls' | 'cost' | 'startedAt';

const SORT_VALUE: Record<SortKey, (session: SessionRecord) => number | string> = {
  tokens: (s) => s.tokens.total,
  toolCalls: (s) => s.toolCalls,
  cost: (s) => s.cost.total,
  startedAt: (s) => s.startedAt,
};

/**
 * A session's own name. `label` is the transcript's `ai-title`; sessions that never got one
 * (older transcripts, and very short ones) fall back to the head of their UUID, which is
 * still enough to `grep` the transcript directory with.
 */
function sessionName(session: SessionRecord): string {
  return session.label ?? session.sessionId.slice(0, 8);
}

/** ms to the coarsest unit that stays informative: `6h 18m`, `18m`, `42s`. */
export function formatDuration(ms: number): string {
  if (ms <= 0) return '—';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/**
 * Clock time of the session's start, in the viewer's own zone. The date beside it is
 * `session.day` — the server's pre-bucketed key — so the two can disagree by a day if the
 * browser's zone differs from `DASHBOARD_TIME_ZONE`. Never re-derive the day from here.
 */
const TIME = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

function formatStartTime(startedAt: string): string {
  if (startedAt === '') return '';
  return TIME.format(new Date(startedAt));
}

interface SortableHeadProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function SortableHead({ label, active, onClick }: SortableHeadProps) {
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

export function Sessions(props: PageProps) {
  const { stats } = props;
  const [sortBy, setSortBy] = useState<SortKey>('tokens');

  // Sessions come pre-filtered by the filter card, matched on their own start day. Everything
  // on this page is derived from those rows and never from the day cells: a session that ran
  // past midnight is one row here but two cells there.
  const sessions = stats.sessions;

  const totals = sessions.reduce(
    (acc, s) => ({
      tokens: acc.tokens + s.tokens.total,
      main: acc.main + s.mainTokens.total,
      sidechain: acc.sidechain + s.sidechainTokens.total,
      toolCalls: acc.toolCalls + s.toolCalls,
      toolErrors: acc.toolErrors + s.toolErrors,
      agentRuns: acc.agentRuns + s.agentRuns,
      cost: acc.cost + s.cost.total,
    }),
    { tokens: 0, main: 0, sidechain: 0, toolCalls: 0, toolErrors: 0, agentRuns: 0, cost: 0 },
  );

  const perSession = (value: number) =>
    sessions.length === 0 ? 0 : Math.round(value / sessions.length);

  // Ranked by tokens for the chart; sessionId breaks ties so the order stays stable.
  const byTokens = [...sessions].sort(
    (a, b) => b.tokens.total - a.tokens.total || a.sessionId.localeCompare(b.sessionId),
  );
  const chartData = byTokens.slice(0, CHART_ROWS).map((session) => ({
    name: sessionName(session),
    main: session.mainTokens.total,
    sidechain: session.sidechainTokens.total,
  }));

  const rows = [...sessions].sort((a, b) => {
    const left = SORT_VALUE[sortBy](a);
    const right = SORT_VALUE[sortBy](b);
    if (left === right) return a.sessionId.localeCompare(b.sessionId);
    return left < right ? 1 : -1;
  });

  const tokenTooltip = { ...TOOLTIP_PROPS, formatter: formatTooltipNumber };

  return (
    <section data-testid="page-sessions" className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Sessions"
          value={formatNumber(sessions.length)}
          hint={`${formatNumber(totals.agentRuns)} subagent runs inside them`}
          icon={MessagesSquare}
        />
        <StatCard
          label="Tool calls"
          value={formatNumber(totals.toolCalls)}
          hint={`${formatNumber(perSession(totals.toolCalls))} per session, ${formatNumber(totals.toolErrors)} failed`}
          icon={Wrench}
        />
        <StatCard
          label="Tokens"
          value={formatCompact(totals.tokens)}
          hint={`${formatCompact(perSession(totals.tokens))} per session`}
          icon={Clock}
        />
        <StatCard
          label="Subagent share"
          value={totals.tokens === 0 ? '0%' : `${Math.round((totals.sidechain / totals.tokens) * 100)}%`}
          hint={`${formatCompact(totals.sidechain)} of ${formatCompact(totals.tokens)} tokens`}
          icon={Bot}
        />
      </div>

      <ChartCard
        testId="chart-session-tokens"
        title={`Heaviest ${Math.min(CHART_ROWS, sessions.length)} sessions`}
        description="Main agent against its subagents, by tokens"
        height={Math.max(240, chartData.length * 38)}
      >
        <BarChart
          data={chartData}
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
            dataKey="name"
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={150}
            tickFormatter={truncateTick}
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
            radius={[0, 4, 4, 0]}
            {...SEGMENT_GAP}
          />
        </BarChart>
      </ChartCard>

      <Card>
        <CardHeader className="gap-1">
          <CardTitle className="text-sm font-medium">Every session in this selection</CardTitle>
          <CardDescription className="text-xs">
            Filed under the day each session started, so one that ran past midnight stays a
            single row
          </CardDescription>
        </CardHeader>
        <CardContent className="px-2">
          <Table data-testid="table-sessions">
            <TableHeader>
              <TableRow>
                <TableHead>Session</TableHead>
                <SortableHead
                  label="Started"
                  active={sortBy === 'startedAt'}
                  onClick={() => setSortBy('startedAt')}
                />
                <TableHead className="text-right">Length</TableHead>
                <SortableHead
                  label="Tools"
                  active={sortBy === 'toolCalls'}
                  onClick={() => setSortBy('toolCalls')}
                />
                <TableHead>Most used</TableHead>
                <TableHead className="text-right">Main</TableHead>
                <TableHead className="text-right">Subagent</TableHead>
                <SortableHead
                  label="Tokens"
                  active={sortBy === 'tokens'}
                  onClick={() => setSortBy('tokens')}
                />
                <SortableHead
                  label="Cost"
                  active={sortBy === 'cost'}
                  onClick={() => setSortBy('cost')}
                />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((session) => {
                const tools = Object.entries(session.tools)
                  .sort(([a, x], [b, y]) => y.calls - x.calls || a.localeCompare(b));
                const shown = tools.slice(0, TOOLS_PER_ROW);
                const hidden = tools.length - shown.length;
                return (
                  <TableRow key={session.sessionId}>
                    <TableCell>
                      <span className="font-medium">{sessionName(session)}</span>
                      <span className="block font-mono text-[11px] text-muted-foreground">
                        {session.project}
                      </span>
                    </TableCell>
                    <TableCell className="tabular text-right whitespace-nowrap">
                      {session.day}
                      <span className="block text-[11px] text-muted-foreground">
                        {formatStartTime(session.startedAt)}
                      </span>
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {formatDuration(session.durationMs)}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {formatNumber(session.toolCalls)}
                      {session.toolErrors > 0 && (
                        <span className="block text-[11px] text-destructive">
                          {formatNumber(session.toolErrors)} failed
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="space-x-1 whitespace-nowrap">
                      {shown.map(([tool, counts]) => (
                        <Badge key={tool} variant="secondary" className="tabular font-normal">
                          {/* MCP tool names run to 40+ chars and would widen the row past
                              the card; the same cap the axis ticks use applies here. */}
                          {truncateTick(tool)} ×{counts.calls}
                        </Badge>
                      ))}
                      {hidden > 0 && (
                        <span className="text-[11px] text-muted-foreground">+{hidden}</span>
                      )}
                      {tools.length === 0 && <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {formatCompact(session.mainTokens.total)}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {formatCompact(session.sidechainTokens.total)}
                    </TableCell>
                    <TableCell className="tabular text-right font-medium">
                      {formatCompact(session.tokens.total)}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {formatUsd(session.cost.total)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </section>
  );
}
