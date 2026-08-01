import { readFile } from 'node:fs/promises';
import { aggregate } from './aggregator';
import { fileCacheKey } from './file-cache';
import { parseTranscript } from './parser';
import { scanTranscripts } from './scanner';
import type { AggregateStats, AppConfig, FileAggregateCache, ParsedFile, StatsPipeline } from './contracts';

const BATCH_SIZE = 50;

export class TranscriptStatsPipeline implements StatsPipeline {
  constructor(
    private readonly config: AppConfig,
    private readonly cache: FileAggregateCache,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async run(): Promise<AggregateStats> {
    const files = await scanTranscripts(this.config.transcriptsRoot);
    const parsedFiles: ParsedFile[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const key = fileCacheKey(file, this.config.timeZone);
      const cached = this.cache.get(key);
      if (cached !== undefined) {
        parsedFiles.push(cached);
      } else {
        let parsed: ParsedFile;
        try {
          const raw = await readFile(file.path, 'utf8');
          parsed = parseTranscript(file, raw.split('\n'), this.config.timeZone);
        } catch {
          parsed = { events: [], malformedLines: 0, ignoredLines: 0 };
        }
        this.cache.set(key, parsed);
        parsedFiles.push(parsed);
      }

      if ((i + 1) % BATCH_SIZE === 0 || i + 1 === files.length) {
        console.log(`stats pipeline: scanned ${i + 1}/${files.length} files`);
      }
    }

    return aggregate(parsedFiles, this.now());
  }
}
