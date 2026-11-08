import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { AppModeSwitcher } from './AppModeSwitcher';
const state = vi.hoisted(() => ({ accepted: true, rpc: vi.fn(), setMode: vi.fn(), navigate: vi.fn() }));
vi.mock('@/i18n/personalLanguage', async importOriginal => ({ ...await importOriginal<typeof import('@/i18n/personalLanguage')>(), usePersonalLanguage: () => ({ gender: 'male', command: (value: string) => value }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => state.navigate }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'broker' } }) }));
vi.mock('@/hooks/useUserRole', () => ({ useUserRole: () => ({ isAffiliate: false, loading: false, error: false }), userRolesQueryKey: (id: string) => ['user-roles', id] }));
vi.mock('@/hooks/useWorkspace', () => ({ useWorkspace: () => ({ loading: false, activeWorkspaceId: 'broker' }) }));
vi.mock('@/hooks/useAppMode', () => ({ useAppMode: () => ({ mode: 'broker', setMode: state.setMode }) }));
vi.mock('@/hooks/useAccountIdentity', () => ({ useAccountIdentity: () => ({ label: 'מתווך', home: '/', canSwitch: true }) }));
vi.mock('@/hooks/usePartnerConsent', () => ({ usePartnerConsent: () => ({ data: state.accepted, refetch: async () => ({ data: state.accepted }) }) }));
vi.mock('@/components/ui/sidebar', () => ({ useSidebar: () => ({ isMobile: false, setOpen: vi.fn(), setOpenMobile: vi.fn() }) }));
vi.mock('@/components/affiliate/PartnerOnboarding', () => ({ PartnerOnboarding: () => null }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: state.rpc } }));
afterEach(() => { cleanup(); state.accepted = true; vi.clearAllMocks(); });
function mount() { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}><AppModeSwitcher /></QueryClientProvider>); }
it('activates a broker as partner through current server consent without altering workspace', async () => {
  state.rpc.mockResolvedValue({ data: { ok: true }, error: null }); mount();
  fireEvent.click(screen.getByRole('button', { name: 'שותף' }));
  await waitFor(() => expect(state.setMode).toHaveBeenCalledWith('partner'));
  expect(state.rpc).toHaveBeenCalledWith('activate_partner_mode');
  expect(state.navigate).toHaveBeenCalledWith('/affiliate-network');
});
it('does not activate a broker before explicit terms acceptance', async () => {
  state.accepted = false; mount(); fireEvent.click(screen.getByRole('button', { name: 'שותף' }));
  await waitFor(() => expect(screen.getByRole('dialog')).toBeDefined());
  expect(state.rpc).not.toHaveBeenCalled(); expect(state.setMode).not.toHaveBeenCalled();
});
it('keeps the broker mode when server activation fails', async () => {
  state.rpc.mockResolvedValue({ data: null, error: { code: 'P0001' } }); mount();
  fireEvent.click(screen.getByRole('button', { name: 'שותף' }));
  await waitFor(() => expect(state.rpc).toHaveBeenCalled());
  expect(state.setMode).not.toHaveBeenCalled(); expect(state.navigate).not.toHaveBeenCalled();
});