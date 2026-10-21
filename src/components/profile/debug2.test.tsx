import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
const mocks = vi.hoisted(() => ({ progress: null as null | ((id: string, status: string) => void), finish: null as null | (() => void), rows: [] as unknown[] }));
vi.mock('@/hooks/useWorkspace', () => ({ useActiveWorkspaceOwnerId: () => 'workspace-a' }));
vi.mock('@/hooks/useMetaPageBinding', () => ({ useMetaPageBinding: () => ({ data: null }) }));
vi.mock('@/hooks/useGroupQueueLive', () => ({ useGroupQueueLive: () => {} }));
vi.mock('@/components/social/ExtensionDownloadButton', () => ({ isExtensionInstalled: () => true }));
vi.mock('@/lib/extensionDetect', () => ({ ensureExtensionReady: () => Promise.resolve(true) }));
vi.mock('@/components/social/ExtensionGroupSyncCard', () => ({ ExtensionGroupSyncCard: () => null }));
vi.mock('@/components/social/GroupDiscoveryDialog', () => ({ GroupDiscoveryDialog: () => null }));
vi.mock('@/lib/extensionGroupDiscovery', () => ({
  joinGroupsViaExtension: (_g: unknown, progress: typeof mocks.progress) => {
    mocks.progress = progress;
    return { cancel: vi.fn(), done: new Promise<void>((r) => { mocks.finish = r; }) };
  },
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => {
  const q: Record<string, unknown> = {};
  q.select = () => q; q.eq = () => q;
  q.order = () => Promise.resolve({ data: mocks.rows, error: null });
  q.update = () => ({ eq: () => ({ eq: () => new Promise(() => {}) }) });
  return q;
} } }));
import { FacebookTargetsCard } from './FacebookTargetsCard';
describe('dbg2', () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.rows = [{ id: 'group-row', group_id: 'ext:123', group_name: 'קבוצת בדיקה', join_status: 'pending', pool_status: 'active', is_selected: true }];
    mocks.progress = null;
  });
  it('dumps after requested', async () => {
    render(<FacebookTargetsCard />);
    await waitFor(() => expect(mocks.progress).not.toBeNull());
    fireEvent.click(screen.getByRole('tab', { name: '1 בהמתנה' }));
    act(() => mocks.progress?.('123', 'joining'));
    act(() => mocks.progress?.('123', 'requested'));
    fs.writeFileSync('/tmp/dbg2.html', document.body.innerHTML);
    expect(true).toBe(true);
  });
});
