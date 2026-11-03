import { supabase } from '@/integrations/supabase/client';

/** Fire-and-forget: sends the official WhatsApp license-status message once its Meta template is approved. */
export function notifyLicenseStatus(userId: string | null | undefined) {
  if (!userId) return;
  void supabase.functions.invoke('license-status-notify', { body: { action: 'notify', user_id: userId } }).catch(() => undefined);
}
