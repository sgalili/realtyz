type ScrollMetrics = { left: number; top: number; maxX: number; maxY: number; rtl: boolean };

/** Resolve one wheel axis within the table (dominant axis only), including RTL and Shift+wheel. */
export function tableWheelPosition(metrics: ScrollMetrics, dx: number, dy: number, shift: boolean) {
  let x = shift && dx === 0 ? dy : dx;
  let y = shift && dx === 0 ? 0 : dy;
  if (Math.abs(x) >= Math.abs(y)) y = 0; else x = 0;
  return {
    left: Math.max(metrics.rtl ? -metrics.maxX : 0, Math.min(metrics.rtl ? 0 : metrics.maxX, metrics.left + (shift && dx === 0 && metrics.rtl ? -x : x))),
    top: Math.max(0, Math.min(metrics.maxY, metrics.top + y)),
  };
}
