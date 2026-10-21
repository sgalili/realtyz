import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

describe('live group joining card', () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.rows = [{ id: 'group-row', group_id: 'ext:123', group_name: 'קבוצת בדיקה', join_status: 'pending', is_selected: true }];
    mocks.progress = null;
  });

  it('spins only after the extension starts and moves confirmed membership immediately', async () => {
    const view = render(<FacebookTargetsCard />);
    await waitFor(() => expect(mocks.progress).not.toBeNull());
    fireEvent.click(screen.getByRole('tab', { name: 'בהמתנה (1)' }));
    expect(screen.queryByLabelText('הצטרפות בתהליך')).not.toBeInTheDocument();
    act(() => mocks.progress?.('123', 'joining'));
    expect(screen.getByLabelText('הצטרפות בתהליך')).toHaveClass('animate-spin');
    act(() => mocks.progress?.('123', 'joined'));
    expect(screen.queryByLabelText('הצטרפות בתהליך')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'פעילות (1)' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'בהמתנה (0)' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'פעילות (1)' }));
    expect(screen.getByText('קבוצת בדיקה')).toBeInTheDocument();
    // Finish while persistence is unresolved: a stale DB load must not move it back.
    await act(async () => { mocks.finish?.(); });
    expect(screen.getByRole('tab', { name: 'פעילות (1)' })).toBeInTheDocument();
    view.unmount();
  });

  it('stops the animation but retains the Pending tab for approval requests', async () => {
    const view = render(<FacebookTargetsCard />);
    await waitFor(() => expect(mocks.progress).not.toBeNull());
    fireEvent.click(screen.getByRole('tab', { name: 'בהמתנה (1)' }));
    act(() => mocks.progress?.('123', 'joining'));
    act(() => mocks.progress?.('123', 'requested'));
    expect(screen.queryByLabelText('הצטרפות בתהליך')).not.toBeInTheDocument();
    expect(screen.getByLabelText('בקשה ממתינה')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'פעילות (0)' })).toBeInTheDocument();
    view.unmount();
  });
});