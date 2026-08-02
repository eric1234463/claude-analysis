// C-1 — TranscriptFile / TranscriptKind (scanner output)
export type TranscriptKind = 'main' | 'sidechain';

export interface TranscriptFile {
  /** Absolute path to the .jsonl file. */
  path: string;
  /** The directory name **directly under the transcripts root**, verbatim and un-decoded
   *  (e.g. '-Users-eric-dash-hail-backend'). Never a segment below it. */
  project: string;
  kind: TranscriptKind;
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
  cacheCreation: number;
}

export type UsageEvent =
  | { kind: 'token'; day: string; project: string; model: string; dedupeKey: string;
      usage: TokenUsage; isSidechain: boolean; agentId?: string; agentType?: string;
      /** Bare skill name from the line's `attributionSkill`, when the turn ran inside a skill.
       *  Carries no source — see UsageCounts.skillTokens. */
      skill?: string }
  | { kind: 'tool-call'; day: string; project: string; tool: string; isSidechain: boolean }
  | { kind: 'tool-error'; day: string; project: string; tool: string; isSidechain: boolean }
  | { kind: 'skill'; day: string; project: string; name: string;
      source: 'skill-tool' | 'slash-command'; isSidechain: boolean }
  | { kind: 'session-start'; day: string; project: string; sessionId: string }
  | { kind: 'agent-run'; day: string; project: string; agentType: string };

export interface ParsedFile {
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
