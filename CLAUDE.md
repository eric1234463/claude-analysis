# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A local, single-user dashboard that reads `~/.claude/projects/**/*.jsonl` transcripts and visualizes
token, skill, and tool usage. Read-only against `~/.claude`; its own cache lives in the project
directory. No database, no auth.

## Commands

npm workspace (`server`, `web`) fanned out by Turborepo. Install once from the repo root — each git
worktree is its own checkout and needs its own root `npm install`.

```bash
npm run dev        # NestJS on :3000, Vite on :5173 (proxies /api to :3000)
npm run build
npm test           # both packages
npm run typecheck  # both packages

npm run dev -w server
npm run dev -w web
```

File-scoped tests are per-package — the root scripts reach both packages and the one that doesn't own
the file exits non-zero:

```bash
npm test --prefix server -- run src/stats/parser.test.ts
npm test --prefix web -- run src/api/filterStats.test.ts
```

Don't invoke `npx turbo run test` directly: it drops the root script's `-- run` pass-through, so it
addresses a different cache entry and starts vitest in watch mode. There is no lint script.

Server tests run under `TZ=UTC` (`server/vitest.config.mts`) so day-bucketing expectations never
depend on the machine zone.

## Architecture

Pipeline, all under `server/src/stats/`:

```
scanner.ts  → parser.ts → aggregator.ts → StatsService → GET /api/stats → web (client-side filtering)
              ↕ file-cache.ts (per-file ParsedFile, keyed path:mtime:size:timeZone)
```

- **scanner** classifies paths into `main` (`<project>/<sessionId>.jsonl`) and `sidechain`
  (`<project>/<sessionId>/subagents/agent-<agentId>.jsonl`). The project key is always the directory
  *directly under* the transcripts root — never a segment below it, or sidechains would land in a
  phantom `subagents` project. `agentType` comes from the adjacent `agent-<id>.meta.json`, degrading
  to `'unknown'` rather than dropping the file.
- **parser** is pure (no fs, no clock, no ambient timezone) and never throws: unparseable lines
  increment `malformedLines`, well-formed lines of unknown `type` increment `ignoredLines`. It reads
  only known fields, so schema drift undercounts instead of crashing.
- **aggregator** rolls events into `days[dayKey][projectKey] → UsageCounts` plus a `totals` cell, and
  sorts every record and index array.
- **pipeline.ts** is cache-aware per file. A *read/parse failure is deliberately not cached* — caching
  it would make the degradation permanent under an unchanged mtime/size.
- **StatsService** holds a last-good aggregate and is single-flight: `GET /api/stats` returns the
  cached aggregate forever once one exists; only `POST /api/stats/refresh` re-scans, and concurrent
  refreshes join the same promise.

### Invariants that tests lock

Changing any of these means changing a regression test on purpose, not incidentally:

- **Sidechain transcripts are the sole source of subagent tokens.** Parent-side `Agent` `tool_result`
  rollups are never harvested — doing so double-counts the same work. Token usage is read *only* from
  `message.usage` on `type: "assistant"` lines.
- **Token dedupe is per file**, keyed on `requestId ?? uuid`, and the *last* usage-bearing occurrence
  wins (interim lines carry partial output counts).
- **Days are bucketed once, in the aggregator**, using the configured IANA zone (default
  `Asia/Hong_Kong`, not the ambient zone). The frontend filters on those pre-bucketed keys and must
  never re-derive a day from a timestamp.
- **Sidechain files never emit `session-start`**, so a parent + subagent pair is one session.
- **`Skill` tool calls and `<command-name>` slash commands stay separate series** (`source:
  'skill-tool' | 'slash-command'`); built-ins like `/context` would otherwise pollute a skill ranking.
- **Skill token attribution comes from the line's own `attributionSkill`**, never inferred from a
  neighbouring line or from a range between a `Skill` call and some guessed terminator. Claude Code
  writes that field for the duration of a skill run (sidechains included, so a subagent spawned
  inside a skill counts toward it) and omits it outside one. It carries **no source**, so
  `UsageCounts.skillTokens` is keyed on the *bare name* and cannot be split `skill-tool` vs
  `slash-command` the way `skills` is. Unattributed turns stay in `tokens` and simply have no
  `skillTokens` entry — the two never have to reconcile.
- **`<synthetic>` model entries are excluded from model charts** and model names are normalized by
  stripping the context-window suffix (`claude-opus-4-8[1m]` → `claude-opus-4-8`).
- The top-level keys of `AggregateStats` are pinned by `AGGREGATE_STATS_KEYS` in *both* packages;
  adding or removing one is a contract change and fails tests in both until updated.

### Cross-package contract

`server/src/stats/contracts.ts` and `web/src/api/types.ts` declare the same shapes independently —
they are hand-kept in sync, not generated or imported across the boundary. `web/src/api/__fixtures__/aggregate-stats.json`
is the shared fixture: web page tests render from it, the server's `stats.module.test.ts` reads it by
relative path, and `turbo.json` lists it as a global dependency so touching it busts both caches. Its
headline numbers are hand-computed and asserted, so edit it only with the arithmetic redone.

Encoding note: skill keys are `` `${source}|${name}` `` and must be split on the **first** `|` — a
slash-command name can itself contain one.

### Frontend

Single aggregate endpoint, all filtering client-side. `filterStats`/`daySeries`
(`web/src/api/filterStats.ts`) narrow by date range and project and re-derive `totals` and the index
arrays; page components in `web/src/pages/` are pure functions of `{ stats, series }` and hold no
fetching logic. `App` takes an optional `deps` bag (filter/series/refresh/`now`) so tests inject
deterministic implementations.

Styling is Tailwind v4 + shadcn/ui (new-york, `@` → `src`), **dark-only**: `web/src/index.css` holds
the single palette and there is no theme provider or light token set. The five chart hues are
validated against the dark card surface (lightness band, chroma floor, colourblind separation,
contrast) and are assigned by series identity in order, never cycled — a sixth series should collapse
into "Other" or split into small multiples. Shared chart chrome (axis/grid/tooltip/legend props,
`StatCard`, `ChartCard`, `EmptyState`) lives in `web/src/components/charts.tsx`; use it rather than
restyling per page.

## Configuration

Env vars read in `server/src/stats/config.ts`: `CLAUDE_TRANSCRIPTS_ROOT`
(default `~/.claude/projects`), `DASHBOARD_TIME_ZONE` (default `Asia/Hong_Kong`), `DASHBOARD_CACHE_FILE`
(default `.cache/stats-cache.json` under cwd).

## Docs

`docs/plans/` holds the implementation plans (architecture rationale, numbered decisions, risks) and
`docs/tasks/` the executed task breakdowns with their Final Gate records. When a design question comes
up ("why is it done this way?"), the Decisions section of
`docs/plans/2026-08-01-claude-usage-dashboard.md` is usually the answer.
