import type { AggregateStats, SkillKey, TokenTotals, UsageCounts } from './types';
import { bucketKey, type Granularity } from './granularity';

/**
 * One point of a time series. `bucket` is a day key, the Monday of an ISO week, or a `YYYY-MM`
 * month, depending on the granularity it was built at.
 */
export interface SeriesPoint {
  bucket: string;
  counts: UsageCounts;
}

export interface StatsFilter {
  from?: string;
  to?: string;
  projects?: readonly string[];
}

function zeroTokenTotals(): TokenTotals {
  return { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, total: 0 };
}

function addTokenTotals(a: TokenTotals, b: TokenTotals): TokenTotals {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheCreation: a.cacheCreation + b.cacheCreation,
    total: a.total + b.total,
  };
}

/** Merges a set of UsageCounts cells (e.g. the project cells of one day, or all selected cells) into one. */
function mergeUsageCounts(cells: readonly UsageCounts[]): UsageCounts {
  const result: UsageCounts = {
    tokens: zeroTokenTotals(),
    mainTokens: zeroTokenTotals(),
    sidechainTokens: zeroTokenTotals(),
    sessionsStarted: 0,
    toolCalls: 0,
    toolErrors: 0,
    skillInvocations: 0,
    agentRuns: 0,
    models: {},
    tools: {},
    skills: {},
    skillTokens: {},
    agents: {},
  };

  for (const cell of cells) {
    result.tokens = addTokenTotals(result.tokens, cell.tokens);
    result.mainTokens = addTokenTotals(result.mainTokens, cell.mainTokens);
    result.sidechainTokens = addTokenTotals(result.sidechainTokens, cell.sidechainTokens);
    result.sessionsStarted += cell.sessionsStarted;
    result.toolCalls += cell.toolCalls;
    result.toolErrors += cell.toolErrors;
    result.skillInvocations += cell.skillInvocations;
    result.agentRuns += cell.agentRuns;

    for (const [model, totals] of Object.entries(cell.models)) {
      result.models[model] = addTokenTotals(result.models[model] ?? zeroTokenTotals(), totals);
    }
    for (const [tool, counts] of Object.entries(cell.tools)) {
      const prev = result.tools[tool] ?? { calls: 0, errors: 0 };
      result.tools[tool] = { calls: prev.calls + counts.calls, errors: prev.errors + counts.errors };
    }
    for (const [skill, count] of Object.entries(cell.skills)) {
      result.skills[skill] = (result.skills[skill] ?? 0) + count;
    }
    for (const [skill, totals] of Object.entries(cell.skillTokens)) {
      result.skillTokens[skill] = addTokenTotals(result.skillTokens[skill] ?? zeroTokenTotals(), totals);
    }
    for (const [agent, counts] of Object.entries(cell.agents)) {
      const prev = result.agents[agent] ?? { runs: 0, tokens: zeroTokenTotals() };
      result.agents[agent] = { runs: prev.runs + counts.runs, tokens: addTokenTotals(prev.tokens, counts.tokens) };
    }
  }

  return result;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

/** `key` is `${source}|${name}`; splits back into a SkillKey, sorted by the key itself. */
function skillsFromRecord(skills: Record<string, number>): SkillKey[] {
  return Object.keys(skills)
    .sort()
    .map((key) => {
      const separator = key.indexOf('|');
      return { source: key.slice(0, separator) as SkillKey['source'], name: key.slice(separator + 1) };
    });
}

export function filterStats(stats: AggregateStats, filter: StatsFilter): AggregateStats {
  const { from, to, projects } = filter;
  const days: Record<string, Record<string, UsageCounts>> = {};
  const selectedCells: UsageCounts[] = [];

  for (const [day, projectCells] of Object.entries(stats.days)) {
    if (from !== undefined && day < from) continue;
    if (to !== undefined && day > to) continue;

    const kept: Record<string, UsageCounts> = {};
    for (const [project, counts] of Object.entries(projectCells)) {
      if (projects && projects.length > 0 && !projects.includes(project)) continue;
      kept[project] = counts;
      selectedCells.push(counts);
    }
    if (Object.keys(kept).length > 0) {
      days[day] = kept;
    }
  }

  const totals = mergeUsageCounts(selectedCells);

  return {
    generatedAt: stats.generatedAt,
    scannedFiles: stats.scannedFiles,
    malformedLines: stats.malformedLines,
    ignoredLines: stats.ignoredLines,
    days,
    projects: uniqueSorted(Object.values(days).flatMap((cells) => Object.keys(cells))),
    models: Object.keys(totals.models).sort(),
    tools: Object.keys(totals.tools).sort(),
    skills: skillsFromRecord(totals.skills),
    agents: Object.keys(totals.agents).sort(),
    totals,
  };
}

/**
 * Flattens `stats.days` into a sorted series, merging every project cell in a bucket into one.
 * Bucket keys sort lexicographically whether they are days, week Mondays or months, so one sort
 * serves all three granularities.
 */
export function usageSeries(stats: AggregateStats, granularity: Granularity): SeriesPoint[] {
  const cellsByBucket = new Map<string, UsageCounts[]>();
  for (const [day, projectCells] of Object.entries(stats.days)) {
    const bucket = bucketKey(day, granularity);
    const cells = cellsByBucket.get(bucket) ?? [];
    cells.push(...Object.values(projectCells));
    cellsByBucket.set(bucket, cells);
  }

  return [...cellsByBucket.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, cells]) => ({ bucket, counts: mergeUsageCounts(cells) }));
}
