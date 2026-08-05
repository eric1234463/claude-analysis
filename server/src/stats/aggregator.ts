import type {
  AggregateStats,
  ParsedFile,
  SkillKey,
  ThroughputCounts,
  TokenTotals,
  TokenUsage,
  UsageCounts,
  UsageEvent,
} from './contracts';

const SYNTHETIC = '<synthetic>';

export const MIN_THROUGHPUT_OUTPUT_TOKENS = 100;

function emptyTokenTotals(): TokenTotals {
  return { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, total: 0 };
}

function addUsage(totals: TokenTotals, usage: TokenUsage): void {
  totals.input += usage.input;
  totals.output += usage.output;
  totals.cacheRead += usage.cacheRead;
  totals.cacheCreation += usage.cacheCreation;
  totals.total += usage.input + usage.output + usage.cacheRead + usage.cacheCreation;
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
  };
}

function addToCounts(counts: UsageCounts, event: UsageEvent): void {
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
  };
}

export function aggregate(files: readonly ParsedFile[], generatedAt: string): AggregateStats {
  const days: Record<string, Record<string, UsageCounts>> = {};
  const totals = emptyCounts();
  let malformedLines = 0;
  let ignoredLines = 0;

  for (const file of files) {
    malformedLines += file.malformedLines;
    ignoredLines += file.ignoredLines;

    for (const event of file.events) {
      const dayCells = (days[event.day] ??= {});
      const cell = (dayCells[event.project] ??= emptyCounts());
      addToCounts(cell, event);
      addToCounts(totals, event);
    }
  }

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
    totals: sortCounts(totals),
  };
}
