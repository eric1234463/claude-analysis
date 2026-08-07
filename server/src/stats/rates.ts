/**
 * Date-effective model pricing. The only place in the codebase that knows a dollar figure.
 *
 * Source: the `claude-api` skill's model table and shared/prompt-caching.md, verified 2026-08-07.
 */

/** Nano-USD (1e-9 USD) per token. Every value is an exact integer by construction:
 *  a USD-per-million-tokens rate R maps to R * 1000 nano-USD per token. */
export interface ModelRates {
  input: number;
  output: number;
  cacheRead: number; // 0.10 x input
  cacheWrite5m: number; // 1.25 x input
  cacheWrite1h: number; // 2.00 x input
}

export type RequestSpeed = 'standard' | 'fast';

export interface RateRow {
  model: string;
  speed: RequestSpeed;
  /** YYYY-MM-DD, inclusive. Absent means "from the beginning of time". */
  effectiveFrom?: string;
  rates: ModelRates;
}

/** USD per million tokens -> nano-USD per token, with the three cache rates derived from
 *  `input` so a base-rate edit can never leave them stale. */
function rates(inputUsdPerMTok: number, outputUsdPerMTok: number): ModelRates {
  const input = inputUsdPerMTok * 1000;
  return {
    input,
    output: outputUsdPerMTok * 1000,
    cacheRead: input * 0.1,
    cacheWrite5m: input * 1.25,
    cacheWrite1h: input * 2,
  };
}

/** Sorted by `effectiveFrom` ascending, so the last match wins in `rateFor`. */
export const RATE_TABLE: readonly RateRow[] = [
  { model: 'claude-fable-5', speed: 'standard', rates: rates(10, 50) },
  { model: 'claude-opus-5', speed: 'standard', rates: rates(5, 25) },
  { model: 'claude-opus-5', speed: 'fast', rates: rates(10, 50) },
  { model: 'claude-opus-4-8', speed: 'standard', rates: rates(5, 25) },
  { model: 'claude-opus-4-8', speed: 'fast', rates: rates(10, 50) },
  // Sonnet 5's introductory pricing expires 2026-08-31; historical days keep the intro rate.
  { model: 'claude-sonnet-5', speed: 'standard', rates: rates(2, 10) },
  { model: 'claude-sonnet-5', speed: 'standard', effectiveFrom: '2026-09-01', rates: rates(3, 15) },
  { model: 'claude-haiku-4-5', speed: 'standard', rates: rates(1, 5) },
];

/** Resolves the rate in force for `model` on `dayKey` at `speed`.
 *  Returns `undefined` when the model has no row for that day — never a fallback row,
 *  never a nearest-model guess. `dayKey` is a `YYYY-MM-DD` string already bucketed by
 *  the aggregator; comparison is lexicographic, so no Date parsing occurs here. */
export function rateFor(
  model: string,
  dayKey: string,
  speed: RequestSpeed,
): ModelRates | undefined {
  let winner: RateRow | undefined;
  for (const row of RATE_TABLE) {
    if (row.model !== model || row.speed !== speed) continue;
    if (row.effectiveFrom !== undefined && row.effectiveFrom > dayKey) continue;
    if (winner === undefined || (row.effectiveFrom ?? '') >= (winner.effectiveFrom ?? '')) {
      winner = row;
    }
  }
  return winner?.rates;
}
