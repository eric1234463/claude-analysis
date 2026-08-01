import os from 'node:os';
import path from 'node:path';
import type { AppConfig } from './contracts';

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  return {
    transcriptsRoot: env.CLAUDE_TRANSCRIPTS_ROOT ?? path.join(os.homedir(), '.claude', 'projects'),
    timeZone: env.DASHBOARD_TIME_ZONE ?? 'Asia/Hong_Kong',
    cacheFile: env.DASHBOARD_CACHE_FILE ?? path.join(process.cwd(), '.cache', 'stats-cache.json'),
  };
}
