import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ progress: null as null | ((id: string, status: string) => void), finish: null as null | (() => void), rows: [] as unknown[] }));
vi.mock('@/hooks/useWorkspace', () => ({ useActiveWorkspaceOwnerId: () => 'workspace-a' }));
vi.mock('@/hooks/useMetaPageBinding', () => ({ useMetaPageBinding: () => ({ data: null }) }));
vi.mock('@/hooks/useGroupQueueLive', () => ({ useGroupQueueLive: () => {} }));
vi.mock('@/components/social/ExtensionDownloadButton', () => ({ isExtensionInstalled: () => true }));
vi.mock('@/lib/extensionDetect', () => ({ ensureExtensionReady: () => Promise.resolve(true) }));
vi.mock('@/components/social/ExtensionGroupSyncCard', () => ({ ExtensionGroupSyncCard: () => null }));
vi.mock('@/components/social/GroupDiscoveryDialog', () => ({ GroupDiscoveryDialog: () => null }));
vi.mock('@/lib/extensionGroupDiscovery', () => ({
  joinGroupsViaExtension: (_groups: unknown, progress: typeof mocks.progress) => {
    mocks.progress = progress;
    return { cancel: vi.fn(), done: new Promise<void>((resolve) => { mocks.finish = resolve; }) };
  },
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => {
  const query: Record<string, unknown> = {};
  query.select = () => query;
  query.eq = () => query;
  query.order = () => Promise.resolve({ data: mocks.rows, error: null });
  query.update = () => ({ eq: () => ({ eq: () => new Promise(() => {}) }) });
  return query;
} } }));
import { FacebookTargetsCard } from './FacebookTargetsCard';

describe('debug', () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.rows = [{ id: 'group-row', group_id: 'ext:123', group_name: 'קבוצת בדיקה', join_status: 'pending', is_selected: true }];
    mocks.progress = null;
  });
  it('shows what renders', async () => {
    render(<FacebookTargetsCard />);
    await waitFor(() => expect(mocks.progress).not.toBeNull());
    await new Promise((r) => setTimeout(r, 100));
    // eslint-disable-next-line no-console
    console.log('BODY:', document.body.innerHTML.slice(0, 3000));
    expect(true).toBe(true);
  });
});
