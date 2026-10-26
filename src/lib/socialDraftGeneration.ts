import { supabase } from '@/integrations/supabase/client';

export const SOCIAL_DRAFT_CONFIRM_EVENT = 'toraff:social-draft-confirm';
export type DraftConfirmation = { resolve: (approved: boolean) => void };
export const SOCIAL_DRAFT_CREDITS = 2;
export const SOCIAL_DRAFT_BATCH_SIZE = 3;
export const needsDraftRenewal = (used: number) => used > 0 && used % SOCIAL_DRAFT_BATCH_SIZE === 0;

async function responseDetails(result: { data: any; error: any }) {
  if (result.data?.error || result.data?.confirmation_required) return result.data;
  const context = result.error?.context;
  if (context && typeof context.clone === 'function') return context.clone().json().catch(() => null);
  return context && typeof context === 'object' ? context : null;
}
function draftError(details: any) {
  const messages: Record<string, string> = {
    generation_in_progress: 'יצירת נוסח קודם עדיין בתהליך. נסו שוב בעוד רגע.',
    insufficient_credits: 'אין מספיק קרדיטים ליצירת הקמפיין.',
    failed_request: 'היצירה הקודמת לא הושלמה. נסו שוב.',
  };
  return new Error(messages[details?.error] ?? details?.message ?? details?.error ?? 'לא ניתן ליצור את הנוסח כרגע. נסו שוב מאוחר יותר.');
}

/** All social text generators share the same server-owned billing and consent boundary. */
export async function generateSocialDraft(body: Record<string, unknown>, signal?: AbortSignal) {
  const generationRequestId = crypto.randomUUID();
  const invoke = (confirmDraftCharge: boolean) => supabase.functions.invoke('generate-content', {
    body: { ...body, generationRequestId, confirmDraftCharge }, signal,
  });
  let result = await invoke(false);
  if (result.error || result.data?.confirmation_required || result.data?.error) {
    const details = await responseDetails(result);
    if (details?.confirmation_required) {
      const approved = await new Promise<boolean>((resolve) => {
        if (signal?.aborted) { resolve(false); return; }
        const cancel = () => resolve(false);
        signal?.addEventListener('abort', cancel, { once: true });
        window.dispatchEvent(new CustomEvent<DraftConfirmation>(SOCIAL_DRAFT_CONFIRM_EVENT, {
          detail: { resolve: (value) => { signal?.removeEventListener('abort', cancel); resolve(value); } },
        }));
      });
      if (!approved) throw new DOMException('Generation cancelled', 'AbortError');
      result = await invoke(true);
      if (result.error || result.data?.error) throw draftError(await responseDetails(result));
    } else if (details?.error) {
      throw draftError(details);
    }
  }
  return result;
}