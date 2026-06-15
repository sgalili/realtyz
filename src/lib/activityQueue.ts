// Client helper for the campaign_activity_queue Time Bank.
//
// Stages outbound activities (FB group posts, manual shares, messenger, etc.)
// with a randomized 1-7 minute jitter so cron-driven drips look organic and
// stay clear of Meta's burst-detection heuristics.

import { supabase } from "@/integrations/supabase/client";

export type ActivityType =
  | "fb_group_post"
  | "fb_comment"
  | "messenger"
  | "manual_share"
  | "ayrshare_post"
  | "outreach";

export type Variation = { title: string; body: string };

export type StageInput = {
  workspaceOwnerId: string;
  createdBy: string;
  activityType: ActivityType;
  targetRef?: string | null;
  targetLabel?: string | null;
  payload?: Record<string, unknown>;
  variations?: Variation[];
  // Sequence index in a batch (0..N-1). Cooldown stacks 15-30min per slot
  // BEFORE adding the 1-7min jitter.
  slotIndex?: number;
  baseSpacingMin?: number; // default 18
};

function jitterMs(): number {
  // 1..7 minutes
  const minutes = 1 + Math.floor(Math.random() * 7);
  const sec = Math.floor(Math.random() * 60);
  return (minutes * 60 + sec) * 1000;
}

export async function stageActivity(input: StageInput): Promise<{ id: string; scheduled_for: string }> {
  const base = input.baseSpacingMin ?? 18;
  const slot = Math.max(0, input.slotIndex ?? 0);
  const scheduledMs = Date.now() + slot * base * 60_000 + jitterMs();
  const scheduled_for = new Date(scheduledMs).toISOString();

  const row = {
    workspace_owner_id: input.workspaceOwnerId,
    created_by: input.createdBy,
    activity_type: input.activityType,
    target_ref: input.targetRef ?? null,
    target_label: input.targetLabel ?? null,
    payload: input.payload ?? {},
    variations: input.variations ?? [],
    scheduled_for,
    status: "pending" as const,
  };

  const { data, error } = await (supabase as any)
    .from("campaign_activity_queue")
    .insert(row)
    .select("id, scheduled_for")
    .single();

  if (error) throw error;
  return data as { id: string; scheduled_for: string };
}

export async function stageBatch(
  items: Omit<StageInput, "slotIndex">[],
): Promise<{ id: string; scheduled_for: string }[]> {
  const out: { id: string; scheduled_for: string }[] = [];
  for (let i = 0; i < items.length; i++) {
    out.push(await stageActivity({ ...items[i], slotIndex: i }));
  }
  return out;
}
