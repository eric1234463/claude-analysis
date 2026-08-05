export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
}

export interface TokenTotals extends TokenUsage { total: number }   // total = input+output+cacheRead+cacheCreation
export interface ToolCounts { calls: number; errors: number }
export interface AgentCounts { runs: number; tokens: TokenTotals }
export interface SkillKey { name: string; source: 'skill-tool' | 'slash-command' }

/** Four mergeable sums; the rate is derived at render time as outputTokens / (durationMs / 1000).
 *  outputTokens / durationMs / requests count ELIGIBLE requests only (see the eligibility rule
 *  on UsageCounts.throughput); excludedRequests counts token events that did not qualify. */
export interface ThroughputCounts {
  outputTokens: number;
  durationMs: number;
  requests: number;
  excludedRequests: number;
}

export interface UsageCounts {
  tokens: TokenTotals;
  mainTokens: TokenTotals;
  sidechainTokens: TokenTotals;
  sessionsStarted: number;
  toolCalls: number;
  toolErrors: number;
  skillInvocations: number;
  agentRuns: number;
  models: Record<string, TokenTotals>;
  tools: Record<string, ToolCounts>;
  /** key is `${source}|${name}` */
  skills: Record<string, number>;
  /** Tokens spent on turns that ran inside a skill, keyed on the **bare skill name**.
   *  `attributionSkill` records no source, so unlike `skills` this cannot be split into
   *  `skill-tool` / `slash-command` — one entry covers both trigger paths for a name. */
  skillTokens: Record<string, TokenTotals>;
  /** Response throughput of eligible requests (end-to-end: includes queue, prompt processing
   *  and TTFT — not raw decode speed). throughput.requests + throughput.excludedRequests
   *  equals the number of deduped token events aggregated into this cell. */
  throughput: ThroughputCounts;
  mainThroughput: ThroughputCounts;
  sidechainThroughput: ThroughputCounts;
  /** Keyed on normalized model name; entries exist only for models with ≥1 eligible request.
   *  excludedRequests is always 0 here — per-model exclusions are not tracked. */
  modelThroughput: Record<string, ThroughputCounts>;
  /** Keyed on bare skill name (like skillTokens); eligible requests with a skill only. */
  skillThroughput: Record<string, ThroughputCounts>;
  agents: Record<string, AgentCounts>;
}

export interface AggregateStats {
  generatedAt: string;                                    // ISO-8601 UTC, injected
  scannedFiles: number;
  malformedLines: number;
  ignoredLines: number;
  days: Record<string, Record<string, UsageCounts>>;      // dayKey -> projectKey -> counts
  projects: string[];                                     // sorted
  models: string[];                                       // sorted; never contains '<synthetic>'
  tools: string[];                                        // sorted
  skills: SkillKey[];                                     // sorted by `${source}|${name}`
  agents: string[];                                       // sorted
  totals: UsageCounts;
}

/** Sorted. Adding or removing a top-level key of AggregateStats is a contract change. */
export const AGGREGATE_STATS_KEYS = [
  'agents', 'days', 'generatedAt', 'ignoredLines', 'malformedLines', 'models',
  'projects', 'scannedFiles', 'skills', 'tools', 'totals',
] as const;
