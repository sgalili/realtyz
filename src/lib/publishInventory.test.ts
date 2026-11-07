import { describe, expect, it, vi } from 'vitest';
import { publishInventory } from './publishInventory';

function clientWith(data: unknown[], error: unknown = null) {
  const query = { update: vi.fn(), eq: vi.fn(), in: vi.fn(), neq: vi.fn(), select: vi.fn().mockResolvedValue({ data, error }) };
  for (const method of ['update', 'eq', 'in', 'neq'] as const) query[method].mockReturnValue(query);
  return { client: { from: vi.fn().mockReturnValue(query) }, query };
}
const row = { id: 'property-1', workspace_owner_id: 'workspace-1', is_published: true, status: 'live', affiliate_enabled: true };
describe('direct workspace inventory publication', () => {
  it('publishes the exact IDs and workspace with public flags, without any social or wallet dependency', async () => {
    const { client, query } = clientWith([row]);
    expect(await publishInventory(client, 'workspace-1', ['property-1', 'property-1'])).toEqual(['property-1']);
    expect(client.from).toHaveBeenCalledExactlyOnceWith('listings');
    expect(query.update).toHaveBeenCalledWith({ is_published: true, status: 'live', affiliate_enabled: true });
    expect(query.eq).toHaveBeenCalledWith('workspace_owner_id', 'workspace-1');
    expect(query.in).toHaveBeenCalledWith('id', ['property-1']);
    expect(query.neq).toHaveBeenCalledWith('status', 'discarded');
  });
  it('does not report foreign-workspace rows as saved', async () => {
    const { client } = clientWith([{ ...row, workspace_owner_id: 'other-workspace' }]);
    await expect(publishInventory(client, 'workspace-1', ['property-1'])).rejects.toThrow();
  });
  it('does not report unchanged public status as success', async () => {
    const { client } = clientWith([{ ...row, is_published: false }]);
    await expect(publishInventory(client, 'workspace-1', ['property-1'])).rejects.toThrow();
  });
  it('propagates database failures instead of reporting success', async () => {
    const error = { code: '42501', message: 'permission denied' };
    const { client } = clientWith([], error);
    await expect(publishInventory(client, 'workspace-1', ['property-1'])).rejects.toEqual(error);
  });
  it('only reports rows actually saved in a partial update', async () => {
    const { client } = clientWith([row]);
    expect(await publishInventory(client, 'workspace-1', ['property-1', 'property-2'])).toEqual(['property-1']);
  });
  it('does not write without an active workspace', async () => {
    const { client } = clientWith([row]);
    await expect(publishInventory(client, '', ['property-1'])).rejects.toThrow();
    expect(client.from).not.toHaveBeenCalled();
  });
});