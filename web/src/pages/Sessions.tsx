import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from 'recharts';
import { Bot, Clock, MessagesSquare, Wrench } from 'lucide-react';
import type { AggregateStats, SessionRecord, TokenTotals, ToolCounts } from '../api/types';
import type { SeriesPoint } from '../api/filterStats';
import type { Granularity } from '../api/granularity';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
const TOOLS_PER_ROW = 2;

/** How many tools the lane chart ranks. */
const CHART_TOOLS = 10;

/** Total calls in one lane's map. No combined count is stored, so both lanes are summed here. */
function laneCalls(tools: Record<string, ToolCounts>): number {
  let total = 0;
  for (const counts of Object.values(tools)) total += counts.calls;
  return total;
}

/** Merges a session's two lanes into one ranked list — the "which tools" question, lane-blind. */
function mergedTools(session: SessionRecord): Array<[string, ToolCounts]> {
  const merged = new Map<string, ToolCounts>();
  for (const tools of [session.mainTools, session.sidechainTools]) {
    for (const [tool, counts] of Object.entries(tools)) {
      const prev = merged.get(tool) ?? { calls: 0, errors: 0 };
      merged.set(tool, { calls: prev.calls + counts.calls, errors: prev.errors + counts.errors });
    }
  }
  return [...merged.entries()].sort(([a, x], [b, y]) => y.calls - x.calls || a.localeCompare(b));
}

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
  /** Spoken name, for the lane columns whose visible label is only "All". */
  srLabel?: string;
}

function SortableHead({ label, active, onClick, srLabel }: SortableHeadProps) {
  return (
    <TableHead className="text-right">
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        aria-label={srLabel}
        className={`hover:text-foreground ${active ? 'text-foreground' : ''}`}
      >
        {label}
        {active ? ' ↓' : ''}
      </button>
    </TableHead>
  );
}

/** One tool's calls in each lane, ranked by the two together. */
function toolLanes(session: SessionRecord) {
  const rows = new Map<string, { main: number; sidechain: number; errors: number }>();
  const fold = (tools: Record<string, ToolCounts>, lane: 'main' | 'sidechain') => {
    for (const [tool, counts] of Object.entries(tools)) {
      const prev = rows.get(tool) ?? { main: 0, sidechain: 0, errors: 0 };
      rows.set(tool, { ...prev, [lane]: counts.calls, errors: prev.errors + counts.errors });
    }
  };
  fold(session.mainTools, 'main');
  fold(session.sidechainTools, 'sidechain');
  return [...rows.entries()]
    .map(([tool, lanes]) => ({ tool, ...lanes }))
    .sort((a, b) => (b.main + b.sidechain) - (a.main + a.sidechain) || a.tool.localeCompare(b.tool));
}

/** The token fields, in the order the dialog lists them. `total` is the stored sum, not re-added. */
const TOKEN_ROWS: Array<[string, (t: TokenTotals) => number]> = [
  ['Input', (t) => t.input],
  ['Output', (t) => t.output],
  ['Cache read', (t) => t.cacheRead],
  ['Cache write', (t) => t.cacheCreation],
  ['Total', (t) => t.total],
];

interface SessionDetailProps {
  session: SessionRecord | null;
  onClose: () => void;
}

/**
 * Everything one session recorded. Opened from a table row — the table is for scanning, this is
 * for reading one session, so nothing here is truncated or compacted.
 */
function SessionDetail({ session, onClose }: SessionDetailProps) {
  return (
    <Dialog open={session !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      {session !== null && (
        <DialogContent
          data-testid="dialog-session"
          className="max-h-[85vh] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>{sessionName(session)}</DialogTitle>
            <DialogDescription>
              <span className="font-mono text-xs">{session.project}</span>
              {' · '}
              <span className="font-mono text-xs">{session.sessionId}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              ['Started', `${session.day} ${formatStartTime(session.startedAt)}`],
              ['Span', formatDuration(session.durationMs)],
              ['Subagent runs', formatNumber(session.agentRuns)],
              ['Cost', formatUsd(session.cost.total)],
            ].map(([label, value]) => (
              <div key={label}>
                <span className="text-xs tracking-wide text-muted-foreground uppercase">
                  {label}
                </span>
                <span className="tabular mt-1 block text-sm font-medium">{value}</span>
              </div>
            ))}
          </div>

          <div>
            <p className="mb-1 text-sm font-medium">Tokens by lane</p>
            <Table data-testid="detail-tokens">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead />
                  <TableHead className="text-right">Main</TableHead>
                  <TableHead className="text-right">Subagent</TableHead>
                  <TableHead className="text-right">All</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {TOKEN_ROWS.map(([label, pick]) => (
                  <TableRow key={label}>
                    <TableCell className={label === 'Total' ? 'font-medium' : ''}>
                      {label}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {formatNumber(pick(session.mainTokens))}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {formatNumber(pick(session.sidechainTokens))}
                    </TableCell>
                    <TableCell className="tabular text-right font-medium">
                      {formatNumber(pick(session.tokens))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div>
            <p className="mb-1 text-sm font-medium">
              Tool calls by lane
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {formatNumber(session.toolCalls)} calls, {formatNumber(session.toolErrors)} failed
              </span>
            </p>
            {session.toolCalls === 0 ? (
              <p className="text-sm text-muted-foreground">No tool calls in this session.</p>
            ) : (
              <Table data-testid="detail-tools">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Tool</TableHead>
                    <TableHead className="text-right">Main</TableHead>
                    <TableHead className="text-right">Subagent</TableHead>
                    <TableHead className="text-right">Errors</TableHead>
                    <TableHead className="text-right">All</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {toolLanes(session).map((row) => (
                    <TableRow key={row.tool}>
                      <TableCell className="font-mono text-xs">{row.tool}</TableCell>
                      <TableCell className="tabular text-right">{formatNumber(row.main)}</TableCell>
                      <TableCell className="tabular text-right">
                        {formatNumber(row.sidechain)}
                      </TableCell>
                      <TableCell className="tabular text-right">
                        {row.errors === 0
                          ? <span className="text-muted-foreground">—</span>
                          : <span className="text-destructive">{formatNumber(row.errors)}</span>}
                      </TableCell>
                      <TableCell className="tabular text-right font-medium">
                        {formatNumber(row.main + row.sidechain)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          <div>
            <p className="mb-1 text-sm font-medium">Cost</p>
            <Table data-testid="detail-cost">
              <TableBody>
                {([
                  ['Input', session.cost.input],
                  ['Output', session.cost.output],
                  ['Cache read', session.cost.cacheRead],
                  ['Cache write', session.cost.cacheWrite5m + session.cost.cacheWrite1h],
                  ['Total', session.cost.total],
                ] as Array<[string, number]>).map(([label, value]) => (
                  <TableRow key={label}>
                    <TableCell className={label === 'Total' ? 'font-medium' : ''}>{label}</TableCell>
                    <TableCell className="tabular text-right">{formatUsd(value)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {session.cost.unpricedTokens > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                {formatNumber(session.cost.unpricedTokens)} tokens ran on a model with no rate row
                for that day. They are counted, never estimated, so they add nothing to the cost
                above.
              </p>
            )}
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}

export function Sessions(props: PageProps) {
  const { stats } = props;
  const [sortBy, setSortBy] = useState<SortKey>('tokens');
  // Held by id, not by row: a refresh replaces the objects, and an id still resolves.
  const [openId, setOpenId] = useState<string | null>(null);

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
      mainCalls: acc.mainCalls + laneCalls(s.mainTools),
      sidechainCalls: acc.sidechainCalls + laneCalls(s.sidechainTools),
      agentRuns: acc.agentRuns + s.agentRuns,
      cost: acc.cost + s.cost.total,
    }),
    {
      tokens: 0, main: 0, sidechain: 0, toolCalls: 0, toolErrors: 0,
      mainCalls: 0, sidechainCalls: 0, agentRuns: 0, cost: 0,
    },
  );

  // Tool calls by lane across the whole selection: which tools the main agent reaches for
  // against which its subagents do. Summed from the session rows, never from a day cell.
  const byTool = new Map<string, { main: number; sidechain: number }>();
  for (const session of sessions) {
    for (const [tool, counts] of Object.entries(session.mainTools)) {
      const prev = byTool.get(tool) ?? { main: 0, sidechain: 0 };
      byTool.set(tool, { ...prev, main: prev.main + counts.calls });
    }
    for (const [tool, counts] of Object.entries(session.sidechainTools)) {
      const prev = byTool.get(tool) ?? { main: 0, sidechain: 0 };
      byTool.set(tool, { ...prev, sidechain: prev.sidechain + counts.calls });
    }
  }
  const laneData = [...byTool.entries()]
    .map(([tool, lanes]) => ({ tool, ...lanes }))
    .sort((a, b) => (b.main + b.sidechain) - (a.main + a.sidechain) || a.tool.localeCompare(b.tool))
    .slice(0, CHART_TOOLS);

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
  const selected = sessions.find((s) => s.sessionId === openId) ?? null;

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
          hint={`${formatNumber(totals.mainCalls)} main · ${formatNumber(totals.sidechainCalls)} subagent`}
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

      <Card>
        <CardHeader className="gap-1">
          <CardTitle className="text-sm font-medium">Every session in this selection</CardTitle>
          <CardDescription className="text-xs">
            Tool calls and tokens side by side per lane, so a session whose subagents did
            nothing stands out. Filed under the day each session started, so one that ran past
            midnight stays a single row.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-2">
          <Table data-testid="table-sessions">
            <TableHeader>
              {/* Two header rows: a band naming each lane group, then the columns under it.
                  Main and subagent sit side by side for both tool calls and tokens, so a
                  session where the subagents did nothing is visible at a glance. */}
              <TableRow className="hover:bg-transparent">
                <TableHead rowSpan={2}>Session</TableHead>
                <TableHead rowSpan={2} className="text-right">
                  <button
                    type="button"
                    onClick={() => setSortBy('startedAt')}
                    aria-pressed={sortBy === 'startedAt'}
                    className={`hover:text-foreground ${sortBy === 'startedAt' ? 'text-foreground' : ''}`}
                  >
                    Started{sortBy === 'startedAt' ? ' ↓' : ''}
                  </button>
                </TableHead>
                <TableHead rowSpan={2} className="text-right">Length</TableHead>
                <TableHead colSpan={3} className="border-b border-border/60 text-center">
                  Tool calls
                </TableHead>
                <TableHead colSpan={3} className="border-b border-border/60 text-center">
                  Tokens
                </TableHead>
                <TableHead rowSpan={2}>Most used</TableHead>
                <SortableHead
                  label="Cost"
                  active={sortBy === 'cost'}
                  onClick={() => setSortBy('cost')}
                />
              </TableRow>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-right font-normal">Main</TableHead>
                <TableHead className="text-right font-normal">Subagent</TableHead>
                <SortableHead
                  label="All"
                  srLabel="Sort by total tool calls"
                  active={sortBy === 'toolCalls'}
                  onClick={() => setSortBy('toolCalls')}
                />
                <TableHead className="text-right font-normal">Main</TableHead>
                <TableHead className="text-right font-normal">Subagent</TableHead>
                <SortableHead
                  label="All"
                  srLabel="Sort by total tokens"
                  active={sortBy === 'tokens'}
                  onClick={() => setSortBy('tokens')}
                />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((session) => {
                const tools = mergedTools(session);
                const shown = tools.slice(0, TOOLS_PER_ROW);
                const hidden = tools.length - shown.length;
                return (
                  <TableRow
                    key={session.sessionId}
                    onClick={() => setOpenId(session.sessionId)}
                    className="cursor-pointer"
                  >
                    <TableCell>
                      {/* A real button so the row is reachable by keyboard; the row's own
                          onClick is the mouse affordance, not the only way in. */}
                      <button
                        type="button"
                        className="font-medium hover:underline"
                        onClick={(event) => { event.stopPropagation(); setOpenId(session.sessionId); }}
                      >
                        {sessionName(session)}
                      </button>
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
                      {formatNumber(laneCalls(session.mainTools))}
                    </TableCell>
                    <TableCell className="tabular text-right whitespace-nowrap">
                      {formatNumber(laneCalls(session.sidechainTools))}
                      {/* Runs beside calls answers "did the subagents actually work?" — runs
                          with no calls means they were spawned and did nothing. */}
                      {session.agentRuns > 0 && (
                        <span className="block text-[11px] text-muted-foreground">
                          {formatNumber(session.agentRuns)} runs
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="tabular text-right font-medium whitespace-nowrap">
                      {formatNumber(session.toolCalls)}
                      {session.toolErrors > 0 && (
                        <span className="block text-[11px] font-normal text-destructive">
                          {formatNumber(session.toolErrors)} failed
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {formatCompact(session.mainTokens.total)}
                    </TableCell>
                    <TableCell className="tabular text-right whitespace-nowrap">
                      {formatCompact(session.sidechainTokens.total)}
                      {session.tokens.total > 0 && (
                        <span className="block text-[11px] text-muted-foreground">
                          {Math.round((session.sidechainTokens.total / session.tokens.total) * 100)}%
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="tabular text-right font-medium">
                      {formatCompact(session.tokens.total)}
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
                      {formatUsd(session.cost.total)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

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

      <ChartCard
        testId="chart-tool-lanes"
        title="Tool calls by lane"
        description={`Top ${Math.min(CHART_TOOLS, laneData.length)} tools, main agent against its subagents`}
        height={Math.max(240, laneData.length * 34)}
      >
        <BarChart
          data={laneData}
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
            width={150}
            tickFormatter={truncateTick}
          />
          <Tooltip {...tokenTooltip} />
          <Legend {...LEGEND_PROPS} />
          <Bar
            dataKey="main"
            name="Main"
            stackId="calls"
            fill={CHART_COLORS[0]}
            minPointSize={1}
            {...SEGMENT_GAP}
          />
          <Bar
            dataKey="sidechain"
            name="Subagent"
            stackId="calls"
            fill={CHART_COLORS[1]}
            minPointSize={1}
            radius={[0, 4, 4, 0]}
            {...SEGMENT_GAP}
          />
        </BarChart>
      </ChartCard>

      <SessionDetail session={selected} onClose={() => setOpenId(null)} />
    </section>
  );
}
