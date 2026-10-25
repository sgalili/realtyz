// Favorites are one cached, user-scoped list: the board hearts, the property page
// heart and the "ניהול המודעה שלי" menu all read and write it, so a toggle must
// apply at once and must never leave a half-saved row behind.
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { useListingFavorites } from './useListingFavorites';

const db = vi.hoisted(() => ({
  rows: ['listing-1'] as string[],
  fail: false,
  selectFilters: [] as Array<[string, string]>,
  deleteFilters: [] as Array<[string, string]>,
  inserted: [] as Array<{ user_id: string; listing_id: string }>,
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'fav-user' } }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => {
      const state = { op: 'select', row: null as { user_id: string; listing_id: string } | null, filters: [] as Array<[string, string]> };
      const api: Record<string, unknown> = {
        select: () => api,
        eq: (key: string, value: string) => { state.filters.push([key, value]); return api; },
        delete: () => { state.op = 'delete'; return api; },
        insert: (row: { user_id: string; listing_id: string }) => { state.op = 'insert'; state.row = row; return api; },
        then: (resolve: (value: unknown) => void) => {
          if (state.op === 'select') {
            db.selectFilters = state.filters;
            resolve({ data: db.rows.map((listing_id) => ({ listing_id })), error: null });
            return;
          }
          if (db.fail) { resolve({ error: { message: 'denied' } }); return; }
          if (state.op === 'insert' && state.row) {
            db.inserted.push(state.row);
            db.rows = [...db.rows, state.row.listing_id];
          } else if (state.op === 'delete') {
            db.deleteFilters = state.filters;
            const id = state.filters.find(([key]) => key === 'listing_id')?.[1];
            db.rows = db.rows.filter((row) => row !== id);
          }
          resolve({ error: null });
        },
      };
      return api;
    },
  },
}));

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

afterEach(() => {
  client.clear();
  db.rows = ['listing-1'];
  db.fail = false;
  db.selectFilters = [];
  db.deleteFilters = [];
  db.inserted = [];
  vi.clearAllMocks();
});

it('loads only the signed-in user\'s saved favorites', async () => {
  const { result } = renderHook(() => useListingFavorites(), { wrapper });
  await waitFor(() => expect(result.current.isFavorite('listing-1')).toBe(true));
  expect(db.selectFilters).toContainEqual(['user_id', 'fav-user']);
});

it('marks a new favorite at once and stores exactly one row', async () => {
  const { result } = renderHook(() => useListingFavorites(), { wrapper });
  await waitFor(() => expect(result.current.isFavorite('listing-1')).toBe(true));
  await act(async () => { await result.current.toggleFavorite('listing-9'); });
  expect(result.current.isFavorite('listing-9')).toBe(true);
  expect(db.rows).toContain('listing-9');
  expect(db.inserted[db.inserted.length - 1]).toEqual({ user_id: 'fav-user', listing_id: 'listing-9' });
});

it('removes a saved favorite and deletes only that row', async () => {
  const { result } = renderHook(() => useListingFavorites(), { wrapper });
  await waitFor(() => expect(result.current.isFavorite('listing-1')).toBe(true));
  await act(async () => { await result.current.toggleFavorite('listing-1'); });
  expect(result.current.isFavorite('listing-1')).toBe(false);
  expect(db.rows).not.toContain('listing-1');
  expect(db.deleteFilters).toContainEqual(['listing_id', 'listing-1']);
});

it('puts the saved list back when the write fails', async () => {
  db.fail = true;
  const { result } = renderHook(() => useListingFavorites(), { wrapper });
  await waitFor(() => expect(result.current.isFavorite('listing-1')).toBe(true));
  await act(async () => { await result.current.toggleFavorite('listing-9'); });
  expect(result.current.isFavorite('listing-9')).toBe(false);
  expect(db.rows).not.toContain('listing-9');
  expect(vi.mocked(toast).error).toHaveBeenCalled();
});
