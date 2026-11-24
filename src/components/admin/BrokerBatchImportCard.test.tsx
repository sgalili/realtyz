import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { saveSuperAdminViewState } from '@/lib/superAdminViewState';
import { BrokerBatchImportCard } from './BrokerBatchImportCard';

const state = vi.hoisted(() => ({ rpc: vi.fn(), job: { repeat_enabled: false, id: 'job-1', status: 'paused', stage: 'importing', target_brokers: 10, brokers_done: 2, listings_done: 8, skipped: 0, updated_at: '2026-11-22T01:35:00Z', error: null as string | null, checkpoint: { lastError: { message: 'provider timeout', status: 504 } } } }));
vi.mock('@/hooks/useSuperAdminGate', () => ({ useSuperAdminGate: () => ({ enabled: true, uid: 'admin' }) }));
vi.mock('@tanstack/react-query', () => ({ useQuery: (o: {queryKey: string[]}) => ({ data: o.queryKey[0] === 'admin-broker-import-jobs' ? [state.job] : o.queryKey[0] === 'admin-import-broker-counts' ? [] : null }), useQueryClient: () => ({ invalidateQueries: vi.fn().mockResolvedValue(null) }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: state.rpc, functions: { invoke: vi.fn() } } }));
vi.mock('@/lib/refreshImportedInventory', () => ({ refreshImportedInventory: vi.fn() }));
beforeEach(() => { sessionStorage.clear(); state.job.error = null; state.job.repeat_enabled = false; state.rpc.mockReset(); });
afterEach(cleanup);

it('shows the saved red error only during explicit expansion and hides it after collapse', () => {
  render(<BrokerBatchImportCard />);
  expect(screen.queryByRole('alert')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'הרחבת פרטי הייבוא' }));
  expect(screen.getByRole('alert')).toBeVisible();

  fireEvent.click(screen.getByRole('button', { name: 'כיווץ פרטי הייבוא' }));
  expect(screen.queryByRole('alert')).toBeNull();
});

it('keeps a terminal error collapsed as well', () => {
  state.job.error = 'import failed';
  render(<BrokerBatchImportCard />);
  expect(screen.queryByRole('alert')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'הרחבת פרטי הייבוא' }));
  expect(screen.getAllByRole('alert')).toHaveLength(1);
});

it('starts collapsed even when a previous session expanded the same job', () => {
  saveSuperAdminViewState({ importStatus: { jobId: 'job-1', expanded: true } });
  const view = render(<BrokerBatchImportCard />);
  expect(screen.queryByRole('alert')).toBeNull();
  view.unmount();
  saveSuperAdminViewState({ importStatus: { jobId: 'another-job', expanded: true } });
  render(<BrokerBatchImportCard />);
  expect(screen.queryByRole('alert')).toBeNull();
});

it('toggles repeat on and off for the same active job without altering saved counts', async () => {
  state.rpc.mockImplementation(async (_name: string, args: {_enabled: boolean}) => { state.job.repeat_enabled = args._enabled; return {error:null}; });
  render(<BrokerBatchImportCard />);
  // The icon always asks for confirmation before changing repeat mode.
  fireEvent.click(screen.getByRole('button', {name:'חזרתיות כבויה'}));
  fireEvent.click(await screen.findByRole('button', {name:'הפעלת חזרתיות'}));
  await waitFor(()=>expect(screen.getByRole('button', {name:'חזרתיות פעילה'})).toBeEnabled());
  fireEvent.click(screen.getByRole('button', {name:'חזרתיות פעילה'}));
  fireEvent.click(await screen.findByRole('button', {name:'כיבוי חזרתיות'}));
  await waitFor(()=>expect(state.rpc).toHaveBeenCalledTimes(2));
  expect(state.rpc.mock.calls).toEqual([['set_import_repeat',{_id:'job-1',_enabled:true}],['set_import_repeat',{_id:'job-1',_enabled:false}]]);
  expect(state.job).toMatchObject({id:'job-1',brokers_done:2,listings_done:8,stage:'importing'});
});