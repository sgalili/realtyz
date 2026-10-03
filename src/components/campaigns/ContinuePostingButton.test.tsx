import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rows: [] as any[], rpc: vi.fn(), apply: vi.fn() }));
vi.mock('@/hooks/useWorkspace', () => ({ useActiveWorkspaceOwnerId: () => 'workspace-a' }));
vi.mock('@/lib/extensionGroupBridge', () => ({ applyContinuedQueueJobs: mocks.apply }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: () => { const q: any = { select: () => q, eq: () => q, order: () => q, range: async () => ({ data: mocks.rows, error: null }) }; return q; },
  rpc: mocks.rpc,
} }));
import { ContinuePostingButton } from './ContinuePostingButton';
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const post = { id: 'post-a', message_body: 'original body', group_ids: ['123'] };
describe('confirmed continuation', () => {
  it('resumes failed jobs only and applies returned original jobs', async () => {
    mocks.rows = [{ id: 'failed-job', status: 'failed', payload: { campaign_log_id: 'post-a' } }, { id: 'done-job', status: 'completed', payload: { campaign_log_id: 'post-a' } }, { id: 'active-job', status: 'processing', payload: { campaign_log_id: 'post-a' } }];
    mocks.rpc.mockResolvedValue({ data: [{ id: 'failed-job' }], error: null });
    render(<ContinuePostingButton post={post} />);
    fireEvent.click(screen.getByRole('button', { name: 'המשך / פרסום מחדש' }));
    await screen.findByRole('dialog');
    expect(mocks.rpc).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'אישור המשך פרסום' }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('continue_group_post_jobs', { _workspace_owner_id: 'workspace-a', _job_ids: ['failed-job'], _resubmit: false }));
    await waitFor(() => expect(mocks.apply).toHaveBeenCalledWith('workspace-a', [{ id: 'failed-job' }]));
  });
  it('requires explicit resubmission of completed jobs', async () => {
    mocks.rows = [{ id: 'done-job', status: 'completed', payload: { campaign_log_id: 'post-a' } }];
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    render(<ContinuePostingButton post={post} />);
    fireEvent.click(screen.getByRole('button', { name: 'המשך / פרסום מחדש' }));
    await screen.findByRole('dialog');
    expect(mocks.rpc).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'אישור פרסום מחדש' }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('continue_group_post_jobs', { _workspace_owner_id: 'workspace-a', _job_ids: ['done-job'], _resubmit: true }));
  });
});