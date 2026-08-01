import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { classifyTranscriptPath, scanTranscripts } from './scanner';

const FIXTURES = path.resolve(__dirname, '../../test/fixtures/projects');
const SESSION = '11111111-1111-1111-1111-111111111111';

describe('classifyTranscriptPath', () => {
  it('classifies a main session file by the directory directly under the root', () => {
    expect(classifyTranscriptPath('/r', '/r/-proj/abc.jsonl'))
      .toStrictEqual({ project: '-proj', kind: 'main' });
  });

  it('classifies a sidechain file, walking up past subagents/ and the session dir', () => {
    expect(classifyTranscriptPath('/r', `/r/-proj/${SESSION}/subagents/agent-a99.jsonl`))
      .toStrictEqual({ project: '-proj', kind: 'sidechain', agentId: 'a99' });
  });

  it('returns null for paths that are not one of the two recognized shapes', () => {
    expect(classifyTranscriptPath('/r', '/r/-proj/memory/notes.jsonl')).toBeNull();
    expect(classifyTranscriptPath('/r', `/r/-proj/${SESSION}/tool-results/x.jsonl`)).toBeNull();
    expect(classifyTranscriptPath('/r', `/r/-proj/${SESSION}/subagents/other.jsonl`)).toBeNull();
    expect(classifyTranscriptPath('/r', '/r/loose.jsonl')).toBeNull();
  });
});

describe('scanTranscripts over the committed fixtures', () => {
  it('finds exactly the three transcripts, sorted by path', async () => {
    const files = await scanTranscripts(FIXTURES);
    expect(files.map((f) => path.relative(FIXTURES, f.path))).toStrictEqual([
      path.join('-fixture-project', `${SESSION}`, 'subagents', 'agent-afixture0000000001.jsonl'),
      path.join('-fixture-project', `${SESSION}.jsonl`),
      path.join('-fixture-project-two', '22222222-2222-2222-2222-222222222222.jsonl'),
    ]);
  });

  it('never keys a project as "subagents" or by a session UUID', async () => {
    const files = await scanTranscripts(FIXTURES);
    expect([...new Set(files.map((f) => f.project))].sort())
      .toStrictEqual(['-fixture-project', '-fixture-project-two']);
  });

  it('attaches agentId from the filename and agentType from the adjacent meta file', async () => {
    const files = await scanTranscripts(FIXTURES);
    const side = files.find((f) => f.kind === 'sidechain');
    expect(side?.agentId).toBe('afixture0000000001');
    expect(side?.agentType).toBe('general-purpose');
    expect(side?.project).toBe('-fixture-project');
  });

  it('populates mtimeMs and size from stat', async () => {
    const files = await scanTranscripts(FIXTURES);
    for (const f of files) {
      expect(typeof f.mtimeMs).toBe('number');
      expect(f.mtimeMs).toBeGreaterThan(0);
      expect(f.size).toBeGreaterThan(0);
    }
  });
});

describe('degradation', () => {
  it('returns a sidechain with agentType "unknown" when its meta file is absent', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'scan-'));
    const dir = path.join(root, '-p', 'sess', 'subagents');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'agent-abc.jsonl'), '{"type":"user"}\n');
    const files = await scanTranscripts(root);
    expect(files).toHaveLength(1);
    expect(files[0].kind).toBe('sidechain');
    expect(files[0].agentType).toBe('unknown');
  });

  it('resolves to an empty array for a root that does not exist', async () => {
    await expect(scanTranscripts(path.join(tmpdir(), 'definitely-not-here-9f3a')))
      .resolves.toStrictEqual([]);
  });
});
