import { discoveryInProgress } from './adminImportPresentation';
export type DiscoveryRowState = { broker_id: string; source_status?: string | null; scanner_status?: string | null; has_whatsapp?: boolean; eta_at?: string | null };
/** 'progress': in-progress first; 'found': rows with WhatsApp first. Pending rows always last. */
export type DiscoverySortMode = 'off' | 'progress' | 'found';
export function discoveryPriority(row: { user_id: string; whatsapp_phone?: string | null }, states: Map<string, DiscoveryRowState>, mode: Exclude<DiscoverySortMode, 'off'> = 'progress') {
  const state = states.get(row.user_id);
  const progress = discoveryInProgress(state?.source_status ?? undefined, state?.scanner_status ?? undefined);
  const found = !!(row.whatsapp_phone || state?.has_whatsapp);
  if (mode === 'found') return found ? 0 : progress ? 1 : 2;
  return progress ? 0 : found ? 1 : 2;
}
const etaOf = (s?: DiscoveryRowState) => { const t = s?.eta_at ? Date.parse(s.eta_at) : NaN; return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER; };
export function sortDiscoveryPriority<T extends { user_id: string; whatsapp_phone?: string | null }>(rows: T[], states: DiscoveryRowState[], mode: Exclude<DiscoverySortMode, 'off'> = 'progress') {
  const byBroker = new Map(states.map(row => [row.broker_id, row]));
  return rows.map((r, i) => ({ r, i })).sort((a, b) => {
    const pa = discoveryPriority(a.r, byBroker, mode), pb = discoveryPriority(b.r, byBroker, mode);
    if (pa !== pb) return pa - pb;
    const inProgress = mode === 'progress' ? 0 : 1;
    if (pa === inProgress) { const d = etaOf(byBroker.get(a.r.user_id)) - etaOf(byBroker.get(b.r.user_id)); if (d) return d; }
    return a.i - b.i;
  }).map(x => x.r);
}
export const nextDiscoverySort = (m: DiscoverySortMode): DiscoverySortMode => (m === 'progress' ? 'found' : 'progress');
