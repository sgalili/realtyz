import type { QueryClient } from '@tanstack/react-query';

/** Invalidate saved inventory, not the import checkpoint's cumulative totals. */
export async function refreshImportedInventory(client: Pick<QueryClient, 'invalidateQueries'>) {
  await Promise.all([
    'broker-contact-queue', 'broker-import-history', 'developer-projects',
    'my-developer', 'properties', 'sidebar-counts', 'campaign-inventory',
    'workspace-inventory-counts', 'developers',
  ].map(key => client.invalidateQueries({ queryKey: [key] })));
}