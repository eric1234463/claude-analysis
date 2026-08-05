---
type: tasks
title: "Token Output Throughput Metric — Task Breakdown"
description: "Contract-first single-wave breakdown for deriving tokens/second from transcript timestamps and surfacing it on the Efficiency page."
status: in-progress
owner: "eric1234463@gmail.com"
ticket: "DASH-0000"
created: "2026-08-05"
plan: "docs/plans/2026-08-05-token-throughput-metric.md"
wiki: false
---

# Token Output Throughput Metric — Task Breakdown

**Branch:** feature/DASH-0000-token-throughput-metric
**Source plan:** `docs/plans/2026-08-05-token-throughput-metric.md`

**Baseline captured before dispatch**
- Measured: current working tree, clean at ced3eb6
- Command: `npm test`
- Exit code: `0` — the suite was **GREEN** at baseline; any failure during this run is a regression
- Full log: `/var/folders/1c/sm4q4wb55597_fdm_b4tqjdr0000gn/T//baseline-ced3eb6.log`

## Source Plan Summary

Claude Code transcripts record no response duration or TTFT, so output throughput (tokens/second) is *derived*: each API request is bracketed by the timestamp of the last eligible transcript line written before its first usage-bearing line and the timestamp of its own last usage-bearing line. The parser computes that bracket in its existing single forward pass and hangs `durationMs` on the token event it already emits; the aggregator rolls output tokens and duration into four-number `ThroughputCounts` cells that merge by addition; the frontend divides after merging, so a week's rate is volume-weighted. Requests that don't qualify (no anchor, non-positive interval, output below a floor, `<synthetic>` model) are *counted as excluded*, never silently dropped or floored. The change also versions the per-file cache key — transcripts are append-only, so without it stale entries would show zero throughput for nearly all history forever.

## Execution Model

One parallel wave after a small Wave 0. Agents implement and test against the Contract Registry below, standing in fakes for anything they don't own; they run **no git commands**. The controller reviews each returning task's diff, re-runs its verification, re-proves its named mutations, stages its exact paths, and commits. Contracts are frozen at dispatch; only the controller amends one (see the amendment rule in the registry). There is no mid-run review gate — one Final Gate at the end runs the full suite, type check, and build against baseline, plus the real-data verification in [Final Gate additions](#final-gate-additions).

> ⚠️ **The tree intentionally fails `npm run typecheck` between the Wave 0 commit and the last Wave 1 commit.** Wave 0 adds *required* fields to `UsageCounts` in both packages; every existing full-literal constructor (aggregator, filterStats, page tests) is type-broken until its owning Wave 1 task updates it. Vitest transpiles without type checking, so all file-scoped test runs stay green throughout. Do not run the type check per task — it is the Final Gate's check by design.
>
> ⚠️ **Likewise, `server/test/stats.integration.test.ts` ("deep-equals the hand-computed aggregate", line 75) is red between the Wave 0 commit and the moment BOTH Task 2 and Task 3 are committed** — the fixture gains throughput fields at Wave 0, and the real pipeline only produces them once the parser and aggregator land. That file needs no edit; it goes green by itself. The Final Gate's suite-vs-baseline comparison is where it must be green again.

## Preconditions

All verified 2026-08-05 on branch `feature/DASH-0000-token-throughput-metric` (`git rev-parse --abbrev-ref HEAD`).

| Check | Result |
|---|---|
| Test runner invocation | `npm test --prefix server -- run <files…>` and `npm test --prefix web -- run <file>` both accepted, including two file args to one run (executed, all pass). Root `npm test` fans out via turbo — never used per task. Server tests run under `TZ=UTC` (`server/vitest.config.mts`). |
| `fileCacheKey` format | `` `${path}:${mtimeMs}:${size}:${timeZone}` ``, no version segment (`server/src/stats/file-cache.ts:5-10`); exact string pinned by test (`file-cache.test.ts:29-30`). `pipeline.ts` invalidates on nothing else (read in full). |
| `sortCounts` | Spreads `...counts` then sorts each record explicitly (`server/src/stats/aggregator.ts:105-114`) — new records pass through **unsorted with no type error** unless added. Task 3 carries a regression lock for this. |
| `mergeUsageCounts` | Module-private, not exported (`web/src/api/filterStats.ts:34`); tested only through the exported `filterStats()`/`usageSeries()`. Task 4's tests go through those exports. |
| Efficiency page conventions | Named exports `Efficiency, cacheHitTrendData, toolErrorTrendData`; props `{ stats, series, granularity }` (`web/src/pages/Efficiency.tsx:22-26`); tiles read via `data-testid="metric-*"`; chart titles follow `"<name> per ${GRANULARITY_NOUN[granularity]}"` (`Efficiency.test.tsx:87`); shared chrome from `@/components/charts` (do not restyle). |
| Fixture seam — corrected at dispatch (controller finding, 2026-08-05) | The breakdown's first draft claimed no repo test wires real parser output into the real aggregator; that was **false** — the author audited `server/src/stats/` and missed `server/test/`. `server/test/stats.integration.test.ts` runs the **real** scanner→parser→aggregator pipeline over `server/test/fixtures/projects` and **deep-equals the full aggregate against the shared web fixture** (`stats.integration.test.ts:75-80`). Consequences, all applied below: C-4's values are not invented — they are the exact output of the derivation over those fixture transcripts (computed by script, verified against a hand-trace: 1 eligible request of 8, headline 2.5 tok/s); C-2/C-3/C-4 have a **real** Real binding; the integration test itself needs **no edit** but is transiently red mid-run (see Execution Model warning). `stats.module.test.ts` separately serves the fixture through a mocked pipeline (`stats.module.test.ts:70`) and asserts only pre-existing numbers — no edit. `server/test/app.module.test.ts` was also audited: no `UsageCounts` construction, no edit. |
| Commit convention | Imperative sentence, no ticket prefix (`git log --oneline -5`). |
| Docs linter | None (`CLAUDE.md`: "There is no lint script"). Frontmatter validated as parseable YAML instead. |
| Data distributions (measured 2026-08-05, 40 main + 120 sidechain most-recent transcripts) | Eligibility at a 100-output-token floor keeps **99.0% of main requests** (99.9% of output tokens) but only **19.3% of sidechain requests** (94.3% of tokens) — exclusion is *rare* on main and *the majority case* on sidechains, so fixtures must exercise both branches. `requestId` absent on 8/14,424 usage-bearing lines (0.06%) — the `?? uuid` fallback is real but negligible. 15.7% of lines carry no timestamp (7 bookkeeping types); 0 usage-bearing lines lack one. 20.5% of multi-line requests have a foreign line interleaved. Every negative interval in the sample traced to `queue-operation`/`file-history-delta`/`pr-link` anchors; excluding those three eliminated all of them. |

If the branch check or either runner invocation fails, stop and resolve before dispatching anything.

## Contract Registry

> A contract is frozen once the wave dispatches. An agent that finds its contract wrong or insufficient reports it to the controller and waits; the controller decides, records an amendment against the contract ID, and broadcasts it to every consumer listed. Agents may message each other freely to *clarify* semantics inside a contract, and may not agree a change to one between themselves.

### C-1 — `ThroughputCounts` and the five new `UsageCounts` fields

Declared **character-identically** in `server/src/stats/contracts.ts` and `web/src/api/types.ts` (the two files are hand-kept in sync by convention, never imported across the boundary — `CLAUDE.md`, Cross-package contract):

```ts
/** Four mergeable sums; the rate is derived at render time as outputTokens / (durationMs / 1000).
 *  outputTokens / durationMs / requests count ELIGIBLE requests only (see the eligibility rule
 *  on UsageCounts.throughput); excludedRequests counts token events that did not qualify. */
export interface ThroughputCounts {
  outputTokens: number;
  durationMs: number;
  requests: number;
  excludedRequests: number;
}
```

`UsageCounts` gains these required fields (placed after `skillTokens`, before `agents`):

```ts
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
```

`AGGREGATE_STATS_KEYS` is **unchanged** — these nest inside `UsageCounts`, not `AggregateStats` (`contracts.ts:90-93` pins top-level keys only; verified against `contracts.test.ts:10-15` and `web/src/api/types.test.ts:13-17`).

- **Owner:** Task 1 (Wave 0). **Consumers:** Tasks 3, 4, 5.
- **Stand-in:** none — Wave 0 is committed before Wave 1 dispatches; consumers import the real declarations.
- **Real binding:** Task 3's aggregator tests construct and assert real `ThroughputCounts` cells.

### C-2 — `durationMs` on the token `UsageEvent`

The token variant in `server/src/stats/contracts.ts` (currently `contracts.ts:29-33`) gains one optional field:

```ts
      /** Wall-clock ms from the timestamp of the last ELIGIBLE line preceding this request's
       *  first usage-bearing line to the timestamp of the request's last usage-bearing line.
       *  Eligible = carries a string `timestamp` AND its `type` is not one of
       *  'queue-operation' | 'file-history-delta' | 'pr-link' (bookkeeping lines written out of
       *  chronological order). Present ONLY when the bracket resolved to a strictly positive
       *  interval; absent for the first request in a file and for non-positive intervals. */
      durationMs?: number
```

Semantics the producer must honor: the request's start anchor is **frozen at first sight** of its dedupe key and never re-read; the anchor candidate a line offers is read **before** that line itself advances the candidate (otherwise every request anchors to itself and all durations collapse); requests are grouped by the existing dedupe key (`requestId ?? uuid`) across the whole file, never by contiguous run — 20.5% of multi-line requests are interleaved with foreign lines. Timestamp-less lines (15.7% of all lines) neither become anchors nor clear the candidate.

- **Owner:** Task 2 (parser implements the semantics; Task 1 materializes the declaration verbatim in Wave 0). **Consumers:** Task 3.
- **Stand-in for Task 3:** construct token `UsageEvent` literals directly with/without `durationMs` — the existing `aggregator.test.ts` pattern (it already builds `ParsedFile.events` by hand and never calls the parser). Fake behaviour: `durationMs` absent means "no bracket resolved"; when present it is a positive integer; no other values occur.
- **Real binding:** `server/test/stats.integration.test.ts:75-80` — the deep-equal of the real pipeline's output over `server/test/fixtures/projects` against the shared fixture drives real parser durations through the real aggregator into the exact C-4 values. It needs no edit and goes green when Tasks 2 and 3 are both committed.

### C-3 — Eligibility and accumulation rule

Owned semantics, implemented in the aggregator's `token` case:

- A token event is **eligible** iff `event.durationMs !== undefined` AND `event.usage.output >= MIN_THROUGHPUT_OUTPUT_TOKENS` AND `event.model !== '<synthetic>'`. `MIN_THROUGHPUT_OUTPUT_TOKENS = 100`, a named exported constant in `server/src/stats/aggregator.ts` (OQ-1's default; below the floor is an overhead measurement, not a throughput measurement).
- **Eligible:** add `usage.output` to `outputTokens`, `durationMs` to `durationMs`, and 1 to `requests` on: `throughput`, `mainThroughput`/`sidechainThroughput` by `isSidechain`, `modelThroughput[model]` (creating the entry), and `skillThroughput[skill]` when `event.skill` is present.
- **Ineligible:** add 1 to `excludedRequests` on `throughput` and on `mainThroughput`/`sidechainThroughput` by `isSidechain` — and touch nothing else. No model or skill entry is created for an ineligible event.
- **Invariant:** for any cell, `throughput.requests + throughput.excludedRequests` equals the number of token events aggregated into it.
- `sortCounts` sorts `modelThroughput` and `skillThroughput` keys like every other record.

- **Owner:** Task 3. **Consumers:** Task 1 (the fixture values obey this rule), Task 5 (page derivation and copy).
- **Stand-in:** the rule is pure arithmetic over declared types; Task 1 applies it by hand to the fixture story, Task 5 consumes pre-computed fixture cells.
- **Real binding:** Task 3's own tests drive it through the real `aggregate()`, and `stats.integration.test.ts:75-80` re-proves it end-to-end against C-4.

### C-4 — Fixture throughput values

`web/src/api/__fixtures__/aggregate-stats.json` gains the five fields in **every** `UsageCounts` cell (two day/project cells + `totals`), with these exact values — additions only, no existing number changes. **These values are not invented:** `stats.integration.test.ts:75-80` deep-equals the real pipeline's output over `server/test/fixtures/projects` against this JSON, so they are the derivation's exact output over those transcripts, computed by script and verified against a hand-trace (controller, 2026-08-05). The story the transcripts tell: only sidechain `req_side_G` qualifies — 153 output tokens (≥ 100) over a 62,000 ms bracket anchored on the sidechain's opening user line, inside `brainstorming`. Everything else is excluded: `req_main_A` and `req_two_A` are each preceded only by a timestamp-less `last-prompt` line (no anchor), and the remaining five events (including the `<synthetic>` one, uuid-keyed `u-syn-1`) all sit below the 100-token floor. Both branches are exercised, matching the real distributions (exclusion ~1% on main, ~81% on sidechains — the fixture skews small-output, hence exclusion-heavy).

```jsonc
// days["2026-07-09"]["-fixture-project"]  (after "skillTokens", before "agents"):
"throughput":          { "outputTokens": 153, "durationMs": 62000, "requests": 1, "excludedRequests": 6 },
"mainThroughput":      { "outputTokens": 0,   "durationMs": 0,     "requests": 0, "excludedRequests": 5 },
"sidechainThroughput": { "outputTokens": 153, "durationMs": 62000, "requests": 1, "excludedRequests": 1 },
"modelThroughput":     { "claude-opus-4-8": { "outputTokens": 153, "durationMs": 62000, "requests": 1, "excludedRequests": 0 } },
"skillThroughput":     { "brainstorming":   { "outputTokens": 153, "durationMs": 62000, "requests": 1, "excludedRequests": 0 } },

// days["2026-07-10"]["-fixture-project-two"]:
"throughput":          { "outputTokens": 0, "durationMs": 0, "requests": 0, "excludedRequests": 1 },
"mainThroughput":      { "outputTokens": 0, "durationMs": 0, "requests": 0, "excludedRequests": 1 },
"sidechainThroughput": { "outputTokens": 0, "durationMs": 0, "requests": 0, "excludedRequests": 0 },
"modelThroughput":     {},
"skillThroughput":     {},

// totals (each field the sum of the two cells above):
"throughput":          { "outputTokens": 153, "durationMs": 62000, "requests": 1, "excludedRequests": 7 },
"mainThroughput":      { "outputTokens": 0,   "durationMs": 0,     "requests": 0, "excludedRequests": 6 },
"sidechainThroughput": { "outputTokens": 153, "durationMs": 62000, "requests": 1, "excludedRequests": 1 },
"modelThroughput":     { "claude-opus-4-8": { "outputTokens": 153, "durationMs": 62000, "requests": 1, "excludedRequests": 0 } },
"skillThroughput":     { "brainstorming":   { "outputTokens": 153, "durationMs": 62000, "requests": 1, "excludedRequests": 0 } }
```

Headline check: `153 / (62000/1000) = 2.4677… → "2.5"` tok/s; identity: 1 + 7 = 8 deduped token events across the three transcripts. Per-request trace (file · key · output · bracket): `req_main_A` 20 · no anchor; `req_main_B` 2 · 34,200,000 ms; `req_main_C` 1 · 55,000 ms; `u-syn-1` 0 · 60,000 ms (`<synthetic>`); `req_main_D` 4 · 60,000 ms; `req_side_G` **153 · 62,000 ms · eligible**; `req_side_H` 3 · 58,000 ms; `req_two_A` 11 · no anchor.

- **Owner:** Task 1 (Wave 0). **Consumers:** Task 4 (asserts merged fixture totals through real `usageSeries`), Task 5 (page tests render from it).
- **Stand-in:** none — Wave 0 lands the real file.
- **Real binding:** two-sided — `stats.integration.test.ts:75-80` proves the real pipeline *produces* these values; Task 4's `usageSeries(fixture, 'week')` test proves the real merge *consumes* them.

### C-5 — Web merge semantics

`mergeUsageCounts` (module-private, `web/src/api/filterStats.ts:34` — reached only through the exported `filterStats()` and `usageSeries()`) merges the new cells by **field-wise addition**: the three scalar `ThroughputCounts` cells add all four fields; `modelThroughput`/`skillThroughput` union keys and field-wise-add colliding entries (the existing `models`/`skillTokens` pattern at `filterStats.ts:61-73`). No division happens in the merge — rates are derived by consumers after merging.

- **Owner:** Task 4. **Consumers:** Task 5 (assumes the `SeriesPoint.counts` it receives are correctly summed).
- **Stand-in for Task 5:** hand-built `SeriesPoint[]` (the existing `Efficiency.test.tsx:8-11` pattern) — pages are pure functions of `{ stats, series, granularity }` and never call the merge.
- **Real binding:** Task 4's tests run the real `filterStats`/`usageSeries` over the real C-4 fixture.

### C-6 — Versioned cache key

```ts
export function fileCacheKey(file, timeZone): string
// returns `${file.path}:${file.mtimeMs}:${file.size}:${timeZone}:v2`
```

The literal `:v2` suffix is appended so every pre-change cache entry misses exactly once. Transcripts are append-only — without this, unchanged files (nearly all history) would serve cached `ParsedFile`s lacking `durationMs` forever, and the dashboard would show zero throughput for all history. The pinned-string test at `file-cache.test.ts:29-30` changes **deliberately** with it.

- **Owner:** Task 2. **Consumers:** none (pipeline calls it unchanged); listed for the Final Gate to audit the invalidation invariant.
- **Stand-in:** n/a. **Real binding:** Task 2's own `file-cache.test.ts`.

### Amendments

_— none yet — (controller fills in; each entry: contract ID, what changed, why, consumers notified)_

## Wave Overview

| Wave | Tasks | Plan phase | Why not Wave 1 |
|---|---|---|---|
| 0 | Task 1 — declarations + fixture | Phase 2 (contract carry) | Symbols must resolve at import time; the fixture must gain required fields before `fixture as AggregateStats` consumers compile |
| 1 | Task 2 (parser + cache key), Task 3 (aggregator), Task 4 (web merge), Task 5 (Efficiency page) | Phases 1, 2, 2, 3 | — |
| 2 | *none* | — | The plan's "proved against real files" seam has no test-shaped home (see Preconditions); it runs as a Final Gate verification instead |

**File-ownership check** — every path listed, none owned twice within a wave:

| Task | Files |
|---|---|
| 1 (W0) | `server/src/stats/contracts.ts`, `server/src/stats/contracts.test.ts`, `web/src/api/types.ts`, `web/src/api/__fixtures__/aggregate-stats.json` |
| 2 (W1) | `server/src/stats/parser.ts`, `server/src/stats/parser.test.ts`, `server/src/stats/file-cache.ts`, `server/src/stats/file-cache.test.ts` |
| 3 (W1) | `server/src/stats/aggregator.ts`, `server/src/stats/aggregator.test.ts` |
| 4 (W1) | `web/src/api/filterStats.ts`, `web/src/api/filterStats.test.ts` |
| 5 (W1) | `web/src/pages/Efficiency.tsx`, `web/src/pages/Efficiency.test.tsx` |

`stats.module.test.ts`, `server/test/stats.integration.test.ts`, `server/test/app.module.test.ts`, `types.test.ts`, `pipeline.ts`, `granularity.ts`, `charts.tsx`, `Overview.tsx` need **no edits** (verified individually; the module and app tests assert only pre-existing numbers and top-level keys, the integration deep-equal self-heals once Tasks 2+3 land because the fixture carries the derivation's exact output, `usageSeries` delegates all merging to `mergeUsageCounts`, pages read shared chart chrome without restyling).

---

## Wave 0

### Task 1: Materialize throughput contracts and extend the shared fixture — ⬜ Not Started

**Phase:** 2 · **Wave:** 0 · **Provides:** C-1, C-4 (and transcribes C-2's declaration) · **Consumes:** C-3 (owner Task 3 — the fixture values below already obey it) · **Assumes decision:** none

**Why:** Every Wave 1 task imports these types, and the web type-contract test (`fixture as AggregateStats`, `web/src/api/types.test.ts:9` — deliberately compile-load-bearing per its own comment) requires the fixture to carry every required field. This task is a transcription of the registry: no logic, no behavior.

**Files:** modify `server/src/stats/contracts.ts`, `server/src/stats/contracts.test.ts`, `web/src/api/types.ts`, `web/src/api/__fixtures__/aggregate-stats.json`. Touch nothing else.

**Steps:**
1. In `server/src/stats/contracts.ts`: add `ThroughputCounts` and the five `UsageCounts` fields exactly as C-1 states them; add `durationMs?: number` to the token `UsageEvent` variant exactly as C-2 states it. `AGGREGATE_STATS_KEYS` is untouched.
2. In `web/src/api/types.ts`: mirror `ThroughputCounts` and the five `UsageCounts` fields **character-identically** to C-1. (The web file has no `UsageEvent` — server-only, do not add one.)
3. In `web/src/api/__fixtures__/aggregate-stats.json`: add the five fields to each of the three `UsageCounts` cells with exactly the C-4 values. Additions only — every existing number stays digit-for-digit.
4. In `server/src/stats/contracts.test.ts`: the minimal `AggregateStats` literal (`contracts.test.ts:24-50`) gains zeroed new fields so it still satisfies the type. The three key-contract assertions are untouched.

If anything here contradicts the success criteria, the criteria win — implement what is correct and report the deviation.

**Success criteria:**
- Both contract files declare the same `ThroughputCounts` and field set, verbatim — a reader diffing the two blocks finds zero differences.
- The fixture parses, carries the C-4 values, and every pre-existing value is unchanged (breaking case: a formatter or hand-edit perturbing an existing number would silently break hand-asserted headline tests in two packages).
- `AGGREGATE_STATS_KEYS` still lists exactly its current key set in both packages (breaking case: adding a key to it fails `contracts.test.ts` and `types.test.ts`).

**Verification** (both currently-green suites must stay green — they assert only pre-existing values):
```bash
npm test --prefix server -- run src/stats/contracts.test.ts
npm test --prefix web -- run src/api/types.test.ts
```
Expected: all tests pass in both runs.

**Verification note:** no new behavior exists to test; the gate is these two runs plus the controller's diff read against C-1/C-2/C-4. The repo-wide type check is deliberately deferred to the Final Gate (see Execution Model warning).

**Controller review checklist:**
- [ ] Diff the `ThroughputCounts` + field block between `contracts.ts` and `types.ts` — byte-identical.
- [ ] Fixture diff shows additions only; `git diff --word-diff` has no changed existing tokens.
- [ ] Fixture totals are the sums of the two day cells for all four fields of all five entries (spot-check `excludedRequests`: 6 + 1 = 7).
- [ ] Both verification runs pass.

**Commit (controller runs after review):**
```bash
git add -- server/src/stats/contracts.ts server/src/stats/contracts.test.ts web/src/api/types.ts web/src/api/__fixtures__/aggregate-stats.json
git commit -m "Declare throughput contracts and extend the shared fixture"
```

**Memory notes:** session — Wave 0 committed means typecheck is red until Wave 1 completes (expected). Repo-memory candidate: none.

**Progress:** —

---

## Wave 1

### Task 2: Derive per-request durations in the parser; version the cache key — ⬜ Not Started

**Phase:** 1 · **Wave:** 1 · **Provides:** C-2 (semantics), C-6 · **Consumes:** C-1/C-2 declarations (owner Task 1, already committed) · **Assumes decision:** none

**Why:** This is the derivation the whole feature stands on. The cache-key bump travels with it because a new field in `ParsedFile` is worthless while stale entries without it are still served — transcripts are append-only, so old entries would otherwise be served forever.

**Files:** modify `server/src/stats/parser.ts`, `server/src/stats/parser.test.ts`, `server/src/stats/file-cache.ts`, `server/src/stats/file-cache.test.ts`. Touch nothing else.

**Context an agent needs:** `parseTranscript` (`parser.ts:72`, named export) is pure — no fs, no clock, no ambient timezone — and runs one forward pass. Token events are deduped in a `Map` keyed `requestId ?? uuid`, last usage-bearing occurrence wins (`parser.ts:142-164`). The loop has an early `continue` at `parser.ts:103` for lines that are neither `assistant` nor `user` — but the plurality of anchors (`attachment` lines) are exactly those, so **anchor state must update before that `continue`**, alongside the existing `earliestTs` tracking (`parser.ts:96-101`). The ordering trap: a request's start anchor is the candidate *as it stood before the current line* — read it before the current line advances the candidate, or every request anchors to itself and every duration is ≤ 0. Grouping is by dedupe key across the whole file (the map already does this); 20.5% of multi-line requests have foreign lines interleaved, and contiguous-run grouping is the known-wrong implementation that inflates rates ~5×. Compute `durationMs` per key after the loop (first-sight anchor frozen; last-sight timestamp is the end) and attach it to the surviving token event only when strictly positive.

Anchor eligibility (C-2, verbatim): a line is an anchor candidate iff it has a string `timestamp` AND its `type` is not `'queue-operation' | 'file-history-delta' | 'pr-link'`. Measured: 15.7% of lines have no timestamp (they must neither anchor nor clear the candidate); the three excluded types caused every negative interval in a 2,832-request sample. Assistant lines themselves are eligible anchors *for later requests*.

Cache key (C-6, verbatim): `fileCacheKey` returns `` `${file.path}:${file.mtimeMs}:${file.size}:${timeZone}:v2` ``. The pinned-string test at `file-cache.test.ts:29-30` changes deliberately with it.

If the code below contradicts the success criteria, the criteria win — implement what is correct and report the deviation.

**Test code** (merge into the existing describe structure of each test file; the existing tests must keep passing — token-event assertions elsewhere in `parser.test.ts` may need `durationMs` added where a bracket now resolves):

```ts
// parser.test.ts — add:
const MAIN: TranscriptFile = {
  path: '/r/-p/s.jsonl', project: '-p', kind: 'main', mtimeMs: 1, size: 1,
};
const line = (o: object) => JSON.stringify(o);
const tokenOf = (parsed: ParsedFile, key: string) =>
  parsed.events.find((e) => e.kind === 'token' && e.dedupeKey === key) as
    Extract<UsageEvent, { kind: 'token' }>;

describe('durationMs derivation', () => {
  it('brackets a request from the last eligible preceding line to its own last line', () => {
    const parsed = parseTranscript(MAIN, [
      line({ type: 'user', timestamp: '2026-08-05T00:00:00.000Z', sessionId: 's' }),
      line({ type: 'assistant', requestId: 'r1', timestamp: '2026-08-05T00:00:02.000Z',
        message: { model: 'claude-opus-5', usage: { input_tokens: 1, output_tokens: 500 } } }),
      line({ type: 'assistant', requestId: 'r1', timestamp: '2026-08-05T00:00:05.000Z',
        message: { model: 'claude-opus-5', usage: { input_tokens: 1, output_tokens: 500 } } }),
    ], 'UTC');
    expect(tokenOf(parsed, 'r1').durationMs).toBe(5000);
  });

  it('keeps the first-sight anchor across an interleaved foreign line', () => {
    const parsed = parseTranscript(MAIN, [
      line({ type: 'user', timestamp: '2026-08-05T00:00:00.000Z', sessionId: 's' }),
      line({ type: 'assistant', requestId: 'r1', timestamp: '2026-08-05T00:00:02.000Z',
        message: { model: 'claude-opus-5', usage: { output_tokens: 400 } } }),
      line({ type: 'user', timestamp: '2026-08-05T00:00:03.000Z',
        message: { content: [{ type: 'tool_result', tool_use_id: 't1' }] } }),
      line({ type: 'assistant', requestId: 'r1', timestamp: '2026-08-05T00:00:06.000Z',
        message: { model: 'claude-opus-5', usage: { output_tokens: 400 } } }),
    ], 'UTC');
    // anchor stays the t=0 user line, NOT the t=3 tool_result; end is t=6.
    expect(tokenOf(parsed, 'r1').durationMs).toBe(6000);
  });

  it('never anchors to bookkeeping lines or clears the candidate on timestamp-less lines', () => {
    const parsed = parseTranscript(MAIN, [
      line({ type: 'user', timestamp: '2026-08-05T00:00:00.000Z', sessionId: 's' }),
      line({ type: 'queue-operation', timestamp: '2026-08-05T00:00:09.000Z' }), // out-of-order
      line({ type: 'mode' }),                                                   // no timestamp
      line({ type: 'assistant', requestId: 'r1', timestamp: '2026-08-05T00:00:02.000Z',
        message: { model: 'claude-opus-5', usage: { output_tokens: 300 } } }),
    ], 'UTC');
    expect(tokenOf(parsed, 'r1').durationMs).toBe(2000);
  });

  it('omits durationMs for the first request in a file and for non-positive intervals', () => {
    const first = parseTranscript(MAIN, [
      line({ type: 'assistant', requestId: 'r1', timestamp: '2026-08-05T00:00:02.000Z',
        message: { model: 'claude-opus-5', usage: { output_tokens: 300 } } }),
    ], 'UTC');
    expect(tokenOf(first, 'r1').durationMs).toBeUndefined();

    const negative = parseTranscript(MAIN, [
      line({ type: 'user', timestamp: '2026-08-05T00:00:07.000Z', sessionId: 's' }),
      line({ type: 'assistant', requestId: 'r1', timestamp: '2026-08-05T00:00:02.000Z',
        message: { model: 'claude-opus-5', usage: { output_tokens: 300 } } }),
    ], 'UTC');
    expect(tokenOf(negative, 'r1').durationMs).toBeUndefined();
  });

  it('anchors a later request to the previous request\'s last assistant line', () => {
    const parsed = parseTranscript(MAIN, [
      line({ type: 'user', timestamp: '2026-08-05T00:00:00.000Z', sessionId: 's' }),
      line({ type: 'assistant', requestId: 'r1', timestamp: '2026-08-05T00:00:02.000Z',
        message: { model: 'claude-opus-5', usage: { output_tokens: 200 } } }),
      line({ type: 'assistant', requestId: 'r2', timestamp: '2026-08-05T00:00:06.000Z',
        message: { model: 'claude-opus-5', usage: { output_tokens: 200 } } }),
    ], 'UTC');
    expect(tokenOf(parsed, 'r2').durationMs).toBe(4000);
  });
});
```

```ts
// file-cache.test.ts — REPLACE the pinned-string expectation (file-cache.test.ts:29-30) with:
    expect(fileCacheKey(base, 'Asia/Hong_Kong'))
      .toBe('/r/-a/s.jsonl:1700000000000:42:Asia/Hong_Kong:v2');
// and ADD:
  it('no longer matches the pre-throughput key format, so stale entries miss once', () => {
    expect(fileCacheKey(base, 'Asia/Hong_Kong'))
      .not.toBe('/r/-a/s.jsonl:1700000000000:42:Asia/Hong_Kong');
  });
```

**Mutations to reject** (apply each to your implementation, confirm the named test fails, revert, report the failure output; if one cannot fail, report it as a finding and stop — do not weaken a test):
1. **Order/self-anchor:** advance the anchor candidate *before* freezing the current request's start, so `r1` anchors to its own first line → the bracket collapses to intra-request spread → "brackets a request…" expects `5000` and gets `3000` (and the single-line variants get `undefined`).
2. **Dropped predicate:** remove `'queue-operation'` from the exclusion set → the t=9 bookkeeping line becomes the anchor → interval is −7000, `durationMs` omitted → "never anchors to bookkeeping…" expects `2000`, gets `undefined`.
3. **Transposed end:** use the request's *first* line timestamp as the end instead of the last → "brackets a request…" expects `5000` (end t=5), gets `2000`.
4. **Re-anchoring:** freeze the start on *last* sight instead of first → the interleaved test's anchor becomes the t=3 tool_result → expects `6000`, gets `3000`.
5. **Cleared candidate:** treat timestamp-less lines as clearing the anchor candidate → the `mode` line wipes the t=0 user anchor → "never anchors to bookkeeping…" expects `2000`, gets `undefined`.
6. **Cache key:** in `file-cache.ts`, delete the `:v2` segment → the replaced pinned-string assertion fails and the inequality test fails (the string `'Asia/Hong_Kong:v2'` appears exactly once in `file-cache.ts` once implemented).

**Verification:**
```bash
npm test --prefix server -- run src/stats/parser.test.ts src/stats/file-cache.test.ts
```
Expected: all tests pass across the two files (the suite reports the number).

**Success criteria:**
- Every parser behavior above holds, including the empty/degenerate cases: first-in-file and non-positive brackets yield an *absent* `durationMs`, never `0` (breaking case: a 0 would later divide as a zero-duration eligible request).
- Existing parser behaviors are untouched: dedupe key, last-wins usage, skill attribution, day bucketing (breaking case: any currently-green `parser.test.ts` assertion failing).
- `fileCacheKey` output differs from the old format for identical inputs (breaking case: old-format key → stale entries served → zero throughput for all history).

**Controller review checklist:**
- [ ] Verification run passes; mutation reports show a failing assertion for each of the six, with output.
- [ ] Re-prove mutations 2 and 6 mechanically (both are literal string edits in the agent's implementation).
- [ ] Diff read: anchor update sits before `parser.ts`'s early `continue`; no fs/clock/ambient-zone use crept in.

**Commit (controller runs after review):**
```bash
git add -- server/src/stats/parser.ts server/src/stats/parser.test.ts server/src/stats/file-cache.ts server/src/stats/file-cache.test.ts
git commit -m "Derive per-request durations in the parser and version the file cache key"
```

**Memory notes:** session — none. Repo-memory candidate (verify at Final Gate): "transcript lines of types queue-operation / file-history-delta / pr-link carry out-of-order timestamps and must never anchor time-derived metrics".

**Progress:** —

### Task 3: Aggregate throughput cells under the eligibility rule — ⬜ Not Started

**Phase:** 2 · **Wave:** 1 · **Provides:** C-3 · **Consumes:** C-1 (owner Task 1, committed), C-2 (owner Task 2 — stand in with hand-built events) · **Assumes decision:** OQ-1 — `MIN_THROUGHPUT_OUTPUT_TOKENS = 100`; reversing is a one-constant edit plus cache re-scan.

**Why:** Turns per-event durations into mergeable cells. This task owns the run's most silent failure mode: `sortCounts` (`aggregator.ts:105-114`) spreads `...counts` and sorts each record *explicitly by name* — a forgotten record passes through unsorted with no type error and no failing test unless one is written for it.

**Files:** modify `server/src/stats/aggregator.ts`, `server/src/stats/aggregator.test.ts`. Touch nothing else.

**Context:** `addToCounts`'s `token` case (`aggregator.ts:44-65`) already branches on `isSidechain`, `<synthetic>`, and `event.skill` — the throughput accumulation extends that case following C-3 verbatim. `emptyCounts()` (`aggregator.ts:25-41`) gains the five fields; `sortCounts` gains the two records. Existing `aggregator.test.ts` builds `ParsedFile.events` literals directly — extend that pattern; existing strict-equal cell assertions will need the new (mostly zeroed/excluded) fields added, which is expected churn in this task's own file. Fixture-realism note: on real main transcripts eligibility is the ~99% case and exclusion the ~1% case; on sidechains exclusion is the ~81% case — cover an eligible main event, an eligible sidechain event with a skill, and each exclusion reason.

If the code below contradicts the success criteria, the criteria win — implement what is correct and report the deviation.

**Test code** (extend the existing file; helper names may be adapted to its conventions):

```ts
const tokenEvent = (over: Partial<Extract<UsageEvent, { kind: 'token' }>> = {}):
  Extract<UsageEvent, { kind: 'token' }> => ({
  kind: 'token', day: '2026-08-05', project: '-p', model: 'claude-opus-5',
  dedupeKey: over.dedupeKey ?? 'r1',
  usage: { input: 1, output: 500, cacheRead: 0, cacheCreation: 0 },
  isSidechain: false, durationMs: 5000, ...over,
});
const file = (events: UsageEvent[]): ParsedFile =>
  ({ events, malformedLines: 0, ignoredLines: 0 });
const cell = (stats: AggregateStats) => stats.days['2026-08-05']['-p'];

describe('throughput aggregation', () => {
  it('accumulates an eligible main event into throughput, mainThroughput and modelThroughput', () => {
    const stats = aggregate([file([tokenEvent()])], 'now');
    const expected = { outputTokens: 500, durationMs: 5000, requests: 1, excludedRequests: 0 };
    expect(cell(stats).throughput).toStrictEqual(expected);
    expect(cell(stats).mainThroughput).toStrictEqual(expected);
    expect(cell(stats).sidechainThroughput)
      .toStrictEqual({ outputTokens: 0, durationMs: 0, requests: 0, excludedRequests: 0 });
    expect(cell(stats).modelThroughput).toStrictEqual({ 'claude-opus-5': expected });
    expect(cell(stats).skillThroughput).toStrictEqual({});
  });

  it('credits an eligible sidechain event with a skill to sidechain and skill cells', () => {
    const stats = aggregate([file([tokenEvent({ isSidechain: true, skill: 'brainstorming' })])], 'now');
    expect(cell(stats).sidechainThroughput.requests).toBe(1);
    expect(cell(stats).mainThroughput.requests).toBe(0);
    expect(cell(stats).skillThroughput['brainstorming'])
      .toStrictEqual({ outputTokens: 500, durationMs: 5000, requests: 1, excludedRequests: 0 });
  });

  it('excludes each ineligible kind without creating model or skill entries', () => {
    const stats = aggregate([file([
      tokenEvent({ dedupeKey: 'a', durationMs: undefined }),                  // no bracket
      tokenEvent({ dedupeKey: 'b', usage: { input: 1, output: 50, cacheRead: 0, cacheCreation: 0 } }), // below floor
      tokenEvent({ dedupeKey: 'c', model: '<synthetic>' }),                   // synthetic
    ])], 'now');
    expect(cell(stats).throughput)
      .toStrictEqual({ outputTokens: 0, durationMs: 0, requests: 0, excludedRequests: 3 });
    expect(cell(stats).modelThroughput).toStrictEqual({});
    expect(cell(stats).skillThroughput).toStrictEqual({});
  });

  it('holds the identity requests + excludedRequests === token events, in cells and totals', () => {
    const stats = aggregate([file([
      tokenEvent({ dedupeKey: 'a' }),
      tokenEvent({ dedupeKey: 'b', durationMs: undefined }),
      tokenEvent({ dedupeKey: 'c', isSidechain: true }),
    ])], 'now');
    const t = stats.totals.throughput;
    expect(t.requests + t.excludedRequests).toBe(3);
    expect(stats.totals.mainThroughput.requests + stats.totals.mainThroughput.excludedRequests
      + stats.totals.sidechainThroughput.requests + stats.totals.sidechainThroughput.excludedRequests)
      .toBe(3);
  });

  it('sorts modelThroughput and skillThroughput keys like every other record', () => {
    const stats = aggregate([file([
      tokenEvent({ dedupeKey: 'a', model: 'zeta-model', skill: 'zeta-skill' }),
      tokenEvent({ dedupeKey: 'b', model: 'alpha-model', skill: 'alpha-skill' }),
    ])], 'now');
    expect(Object.keys(cell(stats).modelThroughput)).toStrictEqual(['alpha-model', 'zeta-model']);
    expect(Object.keys(cell(stats).skillThroughput)).toStrictEqual(['alpha-skill', 'zeta-skill']);
  });
});
```

**Mutations to reject** (apply, watch the named test fail, revert, report output; unprovable → report and stop):
1. **Silent sort pass-through:** remove `modelThroughput` (and separately `skillThroughput`) from your `sortCounts` addition → insertion order survives → the sort test's `['alpha-model', 'zeta-model']` gets `['zeta-model', 'alpha-model']`. This is the invariant no type error can catch.
2. **Widened bound:** change `MIN_THROUGHPUT_OUTPUT_TOKENS = 100` to `= 1` (the literal `100` beside the constant name occurs once) → the 50-token event becomes eligible → the exclusion test's `excludedRequests: 3` gets `2`.
3. **Inverted predicate:** drop the `'<synthetic>'` exclusion from the eligibility check → the synthetic event lands in `throughput.requests` and creates `modelThroughput['<synthetic>']` → the exclusion test fails on both assertions.
4. **Double-count:** increment `excludedRequests` for eligible events too → the identity test's sum becomes 4 ≠ 3.
5. **Transposed sums:** add `usage.output` into `durationMs` and `durationMs` into `outputTokens` → the first test's `toStrictEqual({ outputTokens: 500, durationMs: 5000, … })` fails (values swap).

**Verification:**
```bash
npm test --prefix server -- run src/stats/aggregator.test.ts
```
Expected: all tests pass (existing cases updated for the new fields plus one per new case above).

**Success criteria:**
- Every C-3 clause holds, including: ineligible events create **no** model/skill entries (breaking case: a `<synthetic>` or short-output event minting a `modelThroughput` key), and a file with zero token events yields all-zero cells that later render without division by zero.
- The identity holds in day cells *and* totals (breaking case: an event counted in a cell but not totals, or twice in either).
- All pre-existing aggregator assertions still pass with only the mechanical addition of new zeroed fields.

**Controller review checklist:**
- [ ] Verification passes; all five mutation reports show failing output.
- [ ] Re-prove mutation 1 mechanically for both records (delete the line, run, restore).
- [ ] Diff read: `emptyCounts`, `addToCounts` token case, and `sortCounts` are the only logic touched; the eligibility constant is exported and named exactly `MIN_THROUGHPUT_OUTPUT_TOKENS`.

**Commit (controller runs after review):**
```bash
git add -- server/src/stats/aggregator.ts server/src/stats/aggregator.test.ts
git commit -m "Aggregate throughput cells with an explicit eligibility rule"
```

**Memory notes:** session — OQ-1 resolved as default 100 unless the user says otherwise. Repo-memory candidate: "sortCounts sorts records by explicit enumeration — every new Record on UsageCounts must be added there and locked by a key-order test".

**Progress:** —

### Task 4: Merge throughput cells in client-side filtering — ⬜ Not Started

**Phase:** 2 · **Wave:** 1 · **Provides:** C-5 · **Consumes:** C-1 (owner Task 1, committed), C-4 (owner Task 1, committed) · **Assumes decision:** none

**Why:** All filtering and time-bucketing is client-side; a cell that doesn't survive `mergeUsageCounts` is silently zero on every chart. This task is also the **real binding** for the fixture values: its tests drive C-4 through the real `filterStats`/`usageSeries`.

**Files:** modify `web/src/api/filterStats.ts`, `web/src/api/filterStats.test.ts`. Touch nothing else.

**Context:** `mergeUsageCounts` is module-private (`filterStats.ts:34`) and reached only through the exported `filterStats()` and `usageSeries()` — test through those. Follow the existing patterns in the same function: scalar `TokenTotals` cells use an `add` helper (`filterStats.ts:23-31`), records union-merge with per-key addition (`filterStats.ts:61-73`). Merge = field-wise addition of all four `ThroughputCounts` fields; **no division anywhere in this file** — the volume-weighted rate falls out because consumers divide the summed fields (the same reasoning the plan gives for cache-hit rate). Existing `filterStats.test.ts` expected-literals will need the new fields — expected churn in this task's own file.

If the code below contradicts the success criteria, the criteria win — implement what is correct and report the deviation.

**Test code** (extend the existing file; `fixture` is already imported there):

```ts
describe('throughput merging', () => {
  it('sums all four fields across the fixture through the real merge', () => {
    const merged = filterStats(stats, {});   // no filter: both days, both projects
    expect(merged.totals.throughput)
      .toStrictEqual({ outputTokens: 153, durationMs: 62000, requests: 1, excludedRequests: 7 });
    expect(merged.totals.mainThroughput)
      .toStrictEqual({ outputTokens: 0, durationMs: 0, requests: 0, excludedRequests: 6 });
    expect(merged.totals.modelThroughput).toStrictEqual({
      'claude-opus-4-8': { outputTokens: 153, durationMs: 62000, requests: 1, excludedRequests: 0 },
    });
    expect(merged.totals.skillThroughput).toStrictEqual({
      brainstorming: { outputTokens: 153, durationMs: 62000, requests: 1, excludedRequests: 0 },
    });
  });

  it('drops excluded-day cells from totals when filtered out', () => {
    const merged = filterStats(stats, { from: '2026-07-10' });
    expect(merged.totals.throughput)
      .toStrictEqual({ outputTokens: 0, durationMs: 0, requests: 0, excludedRequests: 1 });
  });

  it('buckets a week by summing, so the rate is volume-weighted, not a mean of day rates', () => {
    // 2026-07-09 (Thu) and 2026-07-10 (Fri) share ISO week Monday 2026-07-06.
    const [week] = usageSeries(stats, 'week');
    expect(week.bucket).toBe('2026-07-06');
    expect(week.counts.throughput)
      .toStrictEqual({ outputTokens: 153, durationMs: 62000, requests: 1, excludedRequests: 7 });
    // Weighted: 153 / 62 s. A mean-of-day-rates implementation cannot produce
    // these sums because it would have to divide before merging.
  });

  it('union-merges model entries when two cells share a model', () => {
    // Build a second stats whose 07-10 cell reuses claude-opus-4-8, via the day cells directly.
    const dayOne = stats.days['2026-07-09']['-fixture-project'];
    const clash: AggregateStats = {
      ...stats,
      days: {
        '2026-07-09': { '-a': dayOne },
        '2026-07-10': { '-b': { ...dayOne } },
      },
    };
    const merged = filterStats(clash, {});
    expect(merged.totals.modelThroughput['claude-opus-4-8'])
      .toStrictEqual({ outputTokens: 306, durationMs: 124000, requests: 2, excludedRequests: 0 });
  });
});
```

**Mutations to reject** (apply, watch the named test fail, revert, report output; unprovable → report and stop):
1. **Hardcoded/first-wins:** make the throughput merge keep the first cell's value instead of adding → the union-merge test expects `requests: 2`, gets `1`.
2. **Dropped field:** skip `skillThroughput` in `mergeUsageCounts` → the fixture-sums test's `skillThroughput` expectation gets `{}`.
3. **Transposed:** swap `outputTokens` and `durationMs` in the throughput adder → the fixture-sums test's strict equality fails (153/62000 swap).
4. **Excluded not merged:** sum only the three "value" fields and drop `excludedRequests` → the filtered test expects `excludedRequests: 1`, gets `0` — the coverage disclosure silently vanishes, which is exactly the dishonesty the plan forbids.

**Verification:**
```bash
npm test --prefix web -- run src/api/filterStats.test.ts
```
Expected: all tests pass.

**Success criteria:**
- The new cells survive `filterStats` (date + project narrowing) and `usageSeries` at all three granularities by pure addition (breaking case: any division inside the merge — a week whose days have rates 40 and 100 must not merge to 70).
- `excludedRequests` merges like the other three fields (breaking case: exclusions dropped on merge, making partial coverage read as total).
- Existing filterStats assertions pass with only mechanical new-field additions.

**Controller review checklist:**
- [ ] Verification passes; four mutation reports show failing output.
- [ ] Diff read: no `/` introduced in `filterStats.ts`; record merge follows the existing `models` pattern.
- [ ] Confirm the week-bucket test ran against the real fixture import, not a local literal (it is the C-4 real binding).

**Commit (controller runs after review):**
```bash
git add -- web/src/api/filterStats.ts web/src/api/filterStats.test.ts
git commit -m "Merge throughput cells in client-side filtering"
```

**Memory notes:** session — none. Repo-memory candidate: none (rates-divide-after-merge is already in CLAUDE.md).

**Progress:** —

### Task 5: Show response throughput on the Efficiency page — ⬜ Not Started

**Phase:** 3 · **Wave:** 1 · **Provides:** the page surface (no cross-task contract) · **Consumes:** C-1, C-4 (owner Task 1, committed), C-3 semantics for copy (owner Task 3), C-5 merged buckets (owner Task 4 — stand in with hand-built `SeriesPoint[]`) · **Assumes decision:** OQ-2 — excluded-request coverage is an **always-visible** line on the tile, not a conditional tooltip; reversing is a copy-level edit in this file only.

**Why:** The user-facing surface. The number must read honestly: this is *response throughput* — output tokens over end-to-end response time including queue, prompt processing and TTFT — not decode speed, and partial coverage must be disclosed.

**Files:** modify `web/src/pages/Efficiency.tsx`, `web/src/pages/Efficiency.test.tsx`. Touch nothing else — chart chrome comes from `@/components/charts` (`AXIS_TICK`, `GRID_PROPS`, `TOOLTIP_PROPS`, `StatCard`, `ChartCard`, `CHART_COLORS`, `EmptyState`), per the repo rule against per-page restyling.

**Context:** The page is a pure function of `{ stats, series, granularity }` (`Efficiency.tsx:22-26`) and already owns the rate-shaped metrics. Add: (a) a throughput stat tile, `data-testid="metric-throughput"`, showing the volume-weighted rate `totals.throughput.outputTokens / (totals.throughput.durationMs / 1000)` formatted to one decimal + " tok/s", with the always-visible coverage line `data-testid="metric-throughput-excluded"` reading from `totals.throughput.excludedRequests` and `.requests`; (b) a time-bucketed throughput trend chart, `data-testid="chart-throughput-trend"`, one mark per bucket, via an exported helper `throughputTrendData(series)` mirroring `cacheHitTrendData`'s shape (bucket + rate, zero-guarding empty buckets); (c) a per-model comparison, `data-testid="chart-model-throughput"`, one bar per key of `totals.modelThroughput` (series identity-coloured in order per the five-hue rule; the fixture has one model — do not invent more). Chart titles follow the existing `"… per ${GRANULARITY_NOUN[granularity]}"` convention (`Efficiency.test.tsx:87`). Copy must say the metric includes queue and prompt-processing time. **Zero guard:** `durationMs === 0` renders `0` (matching the page's existing empty-state convention of `'0%'` tiles), never `NaN`/`Infinity`. The `empty` totals literal in `Efficiency.test.tsx:109-123` gains zeroed throughput fields.

Distribution note for copy honesty: on real data exclusions are ~1% of main requests but ~81% of sidechain requests — the coverage line is not decoration.

If the code below contradicts the success criteria, the criteria win — implement what is correct and report the deviation.

**Test code** (extend both existing describe blocks; the `empty` literal gains the zeroed fields):

```ts
  it('shows the volume-weighted response throughput with an always-visible coverage line', () => {
    render(<Efficiency stats={stats} series={series} granularity="day" />);
    expect(metric('metric-throughput')).toContain('2.5');        // 153 / 62s = 2.4677…
    expect(metric('metric-throughput-excluded')).toContain('7'); // of 8 requests
  });

  it('derives the per-bucket throughput rate, zero-guarding empty buckets', () => {
    expect(throughputTrendData(series)).toStrictEqual([
      { bucket: '2026-07-09', throughput: 153 / 62 },
      { bucket: '2026-07-10', throughput: 0 },
    ]);
  });

  it('renders one mark per bucket in the throughput trend and one bar per model', () => {
    const { container } = render(<Efficiency stats={stats} series={series} granularity="day" />);
    const trend = container.querySelector('[data-testid="chart-throughput-trend"]') as HTMLElement;
    const models = container.querySelector('[data-testid="chart-model-throughput"]') as HTMLElement;
    expect(trend.querySelectorAll('.recharts-bar-rectangle').length).toBe(2);
    expect(models.querySelectorAll('.recharts-bar-rectangle').length).toBe(1);
  });

  it('names the throughput trend after the granularity', () => {
    render(<Efficiency stats={stats} series={series} granularity="week" />);
    expect(screen.getByText('Response throughput per week')).toBeTruthy();
  });

  // inside 'Efficiency with nothing selected':
  it('renders zero throughput rather than NaN or Infinity', () => {
    const { container } = render(<Efficiency stats={empty} series={[]} granularity="day" />);
    expect(container.textContent ?? '').not.toContain('NaN');
    expect(container.textContent ?? '').not.toContain('Infinity');
    expect(throughputTrendData([])).toStrictEqual([]);
  });
```

**Mutations to reject** (apply, watch the named test fail, revert, report output; unprovable → report and stop):
1. **Transposed division:** compute `durationMs / outputTokens` → the tile test expects `'2.5'`, gets `405.2` (and the trend strict-equality fails on 62000/153).
2. **Dropped unit conversion:** divide by `durationMs` without the `/1000` → expects `'2.5'`, gets `0.0`, and the trend test's `153 / 62` becomes `153 / 62000` → strict equality fails.
3. **Hidden coverage:** remove the excluded line → `getByTestId('metric-throughput-excluded')` throws in the tile test.
4. **Missing zero guard:** remove the `durationMs === 0` guard → the empty-state render contains `NaN` → the not-toContain assertion fails, and `throughputTrendData(series)` returns `NaN` for the 07-10 bucket → strict equality fails.

**Verification:**
```bash
npm test --prefix web -- run src/pages/Efficiency.test.tsx
```
Expected: all tests pass (existing cases plus one per case above).

**Success criteria:**
- The headline rate is the weighted quotient of merged sums, never a mean of bucket rates (breaking case: two buckets at 40 and 100 tok/s with unequal volume displaying 70).
- Coverage is always visible when exclusions exist, and the zero/empty state renders `0`-style values with no `NaN`/`Infinity` (breaking cases named per mutation 3/4).
- Copy names it *response throughput* and states the queue/prompt-time inclusion (breaking case: copy that says "generation speed" — misreads the metric the plan explicitly warns about).
- No new colors, axis styles, or tooltip variants outside `@/components/charts`.

**Controller review checklist:**
- [ ] Verification passes; four mutation reports show failing output.
- [ ] Rendered copy includes the queue/prompt-processing disclosure (grep the diff for the copy string).
- [ ] Diff read: chart chrome imported, not restyled; helpers exported alongside `cacheHitTrendData`.

**Commit (controller runs after review):**
```bash
git add -- web/src/pages/Efficiency.tsx web/src/pages/Efficiency.test.tsx
git commit -m "Show response throughput on the Efficiency page"
```

**Memory notes:** session — OQ-2 resolved as always-visible; revisit only if the user objects. Repo-memory candidate: none.

**Progress:** —

---

## Final Gate additions

Beyond the standard gate (full suite vs baseline, `npm run typecheck`, `npm run build`, amendment propagation, two reviewers over the run diff):

1. **Real-data verification** (the plan's un-fakeable seam — no repo test wires real parser output into the real aggregator):
   ```bash
   DASHBOARD_CACHE_FILE=/tmp/tp-verify-cache.json npm run dev -w server &
   sleep 5
   curl -s -X POST localhost:3000/api/stats/refresh | node -e "
     let d=''; process.stdin.on('data',c=>d+=c).on('end',()=>{
       const t=JSON.parse(d).totals, tp=t.throughput;
       console.log('rate tok/s:', (tp.outputTokens/(tp.durationMs/1000)).toFixed(1));
       console.log('requests:', tp.requests, 'excluded:', tp.excludedRequests);
       console.log('main rate:', (t.mainThroughput.outputTokens/(t.mainThroughput.durationMs/1000)).toFixed(1));
     })"
   ```
   Expect the main-transcript rate in the **40–90 tok/s** band (measured weighted mean 61.2 on 2026-08-05 data). A rate in the hundreds means grouping regressed to contiguous runs; a rate near zero means stale cache entries were served (the `:v2` bump failed); `excludedRequests` should be a small fraction of `requests` for main-dominated data. Kill the dev server afterwards and delete `/tmp/tp-verify-cache.json`.
2. Tick the plan's Success Criteria with this evidence.

## Wave summaries

- Wave 0: —
- Wave 1: —

## Carry-forward notes

—

## Repo-memory candidates

Collected from task memory notes; verify before persisting:
- Bookkeeping line types (`queue-operation`, `file-history-delta`, `pr-link`) carry out-of-order timestamps — never anchor time-derived metrics on them (Task 2).
- `sortCounts` enumerates its records explicitly — every new `Record` on `UsageCounts` must be added there and locked by a key-order test (Task 3).

## Final summary

—
