export const liveScannerStates = ['pending_source', 'reading_source', 'ready', 'sending', 'awaiting_reply'];

export function discoveryInProgress(sourceStatus?: string, scannerStatus?: string) {
  return ['pending', 'running', 'retry'].includes(sourceStatus ?? '') || liveScannerStates.includes(scannerStatus ?? '');
}

export function importRunTime(value: string, now = new Date()) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const day = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const yesterday = new Date(now.getTime() - 86400000);
  const label = day(date) === day(now) ? 'היום' : day(date) === day(yesterday) ? 'אתמול' : date.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' });
  return `${label} ${date.toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false })}`;
}

export function newestImportsFirst<T extends { created_at?: string; imported_at?: string }>(rows: T[]) {
  return [...rows].sort((a, b) => (Date.parse(b.created_at ?? b.imported_at ?? '') || 0) - (Date.parse(a.created_at ?? a.imported_at ?? '') || 0));
}

export type ImportSearch = { text: string; kind: string; channel: string; whatsapp: string };
export const emptyImportSearch: ImportSearch = { text: '', kind: 'all', channel: 'all', whatsapp: 'all' };
export function matchesImportSearch(row: { kind?: string; channel?: string; whatsapp_phone?: string | null; [key: string]: unknown }, search: ImportSearch) {
  const haystack = ['full_name', 'name', 'office_name', 'agency_name', 'city', 'phone', 'whatsapp_phone', 'email', 'license_number'].map(k => row[k] ?? '').join(' ').toLocaleLowerCase();
  return (!search.text.trim() || haystack.includes(search.text.trim().toLocaleLowerCase()))
    && (search.kind === 'all' || row.kind === search.kind)
    && (search.channel === 'all' || row.channel === search.channel)
    && (search.whatsapp === 'all' || (search.whatsapp === 'saved' ? !!row.whatsapp_phone : !row.whatsapp_phone));
}