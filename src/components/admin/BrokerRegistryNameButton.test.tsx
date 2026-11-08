import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { BrokerRegistryNameButton } from './BrokerRegistryNameButton';
const state = vi.hoisted(() => ({ admin: true, invoke: vi.fn(), invalidate: vi.fn() }));
vi.mock('@/hooks/useUserRole', () => ({ useUserRole: () => ({ isSuperAdmin: state.admin }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: state.invoke } } }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
afterEach(() => { cleanup(); state.admin = true; state.invoke.mockReset(); });
it('passes the selected profile and exact license and reads back the persisted name', async () => {
  const profile = { id: 'target', broker_license_number: '31927721', full_name: 'אידלסון דולי' };
  state.invoke.mockResolvedValue({ data: { profile }, error: null });
  const updated = vi.fn();
  render(<BrokerRegistryNameButton userId="target" license="31927721" onUpdated={updated} />);
  fireEvent.click(screen.getByRole('button'));
  await waitFor(() => expect(updated).toHaveBeenCalledWith(profile));
  expect(state.invoke).toHaveBeenCalledWith('admin-broker-registry-name', { body: { user_id: 'target', license_number: '31927721' } });
});
it('does not update the profile on a not-found response', async () => {
  state.invoke.mockResolvedValue({ data: { message: 'הרישיון לא נמצא' }, error: {} });
  const updated = vi.fn();
  render(<BrokerRegistryNameButton userId="target" license="31927721" onUpdated={updated} />);
  fireEvent.click(screen.getByRole('button'));
  await screen.findByRole('alert');
  expect(updated).not.toHaveBeenCalled();
});
it('discards a response after the selected profile changes', async () => {
  let complete: ((value: unknown) => void) | undefined;
  state.invoke.mockReturnValue(new Promise(resolve => { complete = resolve; }));
  const updated = vi.fn();
  const { rerender } = render(<BrokerRegistryNameButton userId="first" license="31927721" onUpdated={updated} />);
  fireEvent.click(screen.getByRole('button'));
  rerender(<BrokerRegistryNameButton userId="second" license="31927722" onUpdated={updated} />);
  complete?.({ data: { profile: { id: 'first', broker_license_number: '31927721', full_name: 'אידלסון דולי' } }, error: null });
  await waitFor(() => expect(state.invoke).toHaveBeenCalledTimes(1));
  expect(updated).not.toHaveBeenCalled();
});
it('never exposes the registry action to a non-Super Admin', () => {
  state.admin = false;
  render(<BrokerRegistryNameButton userId="target" license="31927721" onUpdated={vi.fn()} />);
  expect(screen.queryByRole('button')).toBeNull();
  expect(state.invoke).not.toHaveBeenCalled();
});