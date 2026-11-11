import { describe, expect, it } from 'vitest';
import { canPostToGroup, partitionCommunityGroups } from './communityGroups';

describe('community group access', () => {
  it('allows eligible discussion members to post', () => {
    expect(canPostToGroup({ kind: 'discussion', owner_id: 'owner' }, 'member', true, true)).toBe(true);
    expect(canPostToGroup({ kind: 'discussion', owner_id: 'owner' }, 'member', false, true)).toBe(false);
  });
  it('restricts broadcast posting to the owner', () => {
    const group = { kind: 'broadcast', owner_id: 'owner' };
    expect(canPostToGroup(group, 'member', true, true)).toBe(false);
    expect(canPostToGroup(group, 'owner', true, true)).toBe(true);
    expect(canPostToGroup(group, 'owner', true, false)).toBe(false);
  });
  it('separates managed and joined groups without dropping unread counts', () => {
    const groups = [{ id: 'a', owner_id: 'owner', name: 'A', description: '', kind: 'discussion', unread_count: 3 }, { id: 'b', owner_id: 'other', name: 'B', description: '', kind: 'broadcast', unread_count: 7 }];
    const result = partitionCommunityGroups(groups, 'owner');
    expect(result.managed.map(group => [group.id, group.unread_count])).toEqual([['a', 3]]);
    expect(result.joined.map(group => [group.id, group.unread_count])).toEqual([['b', 7]]);
  });
});