import { describe, it, expect, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AGGREGATE_STATS_KEYS, STATS_PIPELINE, type AggregateStats, type StatsPipeline }
  from './contracts';
import { loadConfig } from './config';
import { StatsService } from './stats.service';
import { StatsController } from './stats.controller';

const FIXTURE: AggregateStats = JSON.parse(
  readFileSync(
    path.resolve(__dirname, '../../../web/src/api/__fixtures__/aggregate-stats.json'),
    'utf8',
  ),
);

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function countingPipeline() {
  const gate = deferred<AggregateStats>();
  let calls = 0;
  const pipeline: StatsPipeline = { run: () => { calls += 1; return gate.promise; } };
  return { pipeline, gate, calls: () => calls };
}

async function makeApp(pipeline: StatsPipeline) {
  const mod = await Test.createTestingModule({
    controllers: [StatsController],
    providers: [StatsService, { provide: STATS_PIPELINE, useValue: pipeline }],
  }).compile();
  const app = mod.createNestApplication();
  await app.init();
  return app;
}

describe('loadConfig', () => {
  it('falls back to the documented defaults', () => {
    const c = loadConfig({});
    expect(c.transcriptsRoot).toBe(path.join(os.homedir(), '.claude', 'projects'));
    expect(c.timeZone).toBe('Asia/Hong_Kong');
    expect(c.cacheFile).toBe(path.join(process.cwd(), '.cache', 'stats-cache.json'));
  });

  it('lets every field be overridden by its environment variable', () => {
    const c = loadConfig({
      CLAUDE_TRANSCRIPTS_ROOT: '/tmp/fix',
      DASHBOARD_TIME_ZONE: 'UTC',
      DASHBOARD_CACHE_FILE: '/tmp/c.json',
    });
    expect(c).toStrictEqual({
      transcriptsRoot: '/tmp/fix',
      timeZone: 'UTC',
      cacheFile: '/tmp/c.json',
    });
  });
});

describe('GET /api/stats', () => {
  let app: INestApplication;
  beforeEach(async () => {
    app = await makeApp({ run: async () => FIXTURE });
  });

  it('serves the pipeline aggregate with exactly the declared top-level keys', async () => {
    const res = await request(app.getHttpServer()).get('/api/stats').expect(200);
    expect(Object.keys(res.body).sort()).toStrictEqual([...AGGREGATE_STATS_KEYS]);
    expect(res.body.totals.tokens.total).toBe(27438);
    expect(res.body.totals.sessionsStarted).toBe(2);
    // Cost is nested two levels deeper than anything else asserted here; no in-process test
    // covers whether it survives Nest's JSON serialization.
    expect(res.body.totals.cost.total).toBe(68326250);
    expect(Object.keys(res.body.totals.modelCost ?? {}))
      .toStrictEqual(['claude-opus-4-8', 'claude-sonnet-5']);
  });

  it('POST /api/stats/refresh returns the same shape', async () => {
    const res = await request(app.getHttpServer()).post('/api/stats/refresh').expect(200);
    expect(Object.keys(res.body).sort()).toStrictEqual([...AGGREGATE_STATS_KEYS]);
    expect(res.body.days['2026-07-09']['-fixture-project'].sessionsStarted).toBe(1);
  });
});

describe('StatsService single-flight refresh', () => {
  it('invokes the pipeline once for concurrent callers and hands them one promise', async () => {
    const { pipeline, gate, calls } = countingPipeline();
    const svc = new StatsService(pipeline);
    const a = svc.refresh();
    const b = svc.refresh();
    expect(a).toBe(b);
    expect(calls()).toBe(1);
    gate.resolve(FIXTURE);
    await expect(a).resolves.toBe(FIXTURE);
    await expect(b).resolves.toBe(FIXTURE);
    expect(calls()).toBe(1);
  });

  it('retains the last good aggregate so getStats does not re-run the pipeline', async () => {
    const { pipeline, gate, calls } = countingPipeline();
    const svc = new StatsService(pipeline);
    const first = svc.refresh();
    gate.resolve(FIXTURE);
    await first;
    await expect(svc.getStats()).resolves.toBe(FIXTURE);
    await expect(svc.getStats()).resolves.toBe(FIXTURE);
    expect(calls()).toBe(1);
  });

  it('runs the pipeline on the first getStats when nothing has been computed yet', async () => {
    const { pipeline, gate, calls } = countingPipeline();
    const svc = new StatsService(pipeline);
    const p = svc.getStats();
    gate.resolve(FIXTURE);
    await expect(p).resolves.toBe(FIXTURE);
    expect(calls()).toBe(1);
  });

  it('propagates a rejection to every joined caller and stays usable afterwards', async () => {
    const first = countingPipeline();
    let current: StatsPipeline = first.pipeline;
    const svc = new StatsService({ run: () => current.run() });
    const a = svc.refresh();
    const b = svc.refresh();
    first.gate.reject(new Error('scan blew up'));
    await expect(a).rejects.toThrow('scan blew up');
    await expect(b).rejects.toThrow('scan blew up');
    expect(first.calls()).toBe(1);

    const second = countingPipeline();
    current = second.pipeline;
    const retry = svc.refresh();
    second.gate.resolve(FIXTURE);
    await expect(retry).resolves.toBe(FIXTURE);
    expect(second.calls()).toBe(1);
  });

  it('starts a new flight once the previous one has settled', async () => {
    const first = countingPipeline();
    let current: StatsPipeline = first.pipeline;
    const svc = new StatsService({ run: () => current.run() });
    const a = svc.refresh();
    first.gate.resolve(FIXTURE);
    await a;
    const second = countingPipeline();
    current = second.pipeline;
    const b = svc.refresh();
    expect(b).not.toBe(a);
    second.gate.resolve(FIXTURE);
    await b;
    expect(second.calls()).toBe(1);
  });
});
