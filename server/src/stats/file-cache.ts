import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FileAggregateCache, ParsedFile, TranscriptFile } from './contracts';

export function fileCacheKey(
  file: Pick<TranscriptFile, 'path' | 'mtimeMs' | 'size'>,
  timeZone: string,
): string {
  return `${file.path}:${file.mtimeMs}:${file.size}:${timeZone}:v2`;
}

export class JsonFileAggregateCache implements FileAggregateCache {
  private readonly entries = new Map<string, ParsedFile>();

  constructor(private readonly filePath: string) {}

  get(key: string): ParsedFile | undefined {
    return this.entries.get(key);
  }

  set(key: string, value: ParsedFile): void {
    this.entries.set(key, value);
  }

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return;
      }
      this.entries.clear();
      for (const [key, value] of Object.entries(parsed as Record<string, ParsedFile>)) {
        this.entries.set(key, value);
      }
    } catch {
      // Missing, empty, truncated, or otherwise unparseable store: start empty.
    }
  }

  async save(): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const asObject = Object.fromEntries(this.entries);
    await writeFile(this.filePath, JSON.stringify(asObject), 'utf8');
  }
}
