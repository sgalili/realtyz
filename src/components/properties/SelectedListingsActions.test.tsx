import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SelectedListingsActions } from './SelectedListingsActions';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('@/hooks/useUserRole', () => ({ useUserRole: () => ({ isSuperAdmin: true }) }));
vi.mock('@/hooks/useDemoMode', () => ({ useDemoMode: () => ({ isDemoMode: false }) }));
vi.mock('@/components/demo/DemoViewBar', () => ({ useDemoViewStatus: () => ({ type: null, loading: false }) }));
vi.mock('./QuickPublicPromotion', () => ({ QuickPublicPromotion: () => null }));
vi.mock('./BulkClosingCommission', () => ({ BulkClosingCommission: () => null }));
vi.mock('./PauseDistributionDialog', () => ({ PauseDistributionDialog: () => null }));
vi.mock('@/lib/publishInventory', () => ({ pauseInventory: vi.fn(), publicationErrorMessage: () => 'error' }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

const rotationResult = { listings: 1, projects: 0, apartments: 0, total: 1 };

describe('selected property photo rotation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('locks duplicate rotation clicks and shows the spinner until every selected item finishes', async () => {
    const first = deferred<{ data: typeof rotationResult; error: null }>();
    const second = deferred<{ data: typeof rotationResult; error: null }>();
    mocks.rpc.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);

    render(
      <QueryClientProvider client={new QueryClient()}>
        <SelectedListingsActions
          ids={['property-1', 'property-2']}
          liveIds={[]}
          unconfiguredIds={[]}
          workspaceId="workspace-1"
          onPublished={vi.fn()}
          onDelete={vi.fn()}
          onCommissionSaved={vi.fn()}
        />
      </QueryClientProvider>,
    );

    const rotateButton = screen.getByRole('button', { name: 'הזז 2 תמונות ראשונות לסוף' });
    fireEvent.click(rotateButton);
    fireEvent.click(rotateButton);

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status', { name: 'מזיז 2 תמונות ראשונות לסוף' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'הזז 2 תמונות ראשונות לסוף' })).toBeNull();

    await act(async () => {
      first.resolve({ data: rotationResult, error: null });
      await first.promise;
    });
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('status', { name: 'מזיז 2 תמונות ראשונות לסוף' })).toBeTruthy();

    await act(async () => {
      second.resolve({ data: rotationResult, error: null });
      await second.promise;
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'הזז 2 תמונות ראשונות לסוף' })).toBeTruthy());
    expect(screen.queryByRole('status', { name: 'מזיז 2 תמונות ראשונות לסוף' })).toBeNull();
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });
});
