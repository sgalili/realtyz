import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CloudAutomationHealthCard } from './CloudAutomationHealthCard';

const mocks = vi.hoisted(() => ({ role: { isSuperAdmin: false, loading: false, error: false }, invoke: vi.fn() }));
vi.mock('@/hooks/useUserRole', () => ({ useUserRole: () => mocks.role }));
vi.mock('@/hooks/useWorkspace', () => ({ useActiveWorkspaceOwnerId: () => 'workspace-a' }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const show = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CloudAutomationHealthCard /></QueryClientProvider>);
const expand = () => fireEvent.click(screen.getByRole('button', { name: /אוטומציית ענן 24\/7/ }));

describe('Cloud automation monitoring', () => {
  it.each([
    { isSuperAdmin: false, loading: false, error: false },
    { isSuperAdmin: true, loading: true, error: false },
    { isSuperAdmin: true, loading: false, error: true },
  ])('does not mount or fetch without a verified super admin role %j', (role) => {
    mocks.role = role;
    const { container } = show();
    expect(container).toBeEmptyDOMElement();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
  it('is collapsed by default and stays idle until expanded', () => {
    mocks.role = { isSuperAdmin: true, loading: false, error: false };
    show();
    expect(screen.getByRole('button', { name: /אוטומציית ענן 24\/7/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('שרת Railway')).not.toBeInTheDocument();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
  it('shows actual queue values and does not confuse reachability with heartbeat', async () => {
    mocks.role = { isSuperAdmin: true, loading: false, error: false };
    mocks.invoke.mockResolvedValue({ data: {
      checked_at: new Date().toISOString(),
      worker: { url: 'https://Realtyzai-production-5199.up.railway.app', reachable: true, configured: true, last_heartbeat: null },
      scheduler: { last_tick: new Date().toISOString() },
      queue: { pending: 7, processing: 2, sent_today: 3, failed_today: 1, overdue: 0, expired_leases: 0 },
    }, error: null });
    show();
    expand();
    await waitFor(() => expect(screen.getByText('השרת מגיב')).toBeInTheDocument());
    expect(screen.getByText('לא התקבל')).toBeInTheDocument();
    expect(screen.getByText('דורש בדיקה')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(mocks.invoke).toHaveBeenCalledWith('fb-session-vault', { body: { action: 'monitor' } });
  });
  it('shows a read error rather than fabricated zero counts', async () => {
    mocks.role = { isSuperAdmin: true, loading: false, error: false };
    mocks.invoke.mockResolvedValue({ data: null, error: new Error('forbidden') });
    show();
    expand();
    await waitFor(() => expect(screen.getByText('לא ניתן לקרוא את המצב. נסו לרענן.')).toBeInTheDocument());
    expect(screen.queryByText('תקין')).not.toBeInTheDocument();
  });
});
