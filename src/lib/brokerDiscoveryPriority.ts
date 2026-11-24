import { discoveryInProgress } from './adminImportPresentation';
export type DiscoveryRowState = { broker_id: string; source_status?: string | null; scanner_status?: string | null; has_whatsapp?: boolean };
export function discoveryPriority(row: { user_id: string; whatsapp_phone?: string | null }, states: Map<string, DiscoveryRowState>) {
  const state = states.get(row.user_id);
  if (discoveryInProgress(state?.source_status ?? undefined, state?.scanner_status ?? undefined)) return 0;
  return row.whatsapp_phone || state?.has_whatsapp ? 1 : 2;
}
export function sortDiscoveryPriority<T extends { user_id: string; whatsapp_phone?: string | null }>(rows: T[], states: DiscoveryRowState[]) {
  const byBroker = new Map(states.map(row => [row.broker_id, row]));
  return [...rows].sort((a, b) => discoveryPriority(a, byBroker) - discoveryPriority(b, byBroker));
}