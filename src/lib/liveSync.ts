// Cross-module live sync. Any write made from a quick action (note, reminder,
// call summary) must be visible immediately everywhere: Today's Tasks, the CRM,
// timelines, automations, messages, properties and the AI brain context.
import type { QueryClient } from '@tanstack/react-query';

/** Query-key prefixes that read data a quick action can change. */
export const LIVE_SYNC_KEYS = [
  'command-center-tasks',
  'command-center-metrics',
  'smart-timeline',
  'interaction-activity',
  'scheduled-items',
  'leads',
  'lead',
  'lead-crm',
  'messages',
  'inbox',
  'notifications',
  'automations',
  'automation-runs',
  'listings',
  'properties',
  'property',
  'ai-drawer-history',
  'kb',
  'sidebar-counts',
  'approval-queue',
  'activity-log',
  'deal-room',
] as const;

/**
 * Invalidate every live surface. `refetchType: 'active'` makes mounted screens
 * (Today's Tasks, CRM, timelines) update without a manual refresh.
 */
export function invalidateLiveData(qc: QueryClient) {
  for (const key of LIVE_SYNC_KEYS) {
    qc.invalidateQueries({ queryKey: [key], refetchType: 'active' });
  }
}
