import { useState } from 'react';
import { AlertTriangle, Activity, RefreshCw } from 'lucide-react';
import type { AggregateStats } from './api/types';
import type { SeriesPoint, StatsFilter } from './api/filterStats';
import { filterStats as realFilterStats, usageSeries as realUsageSeries } from './api/filterStats';
import { GRANULARITIES, GRANULARITY_LABELS, type Granularity } from './api/granularity';
import { refreshStats as realRefreshStats } from './api/client';
import {
  defaultDateRange,
  matchPreset,
  presetRange,
  RANGE_PRESETS,
  RANGE_PRESET_LABELS,
  type SelectableRangePreset,
} from './api/dateRange';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/charts';
import { cn } from '@/lib/utils';
import { formatNumber } from '@/lib/format';
import { Overview } from './pages/Overview';
import { Cost } from './pages/Cost';
import { Skills } from './pages/Skills';
import { Tools } from './pages/Tools';
import { Efficiency } from './pages/Efficiency';

export interface AppDeps {
  filterStats: (stats: AggregateStats, filter: StatsFilter) => AggregateStats;
  usageSeries: (stats: AggregateStats, granularity: Granularity) => SeriesPoint[];
  refreshStats: () => Promise<AggregateStats>;
  /** Injected so the default date range is deterministic under test. */
  now: () => Date;
}

export interface AppProps {
  stats: AggregateStats;
  /** Defaults to the real implementations from './api/filterStats'. Injected in tests. */
  deps?: AppDeps;
}

const PAGES = [
  { name: 'Overview', Component: Overview },
  { name: 'Cost', Component: Cost },
  { name: 'Skills', Component: Skills },
  { name: 'Tools', Component: Tools },
  { name: 'Efficiency', Component: Efficiency },
] as const;

const PAGE_SUBTITLES: Record<(typeof PAGES)[number]['name'], string> = {
  Overview: 'Token volume, sessions and where they were spent.',
  Cost: 'What each model costs at API list price, and whether it earns its rate.',
  Skills: 'Which of your own skills you actually reach for. Claude Code built-ins are excluded.',
  Tools: 'Tool call volume and where calls fail.',
  Efficiency: 'Cache reuse, error rates and subagent leverage.',
};

/** Shared by the filter card's two native selects so they cannot drift apart visually. */
const SELECT_CLASS = cn(
  'h-11 w-[10.5rem] cursor-pointer appearance-none rounded-md border border-input',
  'bg-transparent px-3 text-sm text-foreground shadow-xs transition-colors duration-200',
  'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
);

export function App(props: AppProps) {
  const deps = props.deps ?? {
    filterStats: realFilterStats,
    usageSeries: realUsageSeries,
    refreshStats: realRefreshStats,
    now: () => new Date(),
  };

  const [stats, setStats] = useState(props.stats);
  const [page, setPage] = useState<(typeof PAGES)[number]['name']>('Overview');
  // Read once and shared by the initial range, the Range select and every preset it
  // writes, so none of them slides forward when the clock crosses midnight mid-session.
  const [now] = useState(() => deps.now());
  // Opens on the last 7 days.
  const [range, setRange] = useState(() => defaultDateRange(now));
  const [projects, setProjects] = useState<string[]>([]);
  const [granularity, setGranularity] = useState<Granularity>('day');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const { from, to } = range;
  // Derived, never stored: `range` is the single source of truth, so a hand-edited
  // date reads back as Custom without a second piece of state to keep in step.
  const rangePreset = matchPreset(range, now);

  const filtered = deps.filterStats(stats, {
    from: from || undefined,
    to: to || undefined,
    projects,
  });
  const series = deps.usageSeries(filtered, granularity);
  const hasData = Object.keys(filtered.days).length > 0;

  function toggleProject(project: string) {
    setProjects((prev) =>
      prev.includes(project) ? prev.filter((p) => p !== project) : [...prev, project],
    );
  }

  async function handleRefresh() {
    setRefreshing(true);
    setRefreshError(null);
    try {
      const next = await deps.refreshStats();
      setStats(next);
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : 'Refresh failed');
    } finally {
      setRefreshing(false);
    }
  }

  const { Component } = PAGES.find((p) => p.name === page)!;

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Activity className="size-5 shrink-0 text-primary" />
          <span className="text-sm font-semibold tracking-tight">Claude Usage</span>
          <div className="ml-auto flex items-center gap-3">
            <span
              data-testid="header-generated-at"
              className="hidden text-xs text-muted-foreground lg:inline"
            >
              Generated {stats.generatedAt}
            </span>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={handleRefresh}
              disabled={refreshing}
              className="min-h-9 cursor-pointer"
            >
              <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </Button>
          </div>
        </div>

        <nav aria-label="Dashboard sections" className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="-mb-px flex gap-1 overflow-x-auto">
            {PAGES.map(({ name }) => {
              const active = page === name;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => setPage(name)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'min-h-11 cursor-pointer border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors duration-200',
                    'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                    active
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{page}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{PAGE_SUBTITLES[page]}</p>
        </div>

        <Card>
          <CardContent className="space-y-4 px-5">
            <div className="flex flex-wrap items-end gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="range" className="text-xs text-muted-foreground">
                  Range
                </Label>
                <select
                  id="range"
                  value={rangePreset}
                  onChange={(e) => setRange(presetRange(e.target.value as SelectableRangePreset, now))}
                  className={SELECT_CLASS}
                >
                  {RANGE_PRESETS.map((option) => (
                    <option key={option} value={option}>
                      {RANGE_PRESET_LABELS[option]}
                    </option>
                  ))}
                  {/* Only while active: Custom is a state to display, not a window to pick. */}
                  {rangePreset === 'custom' && (
                    <option value="custom">{RANGE_PRESET_LABELS.custom}</option>
                  )}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="from-date" className="text-xs text-muted-foreground">
                  From
                </Label>
                <Input
                  id="from-date"
                  type="date"
                  value={from}
                  max={to || undefined}
                  onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
                  className="h-11 w-[10.5rem] cursor-pointer"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="to-date" className="text-xs text-muted-foreground">
                  To
                </Label>
                <Input
                  id="to-date"
                  type="date"
                  value={to}
                  min={from || undefined}
                  onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
                  className="h-11 w-[10.5rem] cursor-pointer"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="granularity" className="text-xs text-muted-foreground">
                  Group by
                </Label>
                <select
                  id="granularity"
                  value={granularity}
                  onChange={(e) => setGranularity(e.target.value as Granularity)}
                  className={SELECT_CLASS}
                >
                  {GRANULARITIES.map((option) => (
                    <option key={option} value={option}>
                      {GRANULARITY_LABELS[option]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {stats.projects.length > 0 && (
              <fieldset className="space-y-2">
                <legend className="text-xs text-muted-foreground">
                  Projects{' '}
                  <span className="text-muted-foreground/70">
                    {projects.length === 0 ? '(all)' : `(${projects.length} selected)`}
                  </span>
                </legend>
                <div className="flex flex-wrap gap-2">
                  {stats.projects.map((project) => {
                    const id = `project-${project}`;
                    const selected = projects.includes(project);
                    return (
                      <div
                        key={project}
                        className={cn(
                          'flex items-center gap-2 rounded-lg border px-3 transition-colors duration-200',
                          selected
                            ? 'border-primary/60 bg-primary/10'
                            : 'border-border hover:bg-accent',
                        )}
                      >
                        <Checkbox
                          id={id}
                          checked={selected}
                          onCheckedChange={() => toggleProject(project)}
                          className="cursor-pointer"
                        />
                        <Label
                          htmlFor={id}
                          className="cursor-pointer py-2.5 font-mono text-xs font-normal"
                        >
                          {project}
                        </Label>
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            )}

            <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
              <span data-testid="header-scanned-files">
                Scanned files: <span className="tabular text-foreground">{formatNumber(stats.scannedFiles)}</span>
              </span>
              <span data-testid="header-ignored-lines">
                Ignored lines: <span className="tabular text-foreground">{formatNumber(stats.ignoredLines)}</span>
              </span>
              <span className="lg:hidden">Generated {stats.generatedAt}</span>
            </div>
          </CardContent>
        </Card>

        {stats.malformedLines > 0 && (
          <div
            data-testid="header-malformed-warning"
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-foreground"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <span>
              Warning: {formatNumber(stats.malformedLines)} malformed lines were skipped while
              parsing. Totals below may undercount.
            </span>
          </div>
        )}

        {refreshError && (
          <div
            data-testid="refresh-error"
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-foreground"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <span>{refreshError}</span>
          </div>
        )}

        {hasData ? (
          <Component stats={filtered} series={series} granularity={granularity} />
        ) : (
          <EmptyState
            title="No activity in this range"
            description={
              from || to
                ? `Nothing was recorded between ${from || 'the beginning'} and ${to || 'today'}${
                    projects.length > 0 ? ' for the selected projects' : ''
                  }. Widen the range to see older sessions.`
                : 'No transcripts have been parsed yet. Run Claude Code, then refresh.'
            }
            action={
              (from || to) && (
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-9 cursor-pointer"
                  onClick={() => setRange(presetRange('all', now))}
                >
                  Show all time
                </Button>
              )
            }
          />
        )}
      </main>
    </div>
  );
}
