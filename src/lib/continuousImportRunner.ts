export type ImportStepResult = { done?: boolean; retry_in_ms?: number };

/** One request at a time; durable server leases remain authoritative across tabs. */
export function startContinuousImportRunner(options: {
  step: () => Promise<ImportStepResult>;
  refresh: () => Promise<unknown>;
  onError?: (error: unknown) => void;
  initialDelay?: number;
}) {
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = async () => {
    if (cancelled) return;
    let delay = 1_000;
    let done = false;
    try {
      const result = await options.step();
      done = result.done === true;
      delay = Math.max(0, result.retry_in_ms ?? 1_000);
    } catch (error) {
      delay = 5_000;
      if (!cancelled) options.onError?.(error);
    }
    if (cancelled) return;
    try { await options.refresh(); } catch (error) { options.onError?.(error); }
    if (!cancelled && !done) timer = setTimeout(() => void run(), delay);
  };
  timer = setTimeout(() => void run(), Math.max(0, options.initialDelay ?? 0));
  return () => { cancelled = true; clearTimeout(timer); };
}