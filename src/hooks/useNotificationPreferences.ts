import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { Json } from '@/integrations/supabase/types';
export const panelCategories = ['new_lead', 'inbound', 'rita_sms_reply', 'tour', 'critical', 'budget'] as const;
export type PanelCategory = typeof panelCategories[number];
export type NotificationPreferences = {
  notify_new_high_priority: boolean; notify_meeting_booked: boolean; notify_critical_question: boolean;
  delivery_channel: string; quiet_hours_start: string | null; quiet_hours_end: string | null;
  event_channels: Json; panel_preferences: Json; quiet_hours_weekly: Json;
};
export const defaultNotificationPreferences: NotificationPreferences = {
  notify_new_high_priority: true, notify_meeting_booked: true, notify_critical_question: true,
  delivery_channel: 'whatsapp', quiet_hours_start: null, quiet_hours_end: null,
  event_channels: {}, panel_preferences: {}, quiet_hours_weekly: null,
};
export function panelCategoryEnabled(preferences: NotificationPreferences | undefined, category: PanelCategory) {
  const map = preferences?.panel_preferences;
  return !map || typeof map !== 'object' || Array.isArray(map) || map[category] !== false;
}
export function useNotificationPreferences(enabled = true) {
  const { user } = useAuth();
  const client = useQueryClient();
  const key = ['notification-preferences', user?.id];
  const query = useQuery({ queryKey: key, enabled: enabled && !!user, queryFn: async () => {
    if (!user) throw new Error('נדרשת התחברות');
    const { data, error } = await supabase.from('notification_preferences').select('*').eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    return data ?? defaultNotificationPreferences;
  } });
  const save = useMutation({ mutationFn: async (preferences: NotificationPreferences) => {
    if (!user) throw new Error('נדרשת התחברות');
    const { data, error } = await supabase.from('notification_preferences').upsert({
      user_id: user.id,
      notify_new_high_priority: preferences.notify_new_high_priority,
      notify_meeting_booked: preferences.notify_meeting_booked,
      notify_critical_question: preferences.notify_critical_question,
      delivery_channel: preferences.delivery_channel,
      quiet_hours_start: preferences.quiet_hours_start || null, quiet_hours_end: preferences.quiet_hours_end || null,
      event_channels: preferences.event_channels, panel_preferences: preferences.panel_preferences,
      quiet_hours_weekly: preferences.quiet_hours_weekly,
    }, { onConflict: 'user_id' }).select().single();
    if (error) throw error;
    return data;
  }, onSuccess: data => { client.setQueryData(key, data); } });
  return { ...query, save };
}