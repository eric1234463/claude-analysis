import { describe, it, expect } from 'vitest';
import { AGGREGATE_STATS_KEYS, type ParsedFile, type UsageEvent } from './contracts';
import { aggregate } from './aggregator';

const AT = '2026-08-01T00:00:00.000Z';
const usage = (input: number, output: number, cacheRead = 0, cacheCreation = 0) =>
  ({ input, output, cacheRead, cacheCreation });

const file = (events: UsageEvent[], malformedLines = 0, ignoredLines = 0): ParsedFile =>
  ({ events, malformedLines, ignoredLines });

const mainFile = file(
  [
    { kind: 'session-start', day: '2026-07-09', project: '-a', sessionId: 's1' },
    { kind: 'token', day: '2026-07-09', project: '-a', model: 'claude-opus-4-8',
      dedupeKey: 'r1', usage: usage(10, 20, 100, 5), isSidechain: false },
    { kind: 'token', day: '2026-07-09', project: '-a', model: '<synthetic>',
      dedupeKey: 'u1', usage: usage(5, 5), isSidechain: false },
    { kind: 'tool-call', day: '2026-07-09', project: '-a', tool: 'Bash', isSidechain: false },
    { kind: 'tool-error', day: '2026-07-09', project: '-a', tool: 'Bash', isSidechain: false },
    { kind: 'tool-call', day: '2026-07-09', project: '-a', tool: 'Read', isSidechain: false },
    { kind: 'skill', day: '2026-07-09', project: '-a', name: 'brainstorming',
      source: 'skill-tool', isSidechain: false },
    { kind: 'skill', day: '2026-07-09', project: '-a', name: '/context',
      source: 'slash-command', isSidechain: false },
  ],
  3,
  4,
);

const sideFile = file([
  { kind: 'agent-run', day: '2026-07-09', project: '-a', agentType: 'general-purpose' },
  { kind: 'token', day: '2026-07-09', project: '-a', model: 'claude-opus-4-8', dedupeKey: 'r2',
    usage: usage(2, 153, 21047, 6069), isSidechain: true,
    agentId: 'a1', agentType: 'general-purpose' },
]);

const otherFile = file(
  [
    { kind: 'session-start', day: '2026-07-10', project: '-b', sessionId: 's2' },
    { kind: 'token', day: '2026-07-10', project: '-b', model: 'claude-sonnet-5', dedupeKey: 'r3',
      usage: usage(7, 11), isSidechain: false },
  ],
  0,
  1,
);

const all = () => aggregate([mainFile, sideFile, otherFile], AT);

describe('shape and file accounting', () => {
  it('emits exactly the eleven declared top-level keys', () => {
    expect(Object.keys(all()).sort()).toStrictEqual([...AGGREGATE_STATS_KEYS]);
  });

  it('reports the file count and the summed line counters', () => {
    const s = all();
    expect(s.generatedAt).toBe(AT);
    expect(s.scannedFiles).toBe(3);
    expect(s.malformedLines).toBe(3);
    expect(s.ignoredLines).toBe(5);
  });
});

describe('the day x project fact table', () => {
  it('places every event in its day/project cell', () => {
    const s = all();
    expect(Object.keys(s.days)).toStrictEqual(['2026-07-09', '2026-07-10']);
    expect(Object.keys(s.days['2026-07-09'])).toStrictEqual(['-a']);
    expect(Object.keys(s.days['2026-07-10'])).toStrictEqual(['-b']);
  });

  it('splits main and sidechain tokens and keeps their sum in tokens', () => {
    const cell = all().days['2026-07-09']['-a'];
    expect(cell.mainTokens)
      .toStrictEqual({ input: 15, output: 25, cacheRead: 100, cacheCreation: 5, total: 145 });
    expect(cell.sidechainTokens)
      .toStrictEqual({ input: 2, output: 153, cacheRead: 21047, cacheCreation: 6069, total: 27271 });
    expect(cell.tokens)
      .toStrictEqual({ input: 17, output: 178, cacheRead: 21147, cacheCreation: 6074, total: 27416 });
  });

  it('rolls totals up as the sum of every cell', () => {
    const s = all();
    expect(s.totals.tokens)
      .toStrictEqual({ input: 24, output: 189, cacheRead: 21147, cacheCreation: 6074, total: 27434 });
    expect(s.totals.sessionsStarted).toBe(2);
    expect(s.totals.toolCalls).toBe(2);
    expect(s.totals.toolErrors).toBe(1);
    expect(s.totals.skillInvocations).toBe(2);
    expect(s.totals.agentRuns).toBe(1);
  });
});

describe('dimensions', () => {
  it('excludes <synthetic> from models but keeps its tokens in the totals', () => {
    const s = all();
    expect(s.models).toStrictEqual(['claude-opus-4-8', 'claude-sonnet-5']);
    expect(Object.keys(s.totals.models)).toStrictEqual(['claude-opus-4-8', 'claude-sonnet-5']);
    expect(Object.keys(s.days['2026-07-09']['-a'].models)).toStrictEqual(['claude-opus-4-8']);
    expect(s.totals.tokens.input).toBe(24);
  });

  it('counts tool calls and errors independently', () => {
    expect(all().totals.tools).toStrictEqual({
      Bash: { calls: 1, errors: 1 },
      Read: { calls: 1, errors: 0 },
    });
    expect(all().tools).toStrictEqual(['Bash', 'Read']);
  });

  it('keys skills by source and name, and lists them sorted', () => {
    const s = all();
    expect(s.totals.skills)
      .toStrictEqual({ 'skill-tool|brainstorming': 1, 'slash-command|/context': 1 });
    expect(s.skills).toStrictEqual([
      { name: 'brainstorming', source: 'skill-tool' },
      { name: '/context', source: 'slash-command' },
    ]);
  });

  it('rolls agent runs and sidechain tokens up per agentType', () => {
    const s = all();
    expect(s.agents).toStrictEqual(['general-purpose']);
    expect(s.totals.agents).toStrictEqual({
      'general-purpose': {
        runs: 1,
        tokens: { input: 2, output: 153, cacheRead: 21047, cacheCreation: 6069, total: 27271 },
      },
    });
  });

  it('lists projects sorted and derived from the cells', () => {
    expect(all().projects).toStrictEqual(['-a', '-b']);
  });

  it('rolls token events up per attributed skill, merging main and sidechain under one bare name', () => {
    const s = aggregate([file([
      { kind: 'token', day: '2026-07-09', project: '-a', model: 'claude-opus-4-8',
        dedupeKey: 'r1', usage: usage(1, 4), isSidechain: false, skill: 'brainstorming' },
      { kind: 'token', day: '2026-07-09', project: '-a', model: 'claude-opus-4-8',
        dedupeKey: 'r2', usage: usage(2, 153, 21047, 6069), isSidechain: true,
        agentType: 'general-purpose', skill: 'brainstorming' },
      { kind: 'token', day: '2026-07-09', project: '-a', model: 'claude-opus-4-8',
        dedupeKey: 'r3', usage: usage(9, 9), isSidechain: false, skill: 'writing-plans' },
      // Unattributed: counted in tokens, absent from skillTokens.
      { kind: 'token', day: '2026-07-09', project: '-a', model: 'claude-opus-4-8',
        dedupeKey: 'r4', usage: usage(100, 100), isSidechain: false },
    ])], AT);

    expect(s.totals.skillTokens).toStrictEqual({
      brainstorming: { input: 3, output: 157, cacheRead: 21047, cacheCreation: 6069, total: 27276 },
      'writing-plans': { input: 9, output: 9, cacheRead: 0, cacheCreation: 0, total: 18 },
    });
    // The unattributed turn is still in tokens, so skillTokens never has to sum to it.
    expect(s.totals.tokens.input).toBe(112);
  });

  it('leaves skillTokens empty when nothing was attributed', () => {
    expect(all().totals.skillTokens).toStrictEqual({});
  });
});

describe('determinism', () => {
  it('emits keys in ascending order regardless of event order', () => {
    const shuffled = aggregate([otherFile, sideFile, mainFile], AT);
    expect(Object.keys(shuffled.days)).toStrictEqual(['2026-07-09', '2026-07-10']);
    expect(shuffled.projects).toStrictEqual(['-a', '-b']);
    expect(shuffled.models).toStrictEqual(['claude-opus-4-8', 'claude-sonnet-5']);
    expect(shuffled.totals).toStrictEqual(all().totals);
  });

  it('returns a valid empty aggregate for no files', () => {
    const s = aggregate([], AT);
    expect(Object.keys(s).sort()).toStrictEqual([...AGGREGATE_STATS_KEYS]);
    expect(s.scannedFiles).toBe(0);
    expect(s.days).toStrictEqual({});
    expect(s.projects).toStrictEqual([]);
    expect(s.totals.tokens)
      .toStrictEqual({ input: 0, output: 0, cacheRead: 0, cacheCreation: 0, total: 0 });
  });

  it('sorts agents, skills, and every nested map, even with an adversarially-ordered fixture', () => {
    // Second project '-z' in the same day as '-a' below, inserted (via file order) before it.
    const fileZ = file([
      { kind: 'token', day: '2026-07-09', project: '-z', model: 'zzz-model', dedupeKey: 'dz1',
        usage: usage(1, 1), isSidechain: false },
      { kind: 'tool-call', day: '2026-07-09', project: '-z', tool: 'Zulu', isSidechain: false },
    ]);

    // Baseline project '-a': establishes the 'general-purpose' agentType and the
    // 'brainstorming' skill, both of which the third file below will precede alphabetically.
    const fileA = file([
      { kind: 'token', day: '2026-07-09', project: '-a', model: 'aaa-model', dedupeKey: 'da1',
        usage: usage(1, 1), isSidechain: false },
      { kind: 'tool-call', day: '2026-07-09', project: '-a', tool: 'Bash', isSidechain: false },
      { kind: 'skill', day: '2026-07-09', project: '-a', name: 'brainstorming',
        source: 'skill-tool', isSidechain: false },
      { kind: 'agent-run', day: '2026-07-09', project: '-a', agentType: 'general-purpose' },
    ]);

    // Third file: its agentType and skill both sort BEFORE fileA's, but are inserted AFTER it.
    const fileThird = file([
      { kind: 'agent-run', day: '2026-07-09', project: '-a', agentType: 'aa-agent' },
      { kind: 'skill', day: '2026-07-09', project: '-a', name: 'apple',
        source: 'skill-tool', isSidechain: false },
    ]);

    const out = aggregate([fileZ, fileA, fileThird], AT);
    const skillSortKey = (s: { source: string; name: string }) => `${s.source}|${s.name}`;

    // Each collection must equal its own sorted copy -- self-checking, no hardcoded order.
    expect(out.agents).toStrictEqual([...out.agents].sort());
    expect(out.skills.map(skillSortKey)).toStrictEqual([...out.skills.map(skillSortKey)].sort());
    expect(Object.keys(out.totals.tools)).toStrictEqual([...Object.keys(out.totals.tools)].sort());
    expect(Object.keys(out.totals.models)).toStrictEqual([...Object.keys(out.totals.models)].sort());
    expect(Object.keys(out.days['2026-07-09']))
      .toStrictEqual([...Object.keys(out.days['2026-07-09'])].sort());
  });
});
