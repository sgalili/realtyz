import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FacebookConnectionDialog } from './FacebookConnectionDialog';
import { openFacebookConnection } from '@/lib/facebookConnectionFlow';

const mocks = vi.hoisted(() => ({ owner: 'workspace-a', call: vi.fn(), connected: true }));
vi.mock('@/hooks/useCloudSession', () => ({ useCloudSessionConnected: () => mocks.connected }));
vi.mock('@/hooks/useWorkspace', () => ({ useActiveWorkspaceOwnerId: () => mocks.owner }));
vi.mock('@/lib/facebookPageConnect', () => ({ callMetaPageConnect: mocks.call }));
vi.mock('./FacebookCloudConnectGate', () => ({ FacebookCloudConnectGate: () => <div>cloud-connection</div> }));
const mount = () => render(<QueryClientProvider client={new QueryClient()}><FacebookConnectionDialog /></QueryClientProvider>);
beforeEach(() => {
  mocks.owner = 'workspace-a'; mocks.connected = true; mocks.call.mockReset();
  mocks.call.mockImplementation(async body => body.action === 'list_pages' ? { pages: [{ id: 'first', name: 'Existing Page' }, { id: 'second', name: 'Additional Page' }] } : body.action === 'bindings' ? { bindings: [{ id: 'first' }] } : { ok: true });
});
afterEach(cleanup);
it('requires cloud profile connection before any managed Page discovery', async () => {
  mocks.connected = false;
  mount(); act(openFacebookConnection);
  await screen.findByText('cloud-connection');
  expect(mocks.call).not.toHaveBeenCalled();
});
it('links an additional authorized Page without requesting a login or replacing existing bindings', async () => {
  mount(); act(openFacebookConnection);
  const second = await screen.findByRole('button', { name: 'Additional Page' });
  expect(screen.getByRole('button', { name: 'Existing Page מחובר' })).toBeDisabled();
  fireEvent.click(second);
  await waitFor(() => expect(second).toBeDisabled());
  expect(mocks.call).toHaveBeenCalledWith({ action: 'select_page', page_id: 'second', owner_id: 'workspace-a' });
  expect(mocks.call.mock.calls.some(([body]) => ['start', 'disconnect', 'disconnect_page'].includes(body.action))).toBe(false);
});
it('opens cloud connection when saved Page authorization is unavailable, never OAuth', async () => {
  mocks.call.mockRejectedValue(new Error('missing_grant'));
  mount(); act(openFacebookConnection);
  await screen.findByText('cloud-connection');
  expect(mocks.call.mock.calls.some(([body]) => body.action === 'start')).toBe(false);
});
it('discards late discovery results after the workspace changes', async () => {
  let resolve: (value: unknown) => void = () => {};
  mocks.call.mockImplementation(body => body.owner_id === 'workspace-a' && body.action === 'list_pages' ? new Promise(r => { resolve = r; }) : Promise.resolve({ pages: [], bindings: [] }));
  const view = mount(); act(openFacebookConnection);
  mocks.owner = 'workspace-b'; view.rerender(<QueryClientProvider client={new QueryClient()}><FacebookConnectionDialog /></QueryClientProvider>);
  await act(async () => resolve({ pages: [{ id: 'foreign', name: 'Foreign Page' }] }));
  expect(screen.queryByText('Foreign Page')).toBeNull();
});