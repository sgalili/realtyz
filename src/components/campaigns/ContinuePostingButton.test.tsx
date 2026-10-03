import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rows: [] as any[] }));
vi.mock('@/hooks/useWorkspace', () => ({ useActiveWorkspaceOwnerId: () => 'workspace-a' }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: () => { const q: any = { select: () => q, eq: () => q, order: () => q, range: async () => ({ data: mocks.rows, error: null }) }; return q; },
} }));
import { ContinuePostingButton } from './ContinuePostingButton';
import { REPOST_EDITOR_EVENT } from '@/lib/repostEditor';
afterEach(() => { cleanup(); vi.clearAllMocks(); mocks.rows = []; });
const post = { id: 'post-a', message_body: 'original body', group_ids: ['123'] };
describe('repost editor handoff', () => {
  it('dispatches the editor event with jobs matching the post only', async () => {
    mocks.rows = [
      { id: 'job-a', status: 'failed', payload: { campaign_log_id: 'post-a' } },
      { id: 'job-b', status: 'completed', payload: { campaign_log_id: 'post-b' } },
    ];
    const seen: any[] = [];
    window.addEventListener(REPOST_EDITOR_EVENT, (e) => seen.push((e as CustomEvent).detail));
    render(<ContinuePostingButton post={post} />);
    fireEvent.click(screen.getByRole('button', { name: 'המשך / פרסום מחדש' }));
    await waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0].owner).toBe('workspace-a');
    expect(seen[0].post.id).toBe('post-a');
    expect(seen[0].jobs.map((j: any) => j.id)).toEqual(['job-a']);
  });
  it('includes series slot jobs when the post has series slots', async () => {
    const seriesPost = { ...post, _seriesSlots: [{ id: 'post-c', message_body: 'x', group_ids: ['9'] }] };
    mocks.rows = [
      { id: 'job-a', status: 'failed', payload: { campaign_log_id: 'post-a' } },
      { id: 'job-c', status: 'failed', payload: { campaign_log_id: 'post-c' } },
    ];
    const seen: any[] = [];
    window.addEventListener(REPOST_EDITOR_EVENT, (e) => seen.push((e as CustomEvent).detail));
    render(<ContinuePostingButton post={seriesPost} />);
    fireEvent.click(screen.getByRole('button', { name: 'המשך / פרסום מחדש' }));
    await waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0].jobs.map((j: any) => j.id).sort()).toEqual(['job-a', 'job-c']);
  });
});
