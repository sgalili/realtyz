import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ call: vi.fn(), navigate: vi.fn(), open: vi.fn(), connected: true, invoke: vi.fn(), purge: vi.fn() }));
vi.mock('@/hooks/useCloudSession', () => ({ useCloudSessionConnected: () => mocks.connected, CLOUD_SESSION_KEY: 'cloud-session-state' }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));
vi.mock('@/hooks/useWorkspace', () => ({ useActiveWorkspaceOwnerId: () => 'workspace-a' }));
vi.mock('@/hooks/useMetaPageBinding', () => ({ useMetaPageBinding: () => ({ data: { pageId: 'one', pageName: 'One' } }), useRefreshMetaPageBinding: () => () => {} }));
vi.mock('@/hooks/useFacebookHealth', () => ({ useRefreshFacebookHealth: () => () => {} }));
vi.mock('@/lib/facebookPageConnect', () => ({ callMetaPageConnect: mocks.call }));
vi.mock('@/lib/facebookConnectionFlow', () => ({ openFacebookConnection: mocks.open }));
vi.mock('@/lib/campaignFeedCache', () => ({ purgeCachedPostsForPage: mocks.purge }));
import { FacebookPageSelector } from './FacebookPageSelector';
beforeEach(() => { vi.clearAllMocks(); mocks.connected = true; mocks.invoke.mockResolvedValue({ data: { success: true }, error: null }); mocks.call.mockImplementation((input) => input?.action === 'bindings' ? Promise.resolve({ bindings: [{ id: 'one', name: 'One', picture: null }, { id: 'two', name: 'Two', picture: null }] }) : new Promise(() => {})); });
afterEach(cleanup);
function mount() { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><FacebookPageSelector /></QueryClientProvider>); }
it('closes selection immediately even while saving stalls', async () => {
  mount(); fireEvent.click(screen.getByRole('button', { name: 'בחירת עמוד פייסבוק' }));
  await waitFor(() => expect(screen.getByRole('button', { name: /^Two$/ })).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: /^Two$/ }));
  expect(screen.queryByRole('button', { name: /^Two$/ })).not.toBeInTheDocument();
  expect(mocks.call).toHaveBeenCalledWith({ action: 'set_default', page_id: 'two', owner_id: 'workspace-a' });
});
it('disconnects only the chosen workspace Page even without a cloud profile', async () => {
  mocks.connected = false;
  mocks.call.mockImplementation(async input => input.action === 'bindings' ? { bindings: [{ id: 'two', name: 'Two', picture: null }] } : { ok: true });
  mount(); fireEvent.click(await screen.findByRole('button', { name: 'בחירת עמוד פייסבוק' }));
  fireEvent.click(await screen.findByRole('button', { name: 'נתק את העמוד Two' }));
  fireEvent.click(screen.getByRole('button', { name: /^נתק$/ }));
  await waitFor(() => expect(mocks.purge).toHaveBeenCalledWith('two'));
  expect(mocks.call).toHaveBeenCalledWith({ action: 'disconnect_page', page_id: 'two', owner_id: 'workspace-a' });
  expect(mocks.call.mock.calls.some(([input]) => input.action === 'disconnect')).toBe(false);
});
it('offers profile connection and never discovery without an active profile', async () => {
  mocks.connected = false;
  mocks.call.mockResolvedValue({ bindings: [] });
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'חיבור לפרופיל פייסבוק' }));
  expect(mocks.open).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(mocks.call).toHaveBeenCalled());
  expect(mocks.call.mock.calls.every(([input]) => input.action === 'bindings')).toBe(true);
});
it('clears cloud identity and old workspace grants only after profile confirmation', async () => {
  mocks.call.mockImplementation(async input => input.action === 'bindings' ? { bindings: [] } : { ok: true });
  mount(); fireEvent.click(screen.getByRole('button', { name: 'בחירת עמוד פייסבוק' }));
  fireEvent.click(await screen.findByRole('button', { name: 'ניתוק פרופיל פייסבוק' }));
  expect(mocks.invoke).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'נתק פרופיל' }));
  await waitFor(() => expect(mocks.call).toHaveBeenCalledWith({ action: 'disconnect', owner_id: 'workspace-a' }));
  expect(mocks.invoke).toHaveBeenCalledWith('fb-session-vault', { body: { action: 'clear' } });
});