import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ParsedFile } from './contracts';
import { JsonFileAggregateCache, fileCacheKey } from './file-cache';

const parsed: ParsedFile = {
  session: { sessionId: 's', project: '-a', kind: 'main', day: '2026-07-09',
    startedAt: '2026-07-09T01:00:00.000Z', endedAt: '2026-07-09T01:05:00.000Z' },
  events: [
    { kind: 'token', day: '2026-07-09', project: '-a', model: 'claude-opus-4-8',
      dedupeKey: 'r1',
      usage: { input: 1, output: 2, cacheRead: 3, cacheCreation: 4,
        cacheCreation1h: 1, cacheCreation5m: 3 },
      speed: 'standard', isSidechain: false },
  ],
  malformedLines: 3,
  ignoredLines: 4,
};

let dir: string;
let store: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'cache-'));
  store = path.join(dir, 'nested', 'stats-cache.json');
});

describe('fileCacheKey', () => {
  const base = { path: '/r/-a/s.jsonl', mtimeMs: 1700000000000, size: 42 };

  it('is path, mtime, size and time zone joined by colons', () => {
    expect(fileCacheKey(base, 'Asia/Hong_Kong'))
      .toBe('/r/-a/s.jsonl:1700000000000:42:Asia/Hong_Kong:v4');
  });

  it('no longer matches the pre-throughput key format, so stale entries miss once', () => {
    expect(fileCacheKey(base, 'Asia/Hong_Kong'))
      .not.toBe('/r/-a/s.jsonl:1700000000000:42:Asia/Hong_Kong');
  });

  it('is versioned v4, so entries parsed before ParsedFile.session miss once', () => {
    expect(fileCacheKey(base, 'Asia/Hong_Kong')).toMatch(/:v4$/);
    expect(fileCacheKey(base, 'Asia/Hong_Kong'))
      .not.toBe('/r/-a/s.jsonl:1700000000000:42:Asia/Hong_Kong:v3');
  });

  it('does not serve a stored v3 entry to a v4 lookup for the same file', () => {
    const cache = new JsonFileAggregateCache(store);
    cache.set('/r/-a/s.jsonl:1700000000000:42:Asia/Hong_Kong:v3', parsed);
    expect(cache.get(fileCacheKey(base, 'Asia/Hong_Kong'))).toBeUndefined();
  });

  it('changes when any single input changes', () => {
    const k = fileCacheKey(base, 'Asia/Hong_Kong');
    expect(fileCacheKey({ ...base, mtimeMs: base.mtimeMs + 1 }, 'Asia/Hong_Kong')).not.toBe(k);
    expect(fileCacheKey({ ...base, size: 43 }, 'Asia/Hong_Kong')).not.toBe(k);
    expect(fileCacheKey({ ...base, path: '/r/-a/t.jsonl' }, 'Asia/Hong_Kong')).not.toBe(k);
    expect(fileCacheKey(base, 'UTC')).not.toBe(k);
  });
});

describe('round-trip', () => {
  it('gets back exactly what was set', () => {
    const cache = new JsonFileAggregateCache(store);
    cache.set('k1', parsed);
    expect(cache.get('k1')).toStrictEqual(parsed);
    expect(cache.get('missing')).toBeUndefined();
  });

  it('persists across instances and creates missing parent directories', async () => {
    const a = new JsonFileAggregateCache(store);
    a.set('k1', parsed);
    await a.save();
    await expect(readFile(store, 'utf8')).resolves.toContain('claude-opus-4-8');

    const b = new JsonFileAggregateCache(store);
    await b.load();
    expect(b.get('k1')).toStrictEqual(parsed);
  });
});

describe('a broken store is discarded, never fatal', () => {
  it('starts empty when the file does not exist', async () => {
    const c = new JsonFileAggregateCache(store);
    await expect(c.load()).resolves.toBeUndefined();
    expect(c.get('k1')).toBeUndefined();
  });

  it('starts empty when the file is empty', async () => {
    const flat = path.join(dir, 'flat.json');
    await writeFile(flat, '');
    const c = new JsonFileAggregateCache(flat);
    await expect(c.load()).resolves.toBeUndefined();
    expect(c.get('k1')).toBeUndefined();
  });

  it('starts empty when the JSON document is truncated', async () => {
    const flat = path.join(dir, 'torn.json');
    await writeFile(flat, '{"k1":{"events":[{"kind":"tok');
    const c = new JsonFileAggregateCache(flat);
    await expect(c.load()).resolves.toBeUndefined();
    expect(c.get('k1')).toBeUndefined();
  });

  it('starts empty when the JSON is well formed but not an object map', async () => {
    const flat = path.join(dir, 'wrong.json');
    await writeFile(flat, '[1,2,3]');
    const c = new JsonFileAggregateCache(flat);
    await expect(c.load()).resolves.toBeUndefined();
    expect(c.get('k1')).toBeUndefined();
    // An array's own keys ('0', '1', '2') must not be populated either -
    // this is what actually distinguishes "rejected" from "silently accepted".
    expect(c.get('0')).toBeUndefined();
    expect(c.get('1')).toBeUndefined();
    expect(c.get('2')).toBeUndefined();
  });

  it('starts empty when the JSON is a scalar, not an object map', async () => {
    const flat = path.join(dir, 'scalar.json');
    await writeFile(flat, '42');
    const c = new JsonFileAggregateCache(flat);
    await expect(c.load()).resolves.toBeUndefined();
    expect(c.get('k1')).toBeUndefined();
  });

  it('still accepts writes after a failed load', async () => {
    const flat = path.join(dir, 'torn2.json');
    await writeFile(flat, 'not json');
    const c = new JsonFileAggregateCache(flat);
    await c.load();
    c.set('k1', parsed);
    expect(c.get('k1')).toStrictEqual(parsed);
    await expect(c.save()).resolves.toBeUndefined();
  });
});
