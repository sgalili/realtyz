import { supabase } from '@/integrations/supabase/client';

export const SOCIAL_DRAFT_CONFIRM_EVENT = 'toraff:social-draft-confirm';
export type DraftConfirmation = { resolve: (approved: boolean) => void };
export const SOCIAL_DRAFT_CREDITS = 2;
export const SOCIAL_DRAFT_BATCH_SIZE = 3;
export const needsDraftRenewal = (used: number) => used > 0 && used % SOCIAL_DRAFT_BATCH_SIZE === 0;

/** All social text generators share the same server-owned billing and consent boundary. */
export async function generateSocialDraft(body: Record<string, unknown>, signal?: AbortSignal) {
  const generationRequestId = crypto.randomUUID();
  const invoke = (confirmDraftCharge: boolean) => supabase.functions.invoke('generate-content', {
    body: { ...body, generationRequestId, confirmDraftCharge }, signal,
  });
  let result = await invoke(false);
  if (result.error) {
    const context = (result.error as { context?: Response }).context;
    const details = await context?.clone().json().catch(() => null);
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
    } else if (details?.error) {
      const messages: Record<string, string> = {
        generation_in_progress: 'יצירת נוסח קודם עדיין בתהליך. נסו שוב בעוד רגע.',
        insufficient_credits: 'אין מספיק קרדיטים ליצירת הפוסט.',
        failed_request: 'היצירה הקודמת לא הושלמה. נסו שוב.',
      };
      throw new Error(messages[details.error] ?? details.error);
    }
  }
  return result;
}