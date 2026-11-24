import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { BrokerImportWorkspace } from './BrokerImportWorkspace';

vi.mock('@/hooks/useSuperAdminGate', () => ({ useSuperAdminGate: () => ({ enabled: true, uid: 'admin' }) }));
vi.mock('./BrokerBatchImportCard', () => ({ BrokerBatchImportCard: () => <div>סטטוס הייבוא</div> }));
vi.mock('./BrokerContactQueueCard', () => ({ usePendingInvitations: () => ({ data: { brokers: [] } }), useImportHistoryRows: () => ({ data: { items: [] } }), useSendHistoryRows: () => ({ data: { items: [] } }), BrokerContactQueueCard: ({ view }: { view: string }) => <div data-testid="active-import-view">{view}</div> }));

afterEach(() => { cleanup(); sessionStorage.clear(); });

function setup(entry = '/') {
  return render(<MemoryRouter initialEntries={[entry]}><BrokerImportWorkspace /></MemoryRouter>);
}

it('starts with pending invitations below the status and exactly three tabs in the requested order', () => {
  setup();
  expect(screen.getByText('סטטוס הייבוא')).toBeTruthy();
  expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['ממתינים (0)', 'ייבוא (0)', 'שליחות (0)']);
  expect(screen.getByTestId('active-import-view').textContent).toBe('pending');
});

it('shows only the selected content and supports returning to pending invitations', async () => {
  setup('/?history=sends');
  expect(screen.getByTestId('active-import-view').textContent).toBe('sends');
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'ייבוא (0)' }));
  await waitFor(() => expect(screen.getByTestId('active-import-view').textContent).toBe('imports'));
  expect(screen.queryByText('sends')).toBeNull();
  fireEvent.mouseDown(screen.getByRole('tab', { name: /^ממתינים/ }));
  await waitFor(() => expect(screen.getByTestId('active-import-view').textContent).toBe('pending'));
  expect(screen.queryByText('imports')).toBeNull();
});

it('restores the selected history tab after leaving and remounting without a tab parameter', () => {
  const first = setup('/?history=imports');
  expect(screen.getByTestId('active-import-view')).toHaveTextContent('imports');
  first.unmount();
  setup('/');
  expect(screen.getByTestId('active-import-view')).toHaveTextContent('imports');
});
