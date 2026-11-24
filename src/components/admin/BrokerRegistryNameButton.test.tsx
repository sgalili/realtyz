import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { BrokerRegistryNameButton } from './BrokerRegistryNameButton';
const state = vi.hoisted(() => ({ admin: true, invoke: vi.fn(), invalidate: vi.fn() }));
vi.mock('@/hooks/useUserRole', () => ({ useUserRole: () => ({ isSuperAdmin: state.admin }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: {id:'target'} }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: state.invoke } } }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
afterEach(() => { cleanup();vi.useRealTimers(); state.admin = true; state.invoke.mockReset(); });
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
it('handles a completed no-match lookup without applying identity or verification changes', async () => {
  state.invoke.mockResolvedValue({ data: { found: false, valid: false, code: 'license_not_found', message: 'הרישיון לא נמצא' }, error: null });
  const updated = vi.fn();
  render(<BrokerRegistryNameButton userId="target" license="31927721" onUpdated={updated} />);
  fireEvent.click(screen.getByRole('button'));
  await screen.findByRole('alert');
  expect(updated).not.toHaveBeenCalled();
  expect(screen.getByRole('button')).toBeDisabled();
  fireEvent.click(screen.getByRole('button'));expect(state.invoke).toHaveBeenCalledTimes(1);
});
it('applies the official returned name without comparing it to the old account name', async () => {
  const profile={id:'target',broker_license_number:'36484',full_name:'פנינה דיין'};
  state.invoke.mockResolvedValue({data:{profile,registry:{full_name:'פנינה דיין'}},error:null});
  const updated=vi.fn();
  render(<BrokerRegistryNameButton compact userId="target" license="36484" onUpdated={updated}/>);
  fireEvent.click(screen.getByRole('button'));
  await waitFor(()=>expect(updated).toHaveBeenCalledWith(profile));
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
it('clears a lookup error after exactly five seconds', async () => {
  vi.useFakeTimers();state.invoke.mockResolvedValue({data:{message:'not found'},error:{}});
  render(<BrokerRegistryNameButton userId="target" license="31927721" onUpdated={vi.fn()} />);
  await act(async()=>{fireEvent.click(screen.getByRole('button'));});
  expect(screen.getByRole('alert')).toBeVisible();
  act(()=>vi.advanceTimersByTime(4999));expect(screen.getByRole('alert')).toBeVisible();
  act(()=>vi.advanceTimersByTime(1));expect(screen.queryByRole('alert')).toBeNull();
});
it('rechecks an approved license through the exact authorized admin target', async () => {
  const profile={id:'target',broker_license_number:'31927721',full_name:'Broker'};
  state.invoke.mockResolvedValue({data:{profile},error:null});
  render(<BrokerRegistryNameButton presentation="approved" userId="target" license="31927721" onUpdated={vi.fn()} />);
  fireEvent.click(screen.getByRole('button'));
  await waitFor(()=>expect(state.invoke).toHaveBeenCalledWith('admin-broker-registry-name',{body:{user_id:'target',license_number:'31927721'}}));
});
it('uses auth-bound self verification for an approved account, never an admin target override', async () => {
  state.admin=false;
  state.invoke.mockResolvedValue({data:{valid:true,active:true,profile:{id:'target',broker_license_number:'31927721',full_name:'Broker'}},error:null});
  const updated=vi.fn();
  render(<BrokerRegistryNameButton presentation="approved" ownAccount userId="target" license="31927721" onUpdated={updated} />);
  fireEvent.click(screen.getByRole('button'));
  await waitFor(()=>expect(updated).toHaveBeenCalled());
  expect(state.invoke).toHaveBeenCalledWith('verify-broker-license',{body:{licenseNumber:'31927721',action:'verify'}});
});
it('does not allow self verification against a different account', () => {
  state.admin=false;
  render(<BrokerRegistryNameButton presentation="approved" ownAccount userId="other" license="31927721" onUpdated={vi.fn()} />);
  expect(screen.queryByRole('button')).toBeNull();expect(state.invoke).not.toHaveBeenCalled();
});
it('does not recheck a persisted exact no-match after remount',()=>{
 const view=render(<BrokerRegistryNameButton userId="target" license="123" noMatch onUpdated={vi.fn()} />);
 fireEvent.click(screen.getByRole('button'));view.unmount();
 render(<BrokerRegistryNameButton userId="target" license="123" noMatch onUpdated={vi.fn()} />);
 fireEvent.click(screen.getByRole('button'));expect(state.invoke).not.toHaveBeenCalled();
});
