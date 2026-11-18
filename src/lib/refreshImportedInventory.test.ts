import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { refreshImportedInventory } from './refreshImportedInventory';

describe('saved import inventory refresh', () => {
  it('reads back new persisted counts immediately for active invitation cards', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let saved = { shviro: 0, azorim: 0 };
    const queryFn = vi.fn(async () => ({ ...saved }));
    await client.fetchQuery({ queryKey: ['broker-contact-queue'], queryFn });
    const { QueryObserver } = await import('@tanstack/react-query');
    const observer = new QueryObserver(client, { queryKey: ['broker-contact-queue'], queryFn, staleTime: Infinity });
    const unsubscribe = observer.subscribe(() => {});
    saved = { shviro: 26, azorim: 3 };
    await refreshImportedInventory(client);
    expect(client.getQueryData(['broker-contact-queue'])).toEqual({ shviro: 26, azorim: 3 });
    expect(queryFn).toHaveBeenCalledTimes(2);
    unsubscribe(); client.clear();
  });

  it('invalidates developer card queries for every workspace after a saved import', async () => {
    const client = new QueryClient();
    client.setQueryData(['developer-projects', 'owner-a'], []);
    client.setQueryData(['developer-projects', 'owner-b'], []);
    client.setQueryData(['broker-import-history'], []);
    await refreshImportedInventory(client);
    expect(client.getQueryState(['developer-projects', 'owner-a'])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['developer-projects', 'owner-b'])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['broker-import-history'])?.isInvalidated).toBe(true);
    client.clear();
  });
});