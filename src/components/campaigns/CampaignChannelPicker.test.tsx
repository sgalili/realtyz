import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { CampaignChannelPicker, DISTRIBUTION_CHANNELS } from './CampaignChannelPicker';

const mocks = vi.hoisted(() => ({ state: vi.fn() }));

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/hooks/useCampaignPricing', () => ({ useCampaignPricing: () => ({ data: [], isLoading: false, isError: false }) }));
vi.mock('./CampaignServiceIcon', () => ({ CampaignServiceIcon: () => null }));
vi.mock('@/hooks/useMetaPageBinding', () => ({ useMetaPageBinding: () => ({ data: null }), useRefreshMetaPageBinding: () => () => {} }));
vi.mock('@/hooks/useFacebookHealth', () => ({ useRefreshFacebookHealth: () => () => {} }));
vi.mock('@/hooks/useWorkspace', () => ({ useActiveWorkspaceOwnerId: () => 'workspace-a' }));
vi.mock('@/lib/cloudSession', () => ({ getCloudSessionState: mocks.state }));
vi.mock('@/lib/facebookPageConnect', () => ({ callMetaPageConnect: vi.fn(() => new Promise(() => {})) }));
vi.mock('@/lib/facebookConnectionFlow', () => ({ openFacebookConnection: vi.fn() }));
vi.mock('@/lib/campaignFeedCache', () => ({ purgeCachedPostsForPage: vi.fn() }));

const ACTIVE = { active: true, status: 'active', expiresAt: null, workerReady: true, lastError: null };
const INACTIVE = { active: false, status: null, expiresAt: null, workerReady: true, lastError: null };

function mount(selected: 'facebook' | 'sms' | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CampaignChannelPicker selected={selected} onSelect={() => {}} onBack={() => {}} />
    </QueryClientProvider>,
  );
}

afterEach(() => { cleanup(); mocks.state.mockReset(); });

it.each(DISTRIBUTION_CHANNELS)('selects only the requested $id channel', ({ id, label }) => {
  mocks.state.mockResolvedValue(ACTIVE);
  const onSelect = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CampaignChannelPicker selected={null} onSelect={onSelect} onBack={() => {}} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: `בחירת ${label}` }));
  expect(onSelect).toHaveBeenCalledExactlyOnceWith(id);
});

it('returns to channel selection without selecting a different channel', () => {
  mocks.state.mockResolvedValue(ACTIVE);
  const onBack = vi.fn();
  const onSelect = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CampaignChannelPicker selected="sms" onSelect={onSelect} onBack={onBack} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'חזרה לבחירת ערוץ' }));
  expect(onBack).toHaveBeenCalledTimes(1);
  expect(onSelect).not.toHaveBeenCalled();
});

it('hides the Facebook page chooser while the cloud session is not connected', async () => {
  mocks.state.mockResolvedValue(INACTIVE);
  mount('facebook');
  await waitFor(() => expect(mocks.state).toHaveBeenCalled());
  expect(screen.queryByRole('button', { name: 'בחירת עמוד פייסבוק' })).not.toBeInTheDocument();
});

it('shows the Facebook page chooser once the cloud session is connected', async () => {
  mocks.state.mockResolvedValue(ACTIVE);
  mount('facebook');
  await waitFor(() => expect(screen.getByRole('button', { name: 'בחירת עמוד פייסבוק' })).toBeInTheDocument());
});
