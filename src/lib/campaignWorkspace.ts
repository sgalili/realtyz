import { supabase } from '@/integrations/supabase/client';

export async function getCampaignWorkspaceUserIds(
  workspaceOwnerId: string | null | undefined,
  fallbackUserId: string | null | undefined,
): Promise<string[]> {
  const ownerId = workspaceOwnerId ?? fallbackUserId ?? null;
  if (!ownerId) return [];

  const ids = new Set<string>([ownerId]);
  if (fallbackUserId) ids.add(fallbackUserId);

  try {
    const { data, error } = await (supabase as any).rpc('get_workspace_member_ids', { _owner: ownerId });
    if (!error && Array.isArray(data)) {
      data.forEach((row: any) => {
        const id = typeof row === 'string' ? row : row?.user_id;
        if (typeof id === 'string' && id) ids.add(id);
      });
    }
  } catch {
    // Keep the explicit owner + current user fallback if the RPC is temporarily unavailable.
  }

  return Array.from(ids);
}