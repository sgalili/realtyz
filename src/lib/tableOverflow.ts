export type TableOverflowState = { start: boolean; end: boolean; max: number };

/** Logical inline edges, using the same negative-RTL scroll model as table wheel navigation. */
export function tableOverflowState({ scrollLeft, scrollWidth, clientWidth, rtl }: { scrollLeft: number; scrollWidth: number; clientWidth: number; rtl: boolean }): TableOverflowState {
  const max = Math.max(0, scrollWidth - clientWidth);
  const progress = Math.max(0, Math.min(max, rtl ? Math.abs(scrollLeft) : scrollLeft));
  return { max, start: max > 1 && progress > 1, end: max > 1 && progress < max - 1 };
}
