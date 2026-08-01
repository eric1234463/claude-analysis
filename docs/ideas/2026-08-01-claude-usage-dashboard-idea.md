---
type: idea
title: "Claude Code Usage Dashboard"
description: "A local web dashboard that parses ~/.claude transcripts to visualize skill usage, daily token consumption, and tool-call patterns, revealing how to use Claude Code more efficiently."
status: draft
owner: "eric.kwong@d-ash.com"
created: "2026-08-01"
wiki: false
---

# Claude Code Usage Dashboard

## Problem

Claude Code records every session as JSONL transcripts under `~/.claude/projects/` (currently 267MB of history), but there is no way to see how that usage looks over time. Eric wants to understand which skills get used, how many tokens each day consumes, and which tools are called most — and from that, learn how to use Claude Code more efficiently (better cache utilization, fewer failed tool calls, which workflows pay off).

## Assumptions

- Data source is the local `~/.claude/projects/**/*.jsonl` transcripts only; all needed fields (per-message token usage with cache breakdown, model, tool_use blocks, tool_result errors, timestamps, project path) are already present — verified by sampling real transcripts.
- Personal, local-only web app started with `npm run dev`; no auth or deployment.
- Read-only: the dashboard never modifies transcript files.
- TypeScript/Node stack matches Eric's other projects.

## Options

### Recommended: Single Node + React app

One repo: a small Node backend (Express or Fastify) that scans and parses transcripts, plus a Vite + React frontend with Recharts. Per-file aggregates are cached keyed by (path, mtime, size), so the first scan is slow but refreshes are incremental and near-instant. Full UI control, easy to extend with new metrics.

### Alternative: Streamlit (Python)

Fastest path to a working dashboard, but weaker UX polish, off Eric's usual stack, and less natural for a web interface intended to grow. Not preferred.

## Proposed Design

**Data pipeline.** A parser module streams each JSONL file line-by-line and extracts:

- `assistant` messages → input / output / cache-read / cache-creation tokens, model, timestamp
- `tool_use` content blocks → tool name; when the tool is `Skill`, also `input.skill`
- `tool_result` → `is_error` flag for tool failure rates
- user messages containing `<command-name>` → slash-command invocations

Events roll up by day × project × model × tool/skill. Per-file aggregates are cached in a local JSON store so only new or changed sessions are re-parsed.

**API.** A single endpoint returns the full rolled-up aggregate (small after aggregation); the frontend filters by date range and project client-side.

**Frontend pages.**

1. Overview — daily tokens stacked by type, sessions per day, tokens by model and project
2. Skills — invocation counts, trend over time, per-project breakdown
3. Tools — call counts per tool, error rates, per-project usage
4. Efficiency — cache hit ratio, tool error rate, avg tokens per session, subagent usage, most active projects

**Error handling.** Malformed lines are skipped and counted; the parser reads only known fields so schema drift across Claude Code versions degrades gracefully instead of crashing.

**Testing.** Parser unit tests against small fixture JSONL files; snapshot tests on aggregation output.

## Success Criteria

- Dashboard loads all historical transcripts and renders the four pages with correct daily token totals (spot-checkable against a manually summed sample file).
- Refresh after new Claude Code sessions is incremental (only changed files re-parsed) and completes in a few seconds.
- Skill and tool counts match a manual grep of a sample transcript.

## Open Questions

- Add estimated cost (model pricing × tokens) to the Overview page? Nice-to-have, not blocking.
- Include sidechain/subagent messages in token totals separately or merged? Default: shown as a separate "subagent" split on the Efficiency page.
