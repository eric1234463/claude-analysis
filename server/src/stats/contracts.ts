// C-1 — TranscriptFile / TranscriptKind (scanner output)
export type TranscriptKind = 'main' | 'sidechain';

export interface TranscriptFile {
  /** Absolute path to the .jsonl file. */
  path: string;
  /** The directory name **directly under the transcripts root**, verbatim and un-decoded
   *  (e.g. '-Users-eric-dash-hail-backend'). Never a segment below it. */
  project: string;
  kind: TranscriptKind;
  /** The session this transcript belongs to, read off the path: the main file's basename
   *  (`<sessionId>.jsonl`) or the sidechain's parent session directory
   *  (`<sessionId>/subagents/agent-<agentId>.jsonl`). Both kinds carry it, which is what
   *  makes a main file and its sidechains one session. */
  sessionId: string;
  /** Sidechain only: the `<agentId>` from the filename `agent-<agentId>.jsonl`. */
  agentId?: string;
  /** Sidechain only: `agentType` from the adjacent `agent-<agentId>.meta.json`,
   *  or the literal 'unknown' when that file is absent or unreadable. */
  agentType?: string;
  mtimeMs: number;
  size: number;
}

// C-2 — UsageEvent / TokenUsage / ParsedFile (parser output)
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

export type UsageEvent =
  | { kind: 'token'; day: string; project: string; model: string; dedupeKey: string;
      usage: TokenUsage;
      /** Wall-clock ms from the timestamp of the last ELIGIBLE line preceding this request's
       *  first usage-bearing line to the timestamp of the request's last usage-bearing line.
       *  Eligible = carries a string `timestamp` AND its `type` is not one of
       *  'queue-operation' | 'file-history-delta' | 'pr-link' (bookkeeping lines written out of
       *  chronological order). Present ONLY when the bracket resolved to a strictly positive
       *  interval; absent for the first request in a file and for non-positive intervals. */
      durationMs?: number
      /** Request speed from `message.usage.speed`; 'standard' when the field is absent.
       *  Any value other than the literal 'fast' normalizes to 'standard'. */
      speed: 'standard' | 'fast';
      isSidechain: boolean; agentId?: string; agentType?: string;
      /** Bare skill name from the line's `attributionSkill`, when the turn ran inside a skill.
       *  Carries no source — see UsageCounts.skillTokens. */
      skill?: string }
  | { kind: 'tool-call'; day: string; project: string; tool: string; isSidechain: boolean }
  | { kind: 'tool-error'; day: string; project: string; tool: string; isSidechain: boolean }
  | { kind: 'skill'; day: string; project: string; name: string;
      source: 'skill-tool' | 'slash-command'; isSidechain: boolean }
  | { kind: 'session-start'; day: string; project: string; sessionId: string }
  | { kind: 'agent-run'; day: string; project: string; agentType: string };

/** Per-file session identity and wall clock. One transcript file belongs to exactly one
 *  session, so this rides on the file rather than on every event. */
export interface FileSession {
  sessionId: string;
  project: string;
  kind: TranscriptKind;
  /** Last `aiTitle` seen on an `ai-title` line, when the file has one. Those lines stay in
   *  `ignoredLines` — reading the title does not make them counted lines. */
  label?: string;
  /** Day key (configured zone) of the earliest timestamped line, or '' when the file has
   *  no timestamped line at all. */
  day?: string;
  /** ISO-8601 of the earliest / latest timestamped line, absent when there is none.
   *  Any `type` qualifies here — unlike the throughput anchor, which excludes bookkeeping
   *  lines — because this is the file's wall clock, not a request bracket. */
  startedAt?: string;
  endedAt?: string;
}

export interface ParsedFile {
  session: FileSession;
  events: UsageEvent[];
  /** Lines that failed JSON.parse, including a torn final line of a live file. */
  malformedLines: number;
  /** Well-formed lines whose top-level `type` is neither 'assistant' nor 'user'. */
  ignoredLines: number;
}

// C-3 — AggregateStats (the server-side aggregate shape)
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

/** One session: the main transcript plus every sidechain under its `<sessionId>/subagents/`
 *  directory, rolled into a single row. Deliberately NOT a `UsageCounts` — a session cell
 *  carries only what the Sessions tab reads, so 200+ of them stay a small payload.
 *  Every token event and tool call belongs to exactly one file and so to exactly one
 *  session: summing `sessions` reproduces `totals` for the fields they share. */
export interface SessionRecord {
  sessionId: string;
  project: string;
  /** `aiTitle` from the main transcript; absent when the session never got one. */
  label?: string;
  /** Day key of the session's earliest timestamped line, in the configured zone — the key
   *  the frontend's date filter matches on. A session crossing midnight stays ONE row and
   *  is filed under the day it started, so session rows and day cells can disagree. */
  day: string;
  /** ISO-8601 span across the session's files; '' when nothing in them was timestamped. */
  startedAt: string;
  endedAt: string;
  /** `endedAt - startedAt` in ms. 0 for a single-timestamp session. */
  durationMs: number;
  tokens: TokenTotals;
  mainTokens: TokenTotals;
  sidechainTokens: TokenTotals;
  toolCalls: number;
  toolErrors: number;
  agentRuns: number;
  /** Per-tool calls and errors, main and sidechain lanes combined. */
  tools: Record<string, ToolCounts>;
  cost: CostBreakdown;
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
  /** One row per session, sorted by `startedAt` then `sessionId`. */
  sessions: SessionRecord[];
  totals: UsageCounts;
}

/** Sorted. Adding or removing a top-level key of AggregateStats is a contract change. */
export const AGGREGATE_STATS_KEYS = [
  'agents', 'days', 'generatedAt', 'ignoredLines', 'malformedLines', 'models',
  'projects', 'scannedFiles', 'sessions', 'skills', 'tools', 'totals',
] as const;

// C-7 — FileAggregateCache port + fileCacheKey
export interface FileAggregateCache {
  get(key: string): ParsedFile | undefined;
  set(key: string, value: ParsedFile): void;
  /** Reads the backing store. A missing, empty, truncated, or otherwise unparseable store is
   *  discarded and treated as empty — never throws, never rethrows. */
  load(): Promise<void>;
  /** Persists the current contents. Creates parent directories as needed. */
  save(): Promise<void>;
}

// C-8 — StatsPipeline port + STATS_PIPELINE token
export interface StatsPipeline {
  /** Scan + parse (cache-aware) + aggregate. Resolves with a complete AggregateStats.
   *  A per-file read or parse error must never reject this promise — it degrades to
   *  malformedLines/ignoredLines counts. */
  run(): Promise<AggregateStats>;
}

export const STATS_PIPELINE = 'STATS_PIPELINE';

// C-11 — AppConfig
export interface AppConfig {
  /** Default: path.join(os.homedir(), '.claude', 'projects'). Env: CLAUDE_TRANSCRIPTS_ROOT */
  transcriptsRoot: string;
  /** IANA zone. Default: 'Asia/Hong_Kong'. Env: DASHBOARD_TIME_ZONE.
   *  This is an explicit config value, NOT the machine's ambient zone — nothing in the
   *  server may read the ambient zone, so expected day keys never depend on the environment. */
  timeZone: string;
  /** Default: path.join(process.cwd(), '.cache', 'stats-cache.json'). Env: DASHBOARD_CACHE_FILE */
  cacheFile: string;
}

export const APP_CONFIG = 'APP_CONFIG';
