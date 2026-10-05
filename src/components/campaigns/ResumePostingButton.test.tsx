import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), poke: vi.fn(), live: { notify: () => {} }, owner: 'workspace-a' }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('@/hooks/useWorkspace', () => ({ useActiveWorkspaceOwnerId: () => mocks.owner }));
vi.mock('@/hooks/useGroupQueueLive', () => ({ useGroupQueueLive: (_owner: string, notify: () => void) => { mocks.live.notify = notify; } }));
vi.mock('@/lib/extensionPairing', () => ({ pokeExtension: mocks.poke }));
vi.mock('sonner', () => ({ toast: { loading: vi.fn(), success: vi.fn(), error: vi.fn() } }));
import { ResumePostingButton } from './ResumePostingButton';
const id = '12345678-1234-1234-1234-123456789012';
const progress = { total: 10, completed: 0, pending: 10, processing: 0, failed: 0, stalled: 0 };
function setup(fallbackProgress = progress) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><ResumePostingButton campaignLogId={id} fallbackProgress={fallbackProgress} /></QueryClientProvider>);
  return { ...view, client };
}
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('shows live progress immediately, updates after a queue notification and hides at completion', async () => {
  mocks.rpc.mockResolvedValue({ data: [progress], error: null });
  const { container, client } = setup();
  expect(screen.getByText('0/10')).toBeVisible();
  expect(container.querySelector('.animate-ping')).not.toBeNull();
  await waitFor(() => expect(mocks.rpc).toHaveBeenCalled());
  mocks.rpc.mockResolvedValue({ data: [{ ...progress, completed: 1, pending: 9 }], error: null });
  mocks.live.notify();
  await waitFor(() => expect(screen.getByText('1/10')).toBeVisible());
  mocks.rpc.mockResolvedValue({ data: [{ ...progress, completed: 10, pending: 0 }], error: null });
  mocks.live.notify();
  await waitFor(() => expect(screen.queryByRole('button')).toBeNull());
  client.clear();
});
it('clicks the progress pill to resume through the existing RPC and extension bridge', async () => {
  mocks.rpc.mockImplementation((name) => Promise.resolve(name === 'resume_group_posting' ? { data: 9, error: null } : { data: [{ ...progress, completed: 1, pending: 9 }], error: null }));
  const { client } = setup();
  await waitFor(() => expect(screen.getByText('1/10')).toBeVisible());
  fireEvent.click(screen.getByRole('button'));
  await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('resume_group_posting', { _campaign_log_id: id }));
  expect(mocks.poke).toHaveBeenCalledTimes(2);
  client.clear();
});