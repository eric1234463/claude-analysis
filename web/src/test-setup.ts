/**
 * Recharts' ResponsiveContainer measures its own element and renders nothing until
 * that box is non-zero. jsdom has no layout, so every element measures 0 and the
 * charts would come out empty.
 *
 * The stubs below are scoped to the container element itself. Reporting a size for
 * *every* element instead would break the chart a second way: Recharts measures the
 * legend the same way, so a legend claiming the full chart height leaves the plot
 * area with nothing left and no bars are drawn.
 */
const CHART_BOX = { width: 800, height: 320 };
const CONTAINER_CLASS = 'recharts-responsive-container';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

const isChartContainer = (el: Element) => el.classList?.contains(CONTAINER_CLASS);

for (const [prop, value] of [
  ['offsetWidth', CHART_BOX.width],
  ['offsetHeight', CHART_BOX.height],
  ['clientWidth', CHART_BOX.width],
  ['clientHeight', CHART_BOX.height],
] as const) {
  const inherited = Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop);
  Object.defineProperty(HTMLElement.prototype, prop, {
    configurable: true,
    get(this: HTMLElement) {
      if (isChartContainer(this)) return value;
      return inherited?.get?.call(this) ?? 0;
    },
  });
}

const originalRect = Element.prototype.getBoundingClientRect;
Object.defineProperty(Element.prototype, 'getBoundingClientRect', {
  configurable: true,
  value(this: Element) {
    if (!isChartContainer(this)) return originalRect.call(this);
    return {
      width: CHART_BOX.width,
      height: CHART_BOX.height,
      top: 0,
      left: 0,
      right: CHART_BOX.width,
      bottom: CHART_BOX.height,
      x: 0,
      y: 0,
      toJSON: () => {},
    } as DOMRect;
  },
});
