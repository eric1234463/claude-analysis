import type { ParsedFile, TokenUsage, TranscriptFile, UsageEvent } from './contracts';

const MODEL_SUFFIX_RE = /\[[^\]]*\]$/;
const COMMAND_NAME_RE = /<command-name>([^<]*)<\/command-name>/g;
const NON_ANCHOR_TYPES = new Set(['queue-operation', 'file-history-delta', 'pr-link']);

interface RawContentBlock {
  type?: string;
  id?: string;
  name?: string;
  input?: { skill?: unknown };
  tool_use_id?: string;
  is_error?: boolean;
}

interface RawLine {
  type?: string;
  uuid?: string;
  sessionId?: string;
  requestId?: string;
  timestamp?: string;
  attributionSkill?: string;
  message?: {
    role?: string;
    model?: string;
    content?: RawContentBlock[] | string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_creation?: {
        ephemeral_1h_input_tokens?: number;
        ephemeral_5m_input_tokens?: number;
      };
      speed?: string;
    };
  };
}

function dayOf(timestamp: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(timestamp));
}

function normalizeModel(model: string): string {
  return model.replace(MODEL_SUFFIX_RE, '');
}

interface TokenEvent {
  kind: 'token';
  day: string;
  project: string;
  model: string;
  dedupeKey: string;
  usage: TokenUsage;
  speed: 'standard' | 'fast';
  isSidechain: boolean;
  agentId?: string;
  agentType?: string;
  skill?: string;
  durationMs?: number;
}

interface RequestTiming {
  startTimestamp?: string;
  endTimestamp?: string;
}

/** Pure: no fs, no clock, no ambient timezone. Never throws.
 *  `timeZone` is an IANA zone; every emitted `day` is
 *  `new Intl.DateTimeFormat('en-CA', { timeZone, year:'numeric', month:'2-digit', day:'2-digit' })
 *    .format(new Date(timestamp))`  ->  'YYYY-MM-DD'.
 *  Dedupe is **per call** (i.e. per file): token events are keyed on
 *  `line.requestId ?? line.uuid`, and the **last** usage-bearing occurrence in line order wins.
 *  Token usage is read **only** from `line.message.usage` on `type: "assistant"` lines — no other
 *  field anywhere on the line, including any subagent rollup sibling of `message`, is ever read.
 *  A usage-bearing line's top-level `attributionSkill` (a bare skill name, written by Claude Code
 *  for the duration of a skill run and absent outside one) is carried onto the token event as
 *  `skill`; it is scoped, so it is read per line and never inferred from a neighbouring line. */
export function parseTranscript(
  file: TranscriptFile,
  lines: Iterable<string>,
  timeZone: string,
): ParsedFile {
  let malformedLines = 0;
  let ignoredLines = 0;
  const tokenEvents = new Map<string, TokenEvent>();
  const otherEvents: UsageEvent[] = [];
  const toolUseIdToName = new Map<string, string>();
  const requestTimings = new Map<string, RequestTiming>();
  let earliestTs: string | undefined;
  let earliestLine: RawLine | undefined;
  let anchorCandidate: string | undefined;

  for (const raw of lines) {
    if (raw.trim() === '') continue;

    let parsed: RawLine;
    try {
      parsed = JSON.parse(raw);
    } catch {
      malformedLines++;
      continue;
    }

    if (typeof parsed.timestamp === 'string') {
      if (earliestTs === undefined || parsed.timestamp < earliestTs) {
        earliestTs = parsed.timestamp;
        earliestLine = parsed;
      }
    }

    const usageKey = parsed.type === 'assistant' && parsed.message?.usage
      ? parsed.requestId ?? parsed.uuid
      : undefined;
    if (typeof usageKey === 'string') {
      const endTimestamp = typeof parsed.timestamp === 'string' ? parsed.timestamp : undefined;
      const timing = requestTimings.get(usageKey);
      if (timing === undefined) {
        requestTimings.set(usageKey, { startTimestamp: anchorCandidate, endTimestamp });
      } else {
        timing.endTimestamp = endTimestamp;
      }
    }

    if (typeof parsed.timestamp === 'string' && !NON_ANCHOR_TYPES.has(parsed.type ?? '')) {
      anchorCandidate = parsed.timestamp;
    }

    if (parsed.type !== 'assistant' && parsed.type !== 'user') {
      ignoredLines++;
      continue;
    }

    const day = typeof parsed.timestamp === 'string' ? dayOf(parsed.timestamp, timeZone) : '';

    if (parsed.type === 'assistant') {
      const message = parsed.message;
      const content = message?.content;

      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'tool_use' && typeof block.name === 'string') {
            if (typeof block.id === 'string') {
              toolUseIdToName.set(block.id, block.name);
            }
            otherEvents.push({
              kind: 'tool-call',
              day,
              project: file.project,
              tool: block.name,
              isSidechain: file.kind === 'sidechain',
            });
            if (block.name === 'Skill' && typeof block.input?.skill === 'string' && block.input.skill.length > 0) {
              otherEvents.push({
                kind: 'skill',
                day,
                project: file.project,
                name: block.input.skill,
                source: 'skill-tool',
                isSidechain: file.kind === 'sidechain',
              });
            }
          }
        }
      }

      if (message?.usage) {
        const key = parsed.requestId ?? parsed.uuid;
        if (typeof key === 'string' && typeof message.model === 'string') {
          const cacheCreation = message.usage.cache_creation_input_tokens ?? 0;
          const cacheCreation1h = message.usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
          const declared5m = message.usage.cache_creation?.ephemeral_5m_input_tokens ?? 0;
          const usage: TokenUsage = {
            input: message.usage.input_tokens ?? 0,
            output: message.usage.output_tokens ?? 0,
            cacheRead: message.usage.cache_read_input_tokens ?? 0,
            cacheCreation,
            cacheCreation1h,
            // The flat field stays authoritative: whatever it does not explain is 5m, the
            // cheaper TTL, so an absent or partial nested object understates rather than
            // pricing at zero. Never negative when the parts overshoot the total.
            cacheCreation5m: declared5m + Math.max(0, cacheCreation - cacheCreation1h - declared5m),
          };
          const model = message.model === '<synthetic>' ? message.model : normalizeModel(message.model);
          const event: TokenEvent = {
            kind: 'token',
            day,
            project: file.project,
            model,
            dedupeKey: key,
            usage,
            speed: message.usage.speed === 'fast' ? 'fast' : 'standard',
            isSidechain: file.kind === 'sidechain',
            ...(file.kind === 'sidechain' ? { agentId: file.agentId, agentType: file.agentType } : {}),
            ...(typeof parsed.attributionSkill === 'string' && parsed.attributionSkill.length > 0
              ? { skill: parsed.attributionSkill }
              : {}),
          };
          tokenEvents.set(key, event);
        }
      }
    } else {
      // type === 'user'
      const message = parsed.message;
      const content = message?.content;

      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'tool_result' && block.is_error === true) {
            const tool = typeof block.tool_use_id === 'string'
              ? toolUseIdToName.get(block.tool_use_id) ?? 'unknown'
              : 'unknown';
            otherEvents.push({
              kind: 'tool-error',
              day,
              project: file.project,
              tool,
              isSidechain: file.kind === 'sidechain',
            });
          }
        }
      } else if (typeof content === 'string') {
        for (const match of content.matchAll(COMMAND_NAME_RE)) {
          const name = match[1].trim();
          otherEvents.push({
            kind: 'skill',
            day,
            project: file.project,
            name,
            source: 'slash-command',
            isSidechain: file.kind === 'sidechain',
          });
        }
      }
    }
  }

  const events: UsageEvent[] = [];

  for (const [key, event] of tokenEvents) {
    const timing = requestTimings.get(key);
    if (timing?.startTimestamp !== undefined && timing.endTimestamp !== undefined) {
      const durationMs = Date.parse(timing.endTimestamp) - Date.parse(timing.startTimestamp);
      if (durationMs > 0) {
        event.durationMs = durationMs;
      }
    }
  }

  if (earliestTs !== undefined && earliestLine !== undefined) {
    const day = dayOf(earliestTs, timeZone);
    if (file.kind === 'main') {
      if (typeof earliestLine.sessionId === 'string') {
        events.push({
          kind: 'session-start',
          day,
          project: file.project,
          sessionId: earliestLine.sessionId,
        });
      }
    } else {
      events.push({
        kind: 'agent-run',
        day,
        project: file.project,
        agentType: file.agentType ?? 'unknown',
      });
    }
  }

  events.push(...otherEvents);
  events.push(...tokenEvents.values());

  return { events, malformedLines, ignoredLines };
}
