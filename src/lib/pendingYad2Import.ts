// Remembers a guest's Yad2 import link across sign-in so the import resumes automatically.
export type PendingYad2Import = { kind: 'agency' | 'single'; url: string; publisherType: string };
const KEY = 'toraff-pending-yad2-import';

export function savePendingYad2Import(value: PendingYad2Import) {
  try { sessionStorage.setItem(KEY, JSON.stringify(value)); } catch { /* ignore */ }
}
export function readPendingYad2Import(): PendingYad2Import | null {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    return parsed && (parsed.kind === 'agency' || parsed.kind === 'single') && typeof parsed.url === 'string' ? parsed : null;
  } catch { return null; }
}
export function clearPendingYad2Import() {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}
