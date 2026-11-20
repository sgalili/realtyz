import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { BrokerContactQueueCard } from './BrokerContactQueueCard';

const state = vi.hoisted(() => ({ invoke: vi.fn(), rpc: vi.fn().mockResolvedValue({ data: [], error: null }), switchWorkspace: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: state.invoke }, rpc: state.rpc } }));
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

afterEach(() => { cleanup(); state.invoke.mockReset(); state.rpc.mockReset(); state.rpc.mockResolvedValue({ data: [], error: null }); state.switchWorkspace.mockClear(); });

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

const devId = '00000000-0000-0000-0000-000000000456';
const historyItem = { user_id: devId, recipient_kind: 'developer', channel: 'email', status: 'sent', sent_at: '2026-11-18T10:00:00Z', full_name: 'אלמוגים', avatar_url: null, office_name: 'אנגלו סקסון', office_logo_url: 'https://cdn.example.com/office.png', content: { to: 'office@example.com', subject: 'כותרת', body: 'גוף' } };

function setupHistory(contactRow: Record<string, unknown> | null) {
  state.invoke.mockImplementation((name, { body }) => {
    if (body.action === 'list') return Promise.resolve({ data: { brokers: [] }, error: null });
    if (body.action === 'history') return Promise.resolve({ data: { items: [historyItem] }, error: null });
    return Promise.resolve({ data: { items: [] }, error: null });
  });
  state.rpc.mockResolvedValue({ data: contactRow ? [contactRow] : [], error: null });
  render(<MemoryRouter initialEntries={['/?history=sends']}><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><BrokerContactQueueCard view="sends" /></QueryClientProvider></MemoryRouter>);
}

it('shows marketing company, contact, contact phone and a quick-dial button when they are set', async () => {
  setupHistory({ owner_id: devId, company_id: 'c1', company_name: 'שיווקא', contact_name: 'מורן', contact_phone: '972509999999', contact_gender: 'male' });
  expect(await screen.findByText('שיווקא')).toBeTruthy();
  expect(screen.getByText('מורן')).toBeTruthy();
  expect(screen.getByText('050-9999999')).toBeTruthy();
  const dial = screen.getByRole('link', { name: 'חיוג לאיש הקשר 050-9999999' });
  expect(dial.getAttribute('href')).toBe('tel:+972509999999');
});

it('hides every marketing detail when the contact person was never defined', async () => {
  setupHistory({ owner_id: devId, company_id: null, company_name: null, contact_name: null, contact_phone: null, contact_gender: null });
  fireEvent.mouseDown(await screen.findByRole('tab', { name: 'יזמים' }));
  expect(await screen.findByText('אלמוגים')).toBeTruthy();
  expect(screen.queryByText('שיווקא')).toBeNull();
  expect(screen.queryByText('מורן')).toBeNull();
  expect(screen.queryByText('050-9999999')).toBeNull();
  expect(screen.queryByRole('link', { name: /^חיוג לאיש הקשר/ })).toBeNull();
});

it('places an available office logo immediately before the office name', async () => {
  setupHistory(null);
  fireEvent.mouseDown(await screen.findByRole('tab', { name: 'יזמים' }));
  const logo = await screen.findByRole('img', { name: 'לוגו אנגלו סקסון' });
  const officeName = screen.getByText('אנגלו סקסון');
  expect(logo.parentElement).toBe(officeName.parentElement);
  expect(logo.compareDocumentPosition(officeName) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it('lists a developer invitation sent to a marketing company only under the marketing tab', async () => {
  setupHistory({ owner_id: devId, company_id: 'c1', company_name: 'שיווקא', contact_name: 'מורן', contact_phone: '972509999999', contact_gender: 'male' });
  expect(await screen.findByText('שיווקא')).toBeTruthy();
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'יזמים' }));
  await waitFor(() => expect(screen.queryByText('אלמוגים')).toBeNull());
});
