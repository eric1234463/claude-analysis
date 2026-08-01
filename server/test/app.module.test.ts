import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import os from 'node:os';
import path from 'node:path';
import { AGGREGATE_STATS_KEYS } from '../src/stats/contracts';
import { AppModule } from '../src/app.module';

const FIXTURES = path.resolve(__dirname, 'fixtures/projects');

describe('AppModule boots the real composition (no hand-supplied providers)', () => {
  const originalRoot = process.env.CLAUDE_TRANSCRIPTS_ROOT;
  const originalCache = process.env.DASHBOARD_CACHE_FILE;
  let app: INestApplication | undefined;

  beforeEach(() => {
    process.env.CLAUDE_TRANSCRIPTS_ROOT = FIXTURES;
    process.env.DASHBOARD_CACHE_FILE = path.join(
      os.tmpdir(),
      `stats-cache-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
    );
  });

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
    process.env.CLAUDE_TRANSCRIPTS_ROOT = originalRoot;
    process.env.DASHBOARD_CACHE_FILE = originalCache;
  });

  it('resolves STATS_PIPELINE for StatsService and serves GET /api/stats with the declared keys', async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();

    const res = await request(app.getHttpServer()).get('/api/stats').expect(200);
    expect(Object.keys(res.body).sort()).toStrictEqual([...AGGREGATE_STATS_KEYS]);
  });
});
