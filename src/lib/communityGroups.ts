export type CommunityGroup = {
  id: string;
  name: string;
  description: string;
  kind: string;
  owner_id: string;
  unread_count: number;
};

export function canPostToGroup(group: Pick<CommunityGroup, 'kind' | 'owner_id'>, userId: string | undefined, member: boolean, eligible: boolean) {
  return !!userId && member && eligible && (group.kind === 'discussion' || (group.kind === 'broadcast' && group.owner_id === userId));
}

export function partitionCommunityGroups(groups: CommunityGroup[], userId: string | undefined) {
  return { managed: groups.filter(group => group.owner_id === userId), joined: groups.filter(group => group.owner_id !== userId) };
}