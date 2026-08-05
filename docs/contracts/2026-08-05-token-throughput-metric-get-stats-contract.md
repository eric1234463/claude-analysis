---
type: contract
title: "Token Throughput Metric — GET /api/stats"
description: "Documents the aggregate dashboard payload, including mergeable response-throughput counters used by the frontend."
status: completed
owner: "eric1234463@gmail.com"
created: "2026-08-05"
repos:
  - "claude-analysis"
audience:
  - "claude-analysis/web"
endpoints:
  - "GET /api/stats"
related:
  - "docs/plans/2026-08-05-token-throughput-metric.md"
  - "docs/tasks/2026-08-05-token-throughput-metric-tasks.md"
wiki: false
---

# Token Throughput Metric API Contract

**Contract file:** `docs/contracts/2026-08-05-token-throughput-metric-get-stats-contract.md`

## Overview

- **Feature:** Response token throughput
- **Purpose:** Load the cached dashboard aggregate, including the counters needed to derive response throughput overall and by lane, model, skill, project, and time bucket.
- **Related plan:** `docs/plans/2026-08-05-token-throughput-metric.md`
- **Related task:** `docs/tasks/2026-08-05-token-throughput-metric-tasks.md`
- **Primary backend files:**
  - `server/src/stats/stats.controller.ts`
  - `server/src/stats/stats.service.ts`
  - `server/src/stats/contracts.ts`
  - `server/src/stats/stats.module.test.ts`

## Endpoint in scope

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/api/stats` | Return the last successful aggregate, refreshing on the first request if necessary | None; local single-user app |

## Shared rules

- **Base prefix:** `/api`
- **Auth:** None.
- **Request body:** None.
- **Success content type:** `application/json`.
- **Date/time formats:** `generatedAt` is ISO-8601 UTC; `days` keys are pre-bucketed `YYYY-MM-DD` values in the configured dashboard timezone.
- **Rate derivation:** The API returns mergeable counters, not a precomputed rate. Derive tokens per second as `outputTokens / (durationMs / 1000)`, returning zero when `durationMs` is zero.
- **Filtering/grouping:** Sum counters across the selected cells first, then divide. Do not average per-cell rates.

## Endpoint details

### GET /api/stats

**Behavior**

Returns the last successfully computed aggregate when available. On a cold start it runs the stats pipeline once; concurrent callers join the same in-flight run.

**Request**

No headers, path parameters, query parameters, or body are required.

**Success response — 200**

| Field | Type | Notes |
|---|---|---|
| `generatedAt` | `string` | ISO-8601 UTC timestamp |
| `scannedFiles` | `number` | Transcript files represented by the aggregate |
| `malformedLines` | `number` | Lines that failed JSON parsing |
| `ignoredLines` | `number` | Well-formed transcript lines outside the recognized event types |
| `days` | `Record<string, Record<string, UsageCounts>>` | `dayKey -> projectKey -> counts`; day and project keys are already bucketed |
| `projects` | `string[]` | Sorted project keys |
| `models` | `string[]` | Sorted normalized model names; excludes `<synthetic>` |
| `tools` | `string[]` | Sorted tool names |
| `skills` | `SkillKey[]` | Sorted by `source|name` |
| `agents` | `string[]` | Sorted agent types |
| `totals` | `UsageCounts` | Merge of every day/project cell |

`SkillKey` is `{ name: string, source: "skill-tool" | "slash-command" }`.

### UsageCounts throughput fields

The existing token, session, tool, skill, model, and agent fields remain unchanged. Every `UsageCounts` object additionally exposes:

| Field | Type | Notes |
|---|---|---|
| `throughput` | `ThroughputCounts` | All eligible and excluded deduplicated token requests in the cell |
| `mainThroughput` | `ThroughputCounts` | Main-transcript requests only |
| `sidechainThroughput` | `ThroughputCounts` | Sidechain requests only |
| `modelThroughput` | `Record<string, ThroughputCounts>` | Eligible requests keyed by normalized model; absent models have no entry and per-model `excludedRequests` is always `0` |
| `skillThroughput` | `Record<string, ThroughputCounts>` | Eligible requests keyed by bare attribution skill name |

`ThroughputCounts` has four numeric fields:

| Field | Meaning |
|---|---|
| `outputTokens` | Sum of output tokens for eligible requests |
| `durationMs` | Sum of eligible end-to-end response intervals in milliseconds |
| `requests` | Number of eligible deduplicated token requests |
| `excludedRequests` | Number of requests without a qualifying positive interval |

For every aggregate cell, `throughput.requests + throughput.excludedRequests` equals the number of deduplicated token events in that cell. Throughput is end-to-end response throughput and includes queueing, prompt processing, and time to first token; it is not raw model decode speed.

**Example throughput fragment**

```json
{
  "days": {
    "2026-08-05": {
      "-example-project": {
        "throughput": {
          "outputTokens": 940,
          "durationMs": 10000,
          "requests": 2,
          "excludedRequests": 1
        },
        "mainThroughput": {
          "outputTokens": 640,
          "durationMs": 8000,
          "requests": 1,
          "excludedRequests": 1
        },
        "sidechainThroughput": {
          "outputTokens": 300,
          "durationMs": 2000,
          "requests": 1,
          "excludedRequests": 0
        },
        "modelThroughput": {
          "claude-opus-5": {
            "outputTokens": 940,
            "durationMs": 10000,
            "requests": 2,
            "excludedRequests": 0
          }
        },
        "skillThroughput": {}
      }
    }
  }
}
```

The omitted properties in the example are still present in the real `AggregateStats` and `UsageCounts` payloads.

**Error response**

| Status | When |
|---|---|
| `500` | The initial pipeline run rejects before any aggregate is available; NestJS returns its standard error payload |

**Frontend notes**

- Preserve all four counters during client-side date/project filtering and daily, weekly, or monthly grouping.
- Always display coverage as excluded requests over `requests + excludedRequests`.
- Missing model/skill map entries mean no eligible request for that dimension, not a zero-valued materialized entry.

## Change log

- 2026-08-05: Initial contract created for the throughput counters added to `UsageCounts`.

## References

- [`docs/plans/2026-08-05-token-throughput-metric.md`](../plans/2026-08-05-token-throughput-metric.md) — Architecture, eligibility rules, and success criteria.
- [`docs/tasks/2026-08-05-token-throughput-metric-tasks.md`](../tasks/2026-08-05-token-throughput-metric-tasks.md) — Contract registry, implementation record, and Final Gate evidence.

