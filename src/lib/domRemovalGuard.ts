/**
 * Guards against `NotFoundError: Failed to execute 'removeChild'` crashes.
 *
 * Browser extensions, translation tools and third-party scripts sometimes move
 * or wrap DOM nodes that React owns. When React later tries to delete one of
 * those nodes it calls removeChild/insertBefore on a parent that no longer owns
 * it, the exception escapes the commit phase and the whole app unmounts (blank
 * screen). Swallowing the mismatch keeps the UI alive; React re-renders the
 * affected subtree on the next update.
 */
export function installDomRemovalGuard() {
  if (typeof window === 'undefined') return;
  const w = window as unknown as { __rzDomGuard?: boolean };
  if (w.__rzDomGuard) return;
  w.__rzDomGuard = true;

  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) {
      // Node already detached or re-parented by an external script.
      return child;
    }
    return originalRemoveChild.call(this, child) as T;
  } as typeof Node.prototype.removeChild;

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(this: Node, node: T, ref: Node | null): T {
    if (ref && ref.parentNode !== this) {
      return this.appendChild(node) as T;
    }
    return originalInsertBefore.call(this, node, ref) as T;
  } as typeof Node.prototype.insertBefore;
}
