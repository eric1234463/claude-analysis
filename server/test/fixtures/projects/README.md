# Fixture transcripts

These bytes are load-bearing. They are hand-authored, byte-for-byte, and their expected aggregate is
computed by hand in contract C-12 (`docs/tasks/2026-08-01-claude-usage-dashboard-tasks.md`, Task 2).
Every regression lock in Tasks 4, 5, 9 and 14, plus the web fixture in Task 3, is derived from these exact
files. **Do not reformat, re-indent, pretty-print, sort, or "fix" any line here** — doing so silently
changes the hand-computed totals in C-12 and breaks every test that depends on them.

Owner: Task 2 (Wave 0). Any change to these files must be re-derived mechanically and the C-12 numbers
updated to match.

## Why each element is here

| Element | Locks |
|---|---|
| `u-m1` at `2026-07-08T16:30:00Z` with model `claude-opus-4-8[1m]` | local-time bucketing (→ day `2026-07-09`, **not** `2026-07-08`) **and** `[1m]` suffix stripping |
| `u-syn-1` with `model:"<synthetic>"`, no `requestId`, zero usage | uuid dedupe fallback; `<synthetic>` excluded from the `models` dimension but not from token totals |
| `u-m7` `toolUseResult` with `totalTokens: 99999` and `usage` summing 168330 | the parent rollup is never harvested |
| `u-s1`/`u-s2`/`u-s3` sharing `req_side_G`, outputs 5/5/153 | per-file keep-last dedupe → 153, not 163 and not 5 |
| the sidechain file existing at all | subagent tokens come from sidechains only; `sessionsStarted` stays 1 |
| lines 13–15 of file 1 | `malformedLines: 3`, including a torn unterminated final line |
| `last-prompt`, `attachment`, `file-history-snapshot`, `system` lines | `ignoredLines: 5`, distinct from malformed |
| `tu_bash` + its `is_error: true` `tool_result` | tool errors resolve the tool name through the per-file `toolUseId` map |
| `tu_skill` with `input.skill` and the `<command-name>/context</command-name>` line | skills and slash-commands are separate `source` series |
| `-fixture-project-two` on a different day | cross-filtering by date × project has something to discriminate |
