/**
 * Runs a pricing edit so a committed save always finishes the editor.
 *
 * The write and the cache refresh are separate concerns: once the row is saved, the caller's
 * success handling (toast + closing the dialog) must run, and a failing background refresh of
 * related caches must never leave an already-saved editor open or report a failed save.
 */
export type PricingEditOutcome<T> = { committed: true; saved: T } | { committed: false; error: unknown };

export async function commitPricingEdit<T>(steps: {
  /** Performs the database write. Resolves with the saved row, or throws/ rejects when it failed. */
  commit: () => Promise<T>;
  /** Called once, immediately after a successful write: shows confirmation and closes the editor. */
  onCommitted: (saved: T) => void;
  /** Optional best-effort cache refresh; its failure cannot undo the save or keep the editor open. */
  refresh?: () => Promise<unknown>;
}): Promise<PricingEditOutcome<T>> {
  let saved: T;
  try {
    saved = await steps.commit();
  } catch (error) {
    return { committed: false, error };
  }
  steps.onCommitted(saved);
  try {
    await steps.refresh?.();
  } catch {
    // Stale caches are refreshed again on the next query; the saved values stay as they are.
  }
  return { committed: true, saved };
}
