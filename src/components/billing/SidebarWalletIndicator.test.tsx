import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SidebarWalletIndicator } from './SidebarWalletIndicator';

const mocks = vi.hoisted(() => ({ navigate: vi.fn(), mobile: vi.fn(), desktop: vi.fn(), count: 0 }));
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: mocks.count }) }));
vi.mock('@/hooks/useSubscription', () => ({ useCreditWallet: () => ({ data: { balance: 200 }, isLoading: false }) }));
vi.mock('@/hooks/useWorkspace', () => ({ useActiveWorkspaceOwnerId: () => 'workspace' }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'test' } }) }));
vi.mock('@/hooks/useUserRole', () => ({ useUserRole: () => ({ isTeamMember: true, loading: false }) }));
vi.mock('@/hooks/useAppMode', () => ({ useAppMode: () => ({ isPartnerMode: false }) }));
vi.mock('@/components/ui/sidebar', () => ({ useSidebar: () => ({ setOpen: mocks.desktop, setOpenMobile: mocks.mobile }) }));

describe('sidebar wallet and counters', () => {
  beforeEach(() => { mocks.count = 0; vi.clearAllMocks(); });
  it('shows credits, hides zero counter and closes drawer on wallet navigation', () => {
    render(<SidebarWalletIndicator />);
    expect(screen.getByText('5k קרדיטים')).toBeInTheDocument();
    expect(screen.getByText('לידים')).toBeInTheDocument();
    expect(screen.queryByText('חדשים')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'הסבר על לידים חדשים' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ארנק ותשלומים' }));
    expect(mocks.mobile).toHaveBeenCalledWith(false);
    expect(mocks.desktop).toHaveBeenCalledWith(false);
    expect(mocks.navigate).toHaveBeenCalledWith('/wallet');
  });
  it('puts live badge inside Leads with no help button and closes on navigation', () => {
    mocks.count = 3;
    render(<SidebarWalletIndicator />);
    const button = screen.getByRole('button', { name: 'לידים שטרם טופלו: 3' });
    expect(button).toContainElement(screen.getByLabelText('לידים חדשים'));
    expect(screen.queryByRole('button', { name: /מה מייצג/ })).not.toBeInTheDocument();
    fireEvent.click(button);
    expect(mocks.navigate).toHaveBeenCalledWith('/lead-crm?filter=untreated');
    expect(mocks.mobile).toHaveBeenCalledWith(false);
  });
});