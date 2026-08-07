---
type: tasks
title: "Per-Model USD Cost and Token Efficiency — Task Breakdown"
description: "Contract-first single-wave breakdown for pricing transcript tokens at API list rates, split by cache TTL and date-effective per model, and surfacing spend and cache economics on a new Cost page."
status: not-started
owner: "eric1234463@gmail.com"
ticket: "DASH-0000"
created: "2026-08-07"
plan: "docs/plans/2026-08-07-model-cost-and-efficiency.md"
wiki: false
---

# Per-Model USD Cost and Token Efficiency — Task Breakdown

**Branch:** feature/DASH-0000-model-cost-and-efficiency
**Worktree:** `.claude/worktrees/feature+DASH-0000-model-cost-and-efficiency` (branched from `origin/main` @ `beec4c8`)
**Source plan:** `docs/plans/2026-08-07-model-cost-and-efficiency.md`

**Baseline captured before dispatch**
- Measured: this worktree, clean at `beec4c8`, 2026-08-07
- Commands: `npm test --prefix server -- run` and `npm test --prefix web -- run`
- Result: server **8 files / 98 tests passed**; web **11 files / 131 tests passed**. Exit code `0` — the suite was **GREEN** at baseline; any failure during this run is a regression.
- ⚠️ The root `npm test` was *not* used for the baseline: turbo's cache is shared across worktrees and it replayed a cache hit whose logs were emitted from `.claude/worktrees/date-range-presets`. See Precondition 6.

## Source Plan Summary

Every token in the transcripts is priced at the published Anthropic API list rate and reported as USD per model, so the dashboard can answer "what would this cost under API billing" and "is each model earning its rate". Pricing needs a dimension the parser currently discards: `usage.cache_creation` splits into 1-hour and 5-minute TTL tokens, which price at 2× and 1.25× base input while cache reads price at 0.1×. Cost is computed once in the aggregator — the only place a *date-effective* rate can be resolved, because Sonnet 5's introductory pricing expires 2026-08-31 — and stored as mergeable integer cells so the frontend only ever adds, never multiplies a rate. A new Cost page shows spend per model split by token kind, cost share vs token share, cache economics (write premium, read discount, and the net saving against the uncached counterfactual), and USD per 1K output tokens. Models with no rate row are counted in `unpricedTokens` and priced at zero, never estimated.

## Execution Model

One parallel wave after a small Wave 0. Agents implement and test against the Contract Registry below, standing in fakes for anything they don't own; they run **no git commands**. The controller reviews each returning task's diff, re-runs its verification, re-proves its named mutations, stages its exact paths, and commits. Contracts are frozen at dispatch; only the controller amends one (see the amendment rule in the registry). There is no mid-run review gate — one Final Gate at the end.

> ⚠️ **The tree intentionally fails `npm run typecheck` between the Wave 0 commit and the last Wave 1 commit.** Wave 0 adds *required* fields to `UsageCounts` in both packages; the full-literal constructors in `aggregator.ts:42` (`emptyCounts`) and `filterStats.ts:47` (`mergeUsageCounts`) are type-broken until Tasks 4 and 5 land. Vitest transpiles without type checking, so all file-scoped test runs stay green throughout. Do not run the type check per task — it is the Final Gate's check by design. This mirrors the throughput run (`docs/tasks/2026-08-05-token-throughput-metric-tasks.md`).

> ⚠️ **`server/test/stats.integration.test.ts:75` ("deep-equals the hand-computed aggregate") is RED between the Wave 0 commit and the moment Tasks 2, 3 and 4 are all committed.** Wave 0 gives the web fixture its cost fields and gives the fixture transcripts their TTL split; the real pipeline only produces matching cost once the rate table, parser and aggregator land. That file needs no edit — it goes green by itself. It is also this run's strongest real binding: it drives the whole pipeline through an HTTP request and deep-equals the result, so a wrong rate, a wrong split, or a dropped field fails it.

## Preconditions

All verified 2026-08-07 in this worktree at `beec4c8`. The controller should re-check 1–4 before dispatching; if any fails, stop rather than dispatch the wave.

1. **`aggregate` is a plain exported function, not a class** — `export function aggregate(files: readonly ParsedFile[], generatedAt: string): AggregateStats` at `server/src/stats/aggregator.ts:163`. Its only production caller is `pipeline.ts:57` (`aggregate(parsedFiles, this.now())`). The rate table is therefore injected as an **optional third parameter with a default**, which leaves that caller untouched. The plan implied DI; there is no DI seam here.
   Verify: `grep -n "export function aggregate" server/src/stats/aggregator.ts`

2. **The plan names `PAGE_DESCRIPTIONS`; the real symbol is `PAGE_SUBTITLES`** — `web/src/App.tsx:43`, consumed at `App.tsx:155`. `PAGES` is at `App.tsx:36`. Task 6 edits both by their real names.
   Verify: `grep -n "PAGE_SUBTITLES" web/src/App.tsx`

3. **The fixture transcripts carry no nested `cache_creation` object** — every `usage` in `server/test/fixtures/projects/**/*.jsonl` has only the flat `cache_creation_input_tokens`. Two consequences, both handled in this doc rather than discovered mid-wave:
   - The parser needs an explicit **fallback rule** for an absent or partial nested breakdown (C-1), or real transcripts written before the field existed would price all cache-writes at zero.
   - The fixture transcripts must gain a real split, or the fixture's cache-write cost would be `0` while its `cacheCreation` is `6074` — an internally inconsistent fixture. Task 1 owns that edit.
   Verify: `grep -c ephemeral server/test/fixtures/projects/-fixture-project/11111111-1111-1111-1111-111111111111.jsonl` → `0`

4. **`server/test/stats.integration.test.ts:75` deep-equals the web fixture against the real pipeline output.** The web fixture's cost numbers are therefore *not* free-choice hand-computed values — they must be exactly what the pipeline produces from the fixture transcripts under the real rate table. Every cost number in Task 1 was derived from the fixture transcripts' actual token counts; the derivation is shown inline so it can be re-checked rather than trusted.
   Verify: `grep -n "deep-equals" server/test/stats.integration.test.ts`

5. **Unit correction to the plan: nano-USD, not micro-USD.** The plan specifies integer micro-USD. At micro-USD granularity a cache read on Opus (`$0.50`/MTok) is `0.5` µUSD per token, which forces a rounding step and makes fixture assertions approximate. At **nano-USD** (1e-9 USD) every rate in the table is an exact integer per token — `$5.00`/MTok → `5000` nUSD/token, `$0.50`/MTok → `500`, `$6.25`/MTok → `6250`. All arithmetic is integer, all sums exact, no rounding anywhere. Headroom: the measured real-data total is ≈ `$3,067` = `3.07e12` nUSD against `Number.MAX_SAFE_INTEGER` = `9.007e15`, ~2,900× margin. **The plan should be corrected to say nano-USD.**

6. **Turbo's cache is shared across worktrees, so the root `npm test` can replay another worktree's logs.** Observed at baseline: `npm test` reported `FULL TURBO` and replayed logs whose paths were `.claude/worktrees/date-range-presets/…`. Numbers happened to be valid because this worktree is identical to `main`, but the Final Gate must not accept a cache hit as evidence. Use the per-package form, which bypasses turbo: `npm test --prefix server -- run` and `npm test --prefix web -- run`.

7. **The fixture's `<synthetic>` line has all-zero usage** (`server/test/fixtures/projects/-fixture-project/11111111-1111-1111-1111-111111111111.jsonl`, line index 6). It therefore cannot prove that `<synthetic>` is excluded from cost — zero contributes zero either way. Synthetic exclusion must be proven in Task 4's unit test with *non-zero* synthetic tokens. Do not treat the integration test as covering it.

8. **`sortCounts` at `server/src/stats/aggregator.ts:150` enumerates the record-valued fields it sorts.** `modelCost` must be added there or the aggregate's key order becomes non-deterministic, which the integration test's `toStrictEqual` will catch — but at the Final Gate rather than in Task 4. Task 4 owns that line.

9. **Neither vitest config restricts `include`** — `server/vitest.config.mts` sets only `globals` and `TZ: 'UTC'`; `web/vite.config.mts` sets only `environment: 'jsdom'`, `globals`, `setupFiles`. Default collection picks up any `*.test.ts(x)` under the package. Confirmed by the baseline run listing all 19 test files, including `server/test/*.test.ts` outside `src/`. New test files in the paths this doc names will be collected.

10. **There are no unpriced models in the real data.** Per the plan's Assumption 6, `message.model` takes only `claude-opus-5`, `claude-opus-4-8`, `claude-sonnet-5`, `claude-fable-5` and `<synthetic>` across the whole transcript root. `unpricedTokens` is expected to be `0` everywhere; it is a guard against a future model release, and Task 4 proves it increments using a synthetic unknown model rather than real data.

11. **This doc supersedes the plan's four-phase task split.** The plan's Phase 4 ("fixture and cross-package proof") is folded into Wave 0 Task 1, because the web Cost page test and the server integration test both need the fixture's cost fields to *exist* before they can be written. What remains genuinely post-hoc is the real-binding assertion, which is Wave 2 Task 7.

## Contract Registry

> **Amendment rule.** A contract is frozen once the wave dispatches. An agent that finds its contract wrong or insufficient reports it to the controller and waits; the controller decides, records an amendment against the contract ID below, and broadcasts it to every consumer listed. Agents may message each other freely to *clarify* semantics inside a contract, and may not agree a change to one between themselves.

### C-1 — `TokenUsage`, extended with the cache-TTL split

Declared identically in `server/src/stats/contracts.ts` and `web/src/api/types.ts`.

```ts
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
   *  5m is the cheaper of the two, so an unknown split understates rather than
   *  overstates spend. When the parts sum to MORE, they are used as given and
   *  `cacheCreation` remains the flat field. */
  cacheCreation5m: number;
}
```

- **Owner:** Task 1 · **Consumers:** Task 3 (populates), Task 4 (prices from it)
- **Stand-in:** none needed — a plain data interface. Task 4's tests construct literals directly.
- **Real binding:** Task 7 — drives `parseTranscript` on a raw JSONL string carrying a nested `cache_creation`, then `aggregate`, and asserts the resulting USD. Also bound end-to-end by `server/test/stats.integration.test.ts:75` once Tasks 1–4 land.
- **Derived by:** `grep -rn "TokenUsage" server/src web/src` → declared at `contracts.ts:21` and `types.ts:1`; consumed by `aggregator.ts:20` (`addUsage`) and the parser's local `TokenEvent`. No callers outside this run.

### C-2 — token `UsageEvent` gains `speed`

```ts
| { kind: 'token'; day: string; project: string; model: string; dedupeKey: string;
    usage: TokenUsage;
    durationMs?: number
    /** Request speed from `message.usage.speed`; 'standard' when the field is absent.
     *  Any value other than the literal 'fast' normalizes to 'standard'. */
    speed: 'standard' | 'fast';
    isSidechain: boolean; agentId?: string; agentType?: string;
    skill?: string }
```

- **Owner:** Task 1 · **Consumers:** Task 3 (populates), Task 4 (passes to the rate lookup)
- **Stand-in:** none needed — data.
- **Real binding:** Task 7.
- **Note:** `speed` is **required**, not optional, so a constructed event cannot silently omit it and fall through to a default that nobody chose. Task 4's fixtures set it explicitly.

### C-3 — `CostBreakdown`

Declared identically in both packages. **All figures are integer nano-USD (1e-9 USD).**

```ts
export interface CostBreakdown {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  /** input + output + cacheRead + cacheWrite5m + cacheWrite1h */
  total: number;
  /** What (cacheCreation + cacheRead) tokens would have cost at this model's full input
   *  rate — the uncached counterfactual. Net cache saving is DERIVED at render time as
   *  `uncachedCacheCost - cacheWrite5m - cacheWrite1h - cacheRead`, never stored. */
  uncachedCacheCost: number;
  /** Tokens whose model had no rate row for their day. They contribute 0 to every
   *  figure above and are counted here so `total` stays auditable. */
  unpricedTokens: number;
}
```

- **Owner:** Task 1 · **Consumers:** Tasks 4, 5, 6, 7
- **Stand-in:** consumers construct literals. A zero cell is every field `0`.
- **Real binding:** Task 7, plus `stats.integration.test.ts:75`.

### C-4 — `UsageCounts` gains `cost` and `modelCost`

```ts
export interface UsageCounts {
  // ... every existing field unchanged ...
  /** Cost of this cell's model-attributed tokens. Equals the sum over `modelCost`.
   *  `<synthetic>` contributes to neither, by construction: cost is only ever
   *  accumulated inside the existing `event.model !== SYNTHETIC` branch. */
  cost: CostBreakdown;
  /** Keyed on normalized model name, same key space as `models`. */
  modelCost: Record<string, CostBreakdown>;
}
```

- **Owner:** Task 1 · **Consumers:** Tasks 4 (populates), 5 (merges), 6 (renders), 7 (asserts)
- **Stand-in:** Tasks 5 and 6 build `UsageCounts` literals / read the Wave 0 fixture.
- **Real binding:** `stats.integration.test.ts:75` (deep-equal against the real pipeline) and Task 7.
- **Note:** `AGGREGATE_STATS_KEYS` is **unchanged** — nothing new appears at the top level of `AggregateStats`. `server/src/stats/contracts.test.ts` and `web/src/api/types.test.ts` pin that list in both packages and must stay green untouched.

### C-5 — the rate table

New module `server/src/stats/rates.ts`.

```ts
/** Nano-USD (1e-9 USD) per token. Every value is an exact integer by construction:
 *  a USD-per-million-tokens rate R maps to R * 1000 nano-USD per token. */
export interface ModelRates {
  input: number;
  output: number;
  cacheRead: number;     // 0.10 x input
  cacheWrite5m: number;  // 1.25 x input
  cacheWrite1h: number;  // 2.00 x input
}

export type RequestSpeed = 'standard' | 'fast';

/** Resolves the rate in force for `model` on `dayKey` at `speed`.
 *  Returns `undefined` when the model has no row for that day — never a fallback row,
 *  never a nearest-model guess. `dayKey` is a `YYYY-MM-DD` string already bucketed by
 *  the aggregator; comparison is lexicographic, so no Date parsing occurs here. */
export function rateFor(
  model: string,
  dayKey: string,
  speed: RequestSpeed,
): ModelRates | undefined;
```

- **Owner:** Task 2 · **Consumers:** Task 4 (injected), Task 7 (real)
- **Stand-in:** Task 4 passes its own two-row function with round numbers:
  ```ts
  const fakeRateFor = (model: string, day: string, speed: 'standard' | 'fast') => {
    if (model === 'test-model') {
      return { input: 1000, output: 2000, cacheRead: 100, cacheWrite5m: 1250, cacheWrite1h: 2000 };
    }
    if (model === 'test-model-fast' && speed === 'fast') {
      return { input: 2000, output: 4000, cacheRead: 200, cacheWrite5m: 2500, cacheWrite1h: 4000 };
    }
    return undefined;   // never throws; an unknown model is `undefined`, not an error
  };
  ```
  The fake **must return `undefined`** for unknown input and **must never throw** — that is the contract, and a stricter fake would let Task 4's unpriced path pass without being exercised.
- **Real binding:** Task 7 — calls the real `rateFor` and asserts exact nano-USD across the 2026-09-01 Sonnet 5 boundary and across `speed`.
- **Derived by:** new module; no existing callers. `grep -rn "rateFor" server/src` → no matches at `beec4c8`.

### C-6 — `aggregate` gains an injected rate lookup

```ts
export function aggregate(
  files: readonly ParsedFile[],
  generatedAt: string,
  rateFor?: (model: string, dayKey: string, speed: RequestSpeed) => ModelRates | undefined,
): AggregateStats;
```

Defaults to the real `rateFor` from C-5, so the existing call at `pipeline.ts:57` is unchanged.

- **Owner:** Task 4 · **Consumers:** Task 7
- **Stand-in:** Task 4 owns both sides; Task 7 uses the real default.
- **Real binding:** Task 7 and `stats.integration.test.ts:75` (which reaches `aggregate` through the wired HTTP module, i.e. at the true entry point, not via a helper).
- **Other existing callers (not in this run):** `server/src/stats/pipeline.ts:57` — passes two arguments and keeps working unchanged via the default. `server/src/stats/aggregator.test.ts` calls it throughout with two arguments; those calls also keep working.
- **Derived by:** `grep -rn "aggregate(" server/src server/test` → `pipeline.ts:57` plus `aggregator.test.ts` call sites. No other callers.

### C-7 — the shared fixture's cost data

`web/src/api/__fixtures__/aggregate-stats.json` plus the TTL split in `server/test/fixtures/projects/**/*.jsonl`. Listed in `turbo.json` `globalDependencies`, read by `web` page tests, `server/src/stats/stats.module.test.ts:15` and `server/test/stats.integration.test.ts:28`.

- **Owner:** Task 1 · **Consumers:** Tasks 6, 7 (and, unedited, the existing integration test)
- **Stand-in:** none — it lands in Wave 0 and consumers read the real file.
- **Real binding:** `stats.integration.test.ts:75` regenerates it from the transcripts and deep-equals.
- **Distribution note:** the fixture's Opus cell is cache-dominated (`cacheRead` 21,147 of 27,420 tokens — 77%), which matches the real data measured in the plan, where cache reads were ~61% of Opus 5 spend. The Sonnet cell is deliberately cache-free so a zero-cache `CostBreakdown` is also exercised. Do not "balance" these; the lopsidedness is the realistic case.

### Amendments

_None yet. The controller records amendments here as `C-n (YYYY-MM-DD): <change> — broadcast to Tasks …`._

## Wave Overview

| Wave | Tasks | Plan phases | Why not earlier |
|---|---|---|---|
| 0 | 1 | 1, 4 | Consumers need `CostBreakdown` and the extended `UsageCounts` to *resolve* at import time, and Tasks 6 and 7 need the fixture's cost fields to exist before their assertions can be written. |
| 1 | 2, 3, 4, 5, 6 | 1, 2, 3 | — dispatched together |
| 2 | 7 | 2, 3 | Asserts the contract against the owner's **real** implementation — the real `rateFor` and the real `aggregate`. By definition no stand-in can prove it, since a stand-in is what it exists to replace. |

### File-ownership check

Every task's `Files:` list, compared path by path:

| Path | Owned by |
|---|---|
| `server/src/stats/contracts.ts` | T1 |
| `web/src/api/types.ts` | T1 |
| `web/src/api/__fixtures__/aggregate-stats.json` | T1 |
| `server/test/fixtures/projects/-fixture-project/11111111-1111-1111-1111-111111111111.jsonl` | T1 |
| `server/test/fixtures/projects/-fixture-project/11111111-1111-1111-1111-111111111111/subagents/agent-afixture0000000001.jsonl` | T1 |
| `server/src/stats/rates.ts`, `server/src/stats/rates.test.ts` | T2 |
| `server/src/stats/parser.ts`, `server/src/stats/parser.test.ts` | T3 |
| `server/src/stats/file-cache.ts`, `server/src/stats/file-cache.test.ts` | T3 |
| `server/src/stats/aggregator.ts`, `server/src/stats/aggregator.test.ts` | T4 |
| `web/src/api/filterStats.ts`, `web/src/api/filterStats.test.ts` | T5 |
| `web/src/pages/Cost.tsx`, `web/src/pages/Cost.test.tsx` | T6 |
| `web/src/App.tsx`, `web/src/App.test.tsx` | T6 |
| `server/src/stats/cost-integration.test.ts` | T7 |
| `server/src/stats/stats.module.test.ts` | T7 |

**No path appears twice within Wave 1.** Two cross-wave overlaps exist and are legal because Wave 0 is committed before Wave 1 dispatches:

- `server/src/stats/aggregator.ts` — T1 does not touch it (see below), so there is in fact **no** overlap.
- Confirmed: Task 1 touches **only** type declarations and fixture data. It does *not* pre-initialize `emptyCounts` or `mergeUsageCounts`; those stay type-broken until Tasks 4 and 5 land, exactly as the throughput run did. This keeps Wave 0 a pure transcription and avoids two tasks owning one file.

`server/test/stats.integration.test.ts` is owned by **nobody** — it needs no edit and goes green on its own once Tasks 1–4 land.

---

## Wave 0

### ✅ Task 1 — Contract declarations and shared fixture data

**Phase:** 1, 4 · **Wave:** 0
**Provides:** C-1, C-2, C-3, C-4, C-7 · **Consumes:** none
**Assumes decision:** none

**Files**
- Modify `server/src/stats/contracts.ts`
- Modify `web/src/api/types.ts`
- Modify `web/src/api/__fixtures__/aggregate-stats.json`
- Modify `server/test/fixtures/projects/-fixture-project/11111111-1111-1111-1111-111111111111.jsonl`
- Modify `server/test/fixtures/projects/-fixture-project/11111111-1111-1111-1111-111111111111/subagents/agent-afixture0000000001.jsonl`

> **Precedence:** if anything below contradicts the success criteria, the criteria win — implement what is correct and report the deviation.

**Why this task exists.** Every other task codes against these declarations, and Tasks 6 and 7 assert against the fixture's cost numbers. Both must exist and be committed before the wave dispatches, or five agents fail to compile for reasons unrelated to their own work.

**Context.** This is a transcription task: declarations and data, no logic, no behavior to test. Cost is stored as **integer nano-USD** (Precondition 5). The fixture's cost values are not free-choice — `server/test/stats.integration.test.ts:75` deep-equals the web fixture against the real pipeline output, so they must be exactly what the pipeline will produce from the fixture transcripts. The derivation is shown so it can be re-checked rather than trusted.

**Contract — declarations.** Add C-1, C-2, C-3 and C-4 verbatim from the registry to `server/src/stats/contracts.ts`, and add the identical `TokenUsage`, `CostBreakdown` and `UsageCounts` changes to `web/src/api/types.ts`. `UsageEvent` (C-2) is server-only — `web/src/api/types.ts` does not declare it, and must not gain it. **Do not touch `AGGREGATE_STATS_KEYS` in either package.**

**Contract — fixture transcripts.** Only two usage lines in the fixture transcripts have non-zero `cache_creation_input_tokens`. Give each a nested `cache_creation` object that sums exactly to its existing flat value:

| File | Line (0-indexed) | requestId | flat `cache_creation_input_tokens` | add `cache_creation` |
|---|---|---|---|---|
| `…/11111111-….jsonl` | 1 | `req_main_A` | 5 | `{"ephemeral_1h_input_tokens": 3, "ephemeral_5m_input_tokens": 2}` |
| `…/subagents/agent-afixture0000000001.jsonl` | 1, 2, 3 | `req_side_G` | 6069 | `{"ephemeral_1h_input_tokens": 4000, "ephemeral_5m_input_tokens": 2069}` |

All three `req_side_G` lines get the same object (only the last survives dedupe, but the file should read consistently). Every other `usage` object is left exactly as it is — their `cache_creation_input_tokens` is `0`, so they exercise the absent-nested-object path through the pipeline at zero cost. **Change nothing else on any line** — not timestamps, not token counts, not ordering.

Resulting deduped totals: `cacheCreation1h` = 3 + 4000 = **4003**, `cacheCreation5m` = 2 + 2069 = **2071**, summing to the existing `cacheCreation` of **6074**.

**Contract — fixture cost values.** Rates in force for the fixture's days (both `2026-07-09` and `2026-07-10` precede the 2026-09-01 Sonnet 5 boundary), in nano-USD per token:

| Model | input | output | cacheRead | cacheWrite5m | cacheWrite1h |
|---|---:|---:|---:|---:|---:|
| `claude-opus-4-8` | 5000 | 25000 | 500 | 6250 | 10000 |
| `claude-sonnet-5` | 2000 | 10000 | 200 | 2500 | 4000 |

Derivation for `claude-opus-4-8` (tokens: input 16, output 183, cacheRead 21147, cc1h 4003, cc5m 2071):

```
input             16 x  5000 =        80,000
output           183 x 25000 =     4,575,000
cacheRead      21147 x   500 =    10,573,500
cacheWrite5m    2071 x  6250 =    12,943,750
cacheWrite1h    4003 x 10000 =    40,030,000
total                        =    68,202,250
uncachedCacheCost  (4003 + 2071 + 21147) x 5000 = 27221 x 5000 = 136,105,000
```

Add these objects. The `2026-07-09` / `-fixture-project` cell contains only `claude-opus-4-8`, so its `cost` and its `modelCost["claude-opus-4-8"]` are identical:

```json
"cost": {
  "input": 80000, "output": 4575000, "cacheRead": 10573500,
  "cacheWrite5m": 12943750, "cacheWrite1h": 40030000,
  "total": 68202250, "uncachedCacheCost": 136105000, "unpricedTokens": 0
},
"modelCost": {
  "claude-opus-4-8": {
    "input": 80000, "output": 4575000, "cacheRead": 10573500,
    "cacheWrite5m": 12943750, "cacheWrite1h": 40030000,
    "total": 68202250, "uncachedCacheCost": 136105000, "unpricedTokens": 0
  }
}
```

The `2026-07-10` / `-fixture-project-two` cell (`claude-sonnet-5`: input 7, output 11, everything else 0):

```json
"cost": {
  "input": 14000, "output": 110000, "cacheRead": 0,
  "cacheWrite5m": 0, "cacheWrite1h": 0,
  "total": 124000, "uncachedCacheCost": 0, "unpricedTokens": 0
},
"modelCost": {
  "claude-sonnet-5": {
    "input": 14000, "output": 110000, "cacheRead": 0,
    "cacheWrite5m": 0, "cacheWrite1h": 0,
    "total": 124000, "uncachedCacheCost": 0, "unpricedTokens": 0
  }
}
```

`totals` — the sum of the two cells, with `modelCost` carrying both models:

```json
"cost": {
  "input": 94000, "output": 4685000, "cacheRead": 10573500,
  "cacheWrite5m": 12943750, "cacheWrite1h": 40030000,
  "total": 68326250, "uncachedCacheCost": 136105000, "unpricedTokens": 0
},
"modelCost": {
  "claude-opus-4-8": { …the Opus object above… },
  "claude-sonnet-5": { …the Sonnet object above… }
}
```

Place `cost` and `modelCost` **after** `agents` in each object, matching the order the aggregator will emit (the integration test uses `toStrictEqual`, which ignores key order, but the module test's key-set assertion does not apply here — keep it tidy regardless).

**Success criteria**
- Both packages declare `TokenUsage` with `cacheCreation1h` and `cacheCreation5m`, and `CostBreakdown` and `UsageCounts.cost` / `.modelCost`, with identical field names and identical doc comments on the fields whose semantics matter (the C-1 fallback rule, the C-3 nano-USD unit, the C-3 derived-net-saving note).
- `AGGREGATE_STATS_KEYS` is byte-identical to `beec4c8` in both packages.
- The fixture transcripts' nested splits sum exactly to their existing flat `cache_creation_input_tokens` — 3+2=5 and 4000+2069=6069. A split that does not sum is the failure mode this task must not ship.
- Every `cost.total` in the fixture equals the sum of its own five component fields, and `totals.cost` equals the sum of the two cells' `cost`, field by field — including the case where a cell is entirely cache-free (the Sonnet cell), whose `uncachedCacheCost` must be `0` and not omitted.
- `totals.modelCost` has exactly the two model keys that `totals.models` has.

**Verification:** none — diff review against the registry. Type checking is intentionally red at this point (see Execution Model) and is the Final Gate's check. The fixture's internal arithmetic is checked by the review checklist below and proven by `stats.integration.test.ts` once Tasks 2–4 land.

**Mutations to reject:** none — this task has no test of its own. Its correctness is gated by the controller's arithmetic re-check below and, definitively, by `stats.integration.test.ts:75` at the Final Gate.

**Controller review checklist**
- [ ] Re-add the five components of every `cost` object independently and confirm each `total`. Do not eyeball.
- [ ] Confirm `totals.cost` is the field-by-field sum of the two cells' `cost`, and that `totals.cost.total` = 68,202,250 + 124,000 = 68,326,250.
- [ ] Confirm `uncachedCacheCost` = (cacheCreation + cacheRead) × that model's input rate, for both cells.
- [ ] `git diff -- server/test/fixtures` shows *only* added `cache_creation` objects — no changed token counts, timestamps, or line ordering.
- [ ] `grep -c AGGREGATE_STATS_KEYS` diff is empty in both packages.
- [ ] The two declarations are genuinely identical: `diff <(sed -n '/interface CostBreakdown/,/^}/p' server/src/stats/contracts.ts) <(sed -n '/interface CostBreakdown/,/^}/p' web/src/api/types.ts)` prints nothing.

**Commit (controller runs after review)**
```
git add -- server/src/stats/contracts.ts web/src/api/types.ts \
  web/src/api/__fixtures__/aggregate-stats.json \
  server/test/fixtures/projects/-fixture-project/11111111-1111-1111-1111-111111111111.jsonl \
  server/test/fixtures/projects/-fixture-project/11111111-1111-1111-1111-111111111111/subagents/agent-afixture0000000001.jsonl
git commit -m "Declare per-model cost contracts and give the fixtures a cache-TTL split"
```

**Progress notes:** ✅ Completed. Success criteria: MET (all 6). Files: the five listed paths, nothing outside them.
Verified by controller with an independent script (`review1.py`): every `CostBreakdown` has exactly the 8 integer fields;
every `total` equals its five components; each cell's `cost` equals the sum over its own `modelCost`; `totals.cost` equals
the two cells field by field; **every `modelCost` field independently re-derived from that model's own `TokenTotals` × the
rate table — all 8 fields × 3 entries match**, so the numbers follow from the rates rather than merely being self-consistent;
all 17 `TokenTotals` satisfy `cacheCreation1h + cacheCreation5m === cacheCreation` with `total` unchanged; `modelCost` keys ==
`models` keys; every transcript nested split sums to its flat field, and every bare `usage` has flat 0. 0 failures.
`AGGREGATE_STATS_KEYS` untouched in both packages; `TokenUsage` and `CostBreakdown` byte-identical across packages;
web has no `UsageEvent` and no `speed` field. C-1/C-2/C-3/C-4/C-7 CONFORM. Verification: none (per the doc) — diff read + arithmetic.
**Finding F-1 raised mid-run by the agent and accepted — see the Findings section.** Deviations: agent added
`cacheCreation1h`/`cacheCreation5m` to all 17 fixture `TokenTotals` objects, which F-1 makes mandatory; accepted.
**Commit hash:** `38bfeb4`

---

## Findings

Premises in this doc that turned out to be false, corrected mid-run. Recorded here because the blast radius follows the
*briefs that share the premise*, not a contract's consumer list.

### F-1 — `TokenTotals` inherits the cache-TTL split (raised by the Task 1 agent, 2026-08-07)

`export interface TokenTotals extends TokenUsage { total: number }` — `server/src/stats/contracts.ts:72`,
`web/src/api/types.ts:19`. Adding `cacheCreation1h` / `cacheCreation5m` to `TokenUsage` (C-1) therefore makes them
**required on every `TokenTotals`**, not only on the parser's per-event usage.

This contradicts the source plan's Key Design Decision "`TokenTotals` is not extended", which is simply wrong about the
repo — the extension happens by inheritance, not by choice. **The plan needs correcting**; it is not a contract change,
so C-1 stands as written.

Consequences, broadcast into the affected task briefs before Wave 1 dispatched:
- **Task 1** — the fixture's 17 `TokenTotals` objects need the two fields. Done in the same commit.
- **Task 4** — `emptyTokenTotals()` must initialise them to 0 and `addUsage()` must sum them, or the aggregator emits
  `TokenTotals` without the split and `server/test/stats.integration.test.ts:75` fails its `toStrictEqual` at the Final Gate.
- **Task 5** — `zeroTokenTotals()` and `addTokenTotals()` must carry them, or every filtered or bucketed view silently
  drops the split.

No other task's brief depends on the premise: Tasks 2, 3, 6 and 7 touch `TokenUsage` or `CostBreakdown` but never
construct a `TokenTotals`.

---

### F-2 — Task 4 had a resolve-time dependency on Task 2 (raised by the controller, 2026-08-07)

C-6 specifies that `aggregate`'s third parameter **defaults to the real `rateFor` imported from `./rates`** — a module Task 2
creates. Both were placed in Wave 1. But an import is resolved at module load, so Task 4's own test file could not even load
until `server/src/stats/rates.ts` existed on disk: the two tasks were not independent, and dispatching them together would
have had four agents racing a missing import with no way to tell that failure from their own.

This is a defect in the breakdown, not in either task's brief or in any contract. **Resolution:** Task 2 was dispatched and
committed alone first (it is a leaf module with zero imports, so it is fast and cannot be blocked by anything), then Tasks 3–6
were dispatched together as a wave of four with `rates.ts` already on disk. Contracts unchanged.

The general lesson for the next breakdown: a `Consumes` entry whose stand-in is *"use the real default"* is not a stand-in at
all — it is an import, and an import is a wave boundary. The Wave Overview's stand-in column should have caught it.

---

## Wave 1

### ✅ Task 2 — Date-effective rate table

**Phase:** 1 · **Wave:** 1
**Provides:** C-5 · **Consumes:** none
**Peer map:** none
**Assumes decision:** none

**Files**
- Create `server/src/stats/rates.ts`
- Create `server/src/stats/rates.test.ts`

> **Precedence:** if anything below contradicts the success criteria, the criteria win — implement what is correct and report the deviation.

**Why this task exists.** Cost is meaningless without rates, and rates change over time. Sonnet 5's introductory pricing expires 2026-08-31; a flat table would retroactively reprice every historical Sonnet 5 day on 2026-09-01. This module is the single source of truth for what a token costs, and it is the only place in the codebase that knows a dollar figure.

**Context.** Rates are published as USD per million tokens. Storing them as nano-USD per token (`USD-per-MTok × 1000`) makes every value in the table below an exact integer, which is why the whole cost pipeline can be integer arithmetic with no rounding (Precondition 5). Derived cache rates are **computed from the input rate, not hand-entered**, so a base-rate edit cannot leave them stale. `dayKey` is a `YYYY-MM-DD` string the aggregator already resolved in the configured zone — compare it lexicographically and never parse it into a `Date`, matching the discipline in `web/src/api/granularity.ts:bucketKey`.

**Contract (provides C-5)** — exactly as the registry states it:

```ts
export interface ModelRates {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
}
export type RequestSpeed = 'standard' | 'fast';
export function rateFor(model: string, dayKey: string, speed: RequestSpeed): ModelRates | undefined;
```

Table contents, as USD per million tokens (the module derives the nano-USD values and the three cache rates):

| Model | speed | effective from | input | output |
|---|---|---|---:|---:|
| `claude-fable-5` | standard | — | 10.00 | 50.00 |
| `claude-opus-5` | standard | — | 5.00 | 25.00 |
| `claude-opus-5` | fast | — | 10.00 | 50.00 |
| `claude-opus-4-8` | standard | — | 5.00 | 25.00 |
| `claude-opus-4-8` | fast | — | 10.00 | 50.00 |
| `claude-sonnet-5` | standard | — | 2.00 | 10.00 |
| `claude-sonnet-5` | standard | 2026-09-01 | 3.00 | 15.00 |
| `claude-haiku-4-5` | standard | — | 1.00 | 5.00 |

Multipliers: `cacheRead = 0.10 × input`, `cacheWrite5m = 1.25 × input`, `cacheWrite1h = 2.00 × input`.

Semantics `rateFor` must satisfy:
- Returns the row with the **latest `effectiveFrom` that is ≤ `dayKey`**; a row with no `effectiveFrom` applies from the beginning of time.
- Returns `undefined` for an unknown model, and for a known model at a `speed` it has no row for (e.g. `claude-sonnet-5` at `'fast'`) — **it must not silently fall back to the standard row**, because a fast request genuinely costs more and a silent fallback would understate it by 2×.
- **Never throws**, for any input, including an empty-string model or a malformed `dayKey`.
- Add a comment naming the source and verification date: the `claude-api` skill's model table and `shared/prompt-caching.md`, verified 2026-08-07.

**Tests** (`rates.test.ts`) — one per case:

| Case | Assertion |
|---|---|
| Opus 5 standard | `rateFor('claude-opus-5', '2026-08-07', 'standard')` is `{input: 5000, output: 25000, cacheRead: 500, cacheWrite5m: 6250, cacheWrite1h: 10000}` |
| Opus 5 fast | same model at `'fast'` returns input `10000`, output `50000`, cacheWrite1h `20000` |
| Sonnet 5 before the boundary | `'2026-08-31'` returns input `2000`, output `10000` |
| Sonnet 5 on the boundary | `'2026-09-01'` returns input `3000`, output `15000` |
| Sonnet 5 after the boundary | `'2026-12-25'` returns input `3000` |
| Sonnet 5 at `'fast'` | returns `undefined` — not the standard row |
| Unknown model | `rateFor('claude-opus-9', '2026-08-07', 'standard')` is `undefined` |
| Empty model | `rateFor('', '2026-08-07', 'standard')` is `undefined`, no throw |
| Malformed dayKey | `rateFor('claude-opus-5', 'not-a-date', 'standard')` does not throw |
| Derived rates | for every row the table exposes, `cacheRead × 10 === input`, `cacheWrite5m × 4 === input × 5`, `cacheWrite1h === input × 2` — asserted by iterating the table, not by restating numbers |
| Integrality | every field of every row is an integer (`Number.isInteger`) |

Use `toStrictEqual` on whole `ModelRates` objects, not field-by-field `toBe` — a missing field must fail.

**Mutations to reject.** Apply each, confirm the named assertion fails, revert, and report the failure output. If one cannot be made to fail, **report it as a finding and stop — do not weaken the test.**

| # | Mutation | Anchor (`grep -cF` → 1) | Traced failure |
|---|---|---|---|
| 1 | **Widened bound** — change the boundary comparison from `<=` to `<` when selecting the effective row | the comparison in the row-selection loop | `'2026-09-01'` then falls to the intro row and returns input `2000`, so the "Sonnet 5 on the boundary" case fails on `input` |
| 2 | **Inverted predicate** — drop the `speed` check so any speed matches the standard row | the `speed` comparison in row selection | `rateFor('claude-sonnet-5', …, 'fast')` returns the standard row instead of `undefined`, failing the "Sonnet 5 at fast" case |
| 3 | **Hardcoded return** — make the unknown-model path return the Opus 5 row instead of `undefined` | the final `return undefined` | the "Unknown model" and "Empty model" cases both fail |
| 4 | **Order** — select the *first* matching row rather than the latest effective one (e.g. `.find` before sorting, or reverse the sort) | the row-ordering step | Sonnet 5 at `'2026-12-25'` returns `2000`, failing the "after the boundary" case |
| 5 | **Transposed same-typed args** — swap the `cacheWrite5m` and `cacheWrite1h` multipliers (1.25 ↔ 2.00) | the two multiplier constants | the Opus 5 standard case fails on `cacheWrite5m` (`10000` where `6250` is expected), and the derived-rates case fails too |

**Verification**
```
npm test --prefix server -- run src/stats/rates.test.ts
```
Expect `Test Files  1 passed (1)` and one test per row in the table above, all passing.

**Success criteria**
- Every row in the rate table resolves, at both boundary sides and both speeds.
- An unknown model, an empty model string, and a known model at an unsupported speed each return `undefined` rather than a guessed row — the case that would otherwise silently halve or double a real bill.
- Derived cache rates are computed from `input`, proven by the iterating assertion rather than by restated literals, so editing a base rate cannot leave a cache rate stale.
- Every rate is an integer; no floating-point value escapes the module.
- The module has no imports from elsewhere in `src/stats` — it is a leaf.

**Controller review checklist**
- [ ] Re-run the verification command; confirm one test per table row.
- [ ] Apply all five mutations from the table above and confirm each fails the named assertion; revert each.
- [ ] Read the table: confirm the eight rows match this doc exactly, including that Sonnet 5 has two rows and Opus 5 / Opus 4.8 each have a `fast` row.
- [ ] Confirm no `Date` construction or parsing appears in the module (`grep -n "new Date\|Date.parse" server/src/stats/rates.ts` → no matches).
- [ ] Confirm the source-and-date comment is present.

**Commit (controller runs after review)**
```
git add -- server/src/stats/rates.ts server/src/stats/rates.test.ts
git commit -m "Add a date-effective per-model rate table in nano-USD per token"
```

**Progress notes:** ✅ Completed. Success criteria: MET (all 5). Files: server/src/stats/rates.ts, server/src/stats/rates.test.ts.
Verified by controller: `npm test --prefix server -- run src/stats/rates.test.ts` → 1 file / 11 tests PASS. **All 5 named mutations
re-proven mechanically** via `prove-mutations.sh` (baseline passes; M1→1 failure, M2→2, M3→3, M4→2, M5→5; tree restored, baseline
passes again) — failure counts match the agent's report exactly. C-5 CONFORMS: `ModelRates` field names, `RequestSpeed`,
`rateFor` signature, `undefined`-not-fallback for both unknown model and unsupported speed, no `Date` construction anywhere
(`grep` clean), source-and-date comment present. Derived cache rates computed from `input` in one helper and asserted by
iterating the table, so a base-rate edit cannot leave them stale; integrality asserted per field per row.
Additive export beyond the contract: `RATE_TABLE` / `RateRow`, needed for the iterating assertions the brief mandated —
purely additive, C-5 unchanged, consumers may ignore it. Accepted.
**Commit hash:** `b43beeb`

---

### ⬜ Task 3 — Parse the cache-TTL split and request speed; version the file cache

**Phase:** 2 · **Wave:** 1
**Provides:** populates C-1, C-2 · **Consumes:** C-1, C-2 (owner Task 1)
**Peer map:** C-1 / C-2 → Task 1
**Assumes decision:** none

**Files**
- Modify `server/src/stats/parser.ts`
- Modify `server/src/stats/parser.test.ts`
- Modify `server/src/stats/file-cache.ts`
- Modify `server/src/stats/file-cache.test.ts`

> **Precedence:** if anything below contradicts the success criteria, the criteria win — implement what is correct and report the deviation.

**Why this task exists.** Pricing needs a dimension the parser currently throws away. `usage.cache_creation` splits into 1-hour and 5-minute TTL tokens that price at 2× and 1.25× base input; the parser reads only the flat total at `parser.ts:174`. On real data the mix is ~67% 1h, so collapsing it understates cache-write spend by about a third. The cache version bump belongs here because it is *this* change to the parser's output shape that makes stale entries dangerous.

**Context.** `parseTranscript` is pure — no fs, no clock, no ambient timezone — and **never throws**: an unparseable line increments `malformedLines`, an unknown `type` increments `ignoredLines`. Preserve both properties. Token usage is read **only** from `message.usage` on `type: "assistant"` lines; do not start reading any other field. Dedupe stays per-file on `requestId ?? uuid` with the last usage-bearing occurrence winning.

The file cache key is `` `${file.path}:${file.mtimeMs}:${file.size}:${timeZone}:v2` `` at `file-cache.ts:9`. Transcripts are append-only, so without a bump, every already-cached file would keep serving a `ParsedFile` with no TTL split and no `speed` — and every cache-write would price at zero, forever, with no error. This is the highest-impact silent failure in the run.

**Contract.** Extend the `RawLine` usage type and populate C-1 and C-2:

```ts
usage?: {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_creation?: {
    ephemeral_1h_input_tokens?: number;
    ephemeral_5m_input_tokens?: number;
  };
  speed?: string;
};
```

The split rule, exactly:

- `cacheCreation` stays `cache_creation_input_tokens ?? 0` — **unchanged**, and remains authoritative for the total.
- `cacheCreation1h` = `cache_creation.ephemeral_1h_input_tokens ?? 0`.
- `cacheCreation5m` = `(cache_creation.ephemeral_5m_input_tokens ?? 0)` **plus** `max(0, cacheCreation − cacheCreation1h − (ephemeral_5m ?? 0))`. That remainder term is what makes an absent or partial nested object degrade to "all 5m" — the cheaper rate, so an unknown split understates rather than overstates.
- `speed` = `'fast'` when `message.usage.speed === 'fast'`, otherwise `'standard'`. Any other value, including `undefined`, normalizes to `'standard'`.

Bump the cache key's trailing `:v2` to `:v3`. Change nothing else about the key.

**Tests** (add to `parser.test.ts`) — one per case:

| Case | Assertion |
|---|---|
| Nested split present and summing | a line with flat `6069` and `{1h: 4000, 5m: 2069}` yields `cacheCreation` 6069, `cacheCreation1h` 4000, `cacheCreation5m` 2069 |
| Nested object absent | a line with flat `500` and no `cache_creation` yields `cacheCreation1h` 0 and `cacheCreation5m` **500** — not 0 |
| Nested object present but partial | flat `100` with `{1h: 30}` only yields `1h` 30 and `5m` **70** |
| Nested parts sum below the flat total | flat `100` with `{1h: 10, 5m: 20}` yields `1h` 10 and `5m` **90** (20 + the 70 remainder) |
| Nested parts sum above the flat total | flat `10` with `{1h: 8, 5m: 9}` yields `1h` 8, `5m` 9, and `cacheCreation` **10** — the flat field stays authoritative and the remainder clamps at 0 rather than going negative |
| Zero cache creation | flat `0`, no nested object, yields all three as 0 |
| `speed` absent | the emitted token event has `speed: 'standard'` |
| `speed: "standard"` | `'standard'` |
| `speed: "fast"` | `'fast'` |
| `speed` with an unexpected value | `speed: "turbo"` normalizes to `'standard'` |
| Dedupe still last-wins | two usage lines sharing a `requestId` with different splits — the later one's split is the one emitted |
| Never throws | a line whose `cache_creation` is a string rather than an object still parses, counts no `malformedLines`, and yields `1h` 0 / `5m` = flat |

Add to `file-cache.test.ts`: a key built for the same file/timeZone ends in `:v3`, and a stored `:v2`-suffixed entry is **not** returned by a `:v3` lookup for the same file.

Existing `parser.test.ts` cases must keep passing untouched — if one needs editing because `speed` is now a required field on the event, that is expected; adding `speed: 'standard'` to an expected-event literal is fine, changing any token count is not.

**Mutations to reject.** Apply each, confirm the named assertion fails, revert, report the output.

| # | Mutation | Anchor (`grep -cF <anchor> <file>` → 1) | Traced failure |
|---|---|---|---|
| 1 | **Dropped fallback** — set `cacheCreation5m` to just `ephemeral_5m_input_tokens ?? 0`, removing the remainder term | the `cacheCreation5m:` line in `parser.ts` | "Nested object absent" yields 0 instead of 500, and "partial" yields 0 instead of 70 — both fail. This is the mutation that models the real bug: every pre-nested-field transcript silently pricing its cache-writes at zero |
| 2 | **Transposed same-typed args** — swap `ephemeral_1h_input_tokens` and `ephemeral_5m_input_tokens` in the two reads | the two `ephemeral_` reads in `parser.ts` | "Nested split present and summing" fails on `cacheCreation1h` (2069 where 4000 is expected). Both are numbers, so nothing else catches it — and in production it would misprice by the full 2× vs 1.25× gap |
| 3 | **Hardcoded return** — make `speed` always `'standard'` | the `speed:` assignment in `parser.ts` | the `speed: "fast"` case fails |
| 4 | **Inverted predicate** — normalize with `!==  'fast'` → `'fast'` (i.e. invert the speed test) | same anchor as 3 | the `speed` absent, `"standard"`, and `"turbo"` cases all fail |
| 5 | **Widened bound** — drop the `max(0, …)` clamp on the remainder | the remainder expression in `parser.ts` | "Nested parts sum above the flat total" yields a negative `cacheCreation5m` (9 + −7 = 2), failing that case |
| 6 | **Stale cache key** — revert `:v3` to `:v2` | `grep -cF '${file.mtimeMs}:${file.size}:${timeZone}:v2' server/src/stats/file-cache.ts` → **1** at `beec4c8` | the file-cache version test fails on the suffix; the stale-entry test fails because a `:v2` entry is returned |
| 7 | **Overwritten total** — set `cacheCreation` to `cacheCreation1h + cacheCreation5m` instead of the flat field | `grep -cF 'cacheCreation: message.usage.cache_creation_input_tokens ?? 0,' server/src/stats/parser.ts` → **1** | "Nested parts sum above the flat total" fails on `cacheCreation` (17 where 10 is expected), and — critically — `stats.integration.test.ts` would go red at the Final Gate because `tokens.cacheCreation` would no longer be 6074 |

**Verification**
```
npm test --prefix server -- run src/stats/parser.test.ts
npm test --prefix server -- run src/stats/file-cache.test.ts
```
Expect both `Test Files  1 passed (1)`, with the existing cases still passing alongside the new ones.

**Success criteria**
- The TTL split is read from the nested object when present and **degrades to all-5m when it is absent or partial** — the case that matters, because transcripts written before the field existed would otherwise price every cache-write at zero and nothing would report an error.
- `cacheCreation` is byte-identical in behavior to `beec4c8`: still the flat field, still authoritative, even when the nested parts contradict it.
- The remainder never goes negative.
- `speed` is populated on every token event, defaults to `'standard'`, and only the exact literal `'fast'` produces `'fast'`.
- `parseTranscript` still never throws, including on a `cache_creation` that is not an object.
- The cache key ends in `:v3` and a `:v2` entry cannot be served.

**Controller review checklist**
- [ ] Re-run both verification commands.
- [ ] Apply all seven mutations; confirm each fails its named assertion; revert each. Mutation 6's anchor count was `1` at `beec4c8` — re-confirm before applying.
- [ ] `git diff server/src/stats/parser.ts` touches only the usage type, the `TokenUsage` construction, and the `speed` assignment — the dedupe logic, the timing/anchor logic, and the tool/skill event emission are untouched.
- [ ] Confirm no new read outside `message.usage` was introduced (`git diff` shows no new `parsed.` field access on the token path).
- [ ] Confirm existing parser tests were not weakened — the diff adds cases and at most adds `speed: 'standard'` to existing expected-event literals; no token count changed.

**Commit (controller runs after review)**
```
git add -- server/src/stats/parser.ts server/src/stats/parser.test.ts \
  server/src/stats/file-cache.ts server/src/stats/file-cache.test.ts
git commit -m "Parse the cache-TTL split and request speed, and version the file cache to v3"
```

**Progress notes:** —
**Commit hash:** —

---

### ⬜ Task 4 — Price every token event in the aggregator

**Phase:** 2 · **Wave:** 1
**Provides:** C-6, populates C-4 · **Consumes:** C-1, C-2 (owner Task 1), C-3, C-4 (owner Task 1), C-5 (owner Task 2)
**Peer map:** C-1 / C-2 / C-3 / C-4 → Task 1 · C-5 → Task 2
**Assumes decision:** none

**Files**
- Modify `server/src/stats/aggregator.ts`
- Modify `server/src/stats/aggregator.test.ts`

> **Precedence:** if anything below contradicts the success criteria, the criteria win — implement what is correct and report the deviation.

**Why this task exists.** This is the only place a date-effective rate can be resolved: `addToCounts` sees the event *and* the day it was bucketed into. Downstream, `filterStats` collapses `days` into a `totals` cell that has lost the day key, so a frontend that tried to price would have to re-walk `days` — exactly the pattern the granularity work forbids. Pricing here also makes cost merge by addition like every other cell, so weekly and monthly buckets come free.

**Context.** `aggregate` is a plain exported function at `aggregator.ts:163`, called with two arguments from `pipeline.ts:57`. Add the rate lookup as an **optional third parameter defaulting to the real `rateFor`**, so that caller and every existing test call keep working (Precondition 1).

Cost accumulation goes **inside the existing `if (event.model !== SYNTHETIC)` branch at `aggregator.ts:74`**. That is not incidental: it is what makes `<synthetic>` excluded from cost by construction, with no second exclusion rule to keep in sync, and it is why `cost.total` always equals the sum over `modelCost`.

`sortCounts` at `aggregator.ts:150` enumerates the record fields it sorts; `modelCost` must be added (Precondition 8).

**Finding F-1 applies to this task.** `TokenTotals extends TokenUsage`, so it now carries `cacheCreation1h` and
`cacheCreation5m` too. You must extend **`emptyTokenTotals()`** (`aggregator.ts:16`) to initialise both to `0`, and
**`addUsage()`** (`aggregator.ts:20`) to sum both — exactly as it already sums `cacheCreation`. `total` keeps its existing
formula (`input + output + cacheRead + cacheCreation`) and must **not** gain the split, or every existing token total
doubles its cache-creation contribution. Without this the aggregator emits `TokenTotals` without the split and
`server/test/stats.integration.test.ts:75` fails its `toStrictEqual` at the Final Gate.

**Contract (provides C-6)**

```ts
export function aggregate(
  files: readonly ParsedFile[],
  generatedAt: string,
  rateFor?: (model: string, dayKey: string, speed: RequestSpeed) => ModelRates | undefined,
): AggregateStats;
```

Per token event with `model !== '<synthetic>'`, resolve `rateFor(event.model, event.day, event.speed)`:

- **Rate found** — add to both `counts.cost` and `counts.modelCost[event.model]`:
  ```
  input             += usage.input           * rate.input
  output            += usage.output          * rate.output
  cacheRead         += usage.cacheRead       * rate.cacheRead
  cacheWrite5m      += usage.cacheCreation5m * rate.cacheWrite5m
  cacheWrite1h      += usage.cacheCreation1h * rate.cacheWrite1h
  total             += the sum of those five contributions
  uncachedCacheCost += (usage.cacheCreation1h + usage.cacheCreation5m + usage.cacheRead) * rate.input
  ```
- **Rate not found** — add nothing to any money field, and add `usage.input + usage.output + usage.cacheRead + usage.cacheCreation` to `unpricedTokens` on **both** `counts.cost` and `counts.modelCost[event.model]`. The model still gets a `modelCost` entry, so an unpriced model is visible rather than absent.
- `<synthetic>` events touch neither.

Note `uncachedCacheCost` uses `cacheCreation1h + cacheCreation5m`, not `cacheCreation` — the split is what was actually priced, so the counterfactual must use the same basis or the net saving would not reconcile.

**Tests** (add to `aggregator.test.ts`). Use the C-5 stand-in from the registry verbatim — a two-model function returning round numbers and `undefined` otherwise. One test per case:

| Case | Assertion |
|---|---|
| Single priced event | one `test-model` event with input 10, output 20, cacheRead 30, cc1h 40, cc5m 50 produces `cost` = `{input: 10000, output: 40000, cacheRead: 3000, cacheWrite5m: 62500, cacheWrite1h: 80000, total: 195500, uncachedCacheCost: 120000, unpricedTokens: 0}` |
| `cost.total` is the component sum | for that cell, `total` equals the five components added |
| `cost` equals the sum over `modelCost` | with two different priced models in one cell, `cost.total === modelCost.a.total + modelCost.b.total`, field by field |
| Speed is routed | the same tokens at `speed: 'fast'` on `test-model-fast` cost exactly double the standard row |
| Day is routed | two events with identical tokens on different days, against a stand-in whose rate differs by day, produce different costs — proving `event.day` reaches the lookup |
| Unpriced model | an event on `unknown-model` adds `0` to every money field and `input+output+cacheRead+cacheCreation` to `unpricedTokens`, and still creates a `modelCost['unknown-model']` entry |
| `<synthetic>` excluded | a `<synthetic>` event with **non-zero** tokens (e.g. 999 input) leaves `cost` and `unpricedTokens` at zero and creates no `modelCost` entry — see Precondition 7, the fixture cannot prove this |
| Cells merge | two events in different projects on the same day keep separate cell costs, and `totals.cost` is their sum |
| Zero-cache event | an event with `cacheRead` 0 and both splits 0 has `uncachedCacheCost` 0 and `cacheWrite5m`/`cacheWrite1h` 0 |
| Sort order | `modelCost` keys come back sorted, matching `models` |
| F-1: split flows into TokenTotals | an event with cc1h 40 / cc5m 50 produces `tokens.cacheCreation1h` 40, `tokens.cacheCreation5m` 50, `tokens.cacheCreation` 90, and `tokens.total` **unchanged** by the split (still `input + output + cacheRead + cacheCreation`) |
| Default parameter | calling `aggregate(files, at)` with two arguments still works and produces real (non-zero) cost for a real model name — proves the default is wired, not just declared |

Use `toStrictEqual` on whole `CostBreakdown` objects.

**Mutations to reject.** Apply each, confirm the named assertion fails, revert, report the output.

| # | Mutation | Anchor (`grep -cF <anchor> <file>` → 1) | Traced failure |
|---|---|---|---|
| 1 | **Hoisted out of the synthetic guard** — move the cost accumulation outside `if (event.model !== SYNTHETIC) {` so synthetic events are priced too | `grep -cF 'if (event.model !== SYNTHETIC) {' server/src/stats/aggregator.ts` → **1** | the `<synthetic>` case fails: `cost.input` becomes 999 × the rate instead of 0. This is why that test needs non-zero synthetic tokens |
| 2 | **Transposed same-typed args** — swap `cacheWrite5m` and `cacheWrite1h` in the accumulation | the two `cacheWrite` accumulation lines | "Single priced event" fails on `cacheWrite5m` (100000 where 62500 is expected). Both are numbers multiplied by numbers; nothing else notices |
| 3 | **Dropped dimension** — pass a constant `'standard'` instead of `event.speed` to the lookup | the `rateFor(` call site | the "Speed is routed" case fails — the fast event prices at the standard rate |
| 4 | **Dropped dimension** — pass a constant day string instead of `event.day` | the same call site | the "Day is routed" case fails, and the Sonnet 5 boundary would silently stop working in production |
| 5 | **Inverted predicate** — treat `rateFor` returning `undefined` as "skip entirely" rather than "count unpriced" | the `undefined` branch | the "Unpriced model" case fails on `unpricedTokens` (0 where the token sum is expected) and on the missing `modelCost` entry |
| 6 | **Widened basis** — use `usage.cacheCreation` instead of `cacheCreation1h + cacheCreation5m` in `uncachedCacheCost` | the `uncachedCacheCost` accumulation | passes on consistent data — **so also assert it against an event whose splits sum ABOVE the flat field** (1h 8, 5m 9, flat 10): the mutation yields 10× rate where 17× rate is expected. Without that case the mutation is undetectable; add the case |
| 7 | **Missing sort** — omit `modelCost` from `sortCounts` | `grep -cF 'function sortCounts(counts: UsageCounts): UsageCounts {' server/src/stats/aggregator.ts` → **1** | the "Sort order" case fails when models are inserted in non-alphabetical order |

**Verification**
```
npm test --prefix server -- run src/stats/aggregator.test.ts
```
Expect `Test Files  1 passed (1)`, with every pre-existing test in the file still passing alongside the new ones.

**Success criteria**
- Cost accumulates per cell and per model, and `cost` equals the sum over `modelCost` for every cell — including a cell holding two different models.
- `<synthetic>` contributes to neither, proven with non-zero synthetic tokens, not with the fixture's all-zero line.
- An unpriced model contributes `0` money and its full token count to `unpricedTokens`, and still appears in `modelCost` — the case that keeps a future model release visible instead of silently vanishing.
- Both `event.day` and `event.speed` demonstrably reach the lookup, each proven by a test that fails if the argument is replaced by a constant.
- `uncachedCacheCost` is based on the split, not the flat total, proven on an event where the two disagree.
- `emptyCounts` initializes `cost` to an all-zero `CostBreakdown` and `modelCost` to `{}`; `sortCounts` sorts `modelCost`.
- **F-1:** `emptyTokenTotals()` initialises `cacheCreation1h`/`cacheCreation5m` and `addUsage()` sums them, while `total` keeps its existing four-term formula — the case that would otherwise double-count cache creation in every token total on the dashboard.
- `aggregate(files, at)` — two arguments — still compiles and prices correctly via the default.
- Every pre-existing assertion in `aggregator.test.ts` still passes unmodified.

**Controller review checklist**
- [ ] Re-run the verification command; confirm every pre-existing test in the file is still present and passing.
- [ ] Apply all seven mutations; confirm each fails its named assertion; revert each. Confirm mutation 6's extra test case was actually added — without it the mutation survives.
- [ ] Confirm the cost accumulation is lexically inside the `event.model !== SYNTHETIC` block, by reading the diff, not by trusting the test.
- [ ] Confirm `pipeline.ts` is unchanged (`git diff --stat -- server/src/stats/pipeline.ts` is empty).
- [ ] Confirm `modelCost` was added to `sortCounts`.

**Commit (controller runs after review)**
```
git add -- server/src/stats/aggregator.ts server/src/stats/aggregator.test.ts
git commit -m "Price every token event per model and day in the aggregator"
```

**Progress notes:** —
**Commit hash:** —

---

### ⬜ Task 5 — Merge cost cells in `filterStats`

**Phase:** 2 · **Wave:** 1
**Provides:** none · **Consumes:** C-3, C-4 (owner Task 1)
**Peer map:** C-3 / C-4 → Task 1
**Assumes decision:** none

**Files**
- Modify `web/src/api/filterStats.ts`
- Modify `web/src/api/filterStats.test.ts`

> **Precedence:** if anything below contradicts the success criteria, the criteria win — implement what is correct and report the deviation.

**Why this task exists.** `mergeUsageCounts` at `filterStats.ts:47` is the single merge point for date-range filtering, project filtering **and** weekly/monthly bucketing — `filterStats:130` and `usageSeries:172` both call it. If cost is not merged there, every filtered or bucketed view silently reports zero spend while the unfiltered totals look right.

**Context.** This file is the frontend's whole aggregation layer, and it is deliberately dumb: it adds cells, never divides and never multiplies a rate. Net cache saving is derived at *render* time from `uncachedCacheCost` (Task 6's job), not here. Follow the existing shape exactly — `addTokenTotals` / `addThroughputCounts` at lines 23 and 37 are the pattern; add a `zeroCostBreakdown` / `addCostBreakdown` pair beside them, initialize both new fields in the `result` literal at line 48, and add them to the per-cell loop.

**Contract.** No new exported surface. Internally:

```ts
function zeroCostBreakdown(): CostBreakdown;   // every field 0
function addCostBreakdown(a: CostBreakdown, b: CostBreakdown): CostBreakdown;  // field-by-field sum
```

`mergeUsageCounts` gains `result.cost = addCostBreakdown(result.cost, cell.cost)` and a `modelCost` loop mirroring the existing `models` loop at line 82.

**Finding F-1 applies to this task.** `TokenTotals extends TokenUsage`, so it now carries `cacheCreation1h` and
`cacheCreation5m`. **`zeroTokenTotals()`** (`filterStats.ts:19`) must initialise both to `0` and **`addTokenTotals()`**
(`filterStats.ts:23`) must sum both, or every filtered or bucketed view silently drops the split while the unfiltered
totals look correct. `total` keeps its existing summed-field behaviour — do not add the split into it.

**Tests** (add to `filterStats.test.ts`). Build `UsageCounts` literals directly — no fixture needed, no peer's code needed. One per case:

| Case | Assertion |
|---|---|
| Two cells merge | every `CostBreakdown` field of the result is the sum of the two inputs', asserted with `toStrictEqual` on the whole object |
| `unpricedTokens` merges | it is summed like every other field, not dropped or overwritten |
| `modelCost` merges per key | two cells sharing a model sum that model's breakdown; a model present in only one cell survives with its own values |
| Date filter excludes cost | a cell outside `[from, to]` contributes nothing to `totals.cost` |
| Project filter excludes cost | a cell whose project is not selected contributes nothing |
| Filter-everything identity | `filterStats(stats, {})` produces `totals.cost` equal to the sum of every cell's cost |
| `usageSeries` weekly | two days in one ISO week produce one bucket whose `cost.total` is their sum — the associativity the whole design rests on |
| `usageSeries` monthly | same across a month boundary: two days in different months stay in different buckets |
| Empty selection | filtering to a range with no days yields an all-zero `cost` and an empty `modelCost`, not `undefined` |
| F-1: split merges | two cells whose `tokens` carry different `cacheCreation1h`/`cacheCreation5m` merge to the sum of each, and `tokens.total` is unchanged by the split |

**Mutations to reject.** Apply each, confirm the named assertion fails, revert, report the output.

| # | Mutation | Anchor (`grep -cF <anchor> <file>` → 1) | Traced failure |
|---|---|---|---|
| 1 | **Dropped field** — omit `unpricedTokens` from `addCostBreakdown` (leave it at `a.unpricedTokens`) | the `unpricedTokens:` line in `addCostBreakdown` | the "`unpricedTokens` merges" case fails. This is the field most likely to be forgotten, because it is the only non-money one |
| 2 | **Hardcoded return** — make `addCostBreakdown` return `a` unchanged | the function body | "Two cells merge" and the weekly-bucket case both fail |
| 3 | **Overwrite instead of add** — in the `modelCost` loop, assign `cell.modelCost[model]` instead of summing with the accumulator | the assignment inside the `modelCost` loop | "`modelCost` merges per key" fails on the shared model — last cell wins instead of the sum |
| 4 | **Transposed same-typed args** — swap `cacheWrite5m` and `cacheWrite1h` in `addCostBreakdown` | the two lines | "Two cells merge" fails on both fields when the inputs differ; **make sure the test inputs give those two fields different values**, or the mutation survives |
| 5 | **Dropped merge** — remove the `result.cost = addCostBreakdown(...)` line entirely, leaving only `modelCost` | `grep -cF 'result.throughput = addThroughputCounts(result.throughput, cell.throughput);' web/src/api/filterStats.ts` → **1** (the adjacent line, as a locator) | "Two cells merge" fails on `cost` while `modelCost` still looks right — the exact split-brain this contract's `cost === sum(modelCost)` invariant exists to prevent |

**Verification**
```
npm test --prefix web -- run src/api/filterStats.test.ts
```
Expect `Test Files  1 passed (1)`, with every pre-existing test in the file still passing alongside the new ones.

**Success criteria**
- Every `CostBreakdown` field merges by addition, `unpricedTokens` included — the field a field-by-field implementation is most likely to skip.
- `modelCost` merges per model key, summing shared keys rather than overwriting, and preserving a key present in only one cell.
- A filtered-then-summed total equals the unfiltered total when the filter selects everything; an empty selection yields an all-zero breakdown rather than `undefined`.
- A weekly bucket's `cost.total` equals the sum of its days' — proven at both a week and a month boundary.
- Every pre-existing assertion in `filterStats.test.ts` still passes unmodified.
- Nothing in this file multiplies by a rate or divides — it only adds.
- **F-1:** `zeroTokenTotals()` and `addTokenTotals()` carry `cacheCreation1h`/`cacheCreation5m`, so a filtered or weekly view reports the same split as the unfiltered totals — the case where a dropped field is invisible because the headline number still looks right.

**Controller review checklist**
- [ ] Re-run the verification command; confirm every pre-existing test in the file is still present and passing.
- [ ] Apply all five mutations; confirm each fails its named assertion; revert each. For mutation 4, first confirm the test's two input cells give `cacheWrite5m` and `cacheWrite1h` different values.
- [ ] Confirm no rate constant or multiplication appears in the diff (`git diff web/src/api/filterStats.ts | grep -E "\*|rate"` shows only additions of `+` sums).
- [ ] Confirm both `filterStats` and `usageSeries` are exercised by the new tests, not just `mergeUsageCounts` indirectly.

**Commit (controller runs after review)**
```
git add -- web/src/api/filterStats.ts web/src/api/filterStats.test.ts
git commit -m "Merge per-model cost cells when filtering and bucketing"
```

**Progress notes:** —
**Commit hash:** —

---

### ⬜ Task 6 — Cost page and navigation

**Phase:** 3 · **Wave:** 1
**Provides:** none · **Consumes:** C-3, C-4 (owner Task 1), C-7 (owner Task 1)
**Peer map:** C-3 / C-4 / C-7 → Task 1
**Assumes decision:** none

**Files**
- Create `web/src/pages/Cost.tsx`
- Create `web/src/pages/Cost.test.tsx`
- Modify `web/src/App.tsx`
- Modify `web/src/App.test.tsx`

> **Precedence:** if anything below contradicts the success criteria, the criteria win — implement what is correct and report the deviation.

**Why this task exists.** This is the deliverable — the two questions the plan set out to answer. It owns `App.tsx` as well as the page so that no other Wave 1 task needs to touch the nav.

**Context.** Page components in `web/src/pages/` are **pure functions of `{ stats, series, granularity }`** and hold no fetching logic — copy the `PageProps` interface from `web/src/pages/Efficiency.tsx:21`. Use the shared chart chrome from `web/src/components/charts.tsx` (`ChartCard`, `StatCard`, `AXIS_TICK`, `AXIS_LINE`, `GRID_PROPS`, `TOOLTIP_PROPS`, `CHART_COLORS`, `truncateTick`, `formatTooltipNumber`) rather than restyling; `Efficiency.tsx` is the closest model to follow. The palette has exactly five hues assigned by series identity in order and never cycled — a sixth series must collapse into "Other" or split into small multiples.

**Pages must never re-bucket a series.** `usageSeries` already grouped by `granularity`; plot the buckets you are handed and read `granularity` only for chart copy (`GRANULARITY_NOUN` from `web/src/api/granularity.ts`).

Money arrives as integer **nano-USD**. Add a `formatUsd` helper to `web/src/lib/format.ts`… **no** — `format.ts` is not in this task's `Files:` list and must not be edited. Keep the USD formatter local to `Cost.tsx` and export it so the test can assert it directly.

The nav symbols are `PAGES` at `App.tsx:36` and **`PAGE_SUBTITLES`** at `App.tsx:43` — not `PAGE_DESCRIPTIONS`, which the plan named and which does not exist (Precondition 2).

**Contract.** `Cost.tsx` exports:

```ts
export interface PageProps { stats: AggregateStats; series: SeriesPoint[]; granularity: Granularity }
export function Cost(props: PageProps): JSX.Element;

/** Integer nano-USD to a display string. Exported for direct test assertions. */
export function formatUsd(nanoUsd: number): string;

/** Derived, never stored: uncachedCacheCost - cacheWrite5m - cacheWrite1h - cacheRead. */
export function netCacheSaving(cost: CostBreakdown): number;
```

The root element carries `data-testid="page-cost"`, matching the convention at `Efficiency.tsx:187`.

Content, all derived from `stats.totals.cost`, `stats.totals.modelCost`, `stats.totals.models` and `series`:

- Headline stat: total USD, with the footnote **"at API list price"** (Decision 6 in the plan).
- Spend trend per bucket from `series`, titled with `GRANULARITY_NOUN[granularity]`.
- Per model: USD split into input / output / cache-write / cache-read (cache-write = `cacheWrite5m + cacheWrite1h`).
- Per model: cost share vs token share, and cost per 1M tokens.
- Per model: cache economics — cache-write spend, cache-read spend, and `netCacheSaving`.
- Per model: USD per 1K output tokens, and output share of that model's tokens.
- **No unpriced-token surface** (Decision 8) — `unpricedTokens` is not rendered.

`App.tsx`: add `{ name: 'Cost', Component: Cost }` to `PAGES` and a matching `PAGE_SUBTITLES` entry. Place it after `Overview` — cost is a headline question, not a footnote.

**Tests.** `Cost.test.tsx` renders from the shared fixture (`web/src/api/__fixtures__/aggregate-stats.json`), which after Task 1 carries real cost data. One per case:

| Case | Assertion |
|---|---|
| Headline total | renders the fixture's `totals.cost.total` of 68,326,250 nUSD formatted as USD |
| List-price footnote | the string "at API list price" is present |
| Per-model split | the Opus row shows input, output, cache-write (12,943,750 + 40,030,000 = 52,973,750) and cache-read (10,573,500) |
| Net cache saving | the Opus figure is `136,105,000 − 40,030,000 − 12,943,750 − 10,573,500` = **72,557,750** |
| Zero-cache model | the Sonnet row's net saving is `0` and renders without crashing — the divide-by-nothing case |
| Cost per 1M tokens | Opus: 68,202,250 nUSD over 27,420 tokens; the rendered value matches the computed one |
| Output yield | Opus USD per 1K output tokens uses `modelCost.output` (4,575,000) over 183 output tokens |
| `formatUsd` unit test | called directly: a value under a cent, a whole-dollar value, and `0` each render sensibly |
| `netCacheSaving` unit test | called directly on a hand-built `CostBreakdown` whose writes exceed its reads, returning a **negative** number — the real and useful signal that caching is losing money on that model |
| No unpriced surface | the string "unpriced" does not appear |
| Empty selection | rendering with an all-zero `totals.cost` and empty `modelCost` shows no NaN and no crash |

`App.test.tsx`: extend the existing nav loop at `App.test.tsx:44` to include `'Cost'`, and add a case that clicking `Cost` mounts `page-cost` and unmounts `page-overview` — mirroring the `Efficiency` case at `App.test.tsx:52`.

**Mutations to reject.** Apply each, confirm the named assertion fails, revert, report the output.

| # | Mutation | Anchor | Traced failure |
|---|---|---|---|
| 1 | **Inverted predicate** — flip the sign in `netCacheSaving` (`uncached − writes − reads` → `writes + reads − uncached`) | the `netCacheSaving` return expression | the Opus net-saving case fails (−72,557,750 where +72,557,750 is expected), and the negative-saving unit test flips sign |
| 2 | **Dropped term** — omit `cacheRead` from `netCacheSaving` | same anchor | the Opus case fails (83,131,250 where 72,557,750 is expected) |
| 3 | **Dropped term** — render cache-write as `cacheWrite1h` only, omitting `cacheWrite5m` | the cache-write sum in the per-model row | the "Per-model split" case fails (40,030,000 where 52,973,750 is expected). This is the mutation that models forgetting the TTL split ever existed |
| 4 | **Transposed same-typed args** — swap `input` and `output` in the per-model split | the two row fields | the split case fails (80,000 vs 4,575,000 are far apart, so the assertion catches it) |
| 5 | **Hardcoded return** — make `formatUsd` return a constant | the function body | the `formatUsd` unit test fails on at least two of its three inputs |
| 6 | **Order** — reverse the per-model row ordering | the sort in the model list construction | add an assertion that the rows appear in a defined order (alphabetical by model, matching `stats.models`); without it this mutation survives, since the fixture has only two models and both would still be present |
| 7 | **Missing nav entry** — remove the `Cost` entry from `PAGES` while leaving `PAGE_SUBTITLES` | `grep -cF "const PAGES = [" web/src/App.tsx` → **1** | the `App.test.tsx` nav-loop case fails on the missing button |

**Verification**
```
npm test --prefix web -- run src/pages/Cost.test.tsx
npm test --prefix web -- run src/App.test.tsx
```
Expect both `Test Files  1 passed (1)`, with every pre-existing test in `App.test.tsx` still passing alongside the new ones.

**Success criteria**
- The page renders from the shared fixture with the exact figures above, including the **zero-cache Sonnet row**, which must not produce `NaN` or a division error — the case a happy-path implementation gets wrong.
- `netCacheSaving` returns a negative number when writes exceed reads, and the page renders that without swallowing the sign — a model where caching is losing money must look different from one where it is breaking even.
- Every per-model figure is derived from `stats.totals.modelCost`, never re-derived from `stats.days`.
- The page reads `granularity` only for chart copy and plots the buckets `series` hands it.
- No more than five chart series share one chart; a sixth would collapse into "Other".
- Clicking `Cost` mounts `page-cost` and unmounts the previous page; the nav lists all five pages.
- `web/src/lib/format.ts` is unmodified.

**Controller review checklist**
- [ ] Re-run both verification commands.
- [ ] Apply all seven mutations; confirm each fails its named assertion; revert each. Confirm mutation 6's ordering assertion was actually added.
- [ ] Confirm `git diff --stat -- web/src/lib/format.ts web/src/components/charts.tsx` is empty — neither was in scope.
- [ ] Confirm the page does not read `stats.days` (`grep -n "stats.days\|\.days\[" web/src/pages/Cost.tsx` → no matches).
- [ ] Confirm `PAGE_SUBTITLES` gained an entry and the symbol name was not "corrected" to `PAGE_DESCRIPTIONS`.
- [ ] Render check: no `NaN`, `Infinity`, or `$0.00` where a real figure is expected.

**Commit (controller runs after review)**
```
git add -- web/src/pages/Cost.tsx web/src/pages/Cost.test.tsx web/src/App.tsx web/src/App.test.tsx
git commit -m "Add a Cost page showing per-model spend, cache economics and output yield"
```

**Progress notes:** —
**Commit hash:** —

---

## Wave 2

### ⬜ Task 7 — Bind the contracts to the real implementations

**Phase:** 2, 3 · **Wave:** 2
**Provides:** none · **Consumes:** C-1, C-2, C-3, C-4 (owner Task 1), C-5 (owner Task 2), C-6 (owner Task 4), C-7 (owner Task 1)
**Peer map:** C-1 / C-2 / C-3 / C-4 / C-7 → Task 1 · C-5 → Task 2 · C-6 → Task 4
**Same agent as Task 4** — it re-enters the aggregator's semantics, and reusing the author avoids a fresh agent re-deriving them.
**Assumes decision:** none

**Files**
- Create `server/src/stats/cost-integration.test.ts`
- Modify `server/src/stats/stats.module.test.ts`

**Why this is Wave 2.** Every Wave 1 consumer tests a fake: Task 4 prices against a stand-in rate table, Tasks 5 and 6 read hand-built cells and a hand-written fixture. Rename the real `rateFor` and **nothing in Wave 1 fails** — the drift would ship green. This task is the rename probe made real: it drives the actual `rateFor` through the actual `aggregate`, at the entry point a real caller uses, so a signature or semantics drift on either side breaks a test. No stand-in can prove that, because a stand-in is exactly what it exists to replace.

> **Precedence:** if anything below contradicts the success criteria, the criteria win — implement what is correct and report the deviation.

**Context.** `server/test/stats.integration.test.ts:75` already binds the whole pipeline end-to-end and will be green by the time this task runs (it deep-equals the fixture through an HTTP request). This task adds the two things it cannot show: that the **rate table itself** is correct at the day and speed boundaries, and that the pipeline's real output reconciles against independently computed arithmetic rather than against a JSON file somebody hand-wrote.

Bind at the entry point, not at a helper: go in through `parseTranscript` on raw JSONL text, then `aggregate` with **no third argument** so the real default `rateFor` is exercised. Calling `rateFor` directly would prove the table and prove nothing about whether the aggregator reaches it.

**Contract.** No new production surface. New assertions only.

**Tests** (`cost-integration.test.ts`) — one per case:

| Case | Assertion |
|---|---|
| Real pipeline, real rates | build a two-line JSONL string with a `claude-opus-4-8` assistant line carrying input 16, output 183, `cache_read_input_tokens` 21147, `cache_creation_input_tokens` 6074 and `cache_creation` `{1h: 4003, 5m: 2071}`, dated inside `2026-07-09`; run `parseTranscript` then `aggregate(files, AT)` with **two arguments**; assert `totals.cost` `toStrictEqual` the Opus object from Task 1 (`total: 68202250`, `uncachedCacheCost: 136105000`) |
| Sonnet boundary, real rates | the same tokens on `claude-sonnet-5`, once dated `2026-08-31` and once `2026-09-01`, produce **different** `totals.cost.total`, and each equals the value computed from the published rate for that side |
| Fast speed, real rates | an Opus 5 line with `usage.speed: "fast"` costs exactly double the same line at `"standard"` |
| Absent nested split, real rates | a line with a flat `cache_creation_input_tokens` and no nested object prices its whole cache-write at the 5-minute rate — the C-1 fallback proven through the real stack, not just the parser unit |
| Unknown model, real rates | a line on `claude-nonexistent-9` yields `cost.total` 0 and `unpricedTokens` equal to its token sum, with a `modelCost` entry present |
| Cache version | `fileCacheKey` for a fixed file ends in `:v3` |

`stats.module.test.ts`: extend the existing GET assertion at line 71 to also assert `res.body.totals.cost.total` is `68326250` and `res.body.totals.modelCost` has exactly the keys `['claude-opus-4-8', 'claude-sonnet-5']` — proving the cost fields survive serialization through the HTTP layer, which no in-process test covers.

**Mutations to reject.** Apply each, confirm the named assertion fails, revert, report the output.

| # | Mutation | Anchor (`grep -cF <anchor> <file>` → 1) | Traced failure |
|---|---|---|---|
| 1 | **Rename probe** — rename the exported `rateFor` in `rates.ts` and update only its own test | `grep -cF 'export function rateFor' server/src/stats/rates.ts` → confirm **1** after Task 2 lands | `cost-integration.test.ts` fails to import / the aggregator default breaks. If this does **not** fail, the binding is fake and must be reported |
| 2 | **Widened bound** — in `rates.ts`, change the Sonnet 5 effective date from `2026-09-01` to `2026-10-01` | the date literal in the rate table | the "Sonnet boundary" case fails on the `2026-09-01` side |
| 3 | **Hardcoded return** — make `aggregate`'s default third argument a function returning `undefined` | the default parameter expression in `aggregator.ts` | every real-rate case fails: `cost.total` becomes 0 and `unpricedTokens` becomes the token sum |
| 4 | **Dropped serialization** — remove `modelCost` from the aggregate's returned `totals` | the `totals:` construction in `aggregate` | the `stats.module.test.ts` key assertion fails, and `stats.integration.test.ts:75` fails too |
| 5 | **Transposed same-typed args** — swap the `2026-08-31` and `2026-09-01` day strings in the boundary test's own fixtures | the two date literals in the test | the test must still fail — if swapping the *inputs* leaves it green, the assertion is not actually distinguishing the two sides and must be tightened |

**Verification**
```
npm test --prefix server -- run src/stats/cost-integration.test.ts
npm test --prefix server -- run src/stats/stats.module.test.ts
```
Expect both `Test Files  1 passed (1)`.

**Success criteria**
- The real `rateFor` is reached through the real `aggregate` with no injected stand-in — proven by mutation 1 actually failing.
- Both sides of the 2026-09-01 Sonnet 5 boundary are asserted with independently computed figures, so a table edit that moves the date is caught.
- The C-1 absent-nested-split fallback is proven through the full stack, not only in the parser unit test.
- An unknown model is proven to produce zero cost and non-zero `unpricedTokens` through the real stack — the guard that keeps a future model release visible.
- Cost fields survive HTTP serialization.
- `server/test/stats.integration.test.ts` is green and **unmodified**.

**Controller review checklist**
- [ ] Re-run both verification commands.
- [ ] Apply all five mutations; confirm each fails; revert each. **Mutation 1 is the one that matters** — if the rename does not break this test, the whole Wave 2 justification is void and the task must be reworked, not accepted.
- [ ] Confirm `cost-integration.test.ts` calls `aggregate` with **two** arguments (`grep -n "aggregate(" server/src/stats/cost-integration.test.ts` shows no third argument).
- [ ] Confirm `server/test/stats.integration.test.ts` has an empty diff.
- [ ] Confirm the expected figures in the test were computed in the test from rates, or are the exact literals from Task 1 — not copied from the implementation's output.

**Commit (controller runs after review)**
```
git add -- server/src/stats/cost-integration.test.ts server/src/stats/stats.module.test.ts
git commit -m "Bind the cost contracts to the real rate table and aggregator"
```

**Progress notes:** —
**Commit hash:** —

---

## Final Gate

Run once, after every task is committed.

1. **Full suites, bypassing turbo's cross-worktree cache** (Precondition 6):
   ```
   npm test --prefix server -- run
   npm test --prefix web -- run
   ```
   Compare against baseline: server was 8 files / 98 tests, web 11 files / 131 tests, both green. Every baseline test must still pass; the new files add to those counts.
2. **Type check** — `npm run typecheck`. This is the first point in the run where it is expected to pass (see Execution Model).
3. **Build** — `npm run build`.
4. **`server/test/stats.integration.test.ts` must be green**, specifically the `deep-equals the hand-computed aggregate` case at line 75. If it fails, the fixture's cost values and the pipeline's real output disagree — that is the single most informative failure this run can produce, and it means either Task 1's arithmetic or Task 4's accumulation is wrong. Do not "fix" it by editing the fixture to match the output.
5. **Real-data smoke** — start the server against the real transcripts root and `POST /api/stats/refresh`, then confirm on the Cost page:
   - non-zero USD for `claude-opus-5`, `claude-opus-4-8`, `claude-sonnet-5` and `claude-fable-5`;
   - `totals.cost.unpricedTokens` is `0` (Precondition 10);
   - `totals.cost.total` is in the neighbourhood of the plan's measured **$3,067** for transcripts touched since 2026-07-01 — a figure an order of magnitude out means a rate or a unit is wrong;
   - cache-read is the largest single component of Opus 5 spend (~61% in the plan's measurement);
   - the page reads correctly at daily, weekly and monthly granularity.
6. **Amendment propagation** — for every amendment recorded in the registry, confirm each listed consumer actually reflects it.
7. **Review team over the whole run diff**, two reviewers:
   - *Cross-task integration* — do the two independent contract declarations still agree, and does `cost.total === sum(modelCost)` hold everywhere in the real output?
   - *Unnamed-mutation search* — conformance and the named mutations were gated per task; hunt for what nobody named. Start with the five classes on the cost path: an ordering assumption in the model lists, a dropped filter in the day/speed lookup, a swapped rate field, a widened effective-date bound, a hardcoded zero in a `CostBreakdown` field.
8. **Plan Success Criteria** — tick each item in `docs/plans/2026-08-07-model-cost-and-efficiency.md` with the evidence that satisfies it.

## Wave Summaries

**Wave 0:** —
**Wave 1:** —
**Wave 2:** —

## Carry-forward Notes

—

## Repo-memory Candidates

_Durable conventions only, and only after verification. Ephemeral run notes belong in the progress fields above._

- Candidate: turbo's cache is shared across git worktrees, so a root `npm test` in one worktree can report a `FULL TURBO` cache hit replaying another worktree's logs. Verify per-package (`npm test --prefix <pkg> -- run`) when a run's result must be trusted. — **unverified as a general rule; observed once, 2026-08-07.**

## Final Summary

—
