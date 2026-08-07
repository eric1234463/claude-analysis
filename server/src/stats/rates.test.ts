import { describe, it, expect } from 'vitest';
import { RATE_TABLE, rateFor } from './rates';

describe('rateFor', () => {
  it('resolves Fable 5 at standard speed', () => {
    expect(rateFor('claude-fable-5', '2026-08-07', 'standard')).toStrictEqual({
      input: 10000,
      output: 50000,
      cacheRead: 1000,
      cacheWrite5m: 12500,
      cacheWrite1h: 20000,
    });
  });

  it('resolves Opus 5 at standard speed', () => {
    expect(rateFor('claude-opus-5', '2026-08-07', 'standard')).toStrictEqual({
      input: 5000,
      output: 25000,
      cacheRead: 500,
      cacheWrite5m: 6250,
      cacheWrite1h: 10000,
    });
  });

  it('resolves Opus 5 at fast speed to the pricier row', () => {
    expect(rateFor('claude-opus-5', '2026-08-07', 'fast')).toStrictEqual({
      input: 10000,
      output: 50000,
      cacheRead: 1000,
      cacheWrite5m: 12500,
      cacheWrite1h: 20000,
    });
  });

  it('resolves Sonnet 5 to the introductory row before the boundary', () => {
    expect(rateFor('claude-sonnet-5', '2026-08-31', 'standard')).toStrictEqual({
      input: 2000,
      output: 10000,
      cacheRead: 200,
      cacheWrite5m: 2500,
      cacheWrite1h: 4000,
    });
  });

  it('resolves Sonnet 5 to the standard row on the boundary day itself', () => {
    expect(rateFor('claude-sonnet-5', '2026-09-01', 'standard')).toStrictEqual({
      input: 3000,
      output: 15000,
      cacheRead: 300,
      cacheWrite5m: 3750,
      cacheWrite1h: 6000,
    });
  });

  it('keeps Sonnet 5 on the standard row after the boundary', () => {
    expect(rateFor('claude-sonnet-5', '2026-12-25', 'standard')?.input).toBe(3000);
  });

  it('returns undefined for Sonnet 5 at fast speed rather than falling back', () => {
    expect(rateFor('claude-sonnet-5', '2026-08-07', 'fast')).toBeUndefined();
  });

  it('resolves Haiku 4.5 at standard speed', () => {
    expect(rateFor('claude-haiku-4-5', '2026-08-07', 'standard')).toStrictEqual({
      input: 1000,
      output: 5000,
      cacheRead: 100,
      cacheWrite5m: 1250,
      cacheWrite1h: 2000,
    });
  });

  it('returns undefined for an unknown model', () => {
    expect(rateFor('claude-opus-9', '2026-08-07', 'standard')).toBeUndefined();
  });

  it('returns undefined for an empty model string without throwing', () => {
    expect(() => rateFor('', '2026-08-07', 'standard')).not.toThrow();
    expect(rateFor('', '2026-08-07', 'standard')).toBeUndefined();
  });

  it('does not throw on a malformed dayKey', () => {
    expect(() => rateFor('claude-opus-5', 'not-a-date', 'standard')).not.toThrow();
  });
});

describe('RATE_TABLE', () => {
  it('derives every cache rate from that row own input rate', () => {
    for (const row of RATE_TABLE) {
      const { input, cacheRead, cacheWrite5m, cacheWrite1h } = row.rates;
      expect(cacheRead * 10).toBe(input);
      expect(cacheWrite5m * 4).toBe(input * 5);
      expect(cacheWrite1h).toBe(input * 2);
    }
  });

  // The derived-rates and integrality cases both survive an input/output transposition, so
  // every row also has to clear this: no published model prices output at or below input.
  it('prices output above input on every row', () => {
    for (const row of RATE_TABLE) {
      expect(row.rates.output, `${row.model}/${row.speed}`).toBeGreaterThan(row.rates.input);
    }
  });

  it('holds only integer nano-USD values', () => {
    for (const row of RATE_TABLE) {
      for (const [field, value] of Object.entries(row.rates)) {
        expect(Number.isInteger(value), `${row.model}/${row.speed} ${field} = ${value}`).toBe(true);
      }
    }
  });
});
