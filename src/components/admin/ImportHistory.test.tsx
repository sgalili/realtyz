import { fireEvent, render, screen, waitFor, cleanup, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { ImportHistory } from './BrokerContactQueueCard';
import type { ImportActivityJob } from '@/lib/importHistoryActivity';

const state = vi.hoisted(() => ({ invoke: vi.fn(), switchWorkspace: vi.fn().mockResolvedValue(undefined), jobs: [] as ImportActivityJob[] }));
vi.mock('@/hooks/useUserRole', () => ({ useUserRole: () => ({ isSuperAdmin: true, loading: false }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'admin' } }) }));
vi.mock('@/hooks/useAdminImportJobs', () => ({ useAdminImportJobs: () => ({ data: state.jobs }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: state.invoke } } }));
vi.mock('@/hooks/useWorkspace', () => ({ useWorkspace: () => ({ activeWorkspaceId: 'admin', setActiveWorkspace: state.switchWorkspace }) }));
vi.mock('./OfficialBrokerInvitationDialog', () => ({ OfficialBrokerInvitationDialog: () => null }));
vi.mock('./BrokerEmailInvitations', () => ({ BrokerEmailConsentButton: () => null }));
vi.mock('./BrokerRegistryNameButton', () => ({ BrokerRegistryNameButton: () => null }));
afterEach(() => { cleanup(); state.invoke.mockReset(); state.switchWorkspace.mockClear(); state.jobs = []; sessionStorage.clear(); });
const item = { id: 'dev:00000000-0000-0000-0000-000000000001', kind: 'developer', name: 'Owner', workspace_owner_id: 'owner-id', public_user_id: 'owner-id', agency_name: 'Company', logo_url: null, projects: 3, source_url: 'https://www.yad2.co.il/realestate/project/123', imported_at: '2026-11-17', status: 'completed' };
function setup() {
  state.invoke.mockImplementation((_name, { body }) => Promise.resolve({ data: body.action === 'imports' ? { items: [item] } : { ok: true }, error: null }));
  render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ImportHistory /></QueryClientProvider></MemoryRouter>);
}
function setupWith(items: unknown[]) {
  state.invoke.mockImplementation((_name, { body }) => Promise.resolve({ data: body.action === 'imports' ? { items } : { ok: true }, error: null }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const element = () => <MemoryRouter><QueryClientProvider client={client}><ImportHistory /></QueryClientProvider></MemoryRouter>;
  const view = render(element());
  return () => view.rerender(element());
}
it('switches to the exact inventory owner on identity click', async () => {
  setup();
  fireEvent.mouseDown(await screen.findByRole('tab', { name: /^יזמים/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'פתיחת הפרויקטים של Owner' }));
  await waitFor(() => expect(state.switchWorkspace).toHaveBeenCalledWith('owner-id'));
});
it('does not expose the original Yad2 source link in import history', async () => {
  setup();
  fireEvent.mouseDown(await screen.findByRole('tab', { name: /^יזמים/ }));
  await screen.findByRole('button', { name: 'פתיחת הפרויקטים של Owner' });
  expect(screen.queryByRole('link', { name: 'פתיחת עמוד המקור ביד 2' })).not.toBeInTheDocument();
  expect(screen.queryByRole('columnheader', { name: 'מקור' })).not.toBeInTheDocument();
});
it('deletes only the selected log record after explicit confirmation', async () => {
  setup();
  fireEvent.mouseDown(await screen.findByRole('tab', { name: /^יזמים/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'מחיקת רשומת היבוא של Owner' }));
  expect(state.invoke).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: /^מחיקה$/ }));
  await waitFor(() => expect(state.invoke).toHaveBeenCalledWith('admin-broker-contact', { body: { action: 'delete_import', record_id: item.id } }));
  expect(state.invoke.mock.calls.every(([, args]) => !['delete_user', 'delete_project', 'delete_listing'].includes(args.body.action))).toBe(true);
});
it('drops the logo and status columns from the table', async () => {
  setup();
  fireEvent.mouseDown(await screen.findByRole('tab', { name: /^יזמים/ }));
  await screen.findByRole('button', { name: 'פתיחת הפרויקטים של Owner' });
  expect(screen.queryByRole('columnheader', { name: 'לוגו' })).not.toBeInTheDocument();
  expect(screen.queryByRole('columnheader', { name: 'סטטוס' })).not.toBeInTheDocument();
});
it('renders the saved logo inline inside the name cell', async () => {
  setupWith([{ ...item, logo_url: 'https://example.test/logo.png' }]);
  fireEvent.mouseDown(await screen.findByRole('tab', { name: /^יזמים/ }));
  const nameCell = await screen.findByRole('button', { name: 'פתיחת הפרויקטים של Owner' });
  expect(within(nameCell).getByRole('img', { name: 'לוגו Owner' })).toBeTruthy();
});
it('shows the count centered inside a loader ring while the import is still running', async () => {
  state.jobs = [{ id: 'job', status: 'running', stage: 'developer_saving', checkpoint: { externalPendingDeveloper: { owner: 'owner-id' } } }];
  setupWith([{ ...item, status: 'running', projects: 4 }]);
  fireEvent.mouseDown(await screen.findByRole('tab', { name: /^יזמים/ }));
  const ring = await screen.findByRole('img', { name: 'פרויקטים נטענים · 4' });
  expect(ring.textContent).toBe('4');
  expect(screen.queryByText('בתהליך')).not.toBeInTheDocument();
});

it('transfers the ring to the next broker without changing either saved numeric count', async () => {
  state.jobs = [{ id: 'job', status: 'running', stage: 'importing', checkpoint: { execution: 'external', activeBroker: { broker_id: 'owner-a' } } }];
  const refresh = setupWith([{ ...item, id: 'row-a', kind: 'broker', name: 'Broker A', workspace_owner_id: 'owner-a', public_user_id: 'owner-a', projects: 7 }, { ...item, id: 'row-b', kind: 'broker', name: 'Broker B', workspace_owner_id: 'owner-b', public_user_id: 'owner-b', projects: 12 }]);
  expect(await screen.findByRole('img', { name: 'נכסים נטענים · 7' })).toHaveTextContent('7');
  expect(screen.queryByRole('img', { name: 'נכסים נטענים · 12' })).toBeNull();
  state.jobs = [{ ...state.jobs[0], checkpoint: { execution: 'external', activeBroker: { broker_id: 'owner-b' }, workerEnrichedIds: ['owner-a'] } }];
  refresh();
  expect(screen.queryByRole('img', { name: 'נכסים נטענים · 7' })).toBeNull();
  expect(screen.getByRole('img', { name: 'נכסים נטענים · 12' })).toHaveTextContent('12');
  state.jobs = [{ ...state.jobs[0], status: 'completed' }];
  refresh();
  expect(screen.queryByRole('img')).toBeNull();
  expect(screen.getByText('7')).toBeVisible();
  expect(screen.getByText('12')).toBeVisible();
});