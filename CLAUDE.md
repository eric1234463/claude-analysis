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

Both packages pin `TZ` through `test.env`, and they deliberately disagree: server tests run under
`TZ=UTC` (`server/vitest.config.mts`) so day-bucketing expectations never depend on the machine zone,
while web tests run under `TZ=Asia/Hong_Kong` (`web/vite.config.mts`) — a **non-UTC** zone on purpose,
because under UTC the local and UTC calendar dates coincide, so `toDayKey` and
`toISOString().slice(0, 10)` become indistinguishable and every day-key timezone assertion goes
vacuous. Don't "fix" web to UTC for symmetry.

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
- **Money is integer nano-USD** (1e-9 USD), never a float. Every published rate is a whole number of
  nano-USD per token (a USD-per-MTok rate `R` maps to `R * 1000`), so pricing is integer arithmetic with
  no rounding step: `cost` cells merge by plain addition and a weekly total equals the sum of its days
  exactly. Rates live only in `server/src/stats/rates.ts` and are **date-effective** — resolved against
  the cell's day key, so a price change never retroactively reprices history.
- **Cost is model-attributed only, and `<synthetic>` is excluded by construction.** Pricing happens
  inside the existing `event.model !== SYNTHETIC` branch in the aggregator, which is why
  `cost.total` always equals the sum over `modelCost` and why there is no second exclusion rule to keep
  in sync. Cost is computed in the aggregator because that is the only place the day key still exists;
  the frontend adds cells and must never multiply a rate.
- **Tokens from a model with no rate row are counted, never estimated.** They contribute `0` to every
  money field and their count to `cost.unpricedTokens`, so `cost.total` stays auditable. A
  nearest-model or newest-rate fallback would produce a plausible wrong number, which is worse than a
  visibly incomplete one. `unpricedTokens` is summed from the **flat** `cacheCreation`, matching the
  token totals a reader sees on the dashboard.
- **`cacheCreation` is authoritative for token display; the 1h/5m split is authoritative for pricing.**
  `TokenTotals` carries both because it `extends TokenUsage`, and `total` deliberately sums only
  `input + output + cacheRead + cacheCreation` — folding the split in would double-count. The two
  coincide on all observed data (47,006 of 47,006 measured lines) but are **not constrained to**: when a
  line's nested parts overshoot its flat field the parser keeps both as given, so do not add a
  regression test asserting `cacheCreation1h + cacheCreation5m === cacheCreation`. That is a property of
  today's data, not a guarantee the parser makes.
- **A session is the main transcript plus every sidechain under its `<sessionId>/subagents/`
  directory, and `sessions` is a top-level array, not a day cell.** The sessionId comes off the
  *path* (scanner), never from a line, so main and sidechain resolve to the same one; it rides on
  `ParsedFile.session` rather than on every event. A session is filed under the day it **started**
  and stays one row when it crosses midnight — so session rows and day cells legitimately
  disagree, and the frontend filters sessions on `session.day` alone. Every token event and tool
  call belongs to exactly one file and so to exactly one session: summing `sessions` reproduces
  `totals` for the fields they share, which is what the regression tests assert. `SessionRecord`
  is deliberately **not** a `UsageCounts` — 200+ full cells would triple the payload; it carries
  only the tab's fields, and its `cost` reuses the same `event.model !== SYNTHETIC` guard.
- **A session's tool calls are stored per lane (`mainTools` / `sidechainTools`) and never as a
  third combined map.** `tool-call` and `tool-error` events already carry `isSidechain`, so each
  lands in exactly one lane and the two maps sum to the `toolCalls` scalar. A page that wants the
  lane-blind ranking merges them at render; storing a combined copy as well would let it drift out
  of agreement with the halves. Subagents dominate here (32,073 of 52,456 real calls), which is the
  whole point of the split.
- **The session label is the transcript's own `ai-title`, never a prompt.** `aiTitle` is rewritten
  as a session goes on, so the **last** one wins. Those lines stay in `ignoredLines` — reading a
  title does not make the line counted. Sessions without one fall back to their UUID head in the
  UI. Prompt text was rejected as a fallback: it would copy client data into
  `.cache/stats-cache.json` and every `/api/stats` response.
- **`SessionRecord.durationMs` is the file's wall-clock span, not active work.** A resumed session
  appended to over three days reports ~75h. That is the honest reading of the transcript; do not
  "fix" it by subtracting idle gaps, which the transcript cannot distinguish from a slow turn.
- **The per-file cache key carries a schema tag** (`:v4`). Any change to `ParsedFile`'s shape must bump
  it, or already-cached transcripts keep serving the old shape forever under an unchanged mtime/size —
  silently, with no error. The TTL split would have priced at zero for all history, and `:v4`'s
  `ParsedFile.session` would have left every cached file with no session identity.

### Cross-package contract

`server/src/stats/contracts.ts` and `web/src/api/types.ts` declare the same shapes independently —
they are hand-kept in sync, not generated or imported across the boundary. `web/src/api/__fixtures__/aggregate-stats.json`
is the shared fixture: web page tests render from it, the server's `stats.module.test.ts` reads it by
relative path, and `turbo.json` lists it as a global dependency so touching it busts both caches. Its
headline numbers are hand-computed and asserted, so edit it only with the arithmetic redone.

Encoding note: skill keys are `` `${source}|${name}` `` and must be split on the **first** `|` — a
slash-command name can itself contain one.

### Frontend

Single aggregate endpoint, all filtering client-side. `filterStats`/`usageSeries`
(`web/src/api/filterStats.ts`) narrow by date range and project and re-derive `totals` and the index
arrays; page components in `web/src/pages/` are pure functions of `{ stats, series, granularity }`
and hold no fetching logic. The filter card's range presets are **derived** from the `from`/`to` state
via `matchPreset` (`web/src/api/dateRange.ts`) and never stored, against a `now` frozen once at mount
and shared by the range initialiser and the derivation, so don't add a `preset` state variable back —
it would desync from the empty state's own `setRange` call — and don't unwrap the `useState` around
`now`, which would drift the select to Custom the moment the clock crossed midnight.

The project chips show only the **3 most recently used** projects (`recentProjects` in
`web/src/api/recentProjects.ts`, ordered by each project's last active day) behind a `Show all`
expander — 71 projects made the full list unreadable. Recency is derived from the *unfiltered*
`stats.days`, so narrowing the date range never reshuffles the chips mid-click, and a *selected*
project stays rendered even when it falls outside the head of the list, or collapsing the card would
leave a filter on with no control to switch it off. An unselected project is still counted in every
chart (no selection means all) — the expander is the only way to isolate one.

Time-bucketed charts group at a granularity the user picks in the filter card — daily (default),
weekly or monthly. `usageSeries(stats, granularity)` does the grouping once, keying each point by
`bucket` (a day, an ISO-week Monday, or `YYYY-MM`) via `bucketKey` in `web/src/api/granularity.ts`;
**pages must never re-bin a series themselves**, they plot the buckets they are handed and only read
`granularity` for chart copy. `bucketKey` derives the week from the pre-bucketed *day key string*
parsed at UTC midnight — still never from a timestamp, and never in the ambient zone. Rates
(cache hit, tool error) divide after the bucket's counts are merged, so a week is weighted by volume
rather than being the mean of its days' ratios.

The Sessions page sits **second in the tab order** (right after Overview) and leads with its
`Every session in this selection` table, ahead of both charts — the row list is the point of the
page, the charts are a summary of it. It is the one view keyed on `stats.sessions` rather than on
`series`: it re-derives
every total from the filtered session rows and must never read a day cell, or a midnight-crossing
session would be counted twice. Its `granularity` prop goes unused by design — a session is not
time-bucketed. Tool calls and tokens each get a `Main | Subagent | All` column band, and a row
click opens the per-session detail dialog (`ui/dialog.tsx`, the app's only dialog, built on the
already-installed `radix-ui` package — do not add `@radix-ui/react-dialog`). The open row is held
as a **session id**, not as the record: a refresh replaces every object, and an id still resolves.

The Skills page shows **only skills you authored** — Claude Code's built-in skills and slash commands
are excluded by the hand-kept denylist in `web/src/api/builtinSkills.ts`. Transcripts record no
provenance for a skill name, so a denylist is the only option; it beats scanning the skills
directories because a deleted skill should stay in the history. Consequence: the page must never read
the pre-summed `counts.skillInvocations` (it includes built-ins) — every total is re-derived from the
filtered `counts.skills`. `App` takes an optional `deps` bag (filter/series/refresh/`now`) so tests inject
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
