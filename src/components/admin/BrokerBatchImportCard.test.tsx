import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readSuperAdminViewState, saveSuperAdminViewState } from '@/lib/superAdminViewState';
import { BrokerBatchImportCard } from './BrokerBatchImportCard';

const state = vi.hoisted(() => ({ job: { id: 'job-1', status: 'paused', stage: 'importing', target_brokers: 10, brokers_done: 2, listings_done: 8, skipped: 0, updated_at: '2026-11-22T01:35:00Z', error: null as string | null, checkpoint: { lastError: { message: 'provider timeout', status: 504 } } } }));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: [state.job] }), useQueryClient: () => ({ invalidateQueries: vi.fn().mockResolvedValue(null) }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn() } } }));
vi.mock('@/lib/refreshImportedInventory', () => ({ refreshImportedInventory: vi.fn() }));
beforeEach(() => { sessionStorage.clear(); state.job.error = null; });
afterEach(cleanup);

it('shows the saved red error only during explicit expansion and hides it after collapse', () => {
  render(<BrokerBatchImportCard />);
  expect(screen.queryByRole('alert')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'הרחבת פרטי הייבוא' }));
  expect(screen.getByRole('alert')).toBeVisible();
  expect(readSuperAdminViewState().importStatus).toEqual({ jobId: 'job-1', expanded: true });
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

it('restores expansion only for the same import job', () => {
  saveSuperAdminViewState({ importStatus: { jobId: 'job-1', expanded: true } });
  const view = render(<BrokerBatchImportCard />);
  expect(screen.getByRole('button', { name: 'כיווץ פרטי הייבוא' })).toHaveAttribute('aria-expanded', 'true');
  view.unmount();
  saveSuperAdminViewState({ importStatus: { jobId: 'another-job', expanded: true } });
  render(<BrokerBatchImportCard />);
  expect(screen.queryByRole('alert')).toBeNull();
});