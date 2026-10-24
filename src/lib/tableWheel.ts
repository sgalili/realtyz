type ScrollMetrics = { left: number; top: number; maxX: number; maxY: number; rtl: boolean };

/** Resolve both wheel axes within the table, including RTL and Shift+wheel. */
export function tableWheelPosition(metrics: ScrollMetrics, dx: number, dy: number, shift: boolean) {
  const x = shift && dx === 0 ? dy : dx;
  const y = shift && dx === 0 ? 0 : dy;
  return {
    left: Math.max(metrics.rtl ? -metrics.maxX : 0, Math.min(metrics.rtl ? 0 : metrics.maxX, metrics.left + (shift && dx === 0 && metrics.rtl ? -x : x))),
    top: Math.max(0, Math.min(metrics.maxY, metrics.top + y)),
  };
}