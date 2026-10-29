import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ call: vi.fn(), navigate: vi.fn(), open: vi.fn() }));
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));
vi.mock('@/hooks/useWorkspace', () => ({ useActiveWorkspaceOwnerId: () => 'workspace-a' }));
vi.mock('@/hooks/useMetaPageBinding', () => ({ useMetaPageBinding: () => ({ data: { pageId: 'one', pageName: 'One' } }), useRefreshMetaPageBinding: () => () => {} }));
vi.mock('@/hooks/useFacebookHealth', () => ({ useRefreshFacebookHealth: () => () => {} }));
vi.mock('@/lib/facebookPageConnect', () => ({ callMetaPageConnect: mocks.call }));
vi.mock('@/lib/facebookConnectionFlow', () => ({ openFacebookConnection: mocks.open }));
vi.mock('@/lib/campaignFeedCache', () => ({ purgeCachedPostsForPage: vi.fn() }));
import { FacebookPageSelector } from './FacebookPageSelector';
beforeEach(() => { mocks.call.mockImplementation((input) => input?.action === 'list_pages' ? Promise.resolve({ pages: [{ id: 'one', name: 'One', picture: null }, { id: 'two', name: 'Two', picture: null }] }) : new Promise(() => {})); });
function mount() { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><FacebookPageSelector /></QueryClientProvider>); }
it('closes selection immediately even while saving stalls', async () => {
  mount(); fireEvent.click(screen.getByRole('button', { name: 'בחירת עמוד פייסבוק' }));
  await waitFor(() => expect(screen.getByRole('button', { name: /^Two$/ })).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: /^Two$/ }));
  expect(screen.queryByRole('button', { name: /^Two$/ })).not.toBeInTheDocument();
  expect(mocks.call).toHaveBeenCalledWith({ action: 'select_page', page_id: 'two', owner_id: 'workspace-a' });
});
it('closes before navigating to groups', async () => {
  mount(); fireEvent.click(screen.getByRole('button', { name: 'בחירת עמוד פייסבוק' }));
  const groups = await screen.findByRole('button', { name: 'ניהול קבוצות עבור Two' }); fireEvent.click(groups);
  expect(screen.queryByRole('button', { name: 'ניהול קבוצות עבור Two' })).not.toBeInTheDocument();
  expect(mocks.navigate).toHaveBeenCalledWith('/profile?tab=connections&connect=facebook-groups');
});