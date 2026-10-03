import { fbGroupId } from '@/lib/fbGroupUrl';
import { resolveMediaUrls } from '@/lib/postMediaUrl';
import { safeUtf8 } from '@/lib/utf8Text';

export const REPOST_EDITOR_EVENT = 'realtyz:open-repost-editor';
export type RepostPost = {
  id: string; campaign_name?: string; message_body?: string | null;
  media_urls?: string[]; first_comment?: string | null; listing_id?: string | null;
  provider_response?: unknown;
  group_ids?: string[]; sent_at?: string | null; _seriesSlots?: RepostPost[];
};
export type RepostJob = { id: string; status: string; payload: any; target_ref?: string | null; scheduled_for: string };
export type RepostEditorRequest = { owner: string; post: RepostPost; jobs: RepostJob[] };

export function matchesRepostJob(job: RepostJob, post: RepostPost): boolean {
  if (job.payload?.campaign_log_id === post.id) return true;
  const local = job.payload?.job;
  if (post.id === job.id || post.id === local?.id || post.id === `ext-queue-${job.id}`) return true;
  const body = local?.sourceText || local?.text || job.payload?.body || job.payload?.text;
  const group = fbGroupId(local?.groupUrl || job.payload?.group_url || job.target_ref);
  return !!body && body === post.message_body && !!group
    && (post.group_ids ?? []).some((g) => fbGroupId(g) === group)
    && (!post.id.startsWith('ext-queue-') || post.id === `ext-queue-${String(body).replace(/\s+/g, ' ').trim().slice(0, 80)}|${Math.floor(new Date(job.scheduled_for).getTime() / 60000)}`);
}

export function repostEditorDraft({ post, jobs }: RepostEditorRequest) {
  const job = jobs[0]?.payload?.job ?? {};
  const response = post.provider_response && typeof post.provider_response === 'object' ? post.provider_response as Record<string, any> : {};
  const settings = response.repost_settings ?? {};
  const firstComment = safeUtf8(post.first_comment ?? job.firstComment ?? '');
  const groups = [...new Set([...jobs.map((j) => fbGroupId(j.payload?.job?.groupUrl || j.target_ref)), ...(post.group_ids ?? []).map(fbGroupId)].filter((id): id is string => !!id))];
  const schedule = jobs[0]?.scheduled_for || post.sent_at;
  const date = schedule ? new Date(schedule) : null;
  const scheduled = !!date && date.getTime() > Date.now();
  const pad = (n: number) => String(n).padStart(2, '0');
  const scheduledLocal = scheduled && date ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}` : '';
  return {
    body: safeUtf8(post.message_body ?? job.sourceText ?? job.text ?? ''),
    firstComment,
    firstCommentEnabled: settings.first_comment_enabled ?? !!(post.first_comment ?? job.firstComment),
    attachWaLink: settings.attach_wa_link ?? /wa\.me\/|api\.whatsapp\.com\/|realtyz\.co\.il\/r\//i.test(firstComment),
    attachMsngrLink: settings.attach_msngr_link ?? /m\.me\//i.test(firstComment),
    publishToPage: settings.publish_to_page ?? false,
    groupTextVariation: settings.group_text_variation ?? false,
    selectedListingId: post.listing_id ?? job.listing?.id ?? null,
    attachments: resolveMediaUrls(post.media_urls?.length ? post.media_urls : job.images ?? []).map((url, i) => ({ name: `תמונה ${i + 1}`, kind: 'image' as const, url })),
    groupIds: groups, mode: scheduled ? 'scheduled' as const : 'now' as const, scheduledLocal,
  };
}