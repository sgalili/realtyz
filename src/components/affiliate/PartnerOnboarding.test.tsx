import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PartnerOnboarding } from './PartnerOnboarding';
const mocks = vi.hoisted(() => ({ accept: vi.fn(), seen: vi.fn() }));
vi.mock('@/hooks/useAffiliateLicense', () => ({ useAffiliateLicense: () => ({ acceptTerms: mocks.accept, isAcceptingTerms: false }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'test' } }) }));
vi.mock('@/hooks/useUserRole', () => ({ userRolesQueryKey: (id: string) => ['roles', id] }));
vi.mock('@/lib/tutorials', () => ({ tutorialStore: { markSeen: mocks.seen } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function setup() {
  const done = vi.fn();
  render(<QueryClientProvider client={new QueryClient()}><PartnerOnboarding onComplete={done} /></QueryClientProvider>);
  return done;
}
function advance() { for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: 'הבא', exact: true })); }
describe('partner consent sequence', () => {
  it('requires slides and explicit agreement before entry', async () => {
    mocks.accept.mockResolvedValue(undefined);
    const done = setup();
    expect(screen.queryByRole('button', { name: 'אשר והסכם' })).toBeNull();
    advance();
    expect(done).not.toHaveBeenCalled();
    expect(mocks.accept).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'אשר והסכם' }));
    await waitFor(() => expect(done).toHaveBeenCalledOnce());
  });
  it('does not unlock partner entry when consent persistence fails', async () => {
    mocks.accept.mockRejectedValue(new Error('failed'));
    const done = setup(); advance();
    fireEvent.click(screen.getByRole('button', { name: 'אשר והסכם' }));
    await screen.findByRole('alert');
    expect(done).not.toHaveBeenCalled();
  });
});