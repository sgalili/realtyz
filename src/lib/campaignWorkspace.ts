/**
 * Campaign scoping is STRICTLY per workspace owner.
 *
 * Never expand this to workspace member user ids: a broker who is also a member
 * of another workspace (super-admin, managing broker) would otherwise see their
 * own posts inside that workspace's feed. Every campaign row carries
 * `workspace_owner_id`, so the owner id alone is the correct and only scope.
 */
export async function getCampaignWorkspaceUserIds(
  workspaceOwnerId: string | null | undefined,
  fallbackUserId: string | null | undefined,
): Promise<string[]> {
  const ownerId = workspaceOwnerId ?? fallbackUserId ?? null;
  return ownerId ? [ownerId] : [];
}
