import type {
  AggregateStats,
  CostBreakdown,
  FileSession,
  ParsedFile,
  SessionRecord,
  SkillKey,
  ThroughputCounts,
  TokenTotals,
  TokenUsage,
  UsageCounts,
  UsageEvent,
} from './contracts';
import { rateFor as tableRateFor, type ModelRates, type RequestSpeed } from './rates';

const SYNTHETIC = '<synthetic>';

export const MIN_THROUGHPUT_OUTPUT_TOKENS = 100;

/** Resolves the rate in force for a model on a day at a speed, or `undefined` when there is none. */
type RateLookup = (model: string, dayKey: string, speed: RequestSpeed) => ModelRates | undefined;

function emptyTokenTotals(): TokenTotals {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheCreation: 0,
    cacheCreation1h: 0,
    cacheCreation5m: 0,
    total: 0,
  };
}

function addUsage(totals: TokenTotals, usage: TokenUsage): void {
  totals.input += usage.input;
  totals.output += usage.output;
  totals.cacheRead += usage.cacheRead;
  totals.cacheCreation += usage.cacheCreation;
  totals.cacheCreation1h += usage.cacheCreation1h;
  totals.cacheCreation5m += usage.cacheCreation5m;
  // `cacheCreation` is the authoritative cache-creation total; adding the split as well
  // would double-count it.
  totals.total += usage.input + usage.output + usage.cacheRead + usage.cacheCreation;
}

function emptyCost(): CostBreakdown {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite5m: 0,
    cacheWrite1h: 0,
    total: 0,
    uncachedCacheCost: 0,
    unpricedTokens: 0,
  };
}

/** Adds one token event's money to `cost`. An event whose model has no rate row for its day
 *  contributes nothing but its token count, so `total` stays auditable. */
function addCost(cost: CostBreakdown, usage: TokenUsage, rate: ModelRates | undefined): void {
  if (rate === undefined) {
    cost.unpricedTokens += usage.input + usage.output + usage.cacheRead + usage.cacheCreation;
    return;
  }
  const input = usage.input * rate.input;
  const output = usage.output * rate.output;
  const cacheRead = usage.cacheRead * rate.cacheRead;
  const cacheWrite5m = usage.cacheCreation5m * rate.cacheWrite5m;
  const cacheWrite1h = usage.cacheCreation1h * rate.cacheWrite1h;
  cost.input += input;
  cost.output += output;
  cost.cacheRead += cacheRead;
  cost.cacheWrite5m += cacheWrite5m;
  cost.cacheWrite1h += cacheWrite1h;
  cost.total += input + output + cacheRead + cacheWrite5m + cacheWrite1h;
  // The counterfactual must use the same basis that was priced -- the split, not the flat
  // total -- or the derived net saving would not reconcile.
  cost.uncachedCacheCost
    += (usage.cacheCreation1h + usage.cacheCreation5m + usage.cacheRead) * rate.input;
}

function emptyThroughputCounts(): ThroughputCounts {
  return { outputTokens: 0, durationMs: 0, requests: 0, excludedRequests: 0 };
}

function addThroughput(
  counts: ThroughputCounts,
  outputTokens: number,
  durationMs: number,
): void {
  counts.outputTokens += outputTokens;
  counts.durationMs += durationMs;
  counts.requests += 1;
}

function emptyCounts(): UsageCounts {
  return {
    tokens: emptyTokenTotals(),
    mainTokens: emptyTokenTotals(),
    sidechainTokens: emptyTokenTotals(),
    sessionsStarted: 0,
    toolCalls: 0,
    toolErrors: 0,
    skillInvocations: 0,
    agentRuns: 0,
    models: {},
    tools: {},
    skills: {},
    skillTokens: {},
    throughput: emptyThroughputCounts(),
    mainThroughput: emptyThroughputCounts(),
    sidechainThroughput: emptyThroughputCounts(),
    modelThroughput: {},
    skillThroughput: {},
    agents: {},
    cost: emptyCost(),
    modelCost: {},
  };
}

function addToCounts(counts: UsageCounts, event: UsageEvent, rateFor: RateLookup): void {
  switch (event.kind) {
    case 'token': {
      addUsage(counts.tokens, event.usage);
      if (event.isSidechain) {
        addUsage(counts.sidechainTokens, event.usage);
      } else {
        addUsage(counts.mainTokens, event.usage);
      }
      if (event.model !== SYNTHETIC) {
        const modelTotals = (counts.models[event.model] ??= emptyTokenTotals());
        addUsage(modelTotals, event.usage);
        // Pricing lives inside this guard, so <synthetic> is excluded from cost by
        // construction rather than by a second exclusion rule.
        const modelCost = (counts.modelCost[event.model] ??= emptyCost());
        const rate = rateFor(event.model, event.day, event.speed);
        addCost(counts.cost, event.usage, rate);
        addCost(modelCost, event.usage, rate);
      }
      if (event.skill !== undefined) {
        const skillTotals = (counts.skillTokens[event.skill] ??= emptyTokenTotals());
        addUsage(skillTotals, event.usage);
      }
      const laneThroughput = event.isSidechain
        ? counts.sidechainThroughput
        : counts.mainThroughput;
      const durationMs = event.durationMs;
      const isEligibleThroughput = durationMs !== undefined
        && event.usage.output >= MIN_THROUGHPUT_OUTPUT_TOKENS
        && event.model !== SYNTHETIC;
      if (isEligibleThroughput) {
        addThroughput(counts.throughput, event.usage.output, durationMs);
        addThroughput(laneThroughput, event.usage.output, durationMs);

        const modelThroughput = (counts.modelThroughput[event.model] ??= emptyThroughputCounts());
        addThroughput(modelThroughput, event.usage.output, durationMs);
        if (event.skill !== undefined) {
          const skillThroughput = (
            counts.skillThroughput[event.skill] ??= emptyThroughputCounts()
          );
          addThroughput(skillThroughput, event.usage.output, durationMs);
        }
      } else {
        counts.throughput.excludedRequests += 1;
        laneThroughput.excludedRequests += 1;
      }
      if (event.isSidechain && event.agentType !== undefined) {
        const agentCounts = (counts.agents[event.agentType] ??= { runs: 0, tokens: emptyTokenTotals() });
        addUsage(agentCounts.tokens, event.usage);
      }
      break;
    }
    case 'tool-call': {
      const toolCounts = (counts.tools[event.tool] ??= { calls: 0, errors: 0 });
      toolCounts.calls += 1;
      counts.toolCalls += 1;
      break;
    }
    case 'tool-error': {
      const toolCounts = (counts.tools[event.tool] ??= { calls: 0, errors: 0 });
      toolCounts.errors += 1;
      counts.toolErrors += 1;
      break;
    }
    case 'skill': {
      const key = `${event.source}|${event.name}`;
      counts.skills[key] = (counts.skills[key] ?? 0) + 1;
      counts.skillInvocations += 1;
      break;
    }
    case 'session-start': {
      counts.sessionsStarted += 1;
      break;
    }
    case 'agent-run': {
      const agentCounts = (counts.agents[event.agentType] ??= { runs: 0, tokens: emptyTokenTotals() });
      agentCounts.runs += 1;
      counts.agentRuns += 1;
      break;
    }
  }
}

function emptySession(session: FileSession): SessionRecord {
  return {
    sessionId: session.sessionId,
    project: session.project,
    day: '',
    startedAt: '',
    endedAt: '',
    durationMs: 0,
    tokens: emptyTokenTotals(),
    mainTokens: emptyTokenTotals(),
    sidechainTokens: emptyTokenTotals(),
    toolCalls: 0,
    toolErrors: 0,
    agentRuns: 0,
    tools: {},
    cost: emptyCost(),
  };
}

/** Folds one file's identity into its session row. Called once per file, so the earliest
 *  start and latest end win across the main transcript and all of its sidechains — a
 *  session that crosses midnight stays one row, filed under the day it started. */
function mergeSessionIdentity(record: SessionRecord, session: FileSession): void {
  if (session.label !== undefined && record.label === undefined) {
    // Only the main transcript carries an `ai-title`, so this is deterministic regardless
    // of the order the scanner hands a session's files over.
    record.label = session.label;
  }
  if (session.startedAt !== undefined
    && (record.startedAt === '' || session.startedAt < record.startedAt)) {
    record.startedAt = session.startedAt;
    record.day = session.day ?? '';
  }
  if (session.endedAt !== undefined && session.endedAt > record.endedAt) {
    record.endedAt = session.endedAt;
  }
  record.durationMs = record.startedAt === '' || record.endedAt === ''
    ? 0
    : Math.max(0, Date.parse(record.endedAt) - Date.parse(record.startedAt));
}

/** The session lane of one event. Only the fields the Sessions tab reads are accumulated —
 *  a session is not a full UsageCounts on purpose. */
function addToSession(record: SessionRecord, event: UsageEvent, rateFor: RateLookup): void {
  switch (event.kind) {
    case 'token': {
      addUsage(record.tokens, event.usage);
      addUsage(event.isSidechain ? record.sidechainTokens : record.mainTokens, event.usage);
      if (event.model !== SYNTHETIC) {
        // Same guard as the day cell, so <synthetic> is excluded from session cost by
        // construction rather than by a second rule.
        addCost(record.cost, event.usage, rateFor(event.model, event.day, event.speed));
      }
      break;
    }
    case 'tool-call': {
      const toolCounts = (record.tools[event.tool] ??= { calls: 0, errors: 0 });
      toolCounts.calls += 1;
      record.toolCalls += 1;
      break;
    }
    case 'tool-error': {
      const toolCounts = (record.tools[event.tool] ??= { calls: 0, errors: 0 });
      toolCounts.errors += 1;
      record.toolErrors += 1;
      break;
    }
    case 'agent-run': {
      record.agentRuns += 1;
      break;
    }
  }
}

function sortRecord<T>(record: Record<string, T>): Record<string, T> {
  const sorted: Record<string, T> = {};
  for (const key of Object.keys(record).sort()) {
    sorted[key] = record[key];
  }
  return sorted;
}

function sortCounts(counts: UsageCounts): UsageCounts {
  return {
    ...counts,
    models: sortRecord(counts.models),
    tools: sortRecord(counts.tools),
    skills: sortRecord(counts.skills),
    skillTokens: sortRecord(counts.skillTokens),
    modelThroughput: sortRecord(counts.modelThroughput),
    skillThroughput: sortRecord(counts.skillThroughput),
    agents: sortRecord(counts.agents),
    modelCost: sortRecord(counts.modelCost),
  };
}

export function aggregate(
  files: readonly ParsedFile[],
  generatedAt: string,
  rateFor: RateLookup = tableRateFor,
): AggregateStats {
  const days: Record<string, Record<string, UsageCounts>> = {};
  const sessionRecords = new Map<string, SessionRecord>();
  const totals = emptyCounts();
  let malformedLines = 0;
  let ignoredLines = 0;

  for (const file of files) {
    malformedLines += file.malformedLines;
    ignoredLines += file.ignoredLines;

    const sessionId = file.session.sessionId;
    let sessionRecord = sessionRecords.get(sessionId);
    if (sessionRecord === undefined) {
      sessionRecord = emptySession(file.session);
      sessionRecords.set(sessionId, sessionRecord);
    }
    mergeSessionIdentity(sessionRecord, file.session);

    for (const event of file.events) {
      const dayCells = (days[event.day] ??= {});
      const cell = (dayCells[event.project] ??= emptyCounts());
      addToCounts(cell, event, rateFor);
      addToCounts(totals, event, rateFor);
      addToSession(sessionRecord, event, rateFor);
    }
  }

  // A session with nothing in it (an unreadable file, or a transcript of pure bookkeeping
  // lines) is dropped rather than shown as a row of zeroes.
  const sessions = [...sessionRecords.values()]
    .filter((record) => record.startedAt !== '' || record.tokens.total > 0 || record.toolCalls > 0)
    .map((record) => ({ ...record, tools: sortRecord(record.tools) }))
    .sort((a, b) => (a.startedAt === b.startedAt
      ? a.sessionId.localeCompare(b.sessionId)
      : a.startedAt.localeCompare(b.startedAt)));

  const sortedDays: Record<string, Record<string, UsageCounts>> = {};
  for (const day of Object.keys(days).sort()) {
    const projectCells = days[day];
    const sortedProjects: Record<string, UsageCounts> = {};
    for (const project of Object.keys(projectCells).sort()) {
      sortedProjects[project] = sortCounts(projectCells[project]);
    }
    sortedDays[day] = sortedProjects;
  }

  const projects = new Set<string>();
  for (const projectCells of Object.values(days)) {
    for (const project of Object.keys(projectCells)) {
      projects.add(project);
    }
  }

  const skillKeys = new Set<string>(Object.keys(totals.skills));
  const skills: SkillKey[] = Array.from(skillKeys)
    .sort()
    .map((key) => {
      const separatorIndex = key.indexOf('|');
      const source = key.slice(0, separatorIndex) as 'skill-tool' | 'slash-command';
      const name = key.slice(separatorIndex + 1);
      return { source, name };
    });

  return {
    generatedAt,
    scannedFiles: files.length,
    malformedLines,
    ignoredLines,
    days: sortedDays,
    projects: Array.from(projects).sort(),
    models: Object.keys(totals.models).sort(),
    tools: Object.keys(totals.tools).sort(),
    skills,
    agents: Object.keys(totals.agents).sort(),
    sessions,
    totals: sortCounts(totals),
  };
}
