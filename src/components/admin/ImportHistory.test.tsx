import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { ImportHistory } from './BrokerContactQueueCard';

const state = vi.hoisted(() => ({ invoke: vi.fn(), switchWorkspace: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: state.invoke } } }));
vi.mock('@/hooks/useWorkspace', () => ({ useWorkspace: () => ({ activeWorkspaceId: 'admin', setActiveWorkspace: state.switchWorkspace }) }));
vi.mock('./OfficialBrokerInvitationDialog', () => ({ OfficialBrokerInvitationDialog: () => null }));
vi.mock('./BrokerEmailInvitations', () => ({ BrokerEmailConsentButton: () => null }));
vi.mock('./BrokerRegistryNameButton', () => ({ BrokerRegistryNameButton: () => null }));
afterEach(() => { cleanup(); state.invoke.mockReset(); state.switchWorkspace.mockClear(); });
const item = { id: 'dev:00000000-0000-0000-0000-000000000001', kind: 'developer', name: 'Owner', workspace_owner_id: 'owner-id', public_user_id: 'owner-id', agency_name: 'Company', logo_url: null, projects: 3, source_url: 'https://www.yad2.co.il/realestate/project/123', imported_at: '2026-11-17', status: 'completed' };
function setup() {
  state.invoke.mockImplementation((_name, { body }) => Promise.resolve({ data: body.action === 'imports' ? { items: [item] } : { ok: true }, error: null }));
  render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ImportHistory /></QueryClientProvider></MemoryRouter>);
}
it('switches to the exact inventory owner on identity click', async () => {
  setup();
  fireEvent.mouseDown(await screen.findByRole('tab', { name: 'יזמים' }));
  fireEvent.click(await screen.findByRole('button', { name: 'פתיחת הפרויקטים של Owner' }));
  await waitFor(() => expect(state.switchWorkspace).toHaveBeenCalledWith('owner-id'));
});
it('does not expose the original Yad2 source link in import history', async () => {
  setup();
  fireEvent.mouseDown(await screen.findByRole('tab', { name: 'יזמים' }));
  await screen.findByRole('button', { name: 'פתיחת הפרויקטים של Owner' });
  expect(screen.queryByRole('link', { name: 'פתיחת עמוד המקור ביד 2' })).not.toBeInTheDocument();
  expect(screen.queryByRole('columnheader', { name: 'מקור' })).not.toBeInTheDocument();
});
it('deletes only the selected log record after explicit confirmation', async () => {
  setup();
  fireEvent.mouseDown(await screen.findByRole('tab', { name: 'יזמים' }));
  fireEvent.click(await screen.findByRole('button', { name: 'מחיקת רשומת היבוא של Owner' }));
  expect(state.invoke).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: /^מחיקה$/ }));
  await waitFor(() => expect(state.invoke).toHaveBeenCalledWith('admin-broker-contact', { body: { action: 'delete_import', record_id: item.id } }));
  expect(state.invoke.mock.calls.every(([, args]) => !['delete_user', 'delete_project', 'delete_listing'].includes(args.body.action))).toBe(true);
});