export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  /** Total cache-creation tokens — unchanged, and still the authoritative total.
   *  Always equals the flat `cache_creation_input_tokens` on the source line. */
  cacheCreation: number;
  /** Cache-creation tokens written at the 1-hour TTL (priced at 2x base input). */
  cacheCreation1h: number;
  /** Cache-creation tokens written at the 5-minute TTL (priced at 1.25x base input).
   *  When the nested `usage.cache_creation` object is absent or its parts sum to LESS
   *  than `cache_creation_input_tokens`, the unexplained remainder is attributed here —
   *  5m is the cheaper TTL, so an unknown split prices low rather than at zero. When the
   *  parts sum to MORE they are used as given, NOT clamped to the flat field.
   *  So there are two quantities here and they are deliberately not reconciled: the flat
   *  field is authoritative for `cacheCreation` and for every token display, while
   *  `cacheCreation1h + cacheCreation5m` is the basis pricing multiplies. They coincide on
   *  all observed data (47,006 of 47,006 usage-bearing lines across 600 transcripts newer
   *  than 2026-07-01, measured 2026-08-07) but nothing constrains them to,
   *  and in the overshoot branch the priced quantity exceeds the displayed token count.
   *  Clamping the split was considered and rejected: a line with an absent flat field and
   *  a populated nested object would then price at zero, turning a token-display
   *  discrepancy into a billing error. */
  cacheCreation5m: number;
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

/** All figures are integer nano-USD (1e-9 USD). */
export interface CostBreakdown {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  /** input + output + cacheRead + cacheWrite5m + cacheWrite1h */
  total: number;
  /** What (cacheCreation1h + cacheCreation5m + cacheRead) tokens would have cost at this
   *  model's full input rate — the uncached counterfactual. The basis is the split, not
   *  the flat `cacheCreation`: it has to match what pricing actually charged, or the
   *  derived saving would not reconcile in the overshoot branch where the two differ.
   *  Net cache saving is DERIVED at render time as
   *  `uncachedCacheCost - cacheWrite5m - cacheWrite1h - cacheRead`, never stored. */
  uncachedCacheCost: number;
  /** Tokens whose model had no rate row for their day. They contribute 0 to every
   *  figure above and are counted here so `total` stays auditable. */
  unpricedTokens: number;
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
  /** Cost of this cell's model-attributed tokens. Equals the sum over `modelCost`.
   *  `<synthetic>` contributes to neither, by construction: cost is only ever
   *  accumulated inside the existing `event.model !== SYNTHETIC` branch. */
  cost: CostBreakdown;
  /** Keyed on normalized model name, same key space as `models`. */
  modelCost: Record<string, CostBreakdown>;
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
