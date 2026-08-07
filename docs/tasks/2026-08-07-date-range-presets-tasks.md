---
type: task
title: "Date Range Presets — Task Breakdown"
description: "Two serial tasks: a pure preset vocabulary in dateRange.ts, then a Range select in the filter card whose active preset is derived from the existing from/to state."
status: in_progress
owner: "eric1234463@gmail.com"
ticket: "DASH-0000"
created: "2026-08-07"
related:
  - "docs/plans/2026-08-07-date-range-presets.md"
wiki: false
---

# Date Range Presets - Task Breakdown

**Plan:** [docs/plans/2026-08-07-date-range-presets.md](../plans/2026-08-07-date-range-presets.md)
**Branch:** feature/DASH-0000-date-range-presets — `executing-task` will not dispatch on any other branch. Work happens in the git worktree at `.claude/worktrees/date-range-presets`, which has its own `npm install` (already run; `node_modules/` present).
**Started:** 2026-08-07
**Completed:** —

**Branch point:** `beec4c8` (`git merge-base main HEAD`). This repo has no CI, so the branch point is not CI-gated and a baseline was measured: root `npm test` → server `8 files / 98 tests passed`, web `11 files / 131 tests passed`; root `npm run typecheck` → both packages clean. Anything red later in the run is therefore this run's.

## Source Plan Summary

Add a **Range** select to the dashboard's filter card offering Last 7 / 30 / 90 days and All time, without giving up the arbitrary From/To range the card supports today. The design decision that shapes everything: **the preset is derived from `{ from, to }`, never stored beside it.** `presetRange(preset, now)` maps a preset to an inclusive day-key pair; `matchPreset(range, now)` maps a pair back to the preset it matches, or `'custom'`. So editing a date input flips the select to Custom for free, and there is no second piece of state that can desync — the alternative (a `preset` state variable that every `setRange` call site must remember to update) already had a candidate desync site in the empty state's "Show all time" button. `now` is frozen once at mount, shared by the range initialiser and the derivation, so a session's label stays stable across midnight and is deterministic under an injected clock. No server change, no contract change, no new dependency.

## Execution Model

Implementation tasks go out as **one parallel wave per wave-numbered section, in a single turn**. Each agent gets one task block, implements it, tests it against the **Contract Registry** — using the declared stand-in for anything it does not own — proves its named mutations, and stops. **Agents run no git commands**; they leave changes uncommitted in the shared working tree.

The **controller** processes each result as it arrives: review the diff, re-run that task's verification for fresh evidence, prove **every** one of its named mutations, `git add` that task's exact paths, commit with the prepared message, and write status plus commit hash back into this doc.

The controller also **owns the registry**. Contracts are frozen at dispatch; an agent that needs one changed reports it and waits, and the controller records the amendment and broadcasts it to that contract's consumers. Agents may message each other to clarify semantics *inside* a contract; they may not agree a change between themselves.

There is **one review, at the end**: the Final Gate — whatever CI does not already block on (here: nothing runs in CI, so the Final Gate owns root `npm test` and `npm run typecheck`), then a review pass over the whole run diff (cross-task integration · unnamed-mutation search — conformance and the named mutations were already gated per task), then the plan's own Success Criteria ticked with evidence.

Consequences visible below: no task has a commit step, within a wave every file has exactly one owning task, and no task needs an uncommitted peer's code to prove itself.

**This run has no parallelism, and that is the honest shape of it.** Two tasks, two files each, serial. See *Why Wave 2 exists* for the seam that could not be inverted and why inverting it was rejected rather than overlooked.

## Contract Registry

Every surface that crosses a task boundary. Tasks reference these by ID; the controller broadcasts amendments by ID; the Final Gate audits conformance by ID.

**Amendment rule (controller enforces):** a contract is frozen once the wave dispatches. An agent that finds its contract wrong or insufficient reports it to the controller and waits. The controller decides, records the amendment below, and broadcasts it to every consumer listed. Agents may message each other to clarify semantics inside a contract; they may not agree a change between themselves.

### C-1 — preset vocabulary

- **Surface:** exported from `web/src/api/dateRange.ts`:
  ```ts
  export type SelectableRangePreset = 'last7' | 'last30' | 'last90' | 'all';
  export type RangePreset = SelectableRangePreset | 'custom';
  export const RANGE_PRESETS: readonly SelectableRangePreset[] = ['last7', 'last30', 'last90', 'all'];
  export const RANGE_PRESET_LABELS: Record<RangePreset, string> = {
    last7: 'Last 7 days',
    last30: 'Last 30 days',
    last90: 'Last 90 days',
    all: 'All time',
    custom: 'Custom',
  };
  export const DEFAULT_RANGE_PRESET: SelectableRangePreset = 'last7';
  ```
  `RANGE_PRESETS` order is the dropdown order and is load-bearing — the consumer renders it as-is. `'custom'` is deliberately **not** in `RANGE_PRESETS`: it is a label for a derived state, never a choice.
- **Owner:** Task 1
- **Consumers:** Task 2
- **Other existing callers (not in this run):** none — every symbol in C-1 is new.
- **Derived by:** `grep -rn "RangePreset\|RANGE_PRESET" web/ server/ --include=*.ts --include=*.tsx` → no matches outside this run's target files.
- **Stand-in:** none — Task 1 is committed before Task 2 dispatches, so Task 2 imports the real declarations. Task 2 must **not** define its own copy of the labels or the preset list; a hand-written label in the spec and a different one in `App.tsx` would both be green.
- **Real binding:** Task 2 — `App.tsx` imports `RANGE_PRESETS` and `RANGE_PRESET_LABELS` and renders them, and Task 2's option-list assertion reads the rendered values. Rename either symbol and Task 2's spec fails at import.

### C-2 — `presetRange`

- **Surface:** `presetRange(preset: SelectableRangePreset, now: Date): { from: string; to: string }`.
  Pure. Reads no clock, no ambient timezone, no `fs`. Does **not** mutate `now`.
  - `'last7' | 'last30' | 'last90'` → the window of N days ending on `now`, **inclusive of both ends with `now` counted as one of the N**: `to = toDayKey(now)`, `from = toDayKey(now - (N - 1) days)`.
  - `'all'` → `{ from: '', to: '' }` — the empty-string pair `App` already treats as unbounded (`web/src/App.tsx:70-74` passes `from || undefined`).
  - Day keys are local calendar dates built through the existing `toDayKey` (`web/src/api/dateRange.ts:11-16`). Never `toISOString()`, which shifts the key by a day for anyone east or west of UTC.
  - Never throws. `preset` is a closed union; there is no runtime fallback to specify.
- **Owner:** Task 1
- **Consumers:** Task 2
- **Other existing callers (not in this run):** none — new symbol.
- **Derived by:** `grep -rn "presetRange" web/ server/` → no matches before this run.
- **Stand-in:** none — lands in Task 1's commit; Task 2 imports the real function. Task 2 must not reimplement the arithmetic in its spec: expected day keys are written as literals (the exact strings are in Task 2's block), so a wrong implementation cannot make a self-consistent test pass.
- **Real binding:** Task 2 — `App.tsx` calls it from the Range select's `onChange`, and Task 2's spec asserts the literal day keys that reach `filterStats`. Rename it and both `App.tsx` and the spec break.

### C-3 — `matchPreset`

- **Surface:** `matchPreset(range: { from: string; to: string }, now: Date): RangePreset`.
  Pure, does not mutate `now`, never throws.
  - `{ from: '', to: '' }` → `'all'`.
  - Otherwise returns the first `p` in `RANGE_PRESETS` whose `presetRange(p, now)` deep-equals `range`.
  - Otherwise `'custom'`.
  - Consequence stated on purpose: a hand-typed range that happens to equal a preset window reads as that preset, not as Custom. That is the accepted cost of deriving rather than storing.
- **Owner:** Task 1
- **Consumers:** Task 2
- **Other existing callers (not in this run):** none — new symbol.
- **Derived by:** `grep -rn "matchPreset" web/ server/` → no matches before this run.
- **Stand-in:** none — lands in Task 1's commit.
- **Real binding:** Task 2 — the select's `value` is `matchPreset(range, now)`, and Task 2 asserts the rendered value flips to `custom` after a hand edit and reads `all` after the empty state's button. Rename it and both break.

### C-4 — `defaultDateRange` (existing surface, behaviour must not change)

- **Surface:** `defaultDateRange(now: Date): { from: string; to: string }` — unchanged signature, unchanged meaning: the seven days ending on `now`, inclusive. Declared at `web/src/api/dateRange.ts:22`. `DEFAULT_RANGE_DAYS = 7` (`web/src/api/dateRange.ts:2`) stays exported; `web/src/api/dateRange.test.ts:22` asserts its value.
- **Owner:** Task 1 (may reimplement its body as `presetRange(DEFAULT_RANGE_PRESET, now)`; may not change what it returns)
- **Consumers:** Task 2 (`web/src/App.tsx:8,62` — the only importer, confirmed by `grep -rn "defaultDateRange" web/ server/` → `web/src/App.tsx:8`, `web/src/App.tsx:62`, and `web/src/api/dateRange.test.ts`)
- **Other existing callers (not in this run):** none.
- **Stand-in:** none — already exists and is committed.
- **Real binding:** the existing `defaultDateRange` describe block in `web/src/api/dateRange.test.ts:16-43`, which Task 1 must leave passing **unedited**. That untouched block is the regression lock on this contract.

### Amendments

_Filled in by executing-task. One entry per amendment: contract ID, what changed, why, which consumers were notified, and the commit that carries it._

—

## Preconditions

Run these before dispatching. Each takes seconds; a whole wave rediscovering the same problem wastes the run.

```bash
git rev-parse --abbrev-ref HEAD          # expect: feature/DASH-0000-date-range-presets
ls node_modules/.bin/vitest              # expect: the path, not an error (npm workspaces hoist to the root)
npm test --prefix web -- run src/api/dateRange.test.ts
npm test --prefix web -- run src/App.test.tsx
```

Both scoped test commands were **executed at authoring time** in this worktree and are accepted by the project as written — each reported `Test Files  1 passed (1)` with no failures. If `ls node_modules/.bin/vitest` fails, run `npm install` from the worktree root first: each git worktree is its own checkout and needs its own install (`CLAUDE.md`, Commands).

**Correction applied at execution time:** this precondition originally read `ls web/node_modules/.bin/vitest`, which fails even on a healthy install — npm workspaces hoist binaries to the root `node_modules/.bin`. Corrected above. No task block referenced the wrong path, so no agent brief was affected.

Findings from reconciling the plan against the repo:

- **No mismatch found.** Every path, symbol and signature the plan names was opened and is as described: `defaultDateRange`/`toDayKey`/`DEFAULT_RANGE_DAYS` at `web/src/api/dateRange.ts:2,11,22`; the filter card's `Group by` select at `web/src/App.tsx:187-207`; `StatsFilter` at `web/src/api/filterStats.ts:13-17`; the `from || undefined` unbounded convention at `web/src/App.tsx:70-74`; the empty state's `setRange({ from: '', to: '' })` button at `web/src/App.tsx:300-311`.
- **Test collection scope:** `web/vite.config.mts:13` sets `test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test-setup.ts'] }` and declares **no `include`**, so vitest's default glob collects both target specs where they already sit. Confirmed by running each file-scoped command above and seeing it collected.
- **No CI:** there is no workflow directory and no lint script in this repo (`package.json` scripts are `dev`, `dev:ports`, `bg:*`, `build`, `test`, `typecheck`). So the Final Gate owns root `npm test` and `npm run typecheck` — nothing upstream blocks on them.
- **Commit convention:** imperative sentence-case subjects with no conventional-commit prefix (`git log --format=%s -10`: "Add response token throughput metrics", "Show only your own skills, and let charts group by day, week or month"). The prepared commits below follow that, not `feat(scope):`.
- **Superseded:** the plan's Phase 2 and Phase 3 both land in `web/src/App.tsx` + `web/src/App.test.tsx`, so they cannot be committed independently and are merged into Task 2. That is a re-cut along file-ownership lines, not a dropped phase.
- **ASSUMPTION:** a 90-day window at daily granularity is legible enough to ship — judgement, unmeasured. It is the plan's OQ-1 and it changes no code in either task.

## Wave Overview

| Wave | Tasks | Phase (from plan) | Agents | Notes |
|------|-------|-------------------|--------|-------|
| Wave 0 | — | — | 0 | **Skipped.** Nothing needs to resolve at import time ahead of its owner: C-1's declarations and C-2/C-3's implementations all live in one file with one owner, and that file is committed before its only consumer dispatches. No test data is shared either — the run's fixture (`web/src/api/__fixtures__/aggregate-stats.json`) already exists and neither task edits it |
| Wave 1 | Task 1 | Phase 1 — Preset vocabulary | 1 | Pure date arithmetic. No consumers needed; provable entirely on its own |
| Wave 2 | Task 2 | Phase 2 — Range control · Phase 3 — Prove it through the real filtering layer | 1 | Dispatched after Task 1 is committed |

**Why Wave 2 exists:** `App.tsx` consumes C-1/C-2/C-3 by **direct module import** — the plan's design decision, because they are pure functions of a `now` the component already receives through `deps.now`, and Task 2's assertions are about the *actual* day keys the arithmetic produces (`from: '2026-06-11'` reaching `filterStats`, not "some range"). A fake would prove only that the select called something. Inverting the seam into `AppDeps` was considered and rejected: it would put pure calendar arithmetic behind an injection point for no design benefit, and it would leave C-2/C-3 with **no real binding at all** — every assertion in the run would be against a fake, so a rename or an off-by-one on either side would ship green. Trading one serial commit for the run's only real binding is the right trade. The alternative that would have bought a wave — `vi.mock('./api/dateRange')` in Task 2 — additionally produces an intermediate commit that fails `tsc --noEmit`, since `App.tsx` would import symbols that do not yet exist.

**File-ownership check:** the run's complete path list, compared across both tasks —

| Path | Task |
|---|---|
| `web/src/api/dateRange.ts` | 1 |
| `web/src/api/dateRange.test.ts` | 1 |
| `web/src/App.tsx` | 2 |
| `web/src/App.test.tsx` | 2 |
| `CLAUDE.md` | 2 |

No path appears twice, and no path appears in two waves. The trickiest call was `web/src/api/dateRange.test.ts`: Task 2 has a strong pull to add "and the preset the App picked is the one the unit suite pins" there, and must not — it owns `App.test.tsx` and asserts through the component instead. `CLAUDE.md` is Task 2's because the invariant worth documenting ("the preset is derived, never stored") is only true once the control exists.

## Wave 1 — Preset vocabulary (1 agent)

### Task 1: Add the preset vocabulary to the date-range module

**Status:** ✅ Completed
**Wave:** 1
**Phase:** Phase 1 — Preset vocabulary
**Provides:** C-1 (preset vocabulary), C-2 (`presetRange`), C-3 (`matchPreset`), C-4 (`defaultDateRange`, behaviour preserved)
**Consumes:** nothing
**Stand-in:** none — this task consumes no contract.
**Assumes decision:** none

**Precedence rule:** if any code below contradicts the success criteria, **the criteria win** — implement what is correct and report the deviation rather than transcribing.

**Why this task exists:** The Range select needs one place that knows what "Last 30 days" means as a pair of day keys, and one place that can recognise such a pair coming back. Keeping both in a pure module means the calendar arithmetic is pinned by fast unit tests and the component never has to re-derive a date.

**Context for assigned agent:**

- `web/src/api/dateRange.ts` already exists and holds `DEFAULT_RANGE_DAYS`, `toDayKey`, and `defaultDateRange`. Read it first — you are extending it, not replacing it.
- **`toDayKey` is the only way to produce a day key here.** It formats a *local* calendar date. `toISOString().slice(0, 10)` would shift the key by a day for any user east or west of UTC, and the day keys must line up with the ones the server already bucketed in the configured zone. `web/src/api/dateRange.test.ts:5-11` locks this for `toDayKey` itself; your new windows need the same discipline.
- Windows are **inclusive of both ends with today counted**: a 7-day window ending 2026-07-10 starts 2026-07-04, not 2026-07-03.
- Do not mutate the `Date` you are given — copy it (`new Date(now)`) before calling `setDate`. The existing `defaultDateRange` body shows the pattern and `dateRange.test.ts:38-42` asserts it.
- The module is pure: no clock read, no `fs`, no React, no imports beyond what it has today (which is nothing).
- **Do not edit the existing `defaultDateRange` describe block** (`web/src/api/dateRange.test.ts:16-43`). It is the regression lock on C-4. You may reimplement `defaultDateRange`'s body in terms of `presetRange`, but that block must pass untouched.
- Match the file's existing style: JSDoc comment above each export explaining *why*, not what.

**Success criteria:**

- `presetRange('last30', new Date(2026, 6, 10))` is exactly `{ from: '2026-06-11', to: '2026-07-10' }` — one day narrower or wider fails.
- `presetRange('last90', new Date(2026, 0, 3))` crosses backwards into the previous year and reads `{ from: '2025-10-06', to: '2026-01-03' }`.
- For a `now` late in the local evening (`new Date(2026, 6, 9, 23, 30)`, which is already the 10th in UTC), `presetRange('last7', now).to` is `'2026-07-09'` — the local date, not the UTC one.
- `presetRange('all', now)` is `{ from: '', to: '' }` for **any** `now`, including one where every other preset returns non-empty strings.
- `matchPreset` round-trips: for every `p` in `RANGE_PRESETS`, `matchPreset(presetRange(p, now), now) === p`. A preset the user picks can never immediately read back as Custom.
- `matchPreset({ from: '', to: '' }, now)` is `'all'`, **not** `'custom'` — the empty state's "Show all time" button produces exactly this pair.
- `matchPreset` returns `'custom'` for a pair that matches no preset, and for a *partially* filled pair (`{ from: '2026-07-04', to: '' }`) — a half-open range is not All time.
- `'custom'` is absent from `RANGE_PRESETS` but present as a key of `RANGE_PRESET_LABELS`.
- Neither function mutates the `Date` it is given.
- `defaultDateRange` and `DEFAULT_RANGE_DAYS` keep their current exported behaviour, and their existing describe block passes with no edits to it.
- No files outside the two listed paths are modified.

**Files:**

- Modify: `web/src/api/dateRange.ts`
- Modify (append new describes; leave existing ones untouched): `web/src/api/dateRange.test.ts`

**Contract (C-1, C-2, C-3 — verbatim from the registry):**

```ts
export type SelectableRangePreset = 'last7' | 'last30' | 'last90' | 'all';
export type RangePreset = SelectableRangePreset | 'custom';
export const RANGE_PRESETS: readonly SelectableRangePreset[] = ['last7', 'last30', 'last90', 'all'];
export const RANGE_PRESET_LABELS: Record<RangePreset, string> = {
  last7: 'Last 7 days',
  last30: 'Last 30 days',
  last90: 'Last 90 days',
  all: 'All time',
  custom: 'Custom',
};
export const DEFAULT_RANGE_PRESET: SelectableRangePreset = 'last7';

presetRange(preset: SelectableRangePreset, now: Date): { from: string; to: string }
matchPreset(range: { from: string; to: string }, now: Date): RangePreset
```

`presetRange`: pure, does not mutate `now`, never throws. `'last7' | 'last30' | 'last90'` → the N-day window ending on `now`, inclusive of both ends with `now` counted (`to = toDayKey(now)`, `from = toDayKey(now - (N - 1) days)`). `'all'` → `{ from: '', to: '' }`. Day keys come from `toDayKey`, never `toISOString()`.

`matchPreset`: pure, does not mutate `now`, never throws. `{ from: '', to: '' }` → `'all'`; otherwise the first `p` in `RANGE_PRESETS` whose `presetRange(p, now)` deep-equals `range`; otherwise `'custom'`.

**Test (append these describes to `web/src/api/dateRange.test.ts`; add the new names to the existing import line):**

```ts
describe('range presets', () => {
  it('offers the four selectable presets in dropdown order, and never offers custom', () => {
    expect(RANGE_PRESETS).toStrictEqual(['last7', 'last30', 'last90', 'all']);
    expect(RANGE_PRESETS).not.toContain('custom');
    expect(RANGE_PRESET_LABELS.custom).toBe('Custom');
    expect(DEFAULT_RANGE_PRESET).toBe('last7');
  });

  it('labels every preset, selectable or derived', () => {
    expect(RANGE_PRESET_LABELS).toStrictEqual({
      last7: 'Last 7 days',
      last30: 'Last 30 days',
      last90: 'Last 90 days',
      all: 'All time',
      custom: 'Custom',
    });
  });
});

describe('presetRange', () => {
  it('spans each window inclusively, counting today', () => {
    const now = new Date(2026, 6, 10);
    expect(presetRange('last7', now)).toStrictEqual({ from: '2026-07-04', to: '2026-07-10' });
    expect(presetRange('last30', now)).toStrictEqual({ from: '2026-06-11', to: '2026-07-10' });
    expect(presetRange('last90', now)).toStrictEqual({ from: '2026-04-12', to: '2026-07-10' });
  });

  it('crosses a year boundary backwards', () => {
    const now = new Date(2026, 0, 3);
    expect(presetRange('last30', now)).toStrictEqual({ from: '2025-12-05', to: '2026-01-03' });
    expect(presetRange('last90', now)).toStrictEqual({ from: '2025-10-06', to: '2026-01-03' });
  });

  it('uses the local calendar date, not the UTC one', () => {
    // 23:30 local on the 9th is already the 10th in UTC anywhere east of +00:30.
    const now = new Date(2026, 6, 9, 23, 30);
    expect(presetRange('last7', now)).toStrictEqual({ from: '2026-07-03', to: '2026-07-09' });
    expect(presetRange('last90', now)).toStrictEqual({ from: '2026-04-11', to: '2026-07-09' });
  });

  it('clears both bounds for all time, whatever the clock says', () => {
    expect(presetRange('all', new Date(2026, 6, 10))).toStrictEqual({ from: '', to: '' });
    expect(presetRange('all', new Date(2020, 0, 1))).toStrictEqual({ from: '', to: '' });
  });

  it('does not mutate the date it is given', () => {
    const now = new Date(2026, 6, 10);
    presetRange('last90', now);
    expect(toDayKey(now)).toBe('2026-07-10');
  });

  it('agrees with defaultDateRange on the seven-day window', () => {
    const now = new Date(2026, 6, 10);
    expect(presetRange(DEFAULT_RANGE_PRESET, now)).toStrictEqual(defaultDateRange(now));
  });
});

describe('matchPreset', () => {
  const NOW = new Date(2026, 6, 10);

  it('round-trips every selectable preset', () => {
    for (const preset of RANGE_PRESETS) {
      expect(matchPreset(presetRange(preset, NOW), NOW)).toBe(preset);
    }
  });

  it('reads empty bounds as all time, not custom', () => {
    expect(matchPreset({ from: '', to: '' }, NOW)).toBe('all');
  });

  it('reads an arbitrary window as custom', () => {
    expect(matchPreset({ from: '2026-07-09', to: '2026-07-10' }, NOW)).toBe('custom');
  });

  it('reads a half-open window as custom, not all time', () => {
    expect(matchPreset({ from: '2026-07-04', to: '' }, NOW)).toBe('custom');
    expect(matchPreset({ from: '', to: '2026-07-10' }, NOW)).toBe('custom');
  });

  it('reads a window one day off a preset as custom', () => {
    expect(matchPreset({ from: '2026-07-03', to: '2026-07-10' }, NOW)).toBe('custom');
    expect(matchPreset({ from: '2026-07-04', to: '2026-07-09' }, NOW)).toBe('custom');
  });

  it('does not mutate the date it is given', () => {
    const now = new Date(2026, 6, 10);
    matchPreset({ from: '2026-07-04', to: '2026-07-10' }, now);
    expect(toDayKey(now)).toBe('2026-07-10');
  });
});
```

**Implement** the exports in `web/src/api/dateRange.ts` to satisfy that suite, reusing `toDayKey` and following the file's existing comment style.

**Mutations to reject — apply each, confirm it fails, revert, and report the failure output.** Before applying each one, run the recorded `grep -cF` and confirm it prints `1`; if it prints anything else, extend the anchor with its leading indentation and record the extended form in your report. All five anchors sit in code you are writing, so the counts below are what you must *establish*, not what already exists:

- **M1 (widened bound):** in `web/src/api/dateRange.ts`, change the day-count offset `- (days - 1)` to `- days` (whatever local name you gave the count). `grep -cF '- (days - 1)' web/src/api/dateRange.ts` → must be `1`. The `from` key moves one day earlier, so `presetRange('last30', 2026-07-10)` returns `2026-06-10`, so the first `toStrictEqual` in *presetRange spans each window inclusively* fails.
- **M2 (timezone):** replace the `toDayKey(...)` call that builds `from` with `.toISOString().slice(0, 10)`. `grep -cF 'toDayKey' web/src/api/dateRange.ts` → will exceed 1, so anchor on the whole line of the `from` assignment and record it. For `now = 2026-07-09T23:30` local (east of UTC) the key shifts to the 10th, so *uses the local calendar date, not the UTC one* fails. This is the mutation that matters most — it is the bug the module's oldest test already exists to prevent.
- **M3 (dropped predicate):** in `matchPreset`, delete the empty-bounds branch so `{ from: '', to: '' }` falls through to the preset scan. Anchor on the line containing the `''` comparison; record its `grep -cF` count. `presetRange('all')` returns empty strings, so the scan *would* match `'all'` — meaning this mutation is only caught if the branch order matters. **Report it as a finding if it survives**, and do not weaken any test: a surviving M3 tells you the empty-bounds branch is redundant, which is worth knowing and worth saying, not worth hiding.
- **M4 (hardcoded return):** make `matchPreset` `return 'custom'` as its first statement. `grep -cF "return 'custom'" web/src/api/dateRange.ts` → must be `1` (extend the anchor if your implementation returns it twice). *round-trips every selectable preset* and *reads empty bounds as all time* both fail.
- **M5 (order):** change `RANGE_PRESETS` to `['last30', 'last7', 'last90', 'all']`. `grep -cF "['last7', 'last30', 'last90', 'all']" web/src/api/dateRange.ts` → must be `1`. *offers the four selectable presets in dropdown order* fails on the `toStrictEqual`. Order is load-bearing because Task 2 renders this array as the dropdown.

No build cache is involved here — vitest transforms on read, and every mutation above changes the line's length, so no cache-clearing step is needed.

**Verify:**

```bash
npm test --prefix web -- run src/api/dateRange.test.ts
```

Expected: `Test Files  1 passed (1)` with no failing tests, and the existing `toDayKey` / `defaultDateRange` describes still among the passes. Before implementing, the new describes must fail on the missing exports (vitest reports this as a single file-level failure, not one per case).

**Review checklist (controller, before committing):**

- Re-run this task's verify command — expect `Test Files  1 passed (1)`, no failures. Root `npm test` and `npm run typecheck` belong to the Final Gate, not here.
- Apply **M2** and confirm *uses the local calendar date* fails; revert. This is the thirty seconds worth spending: it is the one mutation an agent can introduce while making every other assertion pass, and the one whose bug is invisible to anyone developing in UTC.
- Apply **M1** and confirm the inclusive-window assertion fails; revert. Off-by-one is the other silent failure — "Last 30 days" showing 31 days looks entirely plausible.
- `git diff web/src/api/dateRange.test.ts` shows the existing `toDayKey` and `defaultDateRange` describe blocks **byte-unchanged**. An edit there means the agent moved the regression lock instead of satisfying it.
- `git diff web/src/api/dateRange.ts` shows no new import and no clock read (`new Date()` with no argument, `Date.now()`) — the module's purity is the reason it can be tested this cheaply.
- Read the agent's M3 report. If M3 survived, that is a legitimate finding about a redundant branch, not a failure — note it in Progress notes and leave the branch in place (it documents intent and costs nothing).
- `git status --porcelain` lists only this task's two paths.

**Commit (controller runs after review):**

```bash
git add -- web/src/api/dateRange.ts web/src/api/dateRange.test.ts
git commit -m "Add date-range presets and the reverse lookup that names one"
```

**Memory notes:**

- Session-memory candidates: Task 2 imports every symbol in C-1/C-2/C-3 directly; if any name changes here, Task 2's brief needs the broadcast before it dispatches.
- Repo-memory candidates: none — `toDayKey`-not-`toISOString` is already documented in `CLAUDE.md` and in the module's own comments.

**Progress notes:** ✅ Completed. Commit `c0b30fd`. Success criteria: **MET** (all eleven). Files: `web/src/api/dateRange.ts`, `web/src/api/dateRange.test.ts` — nothing outside the list.

Verified by controller: `npm test --prefix web -- run src/api/dateRange.test.ts` → `Test Files 1 passed (1)`, `Tests 20 passed (20)`.

Mutations re-proven mechanically by the controller (own script, anchor count asserted `1` for each, file restored byte-identical and re-verified green afterwards): **M1 KILLED** (7 failed / 13 passed), **M2 KILLED** (6 failed / 14 passed), **M3 SURVIVED** (20 passed), **M4 KILLED** (2 failed / 18 passed), **M5 KILLED** (1 failed / 19 passed). Agent's report matched this exactly.

Contracts: **C-1, C-2, C-3 CONFORM** to the registry verbatim — types, `RANGE_PRESETS` order, label map, both signatures. **C-4 preserved**: `defaultDateRange`'s body is now `return presetRange(DEFAULT_RANGE_PRESET, now)` (explicitly permitted), return value unchanged, `DEFAULT_RANGE_DAYS` still exported. The existing `toDayKey` and `defaultDateRange` describe blocks are byte-unchanged apart from the import line, which the brief authorised. No amendment requested. Diff confirms the module stays pure: no new import, no argument-less `new Date()`, no `Date.now()`.

**Finding 1 — M3 is undetectable by construction, and that is correct.** `presetRange('all', now)` returns `{ from: '', to: '' }` and `'all'` is in `RANGE_PRESETS`, so deleting `matchPreset`'s empty-bounds early return still yields `'all'` from the scan. The branch is genuinely redundant. **Decision: keep it** — C-3 specifies it, it documents that empty bounds mean All time regardless of the clock, and it costs one comparison. Recorded rather than hidden, per the brief.

**Finding 2 — the M2 invariant has no coverage on a UTC machine, and this is a real hole.** The web package pins no `TZ` (`web/vite.config.mts:13` sets only `environment`, `globals`, `setupFiles`); only the server pins `TZ=UTC` (`server/vitest.config.mts`). Controller verified independently: with `TZ=UTC`, the M2 mutation (`from.toISOString().slice(0, 10)` in place of `toDayKey(from)`) **survives all 20 tests**, whereas on this machine's ambient `Asia/Hong_Kong` it kills 6. So the plan's success criterion "correct for a non-UTC local zone" is only actually asserted when the runner happens to sit in a non-UTC zone. Note the kill on this machine also does **not** come from the test the brief predicted (*uses the local calendar date, not the UTC one* passes under M2 at UTC+8, because 23:30 local on the 3rd is still the 3rd in UTC) — it comes from the midnight-anchored cases. Scheduled as a Final Gate fix: pin a non-UTC `TZ` for the web test run so the discrimination is machine-independent. Pre-existing in scope — the older `toDayKey` test at `dateRange.test.ts:5-11` has the same dependence — but this run leans on it much harder.

**Doc corrections applied at execution time** (the task doc was carrying two false premises; neither reached a second agent):
- The recorded `grep -cF '- (days - 1)' …` fails outright — the leading dash parses as a flag. `grep -cF -- '- (days - 1)' …` is the working form.
- The brief predicted the pre-implementation failure would be a single file-level error; it is per-case (`14 failed | 6 passed`), because missing named imports resolve to `undefined` under esbuild rather than throwing at import time.

Deviations: the agent added a module-private `PRESET_DAYS` map keyed `last7: DEFAULT_RANGE_DAYS` (not a literal `7`) so `DEFAULT_RANGE_DAYS` stays load-bearing after `defaultDateRange` delegated its body away. Reviewed and kept — without it that export becomes dead and free to drift from the `last7` window. `presetRange`'s parameter list is wrapped across lines for the file's width; no behavioural difference and the M1/M2 anchors are unaffected.

—

## Wave 2 — Range control, proved through the real filtering layer (1 agent, after Wave 1 is committed)

### Task 2: Add the Range select to the filter card and prove it widens real filtering

**Status:** ✅ Completed
**Wave:** 2
**Phase:** Phase 2 — Range control in the filter card · Phase 3 — Prove it through the real filtering layer
**Provides:** nothing new to other tasks. It is the real binding for C-1, C-2 and C-3.
**Consumes:** C-1 preset vocabulary (owner: Task 1), C-2 `presetRange` (owner: Task 1), C-3 `matchPreset` (owner: Task 1), C-4 `defaultDateRange` (owner: Task 1)
**Stand-in:** none — Task 1 is committed before this task dispatches, so import the real `web/src/api/dateRange` module. **Do not** define your own preset list, labels, or day-key arithmetic anywhere in `App.tsx` or the spec: a local copy of `'Last 30 days'` in the test and a different string in the component would both be green, and re-deriving the window in the spec would let a wrong implementation pass a self-consistent test. Expected day keys in the test are literals, given below.
**Assumes decision:** none. The plan's OQ-1 (auto-switch granularity on Last 90 days) and OQ-2 (keep the empty state's "Show all time" button) are both implemented at their stated defaults — grouping is untouched by a preset change, and the button stays. Flipping OQ-1 would add a `setGranularity` call in the select's handler and one assertion here; flipping OQ-2 would delete the button and move its recovery test onto this select. Neither changes a contract.

**Precedence rule:** if any code below contradicts the success criteria, **the criteria win** — implement what is correct and report the deviation rather than transcribing.

**Why this task exists:** This is the whole user-facing feature, and it is also the only place in the run where C-1/C-2/C-3 are exercised against real code rather than a fake — so it carries both the control and its own proof that the widened bounds reach the actual filtering path.

**Context for assigned agent:**

- Read `web/src/App.tsx` first. The filter card is the `<Card>` at lines 158-261; the `Group by` select at 187-207 is the markup and class list your new control must match (`h-11 w-[10.5rem] cursor-pointer appearance-none rounded-md border border-input …`). Reuse the existing `<Label>` + `<select>` shape — do **not** add a shadcn Select component or any new dependency.
- The Range select goes **first** in the `flex flex-wrap items-end gap-4` row, before `From`.
- `range` (`{ from, to }`) stays the single source of truth. There is **no** `preset` state variable. The select's `value` is `matchPreset(range, now)` and its `onChange` does `setRange(presetRange(value, now))`. That is the design decision the whole plan rests on: two pieces of state for one concept can desync, and `setRange` already has a second call site (the empty state's button at lines 300-311) that would have to remember to update it.
- **`now` must be frozen once at mount and shared.** Today `deps.now()` is read only inside the `range` initialiser (line 62). You need the same value during render, so lift it: `const [now] = useState(() => deps.now())`, then build the initial range from that same `now`. Reading `deps.now()` fresh on every render would make the select silently drift to Custom once the clock crossed into the next day — the existing "does not slide the range forward when the clock advances mid-session" test does not catch that, so the criterion and mutation below do.
- **`'custom'` is rendered only when it is active.** Options are `RANGE_PRESETS`, plus `'custom'` appended when `matchPreset` returns it. A permanently-present Custom option would be a choice whose handler has nothing to do.
- `App.tsx` already treats empty-string bounds as unbounded (lines 70-74, `from || undefined`), so `'all'` needs no filtering change.
- `web/src/App.test.tsx` uses two harnesses: `fakes()` (line 14) for fake `filterStats`/`usageSeries` with a `seen: StatsFilter[]` log, and `renderReal()` (line 154) for the real filtering layer over the shared fixture. Use `fakes()` for the control's behaviour and `renderReal()` for the widening proof — the fake's `filterStats` always returns rows, so the empty state can only be reached through `renderReal`.
- The shared fixture's days are `2026-07-09` and `2026-07-10`. `NOW` in the spec is `2026-07-10`. Do not edit `web/src/api/__fixtures__/aggregate-stats.json` — its headline numbers are hand-computed and asserted in both packages (`CLAUDE.md`, Cross-package contract).
- Styling is dark-only Tailwind v4 + shadcn/ui; there is no light token set and no theme provider. Do not introduce one.

**Success criteria:**

- The filter card has a control with accessible name `Range` whose options are exactly the four selectable presets, in `RANGE_PRESETS` order, labelled from `RANGE_PRESET_LABELS` — and `Custom` is **absent** from the options on first render.
- On first render the select reads `last7` and `filterStats` receives `from: '2026-07-04', to: '2026-07-10'` for `NOW = 2026-07-10` — unchanged from today's behaviour.
- Choosing `last30` makes the **next** `filterStats` call receive `{ from: '2026-06-11', to: '2026-07-10' }` and updates **both** date inputs to those values. A change that moves `from` and leaves `to` stale fails this.
- Choosing `all` makes `filterStats` receive `from: undefined` **and** `to: undefined` — not empty strings, which is what the existing `from || undefined` coercion is for.
- After hand-editing the `From` input to a date that matches no preset, the select reads `custom` and a `Custom` option now exists. Editing a date must never leave the select claiming a preset it no longer describes.
- When the injected clock advances mid-session (to `2026-07-20`) and a re-render is forced, the select **still** reads `last7` — the derivation uses the frozen mount-time `now`, not a fresh read.
- Clicking the empty state's `Show all time` leaves the select reading `all`, not `custom`.
- Through the **real** filtering layer with `now = 2026-08-02` (which puts the fixture's days outside the 7-day window): the page shows the empty state, and after choosing `last90` it renders `page-overview`. The reverse direction is what matters — a select that changed only the inputs and not the filter would leave the empty state up.
- Every existing test in `web/src/App.test.tsx` still passes with no edits to the `App default date range` describe (lines 130-151) or the `App granularity` describe (lines 99-128).
- Granularity is untouched by a preset change: choosing `last90` does not alter what `usageSeries` is called with beyond the new filtered stats.
- No files outside the three listed paths are modified.

**Files:**

- Modify: `web/src/App.tsx`
- Modify (append one describe; add cases to the existing real-layer describe; leave other describes untouched): `web/src/App.test.tsx`
- Modify: `CLAUDE.md` — one sentence in the Frontend section recording that the filter card's range presets are derived from `from`/`to` via `matchPreset` and never stored, so a future reader does not add a `preset` state variable back. Match the surrounding prose style and line width; do not restructure the section.

**Contract (the component surface this task owns):**

`App`'s public props and `AppDeps` are **unchanged** — `deps.now` keeps its signature and its meaning. The filter card gains one labelled `<select id="range">` whose `value` is `matchPreset(range, now)` and whose `onChange` sets `setRange(presetRange(e.target.value as SelectableRangePreset, now))`. `now` is `useState(() => deps.now())`, read once, and shared with the `range` initialiser. Option values are the raw preset identifiers (`last7`, `last30`, `last90`, `all`, and `custom` only while active); option text comes from `RANGE_PRESET_LABELS`.

**Test (append this describe to `web/src/App.test.tsx`, and add the two cases below to the existing `App integration with the real filtering layer` describe):**

```tsx
describe('App date range presets', () => {
  it('offers the four selectable presets and opens on the last seven days', () => {
    const { deps, seen } = fakes();
    render(<App stats={stats} deps={deps} />);
    const select = screen.getByLabelText('Range') as HTMLSelectElement;
    expect(select.value).toBe('last7');
    const options = [...select.options];
    expect(options.map((o) => o.value)).toStrictEqual(['last7', 'last30', 'last90', 'all']);
    expect(options.map((o) => o.textContent)).toStrictEqual([
      'Last 7 days',
      'Last 30 days',
      'Last 90 days',
      'All time',
    ]);
    expect(seen[0].from).toBe('2026-07-04');
    expect(seen[0].to).toBe('2026-07-10');
  });

  it('rewrites both bounds and both inputs when a wider preset is chosen', () => {
    const { deps, seen } = fakes();
    render(<App stats={stats} deps={deps} />);
    fireEvent.change(screen.getByLabelText('Range'), { target: { value: 'last30' } });
    const last = seen[seen.length - 1];
    expect(last.from).toBe('2026-06-11');
    expect(last.to).toBe('2026-07-10');
    expect((screen.getByLabelText('From') as HTMLInputElement).value).toBe('2026-06-11');
    expect((screen.getByLabelText('To') as HTMLInputElement).value).toBe('2026-07-10');
  });

  it('clears both bounds for all time', () => {
    const { deps, seen } = fakes();
    render(<App stats={stats} deps={deps} />);
    fireEvent.change(screen.getByLabelText('Range'), { target: { value: 'all' } });
    const last = seen[seen.length - 1];
    expect(last.from).toBeUndefined();
    expect(last.to).toBeUndefined();
    expect((screen.getByLabelText('From') as HTMLInputElement).value).toBe('');
  });

  it('reads custom once a date is edited by hand', () => {
    const { deps } = fakes();
    render(<App stats={stats} deps={deps} />);
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-07-09' } });
    const select = screen.getByLabelText('Range') as HTMLSelectElement;
    expect(select.value).toBe('custom');
    expect([...select.options].map((o) => o.value)).toContain('custom');
    expect([...select.options].map((o) => o.textContent)).toContain('Custom');
  });

  it('keeps reading last7 when the clock advances mid-session', () => {
    const { deps } = fakes();
    let current = new Date(2026, 6, 10);
    deps.now = () => current;
    render(<App stats={stats} deps={deps} />);
    current = new Date(2026, 6, 20);
    fireEvent.click(screen.getByRole('button', { name: 'Tools' }));
    expect((screen.getByLabelText('Range') as HTMLSelectElement).value).toBe('last7');
  });
});
```

Added to the existing `App integration with the real filtering layer` describe:

```tsx
  it('widens past the default range through the real filtering layer', () => {
    renderReal(new Date(2026, 7, 2));
    expect(screen.queryByTestId('page-overview')).toBeNull();
    fireEvent.change(screen.getByLabelText('Range'), { target: { value: 'last90' } });
    expect(screen.getByTestId('page-overview')).toBeTruthy();
    expect((screen.getByLabelText('From') as HTMLInputElement).value).toBe('2026-05-05');
  });

  it('reads all time, not custom, after the empty state clears the range', () => {
    renderReal(new Date(2026, 7, 2));
    fireEvent.click(screen.getByRole('button', { name: /show all time/i }));
    expect((screen.getByLabelText('Range') as HTMLSelectElement).value).toBe('all');
  });
```

**Implement** the control in `web/src/App.tsx` to satisfy that suite, matching the `Group by` select's markup and classes.

**Mutations to reject — apply each, confirm it fails, revert, and report the failure output.** Run the recorded `grep -cF` first and confirm `1`; extend the anchor with its leading indentation and record the extended form if not. The two counts marked *(verified at authoring time)* were checked against the current file.

- **M1 (hardcoded return):** in `web/src/App.tsx`, replace the select's `value={matchPreset(range, now)}` with `value={DEFAULT_RANGE_PRESET}`. `grep -cF 'matchPreset(range, now)' web/src/App.tsx` → must be `1`. The select stops tracking the range, so *reads custom once a date is edited by hand* fails on `select.value` and *reads all time, not custom, after the empty state clears the range* fails too.
- **M2 (dropped half of the write):** change the select's handler from `setRange(presetRange(...))` to `setRange((r) => ({ ...r, from: presetRange(...).from }))`, so only `from` is written. Anchor on the whole `onChange` line of the Range select and record its count. `to` stays at `2026-07-10` by luck in the `last30` case but the `all` case keeps `to` non-empty, so *clears both bounds for all time* fails on `last.to` being defined.
- **M3 (stale clock / dropped freeze):** change `const [now] = useState(() => deps.now())` to `const now = deps.now()`. `grep -cF 'useState(() => deps.now())' web/src/App.tsx` → must be `1` after your edit. On re-render the clock has advanced to `2026-07-20`, so the frozen range `2026-07-04..2026-07-10` no longer matches any window ending on the new `now`, and *keeps reading last7 when the clock advances mid-session* fails with `'custom'`. This mutation is the reason that test exists — nothing else in the file catches it.
- **M4 (order):** change the options source to `[...RANGE_PRESETS].reverse()`. `grep -cF 'RANGE_PRESETS.map(' web/src/App.tsx` → must be `1`. *offers the four selectable presets and opens on the last seven days* fails on the option-value `toStrictEqual`.
- **M5 (inverted predicate):** drop the conditional that appends `'custom'`, so the options are always exactly `RANGE_PRESETS`. Anchor on the line containing your `=== 'custom'` (or equivalent) test and record its count. *reads custom once a date is edited by hand* fails on the `toContain('custom')` assertion — and, because a `<select>` whose `value` matches no option falls back, the `select.value` assertion fails as well.
- **M6 (inputs decoupled from the filter):** in the Range select's handler, set the two date inputs' state but pass the *old* range to `filterStats` — concretely, keep `setRange` and change the `deps.filterStats` call at `web/src/App.tsx:70-74` to use `defaultDateRange(now)` instead of the current `range`. `grep -cF 'const { from, to } = range;' web/src/App.tsx` → `1` *(verified at authoring time)*. *widens past the default range through the real filtering layer* fails: the inputs read `2026-05-05` while the page still shows the empty state. This is the mutation the Wave 2 integration test exists for — every fake-based assertion in this file survives it.

Vitest transforms on read with no persistent artifact cache, so no cache-clearing step is needed between mutations.

**Verify:**

```bash
npm test --prefix web -- run src/App.test.tsx
```

Expected: `Test Files  1 passed (1)` with no failing tests, and every pre-existing describe still among the passes. Before implementing, the new describe must fail on the missing `Range` label.

**Review checklist (controller, before committing):**

- Re-run this task's verify command — expect `Test Files  1 passed (1)`, no failures. Root `npm test` and `npm run typecheck` are the Final Gate's.
- Apply **M6** and confirm *widens past the default range through the real filtering layer* fails; revert. This is the one worth your thirty seconds: it is the only mutation that separates "the control moves the inputs" from "the control moves the data", and it is invisible to every other test in the file.
- Apply **M3** and confirm *keeps reading last7 when the clock advances mid-session* fails; revert. A fresh `deps.now()` read looks harmless and correct in review.
- `git diff web/src/App.tsx` shows **no new state variable for the preset** — search the diff for `setPreset` / `useState<RangePreset>`. A stored preset is the design this plan explicitly rejected, and it passes every test above while reintroducing the desync.
- `git diff web/src/App.tsx` shows no hand-written preset label or day-key arithmetic — the strings and the windows come from `web/src/api/dateRange`. Also confirm no new dependency and no shadcn Select import.
- `git diff web/src/App.test.tsx` shows the `App default date range` and `App granularity` describes byte-unchanged, and `web/src/api/__fixtures__/aggregate-stats.json` absent from the diff entirely.
- `git status --porcelain` lists only this task's three paths.

**Commit (controller runs after review):**

```bash
git add -- web/src/App.tsx web/src/App.test.tsx CLAUDE.md
git commit -m "Let the filter card jump to the last 7, 30 or 90 days"
```

**Memory notes:**

- Session-memory candidates: this task is the real binding for C-1, C-2 and C-3 — until it lands, nothing outside `dateRange.test.ts` exercises them. If the Final Gate finds a preset bug, the fix belongs in Task 1's module, not here.
- Repo-memory candidates: "the filter card's presets are derived from `from`/`to`, never stored" — durable, and being written into `CLAUDE.md` by this task, so it needs no separate memory entry once that lands.

**Progress notes:** ✅ Completed. Commit `4922c68`. Success criteria: **MET** (all eleven). Files: `web/src/App.tsx`, `web/src/App.test.tsx`, `CLAUDE.md` — nothing outside the list.

Verified by controller: `npm test --prefix web -- run src/App.test.tsx` → `Test Files 1 passed (1)`, `Tests 30 passed (30)`.

Mutations re-proven mechanically by the controller (own script, anchor count asserted `1` for each, file restored byte-identical and re-verified `30 passed` afterwards): **M1 KILLED** (2 failed), **M2 KILLED** (1), **M3 KILLED** (1), **M4 KILLED** (1), **M5 KILLED** (1), **M6 KILLED** (5). Every count matches the agent's report.

Contracts: **C-1, C-2, C-3, C-4 consumed as declared.** `App.tsx` imports the real `./api/dateRange` (`defaultDateRange`, `matchPreset`, `presetRange`, `RANGE_PRESETS`, `RANGE_PRESET_LABELS`, `type SelectableRangePreset`); the diff contains no duplicated preset list, label string, or day-key arithmetic, and every expected day key in the spec is a literal. `AppDeps` and `App`'s props are unchanged. No amendment requested.

**Design decision held under review:** `git diff` contains no `setPreset` and no `useState<RangePreset>` — there is no stored preset. `range` remains the single source of truth and `const rangePreset = matchPreset(range, now)` is derived per render. The empty state's own `setRange` call site therefore needed no change, which is exactly the desync the plan rejected the stored variant to avoid.

**Finding 3 — M1's anchor and M5's anchor could not both be unique as written.** The brief asked for `value={matchPreset(range, now)}` inlined in the JSX *and* a separate `rangePreset === 'custom'` conditional, which forces two occurrences of the call. The agent computed it once into `const rangePreset = matchPreset(range, now);` and used `value={rangePreset}`, keeping both anchors at count 1. The contract's stated behaviour is unaffected (`value` *is* `matchPreset(range, now)`) and the mutation's semantics are unchanged. Accepted; this was a defect in the task doc's mutation spec, not in the code.

**Finding 4 — M6's blast radius was understated.** The brief claimed "every fake-based assertion in this file survives it"; in fact M6 also breaks two pre-existing tests (*sends the current date range on every date change*, *recovers from the empty state by clearing the range to all time*) and two new fake-based ones, for 5 failures total. The named integration test does fail as predicted, so the mutation is rejected either way — but the doc's claim about which tier catches it was wrong. Controller reproduced 5 failures independently.

**Finding 5 — M5's second assertion is unreachable.** *reads custom once a date is edited by hand* asserts `select.value` before `toContain('custom')`, so under M5 the run aborts at the first failure and only one of the two predicted assertion failures is observable. The mutation is still killed.

Deviations: the agent trimmed the pre-existing comment above the `range` initialiser from "Opens on the last 7 days; the initialiser runs once so the window does not slide out from under the user mid-session." to "Opens on the last 7 days.", because the new `now` comment one line above states the mid-session freeze. Reviewed and kept — the fact is now stated once, at the state it actually belongs to. The `range` initialiser still calls `defaultDateRange(now)` rather than `presetRange(DEFAULT_RANGE_PRESET, now)`; equivalent, since C-4 now delegates to exactly that, and it keeps the diff to one argument.

—

## Progress Summary

### Wave 1 Summary

- **Completed:** Task 1 (1 of 1).
- **Commits:** `c0b30fd` — Add date-range presets and the reverse lookup that names one. (`fc5794f` earlier carries the plan and this task doc.)
- **Amendments issued:** none. No contract needed changing; C-1/C-2/C-3 were implementable verbatim.
- **Issues:** two findings, both recorded in Task 1's progress notes. M3 is undetectable by construction (redundant branch, kept deliberately). M2's invariant is not asserted on a UTC machine — the web test run pins no `TZ`, and the controller confirmed the mutation survives all 20 tests under `TZ=UTC`. Scheduled as a Final Gate fix. Two false premises in the task doc itself (a `grep` anchor needing `--`, and a mispredicted pre-implementation failure mode) were corrected in place; neither reached another agent, since Wave 1 held one task.
- **Carry-forward notes:** Task 2 imports C-1/C-2/C-3 from the committed real module — no stand-in, and no local copy of the labels or the arithmetic. `DEFAULT_RANGE_DAYS` is now consumed by `PRESET_DAYS.last7` rather than by `defaultDateRange` directly; leave it exported. The `TZ` pin is unowned by any task and must not be folded into Task 2's diff — it lands as its own Final Gate commit.

### Wave 2 Summary

- **Completed:** Task 2 (1 of 1).
- **Commits:** `4922c68` — Let the filter card jump to the last 7, 30 or 90 days.
- **Amendments issued:** none. All four consumed contracts were usable exactly as declared; Wave 2 met reality without a single stand-in turning out to be more forgiving than the real thing, which is the failure mode this wave exists to catch.
- **Issues:** three findings, all defects in the task doc's own mutation spec rather than in the code — M1/M5 anchor uniqueness could not both hold as written, M6 breaks five tests rather than one, and M5's second assertion is unreachable behind its first. All recorded in Task 2's progress notes. No contract or success criterion was affected.
- **Carry-forward notes:** the `TZ` pin from Wave 1's Finding 2 is still outstanding and is the one remaining Final Gate fix. It touches `web/vite.config.mts`, which no task owns.

## Final Gate

_Filled in by executing-task. Nothing runs in CI for this repo, so the gate owns root `npm test` and `npm run typecheck` in full, then the review pass over the whole run diff (cross-task integration · unnamed-mutation search), then the plan's Success Criteria ticked with evidence per item. Worth a manual `npm run dev` pass too: the plan's OQ-1 asks whether 90 daily x-axis points are legible, and that is the only way to answer it._

—

## Carry-Forward Notes

_Cross-wave reminders, helpers introduced, scope decisions made mid-run. Append; never overwrite._

- Wave 2's spec is the first and only place C-1/C-2/C-3 are driven through real code; every other assertion on them is inside Task 1's own unit suite.

## Repo-Memory Candidates

_Durable facts surfaced during execution. Promote to real memory only once stable and verified._

- Scoped web test invocation in this repo is `npm test --prefix web -- run <path>` — verified by running it at authoring time. The root `npm test` reaches both packages and the one that does not own the file exits non-zero (already documented in `CLAUDE.md`).

## Final Summary

_Filled in by executing-task: total tasks, completed, deferred/blocked with the decision each needs, commits, amendments, issues, Final Gate findings and resolutions, verified repo-memory candidates, deviations from plan._

—
