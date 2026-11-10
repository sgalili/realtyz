import { describe, expect, it, vi } from 'vitest';
import { checkYad2BeforeImport, createInactiveYad2Draft, subscribeInactiveImports } from './yad2Preflight';
const invoke = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke }, from, auth: { getUser: async () => ({ data: { user: { id: 'account-1' } } }) } } }));
describe('inactive import preflight', () => {
  it('offers an internal draft for a confirmed removed ad', async () => {
    const url = 'https://www.yad2.co.il/realestate/item/abc123';
    invoke.mockResolvedValue({ data: { statuses: { [url]: 'gone' } }, error: null });
    const unsubscribe = subscribeInactiveImports(request => request.resolve('draft'));
    expect(await checkYad2BeforeImport(url)).toBe('draft');
    unsubscribe();
  });
  it('lets the user skip a removed ad', async () => {
    const url = 'https://www.yad2.co.il/realestate/item/abc123';
    invoke.mockResolvedValue({ data: { statuses: { [url]: 'gone' } }, error: null });
    const unsubscribe = subscribeInactiveImports(request => request.resolve('skip'));
    expect(await checkYad2BeforeImport(url)).toBe('skip');
    unsubscribe();
  });
  it('does not claim an unavailable check proves an ad was removed', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('unavailable') });
    expect(await checkYad2BeforeImport('https://www.yad2.co.il/realestate/item/abc123')).toBe('continue');
  });
  it('creates only an unpublished internal draft under the selected workspace', async () => {
    const query = { select: vi.fn(), eq: vi.fn(), limit: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }), insert: vi.fn(), single: vi.fn().mockResolvedValue({ data: { id: 'draft-1' }, error: null }) };
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.limit.mockReturnValue(query); query.insert.mockReturnValue(query); from.mockReturnValue(query);
    expect(await createInactiveYad2Draft('https://www.yad2.co.il/realestate/item/abc123', 'workspace-1')).toBe('draft-1');
    expect(query.insert).toHaveBeenCalledWith(expect.objectContaining({ workspace_owner_id: 'workspace-1', user_id: 'account-1', external_id: 'abc123', status: 'pending', is_published: false, affiliate_enabled: false }));
  });
});