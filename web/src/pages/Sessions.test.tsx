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
    const { container } = renderPage();
    // 27275 of 27438 tokens are subagent work in the fixture — the tile states the share.
    expect(within(screen.getByText('Subagent share').closest('div')!.parentElement!)
      .getByText('99%')).toBeTruthy();
    const first = rowsOf(container)[0];
    // Main 145, subagent 27,275, total 27,420 — compact-formatted.
    expect(within(first).getByText('145')).toBeTruthy();
    expect(within(first).getByText('27.3K')).toBeTruthy();
    expect(within(first).getByText('27.4K')).toBeTruthy();
  });

  it('names each session’s most-used tools, merging the two lanes for the ranking', () => {
    const { container } = renderPage({
      sessions: [withLabel({
        toolCalls: 14,
        mainTools: {
          Bash: { calls: 5, errors: 1 },
          Edit: { calls: 1, errors: 0 },
          Write: { calls: 1, errors: 0 },
        },
        sidechainTools: {
          Bash: { calls: 3, errors: 0 },
          Read: { calls: 4, errors: 0 },
        },
      })],
    });
    const row = rowsOf(container)[0];
    // Ranked by calls across both lanes (Bash 5 + 3), capped at two, remainder collapsed.
    expect(within(row).getByText('Bash ×8')).toBeTruthy();
    expect(within(row).getByText('Read ×4')).toBeTruthy();
    expect(within(row).queryByText('Edit ×1')).toBeNull();
    expect(within(row).getByText('+2')).toBeTruthy();
    expect(within(row).getByText('14')).toBeTruthy();
  });

  it('gives tool calls and tokens their own main / subagent / all columns', () => {
    const { container } = renderPage({
      sessions: [withLabel({
        toolCalls: 12,
        toolErrors: 0,
        agentRuns: 0,
        mainTools: { Bash: { calls: 9, errors: 0 } },
        sidechainTools: { Read: { calls: 3, errors: 0 } },
      })],
    });
    // Row cells in order: session, started, length, main calls, sub calls, all calls,
    // main tokens, sub tokens, all tokens, most used, cost.
    const cells = [...rowsOf(container)[0].querySelectorAll('td')].map((c) => c.textContent);
    expect(cells[3]).toBe('9');
    expect(cells[4]).toBe('3');
    expect(cells[5]).toBe('12');
    expect(cells[6]).toBe('145');
    expect(cells[7]).toContain('27.3K');
    expect(cells[8]).toBe('27.4K');
  });

  it('shows the subagent run count beside the subagent calls, and the lane share', () => {
    const { container } = renderPage();
    const row = rowsOf(container)[0];
    // One Agent run, and 99% of the fixture session's tokens are its subagent's.
    expect(within(row).getByText('1 runs')).toBeTruthy();
    expect(within(row).getByText('99%')).toBeTruthy();
  });

  it('stacks tool calls by lane across the selection, ranked by total calls', () => {
    const { container } = renderPage({
      sessions: [
        withLabel({ sessionId: 'a', mainTools: { Bash: { calls: 3, errors: 0 } }, sidechainTools: {} }),
        withLabel({ sessionId: 'b', mainTools: {}, sidechainTools: { Bash: { calls: 2, errors: 0 }, Grep: { calls: 9, errors: 0 } } }),
      ],
    });
    const chart = container.querySelector('[data-testid="chart-tool-lanes"]')!;
    // Two tools, two stacked series each; Grep (9) outranks Bash (3 + 2).
    expect(chart.querySelectorAll('.recharts-bar-rectangle').length).toBe(4);
    expect(within(chart as HTMLElement).getByText('Grep')).toBeTruthy();
    expect(within(chart as HTMLElement).getByText('Bash')).toBeTruthy();
  });

  it('totals the lanes in the tool-call tile', () => {
    renderPage({
      sessions: [withLabel({
        toolCalls: 6,
        mainTools: { Bash: { calls: 4, errors: 0 } },
        sidechainTools: { Read: { calls: 2, errors: 0 } },
      })],
    });
    expect(screen.getByText('4 main · 2 subagent')).toBeTruthy();
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
    fireEvent.click(screen.getByRole('button', { name: 'Sort by total tool calls' }));
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

describe('Sessions detail dialog', () => {
  const detailed = withLabel({
    label: 'Task 6',
    toolCalls: 12,
    toolErrors: 2,
    agentRuns: 3,
    mainTools: { Bash: { calls: 7, errors: 2 } },
    sidechainTools: { Read: { calls: 5, errors: 0 } },
  });

  it('stays closed until a row is clicked', () => {
    const { container } = renderPage({ sessions: [detailed] });
    expect(screen.queryByTestId('dialog-session')).toBeNull();
    fireEvent.click(rowsOf(container)[0]);
    expect(screen.getByTestId('dialog-session')).toBeTruthy();
  });

  it('opens from the session name by keyboard too, without double-firing', () => {
    renderPage({ sessions: [detailed] });
    fireEvent.click(screen.getByRole('button', { name: 'Task 6' }));
    const dialog = screen.getByTestId('dialog-session');
    expect(within(dialog).getByText('Task 6')).toBeTruthy();
  });

  it('breaks the session down by lane, tool and cost line', () => {
    const { container } = renderPage({ sessions: [detailed] });
    fireEvent.click(rowsOf(container)[0]);
    const dialog = screen.getByTestId('dialog-session');

    // Full id and project, not the truncated forms the table shows.
    expect(within(dialog).getByText(detailed.sessionId)).toBeTruthy();
    const runs = within(dialog).getByText('Subagent runs').parentElement as HTMLElement;
    expect(within(runs).getByText('3')).toBeTruthy();

    const tokenRows = within(dialog).getByTestId('detail-tokens');
    const totalRow = within(tokenRows).getByText('Total').closest('tr') as HTMLElement;
    // Main 145 / subagent 27,275 / all 27,420 — grouped digits, not compacted.
    expect(within(totalRow).getByText('145')).toBeTruthy();
    expect(within(totalRow).getByText('27,275')).toBeTruthy();
    expect(within(totalRow).getByText('27,420')).toBeTruthy();

    const toolRows = within(dialog).getByTestId('detail-tools');
    const bashRow = within(toolRows).getByText('Bash').closest('tr') as HTMLElement;
    expect([...bashRow.querySelectorAll('td')].map((c) => c.textContent))
      .toStrictEqual(['Bash', '7', '0', '2', '7']);
    const readRow = within(toolRows).getByText('Read').closest('tr') as HTMLElement;
    expect([...readRow.querySelectorAll('td')].map((c) => c.textContent))
      .toStrictEqual(['Read', '0', '5', '—', '5']);

    expect(within(dialog).getByTestId('detail-cost')).toBeTruthy();
  });

  it('says so rather than rendering an empty table for a session with no tool calls', () => {
    const { container } = renderPage({
      sessions: [withLabel({ toolCalls: 0, toolErrors: 0, mainTools: {}, sidechainTools: {} })],
    });
    fireEvent.click(rowsOf(container)[0]);
    const dialog = screen.getByTestId('dialog-session');
    expect(within(dialog).getByText('No tool calls in this session.')).toBeTruthy();
    expect(within(dialog).queryByTestId('detail-tools')).toBeNull();
  });

  it('flags unpriced tokens instead of implying the cost is complete', () => {
    const { container } = renderPage({
      sessions: [withLabel({
        cost: { ...stats.sessions[0].cost, unpricedTokens: 4321 },
      })],
    });
    fireEvent.click(rowsOf(container)[0]);
    expect(within(screen.getByTestId('dialog-session')).getByText(/4,321 tokens ran on a model/))
      .toBeTruthy();
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
