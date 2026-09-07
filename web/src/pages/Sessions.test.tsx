import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import fixture from '../api/__fixtures__/aggregate-stats.json';
import type { AggregateStats, SessionRecord, UsageCounts } from '../api/types';
import { Sessions, formatDuration } from './Sessions';

const stats = fixture as AggregateStats;
const series: Array<{ bucket: string; counts: UsageCounts }> = [
  { bucket: '2026-07-09', counts: stats.days['2026-07-09']['-fixture-project'] },
  { bucket: '2026-07-10', counts: stats.days['2026-07-10']['-fixture-project-two'] },
];

const renderPage = (over: Partial<AggregateStats> = {}) =>
  render(<Sessions stats={{ ...stats, ...over }} series={series} granularity="day" />);

const rowsOf = (container: HTMLElement) =>
  [...container.querySelectorAll('[data-testid="table-sessions"] tbody tr')] as HTMLElement[];

const withLabel = (over: Partial<SessionRecord> = {}): SessionRecord => ({
  ...stats.sessions[0],
  ...over,
});

describe('Sessions page', () => {
  it('renders one row per session, named by its UUID head when it has no ai-title', () => {
    const { container } = renderPage();
    const rows = rowsOf(container);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('11111111')).toBeTruthy();
  });

  it('prefers the ai-title label over the UUID', () => {
    const { container } = renderPage({
      sessions: [withLabel({ label: 'Session analysis tab' })],
    });
    expect(within(rowsOf(container)[0]).getByText('Session analysis tab')).toBeTruthy();
    expect(within(rowsOf(container)[0]).queryByText('11111111')).toBeNull();
  });

  it('splits main from subagent tokens per session and totals the two lanes', () => {
    renderPage();
    // 27275 of 27438 tokens are subagent work in the fixture.
    expect(screen.getByText('99%')).toBeTruthy();
    const { container } = renderPage();
    const first = rowsOf(container)[0];
    // Main 145, subagent 27,275, total 27,420 — compact-formatted.
    expect(within(first).getByText('145')).toBeTruthy();
    expect(within(first).getByText('27.3K')).toBeTruthy();
    expect(within(first).getByText('27.4K')).toBeTruthy();
  });

  it('names each session’s most-used tools with their call counts', () => {
    const { container } = renderPage({
      sessions: [withLabel({
        toolCalls: 14,
        tools: {
          Bash: { calls: 8, errors: 1 },
          Read: { calls: 4, errors: 0 },
          Edit: { calls: 1, errors: 0 },
          Write: { calls: 1, errors: 0 },
        },
      })],
    });
    const row = rowsOf(container)[0];
    // Ranked by calls, capped at three, with the remainder collapsed.
    expect(within(row).getByText('Bash ×8')).toBeTruthy();
    expect(within(row).getByText('Read ×4')).toBeTruthy();
    expect(within(row).getByText('Edit ×1')).toBeTruthy();
    expect(within(row).queryByText('Write ×1')).toBeNull();
    expect(within(row).getByText('+1')).toBeTruthy();
    expect(within(row).getByText('14')).toBeTruthy();
  });

  it('shows the failed calls of a session alongside its total', () => {
    const { container } = renderPage();
    expect(within(rowsOf(container)[0]).getByText('1 failed')).toBeTruthy();
  });

  it('ranks by tokens by default and re-sorts on a header press', () => {
    const busy = withLabel({ sessionId: 'busy', label: 'Busy', tokens: { ...stats.sessions[0].tokens, total: 10 }, toolCalls: 99 });
    const heavy = withLabel({ sessionId: 'heavy', label: 'Heavy', toolCalls: 1 });
    const { container } = renderPage({ sessions: [busy, heavy] });

    expect(within(rowsOf(container)[0]).getByText('Heavy')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Tools/ }));
    expect(within(rowsOf(container)[0]).getByText('Busy')).toBeTruthy();
  });

  it('plots one stacked pair per charted session, capped at twelve', () => {
    const many = Array.from({ length: 15 }, (_, i) =>
      withLabel({ sessionId: `s${i}`, label: `S${i}` }));
    const { container } = renderPage({ sessions: many });
    const chart = container.querySelector('[data-testid="chart-session-tokens"]')!;
    // Two stacked series over twelve rows.
    expect(chart.querySelectorAll('.recharts-bar-rectangle').length).toBe(24);
  });

  it('renders an empty selection without throwing and without NaN', () => {
    const { container } = renderPage({ sessions: [], days: {} });
    expect(screen.getByTestId('page-sessions')).toBeTruthy();
    expect(container.textContent ?? '').not.toContain('NaN');
  });

  it('files a row under the day the session started, not the day it ended', () => {
    const { container } = renderPage({
      sessions: [withLabel({ day: '2026-07-09', endedAt: '2026-07-10T05:00:00Z' })],
    });
    expect(within(rowsOf(container)[0]).getByText('2026-07-09')).toBeTruthy();
  });
});

describe('formatDuration', () => {
  it('picks the coarsest unit that still says something', () => {
    expect(formatDuration(42_000)).toBe('42s');
    expect(formatDuration(18 * 60_000)).toBe('18m');
    expect(formatDuration(37_860_000)).toBe('10h 31m');
  });

  it('renders a zero-length session as a dash, never 0s', () => {
    expect(formatDuration(0)).toBe('—');
  });
});
