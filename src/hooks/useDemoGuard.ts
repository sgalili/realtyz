/**
 * Demo Mode has been removed. The guard is now a permanent no-op so every
 * action proceeds against real production data.
 */
export function useDemoGuard() {
  return (_reason?: string) => false;
}
