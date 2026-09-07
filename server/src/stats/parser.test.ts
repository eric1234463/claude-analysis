import { describe, it, expect } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { ParsedFile, TranscriptFile, UsageEvent } from './contracts';
import { parseTranscript } from './parser';

const TZ = 'Asia/Hong_Kong';
const FIXTURES = path.resolve(__dirname, '../../test/fixtures/projects');
const SESSION = '11111111-1111-1111-1111-111111111111';
const MAIN_PATH = path.join(FIXTURES, '-fixture-project', `${SESSION}.jsonl`);
const SIDE_PATH = path.join(
  FIXTURES, '-fixture-project', SESSION, 'subagents', 'agent-afixture0000000001.jsonl',
);

function fileOf(p: string, kind: 'main' | 'sidechain'): TranscriptFile {
  const st = statSync(p);
  return {
    path: p,
    project: '-fixture-project',
    kind,
    sessionId: SESSION,
    ...(kind === 'sidechain'
      ? { agentId: 'afixture0000000001', agentType: 'general-purpose' }
      : {}),
    mtimeMs: st.mtimeMs,
    size: st.size,
  };
}

const linesOf = (p: string) => readFileSync(p, 'utf8').split('\n');
const parseMain = () => parseTranscript(fileOf(MAIN_PATH, 'main'), linesOf(MAIN_PATH), TZ);
const parseSide = () => parseTranscript(fileOf(SIDE_PATH, 'sidechain'), linesOf(SIDE_PATH), TZ);

const dayFor = (tz: string) =>
  tokens(parseTranscript(fileOf(MAIN_PATH, 'main'), linesOf(MAIN_PATH), tz).events)
    .find((e) => e.dedupeKey === 'req_main_A')?.day;

const tokens = (events: UsageEvent[]) =>
  events.filter((e): e is Extract<UsageEvent, { kind: 'token' }> => e.kind === 'token');

const MAIN: TranscriptFile = {
  path: '/r/-p/s.jsonl', project: '-p', kind: 'main', sessionId: 's', mtimeMs: 1, size: 1,
};
const line = (o: object) => JSON.stringify(o);
const tokenOf = (parsed: ParsedFile, key: string) =>
  parsed.events.find((e) => e.kind === 'token' && e.dedupeKey === key) as
    Extract<UsageEvent, { kind: 'token' }>;

function sum(events: UsageEvent[]) {
  return tokens(events).reduce(
    (a, e) => ({
      input: a.input + e.usage.input,
      output: a.output + e.usage.output,
      cacheRead: a.cacheRead + e.usage.cacheRead,
      cacheCreation: a.cacheCreation + e.usage.cacheCreation,
    }),
    { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
  );
}

describe('fixture integrity', () => {
  it('the main fixture still ends in an unterminated torn line', () => {
    expect(readFileSync(MAIN_PATH, 'utf8'))
      .toMatch(/\{"type":"assistant","uuid":"u-torn","message":\{"usa$/);
  });
});

describe('token extraction and dedupe', () => {
  it('never harvests the parent toolUseResult rollup', () => {
    expect(sum(parseMain().events))
      .toStrictEqual({ input: 13, output: 27, cacheRead: 100, cacheCreation: 5 });
  });

  it('keeps the last occurrence of a shared requestId group', () => {
    expect(sum(parseSide().events))
      .toStrictEqual({ input: 3, output: 156, cacheRead: 21047, cacheCreation: 6069 });
    const group = tokens(parseSide().events).filter((e) => e.dedupeKey === 'req_side_G');
    expect(group).toHaveLength(1);
    expect(group[0].usage.output).toBe(153);
  });

  it('falls back to the line uuid when requestId is absent', () => {
    const synthetic = tokens(parseMain().events).filter((e) => e.model === '<synthetic>');
    expect(synthetic).toHaveLength(1);
    expect(synthetic[0].dedupeKey).toBe('u-syn-1');
    expect(synthetic[0].usage).toStrictEqual({
      input: 0, output: 0, cacheRead: 0, cacheCreation: 0, cacheCreation1h: 0, cacheCreation5m: 0,
    });
  });

  it('buckets by the configured local time, not UTC', () => {
    const first = tokens(parseMain().events).find((e) => e.dedupeKey === 'req_main_A');
    expect(first?.day).toBe('2026-07-09');
    expect(parseMain().events.map((e) => e.day)).not.toContain('2026-07-08');
  });

  it('buckets by the zone passed in, not the machine\'s ambient zone', () => {
    expect(dayFor('Asia/Hong_Kong')).toBe('2026-07-09');
    expect(dayFor('America/New_York')).toBe('2026-07-08');
  });

  it('strips a bracketed context-window suffix from the model', () => {
    const first = tokens(parseMain().events).find((e) => e.dedupeKey === 'req_main_A');
    expect(first?.model).toBe('claude-opus-4-8');
  });

  it('marks sidechain token events and carries the agent identity', () => {
    const t = tokens(parseSide().events);
    expect(t.every((e) => e.isSidechain)).toBe(true);
    expect(t.every((e) => e.agentId === 'afixture0000000001')).toBe(true);
    expect(t.every((e) => e.agentType === 'general-purpose')).toBe(true);
    expect(tokens(parseMain().events).every((e) => e.isSidechain === false)).toBe(true);
  });
});

describe('cache-creation TTL split', () => {
  const withCacheCreation = (usage: object) =>
    tokenOf(parseTranscript(MAIN, [
      line({ type: 'assistant', requestId: 'r1', timestamp: '2026-08-05T00:00:02.000Z',
        message: { model: 'claude-opus-5', usage } }),
    ], 'UTC'), 'r1').usage;

  it('reads both TTLs from the nested object when the parts sum to the flat total', () => {
    const usage = withCacheCreation({
      cache_creation_input_tokens: 6069,
      cache_creation: { ephemeral_1h_input_tokens: 4000, ephemeral_5m_input_tokens: 2069 },
    });
    expect(usage.cacheCreation).toBe(6069);
    expect(usage.cacheCreation1h).toBe(4000);
    expect(usage.cacheCreation5m).toBe(2069);
  });

  it('attributes the whole total to 5m when the nested object is absent', () => {
    const usage = withCacheCreation({ cache_creation_input_tokens: 500 });
    expect(usage.cacheCreation).toBe(500);
    expect(usage.cacheCreation1h).toBe(0);
    // Transcripts written before `cache_creation` existed must not price at zero.
    expect(usage.cacheCreation5m).toBe(500);
  });

  it('attributes the unexplained remainder to 5m when the nested object is partial', () => {
    const usage = withCacheCreation({
      cache_creation_input_tokens: 100,
      cache_creation: { ephemeral_1h_input_tokens: 30 },
    });
    expect(usage.cacheCreation).toBe(100);
    expect(usage.cacheCreation1h).toBe(30);
    expect(usage.cacheCreation5m).toBe(70);
  });

  it('adds the remainder to a declared 5m when the parts sum below the flat total', () => {
    const usage = withCacheCreation({
      cache_creation_input_tokens: 100,
      cache_creation: { ephemeral_1h_input_tokens: 10, ephemeral_5m_input_tokens: 20 },
    });
    expect(usage.cacheCreation).toBe(100);
    expect(usage.cacheCreation1h).toBe(10);
    expect(usage.cacheCreation5m).toBe(90);
  });

  it('clamps the remainder at zero and keeps the flat field authoritative when the parts sum above it', () => {
    const usage = withCacheCreation({
      cache_creation_input_tokens: 10,
      cache_creation: { ephemeral_1h_input_tokens: 8, ephemeral_5m_input_tokens: 9 },
    });
    expect(usage.cacheCreation).toBe(10);
    expect(usage.cacheCreation1h).toBe(8);
    expect(usage.cacheCreation5m).toBe(9);
  });

  it('leaves all three at zero when there is no cache creation', () => {
    const usage = withCacheCreation({ input_tokens: 5, output_tokens: 7 });
    expect(usage.cacheCreation).toBe(0);
    expect(usage.cacheCreation1h).toBe(0);
    expect(usage.cacheCreation5m).toBe(0);
  });

  it('never throws when cache_creation is not an object, and degrades to all-5m', () => {
    const parsed = parseTranscript(MAIN, [
      line({ type: 'assistant', requestId: 'r1', timestamp: '2026-08-05T00:00:02.000Z',
        message: { model: 'claude-opus-5',
          usage: { cache_creation_input_tokens: 400, cache_creation: 'ephemeral_1h' } } }),
    ], 'UTC');
    expect(parsed.malformedLines).toBe(0);
    expect(tokenOf(parsed, 'r1').usage.cacheCreation).toBe(400);
    expect(tokenOf(parsed, 'r1').usage.cacheCreation1h).toBe(0);
    expect(tokenOf(parsed, 'r1').usage.cacheCreation5m).toBe(400);
  });

  it('keeps the last usage-bearing occurrence of a requestId, split included', () => {
    const parsed = parseTranscript(MAIN, [
      line({ type: 'assistant', requestId: 'r1', timestamp: '2026-08-05T00:00:02.000Z',
        message: { model: 'claude-opus-5', usage: {
          cache_creation_input_tokens: 100,
          cache_creation: { ephemeral_1h_input_tokens: 100, ephemeral_5m_input_tokens: 0 },
        } } }),
      line({ type: 'assistant', requestId: 'r1', timestamp: '2026-08-05T00:00:04.000Z',
        message: { model: 'claude-opus-5', usage: {
          cache_creation_input_tokens: 300,
          cache_creation: { ephemeral_1h_input_tokens: 200, ephemeral_5m_input_tokens: 100 },
        } } }),
    ], 'UTC');
    expect(tokens(parsed.events)).toHaveLength(1);
    expect(tokenOf(parsed, 'r1').usage.cacheCreation).toBe(300);
    expect(tokenOf(parsed, 'r1').usage.cacheCreation1h).toBe(200);
    expect(tokenOf(parsed, 'r1').usage.cacheCreation5m).toBe(100);
  });
});

describe('request speed', () => {
  const speedOf = (usage: object) =>
    tokenOf(parseTranscript(MAIN, [
      line({ type: 'assistant', requestId: 'r1', timestamp: '2026-08-05T00:00:02.000Z',
        message: { model: 'claude-opus-5', usage } }),
    ], 'UTC'), 'r1').speed;

  it('defaults to standard when the field is absent', () => {
    expect(speedOf({ output_tokens: 300 })).toBe('standard');
  });

  it('reads an explicit standard', () => {
    expect(speedOf({ output_tokens: 300, speed: 'standard' })).toBe('standard');
  });

  it('reads fast', () => {
    expect(speedOf({ output_tokens: 300, speed: 'fast' })).toBe('fast');
  });

  it('normalizes an unexpected value to standard', () => {
    expect(speedOf({ output_tokens: 300, speed: 'turbo' })).toBe('standard');
  });

  it('is populated on every token event of a real transcript', () => {
    expect(tokens(parseMain().events).every((e) => e.speed === 'standard')).toBe(true);
    expect(tokens(parseSide().events).every((e) => e.speed === 'standard')).toBe(true);
  });
});

describe('durationMs derivation', () => {
  it('uses a timestamped attachment line as an anchor candidate', () => {
    const parsed = parseTranscript(MAIN, [
      line({ type: 'attachment', timestamp: '2026-08-05T00:00:00.000Z' }),
      line({ type: 'assistant', requestId: 'r1', timestamp: '2026-08-05T00:00:03.000Z',
        message: { model: 'claude-opus-5', usage: { output_tokens: 300 } } }),
    ], 'UTC');
    expect(tokenOf(parsed, 'r1').durationMs).toBe(3000);
  });

  it('brackets a request from the last eligible preceding line to its own last line', () => {
    const parsed = parseTranscript(MAIN, [
      line({ type: 'user', timestamp: '2026-08-05T00:00:00.000Z', sessionId: 's' }),
      line({ type: 'assistant', requestId: 'r1', timestamp: '2026-08-05T00:00:02.000Z',
        message: { model: 'claude-opus-5', usage: { input_tokens: 1, output_tokens: 500 } } }),
      line({ type: 'assistant', requestId: 'r1', timestamp: '2026-08-05T00:00:05.000Z',
        message: { model: 'claude-opus-5', usage: { input_tokens: 1, output_tokens: 500 } } }),
    ], 'UTC');
    expect(tokenOf(parsed, 'r1').durationMs).toBe(5000);
  });

  it('keeps the first-sight anchor across an interleaved foreign line', () => {
    const parsed = parseTranscript(MAIN, [
      line({ type: 'user', timestamp: '2026-08-05T00:00:00.000Z', sessionId: 's' }),
      line({ type: 'assistant', requestId: 'r1', timestamp: '2026-08-05T00:00:02.000Z',
        message: { model: 'claude-opus-5', usage: { output_tokens: 400 } } }),
      line({ type: 'user', timestamp: '2026-08-05T00:00:03.000Z',
        message: { content: [{ type: 'tool_result', tool_use_id: 't1' }] } }),
      line({ type: 'assistant', requestId: 'r1', timestamp: '2026-08-05T00:00:06.000Z',
        message: { model: 'claude-opus-5', usage: { output_tokens: 400 } } }),
    ], 'UTC');
    expect(tokenOf(parsed, 'r1').durationMs).toBe(6000);
  });

  it('never anchors to bookkeeping lines or clears the candidate on timestamp-less lines', () => {
    const parsed = parseTranscript(MAIN, [
      line({ type: 'user', timestamp: '2026-08-05T00:00:00.000Z', sessionId: 's' }),
      line({ type: 'queue-operation', timestamp: '2026-08-05T00:00:09.000Z' }),
      line({ type: 'mode' }),
      line({ type: 'assistant', requestId: 'r1', timestamp: '2026-08-05T00:00:02.000Z',
        message: { model: 'claude-opus-5', usage: { output_tokens: 300 } } }),
    ], 'UTC');
    expect(tokenOf(parsed, 'r1').durationMs).toBe(2000);
  });

  it.each(['file-history-delta', 'pr-link'] as const)(
    'does not use an excluded %s line as an anchor',
    (type) => {
      const parsed = parseTranscript(MAIN, [
        line({ type: 'user', timestamp: '2026-08-05T00:00:00.000Z', sessionId: 's' }),
        line({ type, timestamp: '2026-08-05T00:00:09.000Z' }),
        line({ type: 'assistant', requestId: 'r1', timestamp: '2026-08-05T00:00:02.000Z',
          message: { model: 'claude-opus-5', usage: { output_tokens: 300 } } }),
      ], 'UTC');
      expect(tokenOf(parsed, 'r1').durationMs).toBe(2000);
    },
  );

  it('omits durationMs for the first request in a file and for non-positive intervals', () => {
    const first = parseTranscript(MAIN, [
      line({ type: 'assistant', requestId: 'r1', timestamp: '2026-08-05T00:00:02.000Z',
        message: { model: 'claude-opus-5', usage: { output_tokens: 300 } } }),
    ], 'UTC');
    expect(tokenOf(first, 'r1').durationMs).toBeUndefined();

    const negative = parseTranscript(MAIN, [
      line({ type: 'user', timestamp: '2026-08-05T00:00:07.000Z', sessionId: 's' }),
      line({ type: 'assistant', requestId: 'r1', timestamp: '2026-08-05T00:00:02.000Z',
        message: { model: 'claude-opus-5', usage: { output_tokens: 300 } } }),
    ], 'UTC');
    expect(tokenOf(negative, 'r1').durationMs).toBeUndefined();
  });

  it('omits durationMs for an exactly zero interval', () => {
    const parsed = parseTranscript(MAIN, [
      line({ type: 'user', timestamp: '2026-08-05T00:00:02.000Z', sessionId: 's' }),
      line({ type: 'assistant', requestId: 'r1', timestamp: '2026-08-05T00:00:02.000Z',
        message: { model: 'claude-opus-5', usage: { output_tokens: 300 } } }),
    ], 'UTC');
    expect(tokenOf(parsed, 'r1').durationMs).toBeUndefined();
  });

  it('anchors a later request to the previous request\'s last assistant line', () => {
    const parsed = parseTranscript(MAIN, [
      line({ type: 'user', timestamp: '2026-08-05T00:00:00.000Z', sessionId: 's' }),
      line({ type: 'assistant', requestId: 'r1', timestamp: '2026-08-05T00:00:02.000Z',
        message: { model: 'claude-opus-5', usage: { output_tokens: 200 } } }),
      line({ type: 'assistant', requestId: 'r2', timestamp: '2026-08-05T00:00:06.000Z',
        message: { model: 'claude-opus-5', usage: { output_tokens: 200 } } }),
    ], 'UTC');
    expect(tokenOf(parsed, 'r2').durationMs).toBe(4000);
  });
});

describe('skill attribution on token events', () => {
  it('carries attributionSkill onto the token event, and leaves unattributed turns undefined', () => {
    const byKey = new Map(tokens(parseMain().events).map((e) => [e.dedupeKey, e]));
    // req_main_D is the only main-file turn that ran inside the skill.
    expect(byKey.get('req_main_D')?.skill).toBe('brainstorming');
    // The Skill tool_use itself (req_main_C) precedes the attribution window.
    expect(byKey.get('req_main_C')?.skill).toBeUndefined();
    expect(byKey.get('req_main_A')?.skill).toBeUndefined();
  });

  it('attributes sidechain turns, so a subagent spawned inside a skill counts toward it', () => {
    expect(tokens(parseSide().events).every((e) => e.skill === 'brainstorming')).toBe(true);
  });

  it('reads attribution per line rather than inferring it from a neighbour', () => {
    const line = (extra: string) =>
      `{"type":"assistant","uuid":"u1","requestId":"r1","timestamp":"2026-07-09T02:00:00Z"${extra},`
      + `"message":{"role":"assistant","model":"claude-opus-4-8","usage":{"output_tokens":1}}}`;
    const parse = (extra: string) =>
      tokens(parseTranscript(fileOf(MAIN_PATH, 'main'), [line(extra)], TZ).events)[0];

    expect(parse(',"attributionSkill":"writing-plans"').skill).toBe('writing-plans');
    expect(parse('').skill).toBeUndefined();
    // An empty string is not a skill name.
    expect(parse(',"attributionSkill":""').skill).toBeUndefined();
  });
});

describe('line accounting', () => {
  it('splits parse failures from well-formed ignorable lines', () => {
    const main = parseMain();
    expect(main.malformedLines).toBe(3);
    expect(main.ignoredLines).toBe(4);
    const side = parseSide();
    expect(side.malformedLines).toBe(0);
    expect(side.ignoredLines).toBe(0);
  });

  it('still emits the valid events of a file that has malformed lines', () => {
    expect(tokens(parseMain().events).length).toBeGreaterThan(0);
  });
});

describe('tools, skills and slash commands', () => {
  it('emits one tool-call per tool_use block, including Skill', () => {
    const calls = parseMain().events.filter((e) => e.kind === 'tool-call');
    expect(calls.map((e) => (e as { tool: string }).tool).sort())
      .toStrictEqual(['Agent', 'Bash', 'Skill']);
  });

  it('resolves a tool-error to its tool name through the toolUseId map', () => {
    const errors = parseMain().events.filter((e) => e.kind === 'tool-error');
    expect(errors).toHaveLength(1);
    expect((errors[0] as { tool: string }).tool).toBe('Bash');
  });

  it('keeps Skill tool calls and slash commands as separate sources', () => {
    const skills = parseMain().events.filter(
      (e): e is Extract<UsageEvent, { kind: 'skill' }> => e.kind === 'skill',
    );
    expect(skills.map((s) => ({ name: s.name, source: s.source }))).toStrictEqual([
      { name: 'brainstorming', source: 'skill-tool' },
      { name: '/context', source: 'slash-command' },
    ]);
  });
});

describe('session and agent identity', () => {
  it('emits exactly one session-start from a main file, dated by the earliest timestamped line', () => {
    const starts = parseMain().events.filter(
      (e): e is Extract<UsageEvent, { kind: 'session-start' }> => e.kind === 'session-start',
    );
    expect(starts).toHaveLength(1);
    expect(starts[0].day).toBe('2026-07-09');
    expect(starts[0].sessionId).toBe(SESSION);
  });

  it('emits no session-start from a sidechain file, and exactly one agent-run', () => {
    const side = parseSide().events;
    expect(side.filter((e) => e.kind === 'session-start')).toHaveLength(0);
    const runs = side.filter(
      (e): e is Extract<UsageEvent, { kind: 'agent-run' }> => e.kind === 'agent-run',
    );
    expect(runs).toHaveLength(1);
    expect(runs[0].agentType).toBe('general-purpose');
    expect(parseMain().events.filter((e) => e.kind === 'agent-run')).toHaveLength(0);
  });
});

describe('ParsedFile.session', () => {
  it('carries the file identity and the wall clock of its earliest and latest lines', () => {
    const main = parseMain();
    expect(main.session).toStrictEqual({
      sessionId: SESSION,
      project: '-fixture-project',
      kind: 'main',
      // 16:30Z is 00:30 the next day in Asia/Hong_Kong -- the day key follows the zone.
      day: '2026-07-09',
      startedAt: '2026-07-08T16:30:00Z',
      // The main file's own last line -- the session's 03:01Z end comes from the sidechain,
      // and the two are merged in the aggregator, not here.
      endedAt: '2026-07-09T02:05:00Z',
    });
  });

  it('gives a sidechain the SAME sessionId as its parent, so the pair is one session', () => {
    expect(parseSide().session.sessionId).toBe(SESSION);
    expect(parseSide().session.kind).toBe('sidechain');
  });

  it('leaves the clock fields absent when no line carries a timestamp', () => {
    const out = parseTranscript(MAIN, [line({ type: 'mode', mode: 'normal' })], TZ);
    expect(out.session).toStrictEqual({ sessionId: 's', project: '-p', kind: 'main' });
  });

  it('takes the LAST aiTitle as the label, and still counts those lines as ignored', () => {
    const out = parseTranscript(MAIN, [
      line({ type: 'ai-title', aiTitle: 'First guess' }),
      line({ type: 'ai-title', aiTitle: 'Session analysis tab' }),
    ], TZ);
    expect(out.session.label).toBe('Session analysis tab');
    expect(out.ignoredLines).toBe(2);
  });

  it('has no label when the ai-title line is absent or empty', () => {
    expect(parseMain().session.label).toBeUndefined();
    expect(parseTranscript(MAIN, [line({ type: 'ai-title', aiTitle: '' })], TZ).session.label)
      .toBeUndefined();
  });
});

describe('robustness', () => {
  it('never throws on garbage, and counts an unresolvable tool_use_id as unknown', () => {
    const file = fileOf(MAIN_PATH, 'main');
    const lines = [
      '',
      '   ',
      '{',
      '{"type":"brand-new-future-type","x":1}',
      '{"type":"user","uuid":"a","timestamp":"2026-07-09T02:00:00Z","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"nope","is_error":true}]}}',
    ];
    const out = parseTranscript(file, lines, TZ);
    expect(out.malformedLines).toBe(1);
    expect(out.ignoredLines).toBe(1);
    const errors = out.events.filter((e) => e.kind === 'tool-error');
    expect(errors).toHaveLength(1);
    expect((errors[0] as { tool: string }).tool).toBe('unknown');
  });
});
