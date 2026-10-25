import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendWhatsApp } from './engagementJobs.ts';

/** Reuses the tour reminder tick; no additional recurring provider checks. */
export async function dispatchCallReminders(admin: SupabaseClient) {
  const now = new Date();
  const { data: calls, error } = await admin.from('meetings').select('id,user_id,workspace_owner_id,lead_id,title,starts_at,created_at')
    .eq('status', 'scheduled').contains('metadata', { action_type: 'call' })
    .in('call_reminder_status', ['pending', 'needs_template'])
    .gt('starts_at', now.toISOString()).lte('starts_at', new Date(now.getTime() + 60 * 60_000).toISOString()).limit(25);
  if (error) throw error;
  for (const call of calls ?? []) {
    const { data: profile } = await admin.from('profiles').select('phone,full_name').eq('id', call.user_id).maybeSingle();
    if (!profile?.phone) {
      await admin.from('meetings').update({ call_reminder_status: 'missing_phone', call_reminder_error: 'חסר מספר טלפון בפרופיל מתזמן השיחה' }).eq('id', call.id);
      continue;
    }
    // Only this purpose-specific approved template may be used, never an unrelated marketing template.
    const { data: template } = await admin.from('wa_message_templates').select('name,language,variable_count,has_header_variable')
      .eq('owner_user_id', call.workspace_owner_id).eq('name', 'call_reminder').eq('status', 'APPROVED').maybeSingle();
    if (!template || template.has_header_variable || template.variable_count !== 3) {
      await admin.from('meetings').update({ call_reminder_status: 'needs_template', call_reminder_error: 'נדרשת תבנית WhatsApp מאושרת call_reminder עם שם, תאריך ושעה' }).eq('id', call.id);
      continue;
    }
    // Atomic compare-and-set claims prevent parallel ticks from dispatching twice.
    const { data: claimed } = await admin.from('meetings')
      .update({ call_reminder_status: 'sending', call_reminder_claimed_at: now.toISOString() })
      .eq('id', call.id).eq('starts_at', call.starts_at).eq('status', 'scheduled')
      .in('call_reminder_status', ['pending', 'needs_template']).select('id').maybeSingle();
    if (!claimed) continue;
    const starts = new Date(call.starts_at);
    const result = await sendWhatsApp({
      phone_number: profile.phone, tenant_id: call.workspace_owner_id, force_official: true,
      template_id: template.name, template_language: template.language,
      template_components: [{ type: 'body', parameters: [
        { type: 'text', text: profile.full_name || 'שלום' },
        { type: 'text', text: starts.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' }) },
        { type: 'text', text: starts.toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' }) },
      ] }],
    });
    let accepted = false;
    try { accepted = result.ok && JSON.parse(result.body).success === true; } catch { accepted = false; }
    await admin.from('meetings').update({
      call_reminder_status: accepted ? 'accepted' : 'failed',
      reminder_1h_sent_at: accepted ? new Date().toISOString() : null,
      call_reminder_error: accepted ? null : `WhatsApp rejected reminder (${result.status})`,
    }).eq('id', call.id).eq('starts_at', call.starts_at).eq('call_reminder_status', 'sending');
  }
  return { checked: calls?.length ?? 0 };
}