---
type: task
title: "Turborepo Monorepo Tooling — Task Breakdown"
description: "Contract-first breakdown of the npm workspace consolidation and the Turborepo task graph layered on it, covering the root manifest, the server dev alias, the documentation reconciliation, and the empirical proving of the single-command dev flow."
status: in_progress
owner: "eric1234463@gmail.com"
ticket: "DASH-0000"
created: "2026-08-02"
related:
  - "docs/plans/2026-08-01-turborepo-monorepo-tooling.md"
  - "docs/tasks/2026-08-01-claude-usage-dashboard-tasks.md"
wiki: false
---

# Turborepo Monorepo Tooling — Task Breakdown

**Branch:** chore/DASH-0000-turborepo-monorepo-tooling
**Source plan:** [`docs/plans/2026-08-01-turborepo-monorepo-tooling.md`](../plans/2026-08-01-turborepo-monorepo-tooling.md)

## Test Baseline

Captured at commit `73ecb02` (clean tree, before any agent ran):

```
server: 8 test files, 76 tests passing
web:    8 test files, 74 tests passing
```

**Baseline is GREEN.** Any failure at the Final Gate is therefore attributable to this run, not
inherited. All Final Gate suite comparisons are against this record.

**OQ-1 resolved by default at dispatch:** document-only — no `CI=true` guard. C-3 stands exactly as
written in the registry. Recorded per the task doc's own rule that an unanswered OQ-1 takes the
documented default rather than blocking Task 5.

---

## Source Plan Summary

`server/` and `web/` are two independently-installed npm projects with their own lockfiles and `node_modules`; the root `package.json` is a set of `--prefix` shims with no `workspaces` field. The goal is one root command that starts both processes, plus root-level `test`/`build`/`typecheck`. The substantive change is the **workspace consolidation** — one root lockfile, hoisted `node_modules` — with `turbo.json` layered on top as a thin task graph (`dev` persistent and uncached; `build`/`test`/`typecheck` cacheable). Two non-obvious facts drive the design: the server's tests read a JSON fixture out of `web/`, an edge invisible to Turborepo's per-package hashing, so it must be declared globally or the cache replays stale passes; and `server` has no `dev` script at all, so without an alias `turbo run dev` silently starts Vite alone and exits 0.

## Execution Model

One parallel wave where the seams allow, then two short serial waves the file graph forces.

- Agents **implement and verify**; they run **no git commands**. All staging and committing belongs to the controller.
- Each agent reads **only its own task block** plus the registry entries it provides and consumes. It never sees the plan, the other task blocks, or this conversation.
- **Contracts are frozen once a wave dispatches.** An agent that finds its contract wrong reports to the controller and waits. Only the controller amends a contract, records it under Amendments by ID, and broadcasts to every listed consumer. Agents may message each other to *clarify* semantics; they may not agree a change between themselves.
- There is **no mid-run review gate**. The controller reviews and commits each task as it returns; one **Final Gate** at the end runs the full suite against baseline plus a review pass over the whole run diff.

### A deviation from the usual task-doc shape, stated up front

This is a **tooling migration with no unit-test-bearing tasks**. No task here adds an `it()` block, so the usual "complete test code" field is replaced by an **exact assertion script** per task. The repo's existing **150 tests (76 server, 74 web)** are the regression instrument, and they are the *Final Gate's* to run — with one deliberate exception noted in Task 1, whose entire correctness claim is "the suites still pass out of a hoisted tree" and which therefore has no file-scoped proof available to it.

---

## Preconditions

The controller checks these **before dispatching Wave 1**. Each takes seconds; a whole wave discovering the same problem in parallel wastes the wave.

```bash
# 1. Correct branch — the whole chain runs on one branch
git rev-parse --abbrev-ref HEAD          # expect: chore/DASH-0000-turborepo-monorepo-tooling

# 2. Clean tree — Task 1 is destructive (deletes lockfiles and node_modules)
git status --short                        # expect: empty, or only this task doc / the plan

# 3. Toolchain matches what the contracts declare
node -v                                   # expect: v24.x  (verified v24.13.0)
npm -v                                    # expect: 11.x   (verified 11.6.2)

# 4. Starting state is what the contracts assume
test -f server/package-lock.json && test -f web/package-lock.json && echo "child lockfiles present"
test ! -f package-lock.json && echo "no root lockfile — correct starting state"
node -e "if(require('./package.json').workspaces) throw new Error('workspaces already declared'); console.log('no workspaces field — correct')"
node -e "if(require('./server/package.json').scripts.dev) throw new Error('server dev already exists'); console.log('server has no dev script — correct')"

# 5. The cross-package fixture edge the registry depends on still exists
test -f web/src/api/__fixtures__/aggregate-stats.json && \
  grep -c "web/src/api/__fixtures__/aggregate-stats.json" server/test/stats.integration.test.ts server/src/stats/stats.module.test.ts
# expect: both files report 1
```

**If precondition 2 fails:** stop. Task 1 deletes `node_modules` and both lockfiles; unrelated uncommitted work makes a bad install impossible to disentangle from in-progress code.

**If precondition 4 fails** (any part already done): stop and reconcile. The contracts describe a transition from a specific starting state; a partially-migrated tree makes Task 1's baseline capture meaningless.

**If precondition 5 fails:** stop and escalate. C-4's `globalDependencies` entry exists solely to cover that edge. If the fixture moved, the contract is wrong and must be amended before dispatch, not after.

### Plan-vs-repo reconciliation

Everything the plan names was checked against the repo. Findings that shaped this breakdown:

| Plan claim | Repo reality | Effect |
|---|---|---|
| Branch `feature/DASH-0000-claude-usage-dashboard` | That branch **merged to `main`** during planning; the plan is committed on `main` | New branch `chore/DASH-0000-turborepo-monorepo-tooling` cut off `main`; the plan's Branch line was updated to match |
| Baseline "server 8/69, web 8/57" | Now **76 server / 74 web** — the dashboard wave landed mid-planning | Confirms the plan's rule that no number in it is authoritative. Task 1 captures its own baseline (C-5) |
| `server` builds to `dist/` | `server/dist` **does not exist** (never built); `web/dist` does | C-4's `outputs: ["dist/**"]` is per-package and correct either way; Task 6 must create both from cold |
| Root `package.json` has three `server:*` shims | Confirmed, lines 6–8 | Task 1 removes all three |
| `README.md` publishes `npm install --prefix server` | Confirmed, line 15 — and it is the **only** install instruction the repo publishes | Task 3, Wave 1 (live danger) |
| Dashboard task doc has install commands | Confirmed — 6 of them, but the doc is **complete** (15/15, Final Summary written) | Task 4 adds a superseded note; the commands stay as written, because they record a run that happened |

**The plan's phase list is superseded by the wave structure below**, which is expected rather than a deviation: Phase 1's work splits across four tasks by file ownership, and Phase 3's documentation half moved into Wave 1 where the danger actually is. Every task carries a `Phase:` field tying it back.

---

## Contract Registry

> **Amendment rule.** A contract is frozen once its wave dispatches. An agent that finds its contract wrong or insufficient reports it to the controller and waits; the controller decides, records an amendment against the contract ID below, and broadcasts it to every consumer listed. Agents may message each other freely to *clarify* semantics inside a contract, and may **not** agree a change to one between themselves.

### C-1 — Workspace script-name set

**Surface.** Both workspaces expose these four script names, each invocable as `npm run <name> -w <pkg>`:

| Script | `server` | `web` |
|---|---|---|
| `dev` | `npm run start:dev` — **added by Task 2** | `vite` (pre-existing) |
| `build` | `tsc -p tsconfig.build.json` | `tsc --noEmit && vite build` |
| `test` | `vitest` | `vitest` |
| `typecheck` | `tsc --noEmit` | `tsc --noEmit` |

Two properties are load-bearing and must not change: **`test` stays bare `vitest` in both packages** (it must accept a trailing positional Vitest argument, which is how C-3's root test script forces single-run), and **`start:dev` keeps its existing definition** (`node --watch -r ts-node/register src/main.ts`) because the completed dashboard task doc declares it at line 796.

- **Owner:** Task 2 — the server `dev` alias is the only change this contract needs; web's four already exist.
- **Consumers:** Task 5 (turbo.json addresses these names), Task 6 (proves each root task reports two package-tasks).
- **Stand-in:** Task 5 authors `turbo.json` against the name set as written above — Turborepo matches by name, so nothing needs to exist for the config to be authored and reviewed. Task 6 is Wave 3 and runs against the real thing.

### C-2 — Root workspace layout

**Surface.** Root `package.json` contains exactly:

```json
"workspaces": ["server", "web"],
"devEngines": { "packageManager": { "name": "npm", "version": ">=11.0.0" } }
```

and **no** `server:install` / `server:test` / `server:dev` scripts. Exactly one lockfile exists, at `./package-lock.json`; none under `server/` or `web/`.

The workspace array is **explicit, never a glob** — `.claude/worktrees/` holds full second checkouts with their own `server/` and `web/` directories, which a glob would discover. The `devEngines` version is a **range, not a pin**: it guards against a different package manager, and pinning an exact npm version would hard-fail installs on any npm upgrade.

- **Owner:** Task 1
- **Consumers:** Task 5 (edits the same file and must preserve these keys verbatim), Task 6
- **Stand-in:** none needed — Task 5 is Wave 2, so Task 1 is committed before it dispatches and it edits the real file.

### C-3 — Root script interface

**Surface.** Root `package.json` scripts, after Task 5:

```json
"dev": "turbo run dev",
"build": "turbo run build",
"test": "turbo run test -- run",
"typecheck": "turbo run typecheck"
```

Each script invokes **exactly one** turbo task. This is not stylistic: `turbo run build test -- <args>` is ambiguous when pass-through arguments would reach multiple tasks, so the scripts cannot be combined.

The `-- run` on `test` is what makes the root command single-run — both packages' `test` scripts are bare `vitest`, which watches in an interactive terminal, and Turborepo's TUI allocates a pty per task. Three consequences a consumer must know: pass-through arguments are **part of the task hash**, so `npm test` and a bare `turbo run test` address different cache entries; the root test command has **no file-scoped form**, because the filter reaches both packages and the one not owning the file exits 1 for want of `passWithNoTests`; and there is no root-level `--filter=<pkg>` escape hatch, because `--` is already consumed.

- **Owner:** Task 5
- **Consumers:** Task 6
- **Stand-in:** none needed — Task 6 is Wave 3.

### C-4 — Turborepo task graph

**Surface.** `turbo.json` at the repo root, complete file:

```json
{
  "$schema": "https://turborepo.dev/schema.json",
  "globalDependencies": ["web/src/api/__fixtures__/aggregate-stats.json"],
  "tasks": {
    "dev": { "cache": false, "persistent": true },
    "build": { "outputs": ["dist/**"] },
    "test": {},
    "typecheck": {}
  }
}
```

Three declarations carry the design and must not be "tidied":

- **`globalDependencies`** covers the cross-package fixture edge. `server/test/stats.integration.test.ts:29` and `server/src/stats/stats.module.test.ts:16` both `path.resolve` into `web/src/api/__fixtures__/aggregate-stats.json`. Turborepo hashes a task against files in **its own package**, and `inputs` globs are package-relative and cannot escape upward — so without this entry, editing the fixture leaves `server#test`'s hash untouched and the cache **replays a recorded pass over a suite that would now fail**. The path is root-relative and must stay in the **root** `turbo.json`; `globalDependencies` is rejected in Package Configurations. Accepted cost: a fixture edit busts every task's cache.
- **`outputs` on `build`** — a task with no `outputs` caches **logs only**. Both packages build to a gitignored `dist/`, and `server`'s `start` script is `node dist/main.js`, so an undeclared build would take a cache hit, replay logs, restore nothing, and leave `start` failing against a build that just "succeeded". `test` and `typecheck` produce no files and declare none — that emptiness is deliberate, not forgotten.
- **No `dependsOn` anywhere.** The conventional `build: { dependsOn: ["^build"] }` orders a package's build after its *internal workspace dependencies*. There is no manifest edge between `server` and `web`, so `^build` resolves to an empty set and would be decoration. This is a statement about the **manifest** graph only — the fixture edge above is real, and is handled by `globalDependencies` because it is a test-time file read, not a build-order constraint.

- **Owner:** Task 5
- **Consumers:** Task 6
- **Stand-in:** none needed — Task 6 is Wave 3.

### C-5 — Pre-migration baseline record

**Surface.** A record captured by Task 1 **before any deletion**, reported in its return message, and written by the controller into the Wave 1 Summary below:

```
server: <N> test files, <M> tests passing
web:    <N> test files, <M> tests passing
resolved versions: typescript@<v>, vitest@<v>, vite@<v>, reflect-metadata@<v>
```

- **Owner:** Task 1
- **Consumers:** Task 6
- **Stand-in:** Task 6 reads it from the Wave 1 Summary. If the controller has not recorded it, **Task 6 stops and asks** rather than re-deriving — pre-migration state is not reconstructible from a migrated tree without checking out the parent commit, and a silently re-derived "baseline" would compare the migration against itself.

### Amendments

_None yet. The controller records amendments here by contract ID, with the date, the reason, and the consumers notified._

| ID | Date | Change | Consumers notified |
|----|------|--------|--------------------|
| —  | —    | —      | —                  |

---

## Wave Overview

| Wave | Tasks | Plan phase | Why not earlier |
|---|---|---|---|
| **0** | _skipped_ | — | Nothing must resolve at import time. The contracts here are script names, JSON config shapes, and a documentation state — no interfaces, types, or symbols a consumer imports. A Wave 0 would be a serial commit for nothing. |
| **1** | T1 workspace consolidation · T2 server `dev` alias · T3 README · T4 task-doc note | Phase 1 (T1–T3), Phase 3 (T4) | — |
| **2** | T5 turbo layer | Phase 2 | **T5 modifies `package.json` and `package-lock.json`, both owned by T1 in Wave 1.** Turbo cannot be added as a root devDependency until the workspace exists, and the install that adds it rewrites the lockfile T1 generates. `Same agent as Task 1`. |
| **3** | T6 prove the commands | Phase 3 | **Every observation requires turbo installed and the graph in place** — the dev flow through the proxy, the cache miss/hit behavior, the two-package-task counts. No stand-in can produce a real cache entry. Also re-edits `README.md` (T3's file). `Same agent as Task 3`. |

### File-ownership check

Every task's paths, listed and compared:

| Path | T1 | T2 | T3 | T4 | T5 | T6 |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| `package.json` | ✅ own | | | | ⚠️ W2 | |
| `package-lock.json` | ✅ own (create) | | | | ⚠️ W2 | |
| `server/package-lock.json` | ✅ own (delete) | | | | | |
| `web/package-lock.json` | ✅ own (delete) | | | | | |
| `server/package.json` | | ✅ own | | | | |
| `README.md` | | | ✅ own | | | ⚠️ W3 |
| `docs/tasks/2026-08-01-claude-usage-dashboard-tasks.md` | | | | ✅ own | | |
| `turbo.json` | | | | | ✅ own (create) | |
| `.gitignore` | | | | | ✅ own | |

**Within Wave 1, no path appears twice.** ⚠️ marks legal cross-wave overlap — the earlier wave is committed before the later one dispatches, and both later tasks carry a `Same agent as` marker so the controller routes them to the author rather than paying a fresh agent's re-orientation.

No two tasks in a wave share a lockfile, generated file, snapshot, migration sequence, or barrel export.

### Concurrency hazard specific to this run

**Task 1 deletes and recreates `node_modules` while Tasks 2–4 are running in the same tree.** Tasks 2, 3, and 4 therefore run **no `npm` command at all** — their verifications use `node -e` and `grep`, which need no project dependencies. This constraint is stated in each of their briefs. A Wave 1 agent that runs `npm test` will either fail spuriously or corrupt Task 1's install.

### Open question reaching into a contract

**OQ-1 (from the plan) touches C-3.** A bare `turbo run test`, invoked directly rather than through the root script, still enters watch mode. The default is **document-only** — nothing is built, and the README names the root scripts as the supported interface. Under the alternative, C-3's `test` script gains a `CI=true` prefix so Vitest refuses to watch regardless of entry point.

This contaminates exactly **one** task (T5, which owns C-3) and only if the answer is "guard". **Answer before Wave 2 dispatches**; Wave 1 is unaffected either way. If unanswered by then, the controller takes the documented default and records it as a decision rather than leaving T5 blocked.

---

# Wave 1

Four tasks, dispatched together. No task waits for another.

---

## Task 1: Consolidate `server` and `web` into one npm workspace

**Status:** ⬜ Not Started
**Phase:** 1 · **Wave:** 1
**Provides:** C-2, C-5
**Consumes:** none
**Assumes decision:** none

**Files:**
- Modify: `package.json`
- Create: `package-lock.json`
- Delete: `server/package-lock.json`, `web/package-lock.json`
- Delete (untracked, gitignored): `server/node_modules/`, `web/node_modules/`

**Do not touch any other path.** In particular `server/package.json` belongs to Task 2 and `README.md` to Task 3, both running concurrently.

### Why this task exists

This is the substantive half of the whole migration. Turborepo does not manage installs — it reads the package manager's workspace config — so everything else in this run is a thin layer on top of the consolidation you are doing here. It is also the only task carrying real risk: dependency re-resolution and hoisted module resolution.

### Context you need

`server/` and `web/` are currently two independently-installed npm projects, each with its own lockfile and `node_modules`, and the root `package.json` is three `--prefix` shim scripts with no `workspaces` field. Every dependency uses a `^` range, so a fresh install can resolve newer minors than what is on disk today — which is why you capture a baseline **before** deleting anything.

The two packages share only `typescript@^5.7.0` and `vitest@^4.1.10`, at identical ranges, so hoisting resolves one copy of each and neither package gets a version it did not already have. `server` is `"type": "commonjs"` and `web` is `"type": "module"`; each keeps its own `package.json` and its own `type` field, and workspaces do not merge them.

One resolution detail matters more than it looks: no file under `server/` imports `reflect-metadata` directly — it is a declared dependency that arrives transitively through `@nestjs/core`, and Nest's `emitDecoratorMetadata` depends on exactly one copy being loaded. A duplicated copy in a hoisted tree fails in ways that are hard to localize, so you assert the copy count directly.

### Contract you provide

**C-2 — Root workspace layout.** Root `package.json` contains exactly:

```json
"workspaces": ["server", "web"],
"devEngines": { "packageManager": { "name": "npm", "version": ">=11.0.0" } }
```

and **no** `server:install` / `server:test` / `server:dev` scripts. Exactly one lockfile, at `./package-lock.json`; none under `server/` or `web/`.

The workspace array is **explicit, never a glob** — `.claude/worktrees/` holds full second checkouts containing their own `server/` and `web/` directories, which a glob would discover. The `devEngines` version is a **range, not a pin**: it guards against a different package manager, and pinning an exact npm version would hard-fail installs on any npm upgrade.

Keep `name`, `private`, and `version` as they are. Do not add a `scripts` block — Task 5 adds the root scripts in Wave 2.

**C-5 — Pre-migration baseline record.** Captured before any deletion, and **reported in your final message** in exactly this shape:

```
server: <N> test files, <M> tests passing
web:    <N> test files, <M> tests passing
resolved versions: typescript@<v>, vitest@<v>, vite@<v>, reflect-metadata@<v>
```

### Steps

1. **Capture the baseline first — nothing is reversible after step 3.**
   ```bash
   (cd server && npx vitest run --reporter=dot 2>&1 | tail -5)
   (cd web    && npx vitest run --reporter=dot 2>&1 | tail -5)
   (cd server && npm ls typescript vitest reflect-metadata 2>&1 | tail -8)
   (cd web    && npm ls typescript vitest vite 2>&1 | tail -8)
   ```
   Record every number and version. If either suite is **not** green, stop and report — you cannot baseline against a red tree.
2. Edit `package.json` to match C-2: add `workspaces` and `devEngines`, remove the three `server:*` scripts (leaving no `scripts` key at all, or an empty object — your call, but say which).
3. Delete `server/package-lock.json`, `web/package-lock.json`, `server/node_modules/`, `web/node_modules/`.
4. Run `npm install` from the repo root. Expect a single `package-lock.json` to appear at the root and a single hoisted `node_modules/`.
5. Run the verification block below.
6. **Do not run any git command.** Report your baseline and results; the controller reviews and commits.

### Verification

> **Deliberate exception to file-scoped verification.** This task's own files are a manifest and a lockfile, which have no assertable behavior of their own — the correctness claim *is* "both suites still pass out of a hoisted tree". Running them here is not a demotion of the Final Gate's suite run; it is the only proof this task has.

```bash
# a. The workspace resolves, and to exactly two packages
npm ls --workspaces --depth=0
# expect: both claude-usage-dashboard-server and claude-usage-dashboard-web listed

# b. Exactly one lockfile, and it is at the root
test -f package-lock.json && echo "root lockfile: present"
test ! -f server/package-lock.json && test ! -f web/package-lock.json && echo "child lockfiles: gone"

# c. C-2's shape, asserted rather than eyeballed
node -e "
const p=require('./package.json');
if(JSON.stringify(p.workspaces)!==JSON.stringify(['server','web'])) throw new Error('workspaces: '+JSON.stringify(p.workspaces));
if(p.devEngines?.packageManager?.name!=='npm') throw new Error('devEngines.packageManager.name missing');
for(const k of ['server:install','server:test','server:dev']) if(p.scripts?.[k]) throw new Error('shim survived: '+k);
console.log('C-2 OK');
"

# d. Exactly one reflect-metadata in the hoisted tree
npm ls reflect-metadata --all 2>&1 | grep -c "reflect-metadata@"
# expect: every line reports the same version; no second distinct version anywhere

# e. Both suites, out of the hoisted tree, against the step-1 baseline
npm test --prefix server -- run
npm test --prefix web -- run
# expect: file and test counts identical to the baseline you captured in step 1

# f. Both type checks
npm run typecheck --prefix server
npm run typecheck --prefix web
# expect: both exit 0, no output
```

### Mutations to reject

Apply each, confirm the stated check fails, revert, and **report the failure output**:

1. **Remove `"web"` from the `workspaces` array** → check (a) lists one package, and `web`'s dependencies vanish from the hoisted tree.
2. **Restore `"server:install": "npm install --prefix server"` to the scripts block** → check (c) throws `shim survived: server:install`.
3. **Change `devEngines.packageManager.name` to `"pnpm"`** → `npm install` hard-fails with a package-manager error rather than warning. This also confirms the plan's Assumption 6 about the failure mode; report what npm actually printed.

### Success criteria

- [ ] Baseline captured **before** deletion and reported in the C-5 shape
- [ ] Root `package.json` matches C-2 exactly; `name`/`private`/`version` unchanged; no root `scripts` added
- [ ] Exactly one `package-lock.json`, at the root; none under `server/` or `web/`
- [ ] Both suites pass with counts **identical** to the baseline — a differing count is dependency drift, not a flake, and is a blocking failure
- [ ] Resolved versions of `typescript`, `vitest`, `vite`, `reflect-metadata` unchanged from baseline
- [ ] Exactly one `reflect-metadata` resolves
- [ ] Both type checks exit 0
- [ ] All three mutations applied, failures observed, output reported

### Controller review checklist

- [ ] Re-run verification (a), (b), (c), (e) yourself — do not accept reported output for the suite counts
- [ ] Diff `package.json` and confirm **only** the intended keys changed; `name`, `private`, `version` untouched
- [ ] Confirm the reported baseline is recorded in the Wave 1 Summary below **before committing** — C-5's consumer (Task 6) reads it from there, and it is unrecoverable once this commits
- [ ] Confirm `git status` shows the two child lockfiles as deleted, and that no `node_modules` path is staged
- [ ] Spot-check one mutation by applying it yourself
- [ ] If suite counts differ from baseline: **do not commit.** Pin the drifting package and re-verify

### Commit (controller runs after review)

```bash
git add -- package.json package-lock.json server/package-lock.json web/package-lock.json
git commit -m "Consolidate server and web into one npm workspace"
```

### Progress notes

_—_

---

## Task 2: Add the server `dev` script alias

**Status:** ⬜ Not Started
**Phase:** 1 · **Wave:** 1
**Provides:** C-1
**Consumes:** none
**Assumes decision:** none

**Files:**
- Modify: `server/package.json`

**Do not touch any other path**, and **run no `npm` command** — Task 1 is concurrently deleting and recreating `node_modules`, so any install or test invocation will either fail spuriously or corrupt its work. Your verification uses `node -e` only, which needs no project dependencies.

### Why this task exists

Turborepo dispatches strictly by script name and **silently skips a package that lacks the name, still exiting 0**. `server` has no `dev` script — its watch process is called `start:dev`. Without this alias, the feature's headline command starts Vite alone and looks successful. This is the single most likely way the whole migration ships broken, and it is a one-line change.

### Context you need

`server/package.json` currently declares exactly five scripts:

```json
"test": "vitest",
"typecheck": "tsc --noEmit",
"build": "tsc -p tsconfig.build.json",
"start": "node dist/main.js",
"start:dev": "node --watch -r ts-node/register src/main.ts"
```

You are **adding** `dev`, not renaming `start:dev`. The rename would be conventional but it breaks the completed dashboard task doc, which declares `start:dev` at line 796 as part of the record of a run that already happened.

Equally, `test` must stay **bare `vitest`**. It looks like it should become `vitest run`, and that would be wrong: the root test script (C-3, Task 5) forces single-run by forwarding a positional `run` through Turborepo, which only works if the package script accepts a trailing argument. Changing `test` here breaks that *and* breaks the `npm test --prefix <pkg> -- run <path>` idiom the dashboard run used ~44 times and recorded as repo memory.

### Contract you provide

**C-1 — Workspace script-name set.** After this task, `server` exposes `dev`, `build`, `test`, `typecheck` (matching `web`, which already has all four). The added script is exactly:

```json
"dev": "npm run start:dev"
```

Two properties must survive unchanged: **`test` stays exactly `vitest`**, and **`start:dev` keeps its existing definition** (`node --watch -r ts-node/register src/main.ts`).

### Steps

1. Add the `dev` script to `server/package.json`. Place it adjacent to `start:dev` so the relationship reads at a glance.
2. Change nothing else in the file — not the existing scripts, not the dependency blocks, not `type`.
3. Run the verification below.
4. **Do not run any git command.**

### Verification

```bash
node -e "
const s = require('./server/package.json').scripts;
if (s.dev !== 'npm run start:dev') throw new Error('dev alias wrong: ' + s.dev);
if (s['start:dev'] !== 'node --watch -r ts-node/register src/main.ts') throw new Error('start:dev was modified: ' + s['start:dev']);
if (s.test !== 'vitest') throw new Error('test must stay bare vitest, got: ' + s.test);
for (const k of ['build','typecheck','start']) if (!s[k]) throw new Error('lost script: ' + k);
const web = require('./web/package.json').scripts;
for (const k of ['dev','build','test','typecheck']) {
  if (!s[k]) throw new Error('server missing C-1 script: ' + k);
  if (!web[k]) throw new Error('web missing C-1 script: ' + k);
}
console.log('C-1 OK — both packages expose dev, build, test, typecheck');
"
```

Expected output: `C-1 OK — both packages expose dev, build, test, typecheck`

### Mutations to reject

Apply each, confirm the assertion fails, revert, and **report the failure output**:

1. **Set `dev` to `npm run start`** (the non-watch script) → the first assertion throws `dev alias wrong: npm run start`. This is the plausible wrong implementation: `start` and `start:dev` differ by one segment, and the wrong one runs `dist/main.js`, which does not exist.
2. **Change `test` to `vitest run`** → throws `test must stay bare vitest`. This is the "obvious improvement" that would silently break C-3's argument forwarding.
3. **Rename `start:dev` to `dev` instead of adding an alias** → throws `start:dev was modified`.

### Success criteria

- [ ] `server/package.json` declares `"dev": "npm run start:dev"`
- [ ] `start:dev`, `test`, `build`, `typecheck`, `start` all unchanged
- [ ] Both packages expose all four C-1 names
- [ ] No `npm` command was run during this task
- [ ] All three mutations applied, failures observed, output reported

### Controller review checklist

- [ ] Diff is **one added line** in `server/package.json` — anything more is out of scope
- [ ] Re-run the verification script yourself
- [ ] Confirm `test` is still bare `vitest` — this is the property most likely to be "helpfully" improved, and breaking it breaks C-3 in Wave 2
- [ ] Spot-check mutation 2 by applying it yourself

### Commit (controller runs after review)

```bash
git add -- server/package.json
git commit -m "Add a dev script alias so Turborepo can start the server"
```

### Progress notes

_—_

---

## Task 3: Rewrite the README Development section

**Status:** ⬜ Not Started
**Phase:** 1 · **Wave:** 1
**Provides:** none
**Consumes:** none
**Assumes decision:** none

**Files:**
- Modify: `README.md`

**Do not touch any other path**, and **run no `npm` command** — Task 1 is concurrently deleting and recreating `node_modules`. Your verification is `grep` only.

### Why this task exists

`README.md:15` is `npm install --prefix server` — the repo's **only** published install instruction, and it recreates the child lockfile and nested `node_modules` that Task 1 is deleting right now. Leaving it until a later wave would mean the repo spends the whole migration publishing the command that reverses it. That is why this is Wave 1 and not documentation cleanup at the end.

### Context you need

The current Development section is exactly three lines of fenced bash at `README.md:12–17`:

```bash
npm install --prefix server
npm test --prefix server
```

Write the **post-Wave-1 truth, not the final state.** After this wave, `npm install` at the root works and each package's scripts run via `-w`, but there is **no root `dev`/`test`/`build` command yet** — those arrive with Turborepo in Wave 2, and Task 6 updates this section again to document them. Do not document commands that do not work yet; a README describing a future state is worse than one describing a gap.

Do not touch the `# Claude Usage Dashboard` heading, the intro paragraph, or the `## Layout` section.

### Steps

1. Replace the Development section's body so that it: installs once from the repo root; shows how to run each package's dev process and tests individually via `-w`; and states plainly that root-level commands are not wired up yet.
2. Add a short note that a fresh git worktree needs its own root `npm install`, since hoisted `node_modules` lives at the checkout root and each worktree is a separate checkout. This repo does run agents in worktrees.
3. Run the verification below.
4. **Do not run any git command.**

Suggested shape — adapt the prose, keep the commands exact:

```bash
npm install                      # once, from the repo root — installs both workspaces

npm run dev -w server            # NestJS on :3000
npm run dev -w web               # Vite on :5173, proxying /api to :3000

npm test --prefix server -- run  # file-scoped: append a path
npm test --prefix web -- run
```

### Verification

```bash
# a. The dangerous command is gone
grep -c "npm install --prefix" README.md
# expect: 0

# b. Root install is published
grep -qE '^npm install\s*($|#)' README.md && echo "root install: documented"

# c. Untouched sections survive
grep -q "^# Claude Usage Dashboard" README.md && grep -q "^## Layout" README.md && echo "structure intact"

# d. No command is documented that does not exist yet
grep -cE '^npm run (dev|build|typecheck)\s*$|^npm test\s*$' README.md
# expect: 0 — bare root scripts arrive in Wave 2 (C-3), documented by Task 6
```

### Mutations to reject

Apply each, confirm the check fails, revert, and **report the failure output**:

1. **Leave one `npm install --prefix server` in place** → check (a) reports non-zero.
2. **Document the final root interface early** — add a bare `npm run dev` line → check (d) reports non-zero. This is the tempting error: the plan describes that interface, but it does not exist until Wave 2, and a README promising it is a broken instruction for the whole interval.

### Success criteria

- [ ] No `npm install --prefix` anywhere in `README.md`
- [ ] Root `npm install` documented as the install path
- [ ] Per-package dev and test commands documented and correct for the post-Wave-1 state
- [ ] The `npm test --prefix <pkg> -- run <path>` idiom is preserved as the file-scoped form
- [ ] Worktree note present
- [ ] No root-level `dev`/`build`/`test`/`typecheck` command documented — those are Task 6's
- [ ] Heading, intro, and Layout section unchanged
- [ ] No `npm` command was run during this task
- [ ] Both mutations applied, failures observed, output reported

### Controller review checklist

- [ ] Re-run checks (a) and (d) yourself
- [ ] Read the diff: confirm it is confined to the Development section
- [ ] Confirm nothing documents a root script — Task 6 owns that, and an early mention becomes stale instruction for two waves
- [ ] Confirm the documented per-package commands actually work as written once Task 1 has landed

### Commit (controller runs after review)

```bash
git add -- README.md
git commit -m "Document the workspace install and per-package commands"
```

### Progress notes

_—_

---

## Task 4: Mark the completed dashboard task doc superseded

**Status:** ⬜ Not Started
**Phase:** 3 · **Wave:** 1
**Provides:** none
**Consumes:** none
**Assumes decision:** none

**Files:**
- Modify: `docs/tasks/2026-08-01-claude-usage-dashboard-tasks.md`

**Do not touch any other path**, and **run no `npm` command** — Task 1 is concurrently rebuilding `node_modules`. Your verification is `grep` only.

### Why this task exists

That document contains six `npm install --prefix` commands (lines 758, 771, 923 for `server`; 1193, 1204, 1409 for `web`) which, if run after this migration, recreate exactly the child lockfiles Task 1 deletes. But the document is **complete** — 15/15 tasks, Final Summary written — so those lines are a record of what was actually run. Rewriting them would make the document describe a run that never happened.

So the fix is a pointer, not an edit to the commands.

### Context you need

This is a historical record, and it is the only surviving account of how the dashboard was built. Treat it as read-mostly. You are adding **one note near the top** and changing nothing else — in particular **do not touch** any of the six install commands, any of the ~44 `npm test --prefix …` commands (those still work and are preserved deliberately), the Final Summary, or any task's status marker.

The note exists for a future reader who opens this doc to learn the repo and copies a command out of it.

### Steps

1. Insert a short blockquote note immediately after the `# Claude Code Usage Dashboard - Task Breakdown` heading (the frontmatter ends at line 13; the heading is line 15).
2. It must say: the repo moved to an npm workspace + Turborepo after this run completed; the `npm install --prefix …` commands below are historical and **must not be run**; root `npm install` replaces them; and `npm test --prefix <pkg> -- run <path>` still works as written. Link to `../plans/2026-08-01-turborepo-monorepo-tooling.md`.
3. Run the verification below.
4. **Do not run any git command.**

### Verification

```bash
D=docs/tasks/2026-08-01-claude-usage-dashboard-tasks.md

# a. The note exists, near the top, and warns against the install commands
head -30 "$D" | grep -qi "supersed\|historical" && echo "note: present near top"
head -30 "$D" | grep -q "turborepo-monorepo-tooling" && echo "note: links the plan"

# b. The historical record is byte-for-byte intact
grep -c "npm install --prefix" "$D"      # expect: 6
grep -c "npm test --prefix"    "$D"      # expect: 44
grep -c "^## Final Summary"    "$D"      # expect: 1

# c. No status marker was disturbed
grep -c "✅ Completed" "$D"
# expect: unchanged from before your edit — capture the count first
```

### Mutations to reject

Apply each, confirm the check fails, revert, and **report the failure output**:

1. **"Helpfully" rewrite one `npm install --prefix server` to `npm install`** → check (b) reports 5 instead of 6. This is the failure this task exists to prevent: it falsifies the record of an executed run.
2. **Put the note at the bottom instead of the top** → check (a) finds nothing in the first 30 lines. A warning after 4,600 lines is not a warning.

### Success criteria

- [ ] One note added immediately after the H1, warning against the historical install commands and linking the plan
- [ ] All six `npm install --prefix` occurrences **unchanged**
- [ ] All 44 `npm test --prefix` occurrences unchanged
- [ ] Final Summary, task statuses, and frontmatter untouched
- [ ] Diff is the added note and nothing else
- [ ] No `npm` command was run during this task
- [ ] Both mutations applied, failures observed, output reported

### Controller review checklist

- [ ] `git diff --stat` shows a small positive line count and **zero deletions** — any deletion means historical content was altered
- [ ] Re-run check (b) yourself
- [ ] Confirm the note names the plan by path so a reader can follow it

### Commit (controller runs after review)

```bash
git add -- docs/tasks/2026-08-01-claude-usage-dashboard-tasks.md
git commit -m "Note that the dashboard run's install commands are superseded"
```

### Progress notes

_—_

---

## Wave 1 Summary

**Status:** ⬜ Not Started

**C-5 baseline record — the controller writes Task 1's reported baseline here before committing it. Task 6 reads it from this block.**

```
server: — test files, — tests passing
web:    — test files, — tests passing
resolved versions: typescript@—, vitest@—, vite@—, reflect-metadata@—
```

_Commits, deviations, and carry-forward notes: —_

---

# Wave 2

One task. Dispatches only after Wave 1 is committed.

---

## Task 5: Add the Turborepo task graph and root scripts

**Status:** ⬜ Not Started
**Phase:** 2 · **Wave:** 2 · **Same agent as Task 1**
**Provides:** C-3, C-4
**Consumes:** C-1 (owner Task 2), C-2 (owner Task 1)
**Assumes decision:** **OQ-1** — whether a bare `turbo run test` needs a guard. Default is document-only, under which C-3 is exactly as written below. Under "guard", C-3's `test` script becomes `CI=true turbo run test -- run`. **The controller answers this before dispatching this task.**

**Files:**
- Create: `turbo.json`
- Modify: `package.json` (adds `turbo` devDependency and the four root scripts — Task 1's keys must survive verbatim)
- Modify: `package-lock.json` (regenerated by the install that adds turbo)
- Modify: `.gitignore`

### Why this task exists

Wave 1 produced a working npm workspace with no root-level commands. This task adds the orchestration layer that makes `npm run dev` start both processes.

It is in Wave 2 for a mechanical reason: it edits `package.json` and `package-lock.json`, both owned by Task 1 in Wave 1. Turbo cannot be added as a root devDependency before the workspace exists, and the install that adds it rewrites the lockfile Task 1 generated.

### Context you need

Turborepo does not manage installs — it reads the workspace config and orchestrates **scripts by name**. Both packages now expose `dev`, `build`, `test`, `typecheck` (C-1).

The single most important declaration in the file you are writing is `globalDependencies`, and it is not obvious. `server/test/stats.integration.test.ts:29` and `server/src/stats/stats.module.test.ts:16` both `path.resolve` **up and across** into `web/src/api/__fixtures__/aggregate-stats.json`. Turborepo hashes a task against files in its own package, and `inputs` globs are package-relative and cannot escape upward — so without an explicit global declaration, editing that fixture leaves `server#test`'s hash untouched and the cache **replays a recorded pass over a suite that would now fail.** A green root command over a genuinely red suite is the worst outcome this migration can produce.

The second is `outputs` on `build`. A task with no `outputs` caches **logs only**. Both packages build to a gitignored `dist/`, and `server`'s `start` script is `node dist/main.js` — so an undeclared build would take a cache hit, replay logs, restore nothing, and leave `start` failing against a build that just "succeeded". (`server/dist` does not exist yet; it has never been built.)

`.turbo` must be ignored **depth-agnostically** — Turborepo writes per-package `<pkg>/.turbo/` log directories, not only a root one. A pattern anchored with a leading slash would miss them.

### Contracts you provide

**C-4 — Turborepo task graph.** `turbo.json` at the repo root, complete file:

```json
{
  "$schema": "https://turborepo.dev/schema.json",
  "globalDependencies": ["web/src/api/__fixtures__/aggregate-stats.json"],
  "tasks": {
    "dev": { "cache": false, "persistent": true },
    "build": { "outputs": ["dist/**"] },
    "test": {},
    "typecheck": {}
  }
}
```

**No `dependsOn` anywhere.** The conventional `build: { dependsOn: ["^build"] }` orders a package's build after its internal workspace dependencies; there is no manifest edge between `server` and `web`, so it resolves to an empty set and would be decoration. Do not add it. The fixture edge is real but is a test-time file read, not a build-order constraint, which is why it lives in `globalDependencies`.

**C-3 — Root script interface.** Added to root `package.json`:

```json
"dev": "turbo run dev",
"build": "turbo run build",
"test": "turbo run test -- run",
"typecheck": "turbo run typecheck"
```

Each script invokes **exactly one** turbo task — `turbo run build test -- <args>` is ambiguous when pass-through arguments would reach multiple tasks, so they cannot be combined. The `-- run` forwards a positional argument to each package's bare `vitest`, making the root command single-run without editing either package script.

### Steps

1. Confirm C-2 survived Wave 1: root `package.json` still has `workspaces` and `devEngines`, and there is one root lockfile.
2. Install turbo as a root devDependency.
3. Confirm the installed major is **2.x** — the config above uses 2.x semantics (`tasks`, not 1.x `pipeline`). If it is not 2.x, **stop and report**; do not translate the config to another major.
4. Create `turbo.json` exactly as C-4 states.
5. Add the four scripts from C-3 to root `package.json`, preserving Task 1's `workspaces`, `devEngines`, `name`, `private`, and `version` verbatim.
6. Add `.turbo/` to `.gitignore` — no leading slash, so it matches at any depth.
7. Run the verification below.
8. **Do not run any git command.**

### Verification

```bash
# a. Installed major matches the config's semantics
npx turbo --version                     # expect: 2.x

# b. C-4's exact shape
node -e "
const t=require('./turbo.json');
if(t.globalDependencies?.[0]!=='web/src/api/__fixtures__/aggregate-stats.json') throw new Error('globalDependencies wrong: '+JSON.stringify(t.globalDependencies));
if(t.tasks.dev.persistent!==true||t.tasks.dev.cache!==false) throw new Error('dev task must be persistent and uncached');
if(JSON.stringify(t.tasks.build.outputs)!==JSON.stringify(['dist/**'])) throw new Error('build outputs wrong: '+JSON.stringify(t.tasks.build.outputs));
for(const k of ['test','typecheck']) if(Object.keys(t.tasks[k]).length!==0) throw new Error(k+' must declare nothing');
const s=JSON.stringify(t); if(s.includes('dependsOn')) throw new Error('dependsOn must not appear');
console.log('C-4 OK');
"

# c. C-3's exact shape, and C-2 preserved
node -e "
const p=require('./package.json');
const want={dev:'turbo run dev',build:'turbo run build',test:'turbo run test -- run',typecheck:'turbo run typecheck'};
for(const [k,v] of Object.entries(want)) if(p.scripts[k]!==v) throw new Error(k+': '+p.scripts[k]);
if(JSON.stringify(p.workspaces)!==JSON.stringify(['server','web'])) throw new Error('C-2 workspaces lost');
if(!p.devEngines?.packageManager) throw new Error('C-2 devEngines lost');
if(!p.devDependencies?.turbo) throw new Error('turbo not a root devDependency');
console.log('C-3 OK, C-2 preserved');
"

# d. The graph resolves to both packages
npx turbo run typecheck --dry=json | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  const names=JSON.parse(s).tasks.map(t=>t.package).sort();
  if(JSON.stringify(names)!==JSON.stringify(['claude-usage-dashboard-server','claude-usage-dashboard-web'])) throw new Error('graph resolved to: '+names);
  console.log('graph OK — both packages');
});"
# If --dry=json is unavailable in the installed major, check `npx turbo run --help` and report
# rather than substituting a different assertion.

# e. .turbo ignored at any depth
mkdir -p server/.turbo && git check-ignore -q server/.turbo && echo "nested .turbo: ignored" && rmdir server/.turbo
git check-ignore -q .turbo 2>/dev/null || mkdir -p .turbo && git check-ignore -q .turbo && echo "root .turbo: ignored" && rmdir .turbo
```

### Mutations to reject

Apply each, confirm the stated check fails, revert, and **report the failure output**:

1. **Delete the `globalDependencies` line** → check (b) throws. This is the highest-value mutation in the run: without it the cache silently replays stale server passes, and Task 6's fixture observation is what catches it behaviorally.
2. **Remove `outputs` from `build`** → check (b) throws. Task 6 proves the behavioral consequence.
3. **Add `"dependsOn": ["^build"]` to `build`** → check (b) throws `dependsOn must not appear`.
4. **Change the root `test` script to `turbo run test`** (dropping `-- run`) → check (c) throws. Behaviorally this is the watch-mode hang.
5. **Anchor the ignore as `/.turbo`** → check (e)'s nested case fails.

### Success criteria

- [ ] Installed turbo is 2.x and `turbo.json` matches C-4 character for character
- [ ] `globalDependencies` names the fixture path, root-relative, in the root `turbo.json`
- [ ] `build` declares `outputs`; `test` and `typecheck` declare nothing; no `dependsOn` anywhere
- [ ] Root scripts match C-3 exactly, one turbo task each
- [ ] Task 1's `workspaces`, `devEngines`, `name`, `private`, `version` all survive verbatim
- [ ] `.turbo` ignored at any depth
- [ ] All five mutations applied, failures observed, output reported

### Controller review checklist

- [ ] Re-run (a), (b), (c), (d) yourself
- [ ] Diff `package.json` and confirm C-2's keys are byte-identical to what Task 1 committed — this task is the one place they could be clobbered
- [ ] Confirm the lockfile diff is only turbo and its transitive dependencies, not a wholesale re-resolution of the tree
- [ ] Spot-check mutation 1 by applying it yourself — it is the one whose absence is invisible until the cache lies
- [ ] Confirm OQ-1 was answered before dispatch and C-3 matches the answer

### Commit (controller runs after review)

```bash
git add -- turbo.json package.json package-lock.json .gitignore
git commit -m "Add the Turborepo task graph and root scripts"
```

### Progress notes

_—_

---

## Wave 2 Summary

**Status:** ⬜ Not Started

_Commits, amendments, deviations: —_

---

# Wave 3

One task. Dispatches only after Wave 2 is committed.

---

## Task 6: Prove the single-command flow and cache correctness

**Status:** ⬜ Not Started
**Phase:** 3 · **Wave:** 3 · **Same agent as Task 3**
**Provides:** none
**Consumes:** C-1 (owner Task 2), C-2 (owner Task 1), C-3 (owner Task 5), C-4 (owner Task 5), C-5 (owner Task 1)
**Assumes decision:** **OQ-1** — if the answer was "document-only" (the default), record the bare-`turbo run test` caveat in the README. If "guard", C-3 already carries the guard and the caveat does not apply.

**Files:**
- Modify: `README.md`

### Why this task exists

Everything before this is configuration that *looks* right. This task is the only place the system is actually run, and three of its observations cannot be made any other way: a cache entry is a real artifact, a proxied request needs two real processes, and a stale replay is invisible in a diff.

It is in Wave 3 because every observation requires turbo installed and the graph committed. No stand-in produces a real cache entry.

### Context you need

Read the **C-5 baseline** from the Wave 1 Summary in this document. If it is not recorded there, **stop and ask the controller** — do not re-derive it. Pre-migration state is not reconstructible from a migrated tree without checking out the parent commit, and a re-derived "baseline" would compare the migration against itself.

Two properties of the cache make naive checks lie, and you must respect both:

- **Turborepo hashes content, not mtime.** `touch` produces a cache *hit*. Every invalidation observation must **modify file contents** and restore them afterward.
- **Pass-through arguments are part of the task hash.** `npm test` (which is `turbo run test -- run`) and a bare `turbo run test` address **different cache entries**. Every observation must go through the **root scripts**, never a bare `turbo run`. A bare `turbo run test` will also enter watch mode and hang.

`server/dist` has never existed; `web/dist` may exist from earlier work. The build observation needs both created from cold.

### Steps

1. **Baseline conformance.** Run `npm test` and compare against the C-5 record. Identical counts, or stop and report — a difference is dependency drift.
2. **Two package-tasks per root command.** Run `npm run build`, `npm run typecheck`, `npm test` and confirm each reports work for **both** packages. One is a silently skipped package, which is exactly what a missing script name produces.
3. **The single dev command.** Start `npm run dev`. Confirm the Nest server answers on `:3000` and Vite on `:5173`, then request `http://localhost:5173/api/stats` and confirm **HTTP 200** with a body identical to `http://localhost:3000/api/stats`. A 404 or 502 means the proxy or the server did not come up. Stop the processes when done.
4. **Non-zero on failure.** Deliberately break one test in `server`, run `npm test`, confirm the root command exits **non-zero**, then revert. A green root command over a red package is the worst outcome of this migration and is the one thing worth proving by construction.
5. **Cache correctness, three observations** — all through the root scripts, all with real content edits:
   - Modify a `server/src` file → `npm test` → **server task misses**. Revert.
   - Modify `web/src/api/__fixtures__/aggregate-stats.json` → `npm test` → the **server** task misses, not just web. Revert. *This is the observation the whole `globalDependencies` declaration exists for.*
   - `rm -rf server/dist web/dist` → `npm run build` → confirm a **cache hit** and that **both `dist/` directories are restored** and match a cold build.
6. **Turbo major.** Confirm `npx turbo --version` is 2.x, matching C-4's semantics.
7. **Update the README** to document the root command interface now that it exists, including: root `npm run dev` starts both; file-scoped testing stays per-package (`npm test --prefix <pkg> -- run <path>`) because the root form has no scoped variant; and, if OQ-1 resolved to document-only, that a bare `turbo run test` watches and the root scripts are the supported entry point.
8. **Do not run any git command.**

### Verification

```bash
# a. Baseline conformance — compare to the C-5 record in Wave 1 Summary
npm test 2>&1 | tail -20

# b. Both packages participate
npm run build     2>&1 | grep -c "claude-usage-dashboard-\(server\|web\)"   # expect: >= 2
npm run typecheck 2>&1 | grep -c "claude-usage-dashboard-\(server\|web\)"   # expect: >= 2

# c. Proxy path (with `npm run dev` running in another shell)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/api/stats     # expect: 200
diff <(curl -s http://localhost:5173/api/stats) <(curl -s http://localhost:3000/api/stats) && echo "proxy body identical"

# d. Non-zero on failure (after breaking one server test)
npm test; echo "exit=$?"                                                     # expect: exit != 0

# e. Fixture invalidation — the observation globalDependencies exists for
npm test >/dev/null 2>&1                                                     # warm the cache
node -e "const f='web/src/api/__fixtures__/aggregate-stats.json',fs=require('fs'),j=JSON.parse(fs.readFileSync(f,'utf8'));j.__cachebust=1;fs.writeFileSync(f,JSON.stringify(j,null,2));console.log('fixture modified')"
npm test 2>&1 | grep -i "cache miss\|cache bypass"
# expect: the SERVER task reports a miss, not only web
git checkout -- web/src/api/__fixtures__/aggregate-stats.json

# f. Cached build still restores artifacts
npm run build >/dev/null 2>&1
rm -rf server/dist web/dist
npm run build 2>&1 | grep -i "cache hit\|FULL TURBO"
test -d server/dist && test -d web/dist && echo "both dist/ restored from cache"
```

### Mutations to reject

These are **observations against the committed config**, so rather than editing your own files you temporarily perturb Wave 2's and confirm the check catches it. Revert each immediately and **report the output**:

1. **Remove `globalDependencies` from `turbo.json`, warm the cache, modify the fixture, run `npm test`** → the server task now reports a **cache hit** and replays a pass. Report that output verbatim — it is the concrete evidence for why C-4 carries that line. Restore `turbo.json`.
2. **Remove `outputs` from `build`, run `npm run build`, delete both `dist/`, run again** → cache hit, no `dist/` restored, and `node server/dist/main.js` fails. Restore.
3. **Run `npx turbo run test` directly** (bare, no root script) → observe that it addresses a different cache entry and enters watch mode. Kill it. This is OQ-1's caveat, observed rather than assumed.

### Success criteria

- [ ] `npm test` matches the C-5 baseline exactly
- [ ] `npm run build`, `npm run typecheck`, `npm test` each report **two** package-tasks
- [ ] `npm run dev` starts both processes; `localhost:5173/api/stats` returns 200 with a body identical to `:3000`
- [ ] Root test command exits non-zero when a package suite fails
- [ ] Server source edit → server cache miss
- [ ] Fixture edit → **server** cache miss
- [ ] Deleting both `dist/` then a cached build restores both, matching a cold build
- [ ] `npx turbo --version` is 2.x
- [ ] README documents the root interface, the per-package file-scoped idiom, and (if OQ-1 = document-only) the bare-`turbo run test` caveat
- [ ] All three mutation observations performed, output reported, and every perturbed file restored

### Controller review checklist

- [ ] `git status` is clean apart from `README.md` — every perturbation in step 5 and the mutations must have been reverted. **A left-behind `__cachebust` in the fixture or a modified `turbo.json` is a failed task**, regardless of what the report says
- [ ] Re-run (a), (e), (f) yourself — (e) is the one that justifies the whole `globalDependencies` design, and a reported-only result is not evidence
- [ ] Confirm the baseline comparison used the recorded C-5 numbers, not numbers this task derived
- [ ] Read the README diff: the root interface is documented, and the per-package idiom survived
- [ ] Confirm mutation 1's output actually shows a **cache hit on the server task** — that is the failure mode being guarded, and a vague "cache behaved differently" is not proof

### Commit (controller runs after review)

```bash
git add -- README.md
git commit -m "Document the root command interface and its scoping caveats"
```

### Progress notes

_—_

---

## Wave 3 Summary

**Status:** ⬜ Not Started

_Commits, deviations, evidence captured: —_

---

## Final Gate

Run once, after Wave 3 commits.

1. **Full suite against the C-5 baseline** — `npm test` from the root; counts must match the Wave 1 Summary record.
2. **Type check** — `npm run typecheck`; both packages, exit 0.
3. **Build** — `npm run build`; both packages, exit 0, both `dist/` present.
4. **Review team over the whole run diff** (`git diff main...HEAD`), covering:
   - **Contract conformance** — every `Provides` in a task block matches its registry entry character for character on signature, key names, and declared behavior; C-2's keys survived Task 5's edit to the same file.
   - **Cross-task integration** — the four C-1 script names exist in both packages; C-3's scripts address C-4's tasks; `globalDependencies` names a path that actually exists.
   - **Adversarial** — re-run one named mutation from each task and confirm the stated check fails. The per-task mutation proofs were the agents' own claims; this is the independent check.
5. **Scope audit** — the whole run diff should touch only: `package.json`, `package-lock.json`, `server/package.json` (one added line), `server/package-lock.json` (deleted), `web/package-lock.json` (deleted), `turbo.json`, `.gitignore`, `README.md`, and one note in the dashboard task doc. **Anything under `server/src`, `web/src`, `server/test`, or either package's Vitest/Vite/tsconfig configuration is out of scope and must be justified or reverted.**
6. **Tick the plan's Success Criteria** with evidence, in `docs/plans/2026-08-01-turborepo-monorepo-tooling.md`.

---

## Repo-Memory Candidates

_Filled in by `executing-task`; promote only after the run verifies them._

- Whether `npm test --prefix <pkg> -- run <path>` survived the migration as the file-scoped test idiom (predicted yes — it is the reason C-3 forwards `run` rather than renaming the package scripts)
- The `globalDependencies` requirement for the cross-package fixture — durable and non-obvious, worth recording if Task 6's observation confirms it
- Whether a fresh git worktree needs its own root `npm install` after hoisting

## Session-Memory Candidates

- The C-5 baseline numbers (superseded the moment feature work resumes)
- Which turbo major was installed during this run

---

## Final Summary

_Filled in by `executing-task`: total tasks, completed, deferred/blocked with the decision each needs, commits, amendments, issues, Final Gate findings and resolutions, verified repo-memory candidates, deviations from plan._
