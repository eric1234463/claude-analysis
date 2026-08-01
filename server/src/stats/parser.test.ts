import { describe, it, expect } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { TranscriptFile, UsageEvent } from './contracts';
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
    expect(synthetic[0].usage).toStrictEqual({ input: 0, output: 0, cacheRead: 0, cacheCreation: 0 });
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
