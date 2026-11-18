import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { BrokerContactQueueCard } from './BrokerContactQueueCard';

const state = vi.hoisted(() => ({ invoke: vi.fn(), switchWorkspace: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: state.invoke } } }));
vi.mock('@/hooks/useWorkspace', () => ({ useWorkspace: () => ({ activeWorkspaceId: 'admin', setActiveWorkspace: state.switchWorkspace }) }));
vi.mock('./OfficialBrokerInvitationDialog', () => ({ OfficialBrokerInvitationDialog: () => null, OfficialBrokerInvitationPanel: () => null }));
vi.mock('./BrokerInvitationTemplateEditor', () => ({ BrokerInvitationTemplateEditor: () => null }));
vi.mock('./BrokerEmailInvitations', () => ({ BrokerEmailConsentButton: () => null }));
vi.mock('./BrokerRegistryNameButton', () => ({ BrokerRegistryNameButton: () => null }));

const account = {
  user_id: '00000000-0000-0000-0000-000000000123', full_name: 'Doli Idelson', phone: '972501234567', email: null,
  license_number: '123456', office_name: 'Office', city: 'Herzliya', drafts: 2, contact_status: 'complete',
  first_login_at: null, email_consent_at: null, email_invited_at: null, license_verified: true, is_developer: false,
};

afterEach(() => { cleanup(); state.invoke.mockReset(); state.switchWorkspace.mockClear(); });

function setup(deleteStatus = 'deleted') {
  state.invoke.mockImplementation((name, { body }) => {
    if (name === 'super-admin-delete-users') return Promise.resolve({ data: { results: [{ user_id: account.user_id, status: deleteStatus }] }, error: null });
    if (body.action === 'list') return Promise.resolve({ data: { brokers: [account] }, error: null });
    return Promise.resolve({ data: { items: [] }, error: null });
  });
  render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><BrokerContactQueueCard /></QueryClientProvider></MemoryRouter>);
}

it('deletes only the exact account after explicit permanent-deletion confirmation', async () => {
  setup();
  fireEvent.click(await screen.findByRole('button', { name: 'מחיקת החשבון של Doli Idelson' }));
  expect(state.invoke).not.toHaveBeenCalledWith('super-admin-delete-users', expect.anything());
  fireEvent.click(screen.getByRole('button', { name: 'מחיקה לצמיתות' }));
  await waitFor(() => expect(state.invoke).toHaveBeenCalledWith('super-admin-delete-users', { body: { user_ids: [account.user_id] } }));
});

it('does not report deletion when the protected endpoint refuses it', async () => {
  setup('protected_super_admin');
  fireEvent.click(await screen.findByRole('button', { name: 'מחיקת החשבון של Doli Idelson' }));
  fireEvent.click(screen.getByRole('button', { name: 'מחיקה לצמיתות' }));
  await waitFor(() => expect(state.invoke).toHaveBeenCalledWith('super-admin-delete-users', { body: { user_ids: [account.user_id] } }));
  expect(screen.getByRole('dialog')).toBeTruthy();
});
