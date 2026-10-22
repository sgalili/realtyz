/** Stale-while-revalidate cache for the public-safe home feed (memory + session storage). */
const KEY = 'toraff-board-cache-v1';
let memory: unknown[] | null = null;
export const boardCache = {
  get<T = any>(): T[] | null {
    if (memory) return memory as T[];
    try { const raw = sessionStorage.getItem(KEY); if (raw) memory = JSON.parse(raw); } catch { /* storage unavailable */ }
    return memory as T[] | null;
  },
  set(rows: unknown[]) {
    memory = rows;
    try { sessionStorage.setItem(KEY, JSON.stringify(rows)); } catch { /* quota/private mode: memory only */ }
  },
};
