import type { ComponentType, ReactElement, ReactNode } from 'react';
import { ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatNumber } from '@/lib/format';

/**
 * Categorical series colours, in assignment order. Series take slot 1, 2, 3… by
 * identity and are never cycled — a chart that needs a 6th series should collapse
 * into "Other" or split into small multiples instead of reusing a hue.
 *
 * The hex values live in index.css and are validated against the dark card surface
 * (lightness band, chroma floor, colourblind separation, contrast). Do not
 * substitute an arbitrary colour here.
 */
export const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
] as const;

/** Recessive axes and grid: the data carries the contrast, the chrome stays quiet. */
export const AXIS_TICK = { fill: 'var(--muted-foreground)', fontSize: 11 } as const;
export const AXIS_LINE = { stroke: 'var(--border)' } as const;
export const GRID_PROPS = {
  stroke: 'var(--border)',
  strokeDasharray: '3 3',
  vertical: false,
} as const;

export const TOOLTIP_PROPS = {
  cursor: { fill: 'var(--accent)', fillOpacity: 0.4 },
  contentStyle: {
    background: 'var(--popover)',
    border: '1px solid var(--border)',
    borderRadius: '0.5rem',
    color: 'var(--popover-foreground)',
    fontSize: '12px',
    boxShadow: '0 8px 24px rgb(0 0 0 / 0.45)',
  },
  labelStyle: { color: 'var(--muted-foreground)', marginBottom: '0.25rem' },
  itemStyle: { color: 'var(--popover-foreground)' },
} as const;

/**
 * Legend labels wear the muted text token rather than the series colour — the swatch
 * beside the label already carries identity, and coloured text reads as decoration.
 */
export const LEGEND_PROPS = {
  iconType: 'circle',
  iconSize: 8,
  wrapperStyle: { fontSize: 12, paddingTop: 4 },
  formatter: (value: string) => (
    <span className="text-muted-foreground">{value}</span>
  ),
} as const;

/**
 * Recharts types the tooltip formatter's argument as a loose `ValueType | undefined`,
 * so coerce at that boundary rather than asserting a number into the prop.
 */
export const formatTooltipNumber = (value: unknown) => formatNumber(Number(value));
export const formatTooltipPercent = (value: unknown) => `${Number(value).toFixed(1)}%`;

/**
 * Category names here are raw project/model keys, which run long. Truncate for the
 * axis but stay above the longest fixture key so tick text remains matchable.
 */
const MAX_TICK_CHARS = 28;

export function truncateTick(value: string): string {
  return value.length > MAX_TICK_CHARS ? `${value.slice(0, MAX_TICK_CHARS - 1)}…` : value;
}

export interface ChartCardProps {
  /** Placed on the plot wrapper so chart assertions can scope to this figure. */
  testId: string;
  title: string;
  description?: string;
  height?: number;
  className?: string;
  children: ReactElement;
}

export function ChartCard({
  testId,
  title,
  description,
  height = 260,
  className,
  children,
}: ChartCardProps) {
  return (
    <Card className={className}>
      <CardHeader className="gap-1">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {description && <CardDescription className="text-xs">{description}</CardDescription>}
      </CardHeader>
      <CardContent data-testid={testId} className="px-2">
        <ResponsiveContainer width="100%" height={height}>
          {children}
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export interface StatCardProps {
  label: string;
  /** Rendered as the sole content of the value node, so a test can assert it exactly. */
  value: string;
  valueTestId?: string;
  hint?: string;
  icon?: ComponentType<{ className?: string }>;
}

export function StatCard({ label, value, valueTestId, hint, icon: Icon }: StatCardProps) {
  return (
    <Card>
      <CardContent className="px-5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {label}
          </span>
          {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" />}
        </div>
        <div
          data-testid={valueTestId}
          className="tabular mt-2 text-2xl leading-none font-semibold"
        >
          {value}
        </div>
        {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-2 px-6 py-14 text-center">
        <p className="text-sm font-medium">{title}</p>
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
        {action && <div className="mt-2">{action}</div>}
      </CardContent>
    </Card>
  );
}
