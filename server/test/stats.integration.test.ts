import { describe, it, expect } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  AGGREGATE_STATS_KEYS, APP_CONFIG, STATS_PIPELINE,
  type AggregateStats, type AppConfig, type FileAggregateCache, type ParsedFile,
} from '../src/stats/contracts';
import { TranscriptStatsPipeline } from '../src/stats/pipeline';
import { StatsController } from '../src/stats/stats.controller';
import { StatsService } from '../src/stats/stats.service';

const AT = '2026-08-01T00:00:00.000Z';
const FIXTURES = path.resolve(__dirname, 'fixtures/projects');
const EXPECTED: AggregateStats = JSON.parse(
  readFileSync(
    path.resolve(__dirname, '../../web/src/api/__fixtures__/aggregate-stats.json'),
    'utf8',
  ),
);

function memoryCache() {
  const map = new Map<string, ParsedFile>();
  const cache: FileAggregateCache = {
    get: (k) => map.get(k),
    set: (k, v) => { map.set(k, v); },
    load: async () => {},
    save: async () => {},
  };
  return { cache, size: () => map.size };
}

const config = (root: string): AppConfig => ({
  transcriptsRoot: root,
  timeZone: 'Asia/Hong_Kong',
  cacheFile: '/dev/null',
});

async function appFor(root: string) {
  const { cache } = memoryCache();
  const pipeline = new TranscriptStatsPipeline(config(root), cache, () => AT);
  const mod = await Test.createTestingModule({
    controllers: [StatsController],
    providers: [
      StatsService,
      { provide: STATS_PIPELINE, useValue: pipeline },
      { provide: APP_CONFIG, useValue: config(root) },
    ],
  }).compile();
  const app: INestApplication = mod.createNestApplication();
  await app.init();
  return app;
}

describe('the wired stats module over the fixture transcripts', () => {
  it('serves exactly the declared top-level keys', async () => {
    const app = await appFor(FIXTURES);
    const res = await request(app.getHttpServer()).get('/api/stats').expect(200);
    expect(Object.keys(res.body).sort()).toStrictEqual([...AGGREGATE_STATS_KEYS]);
    await app.close();
  });

  it('deep-equals the hand-computed aggregate, which is also the web fixture', async () => {
    const app = await appFor(FIXTURES);
    const res = await request(app.getHttpServer()).get('/api/stats').expect(200);
    expect({ ...res.body, generatedAt: AT }).toStrictEqual({ ...EXPECTED, generatedAt: AT });
    await app.close();
  });

  it('buckets by the configured local time even when the process TZ is UTC', async () => {
    const app = await appFor(FIXTURES);
    const res = await request(app.getHttpServer()).get('/api/stats').expect(200);
    expect(Object.keys(res.body.days)).toStrictEqual(['2026-07-09', '2026-07-10']);
    expect(res.body.days['2026-07-08']).toBeUndefined();
    await app.close();
  });

  it('counts one session per main file, never one per transcript file', async () => {
    const app = await appFor(FIXTURES);
    const res = await request(app.getHttpServer()).get('/api/stats').expect(200);
    expect(res.body.scannedFiles).toBe(3);
    expect(res.body.totals.sessionsStarted).toBe(2);
    expect(res.body.days['2026-07-09']['-fixture-project'].sessionsStarted).toBe(1);
    await app.close();
  });

  it('counts subagent work exactly once, from the sidechain file only', async () => {
    const app = await appFor(FIXTURES);
    const res = await request(app.getHttpServer()).get('/api/stats').expect(200);
    expect(res.body.totals.tokens.total).toBe(27438);
    expect(res.body.totals.sidechainTokens.total).toBe(27275);
    expect(res.body.totals.mainTokens.total).toBe(163);
    expect(res.body.totals.agents['general-purpose'].tokens.total).toBe(27275);
    await app.close();
  });

  it('separates malformed lines from ignorable ones', async () => {
    const app = await appFor(FIXTURES);
    const res = await request(app.getHttpServer()).get('/api/stats').expect(200);
    expect(res.body.malformedLines).toBe(3);
    expect(res.body.ignoredLines).toBe(5);
    await app.close();
  });
});

describe('pipeline behaviour', () => {
  it('populates the cache and produces an identical aggregate on a second run', async () => {
    const { cache, size } = memoryCache();
    const pipeline = new TranscriptStatsPipeline(config(FIXTURES), cache, () => AT);
    const first = await pipeline.run();
    expect(size()).toBe(3);
    const second = await pipeline.run();
    expect(second).toStrictEqual(first);
  });

  it('resolves with a valid empty aggregate for a transcripts root that does not exist', async () => {
    const { cache } = memoryCache();
    const pipeline = new TranscriptStatsPipeline(
      config(path.join(FIXTURES, 'definitely-not-here-7c1a')), cache, () => AT,
    );
    const out = await pipeline.run();
    expect(Object.keys(out).sort()).toStrictEqual([...AGGREGATE_STATS_KEYS]);
    expect(out.scannedFiles).toBe(0);
    expect(out.days).toStrictEqual({});
    expect(out.totals.tokens.total).toBe(0);
  });
});
