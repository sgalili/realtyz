/** Stale-while-revalidate cache for the public-safe home feed (memory + session storage). */
const KEY = 'toraff-board-cache-v2';
let memory: unknown[] | null = null;
export const boardCache = {
  get<T = any>(): T[] | null {
    if (memory) return memory as T[];
    try { const raw = sessionStorage.getItem(KEY); if (raw) memory = JSON.parse(raw); } catch { /* storage unavailable */ }
    return memory as T[] | null;
  },
  set(rows: unknown[]) {
    memory = rows.map(row => {
      const { affiliate_tier1_amount: _form, affiliate_tier2_amount: _wa, affiliate_tier3_amount: _phone, affiliate_tier4_amount: _closing, affiliate_tier4_type: _type, ...safe } = row as Record<string, unknown>;
      return safe;
    });
    try { sessionStorage.setItem(KEY, JSON.stringify(memory)); } catch { /* quota/private mode: memory only */ }
  },
  clear() {
    memory = null;
    try { sessionStorage.removeItem(KEY); sessionStorage.removeItem('toraff-board-cache-v1'); } catch { /* storage unavailable */ }
  },
};
