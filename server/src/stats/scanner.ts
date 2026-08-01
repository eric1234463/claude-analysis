import { readdir, stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { TranscriptFile, TranscriptKind } from './contracts';

const SIDECHAIN_RE = /^agent-(.+)\.jsonl$/;

/** Returns null for any path that is not one of the two recognized transcript shapes. */
export function classifyTranscriptPath(
  root: string,
  absPath: string,
): { project: string; kind: TranscriptKind; agentId?: string } | null {
  const rel = path.relative(root, absPath);
  const parts = rel.split(path.sep);

  // <project>/<sessionId>.jsonl -> main
  if (parts.length === 2 && parts[1].endsWith('.jsonl')) {
    return { project: parts[0], kind: 'main' };
  }

  // <project>/<sessionId>/subagents/agent-<agentId>.jsonl -> sidechain
  if (parts.length === 4 && parts[2] === 'subagents') {
    const match = SIDECHAIN_RE.exec(parts[3]);
    if (match) {
      return { project: parts[0], kind: 'sidechain', agentId: match[1] };
    }
  }

  return null;
}

async function readAgentType(metaPath: string): Promise<string> {
  try {
    const raw = await readFile(metaPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.agentType === 'string') {
      return parsed.agentType;
    }
  } catch {
    // absent, unreadable, or malformed — fall through
  }
  return 'unknown';
}

async function walk(dir: string, out: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      out.push(full);
    }
  }
}

/** Recursively discovers transcripts under `root`. Order follows the directory walk. */
export async function scanTranscripts(root: string): Promise<TranscriptFile[]> {
  const candidates: string[] = [];
  await walk(root, candidates);

  const results: TranscriptFile[] = [];
  for (const absPath of candidates) {
    const classified = classifyTranscriptPath(root, absPath);
    if (!classified) continue;

    let stats;
    try {
      stats = await stat(absPath);
    } catch {
      continue;
    }

    const file: TranscriptFile = {
      path: absPath,
      project: classified.project,
      kind: classified.kind,
      mtimeMs: stats.mtimeMs,
      size: stats.size,
    };

    if (classified.kind === 'sidechain' && classified.agentId) {
      file.agentId = classified.agentId;
      const metaPath = path.join(path.dirname(absPath), `agent-${classified.agentId}.meta.json`);
      file.agentType = await readAgentType(metaPath);
    }

    results.push(file);
  }

  return results;
}
