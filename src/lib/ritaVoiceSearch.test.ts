import { describe, expect, it } from 'vitest';
import { searchRitaProperties } from './ritaVoiceSearch.server';

const BROKER_A = '00000000-0000-0000-0000-00000000000a';
const BROKER_B = '00000000-0000-0000-0000-00000000000b';

function adminWith(rows: Array<Record<string, unknown>>) {
  const workspaceQueries: Array<string | null> = [];
  const admin = { from: () => {
    let workspace: string | null = null;
    const query: Record<string, unknown> = {};
    const chain = () => query;
    for (const method of ['select', 'is', 'or', 'order', 'limit', 'gte', 'lte', 'ilike']) query[method] = chain;
    query['eq'] = (column: string, value: unknown) => {
      if (column === 'workspace_owner_id') workspace = String(value);
      return query;
    };
    query['then'] = (resolve: (value: { data: Array<Record<string, unknown>>; error: null }) => void) => {
      workspaceQueries.push(workspace);
      resolve({ data: rows.filter(row => !workspace || row['workspace_owner_id'] === workspace), error: null });
    };
    return query;
  } };
  return { admin: admin as never, workspaceQueries };
}

describe('Rita property search priority', () => {
  it('returns broker inventory first without a wider query when matches exist', async () => {
    const { admin, workspaceQueries } = adminWith([{ id: '00000000-0000-0000-0000-000000000001', workspace_owner_id: BROKER_A, property_title: 'דירה', city: 'הרצליה' }]);
    const result = await searchRitaProperties(admin, { broker_id: BROKER_A, city_or_area: 'הרצליה' });
    expect(result.search_scope).toBe('broker');
    expect(result.property_ids).toEqual(['00000000-0000-0000-0000-000000000001']);
    expect(workspaceQueries).toEqual([BROKER_A]);
  });
  it('expands to public TORAFF inventory only when the broker has no match', async () => {
    const { admin, workspaceQueries } = adminWith([{ id: '00000000-0000-0000-0000-000000000002', workspace_owner_id: BROKER_B, property_title: 'פנטהאוז', city: 'תל אביב' }]);
    const result = await searchRitaProperties(admin, { broker_id: BROKER_A, city_or_area: 'תל אביב' });
    expect(result.search_scope).toBe('cross_broker');
    expect(result.matches[0]?.broker_id).toBe(BROKER_B);
    expect(workspaceQueries).toEqual([BROKER_A, null]);
  });
  it('returns no matches without inventing properties', async () => {
    const { admin } = adminWith([]);
    const result = await searchRitaProperties(admin, { broker_id: BROKER_A, max_price: 1000000 });
    expect(result.matches).toEqual([]);
    expect(result.count).toBe(0);
  });
});
